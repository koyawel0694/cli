                                                                                
                                                                                      
  
         
                                                                             
                                                         
                                                                                

import fs from "fs/promises";
import path from "path";
import { exec } from "child_process";

                                                               

const HIGH_RISK_FILE = /auth|login|password|secret|api[_-]?key|token|\.env|database|db[._-]|supabase|firebase|payment|billing|stripe|migration|schema|webhook|credential|admin/i;
const MEDIUM_RISK_FILE = /state|store|server|api[./]|route|controller|service|util|helper|index\.(js|ts|jsx|tsx)/i;
const LOW_RISK_FILE = /\.css$|\.scss$|\.html$|readme|\.md$|comment|format|typo/i;

const HIGH_RISK_CMD = /npm (install|i\b|add|remove|rm|uninstall)|yarn (add|remove)|pnpm (add|remove)|pip install|gem install|sudo|rm(\s|$)|rmdir|drop\s+(table|database|column)|truncate|git (push|reset --hard|clean -f|force|rebase|merge)|curl .*\| *(sh|bash)|wget .*\| *(sh|bash)|chmod|chown|killall|pkill|taskkill|shutdown|mkfs|dd\b/i;
const LOW_RISK_CMD = /npm (test|run (build|lint|typecheck|check|verify)|(tsc|eslint|oxlint))\b|yarn (test|build|lint)\b|pnpm (test|build|lint)\b|node --check|tsc --noEmit|git (status|diff|log|branch|show)\b|python .*pytest/i;

const RISK_RANK = { low: 1, medium: 2, high: 3 };
const TRUST_AUTO = { 1: 0, 2: 1, 3: 2 };

export function assessRisk(tool, args) {
  if (tool === "modify_file") {
    const p = String(args.path || "");
    if (HIGH_RISK_FILE.test(p)) return { level: "high", reason: "Touches a sensitive area (auth, credentials, database, or config)." };
    if (MEDIUM_RISK_FILE.test(p) && !LOW_RISK_FILE.test(p)) return { level: "medium", reason: "Core code that could affect behavior elsewhere." };
    return { level: "low", reason: "Low-impact file change." };
  }
  if (tool === "execute_command") {
    const c = String(args.command || "");
    if (HIGH_RISK_CMD.test(c)) return { level: "high", reason: "Command looks destructive, persistent, or network-touching." };
    if (LOW_RISK_CMD.test(c)) return { level: "low", reason: "Read-only check or test/build command." };
    return { level: "medium", reason: "Command may change project state." };
  }
  if (tool === "git") {
    const op = String(args.operation || args.command || "");
    if (/push|reset --hard|clean|rebase|force/i.test(op)) return { level: "high", reason: "Destructive or remote git operation." };
    if (/commit|tag|branch -d|merge/i.test(op)) return { level: "medium", reason: "Mutates git history." };
    return { level: "low", reason: "Read-only git operation." };
  }
  return { level: "low", reason: "" };
}

export function gatedToolDecision(tool, args, trustLevel, allowed) {
  if (tool !== "modify_file" && tool !== "execute_command" && tool !== "git") {
    return { action: "run" };
  }
  if (allowed.includes(tool)) return { action: "run" };
  if (trustLevel === 1) {
    return {
      action: "block",
      reason: "Trust level is Level 1 (suggest only) — the user applies changes manually. Suggest the change instead of performing it.",
    };
  }
  const risk = assessRisk(tool, args);
  if (RISK_RANK[risk.level] > TRUST_AUTO[trustLevel]) return { action: "ask", risk };
  return { action: "run", risk };
}

                                                               

class ToolRegistry {
  constructor() {
    this.tools = new Map();
  }

  register(tool) {
    if (!tool.name || typeof tool.execute !== "function") {
      throw new Error("Tool must have a name and execute function");
    }
    this.tools.set(tool.name, {
      name: tool.name,
      description: tool.description || "",
      parameters: tool.parameters || { type: "object", additionalProperties: true },
      execute: tool.execute,
      requiresProject: tool.requiresProject || false,
      riskLevel: tool.riskLevel || "low",                                        
      category: tool.category || "general",                                           
    });
  }

  get(name) {
    return this.tools.get(name) || null;
  }

  has(name) {
    return this.tools.has(name);
  }

  list() {
    return Array.from(this.tools.values()).map(({ execute, ...meta }) => meta);
  }

