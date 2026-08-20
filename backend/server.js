import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs/promises";
import { exec } from "child_process";
import { brainstorm } from "./brainstorm.js";
import { createRouter } from "./aiProviders.js";
import {
  scanVault,
  searchNotes,
  pickRelevant,
  makeVaultId,
} from "./knowledge.js";
import {
  readBridgeConfig,
  writeBridgeConfig,
  testBridge,
  callAgentApi,
  buildHandoffSystem,
  buildHandoffUser,
  snapshotProject,
  diffSnapshots,
} from "./bridge.js";
import {
  initHermes,
  getSkills,
  getTools,
  previewRoute,
  getHermesStatus,
  processTask,
} from "./hermes.js";
import { registerSkillRoutes } from "./routes/skills.js";
import { broadcaster } from "./ws.js";
import { routeTask } from "./skills/index.js";
import { autoLearn, getMemoryStats } from "./memory.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, ".env") });
const DATA_DIR = path.join(__dirname, "data");
const EXPERIMENTS_FILE = path.join(DATA_DIR, "experiments.json");
const PROJECTS_FILE = path.join(DATA_DIR, "projects.json");
const MEMORY_FILE = path.join(DATA_DIR, "memory.json");
const SETTINGS_FILE = path.join(DATA_DIR, "settings.json");
const BRAINSTORM_FILE = path.join(DATA_DIR, "brainstorm.json");
const KNOWLEDGE_FILE = path.join(DATA_DIR, "knowledge.json");

const app = express();
app.use(cors());
app.use(express.json({ limit: "12mb" }));
app.use("/api/uploads", express.static(path.join(DATA_DIR, "uploads")));

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  "__pycache__",
  ".venv",
  "venv",
  ".cache",
  "coverage",
  ".vscode",
  ".idea",
]);

const TEXT_EXT = new Set([
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".html",
  ".htm",
  ".xhtml",
  ".css",
  ".scss",
  ".sass",
  ".vue",
  ".svelte",
  ".astro",

  ".json",
  ".md",
  ".markdown",
  ".txt",
  ".csv",
  ".tsv",
  ".xml",
  ".xsd",
  ".xsl",
  ".xslt",
  ".svg",

  ".py",
  ".rb",
  ".go",
  ".rs",
  ".java",
  ".kt",
  ".c",
  ".cpp",
  ".cc",
  ".h",
  ".hpp",
  ".php",
  ".sql",

  ".yml",
  ".yaml",
  ".toml",
  ".ini",
  ".cfg",
  ".conf",
  ".properties",

  ".sh",
  ".bat",
  ".ps1",

  ".graphql",
  ".gql",
  ".hs",
  ".lhs",
  ".ex",
  ".exs",
  ".erl",
  ".hrl",
  ".clj",
  ".cljs",
  ".cljc",
  ".edn",
  ".fs",
  ".fsi",
  ".fsx",
  ".vb",
  ".m",
  ".jl",
  ".asm",
  ".s",

  ".mk",
  ".make",
  ".gradle",
  ".kts",
  ".tf",
  ".tfvars",
  ".dockerfile",
  ".prisma",
  ".proto",
  ".tex",
  ".sty",
  ".vim",
  ".nix",
]);

const SPECIAL_FILES = new Set([
  "Dockerfile",
  "Makefile",
  "GNUmakefile",
  "Jenkinsfile",
  "Vagrantfile",
  "Gemfile",
  "Rakefile",
  "Procfile",
  "LICENSE",
  "README",
  ".gitignore",
  ".gitattributes",
  ".editorconfig",
  ".dockerignore",
  ".npmrc",
  ".nvmrc",
  ".prettierrc",
  ".eslintrc",
]);

const SPECIAL_CATEGORY = {
  Dockerfile: "Docker",
  Makefile: "Build/Project",
  GNUmakefile: "Build/Project",
  Jenkinsfile: "Build/Project",
  Vagrantfile: "Build/Project",
  Procfile: "Build/Project",
  Gemfile: "Ruby",
  Rakefile: "Ruby",
  LICENSE: "Documentation",
  README: "Documentation",
  ".gitignore": "Config",
  ".gitattributes": "Config",
  ".editorconfig": "Config",
  ".dockerignore": "Config",
  ".npmrc": "Config",
  ".nvmrc": "Config",
  ".prettierrc": "Config",
  ".eslintrc": "Config",
};

const CATEGORIES = {
  JavaScript: [".js", ".jsx", ".ts", ".tsx", ".vue", ".svelte", ".astro"],
  HTML: [".html", ".htm", ".xhtml"],
  CSS: [".css", ".scss", ".sass"],
  JSON: [".json"],
  Markdown: [".md", ".markdown"],
  Python: [".py"],
  Ruby: [".rb"],
  Go: [".go"],
  Rust: [".rs"],
  Java: [".java", ".kt"],
  "C/C++": [".c", ".cpp", ".cc", ".h", ".hpp"],
  PHP: [".php"],
  SQL: [".sql"],
  Config: [".yml", ".yaml", ".toml", ".ini", ".cfg", ".conf", ".properties"],
  Shell: [".sh", ".bat", ".ps1"],
  XML: [".xml", ".xsd", ".xsl", ".xslt", ".svg"],
  GraphQL: [".graphql", ".gql"],
  Haskell: [".hs", ".lhs"],
  "Elixir/Erlang": [".ex", ".exs", ".erl", ".hrl"],
  Clojure: [".clj", ".cljs", ".cljc", ".edn"],
  "F#": [".fs", ".fsi", ".fsx"],
  "Visual Basic": [".vb"],
  MATLAB: [".m"],
  Julia: [".jl"],
  Assembly: [".asm", ".s"],
  "Build/Project": [".mk", ".make", ".gradle", ".kts", ".tf", ".tfvars"],
  Docker: [".dockerfile"],
  Prisma: [".prisma"],
  Protobuf: [".proto"],
  LaTeX: [".tex", ".sty"],
  Nix: [".nix"],
  Vim: [".vim"],
  Documentation: [".txt", ".csv", ".tsv"],
};

const MAX_CONTEXT_FILES = 8;
const MAX_CONTEXT_FILE_SIZE = 100 * 1024;
const MAX_READ_SIZE = 200 * 1024;
const MAX_SEARCH_FILES = 3000;

const PIPELINE = [
  "Understanding request",
  "Identifying relevant files",
  "Inspecting code flow",
  "Finding suspicious behavior",
  "Preparing recommendation",
];

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const IMAGE_EXT = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

function parseImageDataUrl(dataUrl) {
  if (typeof dataUrl !== "string") return null;
  const m = dataUrl.match(
    /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/,
  );
  if (!m) return null;
  const mime = m[1];
  const buffer = Buffer.from(m[2], "base64");
  if (!buffer.length || buffer.length > MAX_IMAGE_BYTES) return null;
  if (!looksLikeImage(buffer, mime)) return null;
  return { mime, ext: IMAGE_EXT[mime], buffer };
}

function looksLikeImage(buffer, mime) {
  if (mime === "image/png") {
    return (
      buffer.length > 8 &&
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47
    );
  }
  if (mime === "image/jpeg") {
    return (
      buffer.length > 3 &&
      buffer[0] === 0xff &&
      buffer[1] === 0xd8 &&
      buffer[2] === 0xff
    );
  }
  if (mime === "image/webp") {
    return (
      buffer.length > 12 &&
      buffer.toString("ascii", 0, 4) === "RIFF" &&
      buffer.toString("ascii", 8, 12) === "WEBP"
    );
  }
  if (mime === "image/gif") {
    const head = buffer.toString("ascii", 0, 6);
    return head === "GIF89a" || head === "GIF87a";
  }
  return false;
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, "utf-8"));
  } catch {
    return fallback;
  }
}

async function readExperiments() {
  const experiments = await readJson(EXPERIMENTS_FILE, []);
  let changed = false;
  for (const experiment of experiments) {
    if (!experiment.conversationId) {
      experiment.conversationId = experiment.id;
      changed = true;
    }
  }
  if (changed) await writeJson(EXPERIMENTS_FILE, experiments);
  return experiments;
}

async function writeJson(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(data, null, 2));
}

async function updateExp(id, patch) {
  const experiments = await readJson(EXPERIMENTS_FILE, []);
  const exp = experiments.find((e) => e.id === id);
  if (!exp) return null;
  Object.assign(exp, patch);
  await writeJson(EXPERIMENTS_FILE, experiments);

  if (patch.progress)
    broadcaster.progress(
      id,
      patch.progress[patch.progress.length - 1],
      patch.progress,
    );
  if (patch.status) broadcaster.status(id, patch.status);
  if (patch.findings?.length)
    patch.findings.forEach((f) => broadcaster.finding(id, f));
  if (patch.status === "completed" || patch.status === "failed") {
    broadcaster.complete(id, {
      status: patch.status,
      answer: patch.answer,
      findings: patch.findings,
      error: patch.error,
    });
  }
  return exp;
}

async function readMemory() {
  const mem = await readJson(MEMORY_FILE, {});
  return {
    global: {
      notes: mem.global?.notes || "",
      updatedAt: mem.global?.updatedAt || 0,
    },
    projects: mem.projects || {},
  };
}

async function writeMemory(memory) {
  await writeJson(MEMORY_FILE, memory);
}

async function triggerAutoLearn(expId) {
  try {
    const experiments = await readJson(EXPERIMENTS_FILE, []);
    const exp = experiments.find((e) => e.id === expId);
    if (exp && exp.status === "completed") {
      await autoLearn(exp);
    }
  } catch (err) {
    console.log(`[memory] Auto-learn failed for ${expId}: ${err.message}`);
  }
}

const TRUST_LEVELS = {
  1: {
    label: "Level 1 — Suggest only",
    rule: "You must NOT modify files, run commands, or use git. Report issues and suggest fixes — the user applies them manually.",
  },
  2: {
    label: "Level 2 — Auto-fix low risk",
    rule: "Low-risk file edits and safe commands (tests, builds, checks, read-only git) run automatically. Medium or high-risk actions pause and ask the user for approval.",
  },
  3: {
    label: "Level 3 — Full autonomous",
    rule: "You can edit files and run commands autonomously inside the project. Destructive or high-risk actions still pause and ask the user for approval.",
  },
};

async function readSettings() {
  const s = await readJson(SETTINGS_FILE, {});
  return {
    trustLevel: [1, 2, 3].includes(s.trustLevel) ? s.trustLevel : 1,
    defaultProjectId:
      typeof s.defaultProjectId === "string" ? s.defaultProjectId : null,
  };
}

async function writeSettings(settings) {
  await writeJson(SETTINGS_FILE, settings);
}

app.get("/api/settings", async (req, res) => {
  res.json(await readSettings());
});

app.put("/api/settings", async (req, res) => {
  const current = await readSettings();
  const trustLevel = [1, 2, 3].includes(Number(req.body.trustLevel))
    ? Number(req.body.trustLevel)
    : 1;
  const defaultProjectId =
    typeof req.body.defaultProjectId === "string"
      ? req.body.defaultProjectId
      : current.defaultProjectId;
  await writeSettings({ trustLevel, defaultProjectId });
  res.json({ trustLevel, defaultProjectId });
});

const AUTOMATION_FILE = path.join(DATA_DIR, "automation.json");

let expWriteChain = Promise.resolve();
function withExpLock(fn) {
  const run = expWriteChain.then(fn, fn);
  expWriteChain = run.catch(() => {});
  return run;
}

async function readAutomation() {
  const a = await readJson(AUTOMATION_FILE, {});
  return {
    enabled: a.enabled !== false,
    scanNewProject: a.scanNewProject !== false,
    validateJson: a.validateJson !== false,
    intervalMin: Math.max(1, Math.min(60, Number(a.intervalMin) || 5)),
    snapshots: a.snapshots || {},
  };
}

async function readBrainstormConfig() {
  const c = await readJson(BRAINSTORM_FILE, {});
  return {
    maxIterations: Math.max(1, Math.min(5, Number(c.maxIterations) || 3)),
    stoppingThreshold: Math.max(
      1,
      Math.min(10, Number(c.stoppingThreshold) || 8),
    ),
    numCandidates: Math.max(2, Math.min(5, Number(c.numCandidates) || 3)),
  };
}

function isBrainstormTask(task) {
  return /brainstorm|come up with (some |a few )?(ideas|solutions|options)|think of (some |different )?(ideas|solutions|options|approaches)|what are (some |my )?(options|approaches|alternatives)|weigh (the |up )(options|approaches|alternatives)|design (a|an) (solution|system|architecture|feature|workflow)/i.test(
    String(task || ""),
  );
}

const BRAINSTORM_LOG = (msg, data) =>
  console.log(`[brainstorm] ${msg}${data ? " — " + JSON.stringify(data) : ""}`);

async function runBrainstormExperiment(
  expId,
  task,
  projectId,
  context,
  memoryText,
  isReply = false,
) {
  const brainLog = (msg, data) => {
    if (msg === "candidate" || msg === "critique") return;
    BRAINSTORM_LOG(msg, data);
  };
  try {
    const config = await readBrainstormConfig();
    BRAINSTORM_LOG("skill started", { expId, config });
    const problem = task
      .replace(/^brainstorm\s*:?\s*/i, "")
      .replace(/^brainstorming\s*:?\s*/i, "")
      .trim();
    const constraints = context?.relevantFiles?.length
      ? `Relevant files: ${context.relevantFiles.map((f) => f.path).join(", ")}`
      : "";
    const result = await brainstorm({
      problem,
      constraints,
      context: memoryText
        ? `Project memory:\n${memoryText.slice(0, 4000)}`
        : "",
      config,
      callAI: (messages) => callAI(messages, false),
      log: brainLog,
    });
    const updated = await readJson(EXPERIMENTS_FILE, []);
    const exp = updated.find((e) => e.id === expId);
    if (!exp) return;
    if (exp.status !== "running") return;
    const extra = [...(context?.relevantFiles?.map((f) => f.path) || [])];
    exp.contextFiles = [...(exp.contextFiles || []), ...extra];
    exp.contextBuildMs = exp.contextBuildMs || 0;
    exp.status = "completed";
    exp.progress = PIPELINE;
    exp.steps = [
      "Understanding problem",
      "Generating candidates",
      "Critiquing candidates",
      "Refining",
      "Writing recommendation",
    ];
    exp.findings = result.clarification
      ? [`Need more info: ${result.clarification}`]
      : result.needsTools
        ? [`Needs data/tools: ${result.needsTools}`]
        : [
            `${result.iterations.length} iteration(s), ${result.iterations.reduce((n, it) => n + it.candidates.length, 0)} candidate(s), best score ${result.iterations.at(-1)?.bestScore ?? "?"}/10`,
            result.confidence !== null
              ? `Confidence: ${result.confidence}%`
              : "",
          ].filter(Boolean);
    exp.brainstorm = result;
    exp.answer =
      result.clarification || result.needsTools
        ? `${result.clarification ? "I need more info before brainstorming:\n\n> " + result.clarification : "I can't reason my way through this one — I need data or tools:\n\n> " + result.needsTools}`
        : result.report;
    exp.messages = exp.messages.map((m) =>
      m.pending
        ? { role: m.role, content: m.content, createdAt: m.createdAt }
        : m,
    );
    exp.messages.push({
      role: "assistant",
      content: exp.answer,
      createdAt: Date.now(),
    });
    exp.completedAt = Date.now();
    await writeJson(EXPERIMENTS_FILE, updated);
    BRAINSTORM_LOG("skill completed", {
      expId,
      iterations: result.iterations.length,
    });
    triggerAutoLearn(expId).catch(() => {});
  } catch (err) {
    BRAINSTORM_LOG("skill failed", { expId, error: err.message });
    const updated = await readJson(EXPERIMENTS_FILE, []);
    const exp = updated.find((e) => e.id === expId);
    if (exp && exp.status === "running") {
      exp.messages = exp.messages.map((m) =>
        m.pending
          ? { role: m.role, content: m.content, createdAt: m.createdAt }
          : m,
      );
      exp.status = "failed";
      exp.error = err.message;
      exp.completedAt = Date.now();
      await writeJson(EXPERIMENTS_FILE, updated);
      broadcaster.error(expId, err.message);
    }
  }
}

