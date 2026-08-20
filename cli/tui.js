import { stdin, stdout, exit } from "node:process";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { existsSync } from "node:fs";
import fsPromises from "node:fs/promises";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const BACKEND_DIR = path.join(PROJECT_ROOT, "backend");
const BACKEND_SERVER = path.join(BACKEND_DIR, "server.js");
const API = process.env.HERMES_API || "http://localhost:4000";
const POLL_MS = 800;
const BACKEND_STARTUP_TIMEOUT_MS = 30 * 1000;

const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  underline: "\x1b[4m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  orange: "\x1b[38;5;208m",
  purple: "\x1b[38;5;135m",
  gray: "\x1b[38;5;245m",
};
const TTY = !!stdout.isTTY;
const c = (codes, s) => {
  const a = Array.isArray(codes) ? codes : [codes];
  return TTY ? a.join("") + String(s) + C.reset : String(s);
};

const SPIN = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const PIPELINE = [
  "Understanding request",
  "Identifying relevant files",
  "Inspecting code flow",
  "Finding suspicious behavior",
  "Preparing recommendation",
];
const THOUGHT_DURS = ["1.1s", "4.3s", "301ms", "2.4s", "900ms"];
const SKILL_COLORS = {
  debugging: C.red,
  coding: C.cyan,
  research: C.yellow,
  brainstorming: C.cyan,
  ui_analysis: C.yellow,
  general: C.dim,
};
const SLASH_COMMANDS = [
  { name: "new", desc: "start a fresh session", insert: "/new" },
  { name: "open", desc: "attach to a session", insert: "/open " },
  { name: "retry", desc: "re-run a task", insert: "/retry " },
  { name: "resume", desc: "resume latest experiment", insert: "/resume" },
  { name: "queue", desc: "show queued tasks", insert: "/queue" },
  { name: "history", desc: "show previous tasks", insert: "/history" },
  { name: "list", desc: "recent experiments", insert: "/list" },
  { name: "filter", desc: "filter experiments by status", insert: "/filter " },
  { name: "sort", desc: "sort experiments", insert: "/sort " },
  { name: "cancel", desc: "cancel running task", insert: "/cancel " },
  { name: "delete", desc: "delete an experiment", insert: "/delete " },
  { name: "debug", desc: "force Debugging skill", insert: "/debug " },
  { name: "code", desc: "force Coding skill", insert: "/code " },
  { name: "research", desc: "force Research skill", insert: "/research " },
  {
    name: "brainstorm",
    desc: "force Brainstorming skill",
    insert: "/brainstorm ",
  },
  { name: "ui", desc: "force UI Analysis skill", insert: "/ui " },
  { name: "connect", desc: "connect a folder", insert: "/connect " },
  { name: "projects", desc: "list projects", insert: "/projects" },
  { name: "project", desc: "set active project", insert: "/project " },
  {
    name: "rename-project",
    desc: "rename a project",
    insert: "/rename-project ",
  },
  {
    name: "remove-project",
    desc: "remove a project",
    insert: "/remove-project ",
  },
  { name: "trust", desc: "change trust level", insert: "/trust " },
  { name: "check", desc: "show workspace status", insert: "/check" },
  { name: "applyfix", desc: "apply suggested fix", insert: "/applyfix" },
  { name: "rollback", desc: "undo applied fix", insert: "/rollback" },
  { name: "undo", desc: "undo the last applied fix", insert: "/undo" },
  { name: "skills", desc: "list skills", insert: "/skills" },
  { name: "help", desc: "show help", insert: "/help" },
  { name: "quit", desc: "exit", insert: "/quit" },
];
const LOGO = [
  "██╗  ██╗███████╗██████╗ ███╗   ███╗ ██████╗██╗     ██╗",
  "██║  ██║██╔════╝██╔══██╗████╗ ████║██╔════╝██║     ██║",
  "███████║█████╗  ██████╔╝██╔████╔██║██║     ██║     ██║",
  "██╔══██║██╔══╝  ██╔══██╗██║╚██╔╝██║██║     ██║     ██║",
  "██║  ██║███████╗██║  ██║██║ ╚═╝ ██║╚██████╗███████╗██║",
  "╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝╚═╝     ╚═╝ ╚═════╝╚══════╝╚═╝",
];

