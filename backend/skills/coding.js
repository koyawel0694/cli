                                                             
  
                                                                                               

import { BaseSkill } from "./base.js";

export class CodingSkill extends BaseSkill {
  static name = "coding";
  static description = "Write, modify, refactor, and generate code";
  static triggers = [
    /(?:write|create|implement|add|build|generate|make)\s+(?:a\s+)?(?:new\s+)?(?:function|class|component|file|module|service|api|endpoint|route|script|test|utility|helper|hook|middleware)/i,
    /(?:refactor|rewrite|restructure|reorganize|clean ?up|improve)\s+(?:the\s+)?(?:code|function|class|file|module|component)/i,
    /(?:modify|edit|update|change)\s+(?:the\s+)?(?:code|function|class|file)/i,
    /(?:write|create|add)\s+(?:a\s+)?(?:new\s+)?(?:test|spec|unit test|integration test)/i,
    /can you (?:write|create|implement|add|build|make)/i,
    /how (?:do|can) (?:I|we) (?:implement|create|build|write)/i,
    /code (?:this|that|it|the following)/i,
  ];
  static tools = ["read_file", "search_files", "scan_project", "modify_file", "execute_command"];
  static riskLevel = "medium";
  static priority = 70;

  static score(task, context = {}) {
    const t = String(task || "").toLowerCase();

    const triggered = this.triggers.some((p) => p.test(t));
    if (!triggered) return 0;

    let score = 70;

                                          
    if (context.project) score += 15;

                                                
    if (/\.(js|ts|jsx|tsx|py|html|css|json)/i.test(t)) score += 10;

                                             
    if (context.memoryText) score += 5;

    return Math.min(100, score);
  }

  async execute(task, context) {
    const { callAI, project, memoryText, trustLevel } = context;

    const system = `You are Hermes, an AI developer assistant running the CODING skill. The user wants you to write, modify, or generate code.

Respond EXACTLY in this structure — the sections and labels are parsed automatically:

# <short title of the coding task>

## Steps
- <what you did or plan to do>

## Code
<the actual code in appropriate code blocks, with file paths as comments or headers>

## Findings
- INFO: <any notes about the code, conventions used, or assumptions made>
- SUGGESTION: <improvement ideas, edge cases to handle, or related files to update>

## Recommendation
<what to do next — run tests, check specific files, or further improvements>

${memoryText ? `Memory (from past sessions — use this, don't repeat questions whose answers are here):\n${memoryText}\n` : ""}
Trust level: ${trustLevel || 1}. ${trustLevel >= 2 ? "You may use tools (modify_file, execute_command) to implement the changes directly." : "Suggest the code changes but do not apply them automatically."}

${project ? `The user has attached a project. Here is its structure and the most relevant files:\n\nProject: ${project.name} (${project.path})\n\nUse these files to understand the codebase conventions and write code that fits the existing patterns.` : "The user has not attached a project. Ask them to connect a project first, or write code based on their description."}

When writing code:
- Follow the project's existing conventions (indentation, naming, patterns)
- Keep code concise and well-commented where non-obvious
- Handle errors appropriately
- Consider edge cases
- Don't repeat existing code — reference what already exists
`;

    const result = await callAI([
      { role: "system", content: system },
      { role: "user", content: task },
    ]);

    const answer = result.content || "";
    const { steps, findings } = this.parseSteps(answer);

    return {
      answer,
      steps,
      findings,
      skill: "coding",
    };
  }

  parseSteps(markdown) {
    const lines = markdown.split("\n");
    const steps = [];
    const findings = [];
    let inFindings = false;
    for (const line of lines) {
      if (line.startsWith("# ") || line.trim() === "") continue;
      if (line.startsWith("## ")) {
        inFindings = line.toLowerCase().includes("finding") || line.toLowerCase().includes("result");
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