async function writeAutomation(a) {
  await writeJson(AUTOMATION_FILE, a);
}

async function createAutoExperiment({ task, projectId, subtype }) {
  return withExpLock(async () => {
    const id = makeId();
    const experiments = await readJson(EXPERIMENTS_FILE, []);
    experiments.push({
      id,
      task,
      projectId: projectId || null,
      kind: "automation",
      autoSubtype: subtype,
      status: "running",
      progress: ["Checking project"],
      steps: [],
      findings: [],
      answer: "",
      error: null,
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      createdAt: Date.now(),
      messages: [{ role: "user", content: task, createdAt: Date.now() }],
      contextFiles: [],
      contextBuildMs: 0,
    });
    await writeJson(EXPERIMENTS_FILE, experiments);
    return id;
  });
}

async function finishAutoExperiment(id, { steps, findings, answer, error }) {
  const experiments = await readJson(EXPERIMENTS_FILE, []);
  const exp = experiments.find((e) => e.id === id);
  if (!exp || exp.status !== "running") return;
  exp.status = error ? "failed" : "completed";
  exp.progress = PIPELINE;
  exp.steps = steps || [];
  exp.findings = findings || [];
  exp.answer = answer || "";
  exp.error = error || null;
  exp.completedAt = Date.now();
  exp.messages.push({
    role: "assistant",
    content: error || answer || "",
    createdAt: Date.now(),
  });
  await writeJson(EXPERIMENTS_FILE, experiments);
}

async function autoScanProject(projectId) {
  const projects = await readJson(PROJECTS_FILE, []);
  const project = projects.find((p) => p.id === projectId && !p.hidden);
  if (!project) return;
  const id = await createAutoExperiment({
    task: `Automated scan of "${project.name}" — find obvious issues`,
    projectId,
    subtype: "scan",
  });
  try {
    const context = await buildProjectContext(
      projectId,
      "obvious issues broken duplicates missing inconsistent risky",
      { maxFiles: 2, maxSize: 6 * 1024 },
    );
    const memoryText = await loadMemoryForProject(projectId);
    const { trustLevel } = await readSettings();
    const system = `You are Hermes, an AI developer assistant running an AUTOMATED project scan. You have NO tools — do not write TOOL: lines, just analyze the project context below.
Memory (from past sessions — use this):${memoryText || " none"}
Trust level: ${TRUST_LEVELS[trustLevel].label}.

Find obvious issues in this project: broken or suspicious code, missing files, duplicate code, inconsistencies, risky patterns, security smells.
Respond EXACTLY in this structure (it is parsed automatically):
# <short title of the scan>

## Steps
- <what you checked>

## Findings
- CRITICAL: <issue>   (only if something can break or is dangerous)
- WARNING: <issue>
- SUGGESTION: <idea>

## Recommendation
<next step to take>

If nothing obvious stands out, say the project looks healthy and leave Findings with no bullets.
Never use emojis.`;
    const thread = [
      { role: "system", content: system },
      {
        role: "user",
        content: `Project: ${project.name} (${project.path})\nFile counts: ${JSON.stringify(context?.stats || {})} (${context?.totalFiles || 0} total files)\n\nRelevant files:\n${(context?.relevantFiles || []).map((f) => `--- FILE: ${f.path} ---\n${f.content}`).join("\n\n")}`,
      },
    ];
    const raw = stripEmojis((await callAI(thread)).content);
    const { steps, findings } = parseSteps(raw);
    await finishAutoExperiment(id, {
      steps: steps.length
        ? steps
        : [
            "Scanning project structure",
            "Analyzing files",
            "Checking for issues",
          ],
      findings,
      answer: raw,
    });
  } catch (err) {
    await finishAutoExperiment(id, { error: err.message });
  }
}

async function autoValidateJsonFiles(project) {
  const scan = await scanProject(project.path);
  const aut = await readAutomation();
  const snap = aut.snapshots[project.id] || [];
  const current = scan.files.map((f) => f.path);
  const newFiles = current.filter((p) => !snap.includes(p));
  aut.snapshots[project.id] = current;
  await writeAutomation(aut);
  if (!aut.validateJson) return;
  for (const p of newFiles) {
    if (!p.toLowerCase().endsWith(".json")) continue;
    const abs = resolveSafe(project.path, p);
    if (!abs) continue;
    let raw;
    try {
      const st = await fs.stat(abs);
      if (st.size > 8 * 1024 * 1024) continue;
      raw = await fs.readFile(abs, "utf-8");
    } catch {
      continue;
    }
    let parseError = null;
    try {
      JSON.parse(raw);
    } catch (err) {
      parseError = err.message;
    }
    if (!parseError) continue;
    const id = await createAutoExperiment({
      task: `Invalid JSON detected: ${p} (${project.name})`,
      projectId: project.id,
      subtype: "json",
    });
    const answer = `# Invalid JSON\n\n## Steps\n- New file detected: ${p}\n- JSON.parse failed\n\n## Findings\n- CRITICAL: ${parseError}\n\n## Recommendation\nFix the JSON syntax in **${p}**.`;
    await finishAutoExperiment(id, {
      steps: [
        "Detected new JSON file",
        "Running JSON.parse",
        "Validation failed",
      ],
      findings: [`CRITICAL: ${parseError}`],
      answer,
    });
  }
}

let automationLastRun = 0;
async function pollAutomation() {
  const aut = await readAutomation();
  if (!aut.enabled) return;
  const now = Date.now();
  if (now - automationLastRun < aut.intervalMin * 60 * 1000) return;
  automationLastRun = now;
  const projects = await readJson(PROJECTS_FILE, []);
  for (const p of projects.filter((x) => !x.hidden)) {
    try {
      await autoValidateJsonFiles(p);
    } catch (err) {
      console.error(`Automation JSON check failed for ${p.name}:`, err.message);
    }
  }
}

app.get("/api/automation", async (req, res) => {
  const a = await readAutomation();
  res.json({
    enabled: a.enabled,
    scanNewProject: a.scanNewProject,
    validateJson: a.validateJson,
    intervalMin: a.intervalMin,
  });
});

app.put("/api/automation", async (req, res) => {
  const a = await readAutomation();
  const { enabled, scanNewProject, validateJson, intervalMin } = req.body;
  a.enabled = enabled !== undefined ? !!enabled : a.enabled;
  a.scanNewProject =
    scanNewProject !== undefined ? !!scanNewProject : a.scanNewProject;
  a.validateJson = validateJson !== undefined ? !!validateJson : a.validateJson;
  a.intervalMin =
    intervalMin !== undefined
      ? Math.max(1, Math.min(60, Number(intervalMin) || 5))
      : a.intervalMin;
  await writeAutomation(a);
  res.json(a);
});

app.post("/api/automation/run", async (req, res) => {
  const projects = await readJson(PROJECTS_FILE, []);
  const visible = projects.filter((x) => !x.hidden);
  const aut = await readAutomation();
  let started = 0;
  for (const p of visible) {
    autoScanProject(p.id).catch(() => {});
    autoValidateJsonFiles(p).catch(() => {});
    started++;
  }
  if (!aut.enabled && visible.length) {
    aut.enabled = true;
    await writeAutomation(aut);
  }
  res.json({
    started,
    note: "Scans are running in the background — they will appear in Experiments as automation reports.",
  });
});

app.get("/api/brainstorm", async (req, res) => {
  res.json(await readBrainstormConfig());
});

app.put("/api/brainstorm", async (req, res) => {
  const cfg = await readBrainstormConfig();
  const { maxIterations, stoppingThreshold, numCandidates } = req.body;
  const clamp = (v, lo, hi, dflt) => {
    const n = Number(v);
    return Number.isFinite(n)
      ? Math.min(hi, Math.max(lo, Math.round(n)))
      : dflt;
  };
  cfg.maxIterations = clamp(maxIterations, 1, 5, cfg.maxIterations);
  cfg.stoppingThreshold = clamp(
    stoppingThreshold,
    1,
    10,
    cfg.stoppingThreshold,
  );
  cfg.numCandidates = clamp(numCandidates, 2, 5, cfg.numCandidates);
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(BRAINSTORM_FILE, JSON.stringify(cfg, null, 2));
  res.json(cfg);
});

app.get("/api/bridge", async (req, res) => {
  res.json(await readBridgeConfig());
});

app.put("/api/bridge", async (req, res) => {
  const b = await readBridgeConfig();
  const { enabled, baseUrl, apiKey, verifyCommand, timeoutMs } = req.body || {};
  b.enabled = enabled !== undefined ? !!enabled : b.enabled;
  b.baseUrl =
    typeof baseUrl === "string" && baseUrl.trim() ? baseUrl.trim() : b.baseUrl;
  b.apiKey = typeof apiKey === "string" ? apiKey.trim() : b.apiKey;
  b.verifyCommand =
    typeof verifyCommand === "string" ? verifyCommand.trim() : b.verifyCommand;
  if (timeoutMs !== undefined) {
    b.timeoutMs = Math.max(
      30000,
      Math.min(30 * 60 * 1000, Number(timeoutMs) || b.timeoutMs),
    );
  }
  await writeBridgeConfig(b);
  res.json(b);
});

app.post("/api/bridge/test", async (req, res) => {
  const saved = await readBridgeConfig();
  const body = req.body || {};
  const cfg = {
    ...saved,
    baseUrl:
      typeof body.baseUrl === "string" && body.baseUrl.trim()
        ? body.baseUrl.trim()
        : saved.baseUrl,
    apiKey: typeof body.apiKey === "string" ? body.apiKey.trim() : saved.apiKey,
  };
  try {
    const result = await testBridge(cfg);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.json({ ok: false, error: err.message });
  }
});

async function loadMemoryForProject(projectId, task = "", currentId = null) {
  const memory = await readMemory();
  const parts = [];

  if (memory.global?.notes) {
    parts.push(
      `Hermes Global Memory (auto-learned from all sessions):\n${memory.global.notes.slice(0, 4000)}`,
    );
  }
  if (projectId && memory.projects?.[projectId]?.notes) {
    parts.push(
      `Hermes Project Memory (auto-learned for this project):\n${memory.projects[projectId].notes.slice(0, 3000)}`,
    );
  }

  const knowledgeText = await loadKnowledgeText(task);
  if (knowledgeText) parts.push(knowledgeText);

  const conversationText = await loadConversationMemory(
    task,
    projectId,
    currentId,
  );
  if (conversationText) parts.push(conversationText);

  return parts.length ? parts.join("\n\n") : null;
}

async function loadConversationMemory(
  task,
  projectId = null,
  currentId = null,
) {
  if (isContinuationTask(task)) return null;
  const experiments = await readExperiments();
  const tokens = String(task || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 2);

  const now = Date.now();
  const DAY_MS = 24 * 60 * 60 * 1000;

  const ranked = experiments
    .filter(
      (exp) =>
        exp.id !== currentId &&
        exp.status === "completed" &&
        (!projectId || !exp.projectId || exp.projectId === projectId),
    )
    .map((exp) => {
      const haystack = `${exp.task || ""} ${exp.answer || ""}`.toLowerCase();
      const tokenScore = tokens.reduce(
        (sum, token) => sum + (haystack.includes(token) ? 1 : 0),
        0,
      );

      const age = now - (exp.completedAt || exp.createdAt || 0);
      const recencyBonus = Math.max(0, (7 * DAY_MS - age) / DAY_MS);
      const score = tokenScore + recencyBonus * 0.5;
      return { exp, score, tokenScore };
    })
    .sort((a, b) => b.score - a.score);

  const chosen = ranked.filter((item) => item.score > 0).slice(0, 6);
  if (!chosen.length) return null;

  const blocks = chosen.map(({ exp, tokenScore }) => {
    const date = new Date(exp.completedAt || exp.createdAt || Date.now())
      .toISOString()
      .slice(0, 10);
    const taskStr = String(exp.task || "").slice(0, 400);
    const answerStr = String(exp.answer || "").slice(0, 1200);
    const relevance =
      tokenScore > 0 ? ` (matched ${tokenScore} keywords)` : " (recent)";
    return `[${date}]${relevance}\nUser asked: ${taskStr}\nHermes answered: ${answerStr}`;
  });

  return `Conversation memory from past Hermes sessions. Use this when the user refers to older work:\n${blocks.join("\n\n")}`;
}

function isContinuationTask(task) {
  return /^(?:continue|go on|keep going|proceed|carry on|ituloy|sige|tuloy)\s*[.!?]*$/i.test(
    String(task || "").trim(),
  );
}

