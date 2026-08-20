                                                                      
  
                                                                                

import { BaseSkill } from "./base.js";

export class DebuggingSkill extends BaseSkill {
  static name = "debugging";
  static description = "Diagnose errors, find root causes, and suggest fixes";
  static triggers = [
    /debug|error|exception|undefined|cannot read properties|is not a function|is not defined/i,
    /typeerror|referenceerror|syntaxerror|rangeerror|stack trace|^at |failed/i,
    /why (?:is|was|does|did|aren't) .* (?:not |broken|failing|working|crashing)/i,
    /what('s| is| was) (?:causing|wrong|broken|the issue)/i,
    /fix (?:the |this )?(?:bug|error|issue|problem)/i,
  ];
  static tools = ["read_file", "search_files", "scan_project"];
  static riskLevel = "low";
  static priority = 80;                                                

  static score(task, context = {}) {
    const t = String(task || "").toLowerCase();

                           
    const triggered = this.triggers.some((p) => p.test(t));
    if (!triggered) return 0;

    let score = 80;

                                                           
    if (/error[:\s]|exception[:\s]|stacktrace|TypeError:|ReferenceError:|SyntaxError:/i.test(t)) {
      score += 15;
    }

                                        
    if (context.relevantFiles?.length) score += 10;

                                                          
    if (/\bline\s*\d+|\.js|\.ts|\.py|\.jsx|\.tsx/i.test(t)) score += 5;

    return Math.min(100, score);
  }

  async execute(task, context) {
    const { callAI, project, memoryText, trustLevel } = context;

    const system = `You are Hermes, an AI developer assistant running the DEBUGGING skill. The user has an error or bug they need diagnosed.

Respond EXACTLY in this structure — the sections and labels are parsed automatically:

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

${memoryText ? `Memory (from past sessions — use this, don't repeat questions whose answers are here):\n${memoryText}\n` : ""}
Trust level: ${trustLevel || 1}. ${trustLevel >= 2 ? "You may suggest fixes that can be applied automatically." : "Suggest fixes but do not apply them automatically."}

${project ? `The user has attached a project. Here is its structure and the most relevant files:\n\nProject: ${project.name} (${project.path})\n\nUse these files to give a real diagnosis. Reference exact file paths and line numbers. If the relevant files don't match the error, say "Location: unknown" and tell the user which files you would need.` : "The user has not attached a project. Ask them to connect a project first, or help them based on the error message alone."}
`;

    const result = await callAI([
      { role: "system", content: system },
      { role: "user", content: task },
    ]);

    const answer = result.content || "";
    const diagnosis = this.parseDiagnosis(answer);
    const { steps, findings } = this.parseSteps(answer);

    return {
      answer,
      steps,
      findings,
      diagnosis,
      skill: "debugging",
    };
  }

  parseDiagnosis(markdown) {
    const d = { cause: null, location: null, why: null, fix: null, confidence: null };
    let current = null;
    let fenceOpen = false;
    for (const line of markdown.split("\n")) {
      if (/^##\s+/i.test(line)) { current = null; fenceOpen = false; continue; }
      const m = line.match(/^[-*]?\s*(Likely cause|Location|Why|Suggested fix|Confidence)\s*:\s*(.*)$/i);
      if (m) {
        const key = m[1].toLowerCase().replace(/\s+/g, "");
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
      if (/^[-*]\s*(critical|warning|suggestion|info)\s*:/i.test(trimmed)) { current = null; fenceOpen = false; continue; }
      if (fenceOpen) {
        d[current] += "\n" + line;
        if (/^```/.test(trimmed)) { current = null; fenceOpen = false; }
      } else {
        d[current] += "\n" + trimmed;
      }
    }
    for (const k of Object.keys(d)) {
      if (typeof d[k] === "string") d[k] = d[k].trim() || null;
    }
    return d;
  }

  parseSteps(markdown) {
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
      } else if (!inDiagnosis && (line.startsWith("- ") || line.startsWith("* "))) {
        steps.push(line.replace(/^[-*•]\s*/, "").trim());
      }
    }
    return { steps: steps.filter(Boolean), findings: findings.filter(Boolean) };
  }
}
