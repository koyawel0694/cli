                                                                                        
  
                                                                                       

import { BaseSkill } from "./base.js";
import { brainstorm } from "../brainstorm.js";

export class BrainstormingSkill extends BaseSkill {
  static name = "brainstorming";
  static description = "Iterative brainstorming for hard problems — generates, critiques, and refines ideas";
  static triggers = [
    /brainstorm|come up with (some |a few )?(ideas|solutions|options)/i,
    /think of (some |different )?(ideas|solutions|options|approaches)/i,
    /what are (some |my )?(options|approaches|alternatives)/i,
    /weigh (the |up )(options|approaches|alternatives)/i,
    /design (a|an) (solution|system|architecture|feature|workflow)/i,
    /how (?:should|could|would) (?:I|we) (?:approach|design|structure|build)/i,
    /brainstorm/i,
  ];
  static tools = ["read_file", "search_files", "search_web"];
  static riskLevel = "low";
  static priority = 75;

  static score(task, context = {}) {
    const t = String(task || "").toLowerCase();

    const triggered = this.triggers.some((p) => p.test(t));
    if (!triggered) return 0;

    let score = 75;

                                                   
    if (/brainstorm/i.test(t)) score += 20;

                                              
    if (/(?:design|architecture|system|workflow|approach)/i.test(t)) score += 10;

    return Math.min(100, score);
  }

  async execute(task, context) {
    const { callAI, project, memoryText, trustLevel } = context;

                                                               
    const problem = task
      .replace(/^brainstorm\s*:?\s*/i, "")
      .replace(/^brainstorming\s*:?\s*/i, "")
      .trim();

    const constraints = context.relevantFiles?.length
      ? `Relevant files: ${context.relevantFiles.map((f) => f.path).join(", ")}`
      : "";

    const result = await brainstorm({
      problem,
      constraints,
      context: memoryText ? `Project memory:\n${memoryText.slice(0, 4000)}` : "",
      config: context.brainstormConfig || { maxIterations: 3, stoppingThreshold: 8, numCandidates: 3 },
      callAI: (messages) => callAI(messages),
      log: (msg, data) => {
        if (msg === "candidate" || msg === "critique") return;                       
        console.log(`[brainstorm] ${msg}${data ? " — " + JSON.stringify(data) : ""}`);
      },
    });

                                       
    let answer;
    if (result.clarification) {
      answer = `I need more info before brainstorming:\n\n> ${result.clarification}`;
    } else if (result.needsTools) {
      answer = `I can't reason my way through this one — I need data or tools:\n\n> ${result.needsTools}`;
    } else {
      answer = result.report;
    }

    const steps = [
      "Understanding problem",
      "Generating candidates",
      "Critiquing candidates",
      "Refining",
      "Writing recommendation",
    ];

    const findings = [];
    if (result.clarification) {
      findings.push(`Need more info: ${result.clarification}`);
    } else if (result.needsTools) {
      findings.push(`Needs data/tools: ${result.needsTools}`);
    } else {
      findings.push(
        `${result.iterations.length} iteration(s), ${result.iterations.reduce((n, it) => n + it.candidates.length, 0)} candidate(s), best score ${result.iterations.at(-1)?.bestScore ?? "?"}/10`
      );
      if (result.confidence !== null) {
        findings.push(`Confidence: ${result.confidence}%`);
      }
    }

    return {
      answer,
      steps,
      findings,
      skill: "brainstorming",
      brainstorm: result,
    };
  }
}