async function recallPreviousConversation(
  task,
  currentId,
  previousConversationId = null,
  intent = null,
) {
  if (isContinuationTask(task)) return null;

  const historyAction =
    intent?.action === "search_conversation_history" ||
    intent?.action === "get_previous_conversation";
  const explicitlyRequestsHistory =
    /\b(previous|last time|earlier|before|remember|conversation|session|history|what did i ask|what we discussed)\b|(?:ano|anong).*(?:tinanong|pinag-usapan|sinabi)|(?:naalala|nakaraan)/i.test(
      String(task || ""),
    );
  if (!historyAction || !explicitlyRequestsHistory) {
    return null;
  }
  const experiments = await readExperiments();
  const topicTokens = String(intent?.query || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 2);
  const candidates = experiments
    .filter((exp) => exp.id !== currentId)
    .map((exp) => {
      const haystack =
        `${exp.task || ""} ${(exp.messages || []).map((m) => m.content || "").join(" ")}`.toLowerCase();
      const score = topicTokens.reduce(
        (sum, token) => sum + (haystack.includes(token) ? 1 : 0),
        0,
      );
      return { exp, score };
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        (b.exp.completedAt || b.exp.createdAt || 0) -
          (a.exp.completedAt || a.exp.createdAt || 0),
    );
  const previous =
    previousConversationId &&
    (!intent?.query || intent.target === "previous_conversation")
      ? experiments.find((exp) => exp.id === previousConversationId) ||
        candidates[0]?.exp
      : candidates[0]?.exp;
  if (!previous) return "I don't have an older saved conversation yet.";
  const messages = (previous.messages || [])
    .filter((message) => message.role === "user" && message.content)
    .slice(-6);
  const asked = messages.length
    ? messages
        .map((message) => `- ${String(message.content).slice(0, 1000)}`)
        .join("\n")
    : `- ${String(previous.task || "").slice(0, 1000)}`;
  const date = new Date(
    previous.completedAt || previous.createdAt || Date.now(),
  )
    .toISOString()
    .slice(0, 10);
  return `Yes. From your previous saved conversation (${date}), you asked:\n\n${asked}`;
}

async function readKnowledge() {
  const k = await readJson(KNOWLEDGE_FILE, {});
  return {
    vaults: Array.isArray(k.vaults) ? k.vaults : [],
    notes: Array.isArray(k.notes) ? k.notes : [],
    config: {
      inject: k.config?.inject !== false,
      maxNotes: Math.max(1, Math.min(10, Number(k.config?.maxNotes) || 6)),
      maxChars: Math.max(
        500,
        Math.min(8000, Number(k.config?.maxChars) || 4000),
      ),
    },
    lastScanAt: Number(k.lastScanAt) || 0,
  };
}

async function writeKnowledge(knowledge) {
  await writeJson(KNOWLEDGE_FILE, knowledge);
}

async function scanAllVaults() {
  const knowledge = await readKnowledge();
  knowledge.notes = [];
  for (const vault of knowledge.vaults) {
    try {
      const { notes } = await scanVault(vault.path);
      for (const note of notes) note.vaultId = vault.id;
      knowledge.notes.push(...notes);
    } catch (err) {
      console.log(
        `[knowledge] scan failed for vault ${vault.name}: ${err.message}`,
      );
    }
  }
  knowledge.lastScanAt = Date.now();
  await writeKnowledge(knowledge);
  return knowledge;
}

async function loadKnowledgeText(task) {
  const knowledge = await readKnowledge();
  if (!knowledge.config.inject || !knowledge.notes.length) return null;
  const tokens = String(task || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1);
  if (!tokens.length) return null;
  const picks = pickRelevant(knowledge.notes, task, {
    maxNotes: knowledge.config.maxNotes,
    maxChars: knowledge.config.maxChars,
  });
  if (!picks.length) return null;
  return `Knowledge (from your Obsidian vault — use it when relevant):\n${picks
    .map((p) => `- ${p.block} (${p.note.path})`)
    .join("\n")}`;
}

app.get("/api/knowledge", async (req, res) => {
  const knowledge = await readKnowledge();
  res.json({
    vaults: knowledge.vaults.map((v) => ({
      ...v,
      noteCount: knowledge.notes.filter((n) => n.vaultId === v.id).length,
    })),
    noteCount: knowledge.notes.length,
    config: knowledge.config,
    lastScanAt: knowledge.lastScanAt,
  });
});

app.put("/api/knowledge", async (req, res) => {
  const knowledge = await readKnowledge();
  knowledge.config = {
    inject: req.body.inject !== false,
    maxNotes: Math.max(
      1,
      Math.min(10, Number(req.body.maxNotes) || knowledge.config.maxNotes),
    ),
    maxChars: Math.max(
      500,
      Math.min(8000, Number(req.body.maxChars) || knowledge.config.maxChars),
    ),
  };
  await writeKnowledge(knowledge);
  res.json({ config: knowledge.config });
});

app.post("/api/knowledge/vaults", async (req, res) => {
  const name = String(req.body.name ?? "")
    .trim()
    .slice(0, 100);
  const vaultPath = String(req.body.path ?? "").trim();
  if (!name || !vaultPath)
    return res.status(400).json({ error: "Name and path are required" });
  let stat;
  try {
    stat = await fs.stat(vaultPath);
  } catch {
    return res.status(400).json({ error: "Vault path does not exist" });
  }
  if (!stat.isDirectory())
    return res.status(400).json({ error: "Vault path is not a folder" });
  const knowledge = await readKnowledge();
  const norm = vaultPath.replace(/[\\/]+$/, "");
  if (knowledge.vaults.some((v) => v.path.replace(/[\\/]+$/, "") === norm)) {
    return res.status(400).json({ error: "That vault is already registered" });
  }
  const vault = {
    id: makeVaultId(name, vaultPath),
    name,
    path: vaultPath,
    addedAt: Date.now(),
  };
  knowledge.vaults.push(vault);
  await writeKnowledge(knowledge);
  try {
    const { notes } = await scanVault(vault.path);
    for (const note of notes) note.vaultId = vault.id;
    const fresh = await readKnowledge();
    fresh.notes = fresh.notes
      .filter((n) => n.vaultId !== vault.id)
      .concat(notes);
    fresh.lastScanAt = Date.now();
    await writeKnowledge(fresh);
    res.json({
      vault: { ...vault, noteCount: notes.length },
      noteCount: fresh.notes.length,
    });
  } catch (err) {
    const rollback = await readKnowledge();
    rollback.vaults = rollback.vaults.filter((v) => v.id !== vault.id);
    await writeKnowledge(rollback);
    res.status(400).json({ error: `Vault scan failed: ${err.message}` });
  }
});

app.delete("/api/knowledge/vaults/:id", async (req, res) => {
  const knowledge = await readKnowledge();
  knowledge.vaults = knowledge.vaults.filter((v) => v.id !== req.params.id);
  knowledge.notes = knowledge.notes.filter((n) => n.vaultId !== req.params.id);
  await writeKnowledge(knowledge);
  res.json({ ok: true });
});

app.post("/api/knowledge/scan", async (req, res) => {
  const knowledge = await scanAllVaults();
  res.json({
    vaults: knowledge.vaults.map((v) => ({
      ...v,
      noteCount: knowledge.notes.filter((n) => n.vaultId === v.id).length,
    })),
    noteCount: knowledge.notes.length,
    lastScanAt: knowledge.lastScanAt,
  });
});

app.get("/api/knowledge/notes", async (req, res) => {
  const knowledge = await readKnowledge();
  const q = String(req.query.q || "").trim();
  const base = knowledge.notes.map(({ excerpt, links, ...meta }) => meta);
  if (!q) return res.json({ notes: base });
  const hits = searchNotes(knowledge.notes, q, { limit: 20 });
  res.json({ notes: hits.map((h) => ({ ...h.note, score: h.score })) });
});

app.get("/api/memory", async (req, res) => {
  res.json(await readMemory());
});

app.put("/api/memory/global", async (req, res) => {
  const notes = String(req.body.notes ?? "")
    .trim()
    .slice(0, 8000);
  const memory = await readMemory();
  memory.global = { notes, updatedAt: Date.now() };
  await writeMemory(memory);
  res.json(memory);
});

app.put("/api/memory/projects/:id", async (req, res) => {
  const notes = String(req.body.notes ?? "")
    .trim()
    .slice(0, 8000);
  const memory = await readMemory();
  memory.projects[req.params.id] = { notes, updatedAt: Date.now() };
  await writeMemory(memory);
  res.json(memory);
});

app.post("/api/memory/projects/:id/learn", async (req, res) => {
  const projects = await readJson(PROJECTS_FILE, []);
  const project = projects.find((p) => p.id === req.params.id);
  if (!project) return res.status(404).json({ error: "Project not found" });
  const scan = await scanProject(project.path);
  const fileList = scan.files.slice(0, 150).map((f) => f.path);
  const system = `You are Hermes, an AI developer assistant building a memory file for a project so future sessions remember what matters.
Write concise project memory notes. Cover: stack and frameworks, architecture and structure, coding conventions, notable patterns, and anything a future-you should remember before working on this codebase.
Plain language, no emojis, under 300 words, no markdown headers.`;
  const user = `Project: ${project.name}
Path: ${project.path}
File counts: ${JSON.stringify(scan.stats)} (${scan.totalFiles} total files)
Files (first 150):\n${fileList.join("\n")}`;
  let raw;
  try {
    raw = (
      await callAI([
        { role: "system", content: system },
        { role: "user", content: user },
      ])
    ).content;
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
  const notes = stripEmojis(raw).slice(0, 4000);
  const memory = await readMemory();
  memory.projects[project.id] = { notes, updatedAt: Date.now() };
  await writeMemory(memory);
  res.json(memory);
});

function makeId() {
  return String(Date.now()).slice(-5);
}

function isTextFile(name) {
  return (
    TEXT_EXT.has(path.extname(name).toLowerCase()) || SPECIAL_FILES.has(name)
  );
}

function resolveSafe(root, rel) {
  let abs;
  if (path.isAbsolute(rel)) {
    abs = path.normalize(rel);
  } else {
    abs = path.resolve(root, rel);
  }
  const relPath = path.relative(root, abs);
  if (relPath.startsWith("..") || path.isAbsolute(relPath)) return null;
  return abs;
}

async function scanProject(root) {
  const files = [];
  async function walk(dir, rel) {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".") && !SPECIAL_FILES.has(entry.name))
        continue;
      if (SKIP_DIRS.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      const relPath = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await walk(full, relPath);
      else files.push({ path: relPath, name: entry.name, size: 0 });
    }
  }
  await walk(root, "");
  for (const f of files) {
    try {
      const st = await fs.stat(resolveSafe(root, f.path));
      f.size = st.size;
    } catch {}
  }
  const counts = {};
  const specials = {};
  for (const f of files) {
    const ext = path.extname(f.name).toLowerCase() || "(none)";
    counts[ext] = (counts[ext] || 0) + 1;
    if (SPECIAL_FILES.has(f.name))
      specials[f.name] = (specials[f.name] || 0) + 1;
  }
  const cats = {};
  for (const [k, exts] of Object.entries(CATEGORIES)) {
    cats[k] = exts.reduce((a, e) => a + (counts[e] || 0), 0);
  }
  for (const [name, cat] of Object.entries(SPECIAL_CATEGORY)) {
    cats[cat] = (cats[cat] || 0) + (specials[name] || 0);
  }
  cats.Other = files.length - Object.values(cats).reduce((a, b) => a + b, 0);
  return { files, counts, totalFiles: files.length, stats: cats };
}

function stopwords() {
  return new Set([
    "the",
    "a",
    "an",
    "is",
    "are",
    "was",
    "were",
    "why",
    "what",
    "how",
    "do",
    "does",
    "did",
    "my",
    "it",
    "to",
    "of",
    "in",
    "on",
    "for",
    "with",
    "and",
    "or",
    "not",
    "working",
    "stop",
    "stopped",
    "please",
    "can",
    "you",
    "help",
    "me",
    "find",
    "investigate",
    "debug",
    "check",
    "look",
    "at",
    "this",
    "that",
    "error",
    "bug",
    "fix",
    "need",
    "about",
  ]);
}

function taskKeywords(task) {
  const words = task
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  const stop = stopwords();
  const seen = new Set();
  const out = [];
  for (const w of words) {
    if (w.length < 3 || stop.has(w) || seen.has(w)) continue;
    seen.add(w);
    out.push(w);
  }
  return out;
}

function scoreFile(f, keywords) {
  let score = 0;
  for (const kw of keywords) {
    if (f.path.toLowerCase().includes(kw)) score += 3;
    if (f.name.toLowerCase().includes(kw)) score += 2;
  }
  return score;
}

const CODE_EXT = {
  js: "js",
  javascript: "js",
  jsx: "jsx",
  ts: "ts",
  tsx: "tsx",
  typescript: "ts",
  py: "py",
  python: "py",
  html: "html",
  css: "css",
  json: "json",
  java: "java",
  c: "c",
  cpp: "cpp",
  cs: "cs",
  go: "go",
  rb: "rb",
  php: "php",
  sql: "sql",
  sh: "sh",
  bash: "sh",
  yaml: "yaml",
  yml: "yaml",
  xml: "xml",
  md: "md",
  txt: "txt",
};

async function savePastedCode(expId, task) {
  const blocks = [...task.matchAll(/```([\w+-]*)\n?([\s\S]*?)```/g)];
  if (!blocks.length) return null;
  const block = blocks.sort((a, b) => b[2].length - a[2].length)[0];
  const lang = (block[1] || "").trim().toLowerCase();
  const ext = CODE_EXT[lang] || "txt";
  const dir = path.join(DATA_DIR, "pastes");
  await fs.mkdir(dir, { recursive: true });
  const fileName = `${expId}.${ext}`;
  await fs.writeFile(path.join(dir, fileName), block[2]);
  const projects = await readJson(PROJECTS_FILE, []);
  let proj = projects.find((p) => p.hidden && p.path === dir);
  if (!proj) {
    proj = {
      id: makeId(),
      name: "Pastes",
      path: dir,
      addedAt: Date.now(),
      hidden: true,
    };
    projects.push(proj);
    await writeJson(PROJECTS_FILE, projects);
  }
  return { projectId: proj.id, filePath: fileName };
}

async function buildProjectContext(projectId, task, opts = {}) {
  const maxFiles = opts.maxFiles || MAX_CONTEXT_FILES;
  const maxSize = opts.maxSize || MAX_CONTEXT_FILE_SIZE;
  const projects = await readJson(PROJECTS_FILE, []);
  const project = projects.find((p) => p.id === projectId);
  if (!project) return null;
  const scan = await scanProject(project.path);
  const keywords = taskKeywords(task);
  const ranked = [];
  for (const f of scan.files) {
    if (!isTextFile(f.name) || f.size > maxSize) continue;
    let score = scoreFile(f, keywords);
    if (score === 0) {
      try {
        const abs = resolveSafe(project.path, f.path);
        if (!abs) continue;
        const content = await fs.readFile(abs, "utf-8");
        const lower = content.toLowerCase();
        for (const kw of keywords) {
          if (lower.includes(kw)) score += 1;
        }
      } catch {}
    }
    if (score > 0) ranked.push({ ...f, score });
  }
  ranked.sort((a, b) => b.score - a.score);
  if (ranked.length > MAX_CONTEXT_FILES) ranked.length = MAX_CONTEXT_FILES;
  const readFiles = [];
  for (const f of ranked) {
    if (f.score === 0) continue;
    try {
      const abs = resolveSafe(project.path, f.path);
      if (!abs) continue;
      const content = await fs.readFile(abs, "utf-8");
      readFiles.push({ path: f.path, content: content.slice(0, maxSize) });
    } catch {}
  }
  return {
    project: { id: project.id, name: project.name, path: project.path },
    totalFiles: scan.totalFiles,
    stats: scan.stats,
    countsByExt: scan.counts,
    relevantFiles: readFiles,
  };
}

function isDebugTask(task) {
  return /debug|error|exception|undefined|cannot read properties|is not a function|is not defined|typeerror|referenceerror|syntaxerror|rangeerror|stack trace|^at |failed/i.test(
    task,
  );
}

const DIAG_LABELS = {
  likelycause: "cause",
  location: "location",
  why: "why",
  suggestedfix: "fix",
  confidence: "confidence",
};

function parseDiagnosis(markdown) {
  const d = {
    cause: null,
    location: null,
    why: null,
    fix: null,
    confidence: null,
  };
  let current = null;
  let fenceOpen = false;
  for (const line of markdown.split("\n")) {
    if (/^##\s+/i.test(line)) {
      current = null;
      fenceOpen = false;
      continue;
    }
    const m = line.match(
      /^[-*]?\s*(Likely cause|Location|Why|Suggested fix|Confidence)\s*:\s*(.*)$/i,
    );
    if (m) {
      const key = DIAG_LABELS[m[1].toLowerCase().replace(/\s+/g, "")];
      const val = m[2].trim();
      if (key === "confidence") {
        d.confidence = parseInt(val, 10) || null;
        current = null;
        fenceOpen = false;
      } else {
        d[key] = val;
        current = key;
        fenceOpen = /^```/.test(val);
      }
      continue;
    }
    if (!current) continue;
    const trimmed = line.trim();

    if (/^[-*]\s*(critical|warning|suggestion|info)\s*:/i.test(trimmed)) {
      current = null;
      fenceOpen = false;
      continue;
    }
    if (fenceOpen) {
      d[current] += "\n" + line;
      if (/^```/.test(trimmed)) {
        current = null;
        fenceOpen = false;
      }
    } else {
      d[current] += "\n" + trimmed;
    }
  }
  for (const k of Object.keys(d)) {
    if (typeof d[k] === "string") d[k] = d[k].trim() || null;
  }
  return d;
}

function parseSteps(markdown) {
  const lines = markdown.split("\n");
  const steps = [];
  const findings = [];
  let inFindings = false;
  let inDiagnosis = false;
  for (const line of lines) {
    if (line.startsWith("# ") || line.trim() === "") continue;
    if (line.startsWith("## ")) {
      const h = line.toLowerCase();
      inFindings = h.includes("finding") || h.includes("result");
      inDiagnosis = h.includes("diagnosis");
      continue;
    }
    if (inFindings) {
      findings.push(line.replace(/^[-*•]\s*/, "").trim());
    } else if (
      !inDiagnosis &&
      (line.startsWith("- ") || line.startsWith("* "))
    ) {
      steps.push(line.replace(/^[-*•]\s*/, "").trim());
    }
  }
  return { steps: steps.filter(Boolean), findings: findings.filter(Boolean) };
}

function systemPromptUi() {
  return `You are Hermes, an AI developer assistant analyzing a UI screenshot. The user may follow up with questions ("give me a better direction", "what about mobile?", "how should I fix the spacing?"). Always answer the latest message, referencing the screenshot and your earlier analysis when relevant.
Respond in plain language (Taglish is fine — a mix of Tagalog and English is OK).
Never use emojis or emoji symbols anywhere in your responses.

Structure your response EXACTLY like this — the sections and labels are parsed automatically:

# <short title>

## Layout
- <one finding about layout, hierarchy or spacing>

## Responsive
- <one finding about responsive behavior>

## UX
- <one finding about usability or visual hierarchy>

## Recommendation
<concrete next direction, with specific actionable suggestions>`;
}

