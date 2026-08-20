import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWebSocket } from "./useWebSocket";
import {
  API_URL,
  addProject,
  applyFix,
  approveExperiment,
  cancelExperiment,
  checkHealth,
  createExperiment,
  deleteExperiment,
  deleteProject,
  editExperimentMessage,
  explainCode,
  getAutomation,
  getBridge,
  getExperiment,
  getExperiments,
  getKnowledge,
  getProjectFile,
  getProjectFiles,
  getProjects,
  getMemory,
  getSettings,
  learnProjectMemory,
  parseFindings,
  previewFix,
  refreshProject,
  removeVault,
  replyExperiment,
  rescanKnowledge,
  rollbackFix,
  runAutomation,
  saveAutomation,
  saveBridge,
  saveGlobalMemory,
  saveKnowledgeConfig,
  saveProjectMemory,
  saveSettings,
  searchKnowledgeNotes,
  searchProject,
  addVault,
  testBridge,
} from "./api";
import "./App.css";

const ICON_PATHS = {
  grid: (
    <>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
    </>
  ),
  flask: (
    <>
      <path d="M9.5 3h5" />
      <path d="M10.5 3v5.2L5.6 16.9A2 2 0 0 0 7.4 20h9.2a2 2 0 0 0 1.8-3.1L13.5 8.2V3" />
      <path d="M7.5 14.5h9" />
    </>
  ),
  folder: (
    <path d="M3.5 7A1.5 1.5 0 0 1 5 5.5h4.2L11 8h8A1.5 1.5 0 0 1 20.5 9.5v7A1.5 1.5 0 0 1 19 18H5a1.5 1.5 0 0 1-1.5-1.5V7Z" />
  ),
  file: (
    <>
      <path d="M6.5 3h7L19 8.5V19a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 19V4.5A1.5 1.5 0 0 1 6.5 3Z" />
      <path d="M13 3v5.5H19" />
    </>
  ),
  wrench: (
    <path d="M14.5 6.3a1 1 0 0 0 0 1.4l1.8 1.8a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9l-3.8 3.8Z" />
  ),
  chip: (
    <>
      <rect x="5.5" y="9" width="13" height="8" rx="1.5" />
      <path d="M9 6V3.5M15 6V3.5M9 20v-2.5M15 20v-2.5M5.5 12H3M5.5 15H3M21 12h-2.5M21 15h-2.5" />
    </>
  ),
  sliders: (
    <>
      <path d="M4 7h9M17.5 7H20M4 12h3M11.5 12H20M4 17h10M18.5 17H20" />
      <circle cx="15.5" cy="7" r="2" />
      <circle cx="9.5" cy="12" r="2" />
      <circle cx="16.5" cy="17" r="2" />
    </>
  ),
  arrow: <path d="M5 12h14M13.5 6.5 19 12l-5.5 5.5" />,
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20 20-3.8-3.8" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 11a8 8 0 0 0-14.8-3.6L3.5 9.5" />
      <path d="M3.5 4v5.5H9" />
      <path d="M4 13a8 8 0 0 0 14.8 3.6l1.7-2.1" />
      <path d="M20.5 20v-5.5H15" />
    </>
  ),
  x: <path d="m6.5 6.5 11 11M17.5 6.5l-11 11" />,
  plus: <path d="M12 5.5v13M5.5 12h13" />,
  copy: (
    <>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15H4.5A1.5 1.5 0 0 1 3 13.5v-9A1.5 1.5 0 0 1 4.5 3h9A1.5 1.5 0 0 1 15 4.5V5" />
    </>
  ),
  pencil: <path d="M17 3.5a2.1 2.1 0 0 1 3 3L8.5 18 4 19.5 5.5 15 17 3.5Z" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  trash: (
    <>
      <path d="M4.5 6.5h15" />
      <path d="M9.5 6V4.5h5V6" />
      <path d="M6.5 6.5l1 12h9l1-12" />
      <path d="M10 10v5M14 10v5" />
    </>
  ),
  bug: (
    <>
      <path d="M8.5 8.5h7" />
      <path d="M12 8.5V20" />
      <path d="M8 12H4.7a3.3 3.3 0 0 0 3.3 3.3" />
      <path d="M16 12h3.3a3.3 3.3 0 0 1-3.3 3.3" />
      <path d="M8 15.3A3.3 3.3 0 0 0 11.3 18h1.4A3.3 3.3 0 0 0 16 15.3" />
      <path d="M12 3.5c1.3 0 2 1 2 2h-4c0-1 .7-2 2-2Z" />
    </>
  ),
  paint: (
    <>
      <path d="M18.4 2.6 14 7l-1.6-1.6a2 2 0 0 0-2.8 0L8 7l9 9 1.6-1.6a2 2 0 0 0 0-2.8L17 10l4.4-4.4a2.1 2.1 0 1 0-3-3Z" />
      <path d="M9 8c-2 3-4 3.5-7 4l8 8c.5-3 .5-5 4-7" />
    </>
  ),
  zap: <path d="M13 2.5 3.5 14h6l-1 7.5L19 10h-6l1-7.5Z" />,
  star: <path d="M12 3l2.2 6.6L21 12l-6.8 2.4L12 21l-2.2-6.6L3 12l6.8-2.4Z" />,
  book: (
    <>
      <path d="M4 5A2 2 0 0 1 6 3h13v14H6a2 2 0 0 0-2 2V5Z" />
      <path d="M4 19a2 2 0 0 1 2-2h13" />
      <path d="M8.5 7h6M8.5 10h4" />
    </>
  ),
};

function Icon({ name, size = 16, className }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {ICON_PATHS[name]}
    </svg>
  );
}

