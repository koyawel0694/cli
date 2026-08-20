                                                                          
                                                                                                     
                                                                           

const DEFAULT_CONFIG = {
  maxIterations: 3,
  stoppingThreshold: 8,
  numCandidates: 3,
};

const MIN = { maxIterations: 1, stoppingThreshold: 1, numCandidates: 2 };
const MAX = { maxIterations: 5, stoppingThreshold: 10, numCandidates: 5 };

function clampConfig(config = {}) {
  const clamp = (v, lo, hi, dflt) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : dflt;
  };
  return {
    maxIterations: clamp(config.maxIterations, MIN.maxIterations, MAX.maxIterations, DEFAULT_CONFIG.maxIterations),
    stoppingThreshold: clamp(config.stoppingThreshold, MIN.stoppingThreshold, MAX.stoppingThreshold, DEFAULT_CONFIG.stoppingThreshold),
    numCandidates: clamp(config.numCandidates, MIN.numCandidates, MAX.numCandidates, DEFAULT_CONFIG.numCandidates),
  };
}

function stripThink(text) {
  return String(text || "")
    .replace(/<think>[\s\S]*?<\/think>|<thought>[\s\S]*?<\/thought>/gi, "")
    .replace(/<think>[\s\S]*$|<thought>[\s\S]*$/gi, "")
    .trim();
}

