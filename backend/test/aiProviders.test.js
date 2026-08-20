import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createRouter, ProviderError, GeminiProvider, OpenRouterProvider, withTimeout } from "../aiProviders.js";

const realFetch = globalThis.fetch;

beforeEach(() => {
  globalThis.fetch = realFetch;
});

const okJson = (body) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
const errJson = (status, text) => new Response(text, { status });

function makeOpenAiEnv(overrides = {}) {
  return {
    AI_PROVIDER: "openai",
    OPENAI_API_KEY: "k",
    OPENAI_BASE_URL: "https://fake.test/v1",
    OPENAI_MODEL: "m1",
    OPENAI_FALLBACK_MODELS: "m2",
    ...overrides,
  };
}

test("Test 5: missing Gemini key -> clear error, no crash", async () => {
  const router = createRouter({ AI_PROVIDER: "gemini", AI_FALLBACK_PROVIDER: "openai" }, { providers: {} });
  const err = await router.generate([{ role: "user", content: "hi" }]).catch((e) => e);
  assert.ok(err instanceof ProviderError);
  assert.match(err.message, /All AI providers failed/);
  assert.match(err.message, /Gemini: GEMINI_API_KEY is not set/);
});

test("Test 6: missing OpenRouter key -> clear error, no crash", async () => {
  const router = createRouter({ AI_PROVIDER: "openrouter", AI_FALLBACK_PROVIDER: "openai" });
  const err = await router.generate([{ role: "user", content: "hi" }]).catch((e) => e);
  assert.ok(err instanceof ProviderError);
  assert.match(err.message, /OPENROUTER_API_KEY is not set/);
});

test("Test 7: both unavailable -> clear error listing all providers", async () => {
  const router = createRouter({ AI_PROVIDER: "gemini", AI_FALLBACK_PROVIDER: "openrouter" });
  const err = await router.generate([{ role: "user", content: "hi" }]).catch((e) => e);
  assert.ok(err instanceof ProviderError);
  assert.match(err.message, /Gemini/);
  assert.match(err.message, /OpenRouter/);
});

test("fallback: primary rate-limited -> fallback provider answers (Test 3/4)", async () => {
  const calls = [];
  const failing = {
    id: "fakeA", label: "FakeA", model: "a1", supportsVision: true,
    isAvailable: () => ({ available: true, reason: "" }),
    async generate() {
      calls.push("A");
      throw new ProviderError("rate_limit", "A is rate-limited", { retryable: true, provider: "FakeA", model: "a1" });
    },
  };
  const working = {
    id: "fakeB", label: "FakeB", model: "b1", supportsVision: true,
    isAvailable: () => ({ available: true, reason: "" }),
    async generate() {
      calls.push("B");
      return { content: "from B", toolCalls: [] };
    },
  };
  const router = createRouter({ AI_PROVIDER: "fakeA", AI_FALLBACK_PROVIDER: "fakeB" }, { providers: { fakeA: failing, fakeB: working } });
  const out = await router.generate([{ role: "user", content: "hi" }]);
  assert.deepEqual(calls, ["A", "B"]);
  assert.equal(out.content, "from B");
});

test("no fallback on auth errors (bad key is a config problem)", async () => {
  const calls = [];
  const badKey = {
    id: "fakeA", label: "FakeA", model: "a1", supportsVision: true,
    isAvailable: () => ({ available: true, reason: "" }),
    async generate() { calls.push("A"); throw new ProviderError("auth", "401 invalid api key", { provider: "FakeA" }); },
  };
  const wouldWork = {
    id: "fakeB", label: "FakeB", model: "b1", supportsVision: true,
    isAvailable: () => ({ available: true, reason: "" }),
    async generate() { calls.push("B"); return { content: "from B", toolCalls: [] }; },
  };
  const router = createRouter({ AI_PROVIDER: "fakeA", AI_FALLBACK_PROVIDER: "fakeB" }, { providers: { fakeA: badKey, fakeB: wouldWork } });
  const err = await router.generate([{ role: "user", content: "hi" }]).catch((e) => e);
  assert.deepEqual(calls, ["A"]);
  assert.match(err.message, /401/);
});