function parseUiAnalysis(markdown) {
  const out = { layout: [], responsive: [], ux: [], recommendation: "" };
  let section = null;
  for (const line of markdown.split("\n")) {
    const t = line.trim();
    const h = t.match(/^##\s+(.+)$/i);
    if (h) {
      const name = h[1].toLowerCase();
      if (name.includes("layout")) section = "layout";
      else if (name.includes("responsive")) section = "responsive";
      else if (name.includes("ux") || name.includes("user experience"))
        section = "ux";
      else if (name.includes("recommend")) section = "recommendation";
      else section = null;
      continue;
    }
    if (!section) continue;
    if (section === "recommendation") {
      if (t)
        out.recommendation +=
          (out.recommendation ? " " : "") + t.replace(/^[-*]\s*/, "");
    } else if (t.startsWith("-") || t.startsWith("*")) {
      out[section].push(t.replace(/^[-*]\s*/, "").trim());
    }
  }
  return out;
}

async function runUiAnalysis(id, task, imageDataUrl) {
  await updateExp(id, {
    progress: [
      "Understanding request",
      "Identifying relevant files",
      "Inspecting code flow",
      "Finding suspicious behavior",
    ],
  });
  let aiStart = Date.now();
  const raw = (
    await callAI([
      { role: "system", content: systemPromptUi() },
      {
        role: "user",
        content: [
          { type: "text", text: task || "Analyze this UI screenshot" },
          { type: "image_url", image_url: { url: imageDataUrl } },
        ],
      },
    ])
  ).content;
  const aiCallMs = Date.now() - aiStart;
  const aiResult = stripEmojis(raw);
  const uiAnalysis = parseUiAnalysis(aiResult);
  const { findings } = parseSteps(aiResult);

  const updated = await readJson(EXPERIMENTS_FILE, []);
  const exp = updated.find((e) => e.id === id);
  if (!exp) return;
  if (exp.status !== "running") return;
  exp.status = "completed";
  exp.progress = PIPELINE;
  exp.steps = [
    "Inspecting screenshot",
    "Analyzing layout",
    "Checking responsive behavior",
    "Reviewing UX",
    "Preparing recommendation",
  ];
  exp.findings = findings;
  exp.uiAnalysis = uiAnalysis;
  exp.answer = aiResult;
  exp.contextFiles = [];
  exp.contextBuildMs = 0;
  exp.aiCallMs = aiCallMs;
  exp.completedAt = Date.now();
  exp.messages.push({
    role: "assistant",
    content: aiResult,
    createdAt: Date.now(),
  });
  await writeJson(EXPERIMENTS_FILE, updated);
  triggerAutoLearn(id).catch(() => {});
}

async function callAI(messages, opts = {}) {
  return getAiRouter().generate(messages, {
    ...opts,
    tools: opts.toolCalling ? API_TOOLS : [],
  });
}

const ROUTER_ACTIONS = new Set([
  "normal_ai",
  "search_conversation_history",
  "get_previous_conversation",
  "search_memory",
  "search_project_knowledge",
  "search_experiments",
]);

function parseRouterAction(content) {
  const text = String(content || "").trim();
  const candidate = text.match(/\{[\s\S]*\}/)?.[0];
  if (!candidate) return { action: "normal_ai" };
  try {
    const parsed = JSON.parse(candidate);
    return {
      action: ROUTER_ACTIONS.has(parsed.action) ? parsed.action : "normal_ai",
      target: typeof parsed.target === "string" ? parsed.target : null,
      query: typeof parsed.query === "string" ? parsed.query : null,
    };
  } catch {
    return { action: "normal_ai" };
  }
}

async function routeUserIntent(message) {
  if (isContinuationTask(message)) return { action: "normal_ai" };
  try {
    const result = await callAI([
      {
        role: "system",
        content: `You are Hermes intent router. Do not answer the user. Return JSON only with this schema: {"action":"normal_ai|search_conversation_history|get_previous_conversation|search_memory|search_project_knowledge|search_experiments","target":"previous_conversation|topic|memory|project|experiments|null","query":"optional search topic or null"}.

Choose a conversation-history action whenever the user asks what they said, asked, discussed, did, or wanted before — in ANY language (English, Tagalog, Spanish, etc.).

Use get_previous_conversation for questions like:
- "What did I ask last time?"
- "Ano ang huli kong sinabi?"
- "Do you remember what we discussed?"
- "Yung tinanong ko kanina"
- Any phrase asking about previous conversations or past questions

Use search_conversation_history with target "topic" and a query for named older topics.

Use normal_ai for ordinary requests — coding, debugging, questions, tasks.

IMPORTANT: When in doubt about whether the user is asking about a past conversation, choose the conversation-history action. It is better to check and find nothing than to miss a recall request.`,
      },
      { role: "user", content: String(message || "") },
    ]);
    return parseRouterAction(result.content);
  } catch {
    return { action: "normal_ai" };
  }
}

let aiRouter = null;
function getAiRouter() {
  if (!aiRouter) aiRouter = createRouter(process.env);
  return aiRouter;
}

const MAX_TOOL_ROUNDS = 6;

const TOOL_DEFS = [
  {
    name: "read_file",
    desc: 'Read a file from the attached project. Args: {"path": "src/login.js"}',
  },
  {
    name: "search_files",
    desc: 'Search text inside the attached project\'s files. Args: {"query": "login"}',
  },
  {
    name: "scan_project",
    desc: "Summarize the attached project (file counts by type, total files). Args: {}",
  },
  {
    name: "calculate",
    desc: 'Evaluate a math expression. Args: {"expression": "2 + 3 * 4"}. Supports + - * / % ^, parentheses, and functions sqrt, abs, round, floor, ceil, sin, cos, tan, log, log10, exp, min, max, pi, e.',
  },
  {
    name: "parse_json",
    desc: 'Validate and format JSON. Args: {"input": "{\"a\": 1}"}',
  },
  {
    name: "search_web",
    desc: 'Search the web for information. Args: {"query": "supabase rate limits 2026"}',
  },
  {
    name: "analyze_image",
    desc: 'Run vision analysis on an image file in the project. Args: {"path": "assets/logo.png"}',
  },
  {
    name: "modify_file",
    desc: 'Edit a file in the project: replace an exact snippet. Args: {"path": "src/login.js", "from": "old code", "to": "new code"}. Gated by trust level.',
  },
  {
    name: "execute_command",
    desc: 'Run a shell command in the project folder. Args: {"command": "npm test"}. Gated by trust level.',
  },
  {
    name: "git",
    desc: 'Git operations in the project. Args: {"operation": "status|diff|log|branch|show|commit", "message": "commit message"}. Gated by trust level.',
  },
];

const API_TOOLS = TOOL_DEFS.map((t) => ({
  type: "function",
  function: {
    name: t.name,
    description: t.desc,
    parameters: { type: "object", additionalProperties: true },
  },
}));

const HIGH_RISK_FILE =
  /auth|login|password|secret|api[_-]?key|token|\.env|database|db[._-]|supabase|firebase|payment|billing|stripe|migration|schema|webhook|credential|admin/i;
const MEDIUM_RISK_FILE =
  /state|store|server|api[./]|route|controller|service|util|helper|index\.(js|ts|jsx|tsx)/i;
const LOW_RISK_FILE =
  /\.css$|\.scss$|\.html$|readme|\.md$|comment|format|typo/i;

const HIGH_RISK_CMD =
  /npm (install|i\b|add|remove|rm|uninstall)|yarn (add|remove)|pnpm (add|remove)|pip install|gem install|sudo|rm(\s|$)|rmdir|drop\s+(table|database|column)|truncate|git (push|reset --hard|clean -f|force|rebase|merge)|curl .*\| *(sh|bash)|wget .*\| *(sh|bash)|chmod|chown|killall|pkill|taskkill|shutdown|mkfs|dd\b/i;
const LOW_RISK_CMD =
  /npm (test|run (build|lint|typecheck|check|verify)|(tsc|eslint|oxlint))\b|yarn (test|build|lint)\b|pnpm (test|build|lint)\b|node --check|tsc --noEmit|git (status|diff|log|branch|show)\b|python .*pytest/i;

const RISK_RANK = { low: 1, medium: 2, high: 3 };
const TRUST_AUTO = { 1: 0, 2: 1, 3: 2 };

function assessRisk(tool, args) {
  if (tool === "modify_file") {
    const p = String(args.path || "");
    if (HIGH_RISK_FILE.test(p))
      return {
        level: "high",
        reason:
          "Touches a sensitive area (auth, credentials, database, or config).",
      };
    if (MEDIUM_RISK_FILE.test(p) && !LOW_RISK_FILE.test(p))
      return {
        level: "medium",
        reason: "Core code that could affect behavior elsewhere.",
      };
    return { level: "low", reason: "Low-impact file change." };
  }
  if (tool === "execute_command") {
    const c = String(args.command || "");
    if (/\b(?:powershell|pwsh)(?:\.exe)?\b/i.test(c)) {
      return {
        level: "high",
        reason:
          "PowerShell commands always require explicit approval before they run.",
      };
    }
    if (HIGH_RISK_CMD.test(c))
      return {
        level: "high",
        reason: "Command looks destructive, persistent, or network-touching.",
      };
    if (LOW_RISK_CMD.test(c))
      return { level: "low", reason: "Read-only check or test/build command." };
    return { level: "medium", reason: "Command may change project state." };
  }
  if (tool === "git") {
    const op = String(args.operation || args.command || "");
    if (/push|reset --hard|clean|rebase|force/i.test(op))
      return { level: "high", reason: "Destructive or remote git operation." };
    if (/commit|tag|branch -d|merge/i.test(op))
      return { level: "medium", reason: "Mutates git history." };
    return { level: "low", reason: "Read-only git operation." };
  }
  return { level: "low", reason: "" };
}

function gatedToolDecision(tool, args, trustLevel, allowed) {
  if (tool !== "modify_file" && tool !== "execute_command" && tool !== "git") {
    return { action: "run" };
  }
  const isPowerShell =
    tool === "execute_command" &&
    /\b(?:powershell|pwsh)(?:\.exe)?\b/i.test(String(args.command || ""));
  if (isPowerShell) return { action: "ask", risk: assessRisk(tool, args) };
  if (allowed.includes(tool)) return { action: "run" };
  if (trustLevel === 1) {
    return {
      action: "block",
      reason:
        "Trust level is Level 1 (suggest only) — the user applies changes manually. Suggest the change instead of performing it.",
    };
  }
  const risk = assessRisk(tool, args);
  if (RISK_RANK[risk.level] > TRUST_AUTO[trustLevel])
    return { action: "ask", risk };
  return { action: "run", risk };
}

function runCommand(command, cwd) {
  return new Promise((resolve) => {
    exec(
      command,
      { cwd, timeout: 30000, maxBuffer: 1024 * 1024, windowsHide: true },
      (err, stdout, stderr) => {
        resolve({
          exitCode: err ? (err.code ?? 1) : 0,
          timedOut: !!err?.killed,
          stdout: String(stdout || "").slice(0, 20000),
          stderr: String(stderr || "").slice(0, 5000),
        });
      },
    );
  });
}

async function loadProject(projectId) {
  if (!projectId) return null;
  const projects = await readJson(PROJECTS_FILE, []);
  return projects.find((p) => p.id === projectId) || null;
}

function safeEvaluate(expression) {
  const src = String(expression ?? "").trim();
  if (!src) throw new Error("calculate requires an expression");
  if (src.length > 500) throw new Error("Expression too long");
  if (/[^0-9a-zA-Z+\-*/().,%^ \t]/.test(src))
    throw new Error("Unsupported characters in expression");
  let pos = 0;
  const peek = () => src[pos];
  const skipWs = () => {
    while (pos < src.length && /\s/.test(src[pos])) pos++;
  };
  const parseExpr = () => {
    let v = parseTerm();
    while (true) {
      skipWs();
      if (peek() === "+" || peek() === "-") {
        const op = peek();
        pos++;
        const r = parseTerm();
        v = op === "+" ? v + r : v - r;
      } else break;
    }
    return v;
  };
  const parseTerm = () => {
    let v = parseFactor();
    while (true) {
      skipWs();
      if (peek() === "*" || peek() === "/" || peek() === "%") {
        const op = peek();
        pos++;
        const r = parseFactor();
        if (op === "*") v = v * r;
        else if (op === "/") {
          if (r === 0) throw new Error("Division by zero");
          v = v / r;
        } else {
          if (r === 0) throw new Error("Modulo by zero");
          v = v % r;
        }
      } else break;
    }
    return v;
  };
  const parseFactor = () => {
    const v = parseUnary();
    skipWs();
    if (peek() === "^") {
      pos++;
      return Math.pow(v, parseUnary());
    }
    return v;
  };
  const parseUnary = () => {
    if (peek() === "-") {
      pos++;
      return -parseUnary();
    }
    if (peek() === "+") {
      pos++;
      return parseUnary();
    }
    return parsePrimary();
  };
  const parsePrimary = () => {
    skipWs();
    if (peek() === "(") {
      pos++;
      const v = parseExpr();
      skipWs();
      if (peek() !== ")") throw new Error("Expected )");
      pos++;
      return v;
    }
    const ident = src.slice(pos).match(/^[a-zA-Z_]+/);
    if (ident) {
      const name = ident[0].toLowerCase();
      pos += ident[0].length;
      skipWs();
      if (peek() === "(") {
        pos++;
        skipWs();
        const args = [];
        if (peek() !== ")") {
          args.push(parseExpr());
          while (peek() === ",") {
            pos++;
            args.push(parseExpr());
          }
        }
        skipWs();
        if (peek() !== ")") throw new Error("Expected )");
        pos++;
        return applyFunction(name, args);
      }
      const consts = { pi: Math.PI, e: Math.E };
      if (name in consts) return consts[name];
      throw new Error(`Unknown function or constant: ${ident[0]}`);
    }
    const num = src.slice(pos).match(/^\d*\.?\d+(?:e[+-]?\d+)?/i);
    if (num) {
      pos += num[0].length;
      return parseFloat(num[0]);
    }
    throw new Error(`Unexpected character at position ${pos}`);
  };
  const applyFunction = (name, args) => {
    const fns = {
      sqrt: [1, Math.sqrt],
      abs: [1, Math.abs],
      round: [1, Math.round],
      floor: [1, Math.floor],
      ceil: [1, Math.ceil],
      sin: [1, Math.sin],
      cos: [1, Math.cos],
      tan: [1, Math.tan],
      log: [1, Math.log],
      log10: [1, Math.log10],
      exp: [1, Math.exp],
      min: [-1, (...a) => Math.min(...a)],
      max: [-1, (...a) => Math.max(...a)],
    };
    const f = fns[name];
    if (!f) throw new Error(`Unknown function: ${name}`);
    if (f[0] !== -1 && args.length !== f[0])
      throw new Error(`${name} expects ${f[0]} argument(s)`);
    return f[1](...args);
  };
  const value = parseExpr();
  skipWs();
  if (pos < src.length)
    throw new Error(`Unexpected trailing input at position ${pos}`);
  if (!Number.isFinite(value)) throw new Error("Result is not a finite number");
  return value;
}

function parseJsonTool(input) {
  const text = String(input ?? "").trim();
  if (!text) throw new Error("parse_json requires an input");
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    const m = String(err.message).match(/position (\d+)/);
    return {
      valid: false,
      error: err.message,
      position: m ? parseInt(m[1], 10) : null,
    };
  }
  const summarize = (v, depth = 0) => {
    if (depth > 3) return "...";
    if (Array.isArray(v))
      return {
        type: "array",
        length: v.length,
        sample: v.slice(0, 5).map((x) => summarize(x, depth + 1)),
      };
    if (v && typeof v === "object") {
      const keys = Object.keys(v).slice(0, 20);
      return {
        type: "object",
        keyCount: Object.keys(v).length,
        keys,
        sample: Object.fromEntries(
          keys.map((k) => [k, summarize(v[k], depth + 1)]),
        ),
      };
    }
    return v;
  };
  return {
    valid: true,
    type: Array.isArray(parsed) ? "array" : typeof parsed,
    pretty: JSON.stringify(parsed, null, 2).slice(0, 20000),
    summary: summarize(parsed),
  };
}

