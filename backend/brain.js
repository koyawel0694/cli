import { routeTask, listSkills } from "./skills/index.js";

const PLANNING_SYSTEM = `You are Hermes Brain — the reasoning layer of an AI developer assistant. Your job is to analyze a user's task and create a plan for solving it.

Given a task, context, and available skills, output a JSON plan:

{
  "understanding": "One sentence describing what the user actually wants",
  "skill": "name of the best skill to use (or 'general' if none fit)",
  "confidence": 0-100,
  "steps": ["step 1", "step 2", ...],
  "toolsNeeded": ["tool1", "tool2", ...],
  "contextRequired": ["file1.js", ...],
  "estimatedComplexity": "simple|moderate|complex"
}

Rules:
- If the task is a simple greeting or small talk, set skill to "general" and confidence to 100
- If the task needs specific project context, note which files are needed
- Be honest about confidence — don't overcommit
- If you're unsure, say so in the understanding
- Plain language, no emojis
`;

const EVALUATION_SYSTEM = `You are Hermes Brain — evaluating whether a task was completed successfully.

Given the original task, the result, and any findings, output a JSON evaluation:

{
  "done": true/false,
  "quality": 0-100,
  "satisfied": true/false,
  "issues": ["issue 1", ...],
  "nextSteps": ["step 1", ...],
  "replanNeeded": true/false,
  "replanReason": "why replanning is needed (if applicable)"
}

Rules:
- Be strict but fair — a result is "done" if it answers the user's question or completes the task
- "quality" measures how well the answer addresses the specific task
- If tools failed or context was missing, note it in issues
- If the answer is wrong or incomplete, set replanNeeded to true
- Plain language, no emojis
`;

function isCasualTask(task) {
  const text = String(task || "")
    .trim()
    .toLowerCase();
  return /^(hi|hello|hey|yo|yoo|kamusta|kumusta|halo|good (morning|afternoon|evening)|salamat|thanks|thank you|who are you|what can you do|how are you|i don't know|idk|go)[?!. ,]*$/i.test(
    text,
  );
}

export class Brain {
  constructor({
    callAI,
    project,
    memoryText,
    trustLevel,
    brainstormConfig,
    imageDataUrl,
  }) {
    this.callAI = callAI;
    this.project = project;
    this.memoryText = memoryText;
    this.trustLevel = trustLevel;
    this.brainstormConfig = brainstormConfig;
    this.imageDataUrl = imageDataUrl;
  }

  async plan(task) {
    const skills = listSkills();
    const context = {
      project: this.project,
      memoryText: this.memoryText,
      trustLevel: this.trustLevel,
      hasImage: !!this.imageDataUrl,
    };

    const routed = routeTask(task, context);

    const planningContext = `
Available skills:
${skills.map((s) => `- ${s.name}: ${s.description} (priority: ${s.priority}, tools: ${s.tools.join(", ")})`).join("\n")}

${routed ? `Skill router suggests: ${routed.skill.name} (score: ${routed.score})` : "No skill matched by router."}

${this.project ? `Project: ${this.project.name} (${this.project.path})` : "No project attached."}
${this.memoryText ? `Memory available: yes (${this.memoryText.length} chars)` : "No memory available."}
`;

    try {
      const result = await this.callAI([
        { role: "system", content: PLANNING_SYSTEM },
        {
          role: "user",
          content: `Task: ${task}\n\nContext:\n${planningContext}`,
        },
      ]);

      const plan = this.parseJson(result.content);

      if (routed && plan.skill === routed.skill.name) {
        plan.confidence = Math.min(100, (plan.confidence || 50) + 15);
      }

      plan._routedSkill = routed?.skill || null;

      return plan;
    } catch (err) {
      console.log(
        `[brain] Planning failed, using router fallback: ${err.message}`,
      );
      return {
        understanding: task,
        skill: routed?.skill?.name || "general",
        confidence: routed ? Math.min(70, routed.score) : 30,
        steps: ["Execute task"],
        toolsNeeded: routed?.skill?.tools || [],
        contextRequired: [],
        estimatedComplexity: "moderate",
        _routedSkill: routed?.skill || null,
      };
    }
  }

  async execute(plan, task) {
    const SkillClass = plan._routedSkill;

    if (SkillClass) {
      console.log(
        `[brain] Routing to skill: ${SkillClass.name} (confidence: ${plan.confidence}%)`,
      );
      const skill = new SkillClass();
      return skill.execute(task, {
        callAI: this.callAI,
        project: this.project,
        memoryText: this.memoryText,
        trustLevel: this.trustLevel,
        brainstormConfig: this.brainstormConfig,
        imageDataUrl: this.imageDataUrl,
        relevantFiles: this.project ? [] : [],
      });
    }

    console.log(`[brain] No skill matched, using general execution`);
    return this.generalExecute(task, plan);
  }