  toApiTools() {
    return this.list().map((t) => ({
      type: "function",
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));
  }

  byCategory(category) {
    return this.list().filter((t) => t.category === category);
  }
}

export const toolRegistry = new ToolRegistry();

                                                               

function runCommand(command, cwd) {
  return new Promise((resolve) => {
    exec(command, { cwd, timeout: 30000, maxBuffer: 1024 * 1024, windowsHide: true }, (err, stdout, stderr) => {
      resolve({
        exitCode: err ? err.code ?? 1 : 0,
        timedOut: !!err?.killed,
        stdout: String(stdout || "").slice(0, 20000),
        stderr: String(stderr || "").slice(0, 5000),
      });
    });
  });
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

export async function executeTool(name, args, ctx = {}) {
  const tool = toolRegistry.get(name);
  if (!tool) throw new Error(`Unknown tool: ${name}`);

  const project = ctx.project || null;
  if (tool.requiresProject && !project) {
    throw new Error(`No project attached — attach a project first, then I can use ${name}.`);
  }

                                                
  return tool.execute(args, { project, ctx });
}

                                                               

const MAX_READ_SIZE = 200 * 1024;
const MAX_CONTEXT_FILE_SIZE = 100 * 1024;
const MAX_SEARCH_FILES = 3000;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

const SKIP_DIRS = new Set([
  "node_modules", ".git", "dist", "build", ".next", "__pycache__",
  ".venv", "venv", ".cache", "coverage", ".vscode", ".idea",
]);

const TEXT_EXT = new Set([
  ".js", ".jsx", ".ts", ".tsx", ".html", ".htm", ".xhtml", ".css", ".scss", ".sass",
  ".vue", ".svelte", ".astro",
  ".json", ".md", ".markdown", ".txt", ".csv", ".tsv",
  ".xml", ".xsd", ".xsl", ".xslt", ".svg",
  ".py", ".rb", ".go", ".rs", ".java", ".kt",
  ".c", ".cpp", ".cc", ".h", ".hpp", ".php", ".sql",
  ".yml", ".yaml", ".toml", ".ini", ".cfg", ".conf", ".properties",
  ".sh", ".bat", ".ps1",
  ".graphql", ".gql", ".hs", ".lhs", ".ex", ".exs", ".erl", ".hrl",
  ".clj", ".cljs", ".cljc", ".edn", ".fs", ".fsi", ".fsx",
  ".vb", ".m", ".jl", ".asm", ".s",
  ".mk", ".make", ".gradle", ".kts", ".tf", ".tfvars",
  ".dockerfile", ".prisma", ".proto", ".tex", ".sty", ".vim", ".nix",
]);

const SPECIAL_FILES = new Set([
  "Dockerfile", "Makefile", "GNUmakefile", "Jenkinsfile", "Vagrantfile",
  "Gemfile", "Rakefile", "Procfile", "LICENSE", "README",
  ".gitignore", ".gitattributes", ".editorconfig", ".dockerignore",
  ".npmrc", ".nvmrc", ".prettierrc", ".eslintrc",
]);

function isTextFile(name) {
  return TEXT_EXT.has(path.extname(name).toLowerCase()) || SPECIAL_FILES.has(name);
}

async function scanProject(root) {
  const files = [];
  async function walk(dir, rel) {
    let entries;
    try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (entry.name.startsWith(".") && !SPECIAL_FILES.has(entry.name)) continue;
      if (SKIP_DIRS.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      const relPath = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await walk(full, relPath);
      else files.push({ path: relPath, name: entry.name, size: 0 });
    }
  }
  await walk(root, "");
  for (const f of files) {
    try { const st = await fs.stat(resolveSafe(root, f.path)); f.size = st.size; } catch {}
  }
  const counts = {};
  for (const f of files) {
    const ext = path.extname(f.name).toLowerCase() || "(none)";
    counts[ext] = (counts[ext] || 0) + 1;
  }
  return { files, counts, totalFiles: files.length };
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
          snippet: content.slice(start, idx + q.length + 120).replace(/\s+/g, " ").trim(),
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
  if (st.size > MAX_READ_SIZE) throw new Error(`File too large to read: ${rel}`);
  const content = await fs.readFile(abs, "utf-8");
  return { path: rel, content };
}

function safeEvaluate(expression) {
  const src = String(expression ?? "").trim();
  if (!src) throw new Error("calculate requires an expression");
  if (src.length > 500) throw new Error("Expression too long");
  if (/[^0-9a-zA-Z+\-*/().,%^ \t]/.test(src)) throw new Error("Unsupported characters in expression");
  let pos = 0;
  const peek = () => src[pos];
  const skipWs = () => { while (pos < src.length && /\s/.test(src[pos])) pos++; };
  const parseExpr = () => {
    let v = parseTerm();
    while (true) { skipWs(); if (peek() === "+" || peek() === "-") { const op = peek(); pos++; const r = parseTerm(); v = op === "+" ? v + r : v - r; } else break; }
    return v;
  };
  const parseTerm = () => {
    let v = parseFactor();
    while (true) { skipWs(); if (peek() === "*" || peek() === "/" || peek() === "%") { const op = peek(); pos++; const r = parseFactor(); if (op === "*") v = v * r; else if (op === "/") { if (r === 0) throw new Error("Division by zero"); v = v / r; } else { if (r === 0) throw new Error("Modulo by zero"); v = v % r; } } else break; }
    return v;
  };
  const parseFactor = () => { const v = parseUnary(); skipWs(); if (peek() === "^") { pos++; return Math.pow(v, parseUnary()); } return v; };
  const parseUnary = () => { if (peek() === "-") { pos++; return -parseUnary(); } if (peek() === "+") { pos++; return parseUnary(); } return parsePrimary(); };
  const parsePrimary = () => {
    skipWs();
    if (peek() === "(") { pos++; const v = parseExpr(); skipWs(); if (peek() !== ")") throw new Error("Expected )"); pos++; return v; }
    const ident = src.slice(pos).match(/^[a-zA-Z_]+/);
    if (ident) {
      const name = ident[0].toLowerCase(); pos += ident[0].length; skipWs();
      if (peek() === "(") {
        pos++; skipWs(); const args = [];
        if (peek() !== ")") { args.push(parseExpr()); while (peek() === ",") { pos++; args.push(parseExpr()); } }
        skipWs(); if (peek() !== ")") throw new Error("Expected )"); pos++;
        return applyFunction(name, args);
      }
      const consts = { pi: Math.PI, e: Math.E };
      if (name in consts) return consts[name];
      throw new Error(`Unknown function or constant: ${ident[0]}`);
    }
    const num = src.slice(pos).match(/^\d*\.?\d+(?:e[+-]?\d+)?/i);
    if (num) { pos += num[0].length; return parseFloat(num[0]); }
    throw new Error(`Unexpected character at position ${pos}`);
  };
  const applyFunction = (name, args) => {
    const fns = { sqrt: [1, Math.sqrt], abs: [1, Math.abs], round: [1, Math.round], floor: [1, Math.floor], ceil: [1, Math.ceil], sin: [1, Math.sin], cos: [1, Math.cos], tan: [1, Math.tan], log: [1, Math.log], log10: [1, Math.log10], exp: [1, Math.exp], min: [-1, (...a) => Math.min(...a)], max: [-1, (...a) => Math.max(...a)] };
    const f = fns[name];
    if (!f) throw new Error(`Unknown function: ${name}`);
    if (f[0] !== -1 && args.length !== f[0]) throw new Error(`${name} expects ${f[0]} argument(s)`);
    return f[1](...args);
  };
  const value = parseExpr();
  skipWs();
  if (pos < src.length) throw new Error(`Unexpected trailing input at position ${pos}`);
  if (!Number.isFinite(value)) throw new Error("Result is not a finite number");
  return value;
}

function parseJsonTool(input) {
  const text = String(input ?? "").trim();
  if (!text) throw new Error("parse_json requires an input");
  let parsed;
  try { parsed = JSON.parse(text); } catch (err) {
    const m = String(err.message).match(/position (\d+)/);
    return { valid: false, error: err.message, position: m ? parseInt(m[1], 10) : null };
  }
  const summarize = (v, depth = 0) => {
    if (depth > 3) return "...";
    if (Array.isArray(v)) return { type: "array", length: v.length, sample: v.slice(0, 5).map((x) => summarize(x, depth + 1)) };
    if (v && typeof v === "object") { const keys = Object.keys(v).slice(0, 20); return { type: "object", keyCount: Object.keys(v).length, keys, sample: Object.fromEntries(keys.map((k) => [k, summarize(v[k], depth + 1)])) }; }
    return v;
  };
  return { valid: true, type: Array.isArray(parsed) ? "array" : typeof parsed, pretty: JSON.stringify(parsed, null, 2).slice(0, 20000), summary: summarize(parsed) };
}

async function searchWeb(query) {
  const key = process.env.BRAVE_API_KEY;
  if (key) {
    const res = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=8`, {
      headers: { Accept: "application/json", "X-Subscription-Token": key },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) throw new Error(`Web search failed (${res.status})`);
    const data = await res.json();
    return { results: (data?.web?.results || []).slice(0, 8).map((r) => ({ title: r.title, url: r.url, text: r.description || "" })) };
  }
  const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}&kl=us-en`, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36", "Accept-Language": "en-US,en;q=0.9" },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Web search failed (${res.status})`);
  const html = await res.text();
  const results = [];
  const titles = [...html.matchAll(/<a rel="nofollow" class="result__a" href="([^"]*)"[^>]*>(.*?)<\/a>/gs)].map((m) => ({ url: decodeDdgUrl(m[1]), title: m[2].replace(/<[^>]+>/g, "").trim() }));
  const snippets = [...html.matchAll(/class="result__snippet"[^>]*>(.*?)<\/a>/gs)].map((m) => m[1].replace(/<[^>]+>/g, "").trim());
  titles.forEach((t, i) => { if (t.title && t.url) results.push({ title: t.title, url: t.url, text: snippets[i] || "" }); });
  return { results: results.slice(0, 8), note: "Free keyless web search (DuckDuckGo)." };
}

function decodeDdgUrl(href) {
  const m = href.match(/uddg=([^&]+)/);
  return m ? decodeURIComponent(m[1]) : href;
}

                          
export function registerBuiltinTools() {
  toolRegistry.register({
    name: "read_file",
    description: 'Read a file from the attached project. Args: {"path": "src/login.js"}',
    parameters: { type: "object", additionalProperties: true },
    requiresProject: true,
    category: "file",
    execute: async (args, { project }) => {
      const p = String(args.path || "").trim();
      if (!p) throw new Error('read_file requires a "path" argument');
      const f = await readProjectFile(project, p);
      return { path: f.path, content: f.content.slice(0, MAX_CONTEXT_FILE_SIZE) };
    },
  });

  toolRegistry.register({
    name: "search_files",
    description: "Search text inside the attached project's files. Args: {\"query\": \"login\"}",
    parameters: { type: "object", additionalProperties: true },
    requiresProject: true,
    category: "file",
    execute: async (args, { project }) => {
      const q = String(args.query || "").trim();
      if (!q) throw new Error('search_files requires a "query" argument');
      const matches = await searchProjectFiles(project, q, 15);
      if (!matches.length) return { matches: [], note: "No matches found" };
      return { matches, count: matches.length };
    },
  });

  toolRegistry.register({
    name: "scan_project",
    description: "Summarize the attached project (file counts by type, total files). Args: {}",
    parameters: { type: "object", additionalProperties: true },
    requiresProject: true,
    category: "file",
    execute: async (args, { project }) => {
      const scan = await scanProject(project.path);
      return { project: project.name, totalFiles: scan.totalFiles, stats: scan.counts };
    },
  });

  toolRegistry.register({
    name: "calculate",
    description: 'Evaluate a math expression. Args: {"expression": "2 + 3 * 4"}',
    parameters: { type: "object", additionalProperties: true },
    category: "data",
    execute: async (args) => {
      return { expression: String(args.expression ?? ""), result: safeEvaluate(args.expression) };
    },
  });

  toolRegistry.register({
    name: "parse_json",
    description: 'Validate and format JSON. Args: {"input": "{\\"a\\": 1}"}',
    parameters: { type: "object", additionalProperties: true },
    category: "data",
    execute: async (args) => {
      return parseJsonTool(args.input);
    },
  });

  toolRegistry.register({
    name: "search_web",
    description: 'Search the web for information. Args: {"query": "supabase rate limits 2026"}',
    parameters: { type: "object", additionalProperties: true },
    category: "web",
    execute: async (args) => {
      const q = String(args.query || "").trim();
      if (!q) throw new Error('search_web requires a "query" argument');
      return searchWeb(q);
    },
  });

  toolRegistry.register({
    name: "analyze_image",
    description: 'Run vision analysis on an image file in the project. Args: {"path": "assets/logo.png"}',
    parameters: { type: "object", additionalProperties: true },
    requiresProject: true,
    category: "file",
    execute: async (args, { project, ctx }) => {
      const p = String(args.path || "").trim();
      if (!p) throw new Error('analyze_image requires a "path" argument');
      const abs = resolveSafe(project.path, p);
      if (!abs) throw new Error(`Invalid path: ${p}`);
      const st = await fs.stat(abs).catch(() => null);
      if (!st || !st.isFile()) throw new Error(`File not found: ${p}`);
      const ext = path.extname(p).replace(".", "").toLowerCase();
      const mime = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif" }[ext];
      if (!mime) throw new Error(`Unsupported image type: ${ext}`);
      if (st.size > MAX_IMAGE_BYTES) throw new Error("Image too large to analyze");
      const buf = await fs.readFile(abs);
      const dataUrl = `data:${mime};base64,${buf.toString("base64")}`;
                                                       
      const callAI = ctx?.callAI;
      if (!callAI) throw new Error("callAI not available for image analysis");
      const raw = (await callAI([
        { role: "system", content: "You are Hermes, an AI developer assistant analyzing an image file from the user's project. Describe what the image contains and note anything relevant to the user's task. Respond in plain language, no emojis." },
        { role: "user", content: [{ type: "text", text: "Analyze this image file and describe what you see." }, { type: "image_url", image_url: { url: dataUrl } }] },
      ])).content;
      return { analysis: raw };
    },
  });

  toolRegistry.register({
    name: "modify_file",
    description: 'Edit a file in the project: replace an exact snippet. Args: {"path": "src/login.js", "from": "old code", "to": "new code"}. Gated by trust level.',
    parameters: { type: "object", additionalProperties: true },
    requiresProject: true,
    riskLevel: "medium",
    category: "code",
    execute: async (args, { project }) => {
      const p = String(args.path || "").trim();
      const from = String(args.from ?? "");
      const to = String(args.to ?? "");
      if (!p || !from) throw new Error('modify_file requires "path", "from" and "to"');
      const file = await readProjectFile(project, p);
      const occurrences = file.content.split(from).length - 1;
      if (occurrences === 0) throw new Error(`The code to replace was not found in ${p}.`);
      if (occurrences > 1) throw new Error(`The code to replace appears ${occurrences} times in ${p} — be more specific.`);
      const newContent = file.content.replace(from, () => to);
      await fs.writeFile(resolveSafe(project.path, p), newContent, "utf-8");
      return { path: p, replaced: from, replacement: to };
    },
  });

  toolRegistry.register({
    name: "execute_command",
    description: 'Run a shell command in the project folder. Args: {"command": "npm test"}. Gated by trust level.',
    parameters: { type: "object", additionalProperties: true },
    requiresProject: true,
    riskLevel: "medium",
    category: "system",
    execute: async (args, { project }) => {
      const command = String(args.command || "").trim();
      if (!command) throw new Error('execute_command requires a "command" argument');
      const result = await runCommand(command, project.path);
      return { command, ...result };
    },
  });

  toolRegistry.register({
    name: "git",
    description: 'Git operations in the project. Args: {"operation": "status|diff|log|branch|show|commit", "message": "commit message"}. Gated by trust level.',
    parameters: { type: "object", additionalProperties: true },
    requiresProject: true,
    riskLevel: "medium",
    category: "system",
    execute: async (args, { project }) => {
      const op = String(args.operation || args.command || "").trim();
      if (!op) throw new Error('git requires an "operation" (status, diff, log, branch, show, commit)');
      const allowedOps = new Set(["status", "diff", "log", "branch", "show", "commit"]);
      if (!allowedOps.has(op)) throw new Error(`Unsupported git operation: ${op}`);
      let cmd = "git";
      if (op === "status") cmd += " status --short";
      else if (op === "diff") cmd += " diff --stat";
      else if (op === "log") cmd += " log --oneline -15";
      else if (op === "branch") cmd += " branch --show-current";
      else if (op === "show") cmd += " show --stat HEAD";
      else if (op === "commit") {
        const msg = String(args.message || "").trim().replace(/[$`\\\n]/g, "");
        if (!msg) throw new Error('git commit requires a "message"');
        cmd += ` commit -m ${JSON.stringify(msg)}`;
      }
      const result = await runCommand(cmd, project.path);
      return { operation: op, ...result };
    },
  });

  console.log(`[tools] Registered ${toolRegistry.list().length} built-in tools`);
}