async function searchWeb(query) {
  const key = process.env.BRAVE_API_KEY;
  if (key) {
    const res = await fetch(
      `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=8`,
      {
        headers: { Accept: "application/json", "X-Subscription-Token": key },
        signal: AbortSignal.timeout(12000),
      },
    );
    if (!res.ok) throw new Error(`Web search failed (${res.status})`);
    const data = await res.json();
    return {
      results: (data?.web?.results || []).slice(0, 8).map((r) => ({
        title: r.title,
        url: r.url,
        text: r.description || "",
      })),
    };
  }

  const res = await fetch(
    `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}&kl=us-en`,
    {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: AbortSignal.timeout(15000),
    },
  );
  if (!res.ok) throw new Error(`Web search failed (${res.status})`);
  const html = await res.text();
  const results = parseDuckDuckGoHtml(html);
  if (results.length) {
    return {
      results: results.slice(0, 8),
      note: "Free keyless web search (DuckDuckGo). No API key needed.",
    };
  }

  const res2 = await fetch(
    `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1&t=hermes`,
    { signal: AbortSignal.timeout(12000) },
  );
  if (!res2.ok) throw new Error(`Web search failed (${res2.status})`);
  const data = await res2.json();
  const fallback = [];
  if (data.AbstractText)
    fallback.push({
      title: data.Heading || "Answer",
      url: data.AbstractURL || "",
      text: data.AbstractText,
    });
  const walk = (topics) => {
    for (const t of topics || []) {
      if (t.Topics) walk(t.Topics);
      else if (t.Text && t.FirstURL)
        fallback.push({
          title: t.Text.split(" - ")[0],
          url: t.FirstURL,
          text: t.Text,
        });
    }
  };
  walk(data.RelatedTopics);
  return {
    results: fallback.slice(0, 8),
    note: "Free keyless web search (DuckDuckGo). No API key needed.",
  };
}

function parseDuckDuckGoHtml(html) {
  const results = [];
  const titles = [
    ...html.matchAll(
      /<a rel="nofollow" class="result__a" href="([^"]*)"[^>]*>(.*?)<\/a>/gs,
    ),
  ].map((m) => ({
    url: decodeDdgUrl(m[1]),
    title: m[2].replace(/<[^>]+>/g, "").trim(),
  }));
  const snippets = [
    ...html.matchAll(/class="result__snippet"[^>]*>(.*?)<\/a>/gs),
  ].map((m) => m[1].replace(/<[^>]+>/g, "").trim());
  titles.forEach((t, i) => {
    if (t.title && t.url)
      results.push({ title: t.title, url: t.url, text: snippets[i] || "" });
  });
  return results;
}

function decodeDdgUrl(href) {
  const m = href.match(/uddg=([^&]+)/);
  return m ? decodeURIComponent(m[1]) : href;
}

async function searchProjectFiles(project, query, limit = 50) {
  const q = String(query || "").toLowerCase();
  if (q.length < 2) return [];
  const scan = await scanProject(project.path);
  const matches = [];
  let scanned = 0;
  for (const f of scan.files) {
    if (!isTextFile(f.name) || f.size > MAX_READ_SIZE) continue;
    if (++scanned > MAX_SEARCH_FILES) break;
    try {
      const abs = resolveSafe(project.path, f.path);
      if (!abs) continue;
      const content = await fs.readFile(abs, "utf-8");
      const idx = content.toLowerCase().indexOf(q);
      if (idx !== -1) {
        const start = Math.max(0, idx - 60);
        matches.push({
          path: f.path,
          snippet: content
            .slice(start, idx + q.length + 120)
            .replace(/\s+/g, " ")
            .trim(),
        });
      }
    } catch {}
    if (matches.length >= limit) break;
  }
  return matches;
}

async function readProjectFile(project, rel) {
  const abs = resolveSafe(project.path, rel);
  if (!abs) throw new Error(`Invalid path: ${rel}`);
  const st = await fs.stat(abs).catch(() => null);
  if (!st || !st.isFile()) throw new Error(`File not found: ${rel}`);
  if (st.size > MAX_READ_SIZE)
    throw new Error(`File too large to read: ${rel}`);
  const content = await fs.readFile(abs, "utf-8");
  return { path: rel, content };
}