test("bounded retries: rate_limit retried once per model, then falls through", async () => {
  let n = 0;
  globalThis.fetch = async () => {
    n++;
    if (n <= 2) return errJson(429, "Rate limit exceeded");
    return okJson({ choices: [{ message: { content: "ok" } }] });
  };
  const router = createRouter(makeOpenAiEnv({ AI_PROVIDER_RETRIES: "1" }));
  const out = await router.generate([{ role: "user", content: "hi" }]);
  assert.equal(n, 3);                                        
  assert.equal(out.content, "ok");
});

test("provider selection: AI_PROVIDER=gemini builds a Gemini provider", () => {
  const router = createRouter({ AI_PROVIDER: "gemini", GEMINI_API_KEY: "k", GEMINI_MODEL: "gemini-test" });
  assert.equal(router.primary, "gemini");
  assert.equal(router.providers[0].id, "gemini");
  assert.equal(router.providers[0].model, "gemini-test");
});

test("provider selection: AI_PROVIDER=openrouter with configurable model", () => {
  const router = createRouter({ AI_PROVIDER: "openrouter", OPENROUTER_API_KEY: "k", OPENROUTER_MODEL: "my/custom:free" });
  assert.equal(router.providers[0].model, "my/custom:free");
});

test("error normalization: 401/402/429/5xx/timeout map to codes", async () => {
  const cases = [
    { status: 401, text: "invalid api key", want: "auth" },
    { status: 402, text: "Insufficient Credits", want: "quota" },
    { status: 429, text: "Rate limit exceeded", want: "rate_limit" },
    { status: 500, text: "internal error", want: "server" },
    { status: 404, text: "model not found", want: "model" },
  ];
  for (const c of cases) {
    globalThis.fetch = async () => errJson(c.status, c.text);
    const router = createRouter(makeOpenAiEnv({ AI_PROVIDER_RETRIES: "0" }));
    const err = await router.generate([{ role: "user", content: "hi" }]).catch((e) => e);
    assert.equal(err.code, c.want, `status ${c.status} should be ${c.want}, got ${err.code}`);
  }
});

test("openrouter: parses tool_calls from OpenAI-format response", async () => {
  globalThis.fetch = async () =>
    okJson({
      choices: [{ message: { content: null, tool_calls: [{ id: "c1", type: "function", function: { name: "read_file", arguments: '{"path":"a.js"}' } }] } }],
    });
  const router = createRouter({ AI_PROVIDER: "openrouter", OPENROUTER_API_KEY: "k", AI_PROVIDER_RETRIES: "0" });
  const out = await router.generate([{ role: "user", content: "hi" }], { toolCalling: true });
  assert.equal(out.toolCalls.length, 1);
  assert.equal(out.toolCalls[0].name, "read_file");
  assert.deepEqual(out.toolCalls[0].args, { path: "a.js" });
});

test("gemini: fake client returns text; conversion builds systemInstruction", async () => {
  const seen = {};
  const client = {
    models: {
      async generateContent({ model, contents, config }) {
        seen.model = model;
        seen.contents = contents;
        seen.config = config;
        return { candidates: [{ content: { parts: [{ text: "hello gemini" }] }, finishReason: "STOP" }] };
      },
    },
  };
  const g = new GeminiProvider({ GEMINI_API_KEY: "k", GEMINI_MODEL: "gemini-x" }, { client });
  const out = await g.generate([{ role: "system", content: "sys" }, { role: "user", content: "hi" }]);
  assert.equal(out.content, "hello gemini");
  assert.equal(seen.model, "gemini-x");
  assert.equal(seen.config.systemInstruction.parts[0].text, "sys");
  assert.equal(seen.contents[0].role, "user");
});

