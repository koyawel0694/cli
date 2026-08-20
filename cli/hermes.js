import { createInterface } from "node:readline/promises";
import { stdin, stdout, argv, exit } from "node:process";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { readFileSync, existsSync } from "node:fs";
import fsPromises from "node:fs/promises";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const BACKEND_DIR = path.join(PROJECT_ROOT, "backend");
const BACKEND_SERVER = path.join(BACKEND_DIR, "server.js");

const API = process.env.HERMES_API || "http://localhost:4000";
const POLL_MS = 1200;
const MAX_WAIT_MS = 15 * 60 * 1000;
const BACKEND_STARTUP_TIMEOUT_MS = 30 * 1000;

function getVersion() {
  try {
    const pkg = JSON.parse(
      readFileSync(path.join(PROJECT_ROOT, "package.json"), "utf-8"),
    );
    return pkg.version || "0.0.0";
  } catch {
    return "0.0.0";
  }
}

const C = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
};
const TTY = !!stdout.isTTY;
const c = (code, s) => (TTY ? code + String(s) + C.reset : String(s));

async function api(path, opts = {}) {
  const res = await fetch(API + path, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const timeAgo = (ts) => {
  if (!ts) return "?";
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
};
const statusColor = (s) =>
  s === "completed"
    ? C.green
    : s === "failed"
      ? C.red
      : s === "needs_approval"
        ? C.yellow
        : C.dim;

let current = null;
let currentProjectId = null;
let projects = [];
const watchCtrl = { stop: false };
let backendProcess = null;

const WS_URL = API.replace(/^http/, "ws") + "/ws";
let ws = null;
let wsConnected = false;
let wsSubscriptions = new Set();
let wsTokenBuffer = "";
let wsTokenCallback = null;

function wsConnect() {
  if (
    ws &&
    (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)
  )
    return;
  try {
    ws = new WebSocket(WS_URL);
    ws.onopen = () => {
      wsConnected = true;
      for (const id of wsSubscriptions) {
        ws.send(JSON.stringify({ action: "subscribe", experimentId: id }));
      }
    };
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(String(event.data));
        if (msg.type === "token" && wsTokenCallback) {
          wsTokenCallback(msg.token);
        }
      } catch {}
    };
    ws.onclose = () => {
      wsConnected = false;
      setTimeout(wsConnect, 3000);
    };
    ws.onerror = () => {};
  } catch {}
}

function wsSubscribe(expId) {
  wsSubscriptions.add(expId);
  if (wsConnected && ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ action: "subscribe", experimentId: expId }));
  }
}

function wsUnsubscribe(expId) {
  wsSubscriptions.delete(expId);
  if (wsConnected && ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ action: "unsubscribe", experimentId: expId }));
  }
}

const rl = createInterface({ input: stdin, output: stdout });

