import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import fs from "fs/promises";
import os from "os";
import path from "path";
import {
  readBridgeConfig,
  writeBridgeConfig,
  buildHandoffSystem,
  buildHandoffUser,
  callAgentApi,
  testBridge,
  snapshotProject,
  diffSnapshots,
} from "../bridge.js";

const realFetch = globalThis.fetch;

beforeEach(() => {
  globalThis.fetch = realFetch;
});

const okJson = (body) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
const errText = (status, text) => new Response(text, { status });

const tmpFiles = [];
async function tmpFile(content = "") {
  const p = path.join(os.tmpdir(), `bridge-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  if (content) await fs.writeFile(p, content, "utf-8");
  tmpFiles.push(p);
  return p;
}

after(async () => {
  for (const p of tmpFiles) await fs.rm(p, { force: true });
});

test("readBridgeConfig: defaults when no file exists", async () => {
  const cfg = await readBridgeConfig(path.join(os.tmpdir(), "does-not-exist-bridge.json"));
  assert.equal(cfg.enabled, false);
  assert.equal(cfg.baseUrl, "http://127.0.0.1:8642/v1");
  assert.equal(cfg.apiKey, "");
  assert.equal(cfg.verifyCommand, "");
  assert.equal(cfg.timeoutMs, 300000);
});

test("readBridgeConfig: reads file and clamps values", async () => {
  const p = await tmpFile(JSON.stringify({ enabled: true, baseUrl: "http://x.test/v1/", apiKey: "k", timeoutMs: 10 }));
  const cfg = await readBridgeConfig(p);
  assert.equal(cfg.enabled, true);
  assert.equal(cfg.baseUrl, "http://x.test/v1");                           
  assert.equal(cfg.timeoutMs, 30000);              
});

test("writeBridgeConfig round-trips", async () => {
  const p = await tmpFile();
  await writeBridgeConfig({ enabled: true, baseUrl: "http://y.test", apiKey: "a", verifyCommand: "npm test", timeoutMs: 60000 }, p);
  const cfg = await readBridgeConfig(p);
  assert.equal(cfg.enabled, true);
  assert.equal(cfg.verifyCommand, "npm test");
});

test("callAgentApi: success returns final answer + timing", async () => {
  const calls = [];
  globalThis.fetch = async (url, opts) => {
    calls.push({ url, opts });
    return okJson({ model: "hermes-agent", choices: [{ message: { content: "done" } }] });
  };
  const out = await callAgentApi({
    baseUrl: "http://agent.test/v1",
    apiKey: "secret",
    messages: [{ role: "user", content: "hi" }],
    fetchImpl: globalThis.fetch,
  });
  assert.equal(out.content, "done");
  assert.equal(out.model, "hermes-agent");
  assert.ok(out.elapsedMs >= 0);
  const call = calls[0];
  assert.equal(call.url, "http://agent.test/v1/chat/completions");
  assert.equal(call.opts.headers.Authorization, "Bearer secret");
  assert.equal(JSON.parse(call.opts.body).stream, false);
});

test("callAgentApi: no Authorization header when no key", async () => {
  globalThis.fetch = async (_url, opts) => {
    assert.equal(opts.headers.Authorization, undefined);
    return okJson({ choices: [{ message: { content: "ok" } }] });
  };
  await callAgentApi({ baseUrl: "http://agent.test/v1", messages: [], fetchImpl: globalThis.fetch });
});

test("callAgentApi: unreachable agent -> helpful error", async () => {
  globalThis.fetch = async () => {
    throw new Error("ECONNREFUSED");
  };
  await assert.rejects(
    callAgentApi({ baseUrl: "http://agent.test/v1", messages: [], fetchImpl: globalThis.fetch }),
    /Cannot reach the Hermes Agent/
  );
});

test("callAgentApi: non-ok status -> status in error", async () => {
  globalThis.fetch = async () => errText(401, "no key");
  await assert.rejects(
    callAgentApi({ baseUrl: "http://agent.test/v1", messages: [], fetchImpl: globalThis.fetch }),
    /API error 401/
  );
});

test("callAgentApi: empty response -> clear error", async () => {
  globalThis.fetch = async () => okJson({ choices: [{ message: { content: "" } }] });
  await assert.rejects(
    callAgentApi({ baseUrl: "http://agent.test/v1", messages: [], fetchImpl: globalThis.fetch }),
    /empty response/
  );
});

test("testBridge: ping succeeds", async () => {
  globalThis.fetch = async () => okJson({ choices: [{ message: { content: "ok" } }] });
  const out = await testBridge({ baseUrl: "http://agent.test/v1", fetchImpl: globalThis.fetch });
  assert.equal(out.content, "ok");
  assert.match(out.message, /Connected/);
});

test("buildHandoffSystem: contains project path and trust level", () => {
  const sys = buildHandoffSystem({ name: "Lutopia", path: "C:/proj" }, "Level 2 — Auto-fix low risk");
  assert.match(sys, /Lutopia/);
  assert.match(sys, /C:\/proj/);
  assert.match(sys, /Level 2/);
  assert.match(sys, /## Summary/);
});

test("buildHandoffUser: task, context, memory and history are included", () => {
  const user = buildHandoffUser({
    task: "Fix the login",
    project: { name: "Lutopia", path: "C:/proj" },
    context: { totalFiles: 12, stats: { JavaScript: 5 }, relevantFiles: [{ path: "a.js", content: "x" }] },
    memoryText: "vanilla JS",
    history: [{ role: "user", content: "earlier msg" }],
  });
  assert.match(user, /Fix the login/);
  assert.match(user, /12 total files/);
  assert.match(user, /--- FILE: a.js ---/);
  assert.match(user, /vanilla JS/);
  assert.match(user, /earlier msg/);
});

test("snapshotProject + diffSnapshots: detects changed, added, removed", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "bridge-snap-"));
  tmpFiles.push(path.join(dir, "placeholder"));
  try {
    await fs.writeFile(path.join(dir, "a.txt"), "one", "utf-8");
    const before = await snapshotProject(dir);
    assert.equal(before.size, 1);

    await fs.writeFile(path.join(dir, "a.txt"), "two", "utf-8");
    await fs.writeFile(path.join(dir, "b.txt"), "new", "utf-8");
    await fs.mkdir(path.join(dir, "node_modules"), { recursive: true });
    await fs.writeFile(path.join(dir, "node_modules", "ignored.txt"), "should not count", "utf-8");
    const after = await snapshotProject(dir);

    const diff = diffSnapshots(before, after);
    assert.ok(diff.changed.includes("a.txt"));
    assert.ok(diff.added.includes("b.txt"));
    assert.ok(!diff.added.some((f) => f.includes("node_modules")));
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