test("gemini: converts tool_calls and pairs tool results via functionResponse", async () => {
  const client = {
    models: { async generateContent({ contents }) { return { candidates: [{ content: { parts: [] }, finishReason: "STOP" }] }; } },
  };
  const g = new GeminiProvider({ GEMINI_API_KEY: "k" }, { client });
  const messages = [
    { role: "user", content: "go" },
    { role: "assistant", content: "", tool_calls: [{ id: "c1", type: "function", function: { name: "calculate", arguments: '{"expression":"1+1"}' } }] },
    { role: "tool", tool_call_id: "c1", content: '{"result":2}' },
  ];
  let captured;
  client.models.generateContent = async ({ contents }) => {
    captured = contents;
    return { candidates: [{ content: { parts: [{ text: "done" }] }, finishReason: "STOP" }] };
  };
  const out = await g.generate(messages);
  assert.equal(captured[0].role, "user");
  assert.equal(captured[1].role, "model");
  assert.equal(captured[1].parts[0].functionCall.name, "calculate");
  assert.equal(captured[2].parts[0].functionResponse.name, "calculate");
  assert.equal(captured[2].parts[0].functionResponse.response.result.result, 2);
  assert.equal(out.content, "done");
});

test("gemini: image_url parts become inlineData", async () => {
  const client = { models: { async generateContent() { return { candidates: [{ content: { parts: [{ text: "ok" }] }, finishReason: "STOP" }] }; } } };
  const g = new GeminiProvider({ GEMINI_API_KEY: "k" }, { client });
  let captured;
  client.models.generateContent = async ({ contents }) => { captured = contents; return { candidates: [{ content: { parts: [{ text: "ok" }] }, finishReason: "STOP" }] }; };
  await g.generate([{ role: "user", content: [{ type: "text", text: "look" }, { type: "image_url", image_url: { url: "data:image/png;base64,QUJD" } }] }]);
  assert.equal(captured[0].parts[1].inlineData.mimeType, "image/png");
  assert.equal(captured[0].parts[1].inlineData.data, "QUJD");
});

test("gemini: functionCall response produces toolCalls", async () => {
  const client = { models: { async generateContent() { return { candidates: [{ content: { parts: [{ functionCall: { name: "calculate", args: { expression: "2+2" } } }] }, finishReason: "STOP" }] }; } } };
  const g = new GeminiProvider({ GEMINI_API_KEY: "k" }, { client });
  const out = await g.generate([{ role: "user", content: "go" }], { toolCalling: true });
  assert.equal(out.toolCalls.length, 1);
  assert.equal(out.toolCalls[0].name, "calculate");
  assert.deepEqual(out.toolCalls[0].args, { expression: "2+2" });
});

test("vision: provider without vision support is skipped when request needs vision", async () => {
  const noVision = {
    id: "nv", label: "NoVision", model: "x", supportsVision: false,
    isAvailable: () => ({ available: true, reason: "" }),
    async generate() { throw new Error("should not be called"); },
  };
  const withVision = {
    id: "vv", label: "WithVision", model: "y", supportsVision: true,
    isAvailable: () => ({ available: true, reason: "" }),
    async generate() { return { content: "vision ok", toolCalls: [] }; },
  };
  const router = createRouter({ AI_PROVIDER: "nv", AI_FALLBACK_PROVIDER: "vv" }, { providers: { nv: noVision, vv: withVision } });
  const out = await router.generate([
    { role: "user", content: [{ type: "text", text: "see" }, { type: "image_url", image_url: { url: "data:image/png;base64,x" } }] },
  ]);
  assert.equal(out.content, "vision ok");
});

test("timeout is normalized; network failures map to network", async () => {
  await assert.rejects(withTimeout(new Promise((r) => setTimeout(r, 300)), 50), /timed out/);
  globalThis.fetch = async () => {
    throw new TypeError("fetch failed");
  };
  const router = createRouter(makeOpenAiEnv({ AI_PROVIDER_RETRIES: "0" }));
  const err = await router.generate([{ role: "user", content: "hi" }]).catch((e) => e);
  assert.equal(err.code, "network");
});

test("openai provider skippable errors fall through to the next model", async () => {
  let n = 0;
  globalThis.fetch = async () => {
    n++;
    if (n === 1) return errJson(400, "does not support image");
    return okJson({ choices: [{ message: { content: "second model worked" } }] });
  };
  const router = createRouter(makeOpenAiEnv());
  const out = await router.generate([{ role: "user", content: "hi" }]);
  assert.equal(n, 2);
  assert.equal(out.content, "second model worked");
});