                                                                                    
                                                                                    
                                                                                
  
                                                                                  
                                 

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const BRIDGE_FILE = path.join(__dirname, "data", "bridge.json");

export const DEFAULT_BASE_URL = "http://127.0.0.1:8642/v1";
export const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

const SKIP_DIRS = new Set([
  "node_modules", ".git", "dist", "build", ".next", "__pycache__",
  ".venv", "venv", ".cache", "coverage", ".vscode", ".idea",
]);

export async function readBridgeConfig(file = BRIDGE_FILE) {
  let raw = {};
  try {
    raw = JSON.parse(await fs.readFile(file, "utf-8"));
  } catch {}
  return {
    enabled: raw.enabled === true,
    baseUrl: String(raw.baseUrl || "").trim().replace(/\/+$/, "") || DEFAULT_BASE_URL,
    apiKey: String(raw.apiKey || "").trim(),
    verifyCommand: String(raw.verifyCommand || "").trim(),
    timeoutMs: Math.max(30000, Math.min(30 * 60 * 1000, Number(raw.timeoutMs) || DEFAULT_TIMEOUT_MS)),
  };
}

export async function writeBridgeConfig(cfg, file = BRIDGE_FILE) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(cfg, null, 2));
}

                                                                                    
export function buildHandoffSystem(project, trustLabel) {
  return `You are Hermes Agent, working as the execution engine for a developer-assistant frontend. The user asked for real work on a project on disk. The frontend did the analysis; your job is to DO the work — diagnose, fix, verify.

Project: ${project.name}
Project path: ${project.path}
Frontend trust level: ${trustLabel || "Level 1 — Suggest only"}

Guidelines:
- Work autonomously in the project at that path using your tools (read files, search, run commands, edit files, git).
- Before editing, verify the project state on disk — the context shown may be stale.
- Fix the issue properly, then verify with tests/builds when sensible.
- Only report changes you actually made. Never invent files, commands, or results.
- Respond in plain language. No emojis anywhere.
- End with EXACTLY this structure (it is parsed automatically):
# <short title of the task>

## Steps
- <what you did>

## Findings
- CRITICAL: <issue>   (only if something can break)
- WARNING: <issue>
- SUGGESTION: <idea>

## Summary
- Changed files: <comma-separated paths, or none>
- Verification: <tests/commands you ran and their results>
- Remaining risks: <what the user should still check>

If you could not complete the task, say so plainly in the Summary instead of pretending.`;
}

export function buildHandoffUser({ task, project, context, memoryText, history }) {
  const parts = [];
  parts.push(`TASK FROM THE USER:\n${task}`);
  parts.push(`PROJECT: ${project.name} (${project.path})`);
  if (context) {
    parts.push(`Project map — ${context.totalFiles} total files: ${JSON.stringify(context.stats)}`);
    if (context.relevantFiles?.length) {
      parts.push(
        `Relevant files the frontend selected (verify on disk before trusting):\n${context.relevantFiles
          .map((f) => `--- FILE: ${f.path} ---\n${f.content}`)
          .join("\n\n")}`
      );
    }
  }
  if (memoryText) parts.push(`Notes from past sessions (use when relevant):\n${memoryText.slice(0, 4000)}`);
  if (history?.length) {
    parts.push(
      `Previous conversation (context only — the current task is the last user message):\n${history
        .map((m) => `${m.role}: ${String(m.content).slice(0, 2000)}`)
        .join("\n")}`
    );
  }
  return parts.join("\n\n");
}

                                                                                              
export async function callAgentApi({ baseUrl, apiKey, messages, timeoutMs, fetchImpl }) {
  const doFetch = fetchImpl || fetch;
  const t = timeoutMs || DEFAULT_TIMEOUT_MS;
  const started = Date.now();
  let res;
  try {
    res = await doFetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({ model: "hermes-agent", messages, stream: false }),
      signal: AbortSignal.timeout(t),
    });
  } catch (err) {
    if (err?.name === "TimeoutError") {
      throw new Error(`Timed out after ${Math.round(t / 1000)}s waiting for the agent — it may still be working. Increase the timeout in Settings.`);
    }
    throw new Error(`Cannot reach the Hermes Agent at ${baseUrl}: ${err.message}. Start it with \`hermes gateway\` and try again.`);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Hermes Agent API error ${res.status}: ${body.slice(0, 300)}`);
  }
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("The Hermes Agent returned an empty response");
  }
  return { content: content.trim(), model: data?.model || null, elapsedMs: Date.now() - started };
}

                                                                        
export async function testBridge({ baseUrl, apiKey, timeoutMs, fetchImpl }) {
  const out = await callAgentApi({
    baseUrl,
    apiKey,
    timeoutMs: Math.min(timeoutMs || 60000, 60000),
    fetchImpl,
    messages: [
      { role: "system", content: "You are a connection test. Answer with exactly one word: ok" },
      { role: "user", content: "ping" },
    ],
  });
  return { ...out, message: `Connected in ${out.elapsedMs}ms${out.model ? ` (model: ${out.model})` : ""}` };
}

                                                                                                     
export async function snapshotProject(root) {
  const snap = new Map();
  async function walk(dir, rel) {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".") && entry.name !== ".gitignore" && entry.name !== ".env") continue;
      if (SKIP_DIRS.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      const relPath = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await walk(full, relPath);
      else if (entry.isFile()) {
        try {
          const st = await fs.stat(full);
          snap.set(relPath, { size: st.size, mtimeMs: st.mtimeMs });
        } catch {}
      }
    }
  }
  await walk(root, "");
  return snap;
}

export function diffSnapshots(before, after, limit = 50) {
  const changed = [];
  const added = [];
  const removed = [];
  for (const [p, st] of after) {
    const prev = before.get(p);
    if (!prev) added.push(p);
    else if (prev.size !== st.size || Math.abs(prev.mtimeMs - st.mtimeMs) > 1) changed.push(p);
  }
  for (const p of before.keys()) if (!after.has(p)) removed.push(p);
  const cap = (arr) => arr.slice(0, limit);
  return { changed: cap(changed), added: cap(added), removed: cap(removed) };
}