function formatAnswer(text) {
  if (!text) return c(C.dim, "(no answer)");
  const lines = String(text).split("\n");
  const out = [];
  let inCode = false;
  for (const line of lines) {
    const t = line.trim();
    if (t.startsWith("```")) {
      inCode = !inCode;
      out.push(c(C.dim, line));
      continue;
    }
    if (inCode) {
      out.push(c(C.dim, line));
      continue;
    }
    if (/^#{1,3}\s/.test(t)) {
      const level = t.match(/^#+/)[0].length;
      out.push(c(level === 1 ? C.cyan : C.bold, t.replace(/^#+\s*/, "")));
      continue;
    }
    out.push(line);
  }
  return out.join("\n");
}

function conversationText(exp) {
  const messages = exp?.messages?.length
    ? exp.messages
    : [
        { role: "user", content: exp?.task || "" },
        ...(exp?.answer ? [{ role: "assistant", content: exp.answer }] : []),
      ];
  const lines = [`# Hermes Conversation #${exp?.id || "unknown"}`, ""];
  for (const message of messages) {
    const role = message.role === "assistant" ? "Hermes" : "You";
    lines.push(`## ${role}`, "", String(message.content || ""), "");
  }
  return lines.join("\n").trim() + "\n";
}

async function copyToClipboard(text) {
  if (process.platform !== "win32") return false;
  return new Promise((resolve) => {
    const child = spawn(
      "powershell",
      ["-NoProfile", "-Command", "$input | Set-Clipboard"],
      {
        stdio: ["pipe", "ignore", "ignore"],
        windowsHide: true,
      },
    );
    child.on("error", () => resolve(false));
    child.on("close", (code) => resolve(code === 0));
    child.stdin.end(text);
  });
}

async function exportConversation(arg = "") {
  if (!current?.id) {
    console.log(
      c(C.dim, "No active conversation. Run a task or /open <id> first."),
    );
    return;
  }
  const exp = await api(`/api/experiments/${current.id}`);
  const text = conversationText(exp);
  const target = arg
    ? path.resolve(arg)
    : path.resolve(`hermes-conversation-${exp.id}.md`);
  await fsPromises.writeFile(target, text, "utf8");
  console.log(c(C.green, `Conversation exported to ${target}`));
}

async function copyConversation() {
  if (!current?.id) {
    console.log(
      c(C.dim, "No active conversation. Run a task or /open <id> first."),
    );
    return;
  }
  const exp = await api(`/api/experiments/${current.id}`);
  const copied = await copyToClipboard(conversationText(exp));
  if (copied)
    console.log(c(C.green, "Entire conversation copied to the clipboard."));
  else console.log(conversationText(exp));
}

function printBanner() {
  console.log(c(C.cyan, "HERMES — terminal client"));
  console.log(
    c(
      C.dim,
      "Type a task and press Enter. /help for commands. Ctrl+C to quit.",
    ),
  );
  console.log("");
}

function promptText() {
  const p = current ? `hermes#${current.id}` : "hermes";
  return c(C.cyan, p) + "> ";
}

function printHelp() {
  console.log(c(C.cyan, "Hermes — AI Experiment & Developer Assistant"));
  console.log("");
  console.log(c(C.bold, "Usage:"));
  console.log("  hermes                    Start the interactive TUI");
  console.log("  hermes tui                Start the interactive TUI");
  console.log("  hermes --classic          Start the classic prompt (no TUI)");
  console.log("  hermes <task>             Run a task directly");
  console.log(
    "  hermes serve              Start backend + frontend (dev mode)",
  );
  console.log(
    "  hermes serve --build      Start backend + build & serve frontend",
  );
  console.log("  hermes --help             Show this help");
  console.log("  hermes --version          Show version");
  console.log("");
  console.log(c(C.bold, "Environment Variables:"));
  console.log(
    "  HERMES_API                Backend URL (default: http://localhost:4000)",
  );
  console.log("");
  console.log(c(C.bold, "Commands (interactive mode):"));
  console.log("  /new                      Start a fresh experiment");
  console.log("  /open <id>                Attach to an experiment");
  console.log("  /retry [id]               Re-run an experiment");
  console.log("  /list                     List recent experiments");
  console.log("  /cancel [id]              Cancel a running experiment");
  console.log("  /delete <id>              Delete an experiment");
  console.log(
    "  /export [path]            Export the entire active conversation",
  );
  console.log(
    "  /copy                     Copy the entire active conversation",
  );
  console.log("  /connect [path]           Connect a folder as a project");
  console.log("  /projects                 List projects");
  console.log("  /project <id|name>        Set active project");
  console.log("  /skills                   List available skills");
  console.log("  /model                    Select AI model");
  console.log("  /model list               List available models");
  console.log("  /model current            Show current model");
  console.log("  /model use <model>        Switch model");
  console.log("  /model reset              Restore default model");
  console.log("");
  console.log(c(C.bold, "Skill commands (force a specific skill):"));
  console.log("  /debug <task>             Force the Debugging skill");
  console.log("  /code <task>              Force the Coding skill");
  console.log("  /research <task>          Force the Research skill");
  console.log("  /brainstorm <task>        Force the Brainstorming skill");
  console.log("  /ui <task>                Force the UI Analysis skill");
  console.log("");
  console.log("  /quit                     Exit");
  console.log("");
  console.log(c(C.dim, "Anything else you type becomes a task."));
}

async function isBackendRunning() {
  try {
    const res = await fetch(`${API}/api/health`, {
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function startBackend() {
  if (!existsSync(BACKEND_SERVER)) {
    return null;
  }
  console.log(c(C.dim, "Starting Hermes backend..."));
  const child = spawn("node", [BACKEND_SERVER], {
    cwd: BACKEND_DIR,
    stdio: "ignore",
    detached: true,
  });
  child.unref();
  backendProcess = child;
  return child;
}

async function waitForBackend(timeoutMs = BACKEND_STARTUP_TIMEOUT_MS) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await isBackendRunning()) return true;
    await sleep(1000);
  }
  return false;
}

async function ensureBackend() {
  if (await isBackendRunning()) return true;

  const child = startBackend();
  if (!child) {
    console.log(
      c(C.red, "Backend server.js not found. Install dependencies first:"),
    );
    console.log(c(C.dim, "  cd backend && npm install"));
    return false;
  }

  console.log(c(C.dim, "Waiting for backend to start..."));
  const ok = await waitForBackend();
  if (!ok) {
    console.log(c(C.red, "Backend failed to start within 30 seconds."));
    console.log(c(C.dim, "Try starting manually:  cd backend && npm start"));
    return false;
  }
  console.log(c(C.green, "Backend is up."));
  return true;
}

async function checkHealth() {
  const ok = await ensureBackend();
  if (!ok) process.exit(1);
}

const SKILL_LABELS = {
  debugging: { label: "debug", color: C.red },
  coding: { label: "code", color: C.cyan },
  research: { label: "research", color: C.yellow },
  brainstorming: { label: "brainstorm", color: C.cyan },
  ui_analysis: { label: "ui", color: C.yellow },
  general: { label: "general", color: C.dim },
};

function printTaskHead(exp, tag = "TASK") {
  const kind =
    exp.kind === "automation"
      ? `[auto:${exp.autoSubtype || "?"}] `
      : exp.kind === "ui"
        ? "[ui] "
        : exp.kind === "brainstorm" || exp.brainstorm
          ? "[brainstorm] "
          : "";
  const skillTag = exp.skill ? SKILL_LABELS[exp.skill] : null;
  const skillStr = skillTag ? c(skillTag.color, `[${skillTag.label}] `) : "";
  console.log(`${c(C.bold, kind + skillStr + tag)} ${exp.id}: ${exp.task}`);
}

async function handleApproval(exp) {
  const pending = exp.agent?.pending;
  if (!pending) return false;
  const risk = pending.risk?.level || "medium";
  const riskColor =
    risk === "high" ? C.red : risk === "low" ? C.green : C.yellow;
  console.log("");
  console.log(c(C.yellow, "──────────────── APPROVAL NEEDED ────────────────"));
  console.log(
    `${c(C.bold, "Hermes wants to")} ${c(C.cyan, pending.tool.replace(/_/g, " "))} ${c(riskColor, `(${risk} risk)`)}`,
  );
  if (pending.risk?.reason) console.log(c(C.dim, pending.risk.reason));
  const argsText = Object.entries(pending.args || {})
    .map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`)
    .join(" · ");
  if (argsText) console.log(c(C.dim, argsText));
  console.log(c(C.dim, "  a = allow once    t = allow this task    d = deny"));
  while (true) {
    const ans = (await rl.question(promptText())).trim().toLowerCase();
    const choice =
      ans === "a" || ans === "allow" || ans === "allow_once"
        ? "allow_once"
        : ans === "t" || ans === "allow_task"
          ? "allow_task"
          : ans === "d" || ans === "deny" || ans === "n"
            ? "deny"
            : null;
    if (!choice) {
      console.log(c(C.dim, "unknown — press a, t or d"));
      continue;
    }
    await api(`/api/experiments/${exp.id}/approve`, {
      method: "POST",
      body: JSON.stringify({
        approvalId: pending.approvalId,
        decision: choice,
      }),
    });
    console.log(
      c(
        C.dim,
        choice === "deny"
          ? "Denied — fed back to Hermes."
          : "Allowed — resuming…",
      ),
    );
    return true;
  }
}

async function renderDone(exp) {
  console.log("");
  if (exp.status === "failed") {
    console.log(c(C.red, `FAILED: ${exp.error || "unknown error"}`));
    console.log(
      c(C.dim, "Use /retry to run it again or /cancel to stop the thread."),
    );
    return;
  }
  if (exp.status === "cancelled") {
    console.log(c(C.yellow, "Cancelled."));
    return;
  }
  if (exp.brainstorm) {
    const b = exp.brainstorm;
    const best = b.iterations?.at(-1)?.bestScore;
    console.log(
      c(
        C.cyan,
        `[brainstorm] ${b.iterations?.length || 0} iteration(s) · ${(
          b.iterations || []
        ).reduce(
          (n, it) => n + it.candidates.length,
          0,
        )} candidate(s) · best ${best ?? "?"}/10${b.confidence != null ? ` · confidence ${b.confidence}%` : ""}`,
      ),
    );
  }
  for (const f of exp.findings || []) {
    const color = /critical/i.test(f)
      ? C.red
      : /warning/i.test(f)
        ? C.yellow
        : C.green;
    console.log(c(color, f));
  }
  if (exp.toolCalls?.length) {
    const used = exp.toolCalls.filter((t) => !t.error);
    const failed = exp.toolCalls.filter((t) => t.error);
    console.log(
      c(C.dim, `Tools: ${used.length} used, ${failed.length} failed`),
    );
    for (const f of failed) console.log(c(C.red, `  x ${f.name}: ${f.error}`));
  }
  console.log("");
  console.log(formatAnswer(exp.answer));
  console.log("");
  console.log(
    c(
      C.dim,
      "Reply to continue this thread · /new for a fresh task · /list to browse",
    ),
  );
}

async function watch(expId) {
  let lastProgress = "";
  let sawApproval = false;
  const started = Date.now();
  let streaming = false;
  let streamBuffer = "";

  wsConnect();
  wsSubscribe(expId);
  wsTokenCallback = (token) => {
    if (!streaming) {
      streaming = true;
      process.stdout.write(c(C.dim, "  ▸ "));
    }
    streamBuffer += token;
    process.stdout.write(token);
  };

  try {
    while (Date.now() - started < MAX_WAIT_MS) {
      if (watchCtrl.stop) {
        console.log(
          c(
            C.yellow,
            "Stopped watching — experiment keeps running in the background. Use /open to reattach.",
          ),
        );
        return;
      }
      await sleep(POLL_MS);
      const exp = await api(`/api/experiments/${expId}`);
      const prog = (exp.progress || []).join(" ▸ ");
      if (prog && prog !== lastProgress) {
        lastProgress = prog;
        if (streaming) {
          process.stdout.write("\n");
          streaming = false;
        }
        console.log(c(C.dim, `  ▸ ${prog}`));
      }
      if (exp.status === "needs_approval") {
        sawApproval = true;
        if (streaming) {
          process.stdout.write("\n");
          streaming = false;
        }
        await handleApproval(exp);
        continue;
      }
      if (
        exp.status === "completed" ||
        exp.status === "failed" ||
        exp.status === "cancelled"
      ) {
        if (streaming) {
          process.stdout.write("\n");
          streaming = false;
        }
        await renderDone(exp);
        return;
      }
    }
    console.log(
      c(
        C.yellow,
        "Still running after 15 min — it continues in the background. Use /open to reattach.",
      ),
    );
  } finally {
    wsTokenCallback = null;
    wsUnsubscribe(expId);
  }
}

async function runTask(task, forceSkill = null) {
  watchCtrl.stop = false;
  if (current && !forceSkill) {
    console.log(c(C.dim, `Follow-up on experiment ${current.id}…`));
    await api(`/api/experiments/${current.id}/reply`, {
      method: "POST",
      body: JSON.stringify({ message: task }),
    });
    await watch(current.id);
    return;
  }

  if (forceSkill) {
    current = null;
    console.log(c(C.dim, `Using skill: ${forceSkill}`));
  }
  const created = await api("/api/experiments", {
    method: "POST",
    body: JSON.stringify({ task, projectId: currentProjectId || undefined }),
  });

  let exp = await api(`/api/experiments/${created.id}`);

  if (forceSkill && exp.status === "running") {
    exp.skill = forceSkill;
  }
  current = { id: exp.id };
  printTaskHead(exp);
  await watch(exp.id);
}

async function refreshProjects() {
  projects = await api("/api/projects").catch(() => []);
  return projects;
}

function printModels(data) {
  console.log(c(C.cyan, "Models"));
  for (const group of data.models || []) {
    console.log(
      `  ${group.label} (${group.provider})${group.available?.available ? "" : c(C.yellow, " [not configured]")}`,
    );
    for (const model of group.models || []) {
      const current =
        data.current?.provider === group.provider &&
        data.current?.model === model.name;
      console.log(`    ${current ? c(C.green, "✓ ") : "  "}${model.name}`);
    }
  }
}

function parseModelRef(value) {
  const slash = value.indexOf("/");
  if (slash <= 0 || slash === value.length - 1) return null;
  return { provider: value.slice(0, slash), model: value.slice(slash + 1) };
}

async function runCommand(line) {
  const [cmd, ...rest] = line.split(/\s+/);
  const arg = rest.join(" ").trim();
  switch (cmd) {
    case "/new": {
      current = null;
      console.log(
        c(C.dim, "New thread — next task starts a fresh experiment."),
      );
      break;
    }
    case "/list": {
      const exps = await api("/api/experiments");
      const rows = exps.slice(0, 12);
      if (!rows.length) {
        console.log(c(C.dim, "No experiments yet."));
        break;
      }
      for (const e of rows) {
        const kind =
          e.kind === "automation"
            ? `[${e.autoSubtype}]`
            : e.brainstorm
              ? "[bs]"
              : "";
        const skillTag =
          e.skill && SKILL_LABELS[e.skill] ? SKILL_LABELS[e.skill] : null;
        const skillStr = skillTag
          ? ` ${c(skillTag.color, `[${skillTag.label}]`)}`
          : "";
        console.log(
          `${c(statusColor(e.status), e.status.padEnd(13))} ${c(C.cyan, String(e.id).padStart(5))}${skillStr} ${kind} ${String(
            e.task,
          ).slice(0, 60)} ${c(C.dim, timeAgo(e.createdAt))}`,
        );
      }
      if (exps.length > rows.length)
        console.log(c(C.dim, `… ${exps.length - rows.length} more`));
      break;
    }
    case "/open": {
      if (!arg) {
        console.log(c(C.dim, "Usage: /open <id>"));
        break;
      }
      const exp = await api(`/api/experiments/${arg}`);
      current = { id: exp.id };
      printTaskHead(exp);
      if (exp.status === "running" || exp.status === "needs_approval") {
        console.log(c(C.dim, `Status: ${exp.status} — watching…`));
        await watch(exp.id);
      } else {
        await renderDone(exp);
      }
      break;
    }
    case "/retry": {
      const id = arg || current?.id;
      if (!id) {
        console.log(c(C.dim, "Usage: /retry [id]"));
        break;
      }
      const exp = await api(`/api/experiments/${id}`);
      const task = exp.task;
      current = { id };
      console.log(c(C.dim, `Retrying: ${task}`));
      await api(`/api/experiments/${id}/reply`, {
        method: "POST",
        body: JSON.stringify({ message: task }),
      });
      await watch(id);
      break;
    }
    case "/cancel": {
      const id = arg || current?.id;
      if (!id) {
        console.log(c(C.dim, "Usage: /cancel [id]"));
        break;
      }
      await api(`/api/experiments/${id}/cancel`, { method: "POST" });
      console.log(c(C.dim, `Cancelled ${id}.`));
      break;
    }
    case "/delete": {
      const id = arg || current?.id;
      if (!id) {
        console.log(c(C.dim, "Usage: /delete <id>"));
        break;
      }
      await api(`/api/experiments/${id}`, { method: "DELETE" });
      if (current?.id === id) current = null;
      console.log(c(C.dim, `Deleted ${id}.`));
      break;
    }
    case "/export":
      await exportConversation(arg);
      break;
    case "/copy":
      await copyConversation();
      break;
    case "/connect": {
      const connectPath = arg ? path.resolve(arg) : process.cwd();
      let connectStat;
      try {
        connectStat = await fsPromises.stat(connectPath);
      } catch {
        console.log(c(C.red, `Folder does not exist: ${connectPath}`));
        break;
      }
      if (!connectStat.isDirectory()) {
        console.log(c(C.red, `Not a folder: ${connectPath}`));
        break;
      }
      await refreshProjects();
      const existing = projects.find((p) => p.path === connectPath);
      if (existing) {
        currentProjectId = existing.id;
        console.log(
          c(C.green, `Already registered as project: ${existing.name}`),
        );
        console.log(c(C.dim, `Set as active project (id: ${existing.id})`));
        break;
      }
      const folderName = path.basename(connectPath);
      try {
        const newProject = await api("/api/projects", {
          method: "POST",
          body: JSON.stringify({ name: folderName, path: connectPath }),
        });
        currentProjectId = newProject.id;
        console.log(c(C.green, `Connected project: ${newProject.name}`));
        console.log(
          c(
            C.dim,
            `Path: ${newProject.path} · id: ${newProject.id} · stats: ${JSON.stringify(newProject.stats || {})}`,
          ),
        );

        try {
          const settings = await api("/api/settings");
          if (settings.trustLevel < 2)
            await api("/api/settings", {
              method: "PUT",
              body: JSON.stringify({ trustLevel: 2 }),
            });
        } catch {}
        console.log(
          c(
            C.dim,
            `Set as active project — Hermes can now access this folder.`,
          ),
        );
      } catch (err) {
        console.log(c(C.red, `Failed to connect: ${err.message}`));
      }
      break;
    }
    case "/projects": {
      await refreshProjects();
      if (!projects.length) {
        console.log(
          c(C.dim, "No projects yet — add them in the web UI (Projects view)."),
        );
        break;
      }
      for (const p of projects) {
        const active = p.id === currentProjectId ? c(C.green, " [active]") : "";
        console.log(
          `${c(C.cyan, String(p.id).padStart(5))} ${p.name} ${c(C.dim, p.path)}${active}`,
        );
      }
      break;
    }
    case "/project": {
      if (!arg) {
        console.log(c(C.dim, "Usage: /project <id or name>  (see /projects)"));
        break;
      }
      await refreshProjects();
      const p = projects.find(
        (x) => x.id === arg || x.name.toLowerCase() === arg.toLowerCase(),
      );
      if (!p) {
        console.log(c(C.red, `No project matches "${arg}"`));
        break;
      }
      currentProjectId = p.id;
      console.log(c(C.dim, `Active project: ${p.name}`));
      break;
    }
    case "/model": {
      const modelArg = arg.trim();
      if (!modelArg) {
        const data = await api("/api/models");
        printModels(data);
        break;
      }
      if (modelArg.toLowerCase() === "list") {
        printModels(await api("/api/models"));
        break;
      }
      if (modelArg.toLowerCase() === "current") {
        const currentModel = (await api("/api/models")).current;
        console.log(`Provider: ${currentModel.provider || "none"}`);
        console.log(`Model:    ${currentModel.model || "none"}`);
        console.log(`Source:   ${currentModel.source}`);
        break;
      }
      if (modelArg.toLowerCase() === "reset") {
        const result = await api("/api/models/reset", { method: "POST" });
        console.log(
          c(
            C.green,
            `Model reset: ${result.current.provider} / ${result.current.model}`,
          ),
        );
        break;
      }
      const ref = parseModelRef(modelArg.replace(/^use\s+/i, ""));
      if (!ref) {
        const result = await api("/api/models", {
          method: "PUT",
          body: JSON.stringify({ reference: modelArg.replace(/^use\s+/i, "") }),
        });
        console.log(
          c(
            C.green,
            `Model changed: ${result.current.provider} / ${result.current.model}`,
          ),
        );
        break;
      }
      const result = await api("/api/models", {
        method: "PUT",
        body: JSON.stringify(ref),
      });
      console.log(
        c(
          C.green,
          `Model changed: ${result.current.provider} / ${result.current.model}`,
        ),
      );
      break;
    }
    case "/help": {
      console.log(c(C.cyan, "Commands"));
      for (const [k, v] of [
        ["/new", "start a fresh experiment (next task is new)"],
        ["/open <id>", "attach to an experiment's thread"],
        ["/retry [id]", "re-run an experiment's task"],
        ["/list", "recent experiments"],
        ["/cancel [id]", "cancel a running experiment"],
        ["/delete <id>", "delete an experiment"],
        ["/export [path]", "export the entire active conversation as Markdown"],
        ["/copy", "copy the entire active conversation to the clipboard"],
        ["/connect [path]", "connect a folder as a project (defaults to cwd)"],
        ["/projects", "list projects"],
        ["/project <id|name>", "set active project for new tasks"],
        ["/skills", "list available skills"],
        ["/model", "select AI model"],
        ["/model list", "list available models"],
        ["/model current", "show current model"],
        ["/model use <model>", "switch model"],
        ["/model reset", "restore default model"],
      ]) {
        console.log(`  ${c(C.bold, k.padEnd(16))} ${v}`);
      }
      console.log("");
      console.log(c(C.cyan, "Skill commands"));
      for (const [k, v] of [
        ["/debug <task>", "force the Debugging skill"],
        ["/code <task>", "force the Coding skill"],
        ["/research <task>", "force the Research skill"],
        ["/brainstorm <task>", "force the Brainstorming skill"],
        ["/ui <task>", "force the UI Analysis skill"],
      ]) {
        console.log(`  ${c(C.bold, k.padEnd(16))} ${v}`);
      }
      console.log("");
      console.log(
        c(
          C.dim,
          "Anything else you type becomes a task (or a follow-up on the current thread).",
        ),
      );
      break;
    }
    case "/skills": {
      try {
        const data = await api("/api/skills");
        const skills = data.skills || [];
        if (!skills.length) {
          console.log(c(C.dim, "No skills registered."));
          break;
        }
        console.log(c(C.cyan, "Hermes Skills"));
        console.log("");
        for (const s of skills) {
          const meta = SKILL_LABELS[s.name] || { label: s.name, color: C.dim };
          const tools = s.tools?.length
            ? c(C.dim, ` [${s.tools.join(", ")}]`)
            : "";
          console.log(
            `  ${c(meta.color, `[${meta.label}]`.padEnd(14))} ${c(C.bold, s.description)}${tools}`,
          );
        }
        console.log("");
        console.log(
          c(
            C.dim,
            `Hermes auto-routes tasks to the best skill. ${skills.length} skills available.`,
          ),
        );
      } catch (err) {
        console.log(c(C.red, `Failed to fetch skills: ${err.message}`));
      }
      break;
    }
    case "/debug": {
      if (!arg) {
        console.log(c(C.dim, "Usage: /debug <task>"));
        break;
      }
      await runTask(arg, "debugging");
      break;
    }
    case "/code": {
      if (!arg) {
        console.log(c(C.dim, "Usage: /code <task>"));
        break;
      }
      await runTask(arg, "coding");
      break;
    }
    case "/research": {
      if (!arg) {
        console.log(c(C.dim, "Usage: /research <task>"));
        break;
      }
      await runTask(arg, "research");
      break;
    }
    case "/brainstorm": {
      if (!arg) {
        console.log(c(C.dim, "Usage: /brainstorm <task>"));
        break;
      }
      await runTask(arg, "brainstorming");
      break;
    }
    case "/ui": {
      if (!arg) {
        console.log(c(C.dim, "Usage: /ui <task> (upload a screenshot first)"));
        break;
      }
      await runTask(arg, "ui_analysis");
      break;
    }
    case "/quit":
    case "/exit":
    case "/q":
      process.exit(0);
    default:
      console.log(c(C.dim, `Unknown command: ${cmd} — try /help`));
  }
}

async function collectInput(initial) {
  let text = initial;
  while (text.endsWith("\\")) {
    text = text.slice(0, -1);
    const more = await rl.question(c(C.dim, "… "));
    text += "\n" + more;
  }
  return text.trim();
}

async function main() {
  const args = argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    exit(0);
  }
  if (args.includes("--version") || args.includes("-v")) {
    console.log(getVersion());
    exit(0);
  }
  if (args.includes("serve")) {
    const buildMode = args.includes("--build");
    await serve(buildMode ? "build" : "dev");
    return;
  }

  const taskArgs = args.filter((a) => !a.startsWith("-") && a !== "tui");
  if (taskArgs.length) {
    printBanner();
    await checkHealth();
    wsConnect();
    await refreshProjects();
    watchCtrl.stop = false;
    const task = taskArgs.join(" ");
    const exp = await api("/api/experiments", {
      method: "POST",
      body: JSON.stringify({ task, projectId: currentProjectId || undefined }),
    });
    current = { id: exp.id };
    printTaskHead(exp);
    await watch(exp.id);
    return;
  }

  if (!args.includes("--classic")) {
    const { runTui } = await import("./tui.js");
    await runTui();
    return;
  }

  printBanner();
  await checkHealth();
  wsConnect();
  await refreshProjects();

  while (true) {
    let line;
    try {
      line = await rl.question(promptText());
    } catch {
      process.exit(0);
    }
    if (!line.trim()) continue;
    if (line.trim().startsWith("/")) {
      await runCommand(line.trim());
      continue;
    }
    const task = await collectInput(line);
    if (!task) continue;
    try {
      await runTask(task);
    } catch (err) {
      console.log(c(C.red, `Error: ${err.message}`));
    }
  }
}

rl.on("SIGINT", () => {
  if (watchCtrl.stop) {
    process.exit(0);
  }
  watchCtrl.stop = true;
});

const FRONTEND_DIR = path.join(PROJECT_ROOT, "frontend");
const FRONTEND_PROD = path.join(PROJECT_ROOT, "frontend", "dist");

function startProcess(name, cmd, args, cwd) {
  console.log(c(C.cyan, `[${name}]`) + c(C.dim, ` starting...`));
  const child = spawn(cmd, args, { cwd, stdio: "pipe", shell: true });
  child.stdout?.on("data", (d) => {
    const lines = String(d).split("\n").filter(Boolean);
    for (const line of lines) console.log(c(C.cyan, `[${name}]`) + " " + line);
  });
  child.stderr?.on("data", (d) => {
    const lines = String(d).split("\n").filter(Boolean);
    for (const line of lines)
      console.log(c(C.cyan, `[${name}]`) + c(C.dim, " " + line));
  });
  child.on("error", (err) => {
    console.log(c(C.red, `[${name}] failed to start: ${err.message}`));
  });
  child.on("exit", (code) => {
    console.log(c(C.yellow, `[${name}] exited (code ${code})`));
  });
  return child;
}

async function serve(mode) {
  const children = [];
  let backendAlreadyRunning = await isBackendRunning();

  if (backendAlreadyRunning) {
    console.log(c(C.green, "Backend already running on http://localhost:4000"));
  } else {
    children.push(startProcess("backend", "node", ["server.js"], BACKEND_DIR));

    console.log(c(C.dim, "Waiting for backend..."));
    const ok = await waitForBackend(15000);
    if (!ok) {
      console.log(c(C.red, "Backend failed to start. Check the logs above."));
      for (const ch of children) ch.kill();
      exit(1);
    }
    console.log(c(C.green, "Backend is up on http://localhost:4000"));
  }

  if (mode === "build") {
    children.push(
      startProcess("frontend", "npm", ["run", "build"], FRONTEND_DIR),
    );
    console.log(c(C.green, "Frontend built to frontend/dist/"));
    console.log(c(C.dim, "Serving with: npx serve frontend/dist"));
    children.push(
      startProcess(
        "frontend",
        "npx",
        ["serve", FRONTEND_PROD, "-l", "5173", "--no-clipboard"],
        PROJECT_ROOT,
      ),
    );
  } else {
    children.push(
      startProcess("frontend", "npm", ["run", "dev"], FRONTEND_DIR),
    );
  }

  console.log("");
  console.log(c(C.green, "═══════════════════════════════════════════"));
  console.log(c(C.green, "  Hermes is running!"));
  console.log(c(C.cyan, "  Backend:   http://localhost:4000"));
  console.log(c(C.cyan, "  Frontend:  http://localhost:5173"));
  console.log(c(C.green, "═══════════════════════════════════════════"));
  console.log(c(C.dim, "  Press Ctrl+C to stop all processes"));
  console.log("");

  process.on("SIGINT", () => {
    console.log(c(C.yellow, "\nShutting down..."));
    for (const ch of children) {
      try {
        ch.kill("SIGTERM");
      } catch {}
    }
    setTimeout(() => exit(0), 1000);
  });
  process.on("SIGTERM", () => {
    for (const ch of children) {
      try {
        ch.kill("SIGTERM");
      } catch {}
    }
    exit(0);
  });
}

main();