export const state = {
  view: "chat",
  input: "",
  history: [],
  histIndex: -1,
  sel: 0,
  scroll: 0,
  follow: true,
  exp: null,
  currentConversationId: null,
  experiments: [],
  allExperiments: [],
  experimentFilter: "all",
  experimentSort: "newest",
  projects: [],
  skills: [],
  projectId: null,
  defaultProjectId: null,
  projectSel: 0,
  projectScroll: 0,
  projectHealth: null,
  checkSel: 0,
  trustSel: 1,
  backendOk: null,
  backendMsg: "",
  error: "",
  status: "",
  slash: null,
  questions: null,
  qAnswered: {},
  trustLevel: 1,
  pendingTrustLevel: null,
  taskQueue: [],
  loading: false,
  quitting: false,
  chatHistory: [],
  previousConversationId: null,
  panelOpen: false,
  panelView: "list",
  panelScroll: 0,
  slashScroll: 0,
  screenActive: false,
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(p, opts = {}) {
  const res = await fetch(API + p, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body;
}

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
        : s === "running"
          ? [C.cyan, C.bold]
          : C.dim;

const fmtDur = (ms) => {
  if (ms < 1000) return `${Math.max(1, Math.round(ms))}ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
};
const elapsed = (exp) => {
  const end = ["completed", "failed", "cancelled"].includes(exp.status)
    ? exp.completedAt
    : Date.now();
  return fmtDur(Math.max(0, (end || Date.now()) - exp.createdAt));
};

function modelInfo(exp, sep = " · ") {
  const model = exp?.model || "DeepSeek V4 Flash Free";
  const skill = exp?.skill
    ? exp.skill.replace(/_/g, " ").replace(/^\w/, (m) => m.toUpperCase())
    : "OpenCode Zen";
  const trust =
    state.trustLevel === 3
      ? "max"
      : state.trustLevel === 2
        ? "auto"
        : "suggest";
  return `Build${sep}${model}${sep}${skill}${sep}${trust}`;
}

const ANSI_ESCAPE = /\x1b\[[0-?]*[ -/]*[@-~]/g;
const ANSI_TOKEN = /^\x1b\[[0-?]*[ -/]*[@-~]$/;
const plainText = (text) => String(text).replace(ANSI_ESCAPE, "");
function fitLine(text, width) {
  if (!TTY) return plainText(text).slice(0, width);
  let visible = 0;
  let output = "";
  for (const token of String(text).match(/\x1b\[[0-?]*[ -/]*[@-~]|[\s\S]/g) ||
    []) {
    if (ANSI_TOKEN.test(token)) {
      output += token;
    } else if (visible < width) {
      output += token;
      visible++;
    }
  }
  return output + (output.includes("\x1b[") ? C.reset : "");
}

function wrap(text, width) {
  const out = [];
  for (const raw of String(text).split("\n")) {
    let line = raw;
    while (line.length > width) {
      out.push(line.slice(0, width));
      line = line.slice(width);
    }
    out.push(line);
  }
  return out;
}

function assemble(cols, segs) {
  let out = "";
  for (const [st, t] of segs) out += c(st, String(t));
  if (out.length === 0) return "";
  return fitLine(out, cols);
}

function truncateAssemble(cols, segs) {
  let total = 0;
  for (const [, t] of segs) total += plainText(t).length;
  if (total > cols) {
    const need = total - cols;
    const last = segs.length - 1;
    return assemble(
      cols,
      segs.map(([st, t], i) =>
        i === last
          ? [st, String(t).slice(0, Math.max(0, String(t).length - need))]
          : [st, t],
      ),
    );
  }
  let out = "";
  for (const [st, t] of segs) out += c(st, String(t));
  if (total < cols) out += " ".repeat(cols - total);
  return fitLine(out, cols);
}

function padTo(lines, h) {
  while (lines.length < h) lines.push("");
  return lines.slice(0, h);
}
function centeredLine(w, text, style) {
  const pad = Math.max(0, Math.floor((w - text.length) / 2));
  return c(style || C.dim, " ".repeat(pad) + text);
}
function logoBlock(w) {
  return LOGO.map((row) => {
    const pad = Math.max(0, Math.floor((w - row.length) / 2));
    return c(C.dim, " ".repeat(pad) + row);
  });
}

function headerBlock(w) {
  const lines = logoBlock(w);
  lines.push(centeredLine(w, "AI Experiment & Developer Assistant", [C.dim]));
  return lines;
}

function tabBar(w) {
  const tabs = [
    ["chat", "Chat"],
    ["list", "Experiments"],
    ["projects", "Projects"],
    ["skills", "Skills"],
    ["help", "Help"],
  ];
  const parts = [[C.dim, "  "]];
  tabs.forEach(([view, label], i) => {
    const active = state.view === view;
    parts.push(
      [
        active ? [C.cyan, C.bold] : C.gray,
        (active ? "[ " : "  ") + label + (active ? " ]" : "  "),
      ],
      [C.dim, i < tabs.length - 1 ? "  " : ""],
    );
  });
  parts.push([C.dim, "  Tab: next section"]);
  return truncateAssemble(w, parts);
}

function panelTabs(w) {
  const tabs = [
    ["list", "Experiments"],
    ["projects", "Projects"],
    ["skills", "Skills"],
    ["help", "Help"],
  ];
  const parts = [[C.dim, "  "]];
  tabs.forEach(([view, label], i) => {
    const active = state.panelView === view;
    parts.push(
      [
        active ? [C.orange, C.bold] : C.gray,
        (active ? "[ " : "  ") + label + (active ? " ]" : "  "),
      ],
      [C.dim, i < tabs.length - 1 ? "  " : ""],
    );
  });
  return truncateAssemble(w, parts);
}

function parseKeys(buf) {
  const s = buf.toString("utf8");
  const keys = [];
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "\x1b") {
      if (s[i + 1] === "[" && s[i + 2]) {
        const code = s[i + 2];
        if (code === "A") {
          keys.push("up");
          i += 2;
        } else if (code === "B") {
          keys.push("down");
          i += 2;
        } else if (code === "C") {
          keys.push("right");
          i += 2;
        } else if (code === "D") {
          keys.push("left");
          i += 2;
        } else {
          keys.push("escape");
          i += 1;
        }
      } else {
        keys.push("escape");
      }
    } else if (ch === "\r" || ch === "\n") keys.push("enter");
    else if (ch === "\x7f" || ch === "\b") keys.push("backspace");
    else if (ch === "\x09") keys.push("tab");
    else if (ch === "\x03") keys.push("ctrl-c");
    else if (ch === "\x04") keys.push("ctrl-d");
    else keys.push(ch);
  }
  return keys;
}

async function isBackendRunning() {
  try {
    return (
      await fetch(`${API}/api/health`, { signal: AbortSignal.timeout(3000) })
    ).ok;
  } catch {
    return false;
  }
}

async function ensureBackend() {
  if (await isBackendRunning()) {
    state.backendOk = true;
    state.backendMsg = "connected";
    return;
  }
  state.backendMsg = "starting…";
  renderFrame();
  if (!existsSync(BACKEND_SERVER)) {
    state.backendOk = false;
    state.backendMsg = "not found";
    return;
  }
  const child = spawn("node", [BACKEND_SERVER], {
    cwd: BACKEND_DIR,
    stdio: "ignore",
    detached: true,
  });
  child.unref();
  const start = Date.now();
  while (Date.now() - start < BACKEND_STARTUP_TIMEOUT_MS) {
    await sleep(1000);
    if (await isBackendRunning()) {
      state.backendOk = true;
      state.backendMsg = "connected";
      return;
    }
    renderFrame();
  }
  state.backendOk = false;
  state.backendMsg = "failed to start";
}

async function loadExperiments() {
  state.allExperiments = await api("/api/experiments").catch(
    () => state.allExperiments,
  );
  const filtered = state.allExperiments.filter((experiment) =>
    state.experimentFilter === "all"
      ? true
      : experiment.status === state.experimentFilter,
  );
  state.experiments = [...filtered].sort((a, b) => {
    if (state.experimentSort === "oldest") return a.createdAt - b.createdAt;
    if (state.experimentSort === "status")
      return String(a.status).localeCompare(String(b.status));
    return b.createdAt - a.createdAt;
  });
  state.sel = Math.min(state.sel, Math.max(0, state.experiments.length - 1));
}
async function loadProjects() {
  const ps = await api("/api/projects").catch(() => []);
  state.projects = ps;
  if (!ps.some((p) => p.id === state.projectId)) state.projectId = null;
  if (!ps.some((p) => p.id === state.defaultProjectId))
    state.defaultProjectId = null;
  const preferred = state.projectId || state.defaultProjectId;
  const preferredIndex = ps.findIndex((p) => p.id === preferred);
  state.projectSel = Math.min(
    Math.max(0, preferredIndex >= 0 ? preferredIndex : state.projectSel),
    Math.max(0, ps.length - 1),
  );
}
async function loadSkills() {
  const d = await api("/api/skills").catch(() => ({ skills: [] }));
  state.skills = d.skills || [];
}
async function loadProjectHealth() {
  if (!state.projectId) {
    state.projectHealth = null;
    return;
  }
  state.projectHealth = await api(
    `/api/projects/${state.projectId}/health`,
  ).catch(() => null);
}
async function loadSettings() {
  try {
    const s = await api("/api/settings");
    state.trustLevel = s.trustLevel || 1;
    state.defaultProjectId = s.defaultProjectId || null;
    state.projectId = state.defaultProjectId;
    state.trustSel = state.trustLevel;
  } catch {}
}

function detectProjectFromCwd() {
  const cwd = path.resolve(process.cwd());
  const matches = state.projects
    .map((project) => ({
      project,
      relative: path.relative(path.resolve(project.path), cwd),
    }))
    .filter(
      ({ relative }) =>
        relative === "" ||
        (!relative.startsWith("..") && !path.isAbsolute(relative)),
    )
    .sort(
      (a, b) =>
        path.resolve(b.project.path).length -
        path.resolve(a.project.path).length,
    );
  const match = matches[0]?.project;
  if (!match) return;
  state.projectId = match.id;
  state.projectSel = state.projects.findIndex(
    (project) => project.id === match.id,
  );
  state.status = `Auto-detected project: ${match.name}`;
}

async function chooseProject(project, mode = "both") {
  if (mode === "active" || mode === "both") state.projectId = project.id;
  if (mode === "default" || mode === "both") {
    await api("/api/settings", {
      method: "PUT",
      body: JSON.stringify({ defaultProjectId: project.id }),
    });
    state.defaultProjectId = project.id;
  }
  const label =
    mode === "default"
      ? "Default"
      : mode === "active"
        ? "Active"
        : "Active + default";
  state.status = `${label}: ${project.name}`;
}

async function applyTrustLevel(level) {
  await api("/api/settings", {
    method: "PUT",
    body: JSON.stringify({ trustLevel: level }),
  });
  state.trustLevel = level;
  state.trustSel = level;
  state.pendingTrustLevel = null;
  const labels = {
    1: "Suggest only",
    2: "Auto-fix low risk",
    3: "Full autonomous",
  };
  state.status = `Trust level ${level}: ${labels[level]}`;
}

function messagesOf(exp) {
  if (exp.messages?.length) return exp.messages;
  const msgs = [{ role: "user", content: exp.task, createdAt: exp.createdAt }];
  if (exp.answer)
    msgs.push({
      role: "assistant",
      content: exp.answer,
      createdAt: exp.completedAt,
    });
  return msgs;
}
function lastAssistantContent(exp) {
  const msgs = messagesOf(exp);
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i].role === "assistant") return msgs[i].content;
  }
  return exp.answer || "";
}
function parseFindings(md) {
  const out = [];
  for (const line of String(md || "").split("\n")) {
    const t = line.trim();
    if (
      t.startsWith("🔴") ||
      t.startsWith("🟡") ||
      t.startsWith("🟢") ||
      /^(critical|warning|suggestion)[:\s-]/i.test(t)
    )
      out.push(t);
  }
  return out;
}
function clarificationOf(exp) {
  for (const f of exp.findings || []) {
    const m = String(f).match(
      /^(?:Need more info|Needs data\/tools)\s*:\s*(.+)$/i,
    );
    if (m) return m[1];
  }
  return null;
}
function thoughtFor(tool, args) {
  args = args || {};
  switch (tool) {
    case "read_file":
      return `Read ${args.path} to understand its contents.`;
    case "search_files":
      return `Search for "${args.query}" in the project.`;
    case "glob":
      return `Glob "${args.pattern}" to find matching files.`;
    case "execute_command":
      return `Run "${args.command}".`;
    case "git":
      return `Git ${args.operation}${args.message ? ": " + args.message : ""}.`;
    default:
      return `Use the ${tool.replace(/_/g, " ")} tool.`;
  }
}
function toolEntry(tool, args) {
  args = args || {};
  if (tool === "read_file") return { mark: "→", text: `Read ${args.path}` };
  if (tool === "glob") return { mark: "*", text: `Glob "${args.pattern}"` };
  if (tool === "search_files" || tool === "search")
    return { mark: "*", text: `Search "${args.query}"` };
  if (tool === "execute_command")
    return { mark: "$", text: args.command, cmd: true };
  if (tool === "git")
    return {
      mark: "$",
      text: `git ${args.operation}${args.message ? " " + args.message : ""}`.trim(),
      cmd: true,
    };
  const rest = Object.values(args).join(" ").trim();
  return {
    mark: "→",
    text: `${tool.replace(/_/g, " ")}${rest ? " " + rest : ""}`.trim(),
  };
}
function toolCallsOf(exp) {
  return exp.toolCalls?.length ? exp.toolCalls : exp.agent?.toolLog || [];
}

function modelTag(model) {
  const m = String(model || "").toLowerCase();
  if (m.includes("gpt-4o-mini")) return "gpt4";
  if (m.includes("deepseek-v4-pro")) return "v4pro";
  if (m.includes("deepseek-v4-flash")) return "v4f";
  if (m.includes("flash")) return "flash";
  if (m.includes("pro")) return "pro";
  return m.replace(/[^a-z0-9]/g, "").slice(0, 4) || "?";
}

function skillStats(skillName) {
  const exps = state.experiments.filter((e) => e.skill === skillName);
  if (!exps.length) return null;
  const last = exps.reduce((a, b) => (b.createdAt > a.createdAt ? b : a));
  return `${String(last.status).padEnd(11)}  ${String(last.id).padStart(5)}  ${modelTag(last.model)}  ${timeAgo(last.createdAt)}`;
}

function skillBlock(s, w, lines) {
  const color = SKILL_COLORS[s.name] || C.cyan;
  lines.push(
    truncateAssemble(w, [
      [color, "  ◆ " + String(s.name || "?").toUpperCase()],
    ]),
  );
  lines.push(truncateAssemble(w, [[C.white, "    " + (s.description || "")]]));
  if (s.tools?.length)
    lines.push(
      truncateAssemble(w, [[C.dim, "    tools: " + s.tools.join(", ")]]),
    );
  const stats = skillStats(s.name);
  if (stats) lines.push(truncateAssemble(w, [[C.dim, "    " + stats]]));
  lines.push("");
}

function renderToolLog(calls, exp, w, body) {
  const hidden = Math.max(0, calls.length - 12);
  if (hidden) {
    body.push(
      truncateAssemble(w, [[C.dim, `  … ${hidden} earlier tool calls hidden`]]),
    );
  }
  calls.slice(-12).forEach((t) => {
    const e = toolEntry(t.name, t.args);
    if (e.cmd) {
      const label = /\b(?:powershell|pwsh)(?:\.exe)?\b/i.test(String(e.text))
        ? "PowerShell"
        : "Command";
      body.push(
        truncateAssemble(w, [
          [
            [t.error ? C.red : C.cyan, C.bold],
            `  ${t.error ? "!" : "→"} ${label}`,
          ],
          [C.dim, `  ${String(e.text).replace(/\s+/g, " ")}`],
        ]),
      );
      if (t.error)
        body.push(
          truncateAssemble(w, [
            [C.red, `    ${String(t.error).slice(0, Math.max(20, w - 8))}`],
          ]),
        );
    } else {
      body.push(
        truncateAssemble(w, [
          [C.cyan, "  " + e.mark + " "],
          [C.dim, e.text],
        ]),
      );
      if (t.error) body.push(truncateAssemble(w, [[C.red, "  ! " + t.error]]));
    }
  });
}

function pipelineBlock(exp, w, body) {
  body.push("");
  body.push(
    truncateAssemble(w, [
      [
        C.dim,
        "  " +
          SPIN[Math.floor(Date.now() / 120) % SPIN.length] +
          " Hermes is working…",
      ],
    ]),
  );
  const done = new Set(exp.progress || []);
  PIPELINE.forEach((step, i) => {
    const isDone = done.has(step);
    const isCurrent = !isDone && (i === 0 || done.has(PIPELINE[i - 1]));
    body.push(
      "      " +
        (isDone
          ? c(C.green, "✓")
          : isCurrent
            ? c(C.yellow, "▸")
            : c(C.dim, "·")) +
        "  " +
        step,
    );
  });
}

function answerBlock(content, w, body) {
  let inCode = false;
  for (const line of String(content || "").split("\n")) {
    const t = line.trim();
    if (t.startsWith("```")) {
      inCode = !inCode;
      body.push(truncateAssemble(w, [[C.dim, "  " + line]]));
      continue;
    }
    if (inCode) {
      body.push(truncateAssemble(w, [[C.dim, "  " + line]]));
      continue;
    }
    if (/^#{1,3}\s/.test(t)) {
      body.push(
        truncateAssemble(w, [[C.bold, "  " + t.replace(/^#+\s*/, "")]]),
      );
      continue;
    }
    if (/^[-*]\s+/.test(t)) {
      body.push(
        truncateAssemble(w, [
          [C.white, "  • " + t.replace(/^[-*]\s+/, "").replace(/\*\*/g, "")],
        ]),
      );
      continue;
    }
    if (t === "") {
      if (body.length && body[body.length - 1] !== "") body.push("");
      continue;
    }
    for (const l of wrap(line.replace(/\*\*/g, ""), w - 4)) body.push("  " + l);
  }
}

function renderMessage(m, w, body) {
  body.push("");
  if (m.role === "assistant") {
    body.push(
      truncateAssemble(w, [
        [[C.green, C.bold], "  HERMES"],
        [C.dim, "  ──"],
      ]),
    );
    answerBlock(m.content, w, body);
  } else {
    body.push(
      truncateAssemble(w, [
        [[C.cyan, C.bold], "  YOU"],
        [C.dim, "  ──"],
      ]),
    );
    for (const l of wrap(m.content, w - 4)) body.push(c(C.white, "  " + l));
  }
}

function findingsBlock(exp, w, body) {
  const findings = (
    exp.findings?.length
      ? exp.findings
      : parseFindings(lastAssistantContent(exp))
  ).filter(
    (f) => !/^(?:Need more info|Needs data\/tools)\s*:/i.test(String(f)),
  );
  if (!findings.length) return;
  body.push("");
  body.push(
    truncateAssemble(w, [
      [C.dim, "  ── Findings " + "─".repeat(Math.max(1, w - 14))],
    ]),
  );
  for (const f of findings.slice(0, 20)) {
    const clean = String(f)
      .replace(/^[🔴🟡🟢]\s*/u, "")
      .replace(/^(critical|warning|suggestion|info)[:\s-]+/i, "");
    const color = /critical/i.test(f)
      ? C.red
      : /warning/i.test(f)
        ? C.yellow
        : C.green;
    body.push(truncateAssemble(w, [[color, "  • " + clean]]));
  }
}

function questionsBlock(q, w, body) {
  const options = [
    "Explain + feasibility check (Recommended)",
    "Implement them now",
    "Ignore these items",
  ];
  state.questions = options;
  body.push("");
  body.push(truncateAssemble(w, [[C.bold, "  # Questions"]]));
  body.push(truncateAssemble(w, [[C.white, "  " + q]]));
  body.push("");
  const innerW = Math.min(w - 6, Math.max(...options.map((o) => o.length)) + 4);
  const boxW = innerW + 2;
  const left = Math.max(1, Math.floor((w - boxW) / 2));
  const pad = " ".repeat(left);
  body.push(
    pad + c(C.dim, "┌") + c(C.dim, "─".repeat(boxW - 2)) + c(C.dim, "┐"),
  );
  options.forEach((o, i) => {
    const content = ("  " + o).padEnd(boxW - 4) + "  ";
    body.push(
      pad +
        c(C.dim, "│") +
        c(i === 0 ? [C.cyan, C.bold] : C.gray, content) +
        c(C.dim, "│"),
    );
    if (i < options.length - 1)
      body.push(
        pad + c(C.dim, "├") + c(C.dim, "─".repeat(boxW - 2)) + c(C.dim, "┤"),
      );
  });
  body.push(
    pad + c(C.dim, "└") + c(C.dim, "─".repeat(boxW - 2)) + c(C.dim, "┘"),
  );
  body.push(truncateAssemble(w, [[C.dim, "  Press 1, 2 or 3 to choose"]]));
}

function approvalBlock(exp, w, body) {
  const p = exp.agent?.pending;
  if (!p) return;
  const risk = p.risk?.level || "medium";
  const riskColor =
    risk === "high" ? C.red : risk === "low" ? C.green : C.yellow;
  const command =
    p.tool === "execute_command" ? String(p.args?.command || "") : "";
  const rows = [
    { s: [[C.bold, C.white]], t: "APPROVAL NEEDED" },
    { s: [C.gray], t: `Action: ${(p.tool || "").replace(/_/g, " ")}` },
    ...(command ? [{ s: [C.white], t: `Command: ${command}` }] : []),
    {
      s: [C.white],
      t: `What happens: ${command ? "Runs in the attached project folder." : p.explanation || "Review the requested action before allowing it."}`,
    },
    { s: [riskColor, C.bold], t: `Risk: ${String(risk).toUpperCase()}` },
    { s: [C.gray], t: `Reason: ${p.risk?.reason || ""}` },
    { s: [C.gray], t: "[a] Allow once      [t] Allow this task      [d] Deny" },
  ];
  const boxW = Math.min(w - 6, Math.max(...rows.map((r) => r.t.length)) + 6);
  const left = Math.max(1, Math.floor((w - boxW) / 2));
  const pad = " ".repeat(left);
  const sep = c(C.cyan, "━".repeat(boxW - 2));
  body.push("");
  body.push(
    truncateAssemble(w, [
      [[C.yellow, C.bold], "  Hermes wants to modify a project file."],
    ]),
  );
  body.push(pad + c(C.cyan, "┏") + sep + c(C.cyan, "┓"));
  for (const r of rows) {
    body.push(
      pad +
        c(C.cyan, "┃") +
        c(r.s, ("  " + r.t).padEnd(boxW - 4) + "  ") +
        c(C.cyan, "┃"),
    );
  }
  body.push(pad + c(C.cyan, "┗") + sep + c(C.cyan, "┛"));
}

function chatBody(w, h) {
  const exp = state.exp;
  if (!exp) return welcomeBody(w, h);

  const body = [];
  if (state.backendOk === false) {
    body.push(
      truncateAssemble(w, [
        [C.red, "  × backend offline — " + state.backendMsg],
      ]),
    );
  }

  for (const he of state.chatHistory) {
    body.push("");
    for (const m of messagesOf(he)) renderMessage(m, w, body);
    const hcalls = toolCallsOf(he);
    if (hcalls.length) renderToolLog(hcalls, he, w, body);
    if (["completed", "failed", "cancelled"].includes(he.status)) {
      findingsBlock(he, w, body);
      body.push(
        truncateAssemble(w, [
          [C.dim, "  " + modelInfo(he) + " · " + elapsed(he)],
        ]),
      );
    }
  }
  if (state.chatHistory.length) body.push("");

  for (const m of messagesOf(exp)) renderMessage(m, w, body);
  if (exp.status === "running") {
    body.push(
      truncateAssemble(w, [
        [[C.cyan, C.bold], "  ▣ " + modelInfo(exp)],
        [C.dim, " · " + elapsed(exp)],
      ]),
    );
    body.push(
      truncateAssemble(w, [[C.dim, "  " + "─".repeat(Math.max(1, w - 4))]]),
    );
  }
  const calls = toolCallsOf(exp);
  if (
    calls.length &&
    (exp.status === "running" ||
      exp.status === "completed" ||
      exp.status === "failed")
  ) {
    if (exp.status !== "running") {
      body.push("");
      body.push(
        truncateAssemble(w, [[C.dim, "  " + "─".repeat(Math.max(1, w - 4))]]),
      );
    }
    renderToolLog(calls, exp, w, body);
  }
  const q = clarificationOf(exp);
  if (q && !state.qAnswered[exp.id]) questionsBlock(q, w, body);
  if (exp.status === "running") pipelineBlock(exp, w, body);
  if (exp.status === "needs_approval") approvalBlock(exp, w, body);
  if (["completed", "failed", "cancelled"].includes(exp.status)) {
    findingsBlock(exp, w, body);
    if (exp.status === "failed")
      body.push(
        truncateAssemble(w, [[C.red, "  × " + (exp.error || "unknown error")]]),
      );
    if (exp.status === "cancelled") body.push(c(C.yellow, "  Cancelled."));
    if (exp.appliedFix && !exp.appliedFix.rolledBack) {
      body.push(
        truncateAssemble(w, [[C.green, "  ✓ Fix applied — /rollback to undo"]]),
      );
    }
    if (exp.status !== "cancelled") {
      body.push("");
      body.push(
        truncateAssemble(w, [
          [C.dim, "  " + modelInfo(exp) + " · " + elapsed(exp)],
        ]),
      );
      body.push(
        truncateAssemble(w, [
          [
            C.dim,
            "  Reply to continue · /new for a fresh session · /list to browse",
          ],
        ]),
      );
    }
  }
  const maxScroll = Math.max(0, body.length - h);
  state.scroll = Math.min(Math.max(0, state.scroll || 0), maxScroll);
  let start = state.follow ? maxScroll : state.scroll;
  if (start >= maxScroll) {
    state.follow = true;
    start = maxScroll;
  }
  return body.slice(start, start + h);
}

function welcomeBody(w, h) {
  if (state.chatHistory.length) return chatBody(w, h);
  const lines = [];
  const proj = state.projects.find((p) => p.id === state.projectId);
  if (proj) lines.push(centeredLine(w, "project · " + proj.name, [C.cyan]));
  if (state.error)
    lines.push(centeredLine(w, "Error: " + state.error, [C.red]));
  while (lines.length < h - 2) lines.push("");
  lines.push(centeredLine(w, "tab agents     / to commands", [C.dim]));
  lines.push(centeredLine(w, "● Tip  Press Enter to send your task", [C.dim]));
  return lines;
}

function errorBody(w, h) {
  const lines = [];
  lines.push(truncateAssemble(w, [[[C.red, C.bold], "  × Request failed"]]));
  lines.push(
    truncateAssemble(w, [
      [C.white, "  Unable to connect to the Hermes backend."],
    ]),
  );
  lines.push(truncateAssemble(w, [[C.dim, "  Expected: " + API]]));
  lines.push("");
  lines.push(
    truncateAssemble(w, [[C.dim, "  Try starting the backend with:"]]),
  );
  lines.push(c(C.dim, "      cd backend"));
  lines.push(c(C.dim, "      npm start"));
  return lines;
}

function projectsBody(w, h) {
  const lines = [];
  lines.push(c(C.bold, "  # Projects"));
  lines.push(
    truncateAssemble(w, [[C.dim, "  " + "─".repeat(Math.max(1, w - 4))]]),
  );
  lines.push("");
  if (!state.projects.length) {
    lines.push(
      truncateAssemble(w, [
        [C.dim, "  No projects yet — /connect <path> to add."],
      ]),
    );
  }
  const maxVisible = Math.max(1, Math.floor((h - 8) / 3));
  state.projectSel = Math.min(
    Math.max(0, state.projectSel),
    Math.max(0, state.projects.length - 1),
  );
  const maxScroll = Math.max(0, state.projects.length - maxVisible);
  state.projectScroll = Math.min(Math.max(0, state.projectScroll), maxScroll);
  if (state.projectSel < state.projectScroll)
    state.projectScroll = state.projectSel;
  if (state.projectSel >= state.projectScroll + maxVisible) {
    state.projectScroll = state.projectSel - maxVisible + 1;
  }
  for (const [index, p] of state.projects
    .slice(state.projectScroll, state.projectScroll + maxVisible)
    .entries()) {
    const actualIndex = state.projectScroll + index;
    const active = p.id === state.projectId;
    const defaultProject = p.id === state.defaultProjectId;
    const missing = !p.path || !existsSync(p.path);
    lines.push(
      truncateAssemble(w, [
        [
          actualIndex === state.projectSel
            ? [C.cyan, C.bold]
            : active
              ? [C.green, C.bold]
              : C.dim,
          (actualIndex === state.projectSel
            ? "  ▸ "
            : active
              ? "  ● "
              : "  ○ ") + p.name,
        ],
        [
          C.dim,
          "  " +
            (p.path || "") +
            (defaultProject ? "  [default]" : "") +
            (missing ? "  [missing]" : ""),
        ],
      ]),
    );
    lines.push("");
  }
  lines.push(
    truncateAssemble(w, [
      [C.dim, "  W/S select · Enter active + default · Esc back · Ctrl+C exit"],
    ]),
  );
  lines.push(
    truncateAssemble(w, [
      [C.dim, "  /project <id|name>   type a project name or id"],
    ]),
  );
  lines.push(
    truncateAssemble(w, [
      [
        C.dim,
        "  /rename-project <id|name> <new name> · /remove-project <id|name>",
      ],
    ]),
  );
  return lines;
}

function skillsBody(w, h) {
  const lines = [];
  lines.push(c(C.bold, "  # Skills"));
  lines.push(
    truncateAssemble(w, [[C.dim, "  " + "─".repeat(Math.max(1, w - 4))]]),
  );
  lines.push("");
  if (!state.skills.length) {
    lines.push(truncateAssemble(w, [[C.dim, "  No skills registered."]]));
  }
  for (const s of state.skills) {
    const color = SKILL_COLORS[s.name] || C.cyan;
    lines.push(
      truncateAssemble(w, [
        [color, "  ◆ " + String(s.name || "?").toUpperCase()],
      ]),
    );
    lines.push(
      truncateAssemble(w, [[C.white, "    " + (s.description || "")]]),
    );
    if (s.tools?.length)
      lines.push(
        truncateAssemble(w, [[C.dim, "    tools: " + s.tools.join(", ")]]),
      );
    lines.push("");
  }
  return lines;
}

function helpBody(w, h) {
  const rows = [];
  const add = (cmd, desc) =>
    rows.push(
      truncateAssemble(w, [
        [C.cyan, "  " + cmd.padEnd(24)],
        ["", desc],
      ]),
    );
  rows.push(c(C.bold, "  # Commands"));
  rows.push("");
  add("/new", "start a fresh session");
  add("/open <id>", "attach to a session");
  add("/retry [id]", "re-run a task");
  add("/resume", "open the latest experiment");
  add("/queue", "show queued tasks");
  add("/history", "show previous tasks");
  add("/list", "recent experiments");
  add("/filter <status|all>", "filter experiments");
  add("/sort <newest|oldest|status>", "sort experiments");
  add("/cancel [id]", "cancel running task");
  add("/delete <id>", "delete an experiment");
  add("/connect [path]", "connect a folder");
  add("/projects", "list projects");
  add("/project <name>", "set active + default project");
  add("/rename-project <id|name> <name>", "rename a project");
  add("/remove-project <id|name>", "remove a project");
  add("/trust <1|2|3>", "change autonomy level");
  add("/check", "show active project, trust and task status");
  add("/skills", "list skills");
  add("/applyfix", "apply suggested fix");
  add("/rollback", "undo applied fix");
  add("/undo", "undo the last applied fix");
  rows.push("");
  rows.push(c(C.bold, "  # Skills"));
  rows.push("");
  add("/debug <task>", "force Debugging");
  add("/code <task>", "force Coding");
  add("/research <task>", "force Research");
  add("/brainstorm <task>", "force Brainstorming");
  add("/ui <task>", "force UI Analysis");
  rows.push("");
  rows.push(
    truncateAssemble(w, [
      [C.dim, "  Anything else becomes a task or follow-up."],
    ]),
  );
  return rows;
}

function checkBody(w, h) {
  const active = state.projects.find((p) => p.id === state.projectId);
  const defaultProject = state.projects.find(
    (p) => p.id === state.defaultProjectId,
  );
  const trustLabels = {
    1: "Suggest only",
    2: "Auto-fix low risk",
    3: "Full autonomous",
  };
  const menuRow = (index, label, value) =>
    truncateAssemble(w, [
      [
        index === state.checkSel ? [C.cyan, C.bold] : C.dim,
        index === state.checkSel ? "  ▸ " : "    ",
      ],
      [C.bold, label.padEnd(18)],
      [index === state.checkSel ? C.cyan : C.white, value],
    ]);
  const lines = [
    c(C.bold, "  # Workspace Check"),
    truncateAssemble(w, [[C.dim, "  " + "─".repeat(Math.max(1, w - 4))]]),
    "",
    truncateAssemble(w, [
      [C.bold, "  Backend       "],
      [
        state.backendOk ? C.green : C.red,
        state.backendOk ? "connected" : "offline",
      ],
      [C.dim, "  " + API],
    ]),
    truncateAssemble(w, [
      [C.bold, "  Trust level   "],
      [
        C.cyan,
        `${state.trustLevel} · ${trustLabels[state.trustLevel] || "unknown"}`,
      ],
    ]),
    truncateAssemble(w, [
      [C.bold, "  Active        "],
      [active ? C.green : C.dim, active ? active.name : "none"],
      [C.dim, active?.path ? "  " + active.path : ""],
    ]),
    truncateAssemble(w, [
      [C.bold, "  Default       "],
      [
        defaultProject ? C.green : C.dim,
        defaultProject ? defaultProject.name : "none",
      ],
      [C.dim, defaultProject?.path ? "  " + defaultProject.path : ""],
    ]),
    truncateAssemble(w, [
      [C.bold, "  Projects      "],
      [C.white, String(state.projects.length)],
    ]),
    truncateAssemble(w, [
      [C.bold, "  Health        "],
      [
        state.projectHealth?.exists === false ? C.red : C.green,
        state.projectHealth
          ? state.projectHealth.exists === false
            ? "missing"
            : `${state.projectHealth.totalFiles} files · ${state.projectHealth.gitClean ? "git clean" : "git changes"}`
          : "unavailable",
      ],
    ]),
    truncateAssemble(w, [
      [C.bold, "  Experiment    "],
      [
        state.exp ? statusColor(state.exp.status) : C.dim,
        state.exp ? `#${state.exp.id} · ${state.exp.status}` : "none",
      ],
    ]),
    truncateAssemble(w, [
      [C.bold, "  Build         "],
      [C.dim, modelInfo(state.exp || {})],
    ]),
    "",
    c(C.bold, "  # Change"),
    menuRow(
      0,
      "Trust level",
      `${state.trustLevel} · ${trustLabels[state.trustLevel]}`,
    ),
    menuRow(
      1,
      "Project",
      active ? `${active.name} (active)` : "choose project",
    ),
    menuRow(2, "Refresh", "reload workspace status"),
    "",
    truncateAssemble(w, [
      [C.dim, "  W/S select · Enter open · Esc back · Ctrl+C exit"],
    ]),
  ];
  return lines.slice(0, h);
}

function trustBody(w, h) {
  const options = [
    [1, "Suggest only", "No file edits, commands, or git actions."],
    [2, "Auto-fix low risk", "Safe edits and checks run automatically."],
    [3, "Full autonomous", "Edits and commands run without routine prompts."],
  ];
  const lines = [
    c(C.bold, "  # Trust Level"),
    truncateAssemble(w, [[C.dim, "  " + "─".repeat(Math.max(1, w - 4))]]),
    "",
  ];
  for (const [level, label, description] of options) {
    const selected = level === state.trustSel;
    lines.push(
      truncateAssemble(w, [
        [selected ? [C.cyan, C.bold] : C.dim, selected ? "  ▸ " : "    "],
        [selected ? C.cyan : C.white, `${level} · ${label}`],
      ]),
    );
    lines.push(truncateAssemble(w, [[C.dim, "      " + description]]));
    lines.push("");
  }
  if (state.pendingTrustLevel === 3) {
    lines.push(
      truncateAssemble(w, [
        [
          C.yellow,
          "  Level 3 requires confirmation. Press Y to apply or N to cancel.",
        ],
      ]),
    );
  }
  lines.push(
    truncateAssemble(w, [
      [C.dim, "  W/S select · Enter apply · Esc back · Ctrl+C exit"],
    ]),
  );
  return lines.slice(0, h);
}

function historyBody(w, h) {
  const lines = [
    c(C.bold, "  # Task History"),
    truncateAssemble(w, [[C.dim, "  " + "─".repeat(Math.max(1, w - 4))]]),
    "",
  ];
  if (!state.history.length)
    lines.push(truncateAssemble(w, [[C.dim, "  No tasks submitted yet."]]));
  state.history
    .slice()
    .reverse()
    .forEach((task, index) => {
      lines.push(
        truncateAssemble(w, [
          [C.cyan, `  ${String(index + 1).padStart(2)}  `],
          [C.white, task],
        ]),
      );
    });
  lines.push(
    "",
    truncateAssemble(w, [
      [C.dim, "  Esc back · Enter does not resubmit history"],
    ]),
  );
  return lines.slice(0, h);
}

function listBody(w, h) {
  const lines = [];
  lines.push(
    c(
      C.bold,
      `  # Experiments · ${state.experimentFilter} · ${state.experimentSort}`,
    ),
  );
  lines.push(
    truncateAssemble(w, [[C.dim, "  " + "─".repeat(Math.max(1, w - 4))]]),
  );
  lines.push("");
  if (!state.experiments.length) {
    lines.push(
      truncateAssemble(w, [
        [C.dim, "  No experiments yet — type a task below."],
      ]),
    );
    return lines;
  }
  lines.push(
    truncateAssemble(w, [
      [
        C.dim,
        "    ID   STATUS         PROJECT          SKILL        AGE   TASK",
      ],
    ]),
  );
  const maxVisible = Math.max(1, h - 5);
  state.sel = Math.min(Math.max(0, state.sel), state.experiments.length - 1);
  const maxPanelScroll = Math.max(0, state.experiments.length - maxVisible);
  state.panelScroll = Math.min(
    Math.max(0, state.panelScroll || 0),
    maxPanelScroll,
  );
  if (state.sel < state.panelScroll) state.panelScroll = state.sel;
  if (state.sel >= state.panelScroll + maxVisible) {
    state.panelScroll = state.sel - maxVisible + 1;
  }
  const visibleExperiments = state.experiments.slice(
    state.panelScroll,
    state.panelScroll + maxVisible,
  );
  visibleExperiments.forEach((e, i) => {
    const index = state.panelScroll + i;
    const project = state.projects.find((p) => p.id === e.projectId);
    const skill = String(e.skill || "general").replace(/_/g, " ");
    const task = String(e.task || "").replace(/\s+/g, " ");
    lines.push(
      truncateAssemble(w, [
        [
          index === state.sel ? C.cyan : C.dim,
          index === state.sel ? "▸ " : "  ",
        ],
        [C.cyan, String(e.id).padStart(4).padEnd(7)],
        [statusColor(e.status), String(e.status).padEnd(15)],
        [
          C.white,
          String(project?.name || "-")
            .slice(0, 16)
            .padEnd(18),
        ],
        [C.dim, skill.slice(0, 12).padEnd(14)],
        [C.dim, timeAgo(e.createdAt).padEnd(6)],
        [C.white, task.slice(0, Math.max(10, w - 78))],
      ]),
    );
  });
  lines.push("");
  lines.push(
    truncateAssemble(w, [
      [C.dim, "  W/S to select · Enter to open · /filter · /sort · /resume"],
    ]),
  );
  return lines;
}

function mainBody(w, h) {
  if (state.view === "projects") return projectsBody(w, h);
  if (state.view === "skills") return skillsBody(w, h);
  if (state.view === "help") return helpBody(w, h);
  if (state.view === "check") return checkBody(w, h);
  if (state.view === "history") return historyBody(w, h);
  if (state.view === "list") return listBody(w, h);
  if (state.backendOk === false && !state.exp) return errorBody(w, h);
  return chatBody(w, h);
}

function panelBody(w, h) {
  if (state.panelView === "projects") return projectsBody(w, h);
  if (state.panelView === "skills") return skillsBody(w, h);
  if (state.panelView === "help") return helpBody(w, h);
  return listBody(w, h);
}

function panelOverlay(cols, bodyH) {
  if (!state.panelOpen) return null;
  const panelW = Math.min(Math.max(48, cols - 8), 78);
  const panelH = Math.min(Math.max(1, bodyH), 24);
  const innerW = panelW - 4;
  const innerH = Math.max(0, panelH - 5);
  const content = panelBody(innerW, innerH).slice(0, innerH);
  while (content.length < innerH) content.push("");
  const panelTitle = "  Hermes panel";
  const panelHint = "Esc close  ";
  const panelHeader =
    "│" +
    panelTitle +
    " ".repeat(Math.max(1, panelW - 2 - panelTitle.length - panelHint.length)) +
    panelHint +
    "│";
  const rows = [
    "╭" + "─".repeat(panelW - 2) + "╮",
    truncateAssemble(panelW, [[C.bold, panelHeader]]),
    panelTabs(panelW),
    "├" + "─".repeat(panelW - 2) + "┤",
  ];
  for (const line of content) {
    const text = plainText(line).slice(0, innerW).padEnd(innerW);
    rows.push(
      truncateAssemble(panelW, [
        [C.dim, "│ "],
        [C.white, text],
        [C.dim, " │"],
      ]),
    );
  }
  rows.push("╰" + "─".repeat(panelW - 2) + "╯");
  const top = Math.max(0, Math.floor((bodyH - rows.length) / 2));
  const left = Math.max(0, Math.floor((cols - panelW) / 2));
  return rows.map(
    (line) =>
      " ".repeat(left) + line + " ".repeat(Math.max(0, cols - left - panelW)),
  );
}

function slashPopup(cols, maxRows = 10) {
  if (!state.slash?.list.length) return [];
  const itemCount = Math.max(1, Math.min(6, maxRows - 5));
  const total = state.slash.list.length;
  state.slash.sel = Math.min(Math.max(0, state.slash.sel), total - 1);
  const maxScroll = Math.max(0, total - itemCount);
  state.slashScroll = Math.min(Math.max(0, state.slashScroll || 0), maxScroll);
  if (state.slash.sel < state.slashScroll) state.slashScroll = state.slash.sel;
  if (state.slash.sel >= state.slashScroll + itemCount) {
    state.slashScroll = state.slash.sel - itemCount + 1;
  }
  const items = state.slash.list.slice(
    state.slashScroll,
    state.slashScroll + itemCount,
  );
  const query = state.input.match(/\/([a-zA-Z-]*)$/)?.[1] || "";
  const itemLen = (it) => 5 + it.name.length + 2 + it.desc.length;
  const boxW = Math.min(
    cols - 8,
    Math.max(40, Math.max(...items.map(itemLen)) + 4),
  );
  const left = Math.max(1, Math.floor((cols - boxW) / 2));
  const line = (s) => {
    const plain = plainText(s);
    return (
      " ".repeat(left) + s + " ".repeat(Math.max(0, cols - left - plain.length))
    );
  };
  const popupRow = (text, style = C.gray) => {
    const inner = plainText(text)
      .slice(0, boxW - 4)
      .padEnd(boxW - 4);
    return line(c(style, "│ " + inner + " │"));
  };
  const rows = [];
  rows.push(
    line(c(C.dim, "╭") + c(C.dim, "─".repeat(boxW - 2)) + c(C.dim, "╮")),
  );
  const title = `  COMMANDS  /${query}`;
  rows.push(popupRow(title, [C.cyan, C.bold]));
  rows.push(
    line(c(C.dim, "│") + c(C.dim, "─".repeat(boxW - 2)) + c(C.dim, "│")),
  );
  for (const [i, it] of items.entries()) {
    const index = state.slashScroll + i;
    const sel = index === state.slash.sel;
    const inner = (sel ? "▸ " : "  ") + "/" + it.name.padEnd(14) + it.desc;
    rows.push(popupRow(inner, sel ? [C.orange, C.bold] : C.gray));
  }
  rows.push(popupRow("  ↑/↓ move · Enter · Esc close", C.gray));
  rows.push(
    line(c(C.dim, "╰") + c(C.dim, "─".repeat(boxW - 2)) + c(C.dim, "╯")),
  );
  return rows;
}

function composerRows(cols) {
  const CW = Math.max(10, Math.min(cols - 10, 80));
  const left = Math.max(1, Math.floor((cols - CW) / 2));
  const line = (s) =>
    " ".repeat(left) + s + " ".repeat(Math.max(0, cols - left - s.length));
  const fill = CW - 2;
  const rows = [];
  rows.push(line(c(C.dim, "╭") + c(C.dim, "─".repeat(CW - 2)) + c(C.dim, "╮")));
  const placeholder = state.exp
    ? "Type a message..."
    : 'Ask anything... "Fix a TODO in the codebase"';
  const maxIn = Math.max(4, CW - 8);
  const visible =
    state.input.length > maxIn
      ? "…" + state.input.slice(state.input.length - maxIn + 1)
      : state.input;
  const text = visible || placeholder;
  state._caretCol = left + 3 + visible.length;
  const inputRow =
    "│ " +
    c(visible ? [] : C.dim, text) +
    " ".repeat(Math.max(1, fill - 1 - text.length)) +
    "│";
  rows.push(line(inputRow));
  const expStatus = state.exp?.status;
  const status =
    state.loading || expStatus === "running"
      ? {
          label: `${SPIN[Math.floor(Date.now() / 120) % SPIN.length]} WORKING`,
          color: C.yellow,
        }
      : expStatus === "needs_approval"
        ? { label: "! APPROVAL NEEDED", color: C.yellow }
        : expStatus === "failed"
          ? { label: "× FAILED · retry available", color: C.red }
          : expStatus === "cancelled"
            ? { label: "■ CANCELLED", color: C.yellow }
            : expStatus === "completed"
              ? { label: "✓ DONE · reply to continue", color: C.green }
              : { label: "● READY", color: C.green };
  rows.push(
    line(
      "│ " +
        " ".repeat(Math.max(1, fill - 1 - status.label.length)) +
        c(status.color, status.label) +
        "│",
    ),
  );
  const modelLine = state.exp
    ? modelInfo(state.exp)
    : "Build · DeepSeek V4 Flash Free · OpenCode Zen · max";
  rows.push(
    line(
      "│ " +
        c(C.gray, modelLine) +
        " ".repeat(Math.max(1, fill - 1 - modelLine.length)) +
        "│",
    ),
  );
  rows.push(line(c(C.dim, "╰") + c(C.dim, "─".repeat(CW - 2)) + c(C.dim, "╯")));
  return rows;
}

function statusLine(cols) {
  const proj = state.projects.find((p) => p.id === state.projectId);
  const left = [["", "│ "]];
  if (proj) {
    left.push(
      [C.cyan, "project · " + proj.name],
      [C.dim, "  " + (proj.path || "")],
    );
  } else {
    left.push([
      C.dim,
      state.backendOk === false
        ? "backend offline"
        : "no project — /connect <path>",
    ]);
  }
  const right = [];
  right.push(
    state.backendOk === false
      ? [C.red, "backend ×"]
      : state.backendOk === true
        ? [C.green, "backend ●"]
        : [C.dim, "backend …"],
  );
  right.push([C.dim, "  / to commands"]);
  const leftRaw = left.reduce((a, [, t]) => a + t.length, 0);
  const rightRaw = right.reduce((a, [, t]) => a + t.length, 0);
  const gap = Math.max(2, cols - leftRaw - rightRaw);
  return truncateAssemble(cols, [...left, ["", " ".repeat(gap)], ...right]);
}

export function buildScreen(rows, cols) {
  const out = [];
  const header = headerBlock(cols);
  const headerH = header.length;
  const tabs = tabBar(cols);
  const bodyH = Math.max(2, rows - 6 - headerH - 2);
  const body = mainBody(cols, bodyH).map((l) => l.slice(0, cols));
  while (body.length < bodyH) body.push("");
  const popup = slashPopup(cols, bodyH);
  if (popup.length) {
    const start = Math.max(0, bodyH - popup.length);
    for (let i = 0; i < popup.length; i++) body[start + i] = popup[i];
  }
  if (state.status && body.length)
    body[0] = c(C.dim, String(state.status).slice(0, cols));
  const panel = panelOverlay(cols, bodyH);
  if (panel) {
    const top = Math.max(0, Math.floor((bodyH - panel.length) / 2));
    for (let i = 0; i < panel.length; i++) body[top + i] = panel[i];
  }
  out.push(...header);
  out.push(tabs);
  out.push(
    truncateAssemble(cols, [[C.dim, "  " + "─".repeat(Math.max(1, cols - 4))]]),
  );
  out.push(...body);
  out.push(...composerRows(cols));
  out.push(statusLine(cols));
  return out.map((line) => fitLine(line, cols));
}

function renderFrame() {
  if (!TTY || state.quitting) return;
  const rows = stdout.rows || 24;
  const cols = stdout.columns || 80;
  const lines = buildScreen(rows, cols);
  const caretCol = state._caretCol || 2;
  const out =
    "\x1b[?25l\x1b[2J\x1b[H" +
    lines.join("\n") +
    `\x1b[${rows - 4};${caretCol}H\x1b[?25h`;
  stdout.write(out);
}

function updateSlash() {
  const m = state.input.match(/(^|\s)\/([a-zA-Z-]*)$/);
  if (!m) {
    state.slash = null;
    state.slashScroll = 0;
    return;
  }
  const prefix = m[2].toLowerCase();
  const list = SLASH_COMMANDS.filter((x) => x.name.startsWith(prefix));
  state.slash = list.length ? { list, sel: 0 } : null;
  state.slashScroll = 0;
}

async function submitTask(raw) {
  const task = String(raw || "").trim();
  if (!task) return;
  state.follow = true;
  state.scroll = 0;
  if (task.startsWith("/")) {
    await runCommand(task);
    return;
  }
  if (state.exp) {
    if (["running", "needs_approval"].includes(state.exp.status)) {
      state.taskQueue.push(task);
      state.history.push(task);
      if (state.history.length > 100) state.history.shift();
      state.status = `Queued task ${state.taskQueue.length}: ${task}`;
      return;
    }
    state.loading = true;
    state.error = "";
    state.status = "";
    state.questions = null;
    try {
      await replyExp(state.currentConversationId || state.exp.id, task);
    } finally {
      state.loading = false;
    }
    return;
  }
  state.loading = true;
  state.error = "";
  state.status = "";
  state.questions = null;
  renderFrame();
  try {
    if (state.exp) {
      const prev = state.exp;
      const msgs = prev.messages?.length ? [...prev.messages] : [];

      if (!msgs.some((m) => m.role === "user") && prev.task) {
        msgs.unshift({
          role: "user",
          content: prev.task,
          createdAt: prev.createdAt,
        });
      }

      if (!msgs.some((m) => m.role === "assistant") && prev.answer) {
        msgs.push({
          role: "assistant",
          content: prev.answer,
          createdAt: prev.completedAt,
        });
      }
      if (msgs.length) state.chatHistory.push({ ...prev, messages: msgs });
    }
    const body = { task };
    if (state.projectId) body.projectId = state.projectId;
    if (state.previousConversationId) {
      body.previousConversationId = state.previousConversationId;
      state.previousConversationId = null;
    }
    const created = await api("/api/experiments", {
      method: "POST",
      body: JSON.stringify(body),
    });
    const exp = await api(`/api/experiments/${created.id}`);
    state.exp = exp;
    state.currentConversationId = exp.id;
    state.view = "chat";
    state.follow = true;
    state.sel = 0;
    watchExp(exp.id);
  } catch (err) {
    state.error = err.message;
    state.status = err.message;
  } finally {
    state.loading = false;
  }
}

async function drainTaskQueue() {
  if (!state.taskQueue.length || state.loading) return;
  const next = state.taskQueue.shift();
  state.exp = null;
  state.currentConversationId = null;
  await submitTask(next);
}

async function replyExp(id, message) {
  try {
    const existingMessages = messagesOf(state.exp || {});
    state.exp = {
      ...(state.exp || {}),
      id,
      status: "running",
      messages: [
        ...existingMessages,
        { role: "user", content: message, createdAt: Date.now() },
      ],
    };
    state.follow = true;
    state.scroll = 0;
    renderFrame();
    await api(`/api/experiments/${id}/reply`, {
      method: "POST",
      body: JSON.stringify({ message }),
    });
    state.exp = { ...(state.exp || {}), id, status: "running" };
    state.currentConversationId = id;
    state.view = "chat";
    state.follow = true;
    watchExp(id);
  } catch (err) {
    state.status = err.message;
  }
}

async function retryExp(id) {
  try {
    const exp = await api(`/api/experiments/${id}`);
    await api(`/api/experiments/${id}/reply`, {
      method: "POST",
      body: JSON.stringify({ message: exp.task }),
    });
    state.exp = { ...exp, status: "running" };
    state.currentConversationId = id;
    state.view = "chat";
    state.follow = true;
    watchExp(id);
  } catch (err) {
    state.status = err.message;
  }
}

async function cancelExp(id) {
  try {
    await api(`/api/experiments/${id}/cancel`, { method: "POST" });
    if (state.exp?.id === id) state.exp = { ...state.exp, status: "cancelled" };
    state.status = `Cancelled #${id}.`;
    await loadExperiments();
  } catch (err) {
    state.status = err.message;
  }
}

async function openExp(id) {
  const exp = await api(`/api/experiments/${id}`).catch(() => null);
  if (!exp) {
    state.status = `#${id} not found.`;
    return;
  }
  state.exp = exp;
  state.currentConversationId = exp.id;
  state.view = "chat";
  state.follow = true;
  if (["running", "needs_approval"].includes(exp.status)) watchExp(exp.id);
}

async function runCommand(line) {
  const [cmd, ...rest] = line.split(/\s+/);
  const arg = rest.join(" ").trim();
  try {
    switch (cmd) {
      case "/new":
        state.previousConversationId = state.currentConversationId;
        state.exp = null;
        state.currentConversationId = null;
        state.chatHistory = [];
        state.view = "chat";
        state.questions = null;
        state.status = "New session — type a task below.";
        break;
      case "/list":
        await loadExperiments();
        state.view = "list";
        break;
      case "/open":
        if (!arg) {
          state.status = "Usage: /open <id>";
          break;
        }
        await openExp(arg);
        break;
      case "/resume": {
        await loadExperiments();
        const latest = state.experiments.find((experiment) =>
          state.projectId ? experiment.projectId === state.projectId : true,
        );
        if (!latest) {
          state.status = "No experiment available to resume.";
          break;
        }
        await openExp(latest.id);
        break;
      }
      case "/queue":
        state.status = state.taskQueue.length
          ? `${state.taskQueue.length} task(s) queued.`
          : "No tasks queued.";
        break;
      case "/history":
        state.view = "history";
        break;
      case "/filter": {
        const filter = arg.toLowerCase() || "all";
        const valid = [
          "all",
          "running",
          "completed",
          "failed",
          "cancelled",
          "needs_approval",
        ];
        if (!valid.includes(filter)) {
          state.status =
            "Usage: /filter <all|running|completed|failed|cancelled|needs_approval>";
          break;
        }
        state.experimentFilter = filter;
        state.sel = 0;
        await loadExperiments();
        state.view = "list";
        state.status = `Experiment filter: ${filter}`;
        break;
      }
      case "/sort": {
        const sort = arg.toLowerCase() || "newest";
        if (!["newest", "oldest", "status"].includes(sort)) {
          state.status = "Usage: /sort <newest|oldest|status>";
          break;
        }
        state.experimentSort = sort;
        state.sel = 0;
        await loadExperiments();
        state.view = "list";
        state.status = `Experiment sort: ${sort}`;
        break;
      }
      case "/retry":
        await retryExp(arg || state.exp?.id || null);
        break;
      case "/cancel":
        if (!arg && !state.exp?.id) {
          state.status = "Usage: /cancel [id]";
          break;
        }
        await cancelExp(arg || state.exp.id);
        break;
      case "/delete": {
        const id = arg || state.exp?.id;
        if (!id) {
          state.status = "Usage: /delete <id>";
          break;
        }
        await api(`/api/experiments/${id}`, { method: "DELETE" });
        if (state.exp?.id === id) state.exp = null;
        await loadExperiments();
        state.status = `Deleted #${id}.`;
        break;
      }
      case "/connect": {
        const cp = path.normalize(arg ? path.resolve(arg) : process.cwd());
        let st;
        try {
          st = await fsPromises.stat(cp);
        } catch {
          state.status = `Not found: ${cp}`;
          break;
        }
        if (!st.isDirectory()) {
          state.status = `Not a folder: ${cp}`;
          break;
        }
        await loadProjects();
        const ex = state.projects.find((p) => path.normalize(p.path) === cp);
        if (ex) {
          state.projectId = ex.id;
          await api("/api/settings", {
            method: "PUT",
            body: JSON.stringify({ defaultProjectId: ex.id }),
          });
          state.defaultProjectId = ex.id;
          state.status = `Active + default: ${ex.name}`;
          break;
        }
        const np = await api("/api/projects", {
          method: "POST",
          body: JSON.stringify({ name: path.basename(cp), path: cp }),
        });
        if (!np?.id) {
          state.status =
            "Project connection failed: backend returned no project id.";
          break;
        }
        state.projectId = np.id;
        await api("/api/settings", {
          method: "PUT",
          body: JSON.stringify({ defaultProjectId: np.id }),
        });
        state.defaultProjectId = np.id;
        await loadProjects();
        state.status = `Connected + default: ${np.name}`;
        try {
          const s = await api("/api/settings");
          if (s.trustLevel < 2)
            await api("/api/settings", {
              method: "PUT",
              body: JSON.stringify({ trustLevel: 2 }),
            });
        } catch {}
        break;
      }
      case "/projects":
        await loadProjects();
        state.view = "projects";
        break;
      case "/project": {
        if (!arg) {
          state.status = "Usage: /project <id|name>";
          break;
        }
        await loadProjects();
        const p = state.projects.find(
          (x) => x.id === arg || x.name.toLowerCase() === arg.toLowerCase(),
        );
        if (!p) {
          state.status = `No match: "${arg}"`;
          break;
        }
        state.projectId = p.id;
        await api("/api/settings", {
          method: "PUT",
          body: JSON.stringify({ defaultProjectId: p.id }),
        });
        state.defaultProjectId = p.id;
        state.status = `Active + default: ${p.name}`;
        break;
      }
      case "/rename-project": {
        const parts = arg.split(/\s+/);
        const key = parts.shift();
        const name = parts.join(" ").trim();
        if (!key || !name) {
          state.status = "Usage: /rename-project <id|name> <new name>";
          break;
        }
        await loadProjects();
        const p = state.projects.find(
          (project) =>
            project.id === key ||
            project.name.toLowerCase() === key.toLowerCase(),
        );
        if (!p) {
          state.status = `No project matches: "${key}"`;
          break;
        }
        const updated = await api(`/api/projects/${p.id}`, {
          method: "PUT",
          body: JSON.stringify({ name }),
        });
        await loadProjects();
        state.status = `Renamed project: ${updated.name}`;
        break;
      }
      case "/remove-project": {
        if (!arg) {
          state.status = "Usage: /remove-project <id|name>";
          break;
        }
        await loadProjects();
        const p = state.projects.find(
          (project) =>
            project.id === arg ||
            project.name.toLowerCase() === arg.toLowerCase(),
        );
        if (!p) {
          state.status = `No project matches: "${arg}"`;
          break;
        }
        await api(`/api/projects/${p.id}`, { method: "DELETE" });
        if (state.projectId === p.id) state.projectId = null;
        if (state.defaultProjectId === p.id) state.defaultProjectId = null;
        await loadProjects();
        state.status = `Removed project: ${p.name}`;
        break;
      }
      case "/trust": {
        const level = Number(arg);
        if (![1, 2, 3].includes(level)) {
          state.status = "Usage: /trust <1|2|3>";
          break;
        }
        if (level === 3 && state.trustLevel !== 3) {
          state.pendingTrustLevel = 3;
          state.status =
            "Level 3 enables autonomous edits and commands. Press Y to confirm or N to cancel.";
          break;
        }
        await applyTrustLevel(level);
        break;
      }
      case "/skills":
        await loadSkills();
        state.view = "skills";
        break;
      case "/help":
        state.view = "help";
        break;
      case "/check":
        await Promise.all([loadProjects(), loadSettings()]);
        await loadProjectHealth();
        state.view = "check";
        state.status = "Workspace status refreshed.";
        break;
      case "/applyfix":
        if (!state.exp) {
          state.status = "No experiment open.";
          break;
        }
        await api(`/api/experiments/${state.exp.id}/apply-fix`, {
          method: "POST",
        });
        state.status = "Fix applied — /rollback to undo.";
        break;
      case "/rollback":
      case "/undo":
        if (!state.exp) {
          state.status = "No experiment open.";
          break;
        }
        await api(`/api/experiments/${state.exp.id}/rollback`, {
          method: "POST",
        });
        state.status = "Rolled back.";
        break;
      case "/debug":
      case "/code":
      case "/research":
      case "/brainstorm":
      case "/ui":
        if (!arg) {
          state.status = `Usage: ${cmd} <task>`;
          break;
        }
        await submitTask(arg);
        break;
      case "/quit":
      case "/exit":
      case "/q":
        cleanExit();
        break;
      default:
        state.status = `Unknown: ${cmd} — try /help`;
    }
  } catch (err) {
    state.status = err.message;
  }
}

async function handleKey(k) {
  if (state.quitting) return;
  if (k === "ctrl-c") {
    const e = state.exp;
    if (e && (e.status === "running" || e.status === "needs_approval"))
      await cancelExp(e.id);
    else cleanExit();
    return;
  }
  if (k === "ctrl-d") {
    cleanExit();
    return;
  }
  if (state.slash && state.slash.list.length) {
    if (k === "up" || k === "k") {
      state.slash.sel =
        (state.slash.sel - 1 + state.slash.list.length) %
        state.slash.list.length;
      return;
    }
    if (k === "down" || k === "j") {
      state.slash.sel = (state.slash.sel + 1) % state.slash.list.length;
      return;
    }
    if (k === "enter" || k === "tab") {
      const cmd = state.slash.list[state.slash.sel];
      const m = state.input.match(/(^|\s)\/[a-zA-Z-]*$/);
      if (m && cmd) {
        state.input = state.input.slice(0, m.index + m[1].length) + cmd.insert;
        state.histIndex = -1;
      }
      state.slash = null;
      return;
    }
    if (k === "escape") {
      state.slash = null;
      return;
    }
  }
  if (state.questions && ["1", "2", "3"].includes(k)) {
    const opt = state.questions[Number(k) - 1];
    state.questions = null;
    if (opt && state.exp) {
      state.qAnswered[state.exp.id] = true;
      await replyExp(state.exp.id, opt.replace(" (Recommended)", ""));
    }
    return;
  }
  if (state.pendingTrustLevel === 3 && !state.input) {
    if (k === "y") {
      await applyTrustLevel(3);
      return;
    }
    if (k === "n" || k === "escape") {
      state.pendingTrustLevel = null;
      state.status = "Trust level change cancelled.";
      return;
    }
  }
  if (k === "escape") {
    if (state.view === "trust") {
      state.view = "check";
      return;
    }
    if (state.view === "check") {
      state.view = "chat";
      return;
    }
    if (state.view !== "chat") {
      state.view = "chat";
      state.panelOpen = false;
      return;
    }
    if (state.panelOpen) {
      state.panelOpen = false;
      return;
    }
    if (state.exp && ["running", "needs_approval"].includes(state.exp.status)) {
      await cancelExp(state.exp.id);
      return;
    }
    state.slash = null;
    state.questions = null;
    state.input = "";
    state.histIndex = -1;
    return;
  }
  if (!state.input && state.view === "check") {
    if (k === "up" || k === "down" || k === "w" || k === "s") {
      state.checkSel =
        (state.checkSel + (k === "up" || k === "w" ? -1 : 1) + 3) % 3;
      return;
    }
    if (k === "enter") {
      if (state.checkSel === 0) {
        state.trustSel = state.trustLevel;
        state.view = "trust";
      } else if (state.checkSel === 1) {
        state.view = "projects";
        state.projectSel = 0;
        state.projectScroll = 0;
      } else {
        await runCommand("/check");
      }
      return;
    }
    if (k === "p") {
      state.view = "projects";
      state.projectSel = 0;
      state.projectScroll = 0;
      return;
    }
    if (["1", "2", "3"].includes(k)) {
      await runCommand(`/trust ${k}`);
      return;
    }
  }
  if (!state.input && state.view === "trust") {
    if (k === "up" || k === "down" || k === "w" || k === "s") {
      state.trustSel =
        ((state.trustSel - 1 + (k === "up" || k === "w" ? -1 : 1) + 3) % 3) + 1;
      return;
    }
    if (k === "enter") {
      await runCommand(`/trust ${state.trustSel}`);
      state.view = "check";
      return;
    }
    if (["1", "2", "3"].includes(k)) {
      state.trustSel = Number(k);
      return;
    }
  }
  if (!state.input && ["1", "2", "3", "4", "5"].includes(k)) {
    if (state.panelOpen) {
      const panelViews = ["list", "projects", "skills", "help"];
      state.panelView =
        panelViews[Math.min(Number(k) - 1, panelViews.length - 1)];
      state.panelScroll = 0;
      return;
    }
    const views = ["chat", "list", "projects", "skills", "help"];
    state.view = views[Number(k) - 1];
    state.sel = 0;
    state.follow = true;
    return;
  }
  if (k === "tab") {
    if (!state.panelOpen) {
      state.panelOpen = true;
      state.panelView = "list";
      state.panelScroll = 0;
      state.view = "chat";
    } else {
      const panelViews = ["list", "projects", "skills", "help"];
      state.panelView =
        panelViews[
          (panelViews.indexOf(state.panelView) + 1) % panelViews.length
        ];
      state.panelScroll = 0;
    }
    return;
  }
  if (state.panelOpen && (k === "left" || k === "right")) {
    const panelViews = ["list", "projects", "skills", "help"];
    const offset = k === "left" ? -1 : 1;
    state.panelView =
      panelViews[
        (panelViews.indexOf(state.panelView) + offset + panelViews.length) %
          panelViews.length
      ];
    return;
  }
  if (k === "enter") {
    if (state.view === "trust" && !state.input) {
      await runCommand(`/trust ${state.trustSel}`);
      if (!state.pendingTrustLevel) state.view = "check";
      return;
    }
    if (state.view === "check" && !state.input) {
      state.view = "trust";
      state.trustSel = state.trustLevel;
      return;
    }
    if (state.panelOpen && state.panelView === "list" && !state.input) {
      const selected = state.experiments[state.sel];
      if (selected) {
        state.panelOpen = false;
        await openExp(selected.id);
      }
      return;
    }
    if (state.panelOpen && state.panelView === "projects" && !state.input) {
      const selected = state.projects[state.projectSel];
      if (selected) await chooseProject(selected);
      return;
    }
    const text = state.input;
    if (text.trim().startsWith("/")) {
      state.input = "";
      state.slash = null;
      state.questions = null;
      await runCommand(text.trim());
    } else if (text.trim()) {
      state.history.push(text.trim());
      if (state.history.length > 100) state.history.shift();
      state.input = "";
      state.histIndex = -1;
      state.slash = null;
      state.questions = null;
      await submitTask(text);
    } else if (state.view === "list") {
      const e = state.experiments[state.sel];
      if (e) await openExp(e.id);
    } else if (state.view === "projects") {
      const project = state.projects[state.projectSel];
      if (project) await chooseProject(project);
    }
    return;
  }
  if ((k === "up" || k === "down" || k === "w" || k === "s") && !state.input) {
    if (state.panelOpen) {
      if (state.panelView === "list") {
        const n = state.experiments.length;
        if (n)
          state.sel = (state.sel + (k === "up" || k === "w" ? -1 : 1) + n) % n;
      } else if (state.panelView === "projects") {
        const n = state.projects.length;
        if (n)
          state.projectSel =
            (state.projectSel + (k === "up" || k === "w" ? -1 : 1) + n) % n;
      }
      return;
    }
    if (state.view === "list") {
      const n = state.experiments.length;
      if (n)
        state.sel = (state.sel + (k === "up" || k === "w" ? -1 : 1) + n) % n;
      return;
    }
    if (state.view === "projects") {
      const n = state.projects.length;
      if (n)
        state.projectSel =
          (state.projectSel + (k === "up" || k === "w" ? -1 : 1) + n) % n;
      return;
    }
    if (state.view === "chat" && state.exp) {
      state.follow = false;
      state.scroll = Math.max(
        0,
        (state.scroll || 0) + (k === "up" || k === "w" ? -3 : 3),
      );
    }
    return;
  }
  if ((k === "up" || k === "down") && state.input) {
    if (k === "up" && state.histIndex < state.history.length - 1) {
      state.histIndex++;
      state.input = state.history[state.history.length - 1 - state.histIndex];
    } else if (k === "down" && state.histIndex > 0) {
      state.histIndex--;
      state.input = state.history[state.history.length - 1 - state.histIndex];
    } else if (k === "down" && state.histIndex === 0) {
      state.histIndex = -1;
      state.input = "";
    }
    return;
  }
  if (
    state.view === "chat" &&
    state.exp?.status === "needs_approval" &&
    ["a", "t", "d"].includes(k)
  ) {
    const p = state.exp.agent?.pending;
    if (p) {
      const decision =
        k === "a" ? "allow_once" : k === "t" ? "allow_task" : "deny";
      try {
        await api(`/api/experiments/${state.exp.id}/approve`, {
          method: "POST",
          body: JSON.stringify({ approvalId: p.approvalId, decision }),
        });
        state.status = decision === "deny" ? "Denied." : "Allowed — resuming…";
      } catch (err) {
        state.status = err.message;
      }
    }
    return;
  }
  if (k === "backspace") {
    state.input = state.input.slice(0, -1);
    state.histIndex = -1;
    updateSlash();
    return;
  }
  if (k.length === 1) {
    state.input += k;
    state.histIndex = -1;
    updateSlash();
    return;
  }
}

const watching = new Set();
async function watchExp(id) {
  if (watching.has(id)) return;
  watching.add(id);
  try {
    while (watching.has(id)) {
      await sleep(POLL_MS);
      if (!watching.has(id)) break;
      const exp = await api(`/api/experiments/${id}`).catch(() => null);
      if (!exp) continue;
      state.exp = exp;
      const idx = state.experiments.findIndex((e) => e.id === exp.id);
      if (idx >= 0) state.experiments[idx] = exp;
      renderFrame();
      if (["completed", "failed", "cancelled"].includes(exp.status)) {
        await loadExperiments();
        watching.delete(id);
        await drainTaskQueue();
        break;
      }
    }
  } catch {
    watching.delete(id);
  }
}

function cleanExit() {
  if (state.quitting) return;
  state.quitting = true;
  try {
    stdin.setRawMode(false);
  } catch {}
  stdout.write(
    state.screenActive
      ? "\x1b[?25h\x1b[0m\x1b[?1049l"
      : "\x1b[?25h\x1b[0m\x1b[2J\x1b[H",
  );
  exit(0);
}
process.on("SIGINT", () => cleanExit());
process.on("SIGTERM", () => cleanExit());

export async function runTui() {
  if (!TTY) {
    console.log("Hermes TUI needs an interactive terminal.");
    return;
  }
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding("utf8");
  stdout.write("\x1b[?1049h\x1b[2J\x1b[H");
  state.screenActive = true;
  renderFrame();
  await ensureBackend();
  await Promise.all([
    loadExperiments(),
    loadProjects(),
    loadSkills(),
    loadSettings(),
  ]);
  detectProjectFromCwd();
  if (!state.backendOk) state.status = state.backendMsg;
  renderFrame();
  stdout.on("resize", () => renderFrame());
  setInterval(() => {
    if (
      !state.quitting &&
      (state.exp?.status === "running" ||
        state.loading ||
        state.backendOk === false)
    )
      renderFrame();
  }, 150);
  const keyQueue = [];
  let draining = false;
  stdin.on("data", (buf) => {
    keyQueue.push(...parseKeys(buf));
    if (!draining) {
      draining = true;
      drain();
    }
  });
  async function drain() {
    while (keyQueue.length && !state.quitting) {
      const k = keyQueue.shift();
      try {
        await handleKey(k);
      } catch (err) {
        state.status = err.message;
      }
      renderFrame();
    }
    draining = false;
  }
}

let isMain = false;
try {
  if (process.argv[1])
    isMain =
      pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
} catch {}
if (isMain) runTui();