function SlashTextarea({
  value,
  onChange,
  onSelect,
  commands,
  onKeyDown,
  ...rest
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  const match = useMemo(
    () =>
      typeof value === "string" ? value.match(/(^|\s)\/([a-zA-Z-]*)$/) : null,
    [value],
  );
  const prefix = match ? match[2].toLowerCase() : "";
  const open = !!match && !dismissed;
  const filtered = open ? commands.filter((c) => c.id.startsWith(prefix)) : [];
  const active = filtered[Math.min(activeIndex, filtered.length - 1)];

  useEffect(() => {
    setActiveIndex(0);
    setDismissed(false);
  }, [value]);

  const select = (cmd) => {
    if (!cmd || !match) return;
    const tokenStart = match.index + match[1].length;
    onChange(value.slice(0, tokenStart) + cmd.template);
    setDismissed(true);
    onSelect?.(cmd);
  };

  const handleKeyDown = (e) => {
    if (open && filtered.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % filtered.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => (i - 1 + filtered.length) % filtered.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        if (active) {
          e.preventDefault();
          select(active);
          return;
        }
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setDismissed(true);
        return;
      }
    }
    onKeyDown?.(e);
  };

  return (
    <div className="slash-wrap">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        {...rest}
      />
      {open && filtered.length > 0 && (
        <div className="slash-menu">
          <div className="slash-menu-head">Commands</div>
          {filtered.map((c, i) => (
            <button
              key={c.id}
              type="button"
              className={`slash-item ${i === activeIndex ? "active" : ""}`}
              onMouseDown={(e) => {
                e.preventDefault();
                select(c);
              }}
              onMouseEnter={() => setActiveIndex(i)}
            >
              <Icon name={c.icon} size={13} />
              <span className="slash-name">/{c.id}</span>
              <span className="slash-desc">{c.desc}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const SIDEBAR = [
  { id: "dashboard", label: "Dashboard", icon: "grid" },
  { id: "experiments", label: "Experiments", icon: "flask" },
  { id: "projects", label: "Projects", icon: "folder" },
  { id: "files", label: "Files", icon: "file" },
  { id: "tools", label: "Tools", icon: "wrench" },
  { id: "automation", label: "Automation", icon: "zap" },
  { id: "memory", label: "Memory", icon: "chip" },
  { id: "knowledge", label: "Knowledge", icon: "book" },
  { id: "settings", label: "Settings", icon: "sliders" },
];

const QUICK_ACTIONS = [
  { label: "Debug", icon: "bug" },
  { label: "Analyze UI", icon: "paint" },
  { label: "Project", icon: "folder" },
  { label: "Connect", icon: "folder" },
  { label: "Experiment", icon: "flask" },
  { label: "Automate", icon: "zap" },
  { label: "Brainstorm", icon: "zap" },
];

const SLASH_COMMANDS = [
  {
    id: "debug",
    icon: "bug",
    desc: "Diagnose an error or stack trace",
    template: "Debug this error:\n\n",
    mode: "debug",
  },
  {
    id: "ui",
    icon: "paint",
    desc: "Review a UI screenshot",
    template: "Analyze this UI screenshot",
    mode: "ui",
  },
  {
    id: "fix",
    icon: "wrench",
    desc: "Find and fix a bug",
    template: "Find and fix the bug where ",
  },
  {
    id: "explain",
    icon: "search",
    desc: "Explain how something works",
    template: "Explain how ",
  },
  {
    id: "review",
    icon: "file",
    desc: "Review code and list issues",
    template: "Review the code and list issues: ",
  },
  {
    id: "tests",
    icon: "flask",
    desc: "Write or run tests",
    template: "Write tests for ",
  },
  {
    id: "brainstorm",
    icon: "zap",
    desc: "Brainstorm solutions for a hard problem",
    template: "Brainstorm: ",
  },
  {
    id: "automate",
    icon: "zap",
    desc: "Automate a repetitive task",
    template: "Automate ",
  },
  {
    id: "project",
    icon: "folder",
    desc: "Work with the attached project",
    template: "In the project, ",
  },
  {
    id: "connect",
    icon: "folder",
    desc: "Connect a folder as a project",
    template: "/connect ",
  },
];

const PIPELINE = [
  "Understanding request",
  "Identifying relevant files",
  "Inspecting code flow",
  "Finding suspicious behavior",
  "Preparing recommendation",
];

const TOOL_MANIFEST = [
  {
    name: "Read File",
    icon: "file",
    desc: "Reads any text file in the attached project when Hermes needs to inspect code.",
    available: true,
  },
  {
    name: "Search Files",
    icon: "search",
    desc: "Searches inside file contents across the whole project and returns matching snippets.",
    available: true,
  },
  {
    name: "Project Scanner",
    icon: "folder",
    desc: "Maps the project — total files, counts by type, and structure.",
    available: true,
  },
  {
    name: "Calculator",
    icon: "chip",
    desc: "Evaluates math expressions safely: + - * / % ^, parentheses, and functions like sqrt, log, min, max.",
    available: true,
  },
  {
    name: "JSON Parser",
    icon: "flask",
    desc: "Validates, pretty-prints, and summarizes JSON.",
    available: true,
  },
  {
    name: "Search Web",
    icon: "search",
    desc: "Looks up information on the web when the answer isn't in the project.",
    available: true,
  },
  {
    name: "Analyze Image",
    icon: "paint",
    desc: "Runs vision analysis on an image file inside the project.",
    available: true,
  },
  {
    name: "Execute Command",
    icon: "zap",
    desc: "Runs terminal commands in the project.",
    available: false,
    phase: "Phase 7 — Agent",
  },
  {
    name: "Modify File",
    icon: "wrench",
    desc: "Edits project files directly (Apply Fix is a preview of this).",
    available: false,
    phase: "Phase 7 — Agent",
  },
  {
    name: "Git",
    icon: "sliders",
    desc: "Git operations — commits, diffs, history.",
    available: false,
    phase: "Phase 7 — Agent",
  },
];

function ApprovalPrompt({ exp, onApprove }) {
  const [busy, setBusy] = useState(false);
  const pending = exp.agent?.pending;
  if (!pending) return null;
  const risk = pending.risk?.level || "medium";
  const argsText = Object.keys(pending.args || {}).length
    ? Object.entries(pending.args)
        .map(
          ([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`,
        )
        .join(" · ")
    : "";
  const toolLabel = pending.tool.replace(/_/g, " ");
  const decide = async (decision) => {
    if (busy) return;
    setBusy(true);
    try {
      await onApprove(exp.id, pending.approvalId, decision);
    } catch {
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="approval-wrap">
      <div className={`approval-card ${risk}`}>
        <div className="approval-head">
          <span className={`approval-badge ${risk}`}>
            {risk === "high" ? "!" : "✎"}
          </span>
          <span className="approval-title">Hermes wants to {toolLabel}</span>
          <span className={`approval-risk ${risk}`}>{risk} risk</span>
        </div>
        {argsText && <div className="approval-args mono">{argsText}</div>}
        <p className="approval-reason">
          {pending.explanation || "Review this action before allowing it."}
        </p>
        {pending.risk?.reason && (
          <p className="approval-reason">{pending.risk.reason}</p>
        )}
        <div className="approval-actions">
          <button
            className="btn ghost"
            disabled={busy}
            onClick={() => decide("deny")}
          >
            Deny
          </button>
          <button
            className="btn ghost"
            disabled={busy}
            onClick={() => decide("allow_once")}
          >
            Allow once
          </button>
          <button
            className="btn primary"
            disabled={busy}
            onClick={() => decide("allow_task")}
          >
            Allow this task
          </button>
        </div>
        {busy && (
          <p className="hint">
            <span className="hint-dot" /> Working…
          </p>
        )}
      </div>
    </div>
  );
}

function timeAgo(ts) {
  if (!ts) return "";
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function statusLabel(status) {
  if (status === "running") return "Running";
  if (status === "needs_approval") return "Approval needed";
  if (status === "completed") return "Completed";
  if (status === "failed") return "Failed";
  if (status === "cancelled") return "Cancelled";
  return status;
}

function severityOf(finding) {
  const s = finding.toLowerCase();
  if (s.startsWith("critical") || finding.startsWith("🔴")) return "critical";
  if (s.startsWith("warning") || finding.startsWith("🟡")) return "warning";
  if (s.startsWith("suggestion") || finding.startsWith("🟢"))
    return "suggestion";
  return "info";
}

function stripMarker(finding) {
  return finding
    .replace(/^(critical|warning|suggestion)[:\s-]+/i, "")
    .replace(/^[🔴🟡🟢]\s*/u, "")
    .trim();
}

function Markdown({ text }) {
  const blocks = [];
  let current = [];
  let inCode = false;

  const flush = () => {
    if (!current.length) return;
    blocks.push({ type: "lines", lines: current });
    current = [];
  };

  for (const line of text.split("\n")) {
    if (line.trim().startsWith("```")) {
      flush();
      inCode = !inCode;
      if (inCode) blocks.push({ type: "code", lines: [] });
      continue;
    }
    if (inCode) {
      blocks[blocks.length - 1].lines.push(line);
      continue;
    }
    if (line.startsWith("### ")) {
      flush();
      blocks.push({ type: "h3", text: line.slice(4) });
    } else if (line.startsWith("## ")) {
      flush();
      blocks.push({ type: "h2", text: line.slice(3) });
    } else if (line.startsWith("# ")) {
      flush();
      blocks.push({ type: "h1", text: line.slice(2) });
    } else {
      current.push(line);
    }
  }
  flush();

  const inline = (s) =>
    s
      .replace(/`([^`]+)`/g, (_, c) => `<code>${c}</code>`)
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");

  return (
    <div className="markdown">
      {blocks.map((b, i) => {
        if (b.type === "h1") return <h1 key={i}>{b.text}</h1>;
        if (b.type === "h2") return <h2 key={i}>{b.text}</h2>;
        if (b.type === "h3") return <h3 key={i}>{b.text}</h3>;
        if (b.type === "code")
          return (
            <pre key={i}>
              <code>{b.lines.join("\n")}</code>
            </pre>
          );
        const paragraphs = b.lines
          .join("\n")
          .split(/\n\s*\n/)
          .filter((p) => p.trim());
        return paragraphs.map((p, j) => {
          if (p.trim().startsWith("- ") || p.trim().startsWith("* ")) {
            return (
              <ul key={`${i}-${j}`}>
                {p.split("\n").map((l, k) => (
                  <li
                    key={k}
                    dangerouslySetInnerHTML={{
                      __html: inline(l.replace(/^[-*]\s+/, "")),
                    }}
                  />
                ))}
              </ul>
            );
          }
          return (
            <p
              key={`${i}-${j}`}
              dangerouslySetInnerHTML={{ __html: inline(p.trim()) }}
            />
          );
        });
      })}
    </div>
  );
}

const SKILL_META = {
  debugging: { label: "Debug", icon: "bug", color: "var(--red)" },
  coding: { label: "Code", icon: "wrench", color: "var(--cyan)" },
  research: { label: "Research", icon: "search", color: "var(--yellow)" },
  brainstorming: {
    label: "Brainstorm",
    icon: "zap",
    color: "var(--purple, #a78bfa)",
  },
  ui_analysis: { label: "UI", icon: "paint", color: "var(--pink, #f472b6)" },
  general: { label: "General", icon: "star", color: "var(--muted)" },
};

function SkillBadge({ skill, size = "card" }) {
  if (!skill) return null;
  const meta = SKILL_META[skill] || SKILL_META.general;
  return (
    <span
      className={`skill-badge ${size}`}
      style={{ "--skill-color": meta.color }}
    >
      <Icon name={meta.icon} size={size === "detail" ? 13 : 11} />
      {meta.label}
    </span>
  );
}

function ExperimentCard({ exp, active, onClick, onDelete }) {
  return (
    <div
      className={`exp-card ${exp.status} ${active ? "active" : ""}`}
      onClick={onClick}
    >
      <div className="exp-head">
        <span className="exp-id">#{exp.id}</span>
        {exp.kind === "automation" && (
          <span className="auto-badge card">auto</span>
        )}
        {exp.bridge?.handedOff && (
          <span className="auto-badge card bridge">agent</span>
        )}
        <SkillBadge skill={exp.skill} size="card" />
        <span className={`exp-status ${exp.status}`}>
          {statusLabel(exp.status)}
        </span>
        <span className="exp-time">{timeAgo(exp.createdAt)}</span>
      </div>
      <p className="exp-task">{exp.task}</p>
      {exp.status === "failed" && <p className="exp-error">{exp.error}</p>}
      <button
        className="exp-delete"
        onClick={(e) => {
          e.stopPropagation();
          onDelete(exp.id);
        }}
        title="Delete"
      >
        <Icon name="x" size={13} />
      </button>
    </div>
  );
}

function BrainstormCard({ b }) {
  if (!b || !b.iterations || !b.iterations.length) return null;
  const last = b.iterations[b.iterations.length - 1];
  return (
    <div className="diagnosis brainstorm">
      <h3>Brainstorming session</h3>
      <div className="diag-grid">
        <div className="diag-field">
          <label>Iterations</label>
          <p>
            {b.iterations.length} (max {b.config?.maxIterations})
          </p>
        </div>
        <div className="diag-field">
          <label>Candidates considered</label>
          <p>{b.iterations.reduce((n, it) => n + it.candidates.length, 0)}</p>
        </div>
        <div className="diag-field">
          <label>Best score</label>
          <p>{last.bestScore}/10</p>
        </div>
        <div className="diag-field">
          <label>Confidence</label>
          <p>{b.confidence != null ? `${b.confidence}%` : "—"}</p>
        </div>
      </div>
      {b.iterations.map((it, i) => (
        <div key={i} className="bs-round">
          <div className="bs-round-head">
            <strong>Round {it.n}</strong>
            <span>
              best: {it.best} — {it.bestScore}/10
              {it.improved === false
                ? " (no improvement)"
                : it.improved === true
                  ? " (improved)"
                  : ""}
            </span>
          </div>
          <ul className="bs-candidates">
            {it.candidates.map((c, j) => (
              <li key={j}>
                <span
                  className={`bs-score bs-score-${c.score >= 8 ? "hi" : c.score >= 5 ? "mid" : "lo"}`}
                >
                  {c.score}
                </span>
                <span>{c.title}</span>
                {c.notes && <span className="bs-note">— {c.notes}</span>}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function DiagnosisCard({ d }) {
  if (!d || (!d.cause && !d.location)) return null;
  const conf = d.confidence;
  const confLabel =
    conf == null ? null : conf >= 80 ? "High" : conf >= 50 ? "Medium" : "Low";
  return (
    <div className="diagnosis">
      <h3>Diagnosis</h3>
      <div className="diag-grid">
        {d.cause && (
          <div className="diag-field">
            <label>Likely cause</label>
            <p>{d.cause}</p>
          </div>
        )}
        {d.location && (
          <div className="diag-field">
            <label>Location</label>
            <p className="mono">{d.location}</p>
          </div>
        )}
        {d.why && (
          <div className="diag-field wide">
            <label>Why</label>
            <p>{d.why}</p>
          </div>
        )}
        {d.fix && (
          <div className="diag-field wide">
            <label>Suggested fix</label>
            <Markdown text={d.fix} />
          </div>
        )}
        {conf != null && (
          <div className="diag-field">
            <label>Confidence</label>
            <div className="conf-row">
              <div className="conf-bar">
                <div
                  className={`conf-fill ${confLabel?.toLowerCase()}`}
                  style={{ width: `${Math.min(100, Math.max(0, conf))}%` }}
                />
              </div>
              <span className="conf-label">
                {conf}% · {confLabel}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function DiagnosisActions({ exp, onReply, onApplyFix }) {
  const [showFiles, setShowFiles] = useState(false);
  const [fileBodies, setFileBodies] = useState({});
  const [loadingFile, setLoadingFile] = useState(null);
  const [busy, setBusy] = useState(null);
  const [apply, setApply] = useState(null);

  const diag = exp.diagnosis || {};
  const files = exp.contextFiles || [];
  const canApply =
    !!diag.fix &&
    !!diag.location &&
    !/unknown/i.test(diag.location || "") &&
    !!exp.projectId;
  const targetFile = (diag.location || "")
    .split(/[,:]\s*line\s*\d+/i)[0]
    .trim();

  const quick = async (kind) => {
    if (busy) return;
    setBusy(kind);
    try {
      await onReply(
        exp.id,
        kind === "explain"
          ? "Explain this diagnosis in more detail — step by step, in plain language."
          : "Give me a more concrete suggested fix with the exact code changes I should make.",
      );
    } catch {
    } finally {
      setBusy(null);
    }
  };

  const openFile = async (path) => {
    if (!exp.projectId || fileBodies[path] !== undefined) return;
    setLoadingFile(path);
    try {
      const data = await getProjectFile(exp.projectId, path);
      setFileBodies((prev) => ({ ...prev, [path]: data.content }));
    } catch (err) {
      setFileBodies((prev) => ({ ...prev, [path]: `Error: ${err.message}` }));
    } finally {
      setLoadingFile(null);
    }
  };

  const doApply = async () => {
    setApply({ phase: "busy" });
    try {
      await onApplyFix(exp.id);
      setApply({ phase: "done" });
    } catch (err) {
      setApply({ phase: "error", msg: err.message });
    }
  };

  const openPreview = async () => {
    setApply({ phase: "previewing" });
    try {
      const data = await previewFix(exp.id);
      setApply({ phase: "confirm", preview: data.previewFix });
    } catch (err) {
      setApply({ phase: "error", msg: err.message });
    }
  };

  return (
    <>
      <div className="diag-actions">
        <button
          className="btn ghost"
          disabled={!!busy}
          onClick={() => quick("explain")}
        >
          <Icon name="search" size={13} />{" "}
          {busy === "explain" ? "Working…" : "Explain"}
        </button>
        <button
          className="btn ghost"
          disabled={!!busy}
          onClick={() => quick("suggest")}
        >
          <Icon name="wrench" size={13} />{" "}
          {busy === "suggest" ? "Working…" : "Suggest Fix"}
        </button>
        <button
          className="btn ghost"
          disabled={!files.length}
          title={files.length ? "" : "No files were read for this experiment"}
          onClick={() => setShowFiles(!showFiles)}
        >
          <Icon name="file" size={13} />{" "}
          {showFiles ? "Hide Files" : "Show Files"}
        </button>
        <button
          className="btn primary"
          disabled={!canApply}
          title={
            canApply
              ? ""
              : "Needs a project attached and a diagnosis with a fix + file location"
          }
          onClick={openPreview}
        >
          <Icon name="arrow" size={13} /> Apply Fix
        </button>
      </div>

      {showFiles && (
        <div className="show-files">
          <div className="sf-head">Files Hermes read</div>
          {files.map((f) => (
            <div key={f} className="sf-file">
              <button className="sf-file-btn" onClick={() => openFile(f)}>
                <span className="file-dot" />
                <span className="mono">
                  {exp.pastedFile === f ? `Pasted code (${f})` : f}
                </span>
                {loadingFile === f && <span className="hint-dot" />}
              </button>
              {fileBodies[f] !== undefined && (
                <pre className="sf-content">
                  <code>{fileBodies[f]}</code>
                </pre>
              )}
            </div>
          ))}
        </div>
      )}

      {apply && (
        <div
          className="modal-overlay"
          onClick={apply.phase === "confirm" ? () => setApply(null) : undefined}
        >
          <div className="apply-modal" onClick={(e) => e.stopPropagation()}>
            {apply.phase === "confirm" && (
              <>
                <h4>Apply fix</h4>
                <p className="apply-intro">
                  Hermes wants to modify a file in your project:
                </p>
                <div className="apply-target">
                  <Icon name="wrench" size={13} />{" "}
                  <span className="mono">{targetFile}</span>
                </div>
                <p className="apply-note">
                  Preview only. Nothing has changed yet. Review the exact
                  replacement below before applying.
                </p>
                {apply.preview && (
                  <div className="fix-diff">
                    <div className="fix-diff-col">
                      <div className="fix-diff-label before">Before</div>
                      <pre>
                        <code>{apply.preview.replaced}</code>
                      </pre>
                    </div>
                    <div className="fix-diff-col">
                      <div className="fix-diff-label after">After</div>
                      <pre>
                        <code>{apply.preview.replacement}</code>
                      </pre>
                    </div>
                  </div>
                )}
                <div className="apply-actions">
                  <button className="btn ghost" onClick={() => setApply(null)}>
                    Deny
                  </button>
                  <button className="btn primary" onClick={doApply}>
                    Allow once
                  </button>
                </div>
              </>
            )}
            {apply.phase === "busy" && (
              <p className="apply-note busy">
                <span className="hint-dot" /> Hermes is preparing and applying
                the fix…
              </p>
            )}
            {apply.phase === "previewing" && (
              <p className="apply-note busy">
                <span className="hint-dot" /> Hermes is preparing a non-mutating
                preview…
              </p>
            )}
            {apply.phase === "done" && (
              <>
                <h4>Fix applied</h4>
                {exp.appliedFix && (
                  <div className="fix-diff">
                    <div className="fix-diff-col">
                      <div className="fix-diff-label before">Before</div>
                      <pre>
                        <code>{exp.appliedFix.replaced}</code>
                      </pre>
                    </div>
                    <div className="fix-diff-col">
                      <div className="fix-diff-label after">After</div>
                      <pre>
                        <code>{exp.appliedFix.replacement}</code>
                      </pre>
                    </div>
                  </div>
                )}
                <p className="apply-note">
                  Hermes modified <span className="mono">{targetFile}</span>.
                  The original content is saved on the experiment — you can roll
                  it back from the chat.
                </p>
                <div className="apply-actions">
                  <button
                    className="btn primary"
                    onClick={() => setApply(null)}
                  >
                    Done
                  </button>
                </div>
              </>
            )}
            {apply.phase === "error" && (
              <>
                <h4>Couldn't apply fix</h4>
                <p className="apply-note error">{apply.msg}</p>
                <div className="apply-actions">
                  <button
                    className="btn primary"
                    onClick={() => setApply(null)}
                  >
                    Close
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function UiBreakdown({ exp, onReply }) {
  const [asking, setAsking] = useState(false);
  const ua = exp.uiAnalysis;
  if (!ua) return null;
  const groups = [
    { key: "layout", label: "Layout", icon: "grid" },
    { key: "responsive", label: "Responsive", icon: "refresh" },
    { key: "ux", label: "UX", icon: "star" },
  ];
  const askDirection = async () => {
    if (asking) return;
    setAsking(true);
    try {
      await onReply(
        exp.id,
        "Give me a better direction for this design — propose concrete, specific improvements.",
      );
    } catch {
    } finally {
      setAsking(false);
    }
  };
  return (
    <div className="ui-breakdown">
      <h3>UI Breakdown</h3>
      <div className="ui-groups">
        {groups.map((g) => (
          <div key={g.key} className="ui-group">
            <div className="ui-group-head">
              <Icon name={g.icon} size={13} /> {g.label}
            </div>
            {ua[g.key]?.length ? (
              <ul>
                {ua[g.key].map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            ) : (
              <p className="ui-empty">No notes</p>
            )}
          </div>
        ))}
      </div>
      {ua.recommendation && (
        <div className="ui-recommendation">
          <div className="ui-group-head">
            <Icon name="arrow" size={13} /> Recommendation
          </div>
          <p>{ua.recommendation}</p>
        </div>
      )}
      <div className="ui-actions">
        <button className="btn ghost" disabled={asking} onClick={askDirection}>
          <Icon name="zap" size={13} />{" "}
          {asking ? "Working…" : "Better direction"}
        </button>
      </div>
    </div>
  );
}

function ThinkingSection({ exp }) {
  const [open, setOpen] = useState(true);
  const totalTime = ((exp.completedAt || Date.now()) - exp.createdAt) / 1000;
  const contextMs = exp.contextBuildMs || 0;
  const aiMs = exp.aiCallMs || 0;
  const files = exp.contextFiles || [];
  const model = exp.model || "AI";

  if (exp.status === "running") {
    const done = new Set(exp.progress || []);
    return (
      <div className="thinking running-think">
        <div className="thinking-header">
          <span className="thinking-icon spin">+</span>
          <span>Hermes is working…</span>
          {exp.skill && <SkillBadge skill={exp.skill} size="card" />}
        </div>
        <div className="steps pipeline">
          {PIPELINE.map((step, i) => {
            const isDone = done.has(step);
            const isCurrent = !isDone && (i === 0 || done.has(PIPELINE[i - 1]));
            return (
              <div
                key={step}
                className={`step ${isDone ? "done" : isCurrent ? "running" : ""}`}
              >
                <span className="step-dot" />
                {step}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className={`thinking ${open ? "open" : ""}`}>
      <button className="thinking-header" onClick={() => setOpen(!open)}>
        <span className="thinking-icon">{open ? "-" : "+"}</span>
        <span>Thought for {totalTime.toFixed(1)}s</span>
      </button>
      {open && (
        <div className="thinking-body">
          {exp.progress?.length > 0 && (
            <div className="thinking-group">
              <div className="thinking-group-label">Process</div>
              {exp.progress.map((s) => (
                <div key={s} className="thinking-op done-op">
                  <span className="op-check">✓</span> {s}
                </div>
              ))}
            </div>
          )}
          {files.length > 0 && (
            <div className="thinking-group">
              <div className="thinking-group-label">
                Read {files.length} files
              </div>
              {files.map((f) => (
                <div key={f} className="thinking-op">
                  <span className="op-arrow">→</span> {f}
                </div>
              ))}
            </div>
          )}
          {exp.toolCalls?.length > 0 && (
            <div className="thinking-group">
              <div className="thinking-group-label">Tools</div>
              {exp.toolCalls.map((t, i) => (
                <div key={i} className="thinking-op">
                  <span className="op-arrow">→</span> {t.name}{" "}
                  {JSON.stringify(t.args)}
                  {t.error ? " · failed" : ""}
                </div>
              ))}
            </div>
          )}
          {contextMs > 0 && (
            <div className="thinking-group">
              <div className="thinking-group-label">Context</div>
              <div className="thinking-op">
                <span className="op-arrow">→</span> Built project context in{" "}
                {(contextMs / 1000).toFixed(1)}s
              </div>
            </div>
          )}
          {aiMs > 0 && (
            <div className="thinking-group">
              <div className="thinking-group-label">AI</div>
              <div className="thinking-op">
                <span className="op-arrow">→</span> {model} responded in{" "}
                {(aiMs / 1000).toFixed(1)}s
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ChatThread({
  exp,
  onReply,
  onApplyFix,
  onApprove,
  onRollback,
  onCancel,
  onRetry,
  onEditMessage,
}) {
  const [reply, setReply] = useState("");
  const [replying, setReplying] = useState(false);
  const [copiedKey, setCopiedKey] = useState(null);
  const [editingIndex, setEditingIndex] = useState(null);
  const [editText, setEditText] = useState("");
  const bottomRef = useRef(null);

  const messages = exp.messages?.length
    ? exp.messages
    : exp.answer
      ? [
          { role: "user", content: exp.task, createdAt: exp.createdAt },
          {
            role: "assistant",
            content: exp.answer,
            createdAt: exp.completedAt,
          },
        ]
      : [{ role: "user", content: exp.task, createdAt: exp.createdAt }];

  const lastAssistant = [...messages]
    .reverse()
    .find((m) => m.role === "assistant");
  const findings = exp.findings?.length
    ? exp.findings
    : parseFindings(lastAssistant?.content || "");
  const busy = exp.status === "running" || exp.status === "needs_approval";

  const fmtTime = (ts) =>
    ts
      ? new Date(ts).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        })
      : "";

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, exp.status]);

  const submitReply = async (e) => {
    e.preventDefault();
    const msg = reply.trim();
    if (!msg || replying || busy) return;
    setReplying(true);
    try {
      await onReply(exp.id, msg);
      setReply("");
    } catch {
    } finally {
      setReplying(false);
    }
  };

  const copyText = async (text, key) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 1500);
    } catch {}
  };

  const retryWith = async (prompt, withImage = false) => {
    const p = String(prompt || "").trim();
    if (!p || busy || !onRetry) return;
    let img = null;
    if (withImage && exp.imageUrl) {
      try {
        const res = await fetch(`${API_URL}${exp.imageUrl}`);
        const blob = await res.blob();
        img = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => resolve(null);
          reader.readAsDataURL(blob);
        });
      } catch {
        img = null;
      }
    }
    onRetry(p, img);
  };

  const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
  const startEdit = (i, content) => {
    setEditingIndex(i);
    setEditText(content);
  };
  const saveEdit = (i, original) => {
    const text = editText.trim();
    setEditingIndex(null);
    if (!text || !onEditMessage) return;
    if (text === String(original ?? "").trim()) return;
    onEditMessage(exp.id, i, text, true);
  };

  return (
    <div className="chat-layout">
      <div className="chat-scroll">
        <div className="thread">
          {messages.map((m, i) =>
            m.role === "user" ? (
              <div key={i} className="msg user">
                <div className="msg-meta">
                  <span className="msg-who">You</span>
                  <span>{fmtTime(m.createdAt)}</span>
                </div>
                {i === 0 && exp.imageUrl && (
                  <a
                    className="chat-img-wrap"
                    href={`${API_URL}${exp.imageUrl}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <img
                      className="chat-img"
                      src={`${API_URL}${exp.imageUrl}`}
                      alt="uploaded screenshot"
                    />
                  </a>
                )}
                <div className="msg-body">
                  {editingIndex === i ? (
                    <div className="msg-edit">
                      <textarea
                        className="msg-edit-input"
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        autoFocus
                        rows={Math.min(
                          8,
                          Math.max(2, editText.split("\n").length),
                        )}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                            e.preventDefault();
                            saveEdit(i, m.content);
                          }
                          if (e.key === "Escape") setEditingIndex(null);
                        }}
                      />
                      {editText.trim() === String(m.content ?? "").trim() && (
                        <p className="msg-edit-hint">
                          No changes — edit the text to redo the response.
                        </p>
                      )}
                      <div className="msg-edit-actions">
                        <button
                          className="btn primary"
                          onClick={() => saveEdit(i, m.content)}
                          disabled={
                            !editText.trim() ||
                            editText.trim() === String(m.content ?? "").trim()
                          }
                        >
                          <Icon name="check" size={13} /> Save
                        </button>
                        <button
                          className="btn ghost"
                          onClick={() => setEditingIndex(null)}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    m.content
                  )}
                </div>
                {editingIndex !== i && (
                  <div className="msg-actions">
                    <button
                      className="msg-action-btn"
                      title="Edit prompt"
                      onClick={() => startEdit(i, m.content)}
                    >
                      <Icon name="pencil" size={13} /> Edit
                    </button>
                    <button
                      className="msg-action-btn"
                      title={
                        copiedKey === `u-${i}` ? "Copied!" : "Copy message"
                      }
                      onClick={() => copyText(m.content, `u-${i}`)}
                    >
                      <Icon name="copy" size={13} />
                      {copiedKey === `u-${i}` ? "Copied!" : "Copy"}
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div key={i} className="msg assistant">
                <div className="msg-meta">
                  <span className="msg-who">Hermes</span>
                  <span>{fmtTime(m.createdAt)}</span>
                </div>
                {m.content && (
                  <>
                    {m === lastAssistant && <ThinkingSection exp={exp} />}
                    {m === lastAssistant && exp.status === "completed" && (
                      <DiagnosisCard d={exp.diagnosis} />
                    )}
                    {m === lastAssistant &&
                      exp.status === "completed" &&
                      exp.diagnosis && (
                        <DiagnosisActions
                          exp={exp}
                          onReply={onReply}
                          onApplyFix={onApplyFix}
                        />
                      )}
                    {m === lastAssistant &&
                      exp.status === "completed" &&
                      exp.uiAnalysis && (
                        <UiBreakdown exp={exp} onReply={onReply} />
                      )}
                    {m === lastAssistant &&
                      exp.status === "completed" &&
                      exp.brainstorm && <BrainstormCard b={exp.brainstorm} />}
                    {m === lastAssistant &&
                      exp.status === "completed" &&
                      findings.length > 0 && (
                        <div className="findings">
                          <h3>Findings</h3>
                          {findings.map((f, j) => (
                            <div key={j} className={`finding ${severityOf(f)}`}>
                              <span className="finding-mark" />
                              <span>{stripMarker(f)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    <Markdown text={m.content} />
                  </>
                )}
                {m === lastAssistant && (
                  <div className="msg-actions">
                    <button
                      className="msg-action-btn"
                      disabled={busy}
                      onClick={() =>
                        retryWith(lastUserMsg?.content || exp.task, true)
                      }
                    >
                      <Icon name="refresh" size={13} /> Try again
                    </button>
                    <button
                      className="msg-action-btn"
                      onClick={() => copyText(m.content, "assistant")}
                    >
                      <Icon name="copy" size={13} />
                      {copiedKey === "assistant" ? "Copied!" : "Copy response"}
                    </button>
                  </div>
                )}
              </div>
            ),
          )}
          {exp.status === "failed" && (
            <div className="error-box">
              <strong>Experiment failed:</strong> {exp.error}
            </div>
          )}
          {exp.status === "running" && (
            <p className="hint">
              <span className="hint-dot" /> Hermes is working on it…
            </p>
          )}
          {exp.status === "needs_approval" && (
            <ApprovalPrompt exp={exp} onApprove={onApprove} />
          )}
          {exp.appliedFix && exp.status === "completed" && (
            <div
              className={`fix-chip ${exp.appliedFix.rolledBack ? "rolled-back" : ""}`}
            >
              <span className="fix-chip-text">
                <Icon name="wrench" size={12} />
                {exp.appliedFix.rolledBack
                  ? `Fix rolled back — ${exp.appliedFix.path} is back to its original content.`
                  : `Fix applied to `}
                {!exp.appliedFix.rolledBack && (
                  <span className="mono">{exp.appliedFix.path}</span>
                )}
              </span>
              {!exp.appliedFix.rolledBack && (
                <button
                  className="btn ghost"
                  onClick={async () => {
                    try {
                      await onRollback(exp.id);
                    } catch {}
                  }}
                >
                  Rollback
                </button>
              )}
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      <form className="reply-bar" onSubmit={submitReply}>
        <SlashTextarea
          value={reply}
          onChange={setReply}
          commands={SLASH_COMMANDS}
          placeholder={
            busy
              ? "Hermes is working… (click the button to stop)"
              : "Ask anything… (type / for commands)"
          }
          rows={1}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !busy) {
              e.preventDefault();
              submitReply(e);
            }
          }}
        />
        {busy ? (
          <button
            type="button"
            className="reply-send stop"
            onClick={() => onCancel(exp.id)}
            title="Stop task"
          >
            <span className="stop-icon" />
          </button>
        ) : (
          <button
            type="submit"
            className="reply-send"
            disabled={!reply.trim() || replying}
            title="Send"
          >
            <Icon name="arrow" size={16} />
          </button>
        )}
      </form>
      {replying && (
        <p className="hint">
          <span className="hint-dot" /> Hermes is working on it…
        </p>
      )}
    </div>
  );
}

function BridgeResultCard({ bridge }) {
  const files = bridge.changedFiles || [];
  return (
    <div className="diagnosis bridge-card">
      <h3>
        Handed off to Hermes Agent
        <span className="bridge-chip">agent</span>
      </h3>
      <div className="diag-grid">
        <div className="diag-field">
          <label>Agent API</label>
          <p className="mono">{bridge.url}</p>
        </div>
        <div className="diag-field">
          <label>Agent time</label>
          <p>
            {bridge.elapsedMs != null
              ? `${Math.round(bridge.elapsedMs / 1000)}s`
              : "—"}
          </p>
        </div>
        {bridge.model && (
          <div className="diag-field">
            <label>Model</label>
            <p>{bridge.model}</p>
          </div>
        )}
        <div className="diag-field">
          <label>Files changed</label>
          <p>
            {files.length ? files.length : "none"}
            {bridge.removedFiles?.length
              ? ` · ${bridge.removedFiles.length} removed`
              : ""}
          </p>
        </div>
      </div>
      {files.length > 0 && (
        <div className="bridge-files">
          <label>Changed by the agent</label>
          <ul>
            {files.map((f) => (
              <li key={f} className="mono">
                {f}
              </li>
            ))}
          </ul>
        </div>
      )}
      {bridge.verify && (
        <div className="bridge-files">
          <label>Verification</label>
          {bridge.verify.skipped ? (
            <p className="bridge-hint">{bridge.verify.skipped}</p>
          ) : (
            <div
              className={`bridge-verify ${bridge.verify.ok ? "ok" : "fail"}`}
            >
              <span>
                <code>{bridge.verify.command}</code> — exit code{" "}
                {bridge.verify.exitCode}
                {bridge.verify.timedOut ? " (timed out)" : ""}
              </span>
              {bridge.verify.output && (
                <pre className="bridge-verify-out">{bridge.verify.output}</pre>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ExperimentDetail({
  exp,
  onReply,
  onDelete,
  onApplyFix,
  onApprove,
  onRollback,
  onCancel,
  onRetry,
  onEditMessage,
}) {
  return (
    <div className="exp-detail">
      <div className="exp-detail-head">
        <h2>
          Experiment <span className="mono">#{exp.id}</span>
          <SkillBadge skill={exp.skill} size="detail" />
        </h2>
        <div className="exp-detail-actions">
          <span className={`exp-status ${exp.status}`}>
            {statusLabel(exp.status)}
          </span>
          <button
            className="btn danger"
            onClick={() => {
              if (confirm("Delete this experiment?")) onDelete(exp.id);
            }}
          >
            <Icon name="trash" size={13} /> Delete
          </button>
        </div>
      </div>
      <p className="exp-detail-task">{exp.task}</p>
      <p className="exp-detail-time">
        Started {new Date(exp.createdAt).toLocaleString()}
        {exp.completedAt ? ` · Finished ${timeAgo(exp.completedAt)} ago` : ""}
      </p>
      {exp.bridge?.handedOff && <BridgeResultCard bridge={exp.bridge} />}
      <ChatThread
        exp={exp}
        onReply={onReply}
        onApplyFix={onApplyFix}
        onApprove={onApprove}
        onRollback={onRollback}
        onCancel={onCancel}
        onRetry={onRetry}
        onEditMessage={onEditMessage}
      />
    </div>
  );
}

function Dashboard({
  onSubmit,
  running,
  experiments,
  projects,
  activeProjectId,
  onSetActive,
  active,
  onReply,
  onOpenExp,
  onApplyFix,
  onApprove,
  onRollback,
  onCancel,
  onEditMessage,
}) {
  const [task, setTask] = useState("");
  const [debugMode, setDebugMode] = useState(false);
  const [uiMode, setUiMode] = useState(false);
  const [image, setImage] = useState(null);
  const [imageName, setImageName] = useState("");
  const [fileError, setFileError] = useState("");

  const submit = (e) => {
    e.preventDefault();
    if (running) return;
    if (debugMode) {
      if (!task.trim()) return;
      onSubmit(`Debug this error:\n\n${task.trim()}`);
    } else if (uiMode) {
      if (!image) return;
      onSubmit(task.trim() || "Analyze this UI screenshot", image);
    } else {
      if (!task.trim()) return;
      onSubmit(task.trim());
    }
    setTask("");
    setDebugMode(false);
    setUiMode(false);
    setImage(null);
    setImageName("");
    setFileError("");
  };

  const applyCommand = (cmd) => {
    if (cmd.mode === "debug") {
      setDebugMode(true);
      setUiMode(false);
    } else if (cmd.mode === "ui") {
      setUiMode(true);
      setDebugMode(false);
    } else {
      setDebugMode(false);
      setUiMode(false);
    }
  };

  const handleFile = (file) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setFileError("Please choose an image file (PNG, JPG, WebP, GIF).");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setFileError("That image is over 8MB — please use a smaller screenshot.");
      return;
    }
    setFileError("");
    const reader = new FileReader();
    reader.onload = () => {
      setImage(reader.result);
      setImageName(file.name);
    };
    reader.readAsDataURL(file);
  };

  if (active) {
    return (
      <div className="chat-pane">
        <ChatThread
          exp={active}
          onReply={onReply}
          onApplyFix={onApplyFix}
          onApprove={onApprove}
          onRollback={onRollback}
          onCancel={onCancel}
          onRetry={onSubmit}
          onEditMessage={onEditMessage}
        />
      </div>
    );
  }

  return (
    <div className="dashboard">
      <div className="prompt-wrap">
        <p className="eyebrow">Hermes Command Line</p>
        <h1 className="hero">
          {uiMode ? (
            <>
              Upload a screenshot to <em>analyze</em>
            </>
          ) : debugMode ? (
            <>
              Paste the error to <em>diagnose</em>
            </>
          ) : (
            <>
              What do you want <em>Hermes</em> to do?
            </>
          )}
        </h1>
        <form className="prompt-box" onSubmit={submit}>
          <div className="prompt-project">
            <Icon name="folder" size={13} />
            <select
              value={activeProjectId || ""}
              onChange={(e) => onSetActive(e.target.value || null)}
            >
              <option value="">No project (general task)</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            {activeProjectId && (
              <span className="prompt-project-tag">
                Attached: {projects.find((p) => p.id === activeProjectId)?.name}
              </span>
            )}
            <button
              type="button"
              className={`debug-toggle ${debugMode ? "on" : ""}`}
              onClick={() => {
                setDebugMode(!debugMode);
                setUiMode(false);
                setTask("");
              }}
            >
              <Icon name="bug" size={13} /> Debug
            </button>
          </div>
          {uiMode && (
            <>
              <div
                className={`upload-zone ${image ? "has-image" : ""}`}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  handleFile(e.dataTransfer.files?.[0]);
                }}
              >
                <input
                  id="ui-file"
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  onChange={(e) => {
                    handleFile(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                  hidden
                />
                {image ? (
                  <div className="upload-preview-wrap">
                    <img
                      className="upload-preview"
                      src={image}
                      alt="screenshot preview"
                    />
                    <div className="upload-meta">
                      <span className="upload-name">{imageName}</span>
                      <button
                        type="button"
                        className="btn ghost"
                        onClick={() => {
                          setImage(null);
                          setImageName("");
                        }}
                      >
                        <Icon name="x" size={13} /> Remove
                      </button>
                    </div>
                  </div>
                ) : (
                  <label htmlFor="ui-file" className="upload-label">
                    <Icon name="paint" size={20} />
                    <span className="upload-title">
                      Click to upload a screenshot, or drop one here
                    </span>
                    <span className="upload-hint">
                      PNG, JPG, WebP or GIF · max 8MB
                    </span>
                  </label>
                )}
              </div>
              {fileError && <p className="file-error">{fileError}</p>}
            </>
          )}
          <SlashTextarea
            autoFocus
            value={task}
            onChange={setTask}
            commands={SLASH_COMMANDS}
            onSelect={applyCommand}
            placeholder={
              uiMode
                ? 'Optional — what should Hermes focus on? e.g. "the checkout modal"'
                : debugMode
                  ? "Paste the error or stack trace here, e.g. \"Cannot read properties of undefined (reading 'ingredients')\""
                  : 'e.g. "Investigate why the login button isn\'t working." · type / for commands'
            }
            rows={debugMode ? 6 : 2}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit(e);
              }
            }}
          />
          <div className="prompt-foot">
            <div className="quick-actions">
              {QUICK_ACTIONS.map((a) => (
                <button
                  key={a.label}
                  type="button"
                  className="chip"
                  onClick={() => {
                    if (a.label === "Debug") {
                      setDebugMode(true);
                      setUiMode(false);
                      setTask("");
                    } else if (a.label === "Analyze UI") {
                      setUiMode(true);
                      setDebugMode(false);
                      setTask("");
                    } else if (a.label === "Connect") {
                      setDebugMode(false);
                      setUiMode(false);
                      setTask("/connect ");
                    } else {
                      setDebugMode(false);
                      setUiMode(false);
                      setTask(`${a.label}: `);
                    }
                  }}
                >
                  <Icon name={a.icon} size={13} /> {a.label}
                </button>
              ))}
            </div>
            <button
              type="submit"
              className="btn primary"
              disabled={running || (uiMode ? !image : !task.trim())}
            >
              {running ? (
                "Running…"
              ) : debugMode ? (
                "Diagnose"
              ) : uiMode ? (
                "Analyze"
              ) : (
                <>
                  Run Experiment <Icon name="arrow" size={14} />
                </>
              )}
            </button>
          </div>
        </form>
        {running && (
          <p className="hint">
            <span className="hint-dot" /> Hermes is working on the task…
          </p>
        )}
      </div>

      {experiments.length > 0 && (
        <section className="recent">
          <div className="section-head">
            <h3>Recent runs</h3>
            <span className="rule" />
          </div>
          <div className="exp-list">
            {experiments.slice(0, 4).map((exp) => (
              <ExperimentCard
                key={exp.id}
                exp={exp}
                onClick={() => onOpenExp(exp.id)}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function ProjectCard({ project, active, onOpen, onDelete }) {
  const stats = project.stats || {};
  return (
    <div className={`project-card ${active ? "active" : ""}`} onClick={onOpen}>
      <div className="project-head">
        <span className="project-icon">
          <Icon name="folder" size={15} />
        </span>
        <span className="project-name">{project.name}</span>
        <span className="project-path mono">{project.path}</span>
        <button
          className="exp-delete"
          onClick={(e) => {
            e.stopPropagation();
            if (confirm(`Remove project "${project.name}"?`))
              onDelete(project.id);
          }}
          title="Remove"
        >
          <Icon name="x" size={13} />
        </button>
      </div>
      <div className="project-stats">
        <span>{stats.totalFiles ?? "?"} files</span>
        {Object.entries(stats)
          .filter(([k]) => k !== "totalFiles")
          .map(
            ([k, v]) =>
              v > 0 && (
                <span key={k}>
                  {v} {k}
                </span>
              ),
          )}
      </div>
    </div>
  );
}

function SettingsView() {
  const [trustLevel, setTrustLevel] = useState(1);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const s = await getSettings();
        setTrustLevel(s.trustLevel);
        setLoaded(true);
      } catch (err) {
        setError(err.message);
      }
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    setSaved("");
    setError("");
    try {
      const s = await saveSettings(trustLevel);
      setTrustLevel(s.trustLevel);
      setSaved("Settings saved.");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const LEVELS = [
    {
      value: 1,
      label: "Level 1 — Suggest only",
      desc: "Hermes only reports issues and suggests fixes. Nothing is changed or run automatically.",
    },
    {
      value: 2,
      label: "Level 2 — Auto-fix low risk",
      desc: "Low-risk edits and safe commands (tests, builds, checks) run automatically. Risky actions ask for approval.",
    },
    {
      value: 3,
      label: "Level 3 — Full autonomous",
      desc: "Hermes edits files and runs commands on its own inside the project. Destructive or high-risk actions still ask.",
    },
  ];

  return (
    <div className="settings-view">
      <div className="settings-head">
        <h2>Settings</h2>
        <p className="settings-intro">
          Trust levels control how much Hermes can do on its own. You can always
          deny an individual action no matter the level.
        </p>
      </div>
      {error && (
        <div className="error-box settings-error">
          {error}
          <button className="btn ghost" onClick={() => setError("")}>
            <Icon name="x" size={13} />
          </button>
        </div>
      )}
      {saved && <p className="memory-saved">{saved}</p>}
      <div className="settings-card">
        <h3>Trust level</h3>
        {LEVELS.map((l) => (
          <label
            key={l.value}
            className={`trust-option ${trustLevel === l.value ? "active" : ""}`}
          >
            <input
              type="radio"
              name="trust"
              checked={trustLevel === l.value}
              onChange={() => setTrustLevel(l.value)}
            />
            <div className="trust-option-body">
              <span className="trust-option-label">{l.label}</span>
              <span className="trust-option-desc">{l.desc}</span>
            </div>
          </label>
        ))}
        <div className="memory-actions">
          <button
            className="btn primary"
            onClick={save}
            disabled={saving || !loaded}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
      <BridgeSettings />
    </div>
  );
}

function BridgeSettings() {
  const [cfg, setCfg] = useState(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saved, setSaved] = useState("");
  const [error, setError] = useState("");
  const [testResult, setTestResult] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        setCfg(await getBridge());
      } catch (err) {
        setError(err.message);
      }
    })();
  }, []);

  const set = (patch) => setCfg((c) => ({ ...c, ...patch }));

  const save = async () => {
    setSaving(true);
    setSaved("");
    setError("");
    setTestResult(null);
    try {
      const c = await saveBridge(cfg);
      setCfg(c);
      setSaved("Bridge settings saved.");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    setTesting(true);
    setSaved("");
    setError("");
    setTestResult(null);
    try {
      const r = await testBridge(cfg);
      setTestResult(r);
    } catch (err) {
      setTestResult({ ok: false, error: err.message });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="settings-card">
      <h3>Hermes Agent bridge</h3>
      {error && (
        <div className="error-box settings-error">
          {error}
          <button className="btn ghost" onClick={() => setError("")}>
            <Icon name="x" size={13} />
          </button>
        </div>
      )}
      {saved && <p className="memory-saved">{saved}</p>}
      {cfg && (
        <>
          <label className={`trust-option ${cfg.enabled ? "active" : ""}`}>
            <input
              type="checkbox"
              checked={cfg.enabled}
              onChange={(e) => set({ enabled: e.target.checked })}
            />
            <div className="trust-option-body">
              <span className="trust-option-label">
                Hand experiments to the Hermes Agent
              </span>
              <span className="trust-option-desc">
                When a project is attached, the task is sent to your local
                Hermes Agent (Nous Research) to execute — it reads, edits and
                verifies with its own tools. Your app reports the result and
                what files changed. Turn this off to use the built-in AI.
              </span>
            </div>
          </label>
          <div className="bridge-field">
            <label>Agent API URL</label>
            <input
              type="text"
              className="bridge-input"
              value={cfg.baseUrl}
              onChange={(e) => set({ baseUrl: e.target.value })}
              placeholder="http://127.0.0.1:8642/v1"
              disabled={!cfg.enabled}
            />
            <span className="bridge-hint">
              The Hermes Agent's OpenAI-compatible API server. Run{" "}
              <code>hermes gateway</code> after setting{" "}
              <code>API_SERVER_ENABLED=true</code> in{" "}
              <code>~/.hermes/.env</code>.
            </span>
          </div>
          <div className="bridge-field">
            <label>API key (API_SERVER_KEY)</label>
            <input
              type="password"
              className="bridge-input"
              value={cfg.apiKey}
              onChange={(e) => set({ apiKey: e.target.value })}
              placeholder="leave blank if the server has no key"
              disabled={!cfg.enabled}
            />
          </div>
          <div className="bridge-field">
            <label>Verification command (optional)</label>
            <input
              type="text"
              className="bridge-input"
              value={cfg.verifyCommand}
              onChange={(e) => set({ verifyCommand: e.target.value })}
              placeholder="e.g. npm test — runs after the agent finishes"
              disabled={!cfg.enabled}
            />
            <span className="bridge-hint">
              Runs in the project folder after the agent finishes, so you get
              proof the fix works. Skipped automatically at trust level 1
              (suggest only).
            </span>
          </div>
          <div className="memory-actions">
            <button
              className="btn primary"
              onClick={save}
              disabled={saving || !cfg}
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              className="btn ghost"
              onClick={test}
              disabled={testing || !cfg.enabled}
            >
              {testing ? "Testing…" : "Test connection"}
            </button>
          </div>
          {testResult && (
            <div className={`bridge-test ${testResult.ok ? "ok" : "fail"}`}>
              {testResult.ok ? (
                <>
                  <Icon name="check" size={13} /> {testResult.message}
                </>
              ) : (
                <>
                  <Icon name="x" size={13} /> {testResult.error}
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function AutomationView({ experiments, onOpenExp }) {
  const [config, setConfig] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState("");
  const [error, setError] = useState("");
  const [running, setRunning] = useState(false);
  const reports = (experiments || [])
    .filter((e) => e.kind === "automation")
    .sort((a, b) => b.createdAt - a.createdAt);

  useEffect(() => {
    (async () => {
      try {
        setConfig(await getAutomation());
      } catch (err) {
        setError(err.message);
      }
    })();
  }, []);

  const set = (patch) => setConfig((c) => ({ ...c, ...patch }));

  const save = async () => {
    setSaving(true);
    setSaved("");
    setError("");
    try {
      const c = await saveAutomation(config);
      setConfig(c);
      setSaved("Automation settings saved.");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const runNow = async () => {
    setRunning(true);
    setError("");
    try {
      const r = await runAutomation();
      setSaved(r.note || "Done.");
    } catch (err) {
      setError(err.message);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="automation-view">
      <div className="settings-head">
        <h2>Automation</h2>
        <p className="settings-intro">
          Let Hermes work on its own: scan new projects for obvious issues and
          validate JSON files as they appear. Every run becomes an automation
          report in Experiments.
        </p>
      </div>
      {error && (
        <div className="error-box settings-error">
          {error}
          <button className="btn ghost" onClick={() => setError("")}>
            <Icon name="x" size={13} />
          </button>
        </div>
      )}
      {saved && <p className="memory-saved">{saved}</p>}

      {config && (
        <div className="settings-card">
          <h3>Triggers</h3>
          <label className={`trust-option ${config.enabled ? "active" : ""}`}>
            <input
              type="checkbox"
              checked={config.enabled}
              onChange={(e) => set({ enabled: e.target.checked })}
            />
            <div className="trust-option-body">
              <span className="trust-option-label">Enable automation</span>
              <span className="trust-option-desc">
                Master switch for all background checks.
              </span>
            </div>
          </label>
          <label
            className={`trust-option ${config.scanNewProject ? "active" : ""}`}
          >
            <input
              type="checkbox"
              checked={config.scanNewProject}
              disabled={!config.enabled}
              onChange={(e) => set({ scanNewProject: e.target.checked })}
            />
            <div className="trust-option-body">
              <span className="trust-option-label">Scan new projects</span>
              <span className="trust-option-desc">
                When you add a project, Hermes scans it and reports obvious
                issues automatically.
              </span>
            </div>
          </label>
          <label
            className={`trust-option ${config.validateJson ? "active" : ""}`}
          >
            <input
              type="checkbox"
              checked={config.validateJson}
              disabled={!config.enabled}
              onChange={(e) => set({ validateJson: e.target.checked })}
            />
            <div className="trust-option-body">
              <span className="trust-option-label">
                Validate new JSON files
              </span>
              <span className="trust-option-desc">
                Every new .json file in a watched project gets a JSON.parse
                check. Broken files are reported automatically.
              </span>
            </div>
          </label>
          <label className="trust-option">
            <div className="trust-option-body">
              <span className="trust-option-label">Check every</span>
              <span className="trust-option-desc">
                <input
                  type="number"
                  min="1"
                  max="60"
                  value={config.intervalMin}
                  disabled={!config.enabled}
                  onChange={(e) => set({ intervalMin: e.target.value })}
                  className="interval-input"
                />{" "}
                minute(s) — how often watched projects are checked for new
                files.
              </span>
            </div>
          </label>
          <div className="memory-actions">
            <button
              className="btn primary"
              onClick={save}
              disabled={saving || !config}
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button className="btn ghost" onClick={runNow} disabled={running}>
              <Icon name="zap" size={13} />
              {running ? "Scanning…" : "Run scans now"}
            </button>
          </div>
        </div>
      )}

      <div className="settings-card">
        <h3>Recent automation reports</h3>
        {reports.length === 0 ? (
          <p className="dim">
            No automation reports yet. Add a project or run a scan to see
            results here.
          </p>
        ) : (
          <div className="auto-reports">
            {reports.slice(0, 10).map((e) => (
              <div
                key={e.id}
                className={`auto-report ${e.status}`}
                onClick={() => onOpenExp?.(e.id)}
              >
                <div className="auto-report-head">
                  <span className={`auto-badge ${e.autoSubtype}`}>
                    {e.autoSubtype}
                  </span>
                  <span className="auto-status">{e.status}</span>
                  <span className="exp-time">{timeAgo(e.createdAt)}</span>
                </div>
                <p className="auto-task">{e.task}</p>
                {e.error && <p className="exp-error">{e.error}</p>}
                {e.findings?.length > 0 && (
                  <p className="auto-findings">
                    {e.findings.length} finding
                    {e.findings.length > 1 ? "s" : ""}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function KnowledgeView() {
  const [state, setState] = useState(null);
  const [vaultName, setVaultName] = useState("");
  const [vaultPath, setVaultPath] = useState("");
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [saved, setSaved] = useState("");
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [searching, setSearching] = useState(false);
  const [notes, setNotes] = useState(null);

  const load = async (silent) => {
    if (!silent) setBusy(true);
    setError("");
    try {
      setState(await getKnowledge());
    } catch (err) {
      setError(err.message);
    } finally {
      if (!silent) setBusy(false);
    }
  };

  useEffect(() => {
    load(true);
  }, []);

  const add = async () => {
    if (!vaultName.trim() || !vaultPath.trim() || adding) return;
    setAdding(true);
    setSaved("");
    setError("");
    try {
      const r = await addVault(vaultName.trim(), vaultPath.trim());
      setVaultName("");
      setVaultPath("");
      setSaved(`Vault registered — ${r.vault.noteCount} note(s) indexed.`);
      await load(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setAdding(false);
    }
  };

  const remove = async (id) => {
    setError("");
    try {
      await removeVault(id);
      setSaved("Vault removed.");
      await load(true);
    } catch (err) {
      setError(err.message);
    }
  };

  const rescan = async () => {
    setBusy(true);
    setSaved("");
    setError("");
    try {
      const r = await rescanKnowledge();
      setSaved(`Rescan done — ${r.noteCount} note(s) indexed.`);
      setState((s) =>
        s
          ? {
              ...s,
              vaults: r.vaults,
              noteCount: r.noteCount,
              lastScanAt: r.lastScanAt,
            }
          : s,
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    setBusy(true);
    setSaved("");
    setError("");
    try {
      const r = await saveKnowledgeConfig(state.config);
      setState((s) => (s ? { ...s, config: r.config } : s));
      setSaved("Knowledge settings saved.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const set = (patch) =>
    setState((s) => (s ? { ...s, config: { ...s.config, ...patch } } : s));

  const search = async () => {
    if (!q.trim()) {
      setNotes(null);
      return;
    }
    setSearching(true);
    setError("");
    try {
      setNotes(await searchKnowledgeNotes(q.trim()));
    } catch (err) {
      setError(err.message);
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="knowledge-view">
      <div className="settings-head">
        <h2>Knowledge</h2>
        <p className="settings-intro">
          Point Hermes at an Obsidian vault and your notes become long-term
          memory — the most relevant ones are injected into every experiment.
        </p>
      </div>
      {error && (
        <div className="error-box settings-error">
          {error}
          <button className="btn ghost" onClick={() => setError("")}>
            <Icon name="x" size={13} />
          </button>
        </div>
      )}
      {saved && <p className="memory-saved">{saved}</p>}

      <div className="settings-card">
        <h3>Vaults</h3>
        <div className="knowledge-add">
          <input
            type="text"
            value={vaultName}
            onChange={(e) => setVaultName(e.target.value)}
            placeholder="Vault name (e.g. My Brain)"
          />
          <input
            type="text"
            value={vaultPath}
            onChange={(e) => setVaultPath(e.target.value)}
            placeholder="Folder path to the vault"
          />
          <button
            className="btn primary"
            onClick={add}
            disabled={adding || !vaultName.trim() || !vaultPath.trim()}
          >
            <Icon name="plus" size={13} />
            {adding ? "Adding…" : "Add vault"}
          </button>
        </div>
        {state && state.vaults.length === 0 && (
          <p className="dim">
            No vaults yet. Add the folder of your Obsidian vault above.
          </p>
        )}
        {state &&
          state.vaults.map((v) => (
            <div key={v.id} className="knowledge-vault">
              <div className="knowledge-vault-info">
                <Icon name="folder" size={14} />
                <div>
                  <span className="knowledge-vault-name">{v.name}</span>
                  <span className="knowledge-vault-path">{v.path}</span>
                </div>
                <span className="auto-badge">
                  {v.noteCount} note{v.noteCount === 1 ? "" : "s"}
                </span>
              </div>
              <button className="btn ghost" onClick={() => remove(v.id)}>
                <Icon name="trash" size={13} />
              </button>
            </div>
          ))}
        <div className="memory-actions">
          <button
            className="btn ghost"
            onClick={rescan}
            disabled={busy || !state || state.vaults.length === 0}
          >
            <Icon name="refresh" size={13} />
            {busy ? "Scanning…" : "Rescan vaults"}
          </button>
          {state?.lastScanAt > 0 && (
            <span className="dim knowledge-scan-time">
              Last scanned {timeAgo(state.lastScanAt)} ago · {state.noteCount}{" "}
              note(s) indexed
            </span>
          )}
        </div>
      </div>

      {state && (
        <div className="settings-card">
          <h3>Injection</h3>
          <label
            className={`trust-option ${state.config.inject ? "active" : ""}`}
          >
            <input
              type="checkbox"
              checked={state.config.inject}
              onChange={(e) => set({ inject: e.target.checked })}
            />
            <div className="trust-option-body">
              <span className="trust-option-label">
                Inject knowledge into experiments
              </span>
              <span className="trust-option-desc">
                Hermes reads your vault's most relevant notes at the start of
                every task.
              </span>
            </div>
          </label>
          <label className="trust-option">
            <div className="trust-option-body">
              <span className="trust-option-label">Notes per task</span>
              <span className="trust-option-desc">
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={state.config.maxNotes}
                  disabled={!state.config.inject}
                  onChange={(e) => set({ maxNotes: e.target.value })}
                  className="interval-input"
                />{" "}
                notes — how many of the most relevant notes get injected.
              </span>
            </div>
          </label>
          <label className="trust-option">
            <div className="trust-option-body">
              <span className="trust-option-label">Character budget</span>
              <span className="trust-option-desc">
                <input
                  type="number"
                  min="500"
                  max="8000"
                  step="500"
                  value={state.config.maxChars}
                  disabled={!state.config.inject}
                  onChange={(e) => set({ maxChars: e.target.value })}
                  className="interval-input"
                />{" "}
                chars — total note text allowed per task.
              </span>
            </div>
          </label>
          <div className="memory-actions">
            <button className="btn primary" onClick={save} disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      )}

      <div className="settings-card">
        <h3>Notes</h3>
        <div className="knowledge-search">
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search()}
            placeholder="Search notes… (title, tags, aliases, content)"
          />
          <button
            className="btn ghost"
            onClick={search}
            disabled={searching || !q.trim()}
          >
            <Icon name="search" size={13} />
            {searching ? "Searching…" : "Search"}
          </button>
        </div>
        {notes && notes.length === 0 && (
          <p className="dim">No notes match that search.</p>
        )}
        {notes && notes.length > 0 && (
          <div className="knowledge-notes">
            {notes.map((n) => (
              <div key={n.vaultId + ":" + n.path} className="knowledge-note">
                <div className="knowledge-note-head">
                  <span className="knowledge-note-title">{n.title}</span>
                  <span className="dim">{n.path}</span>
                  {n.score > 0 && (
                    <span className="auto-badge">{n.score} pts</span>
                  )}
                </div>
                {n.tags?.length > 0 && (
                  <span className="knowledge-tags">#{n.tags.join(" #")}</span>
                )}
                {n.linkCount > 0 && (
                  <span className="knowledge-links">
                    {n.linkCount} link{n.linkCount > 1 ? "s" : ""}
                  </span>
                )}
                {n.excerpt && (
                  <p className="knowledge-note-excerpt">{n.excerpt}</p>
                )}
              </div>
            ))}
          </div>
        )}
        {!notes && state && state.vaults.length > 0 && (
          <p className="dim">Search your notes to browse them.</p>
        )}
      </div>
    </div>
  );
}

function MemoryView() {
  const [memory, setMemory] = useState(null);
  const [globalText, setGlobalText] = useState("");
  const [projectText, setProjectText] = useState("");
  const [projectId, setProjectId] = useState("");
  const [projects, setProjects] = useState([]);
  const [busy, setBusy] = useState(false);
  const [learning, setLearning] = useState(false);
  const [saved, setSaved] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const [mem, projs] = await Promise.all([getMemory(), getProjects()]);
        setMemory(mem);
        setGlobalText(mem.global?.notes || "");
        setProjects(projs);
      } catch (err) {
        setError(err.message);
      }
    })();
  }, []);

  const selectProject = (id) => {
    setProjectId(id);
    setProjectText(memory?.projects?.[id]?.notes || "");
  };

  const saveGlobal = async () => {
    setBusy(true);
    setSaved("");
    setError("");
    try {
      const mem = await saveGlobalMemory(globalText);
      setMemory(mem);
      setSaved("Global memory saved.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const saveProject = async () => {
    if (!projectId) return;
    setBusy(true);
    setSaved("");
    setError("");
    try {
      const mem = await saveProjectMemory(projectId, projectText);
      setMemory(mem);
      setSaved("Project memory saved.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const learn = async () => {
    if (!projectId || learning) return;
    setLearning(true);
    setSaved("");
    setError("");
    try {
      const mem = await learnProjectMemory(projectId);
      setMemory(mem);
      setProjectText(mem.projects?.[projectId]?.notes || "");
      setSaved("Memory generated from the project scan.");
    } catch (err) {
      setError(err.message);
    } finally {
      setLearning(false);
    }
  };

  return (
    <div className="memory-view">
      <div className="memory-head">
        <h2>Memory</h2>
        <p className="memory-intro">
          Hermes reads these notes at the start of every experiment, so you
          don't have to re-explain your project or preferences each session.
        </p>
      </div>
      {error && (
        <div className="error-box memory-error">
          {error}
          <button className="btn ghost" onClick={() => setError("")}>
            <Icon name="x" size={13} />
          </button>
        </div>
      )}
      {saved && <p className="memory-saved">{saved}</p>}
      <div className="memory-cards">
        <div className="memory-card">
          <div className="memory-card-head">
            <span className="memory-icon">
              <Icon name="chip" size={14} />
            </span>
            <h3>Global memory</h3>
          </div>
          <p className="memory-hint">
            About you and Hermes — applies to every conversation, on every
            project.
          </p>
          <textarea
            value={globalText}
            onChange={(e) => setGlobalText(e.target.value)}
            rows={6}
            placeholder="e.g. User prefers Taglish, short answers, always include code samples."
          />
          <div className="memory-actions">
            <button
              className="btn primary"
              onClick={saveGlobal}
              disabled={busy}
            >
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
        <div className="memory-card">
          <div className="memory-card-head">
            <span className="memory-icon">
              <Icon name="folder" size={14} />
            </span>
            <h3>Project memory</h3>
          </div>
          <p className="memory-hint">
            Per-project notes — fed to Hermes whenever this project is attached.
            Use "Learn from scan" to auto-generate them.
          </p>
          <select
            value={projectId}
            onChange={(e) => selectProject(e.target.value)}
          >
            <option value="">Select a project…</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          {projectId && (
            <>
              <textarea
                value={projectText}
                onChange={(e) => setProjectText(e.target.value)}
                rows={6}
                placeholder="e.g. Supabase auth, vanilla JS, pantry in LocalStorage, claymorphism, desktop-first."
              />
              <div className="memory-actions">
                <button
                  className="btn primary"
                  onClick={saveProject}
                  disabled={busy}
                >
                  {busy ? "Saving…" : "Save"}
                </button>
                <button
                  className="btn ghost"
                  onClick={learn}
                  disabled={learning}
                >
                  <Icon name="zap" size={13} />
                  {learning ? "Learning…" : "Learn from scan"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ToolsView() {
  return (
    <div className="tools-view">
      <div className="tools-head">
        <h2>Tools</h2>
        <p className="tools-intro">
          Hermes picks the tools it needs automatically while working on an
          experiment — no need to call them yourself. Open a completed run and
          check its "Thought" section to see which tools were used.
        </p>
      </div>
      <div className="tools-grid">
        {TOOL_MANIFEST.map((t) => (
          <div
            key={t.name}
            className={`tool-card ${t.available ? "" : "locked"}`}
          >
            <div className="tool-card-head">
              <span className="tool-icon">
                <Icon name={t.icon} size={15} />
              </span>
              <span className="tool-name">{t.name}</span>
              <span className={`tool-status ${t.available ? "on" : ""}`}>
                {t.available ? "✓" : "○"}
              </span>
            </div>
            <p className="tool-desc">{t.desc}</p>
            {!t.available && <span className="tool-phase">{t.phase}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

function ProjectsView({
  projects,
  activeProjectId,
  onSetActive,
  onDelete,
  onAdd,
}) {
  const [name, setName] = useState("");
  const [path, setPath] = useState("");
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [files, setFiles] = useState([]);
  const [fileQ, setFileQ] = useState("");
  const [searchQ, setSearchQ] = useState("");
  const [searching, setSearching] = useState(false);
  const [matches, setMatches] = useState([]);
  const [openFile, setOpenFile] = useState(null);
  const [fileContent, setFileContent] = useState("");
  const [busy, setBusy] = useState(false);

  const opened = projects.find((p) => p.id === openId) || null;

  const loadFiles = async (id, q = "") => {
    try {
      const data = await getProjectFiles(id, q);
      setFiles(data.files);
    } catch {
      setFiles([]);
    }
  };

  const toggleOpen = async (project) => {
    if (openId === project.id) {
      setOpenId(null);
      return;
    }
    setOpenId(project.id);
    setFileQ("");
    setSearchQ("");
    setMatches([]);
    setOpenFile(null);
    setBusy(true);
    await loadFiles(project.id);
    setBusy(false);
  };

  const doSearch = async () => {
    if (searchQ.trim().length < 2 || !opened) return;
    setSearching(true);
    setOpenFile(null);
    try {
      const data = await searchProject(opened.id, searchQ.trim());
      setMatches(data.matches);
    } catch {
      setMatches([]);
    }
    setSearching(false);
  };

  const openFileContent = async (relPath) => {
    if (!opened) return;
    setOpenFile(relPath);
    setFileContent("");
    try {
      const data = await getProjectFile(opened.id, relPath);
      setFileContent(data.content);
    } catch (err) {
      setFileContent(`Error: ${err.message}`);
    }
  };

  const submitAdd = async (e) => {
    e.preventDefault();
    if (!name.trim() || !path.trim() || adding) return;
    setAdding(true);
    try {
      await onAdd(name.trim(), path.trim());
      setName("");
      setPath("");
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="projects-view">
      <div className="projects-pane">
        <h2>Projects</h2>
        <form className="add-project" onSubmit={submitAdd}>
          <input
            placeholder="Project name (e.g. Lutopia)"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            placeholder="Folder path (e.g. C:\Code\Lutopia)"
            value={path}
            onChange={(e) => setPath(e.target.value)}
          />
          <button
            type="submit"
            className="btn primary"
            disabled={adding || !name.trim() || !path.trim()}
          >
            <Icon name="plus" size={13} /> {adding ? "Adding…" : "Add"}
          </button>
        </form>
        {projects.length === 0 && (
          <p className="dim add-hint">
            Add a project folder and Hermes will map it — files, structure, and
            stats.
          </p>
        )}
        <div className="project-list">
          {projects.map((p) => (
            <ProjectCard
              key={p.id}
              project={p}
              active={p.id === activeProjectId}
              onOpen={() => toggleOpen(p)}
              onDelete={onDelete}
            />
          ))}
        </div>
      </div>

      <div className="project-files-pane">
        {!opened && (
          <div className="empty-state">
            <span className="empty-icon">
              <Icon name="folder" size={24} />
            </span>
            <p>Select a project to browse its files</p>
          </div>
        )}
        {opened && (
          <>
            <div className="project-toolbar">
              <button
                className={`btn ${opened.id === activeProjectId ? "primary" : "ghost"}`}
                onClick={() => onSetActive(opened.id)}
              >
                {opened.id === activeProjectId
                  ? "Active project"
                  : "Set as active"}
              </button>
              <button
                className="btn ghost"
                onClick={async () => {
                  setBusy(true);
                  try {
                    await refreshProject(opened.id);
                    await loadFiles(opened.id, fileQ);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <Icon name="refresh" size={13} /> Rescan
              </button>
            </div>
            <div className="project-search">
              <input
                placeholder="Search file names…"
                value={fileQ}
                onChange={async (e) => {
                  setFileQ(e.target.value);
                  await loadFiles(opened.id, e.target.value);
                }}
              />
              <div className="search-row">
                <input
                  placeholder="Search inside file contents…"
                  value={searchQ}
                  onChange={(e) => setSearchQ(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && doSearch()}
                />
                <button
                  className="btn ghost"
                  onClick={doSearch}
                  disabled={searching}
                >
                  <Icon name="search" size={13} />
                  {searching ? "Searching…" : "Search"}
                </button>
              </div>
            </div>
            {matches.length > 0 && (
              <div className="match-list">
                {matches.map((m, i) => (
                  <div
                    key={i}
                    className="match-item"
                    onClick={() => openFileContent(m.path)}
                  >
                    <span className="match-path">{m.path}</span>
                    <span className="match-snippet">{m.snippet}</span>
                  </div>
                ))}
              </div>
            )}
            {busy ? (
              <p className="dim">Scanning files…</p>
            ) : matches.length === 0 ? (
              <div className="file-list">
                {files.length === 0 && <p className="dim">No files found</p>}
                {files.map((f) => (
                  <div
                    key={f.path}
                    className={`file-item ${openFile === f.path ? "active" : ""}`}
                    onClick={() => openFileContent(f.path)}
                  >
                    <span className="file-dot" />
                    <span className="mono">{f.path}</span>
                    <span className="file-size">
                      {(f.size / 1024).toFixed(1)} KB
                    </span>
                  </div>
                ))}
              </div>
            ) : null}
          </>
        )}
      </div>

      {opened && openFile && (
        <div className="file-viewer">
          <div className="file-viewer-head">
            <span>{openFile}</span>
            <button className="btn ghost" onClick={() => setOpenFile(null)}>
              <Icon name="x" size={14} />
            </button>
          </div>
          <pre className="file-content">
            <code>{fileContent}</code>
          </pre>
        </div>
      )}
    </div>
  );
}

function FilesView({ projects, onRefresh }) {
  const [projectId, setProjectId] = useState(null);
  const [files, setFiles] = useState([]);
  const [fileQ, setFileQ] = useState("");
  const [searchQ, setSearchQ] = useState("");
  const [searching, setSearching] = useState(false);
  const [matches, setMatches] = useState([]);
  const [openFile, setOpenFile] = useState(null);
  const [fileContent, setFileContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [rescanning, setRescanning] = useState(false);
  const [explain, setExplain] = useState(null);
  const viewerRef = useRef(null);

  const opened = projects.find((p) => p.id === projectId) || null;

  const loadFiles = async (id, q = "") => {
    try {
      const data = await getProjectFiles(id, q);
      setFiles(data.files);
    } catch {
      setFiles([]);
    }
  };

  const selectProject = async (id) => {
    setProjectId(id);
    setFileQ("");
    setSearchQ("");
    setMatches([]);
    setOpenFile(null);
    setBusy(true);
    await loadFiles(id);
    setBusy(false);
  };

  const doSearch = async () => {
    if (searchQ.trim().length < 2 || !opened) return;
    setSearching(true);
    setOpenFile(null);
    try {
      const data = await searchProject(opened.id, searchQ.trim());
      setMatches(data.matches);
    } catch {
      setMatches([]);
    }
    setSearching(false);
  };

  const openFileContent = async (relPath) => {
    if (!opened) return;
    setOpenFile(relPath);
    setFileContent("");
    setExplain(null);
    try {
      const data = await getProjectFile(opened.id, relPath);
      setFileContent(data.content);
    } catch (err) {
      setFileContent(`Error: ${err.message}`);
    }
  };

  const hasSelection = () => {
    const sel = window.getSelection?.();
    if (!sel || sel.isCollapsed) return false;
    return viewerRef.current?.contains(sel.anchorNode);
  };

  const grabSelection = () => {
    const sel = window.getSelection?.();
    if (!sel || sel.isCollapsed) return null;
    return sel.toString().trim() || null;
  };

  const doExplain = async () => {
    if (!opened || !openFile || explain?.phase === "busy") return;
    const selection = grabSelection();
    setExplain({ phase: "busy" });
    try {
      const data = await explainCode(opened.id, openFile, selection);
      setExplain({ phase: "done", text: data.explanation });
    } catch (err) {
      setExplain({ phase: "error", msg: err.message });
    }
  };

  return (
    <div className="files-view">
      <div className="files-toolbar">
        <h2>Files</h2>
        <select
          value={projectId || ""}
          onChange={(e) => e.target.value && selectProject(e.target.value)}
        >
          <option value="">Select a project…</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        {opened && (
          <button
            className="btn ghost"
            disabled={rescanning}
            onClick={async () => {
              setRescanning(true);
              try {
                await onRefresh(opened.id);
                await loadFiles(opened.id, fileQ);
              } finally {
                setRescanning(false);
              }
            }}
          >
            <Icon name="refresh" size={13} />
            {rescanning ? "Scanning…" : "Rescan"}
          </button>
        )}
      </div>

      {!opened && (
        <div className="empty-state">
          <span className="empty-icon">
            <Icon name="folder" size={24} />
          </span>
          <p>Pick a project to browse and search its files</p>
        </div>
      )}

      {opened && (
        <>
          <div className="project-search">
            <input
              placeholder="Search file names…"
              value={fileQ}
              onChange={async (e) => {
                setFileQ(e.target.value);
                await loadFiles(opened.id, e.target.value);
              }}
            />
            <div className="search-row">
              <input
                placeholder="Search inside file contents…"
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && doSearch()}
              />
              <button
                className="btn ghost"
                onClick={doSearch}
                disabled={searching}
              >
                <Icon name="search" size={13} />
                {searching ? "Searching…" : "Search"}
              </button>
            </div>
          </div>

          {matches.length > 0 && (
            <div className="match-list">
              {matches.map((m, i) => (
                <div
                  key={i}
                  className="match-item"
                  onClick={() => openFileContent(m.path)}
                >
                  <span className="match-path">{m.path}</span>
                  <span className="match-snippet">{m.snippet}</span>
                </div>
              ))}
            </div>
          )}
          {busy ? (
            <p className="dim">Scanning files…</p>
          ) : matches.length === 0 ? (
            <div className="file-list">
              {files.length === 0 && <p className="dim">No files found</p>}
              {files.map((f) => (
                <div
                  key={f.path}
                  className={`file-item ${openFile === f.path ? "active" : ""}`}
                  onClick={() => openFileContent(f.path)}
                >
                  <span className="file-dot" />
                  <span className="mono">{f.path}</span>
                  <span className="file-size">
                    {(f.size / 1024).toFixed(1)} KB
                  </span>
                </div>
              ))}
            </div>
          ) : null}
        </>
      )}

      {opened && openFile && (
        <div className="file-viewer">
          <div className="file-viewer-head">
            <span>{openFile}</span>
            <div className="fv-actions">
              <button
                className="btn ghost"
                disabled={explain?.phase === "busy"}
                onClick={doExplain}
                title={
                  hasSelection()
                    ? "Explain the code you selected"
                    : "Explain this whole file"
                }
              >
                <Icon name="search" size={13} />
                {explain?.phase === "busy"
                  ? "Explaining…"
                  : hasSelection()
                    ? "Explain selection"
                    : "Explain file"}
              </button>
              <button className="btn ghost" onClick={() => setOpenFile(null)}>
                <Icon name="x" size={14} />
              </button>
            </div>
          </div>
          <pre className="file-content" ref={viewerRef}>
            <code>{fileContent}</code>
          </pre>
        </div>
      )}

      {explain && (
        <div className="modal-overlay" onClick={() => setExplain(null)}>
          <div className="explain-modal" onClick={(e) => e.stopPropagation()}>
            <div className="explain-head">
              <h4>Explain this code</h4>
              <button className="btn ghost" onClick={() => setExplain(null)}>
                <Icon name="x" size={14} />
              </button>
            </div>
            {explain.phase === "busy" && (
              <p className="dim">Hermes is reading the code…</p>
            )}
            {explain.phase === "error" && (
              <p className="explain-error">{explain.msg}</p>
            )}
            {explain.phase === "done" && (
              <div className="explain-body">
                <pre>
                  <code>{explain.text}</code>
                </pre>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function App() {
  const [view, setView] = useState("dashboard");
  const [online, setOnline] = useState(null);
  const [experiments, setExperiments] = useState([]);
  const [projects, setProjects] = useState([]);
  const [activeProjectId, setActiveProjectId] = useState(null);
  const [activeId, setActiveId] = useState(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState(null);
  const pollRef = useRef(null);
  const mainRef = useRef(null);
  const { connected: wsConnected, subscribe, unsubscribe } = useWebSocket();

  const refresh = useCallback(async () => {
    try {
      setExperiments(await getExperiments());
    } catch (err) {
      setError(err.message);
    }
  }, []);

  const refreshProjects = useCallback(async () => {
    try {
      const projs = await getProjects();
      setProjects(projs);
      setActiveProjectId((prev) =>
        prev && projs.some((p) => p.id === prev) ? prev : null,
      );
    } catch (err) {
      setError(err.message);
    }
  }, []);

  const checkStatus = useCallback(async () => {
    const ok = await checkHealth();
    setOnline(ok);
  }, []);

  useEffect(() => {
    checkStatus();
    const h = setInterval(checkStatus, 10000);
    return () => clearInterval(h);
  }, [checkStatus]);

  useEffect(() => {
    refresh();
    refreshProjects();
  }, [refresh, refreshProjects]);

  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
  }, [view]);

  useEffect(() => {
    if (!activeId) return;

    const handleProgress = (data) => {
      setExperiments((prev) =>
        prev.map((e) =>
          e.id === data.experimentId
            ? { ...e, progress: data.progress, status: "running" }
            : e,
        ),
      );
    };

    const handleStatus = (data) => {
      setExperiments((prev) =>
        prev.map((e) =>
          e.id === data.experimentId ? { ...e, status: data.status } : e,
        ),
      );
      if (data.status === "completed" || data.status === "failed") {
        setRunning(false);
      }
    };

    const handleFinding = (data) => {
      setExperiments((prev) =>
        prev.map((e) =>
          e.id === data.experimentId
            ? { ...e, findings: [...(e.findings || []), data.finding] }
            : e,
        ),
      );
    };

    const handleComplete = (data) => {
      getExperiment(data.experimentId)
        .then((exp) => {
          setExperiments((prev) =>
            prev.map((e) => (e.id === data.experimentId ? exp : e)),
          );
          setRunning(false);
        })
        .catch(() => {});
    };

    const handleError = (data) => {
      setExperiments((prev) =>
        prev.map((e) =>
          e.id === data.experimentId
            ? { ...e, status: "failed", error: data.error }
            : e,
        ),
      );
      setRunning(false);
    };

    window.addEventListener("ws:progress", handleProgress);
    window.addEventListener("ws:status", handleStatus);
    window.addEventListener("ws:finding", handleFinding);
    window.addEventListener("ws:complete", handleComplete);
    window.addEventListener("ws:error", handleError);

    subscribe(activeId);

    return () => {
      window.removeEventListener("ws:progress", handleProgress);
      window.removeEventListener("ws:status", handleStatus);
      window.removeEventListener("ws:finding", handleFinding);
      window.removeEventListener("ws:complete", handleComplete);
      window.removeEventListener("ws:error", handleError);
      unsubscribe(activeId);
    };
  }, [activeId, subscribe, unsubscribe]);

  useEffect(() => {
    if (wsConnected) {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      return;
    }

    const poll = async () => {
      if (!activeId) return;
      try {
        const exp = await getExperiment(activeId);
        setExperiments((prev) =>
          prev.map((e) => (e.id === activeId ? exp : e)),
        );
        if (exp.status === "completed" || exp.status === "failed") {
          setRunning(false);
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      } catch (err) {
        setError(err.message);
      }
    };
    if (running && !pollRef.current) {
      pollRef.current = setInterval(poll, 2000);
    }
    return () => {
      if (!running && pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [running, activeId, wsConnected]);

  const active = experiments.find((e) => e.id === activeId) || null;

  const runTask = async (task, image = null) => {
    setError(null);
    try {
      const connectMatch = task.trim().match(/^\/connect\s+(.+)/i);
      if (connectMatch) {
        const folderPath = connectMatch[1].trim();
        const folderName = folderPath.split(/[\\/]/).pop() || folderPath;
        try {
          const proj = await addProject(folderName, folderPath);
          await refreshProjects();
          setActiveProjectId(proj.id);

          try {
            const s = await getSettings();
            if (s.trustLevel < 2) await saveSettings(2);
          } catch {}
          setError(null);
        } catch (err) {
          setError(`Connect failed: ${err.message}`);
        }
        return;
      }
      const { id } = await createExperiment(task, activeProjectId, image);
      setRunning(true);
      setActiveId(id);
      await refresh();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleAddProject = async (name, path) => {
    try {
      await addProject(name, path);
      await refreshProjects();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDeleteProject = async (id) => {
    try {
      await deleteProject(id);
      await refreshProjects();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDelete = async (id) => {
    try {
      await deleteExperiment(id);
      if (activeId === id) setActiveId(null);
      await refresh();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleReply = async (id, message) => {
    setError(null);
    setRunning(true);
    try {
      const updated = await replyExperiment(id, message);
      setExperiments((prev) => prev.map((e) => (e.id === id ? updated : e)));
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  const handleApprove = async (id, approvalId, decision) => {
    setError(null);
    setRunning(true);
    try {
      const updated = await approveExperiment(id, approvalId, decision);
      setExperiments((prev) => prev.map((e) => (e.id === id ? updated : e)));
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  const handleEditMessage = async (id, index, content, redo = false) => {
    setError(null);
    try {
      const updated = await editExperimentMessage(id, index, content, redo);
      if (redo) setRunning(true);
      setExperiments((prev) => prev.map((e) => (e.id === id ? updated : e)));
    } catch (err) {
      setError(err.message);
    }
  };

  const handleCancel = async (id) => {
    setError(null);
    try {
      const updated = await cancelExperiment(id);
      setRunning(false);
      setExperiments((prev) => prev.map((e) => (e.id === id ? updated : e)));
    } catch (err) {
      setError(err.message);
    }
  };

  const handleRollback = async (id) => {
    setError(null);
    try {
      const updated = await rollbackFix(id);
      setExperiments((prev) => prev.map((e) => (e.id === id ? updated : e)));
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  const handleApplyFix = async (id) => {
    setError(null);
    try {
      const updated = await applyFix(id);
      setExperiments((prev) => prev.map((e) => (e.id === id ? updated : e)));
      return updated;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">
            <Icon name="star" size={14} />
          </span>
          <span className="brand-name">Hermes</span>
          <span className="brand-tag">α</span>
        </div>
        <button
          className="new-chat-btn"
          onClick={() => {
            mainRef.current?.scrollTo({ top: 0 });
            setActiveId(null);
            setView("dashboard");
          }}
        >
          <Icon name="plus" size={14} /> New chat
        </button>
        <nav>
          <p className="nav-label">Workspace</p>
          {SIDEBAR.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${view === item.id && !active ? "active" : ""}`}
              onClick={() => {
                setView(item.id);
                if (active) setActiveId(null);
              }}
            >
              <Icon name={item.icon} size={15} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        {experiments.length > 0 && (
          <div className="sidebar-recents">
            <p className="nav-label">Recents</p>
            {experiments.slice(0, 8).map((exp) => (
              <button
                key={exp.id}
                className={`recent-item ${exp.id === activeId ? "active" : ""}`}
                onClick={() => {
                  setActiveId(exp.id);
                  setView("dashboard");
                }}
              >
                <span className="recent-text">{exp.task}</span>
                <span className="recent-time">{timeAgo(exp.createdAt)}</span>
              </button>
            ))}
          </div>
        )}
        <div className="sidebar-foot">
          <div className="status-card">
            <span className={`status-dot ${online ? "on" : "off"}`} />
            <span className="status-label">
              {online === null
                ? "Checking…"
                : online
                  ? "Backend online"
                  : "Backend offline"}
            </span>
            {wsConnected && (
              <span className="ws-indicator" title="Real-time updates active">
                ●
              </span>
            )}
            <span className="status-url">{API_URL}</span>
          </div>
        </div>
      </aside>

      <main className="main" ref={mainRef}>
        {error && (
          <div className="error-box top">
            {error}
            <button className="btn ghost" onClick={() => setError(null)}>
              <Icon name="x" size={14} />
            </button>
          </div>
        )}

        {view === "dashboard" && (
          <Dashboard
            onSubmit={runTask}
            running={running}
            experiments={experiments}
            projects={projects}
            activeProjectId={activeProjectId}
            onSetActive={setActiveProjectId}
            active={active}
            onReply={handleReply}
            onOpenExp={setActiveId}
            onApplyFix={handleApplyFix}
            onApprove={handleApprove}
            onRollback={handleRollback}
            onCancel={handleCancel}
            onEditMessage={handleEditMessage}
          />
        )}

        {view === "projects" && (
          <ProjectsView
            projects={projects}
            activeProjectId={activeProjectId}
            onSetActive={setActiveProjectId}
            onDelete={handleDeleteProject}
            onAdd={handleAddProject}
          />
        )}

        {view === "files" && (
          <FilesView projects={projects} onRefresh={refreshProject} />
        )}

        {view === "tools" && <ToolsView />}

        {view === "automation" && (
          <AutomationView
            experiments={experiments}
            onOpenExp={(id) => {
              setActiveId(id);
              setView("experiments");
            }}
          />
        )}

        {view === "memory" && <MemoryView />}

        {view === "knowledge" && <KnowledgeView />}

        {view === "settings" && <SettingsView />}

        {view === "experiments" && (
          <div className="experiments-view">
            <div className="exp-list-pane">
              <h2>Experiments</h2>
              <div className="exp-list">
                {experiments.length === 0 && (
                  <p className="dim">No experiments yet. Give Hermes a task.</p>
                )}
                {experiments.map((exp) => (
                  <ExperimentCard
                    key={exp.id}
                    exp={exp}
                    active={exp.id === activeId}
                    onClick={() => setActiveId(exp.id)}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            </div>
            <div className="exp-detail-pane">
              {active ? (
                <ExperimentDetail
                  exp={active}
                  onDelete={handleDelete}
                  onReply={handleReply}
                  onApplyFix={handleApplyFix}
                  onApprove={handleApprove}
                  onRollback={handleRollback}
                  onCancel={handleCancel}
                  onRetry={runTask}
                  onEditMessage={handleEditMessage}
                />
              ) : (
                <div className="empty-state">
                  <span className="empty-icon">
                    <Icon name="flask" size={24} />
                  </span>
                  <p>Select an experiment to inspect it</p>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