async function executeTool(name, args, ctx) {
  const project = ctx.project || null;
  switch (name) {
    case "read_file": {
      const p = String(args.path || "").trim();
      if (!p) throw new Error('read_file requires a "path" argument');
      if (!project)
        throw new Error(
          "No project attached — attach a project first, then I can read files.",
        );
      const f = await readProjectFile(project, p);
      return {
        path: f.path,
        content: f.content.slice(0, MAX_CONTEXT_FILE_SIZE),
      };
    }
    case "search_files": {
      const q = String(args.query || "").trim();
      if (!q) throw new Error('search_files requires a "query" argument');
      if (!project)
        throw new Error(
          "No project attached — attach a project first, then I can search files.",
        );
      const matches = await searchProjectFiles(project, q, 15);
      if (!matches.length) return { matches: [], note: "No matches found" };
      return { matches, count: matches.length };
    }
    case "scan_project": {
      if (!project)
        throw new Error("No project attached — attach a project first.");
      const scan = await scanProject(project.path);
      return {
        project: project.name,
        totalFiles: scan.totalFiles,
        stats: scan.stats,
        countsByExt: scan.counts,
      };
    }
    case "calculate": {
      return {
        expression: String(args.expression ?? ""),
        result: safeEvaluate(args.expression),
      };
    }
    case "parse_json": {
      return parseJsonTool(args.input);
    }
    case "search_web": {
      const q = String(args.query || "").trim();
      if (!q) throw new Error('search_web requires a "query" argument');
      return searchWeb(q);
    }
    case "analyze_image": {
      const p = String(args.path || "").trim();
      if (!p) throw new Error('analyze_image requires a "path" argument');
      if (!project)
        throw new Error(
          "No project attached — attach a project first, then I can analyze image files.",
        );
      const abs = resolveSafe(project.path, p);
      if (!abs) throw new Error(`Invalid path: ${p}`);
      const st = await fs.stat(abs).catch(() => null);
      if (!st || !st.isFile()) throw new Error(`File not found: ${p}`);
      const ext = path.extname(p).replace(".", "").toLowerCase();
      const mime = {
        png: "image/png",
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        webp: "image/webp",
        gif: "image/gif",
      }[ext];
      if (!mime) throw new Error(`Unsupported image type: ${ext}`);
      if (st.size > MAX_IMAGE_BYTES)
        throw new Error("Image too large to analyze");
      const buf = await fs.readFile(abs);
      const dataUrl = `data:${mime};base64,${buf.toString("base64")}`;
      const raw = (
        await callAI([
          {
            role: "system",
            content:
              "You are Hermes, an AI developer assistant analyzing an image file from the user's project. Describe what the image contains and note anything relevant to the user's task. Respond in plain language, no emojis.",
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Analyze this image file and describe what you see.",
              },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
          },
        ])
      ).content;
      return { analysis: stripEmojis(raw) };
    }
    case "modify_file": {
      const p = String(args.path || "").trim();
      const from = String(args.from ?? "");
      const to = String(args.to ?? "");
      if (!p || !from)
        throw new Error(
          'modify_file requires {"path":"...", "from":"exact existing text", "to":"replacement text"}; no file was changed.',
        );
      if (!project)
        throw new Error("No project attached — attach a project first.");
      const file = await readProjectFile(project, p);
      const occurrences = file.content.split(from).length - 1;
      if (occurrences === 0)
        throw new Error(`The code to replace was not found in ${p}.`);
      if (occurrences > 1)
        throw new Error(
          `The code to replace appears ${occurrences} times in ${p} — be more specific.`,
        );
      const newContent = file.content.replace(from, () => to);
      await fs.writeFile(resolveSafe(project.path, p), newContent, "utf-8");
      return { path: p, replaced: from, replacement: to };
    }
    case "execute_command": {
      const command = String(args.command || "").trim();
      if (!command)
        throw new Error('execute_command requires a "command" argument');
      if (!project)
        throw new Error("No project attached — attach a project first.");
      const result = await runCommand(command, project.path);
      return { command, ...result };
    }
    case "git": {
      const op = String(args.operation || args.command || "").trim();
      if (!op)
        throw new Error(
          'git requires an "operation" (status, diff, log, branch, show, commit)',
        );
      if (!project)
        throw new Error("No project attached — attach a project first.");
      const allowedOps = new Set([
        "status",
        "diff",
        "log",
        "branch",
        "show",
        "commit",
      ]);
      if (!allowedOps.has(op))
        throw new Error(`Unsupported git operation: ${op}`);
      let cmd = "git";
      if (op === "status") cmd += " status --short";
      else if (op === "diff") cmd += " diff --stat";
      else if (op === "log") cmd += " log --oneline -15";
      else if (op === "branch") cmd += " branch --show-current";
      else if (op === "show") cmd += " show --stat HEAD";
      else if (op === "commit") {
        const msg = String(args.message || "")
          .trim()
          .replace(/[$`\\\n]/g, "");
        if (!msg) throw new Error('git commit requires a "message"');
        cmd += ` commit -m ${JSON.stringify(msg)}`;
      }
      const result = await runCommand(cmd, project.path);
      return { operation: op, ...result };
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

function parseToolRequests(text) {
  const requests = [];
  const re = /TOOL:\s*([a-z_]+)/gi;
  let m;
  while ((m = re.exec(text)) !== null) {
    const name = m[1].toLowerCase();
    const after = text.slice(m.index + m[0].length);
    const window = after.split("\n").slice(0, 2).join("\n");
    const braceStart = window.indexOf("{");
    const braceEnd = braceStart >= 0 ? extractJsonEnd(window, braceStart) : -1;
    let args = {};
    if (braceEnd > braceStart) {
      const raw = after.slice(braceStart, braceEnd + 1);
      try {
        args = JSON.parse(raw);
      } catch {
        args = { raw };
      }
    }
    requests.push({ name, args });
  }
  return requests;
}

function extractJsonEnd(s, start) {
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
    } else if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

async function agentLoopStep(
  expId,
  thread,
  projectId,
  trustLevel,
  allowed,
  toolLog,
) {
  const ctxProject = await loadProject(projectId);
  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const check = await readJson(EXPERIMENTS_FILE, []);
    const cur = check.find((e) => e.id === expId);
    if (!cur || cur.status !== "running")
      return { done: true, cancelled: true, toolLog };
    const { content, toolCalls } = await callAI(thread, { toolCalling: true });
    let requests;
    let native = false;
    if (toolCalls.length) {
      native = true;
      requests = toolCalls.map((c) => ({
        id: c.id,
        name: c.name,
        args: c.args,
      }));
    } else {
      requests = parseToolRequests(content);
    }
    if (!requests.length) {
      return { done: true, answer: stripEmojis(content), toolLog };
    }
    const results = [];
    let pause = null;
    for (const r of requests) {
      const decision = gatedToolDecision(r.name, r.args, trustLevel, allowed);
      if (decision.action === "ask") {
        pause = {
          approvalId: makeId(),
          tool: r.name,
          args: r.args,
          risk: decision.risk,
          explanation:
            r.name === "execute_command"
              ? `Run this command in the attached project folder: ${String(r.args.command || "(missing command)")}`
              : r.name === "modify_file"
                ? `Replace one exact text block in ${String(r.args.path || "(missing path)")}.`
                : `Perform ${r.name.replace(/_/g, " ")} with the supplied arguments.`,
        };
        break;
      }
      if (decision.action === "block") {
        results.push({ ...r, error: decision.reason });
        toolLog.push({ name: r.name, args: r.args, error: decision.reason });
        continue;
      }
      try {
        const result = await executeTool(r.name, r.args, {
          project: ctxProject,
        });
        results.push({ ...r, result });
        toolLog.push({ name: r.name, args: r.args });
      } catch (err) {
        results.push({ ...r, error: err.message });
        toolLog.push({ name: r.name, args: r.args, error: err.message });
      }
    }
    if (pause) {
      const updated = await readJson(EXPERIMENTS_FILE, []);
      const exp = updated.find((e) => e.id === expId);
      if (!exp) return { done: true, toolLog };
      exp.agent = {
        thread: native
          ? thread
          : [
              ...thread,
              { role: "assistant", content },
              ...textToolResults(results),
            ],
        projectId,
        toolLog,
        allowed,
        trustLevel,
        pending: pause,
      };
      exp.status = "needs_approval";
      await writeJson(EXPERIMENTS_FILE, updated);
      return { done: false, toolLog };
    }
    if (native) {
      thread = [
        ...thread,
        {
          role: "assistant",
          content: content || "",
          tool_calls: toolCalls.map((c) => ({
            id: c.id,
            type: "function",
            function: { name: c.name, arguments: JSON.stringify(c.args) },
          })),
        },
        ...results.map((r) => ({
          role: "tool",
          tool_call_id: r.id,
          content: JSON.stringify(r.error ? { error: r.error } : r.result),
        })),
      ];
    } else {
      thread = [
        ...thread,
        { role: "assistant", content },
        ...textToolResults(results),
      ];
    }
  }
  const last = [...thread].reverse().find((m) => m.role === "assistant");
  return {
    done: true,
    answer:
      stripEmojis(String(last?.content || "")) +
      `\n\n(Note: stopped after ${MAX_TOOL_ROUNDS} tool rounds.)`,
    toolLog,
  };
}

function textToolResults(results) {
  return results.map((r) => ({
    role: "user",
    content: `TOOL RESULT: ${r.name} ${JSON.stringify(r.error ? { error: r.error } : r.result)}`,
  }));
}

async function finalizeAgentExperiment(expId, answer, toolLog, aiCallMs) {
  const updated = await readJson(EXPERIMENTS_FILE, []);
  const exp = updated.find((e) => e.id === expId);
  if (!exp) return;
  if (exp.status !== "running") return;
  exp.status = "completed";
  exp.progress = PIPELINE;
  exp.answer = answer;
  exp.toolCalls = toolLog;
  const { steps: parsedSteps, findings } = parseSteps(answer);
  exp.steps = parsedSteps.length ? parsedSteps : [...PIPELINE];
  exp.findings = findings;
  exp.aiCallMs = aiCallMs;
  exp.completedAt = Date.now();
  exp.messages.push({
    role: "assistant",
    content: answer,
    createdAt: Date.now(),
  });
  await writeJson(EXPERIMENTS_FILE, updated);
  broadcaster.complete(expId, {
    status: "completed",
    answer,
    findings,
    steps: exp.steps,
  });
  triggerAutoLearn(expId).catch(() => {});
}

async function startAgentLoop(expId, thread, projectId, trustLevel) {
  const updated = await readJson(EXPERIMENTS_FILE, []);
  const exp = updated.find((e) => e.id === expId);
  if (!exp) return;
  exp.messages = (exp.messages || []).map((m) =>
    m.pending
      ? { role: m.role, content: m.content, createdAt: m.createdAt }
      : m,
  );
  exp.agent = {
    thread,
    projectId,
    toolLog: [],
    allowed: [],
    trustLevel,
    pending: null,
  };
  await writeJson(EXPERIMENTS_FILE, updated);
  await runAgentLoopForExp(expId);
}

async function runAgentLoopForExp(expId) {
  const aiStart = Date.now();
  try {
    const updated = await readJson(EXPERIMENTS_FILE, []);
    const exp = updated.find((e) => e.id === expId);
    if (!exp || !exp.agent) return;
    const { thread, projectId, toolLog, allowed, trustLevel } = exp.agent;
    const out = await agentLoopStep(
      expId,
      thread,
      projectId,
      trustLevel,
      allowed,
      toolLog,
    );
    if (out.done && !out.cancelled) {
      await finalizeAgentExperiment(
        expId,
        out.answer,
        out.toolLog,
        Date.now() - aiStart,
      );
    }
  } catch (err) {
    const updated = await readJson(EXPERIMENTS_FILE, []);
    const exp = updated.find((e) => e.id === expId);
    if (!exp) return;
    if (exp.status !== "running") return;
    exp.status = "failed";
    exp.error = err.message;
    exp.completedAt = Date.now();
    await writeJson(EXPERIMENTS_FILE, updated);
    broadcaster.error(expId, err.message);
  }
}

async function runBridgedExperiment(
  expId,
  task,
  projectId,
  context,
  memoryText,
  trustLevel,
  history,
) {
  const bridge = await readBridgeConfig();
  if (!bridge.enabled) return false;
  const project = projectId ? await loadProject(projectId) : null;
  if (!project) return false;
  const updated0 = await readJson(EXPERIMENTS_FILE, []);
  const exp0 = updated0.find((e) => e.id === expId);
  if (!exp0 || exp0.status !== "running") return true;
  exp0.contextFiles = [...(context?.relevantFiles?.map((f) => f.path) || [])];
  exp0.progress = [
    "Understanding request",
    "Identifying relevant files",
    "Handing off to Hermes Agent",
  ];
  await writeJson(EXPERIMENTS_FILE, updated0);

  const before = await snapshotProject(project.path);
  let agentOut;
  try {
    agentOut = await callAgentApi({
      ...bridge,
      messages: [
        {
          role: "system",
          content: buildHandoffSystem(project, TRUST_LEVELS[trustLevel]?.label),
        },
        {
          role: "user",
          content: buildHandoffUser({
            task,
            project,
            context,
            memoryText,
            history,
          }),
        },
      ],
    });
  } catch (err) {
    const updated = await readJson(EXPERIMENTS_FILE, []);
    const exp = updated.find((e) => e.id === expId);
    if (exp && exp.status === "running") {
      exp.progress = ["Understanding request", "Identifying relevant files"];
      exp.bridge = { handedOff: false, fallback: true, error: err.message };
      await writeJson(EXPERIMENTS_FILE, updated);
    }
    return false;
  }

  const answer = stripEmojis(agentOut.content);
  const after = await snapshotProject(project.path);
  const diff = diffSnapshots(before, after);

  let verify = null;
  if (bridge.verifyCommand) {
    const verifyIsPowerShell = /\b(?:powershell|pwsh)(?:\.exe)?\b/i.test(
      bridge.verifyCommand,
    );
    if (verifyIsPowerShell) {
      verify = {
        command: bridge.verifyCommand,
        skipped:
          "PowerShell verification requires explicit interactive approval and was not run automatically.",
      };
    } else if (trustLevel >= 2) {
      const res = await runCommand(bridge.verifyCommand, project.path);
      verify = {
        command: bridge.verifyCommand,
        exitCode: res.exitCode,
        timedOut: res.timedOut,
        ok: res.exitCode === 0,
        output: (res.stdout || res.stderr || "").slice(0, 2000),
      };
    } else {
      verify = {
        command: bridge.verifyCommand,
        skipped:
          "Trust level 1 (suggest only) — the verification command was not run.",
      };
    }
  }

  const updated = await readJson(EXPERIMENTS_FILE, []);
  const exp = updated.find((e) => e.id === expId);
  if (!exp || exp.status !== "running") return true;
  const { steps: parsedSteps, findings } = parseSteps(answer);
  exp.status = "completed";
  exp.progress = PIPELINE;
  exp.steps = parsedSteps.length
    ? parsedSteps
    : [
        "Understanding request",
        "Identifying relevant files",
        "Handing off to Hermes Agent",
        "Waiting for agent execution",
        ...(diff.changed.length || diff.added.length
          ? ["Checking changed files"]
          : []),
        ...(verify ? ["Running verification"] : []),
      ];
  exp.findings = findings;
  exp.answer = answer;
  exp.bridge = {
    handedOff: true,
    url: bridge.baseUrl,
    elapsedMs: agentOut.elapsedMs,
    model: agentOut.model || null,
    changedFiles: [...diff.changed, ...diff.added].slice(0, 50),
    removedFiles: diff.removed.slice(0, 50),
    verify,
  };
  exp.completedAt = Date.now();
  exp.messages = (exp.messages || []).map((m) =>
    m.pending
      ? { role: m.role, content: m.content, createdAt: m.createdAt }
      : m,
  );
  exp.messages.push({
    role: "assistant",
    content: answer,
    createdAt: Date.now(),
  });
  await writeJson(EXPERIMENTS_FILE, updated);
  console.log(
    `[bridge] experiment ${expId} completed in ${agentOut.elapsedMs}ms — ${diff.changed.length} changed, ${diff.added.length} added, ${diff.removed.length} removed`,
  );
  return true;
}

function systemPrompt(
  context,
  debug = false,
  memoryText = null,
  trustLevel = null,
) {
  const base = `You are Hermes, an AI developer assistant. The user hands you a task about their codebase, then may continue the conversation with follow-ups ("dig deeper", "now fix it", "what about X?"). Always answer the latest message in the thread, referencing your earlier answers when relevant.
Respond in plain language (Taglish is fine — a mix of Tagalog and English is OK).
Never use emojis or emoji symbols anywhere in your responses.
For simple conversational messages (greetings like "hi", "who are you", thanks, small talk, questions about what you can do), answer directly in 1-3 sentences — skip the Steps/Findings/Recommendation structure, and do NOT mention projects, tools, or files unless the user is actually asking for code help.
`;
  const structure = debug
    ? `The user pasted an error and wants a real diagnosis based on their project files.
Respond EXACTLY in this structure — the sections and labels below are parsed automatically:

# <short title of the error>

## Diagnosis
- Likely cause: <one sentence, in plain language>
- Location: <file path, line number if known, e.g. frontend/js/profile.js, line 42 — or "unknown">
- Why: <explain in normal language, not error-speak — 2-3 sentences>
- Suggested fix: <actual code — put it in a code block>
- Confidence: <0-100>%

## Findings
- CRITICAL: <issue>
- WARNING: <issue>
- SUGGESTION: <idea>

## Recommendation
<next step to take>
`
    : `Structure your response exactly like this:

# <short title of what you investigated>

## Steps
- Step 1
- Step 2

## Findings
- CRITICAL: <issue>
- WARNING: <issue>
- SUGGESTION: <idea>

## Recommendation
<what to do, with concrete code if useful>
`;
  const tools = debug
    ? ""
    : `\nYou have tools you can use when you need data you don't have. To use one, write EXACTLY one line like this and then stop — wait for the result:\nTOOL: name {"arg": "value"}\n\nAvailable tools:\n${TOOL_DEFS.map((t) => `- ${t.name}: ${t.desc}`).join("\n")}\n\nRules:\n- One TOOL line at a time; after writing it, say nothing else.\n- You will receive "TOOL RESULT: name <json>" and may then request more tools or write your final answer.\n- Only request a tool when you actually need it. Never invent tool results.\n- Your final answer (with no TOOL lines) must still follow the structure below.\n`;
  const memBlock = memoryText
    ? `\nMemory (from past sessions — use this, don't repeat questions whose answers are here):\n${memoryText}\n`
    : "";
  const trustBlock = trustLevel
    ? `\nTrust level: ${TRUST_LEVELS[trustLevel].label}.\n${TRUST_LEVELS[trustLevel].rule}\n`
    : "";
  return (
    base +
    structure +
    tools +
    memBlock +
    trustBlock +
    `\n${
      context
        ? `The user has attached a project. Here is its structure and the most relevant files I selected:

Project: ${context.project.name} (${context.project.path})
File counts: ${JSON.stringify(context.stats)} (${context.totalFiles} total files)

Relevant files:
${context.relevantFiles
  .map(
    (f) => `--- FILE: ${f.path} ---
${f.content}`,
  )
  .join("\n\n")}

Use these files to give a real diagnosis. Reference exact file paths and line numbers. If the relevant files don't match the error, say "Location: unknown" and tell the user which files you would need.

When the user asks you to create, write, or modify files, use your tools (modify_file, execute_command) to do the work — do NOT say you cannot access files. You have full access to the attached project.`
        : `The user has not attached a project. When their request needs their code files (debugging, reading/modifying code, creating files, running tests), tell them to connect a project first using /connect <folder path> or the Projects view in the web UI. For anything else, just answer normally.
`
    }`
  );
}

function stripThink(text) {
  return String(text || "")
    .replace(/<think>[\s\S]*?<\/think>|<thought>[\s\S]*?<\/thought>/gi, "")
    .replace(/<think>[\s\S]*$|<thought>[\s\S]*$/gi, "");
}

function stripEmojis(text) {
  return stripThink(text)
    .replace(
      /[\p{Extended_Pictographic}\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu,
      "",
    )
    .replace(/[\u{1F3FB}-\u{1F3FF}]/gu, "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function handleLocalTask(task, context) {
  const t = task.toLowerCase().trim();
  const greetings =
    /^(hi|hello|hey|kamusta|kumusta|halo|good (morning|afternoon|evening)|salamat|thanks|thank you)[!. ]*$/;
  if (greetings.test(t)) {
    return {
      answer: `# Hello! I'm Hermes

## What I can do
- Give me a task about your project — e.g. "Investigate why login isn't working"
- Ask about your codebase — e.g. "Find the auth flow"
- Ask simple questions about the project stats

${context ? `Right now I can see **${context.project.name}** with ${context.totalFiles} files. What would you like me to investigate?` : "Attach a project (Projects view → Set as active) and I can answer questions about your actual code."}`,
    };
  }
  if (context) {
    if (/^(anything|anything else|whatever|i don't know|idk)[!. ]*$/.test(t)) {
      return {
        answer:
          "Sure — you can ask me about balloons, your project, ideas, code, or anything else. What are you curious about?",
      };
    }
    const stats = context.stats || {};
    const extMap = {
      js: ["JavaScript"],
      javascript: ["JavaScript"],
      html: ["HTML"],
      css: ["CSS"],
      json: ["JSON"],
      md: ["Markdown"],
      markdown: ["Markdown"],
      file: ["JavaScript", "HTML", "CSS", "JSON", "Markdown", "Other"],
    };
    const m = t.match(/how (?:many|much) ([a-z]+) files?/);
    if (m) {
      const keys = extMap[m[1]];
      if (keys) {
        const lines = keys.map((k) => `- ${k}: ${stats[k] || 0}`).join("\n");
        return {
          answer: `# File count in ${context.project.name}\n\nYou have **${context.totalFiles} total files**:\n\n${lines}\n\n(This was answered locally from the project scan — no AI call needed.)`,
        };
      }
    }
    const extM = t.match(/how (?:many|much) .*?\.([a-z]+)/);
    if (extM) {
      const ext = extM[1];
      const count = context.countsByExt?.["." + ext] || 0;
      return {
        answer: `# File count in ${context.project.name}\n\nFiles with **.${ext}** extension: **${count}**\n\n(This was answered locally from the project scan — no AI call needed.)`,
      };
    }
  }
  return null;
}

app.post("/api/experiments/:id/approve", async (req, res) => {
  const { approvalId, decision } = req.body;
  const experiments = await readJson(EXPERIMENTS_FILE, []);
  const exp = experiments.find((e) => e.id === req.params.id);
  if (!exp) return res.status(404).json({ error: "Experiment not found" });
  if (exp.status !== "needs_approval" || !exp.agent?.pending) {
    return res.status(409).json({ error: "No action is waiting for approval" });
  }
  if (exp.agent.pending.approvalId !== approvalId) {
    return res
      .status(409)
      .json({
        error: "This approval request is stale — reload the experiment",
      });
  }
  const pending = exp.agent.pending;
  const project = exp.agent.projectId
    ? await loadProject(exp.agent.projectId)
    : null;
  let resultMsg;
  if (decision === "deny") {
    resultMsg = `TOOL RESULT: ${pending.tool} ${JSON.stringify({ error: "The user denied this action." })}`;
    exp.agent.toolLog.push({
      name: pending.tool,
      args: pending.args,
      error: "denied by user",
    });
  } else if (decision === "allow_once" || decision === "allow_task") {
    try {
      const result = await executeTool(pending.tool, pending.args, { project });
      resultMsg = `TOOL RESULT: ${pending.tool} ${JSON.stringify(result)}`;
      exp.agent.toolLog.push({ name: pending.tool, args: pending.args });
    } catch (err) {
      resultMsg = `TOOL RESULT: ${pending.tool} ${JSON.stringify({ error: err.message })}`;
      exp.agent.toolLog.push({
        name: pending.tool,
        args: pending.args,
        error: err.message,
      });
    }
    if (decision === "allow_task") exp.agent.allowed.push(pending.tool);
  } else {
    return res.status(400).json({ error: "Unknown decision" });
  }
  exp.agent.thread = [
    ...exp.agent.thread,
    { role: "user", content: resultMsg },
  ];
  exp.agent.pending = null;
  exp.status = "running";
  exp.error = null;
  await writeJson(EXPERIMENTS_FILE, experiments);
  res.json(exp);
  runAgentLoopForExp(exp.id).catch(() => {});
});

app.post("/api/experiments/:id/cancel", async (req, res) => {
  const experiments = await readJson(EXPERIMENTS_FILE, []);
  const exp = experiments.find((e) => e.id === req.params.id);
  if (!exp) return res.status(404).json({ error: "Experiment not found" });
  if (exp.status !== "running" && exp.status !== "needs_approval") {
    return res.status(409).json({ error: "Experiment is not running" });
  }
  exp.status = "cancelled";
  exp.error = "Stopped by the user.";
  exp.completedAt = Date.now();
  if (exp.agent) {
    exp.agent.pending = null;
    exp.agent.cancelled = true;
  }
  await writeJson(EXPERIMENTS_FILE, experiments);
  res.json(exp);
});

app.patch("/api/experiments/:id/messages/:index", async (req, res) => {
  const experiments = await readJson(EXPERIMENTS_FILE, []);
  const exp = experiments.find((e) => e.id === req.params.id);
  if (!exp) return res.status(404).json({ error: "Experiment not found" });
  const content = String(req.body.content ?? "").trim();
  if (!content) return res.status(400).json({ error: "Message is required" });
  const index = parseInt(req.params.index, 10);
  if (
    !exp.messages ||
    !Array.isArray(exp.messages) ||
    exp.messages.length === 0
  ) {
    exp.messages = [
      { role: "user", content, createdAt: exp.createdAt || Date.now() },
    ];
    exp.task = content;
  } else {
    const msg = exp.messages[index];
    if (!msg) return res.status(400).json({ error: "Message not found" });
    msg.content = content;
    if (index === 0) exp.task = content;
  }
  const redo = req.body.redo === true;
  if (redo) {
    exp.messages = exp.messages.slice(0, index + 1);
    exp.status = "running";
    exp.progress = ["Understanding request"];
    exp.error = null;
    exp.answer = "";
    exp.findings = [];
    exp.steps = [];
    exp.diagnosis = null;
    exp.uiAnalysis = null;
    exp.completedAt = null;
    exp.agent = null;
  }
  await writeJson(EXPERIMENTS_FILE, experiments);
  res.json(exp);
  if (redo) processExperimentThread(exp.id);
});

app.post("/api/experiments/:id/rollback", async (req, res) => {
  const experiments = await readJson(EXPERIMENTS_FILE, []);
  const exp = experiments.find((e) => e.id === req.params.id);
  if (!exp) return res.status(404).json({ error: "Experiment not found" });
  if (!exp.appliedFix) {
    return res.status(409).json({ error: "No applied fix to roll back" });
  }
  const fix = exp.appliedFix;
  const projects = await readJson(PROJECTS_FILE, []);
  const project = projects.find((p) => p.id === exp.projectId);
  if (!project) return res.status(404).json({ error: "Project not found" });
  const abs = resolveSafe(project.path, fix.path);
  if (!abs) return res.status(400).json({ error: `Invalid path: ${fix.path}` });
  let writeTo = abs;
  try {
    await fs.stat(abs);
  } catch {
    writeTo = resolveSafe(project.path, path.basename(fix.path));
    try {
      await fs.stat(writeTo);
    } catch {
      return res.status(404).json({ error: `File not found: ${fix.path}` });
    }
  }
  try {
    await fs.writeFile(writeTo, fix.original, "utf-8");
  } catch (err) {
    return res
      .status(500)
      .json({ error: `Could not write to ${fix.path}: ${err.message}` });
  }
  exp.appliedFix.rolledBack = true;
  exp.messages = exp.messages || [];
  exp.messages.push({
    role: "assistant",
    content: `Rolled back the fix to **${fix.path}** — the file is back to its original content.`,
    createdAt: Date.now(),
  });
  await writeJson(EXPERIMENTS_FILE, experiments);
  res.json(exp);
});

app.get("/api/health", (req, res) => res.json({ status: "ok", online: true }));

app.get("/api/experiments", async (req, res) => {
  const experiments = await readExperiments();
  res.json(experiments.sort((a, b) => b.createdAt - a.createdAt));
});

app.get("/api/experiments/:id", async (req, res) => {
  const experiments = await readExperiments();
  const exp = experiments.find((e) => e.id === req.params.id);
  if (!exp) return res.status(404).json({ error: "Experiment not found" });
  res.json(exp);
});

app.delete("/api/experiments/:id", async (req, res) => {
  const experiments = await readJson(EXPERIMENTS_FILE, []);
  const exp = experiments.find((e) => e.id === req.params.id);
  await writeJson(
    EXPERIMENTS_FILE,
    experiments.filter((e) => e.id !== req.params.id),
  );
  if (exp?.imagePath) {
    try {
      await fs.unlink(path.join(DATA_DIR, exp.imagePath));
    } catch {}
  }
  res.json({ ok: true });
});

app.post("/api/experiments", async (req, res) => {
  const { task, projectId, image, previousConversationId } = req.body;
  const trimmedTask = (task || "").trim();
  if (!trimmedTask && !image) {
    return res.status(400).json({ error: "Task is required" });
  }

  const id = makeId();
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  let imagePath = null;
  let imageDataUrl = null;
  if (image) {
    const parsed = parseImageDataUrl(image);
    if (!parsed) {
      return res.status(400).json({
        error: "Invalid image. Expected a PNG, JPEG, WebP or GIF under 8MB.",
      });
    }
    imageDataUrl = image;
    imagePath = `${id}.${parsed.ext}`;
    await fs.mkdir(path.join(DATA_DIR, "uploads"), { recursive: true });
    await fs.writeFile(
      path.join(DATA_DIR, "uploads", imagePath),
      parsed.buffer,
    );
  }

  const experiment = {
    id,
    conversationId: id,
    task: trimmedTask || "Analyze this UI screenshot",
    projectId: projectId || null,
    kind: image ? "ui" : "general",
    status: "running",
    progress: ["Understanding request"],
    steps: [],
    findings: [],
    answer: "",
    error: null,
    model,
    createdAt: Date.now(),
    imagePath,
    imageUrl: imagePath ? `/api/uploads/${imagePath}` : null,
    messages: [
      {
        role: "user",
        content: trimmedTask || "Analyze this UI screenshot",
        createdAt: Date.now(),
      },
    ],
    previousConversationId: previousConversationId || null,
  };

  const experiments = await readJson(EXPERIMENTS_FILE, []);
  experiments.push(experiment);
  await writeJson(EXPERIMENTS_FILE, experiments);

  res.json({ id, status: "running" });
  broadcaster.status(id, "running");

  try {
    if (imageDataUrl) {
      await runUiAnalysis(id, trimmedTask, imageDataUrl);
      return;
    }
    let effectiveProjectId = projectId;
    if (!effectiveProjectId && isDebugTask(trimmedTask)) {
      const paste = await savePastedCode(id, trimmedTask);
      if (paste) {
        effectiveProjectId = paste.projectId;
        experiment.projectId = paste.projectId;
        experiment.pastedFile = paste.filePath;
        await writeJson(EXPERIMENTS_FILE, experiments);
      }
    }
    let contextStart = Date.now();
    const context = effectiveProjectId
      ? await buildProjectContext(effectiveProjectId, experiment.task)
      : null;
    const contextBuildMs = Date.now() - contextStart;
    await updateExp(id, {
      progress: ["Understanding request", "Identifying relevant files"],
    });

    const intent = imageDataUrl
      ? { action: "normal_ai" }
      : await routeUserIntent(experiment.task);
    const recall = await recallPreviousConversation(
      experiment.task,
      id,
      experiment.previousConversationId,
      intent,
    );
    if (recall) {
      const updated = await readJson(EXPERIMENTS_FILE, []);
      const exp = updated.find((e) => e.id === id);
      if (!exp) return;
      exp.status = "completed";
      exp.progress = PIPELINE;
      exp.steps = ["Understanding request", "Recalling saved conversation"];
      exp.findings = [];
      exp.answer = recall;
      exp.local = true;
      exp.completedAt = Date.now();
      exp.contextFiles = [];
      exp.contextBuildMs = contextBuildMs;
      exp.aiCallMs = 0;
      exp.messages.push({
        role: "assistant",
        content: recall,
        createdAt: Date.now(),
      });
      await writeJson(EXPERIMENTS_FILE, updated);
      return;
    }

    const local = handleLocalTask(experiment.task, context);
    if (local) {
      const updated = await readJson(EXPERIMENTS_FILE, []);
      const exp = updated.find((e) => e.id === id);
      if (!exp) return;
      exp.status = "completed";
      exp.progress = PIPELINE;
      exp.steps = ["Understanding request", "Answering from project data"];
      exp.findings = [];
      exp.answer = local.answer;
      exp.local = true;
      exp.completedAt = Date.now();
      exp.contextFiles = [];
      exp.contextBuildMs = contextBuildMs;
      exp.aiCallMs = 0;
      exp.messages.push({
        role: "assistant",
        content: local.answer,
        createdAt: Date.now(),
      });
      await writeJson(EXPERIMENTS_FILE, updated);
      return;
    }

    const debug = isDebugTask(experiment.task);
    await updateExp(id, {
      progress: [
        "Understanding request",
        "Identifying relevant files",
        "Inspecting code flow",
        "Finding suspicious behavior",
      ],
    });
    const memoryText = await loadMemoryForProject(
      effectiveProjectId,
      experiment.task,
      id,
    );
    const { trustLevel } = await readSettings();
    if (
      await runBridgedExperiment(
        id,
        experiment.task,
        effectiveProjectId,
        context,
        memoryText,
        trustLevel,
      )
    ) {
      return;
    }

    const routeContext = {
      project: effectiveProjectId
        ? await loadProject(effectiveProjectId)
        : null,
      memoryText,
      trustLevel,
      hasImage: !!imageDataUrl,
      relevantFiles: context?.relevantFiles || [],
    };
    const routed = routeTask(experiment.task, routeContext);
    if (routed) {
      await updateExp(id, { skill: routed.skill.name });
      console.log(
        `[skills] Routed to ${routed.skill.name} (score: ${routed.score})`,
      );
    }

    const thread = [
      {
        role: "system",
        content: systemPrompt(context, debug, memoryText, trustLevel),
      },
      { role: "user", content: experiment.task },
    ];
    await updateExp(id, {
      contextFiles: context?.relevantFiles.map((f) => f.path) || [],
      contextBuildMs,
    });
    if (debug) {
      await updateExp(id, { skill: "debugging" });
      let aiStart = Date.now();
      const aiResult = stripEmojis((await callAI(thread)).content);
      const aiCallMs = Date.now() - aiStart;
      const { steps: parsedSteps, findings } = parseSteps(aiResult);
      const updated = await readJson(EXPERIMENTS_FILE, []);
      const exp = updated.find((e) => e.id === id);
      if (!exp) return;
      if (exp.status !== "running") return;
      exp.status = "completed";
      exp.progress = PIPELINE;
      exp.steps = parsedSteps.length ? parsedSteps : [...PIPELINE];
      exp.findings = findings;
      exp.diagnosis = parseDiagnosis(aiResult);
      exp.answer = aiResult;
      exp.aiCallMs = aiCallMs;
      exp.completedAt = Date.now();
      exp.messages.push({
        role: "assistant",
        content: aiResult,
        createdAt: Date.now(),
      });
      await writeJson(EXPERIMENTS_FILE, updated);
      triggerAutoLearn(id).catch(() => {});
      return;
    }
    if (isBrainstormTask(experiment.task)) {
      await updateExp(id, { skill: "brainstorming" });
      await runBrainstormExperiment(
        id,
        experiment.task,
        effectiveProjectId,
        context,
        memoryText,
      );
      return;
    }

    await startAgentLoop(id, thread, effectiveProjectId, trustLevel);
  } catch (err) {
    const updated = await readJson(EXPERIMENTS_FILE, []);
    const exp = updated.find((e) => e.id === id);
    if (!exp) return;
    if (exp.status !== "running") return;
    exp.status = "failed";
    exp.error = err.message;
    exp.completedAt = Date.now();
    await writeJson(EXPERIMENTS_FILE, updated);
  }
});

async function processExperimentThread(expId) {
  try {
    const experiments = await readJson(EXPERIMENTS_FILE, []);
    const exp = experiments.find((e) => e.id === expId);
    if (!exp || exp.status !== "running") return;
    const isUi = exp.kind === "ui";
    const lastUserContent =
      [...(exp.messages || [])].reverse().find((m) => m.role === "user")
        ?.content || exp.task;
    let projectId = exp.projectId;
    if (!projectId && !isUi && isDebugTask(lastUserContent)) {
      const paste = await savePastedCode(expId, lastUserContent);
      if (paste) {
        projectId = paste.projectId;
        exp.projectId = paste.projectId;
        exp.pastedFile = paste.filePath;
        await writeJson(EXPERIMENTS_FILE, experiments);
      }
    }
    let contextStart = Date.now();
    const context = projectId
      ? await buildProjectContext(projectId, lastUserContent)
      : null;
    const contextBuildMs = Date.now() - contextStart;
    await updateExp(exp.id, {
      progress: ["Understanding request", "Identifying relevant files"],
    });
    const debug = !isUi && isDebugTask(lastUserContent);

    const intent = isUi
      ? { action: "normal_ai" }
      : await routeUserIntent(lastUserContent);
    const recall = await recallPreviousConversation(
      lastUserContent,
      expId,
      exp.previousConversationId,
      intent,
    );
    if (recall) {
      const updated = await readJson(EXPERIMENTS_FILE, []);
      const current = updated.find((item) => item.id === expId);
      if (!current) return;
      current.status = "completed";
      current.progress = PIPELINE;
      current.steps = ["Understanding request", "Recalling saved conversation"];
      current.findings = [];
      current.answer = recall;
      current.local = true;
      current.completedAt = Date.now();
      current.messages = (current.messages || []).map((message) =>
        message.pending
          ? {
              role: message.role,
              content: message.content,
              createdAt: message.createdAt,
            }
          : message,
      );
      current.messages.push({
        role: "assistant",
        content: recall,
        createdAt: Date.now(),
      });
      await writeJson(EXPERIMENTS_FILE, updated);
      return;
    }
    await updateExp(exp.id, {
      progress: [
        "Understanding request",
        "Identifying relevant files",
        "Inspecting code flow",
        "Finding suspicious behavior",
      ],
    });

    let imageDataUrl = null;
    if (isUi && exp.imagePath) {
      try {
        const buf = await fs.readFile(path.join(DATA_DIR, exp.imagePath));
        const ext = path.extname(exp.imagePath).replace(".", "") || "png";
        imageDataUrl = `data:image/${ext};base64,${buf.toString("base64")}`;
      } catch {}
    }

    if (!exp.skill) {
      const routeContext = {
        project: projectId ? await loadProject(projectId) : null,
        memoryText: await loadMemoryForProject(
          projectId,
          lastUserContent,
          expId,
        ),
        trustLevel: (await readSettings()).trustLevel,
        hasImage: !!imageDataUrl,
        relevantFiles: context?.relevantFiles || [],
      };
      const routed = routeTask(lastUserContent, routeContext);
      if (routed) {
        await updateExp(exp.id, { skill: routed.skill.name });
        console.log(
          `[skills] Follow-up routed to ${routed.skill.name} (score: ${routed.score})`,
        );
      }
    }

    const memoryText = await loadMemoryForProject(
      projectId,
      lastUserContent,
      expId,
    );
    const { trustLevel } = await readSettings();
    if (
      !isUi &&
      (await runBridgedExperiment(
        expId,
        lastUserContent,
        projectId,
        context,
        memoryText,
        trustLevel,
        exp.messages.slice(-6),
      ))
    ) {
      return;
    }
    const thread = [
      {
        role: "system",
        content: isUi
          ? systemPromptUi()
          : systemPrompt(context, debug, memoryText, trustLevel),
      },
    ];
    exp.messages.forEach((m, idx) => {
      if (isUi && imageDataUrl && idx === 0 && m.role === "user") {
        thread.push({
          role: "user",
          content: [
            { type: "text", text: m.content },
            { type: "image_url", image_url: { url: imageDataUrl } },
          ],
        });
      } else {
        thread.push({ role: m.role, content: m.content });
      }
    });
    await updateExp(exp.id, {
      contextFiles: context?.relevantFiles.map((f) => f.path) || [],
      contextBuildMs,
    });

    if (isUi || debug) {
      let aiStart = Date.now();
      const aiResult = stripEmojis((await callAI(thread)).content);
      const aiCallMs = Date.now() - aiStart;
      const updated = await readJson(EXPERIMENTS_FILE, []);
      const e = updated.find((x) => x.id === expId);
      if (!e) return;
      if (e.status !== "running") return;
      e.messages = e.messages.map((m) =>
        m.pending
          ? { role: m.role, content: m.content, createdAt: m.createdAt }
          : m,
      );
      e.messages.push({
        role: "assistant",
        content: aiResult,
        createdAt: Date.now(),
      });
      e.answer = aiResult;
      e.progress = PIPELINE;
      e.findings = parseSteps(aiResult).findings;
      e.diagnosis = debug ? parseDiagnosis(aiResult) : e.diagnosis || null;
      e.uiAnalysis = isUi ? parseUiAnalysis(aiResult) : e.uiAnalysis || null;
      e.aiCallMs = aiCallMs;
      e.status = "completed";
      e.completedAt = Date.now();
      await writeJson(EXPERIMENTS_FILE, updated);
      return;
    }
    if (!isUi && isBrainstormTask(lastUserContent)) {
      await runBrainstormExperiment(
        expId,
        lastUserContent,
        projectId,
        context,
        memoryText,
        true,
      );
      return;
    }

    await startAgentLoop(expId, thread, projectId, trustLevel);
  } catch (err) {
    const updated = await readJson(EXPERIMENTS_FILE, []);
    const e = updated.find((x) => x.id === expId);
    if (e && e.status === "running") {
      e.messages = e.messages.map((m) =>
        m.pending
          ? { role: m.role, content: m.content, createdAt: m.createdAt }
          : m,
      );
      e.status = "failed";
      e.error = err.message;
      e.completedAt = Date.now();
      await writeJson(EXPERIMENTS_FILE, updated);
    }
  }
}

app.post("/api/experiments/:id/reply", async (req, res) => {
  const { message } = req.body;
  if (!message || !message.trim()) {
    return res.status(400).json({ error: "Message is required" });
  }

  const experiments = await readJson(EXPERIMENTS_FILE, []);
  const exp = experiments.find((e) => e.id === req.params.id);
  if (!exp) return res.status(404).json({ error: "Experiment not found" });
  if (exp.status === "running") {
    return res
      .status(409)
      .json({ error: "Hermes is still working on this experiment" });
  }

  const userMsg = {
    role: "user",
    content: message.trim(),
    createdAt: Date.now(),
    pending: true,
  };
  exp.conversationId ||= exp.id;
  exp.messages = exp.messages || [];
  exp.messages.push(userMsg);
  exp.status = "running";
  exp.progress = ["Understanding request"];
  exp.error = null;
  await writeJson(EXPERIMENTS_FILE, experiments);

  res.json(exp);

  processExperimentThread(exp.id);
});

app.get("/api/projects", async (req, res) => {
  const projects = await readJson(PROJECTS_FILE, []);
  res.json(projects.filter((p) => !p.hidden));
});

app.post("/api/projects", async (req, res) => {
  const { name, path: projPath } = req.body;
  if (!name?.trim() || !projPath?.trim()) {
    return res.status(400).json({ error: "Name and folder path are required" });
  }
  const abs = path.resolve(projPath.trim());
  let stat;
  try {
    stat = await fs.stat(abs);
  } catch {
    return res.status(400).json({ error: "Folder does not exist: " + abs });
  }
  if (!stat.isDirectory())
    return res.status(400).json({ error: "Not a folder: " + abs });
  const projects = await readJson(PROJECTS_FILE, []);
  if (projects.some((p) => p.path === abs)) {
    return res.status(400).json({ error: "Project already added" });
  }
  const id = makeId();
  const project = { id, name: name.trim(), path: abs, addedAt: Date.now() };
  const scan = await scanProject(abs);
  project.stats = scan.stats;
  projects.push(project);
  await writeJson(PROJECTS_FILE, projects);
  const aut = await readAutomation();
  aut.snapshots[id] = scan.files.map((f) => f.path);
  await writeAutomation(aut);
  if (aut.scanNewProject) {
    autoScanProject(id).catch(() => {});
  }
  res.json(project);
});

app.put("/api/projects/:id", async (req, res) => {
  const name = String(req.body.name || "").trim();
  if (!name) return res.status(400).json({ error: "Project name is required" });
  const projects = await readJson(PROJECTS_FILE, []);
  const project = projects.find((item) => item.id === req.params.id);
  if (!project) return res.status(404).json({ error: "Project not found" });
  if (
    projects.some(
      (item) =>
        item.id !== project.id &&
        item.name.toLowerCase() === name.toLowerCase(),
    )
  ) {
    return res
      .status(409)
      .json({ error: "A project with that name already exists" });
  }
  project.name = name;
  await writeJson(PROJECTS_FILE, projects);
  res.json(project);
});

app.delete("/api/projects/:id", async (req, res) => {
  const projects = await readJson(PROJECTS_FILE, []);
  await writeJson(
    PROJECTS_FILE,
    projects.filter((p) => p.id !== req.params.id),
  );
  const settings = await readSettings();
  if (settings.defaultProjectId === req.params.id) {
    await writeSettings({ ...settings, defaultProjectId: null });
  }
  res.json({ ok: true });
});

app.get("/api/projects/:id/scan", async (req, res) => {
  const projects = await readJson(PROJECTS_FILE, []);
  const project = projects.find((p) => p.id === req.params.id);
  if (!project) return res.status(404).json({ error: "Project not found" });
  const scan = await scanProject(project.path);
  project.stats = scan.stats;
  await writeJson(PROJECTS_FILE, projects);
  res.json({ stats: scan.stats, totalFiles: scan.totalFiles });
});

app.get("/api/projects/:id/health", async (req, res) => {
  const projects = await readJson(PROJECTS_FILE, []);
  const project = projects.find((item) => item.id === req.params.id);
  if (!project) return res.status(404).json({ error: "Project not found" });
  try {
    const stat = await fs.stat(project.path);
    if (!stat.isDirectory())
      return res.json({ exists: false, path: project.path });
    const scan = await scanProject(project.path);
    const git = await runCommand("git status --short", project.path);
    res.json({
      exists: true,
      path: project.path,
      totalFiles: scan.totalFiles,
      stats: scan.stats,
      gitClean: git.exitCode === 0 && !git.stdout.trim(),
      gitAvailable: git.exitCode === 0,
    });
  } catch (err) {
    res
      .status(500)
      .json({ error: `Could not inspect project health: ${err.message}` });
  }
});

app.get("/api/projects/:id/files", async (req, res) => {
  const projects = await readJson(PROJECTS_FILE, []);
  const project = projects.find((p) => p.id === req.params.id);
  if (!project) return res.status(404).json({ error: "Project not found" });
  const scan = await scanProject(project.path);
  const q = (req.query.q || "").toLowerCase();
  const files = q
    ? scan.files.filter((f) => f.path.toLowerCase().includes(q))
    : scan.files;
  res.json({ files: files.slice(0, 2000), totalFiles: scan.totalFiles });
});

app.get("/api/projects/:id/search", async (req, res) => {
  const projects = await readJson(PROJECTS_FILE, []);
  const project = projects.find((p) => p.id === req.params.id);
  if (!project) return res.status(404).json({ error: "Project not found" });
  const q = req.query.q || "";
  if (q.length < 2) return res.json({ matches: [] });
  const matches = await searchProjectFiles(project, q);
  res.json({ matches });
});

app.get("/api/projects/:id/file", async (req, res) => {
  const projects = await readJson(PROJECTS_FILE, []);
  const project = projects.find((p) => p.id === req.params.id);
  if (!project) return res.status(404).json({ error: "Project not found" });
  const rel = req.query.path;
  if (!rel) return res.status(400).json({ error: "path query param required" });
  const abs = resolveSafe(project.path, rel);
  if (!abs) return res.status(400).json({ error: "Invalid path" });
  const name = path.basename(abs);
  if (!isTextFile(name))
    return res.status(403).json({ error: "File type not readable" });
  try {
    const st = await fs.stat(abs);
    if (!st.isFile()) return res.status(400).json({ error: "Not a file" });
    if (st.size > MAX_READ_SIZE * 2)
      return res.status(400).json({ error: "File too large to display" });
    const content = await fs.readFile(abs, "utf-8");
    res.json({ path: rel, content, size: st.size });
  } catch {
    res.status(404).json({ error: "File not found" });
  }
});

app.post("/api/explain", async (req, res) => {
  const { projectId, path: relPath, selection } = req.body;
  if (!projectId || !relPath) {
    return res.status(400).json({ error: "projectId and path are required" });
  }
  const projects = await readJson(PROJECTS_FILE, []);
  const project = projects.find((p) => p.id === projectId);
  if (!project) return res.status(404).json({ error: "Project not found" });
  const abs = resolveSafe(project.path, relPath);
  if (!abs) return res.status(400).json({ error: "Invalid file path" });
  let content;
  try {
    const st = await fs.stat(abs);
    if (!st.isFile()) return res.status(400).json({ error: "Not a file" });
    content = await fs.readFile(abs, "utf-8");
  } catch {
    return res.status(404).json({ error: "File not found" });
  }
  const sel = (selection || "").trim();
  const target = sel
    ? `FILE: ${relPath}\n\nTHE CODE TO EXPLAIN (exact text selected from the file):\n"""\n${sel}\n"""\n\nFILE CONTENT FOR CONTEXT (the target may be part of this):\n"""\n${content.slice(0, MAX_CONTEXT_FILE_SIZE)}\n"""`
    : `FILE: ${relPath}\n\nTHE CODE TO EXPLAIN (the whole file):\n"""\n${content.slice(0, MAX_CONTEXT_FILE_SIZE)}\n"""`;
  const system = `You are Hermes, an AI developer assistant. Explain the given code in plain language (Taglish is fine — a mix of Tagalog and English is OK). Never use emojis.
Respond EXACTLY in this structure:
# <one-line summary of what the code does>

## What it does
<plain-language explanation, 2-4 sentences>

## Inputs & outputs
<what it takes in and returns / writes, if relevant — otherwise say "None" or omit the heading>

## Details
<non-obvious or interesting parts: async behavior, side effects, error handling, gotchas — bullet points>

Keep it concise and focused on what was asked. If the selection is not valid code (e.g. a partial word), say so and explain what the surrounding code does instead.`;
  try {
    const raw = stripEmojis(
      (
        await callAI([
          { role: "system", content: system },
          { role: "user", content: target },
        ])
      ).content,
    );
    res.json({ explanation: raw });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

function locationToFile(loc) {
  if (!loc) return null;
  let s = loc
    .trim()
    .replace(/^[`"'“”#]+|[`"'“”#]+$/g, "")
    .trim();
  s = s.replace(/,\s*line.*$/i, "").trim();
  s = s.replace(/^[`"'“”#]+|[`"'“”#]+$/g, "").trim();
  s = s.split(/:\d+(?::\d+)?\s*$/)[0].trim();
  if (!s || /unknown|n\/a|not found/i.test(s)) return null;
  return s;
}

async function extractPatch(fileContent, fix, filePath, cause) {
  const trimmed = fix
    .replace(/^```[a-zA-Z]*\s*\n?/, "")
    .replace(/\n?```\s*$/, "")
    .trim();
  const system = `You produce precise code edits. Given a file's content and a described fix, return ONLY a JSON object with no markdown fences and no commentary:
{"from": "exact existing snippet to replace", "to": "replacement snippet"}
Rules:
- "from" must be copied VERBATIM from the file content (exact whitespace, indentation and newlines) and must appear EXACTLY ONCE in the file.
- "to" is the corrected version of that same snippet.
- Keep the snippet as small as possible while still being unique and covering the broken part.`;
  const user = `FILE: ${filePath}
CAUSE: ${cause || "unknown"}
INTENDED FIX:
${trimmed}

FILE CONTENT:
${fileContent.slice(0, MAX_CONTEXT_FILE_SIZE)}`;
  const raw = (
    await callAI([
      { role: "system", content: system },
      { role: "user", content: user },
    ])
  ).content;
  const cleaned = stripThink(raw)
    .replace(/```(?:json)?\s*/gi, "")
    .replace(/```/g, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1)
    throw new Error("Could not parse the patch generated by the AI");
  let parsed;
  try {
    parsed = JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    throw new Error("Could not parse the patch generated by the AI");
  }
  if (
    typeof parsed.from !== "string" ||
    typeof parsed.to !== "string" ||
    !parsed.from.trim()
  ) {
    throw new Error("The AI returned an invalid patch");
  }
  return { from: parsed.from, to: parsed.to };
}

app.post("/api/experiments/:id/apply-fix", async (req, res) => {
  const experiments = await readJson(EXPERIMENTS_FILE, []);
  const exp = experiments.find((e) => e.id === req.params.id);
  if (!exp) return res.status(404).json({ error: "Experiment not found" });
  if (exp.status !== "completed") {
    return res
      .status(409)
      .json({ error: "Hermes is still working on this experiment" });
  }
  const diag = exp.diagnosis || {};
  if (!diag.fix || !diag.location) {
    return res
      .status(400)
      .json({ error: "This experiment has no suggested fix to apply" });
  }
  if (/unknown/i.test(diag.location)) {
    return res
      .status(400)
      .json({
        error: "The diagnosis did not identify a file location to edit",
      });
  }
  if (!exp.projectId) {
    return res
      .status(400)
      .json({ error: "No project is attached to this experiment" });
  }
  const projects = await readJson(PROJECTS_FILE, []);
  const project = projects.find((p) => p.id === exp.projectId);
  if (!project) return res.status(404).json({ error: "Project not found" });

  const relPath = locationToFile(diag.location);
  if (!relPath) {
    return res
      .status(400)
      .json({
        error: `Could not determine the file to edit from: ${diag.location}`,
      });
  }
  let abs = resolveSafe(project.path, relPath);
  if (!abs)
    return res.status(400).json({ error: `Invalid file path: ${relPath}` });
  let st;
  try {
    st = await fs.stat(abs);
  } catch {
    const alt = resolveSafe(project.path, path.basename(relPath));
    try {
      st = await fs.stat(alt);
      abs = alt;
    } catch {
      return res.status(404).json({ error: `File not found: ${relPath}` });
    }
  }
  if (!st.isFile())
    return res.status(400).json({ error: `Not a file: ${relPath}` });
  let content;
  try {
    content = await fs.readFile(abs, "utf-8");
  } catch {
    return res
      .status(400)
      .json({ error: `Could not read ${relPath} (binary or unreadable)` });
  }

  let patch;
  try {
    patch = await extractPatch(content, diag.fix, relPath, diag.cause);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
  patch.from = patch.from.replace(/\r\n/g, "\n");
  patch.to = patch.to.replace(/\r\n/g, "\n");

  const crlf = content.includes("\r\n");
  const normalized = content.replace(/\r\n/g, "\n");
  const occurrences = normalized.split(patch.from).length - 1;
  if (occurrences === 0) {
    return res.status(400).json({
      error:
        "The code to replace was not found in the file. The suggested fix may target a different file — nothing was changed.",
    });
  }
  if (occurrences > 1) {
    return res.status(400).json({
      error: `The code to replace appears ${occurrences} times in ${relPath} — the patch is not specific enough. Nothing was changed.`,
    });
  }
  const updatedContent = crlf
    ? normalized.replace(patch.from, () => patch.to).replace(/\n/g, "\r\n")
    : normalized.replace(patch.from, () => patch.to);
  if (req.query.preview === "true") {
    return res.json({
      id: exp.id,
      previewFix: {
        path: path.relative(project.path, abs) || relPath,
        original: content,
        replaced: patch.from,
        replacement: patch.to,
        updated: updatedContent,
      },
    });
  }
  try {
    await fs.writeFile(abs, updatedContent, "utf-8");
  } catch (err) {
    return res
      .status(500)
      .json({ error: `Could not write to ${relPath}: ${err.message}` });
  }

  exp.appliedFix = {
    path: path.relative(project.path, abs) || relPath,
    original: content,
    replaced: patch.from,
    replacement: patch.to,
    at: Date.now(),
  };
  exp.messages = exp.messages || [];
  exp.messages.push({
    role: "assistant",
    content: `Applied the suggested fix to **${relPath}**. The original content is saved on the experiment record if you need to review or roll it back.`,
    createdAt: Date.now(),
  });
  await writeJson(EXPERIMENTS_FILE, experiments);
  res.json(exp);
});

registerSkillRoutes(app, {
  readJson,
  EXPERIMENTS_FILE,
  PROJECTS_FILE,
  MEMORY_FILE,
  readSettings,
  loadMemoryForProject,
  callAI: (messages, opts) => callAI(messages, opts),
  getAiRouter,
});

const PORT = process.env.PORT || 4000;
const server = app.listen(PORT, async () => {
  console.log(`Hermes backend running on http://localhost:${PORT}`);
  broadcaster.start(server);
  await recoverStaleExperiments();
  await initHermes();
  setInterval(() => {
    pollAutomation().catch((err) =>
      console.error("Automation poll failed:", err.message),
    );
  }, 60 * 1000);
});

async function recoverStaleExperiments() {
  const experiments = await readJson(EXPERIMENTS_FILE, []);
  let changed = false;
  for (const exp of experiments) {
    if (exp.status !== "running") continue;
    exp.status = "failed";
    exp.error =
      "The backend restarted while this experiment was running, so it never finished. Use Try again to redo it.";
    exp.completedAt = Date.now();
    exp.messages = (exp.messages || []).map((m) =>
      m.pending
        ? { role: m.role, content: m.content, createdAt: m.createdAt }
        : m,
    );
    changed = true;
    console.log(
      `Recovered stale experiment ${exp.id} (was "running") -> failed`,
    );
  }
  if (changed) await writeJson(EXPERIMENTS_FILE, experiments);
}