function extractJson(text) {
  const cleaned = stripThink(String(text || ""))
    .replace(/```(?:json)?\s*/gi, "")
    .replace(/```/g, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("The AI did not return JSON");
  return JSON.parse(cleaned.slice(start, end + 1));
}

async function ask(callAI, system, user) {
  const out = await callAI([
    { role: "system", content: system },
    { role: "user", content: user },
  ]);
  const content = out?.content || "";
  if (!content) throw new Error("The AI returned an empty response");
  return extractJson(content);
}

const GENERATE_SYSTEM = (cfg, round, previous) => `You are a senior engineer brainstorming solutions to a hard problem. You think in structured, distinct directions — never all variations of the same idea.

${round === 1
    ? `Generate EXACTLY ${cfg.numCandidates} DISTINCT candidate solutions. Each must be a genuinely different approach (e.g. different architecture, different library/pattern, different trade-off point), not tweaks of the same idea.`
    : `Previous round's candidates and scores:
${previous}

Refine the STRONGEST candidate from the previous round by addressing its critiques, AND propose ${cfg.numCandidates - 1} distinct alternative directions. Return EXACTLY ${cfg.numCandidates} candidates total.`}

Rules:
- If the problem is too vague to answer sensibly, respond with ONLY: {"clarify": "<ONE specific question that would unblock you>"}
- If solving this properly requires data or tools you don't have (web search, running code, reading files), respond with ONLY: {"needs_tools": "<what you need and why>"}
- Never invent data you don't have. Plain language, no emojis.

Respond with ONLY valid JSON (no markdown fences, no commentary):
{"candidates": [{"title": "<short name>", "idea": "<2-4 sentence description of the approach>"}]}`;

const CRITIQUE_SYSTEM = (cfg) => `You critique candidate solutions like a pragmatic senior engineer. For each candidate give a score (0-10) plus per-criterion scores.

Criteria:
- feasibility: how realistic to implement here
- complexity: lower is better (simpler wins)
- cost: lower is better (time/effort/money)
- reliability: robustness, failure modes
- scalability: how it holds up as the project grows
- security: safety, no exposed secrets, no harmful behavior

Rules:
- If a candidate is unsafe, harmful, or a serious security risk, give it score 0 and say why in notes.
- Be honest — weak ideas get low scores.
- Respond with ONLY valid JSON (no markdown fences, no commentary):
{"critiques": [{"title": "<candidate title>", "feasibility": 7, "complexity": 5, "cost": 6, "reliability": 7, "scalability": 5, "security": 8, "score": 7, "notes": "<one sentence>"}]}`;

const FINAL_SYSTEM = `You write the final recommendation of a brainstorming session. You have the candidates, their critiques, and scores.

Respond in plain markdown with EXACTLY these sections (English or Taglish is fine, no emojis):

# <problem, rephrased as a title>

## Best solution
<the recommended approach, concrete and specific>

## Why
<2-3 sentences: why this beats the alternatives>

## Trade-offs
- <what you give up or accept with this choice>

## Next steps
1. <first concrete action>
2. <second concrete action>

## Uncertainties
- <what is still unknown or risky>

## Confidence
<0-100>%

## Alternatives compared
| Candidate | Feasibility | Complexity | Cost | Reliability | Scalability | Security | Score |
|-----------|-------------|------------|------|-------------|-------------|----------|-------|
| <title> | <n> | <n> | <n> | <n> | <n> | <n> | <n> |
<one row per candidate>`;

   
                               
                       
                               
                                     
                                                                                   
                                                                                    
                                                                       
                                                             
                                                                                                                  
   
export async function brainstorm({ problem, constraints = "", context = "", config = {}, callAI, log = () => {} }) {
  const cfg = clampConfig(config);
  const problemText = String(problem || "").trim();
  if (!problemText) throw new Error("No problem to brainstorm");
  if (typeof callAI !== "function") throw new Error("callAI is required");

  log("skill started", { config: cfg, problem: problemText.slice(0, 100) });

  const extra = [constraints && `CONSTRAINTS:\n${constraints}`, context && `CONTEXT (project memory / files):\n${context}`]
    .filter(Boolean)
    .join("\n\n");

  const result = {
    problem: problemText,
    constraints: constraints || "",
    config: cfg,
    iterations: [],
    comparison: "",
    report: "",
    confidence: null,
    clarification: null,
    needsTools: null,
  };

  let best = null;                                
  let previousRound = "";

  for (let round = 1; round <= cfg.maxIterations; round++) {
    log("iteration started", { round, max: cfg.maxIterations });

    let generated;
    try {
      generated = await ask(callAI, GENERATE_SYSTEM(cfg, round, previousRound), `${problemText}\n\n${extra}`.trim());
    } catch (err) {
      throw new Error(`Brainstorm: could not generate candidates (round ${round}): ${err.message}`);
    }

    if (generated.clarify) {
      log("needs clarification");
      result.clarification = String(generated.clarify).trim();
      return result;
    }
    if (generated.needs_tools) {
      log("needs tools/web search");
      result.needsTools = String(generated.needs_tools).trim();
      return result;
    }
    if (!Array.isArray(generated.candidates) || !generated.candidates.length) {
      throw new Error(`Brainstorm: no candidates returned in round ${round}`);
    }

    let critiques;
    try {
      critiques = await ask(
        callAI,
        CRITIQUE_SYSTEM(cfg),
        JSON.stringify({ problem: problemText, candidates: generated.candidates, constraints: constraints || null })
      );
    } catch (err) {
      throw new Error(`Brainstorm: could not critique candidates (round ${round}): ${err.message}`);
    }
    if (!Array.isArray(critiques.critiques) || !critiques.critiques.length) {
      throw new Error(`Brainstorm: no critiques returned in round ${round}`);
    }

    const scored = generated.candidates.map((c, i) => {
      const crit = critiques.critiques[i] || {};
      const score = Number.isFinite(Number(crit.score)) ? Math.max(0, Math.min(10, Number(crit.score))) : 0;
      return { title: c.title, idea: c.idea, crit, score };
    });

    const top = [...scored].sort((a, b) => b.score - a.score)[0];
    const iteration = {
      n: round,
      candidates: scored.map((c) => ({ title: c.title, score: c.score, notes: c.crit.notes || "" })),
      best: top.title,
      bestScore: top.score,
      improved: best ? top.score > best.score : null,
    };
    result.iterations.push(iteration);
    log("iteration done", { round, best: top.title, score: top.score });

    best = top;
    previousRound = JSON.stringify({ candidates: scored, critiques: critiques.critiques });

    if (top.score >= cfg.stoppingThreshold) {
      log("stopping early — threshold met", { score: top.score, threshold: cfg.stoppingThreshold });
      break;
    }
    if (round > 1 && top.score <= result.iterations[result.iterations.length - 2].bestScore) {
      log("stopping early — no improvement");
      break;
    }
  }

  try {
    const report = await callAI([
      { role: "system", content: FINAL_SYSTEM },
      {
        role: "user",
        content: `PROBLEM:\n${problemText}\n\n${extra ? extra + "\n\n" : ""}SESSION RECORD (JSON):\n${JSON.stringify({
          problem: problemText,
          candidates: result.iterations.flatMap((it) => it.candidates),
          best,
        })}`,
      },
    ]);
    result.report = stripThink(report?.content || "");
    const confMatch = result.report.match(/##\s*Confidence\s*\n\s*(\d{1,3})\s*%/i);
    result.confidence = confMatch ? Math.min(100, Math.max(0, Number(confMatch[1]))) : null;
    log("final report done");
  } catch (err) {
    throw new Error(`Brainstorm: could not write the final report: ${err.message}`);
  }

  log("skill completed");
  return result;
}