  async generalExecute(task, plan) {
    const system = isCasualTask(task)
      ? `You are Hermes, a friendly AI assistant. Reply directly to this simple conversational message in 1-3 sentences. Do not use headings or bullet lists. Answer in plain language (Taglish is fine). Never use emojis.

${this.memoryText ? `Memory (from past sessions — use this):\n${this.memoryText}\n` : ""}
Trust level: ${this.trustLevel || 1}.
`
      : `You are Hermes, an AI developer assistant. The user has a task for you.

Respond EXACTLY in this structure — the sections and labels are parsed automatically:

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

${this.memoryText ? `Memory (from past sessions — use this):\n${this.memoryText}\n` : ""}
Trust level: ${this.trustLevel || 1}.

${this.project ? `The user has attached a project. Here is its structure:\n\nProject: ${this.project.name} (${this.project.path})\n\nUse these files to give a real answer. Reference exact file paths when possible.` : "The user has not attached a project. Answer based on your knowledge."}
`;

    const result = await this.callAI([
      { role: "system", content: system },
      { role: "user", content: task },
    ]);

    const answer = result.content || "";
    const { steps, findings } = this.parseSteps(answer);

    return {
      answer,
      steps,
      findings,
      skill: "general",
    };
  }

  async evaluate(result, task) {
    try {
      const evalResult = await this.callAI([
        { role: "system", content: EVALUATION_SYSTEM },
        {
          role: "user",
          content: `Original task: ${task}\n\nResult:\n${(result.answer || "").slice(0, 3000)}\n\nFindings: ${(result.findings || []).join(", ")}`,
        },
      ]);

      return this.parseJson(evalResult.content);
    } catch (err) {
      console.log(`[brain] Evaluation failed, assuming done: ${err.message}`);
      return {
        done: true,
        quality: 70,
        satisfied: true,
        issues: [],
        nextSteps: [],
        replanNeeded: false,
      };
    }
  }

  async process(task, maxReplans = 2) {
    let replans = 0;
    let lastResult = null;
    let lastPlan = null;

    while (replans <= maxReplans) {
      lastPlan = await this.plan(task);
      console.log(
        `[brain] Plan: skill=${lastPlan.skill}, confidence=${lastPlan.confidence}%, replan=${replans}`,
      );

      lastResult = await this.execute(lastPlan, task);

      const evaluation = await this.evaluate(lastResult, task);
      console.log(
        `[brain] Evaluation: done=${evaluation.done}, quality=${evaluation.quality}, replan=${evaluation.replanNeeded}`,
      );

      if (
        evaluation.done ||
        !evaluation.replanNeeded ||
        replans >= maxReplans
      ) {
        return {
          plan: lastPlan,
          result: lastResult,
          evaluation,
          replans,
        };
      }

      replans++;
      if (evaluation.replanReason) {
        task = `${task}\n\n[Previous attempt failed: ${evaluation.replanReason}. Please try a different approach.]`;
      }
    }

    return {
      plan: lastPlan,
      result: lastResult,
      evaluation: {
        done: true,
        quality: 50,
        satisfied: false,
        issues: ["Max replans reached"],
        nextSteps: [],
        replanNeeded: false,
      },
      replans,
    };
  }

  parseJson(text) {
    const cleaned = String(text || "")
      .replace(/<think>[\s\S]*?<\/think>|<thought>[\s\S]*?<\/thought>/gi, "")
      .replace(/<think>[\s\S]*$|<thought>[\s\S]*$/gi, "")
      .replace(/```(?:json)?\s*/gi, "")
      .replace(/```/g, "")
      .trim();
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start === -1 || end === -1)
      throw new Error("No JSON found in response");
    return JSON.parse(cleaned.slice(start, end + 1));
  }

  parseSteps(markdown) {
    const lines = markdown.split("\n");
    const steps = [];
    const findings = [];
    let inFindings = false;
    for (const line of lines) {
      if (line.startsWith("# ") || line.trim() === "") continue;
      if (line.startsWith("## ")) {
        inFindings =
          line.toLowerCase().includes("finding") ||
          line.toLowerCase().includes("result");
        continue;
      }
      if (inFindings) {
        findings.push(line.replace(/^[-*•]\s*/, "").trim());
      } else if (line.startsWith("- ") || line.startsWith("* ")) {
        steps.push(line.replace(/^[-*•]\s*/, "").trim());
      }
    }
    return { steps: steps.filter(Boolean), findings: findings.filter(Boolean) };
  }
}
