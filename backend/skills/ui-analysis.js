                                                                                 
  
                                                                               

import { BaseSkill } from "./base.js";

export class UIAnalysisSkill extends BaseSkill {
  static name = "ui_analysis";
  static description = "Analyze UI screenshots for layout, responsive behavior, and UX issues";
  static triggers = [
    /(?:analyze|review|check|inspect|look at)\s+(?:this\s+)?(?:ui|interface|design|screenshot|layout|page)/i,
    /ui\s*(?:analysis|review|feedback|audit|check)/i,
    /(?:layout|responsive|ux|usability|design)\s*(?:review|analysis|feedback|check)/i,
    /how (?:does|is) (?:this|my) (?:ui|design|page|layout|interface)/i,
    /(?:what|how) (?:should|could|would) (?:I|we) (?:improve|fix|change|optimize)/i,
  ];
  static tools = ["read_file", "analyze_image"];
  static riskLevel = "low";
  static priority = 65;

  static score(task, context = {}) {
    const t = String(task || "").toLowerCase();

                                    
    const hasImage = context.hasImage || context.imageDataUrl;
    if (!hasImage) return 0;

    const triggered = this.triggers.some((p) => p.test(t));
    if (!triggered) {
                                                                         
      if (/(?:ui|design|layout|screenshot|page|interface)/i.test(t)) {
        return 60;
      }
      return 0;
    }

    let score = 65;

                                                 
    if (/(?:analyze|review|inspect)\s+(?:this\s+)?(?:ui|design|screenshot)/i.test(t)) score += 15;

    return Math.min(100, score);
  }

  async execute(task, context) {
    const { callAI, imageDataUrl } = context;

    if (!imageDataUrl) {
      return {
        answer: "I need a screenshot to analyze. Please upload an image with your request.",
        steps: [],
        findings: [],
        skill: "ui_analysis",
      };
    }

    const system = `You are Hermes, an AI developer assistant analyzing a UI screenshot. The user may follow up with questions ("give me a better direction", "what about mobile?", "how should I fix the spacing?"). Always answer the latest message, referencing the screenshot and your earlier analysis when relevant.
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
<concrete next direction, with specific actionable suggestions>
`;

    const result = await callAI([
      { role: "system", content: system },
      {
        role: "user",
        content: [
          { type: "text", text: task || "Analyze this UI screenshot" },
          { type: "image_url", image_url: { url: imageDataUrl } },
        ],
      },
    ]);

    const answer = result.content || "";
    const analysis = this.parseAnalysis(answer);
    const { steps, findings } = this.parseSteps(answer);

    return {
      answer,
      steps,
      findings,
      skill: "ui_analysis",
      uiAnalysis: analysis,
    };
  }

  parseAnalysis(markdown) {
    const out = { layout: [], responsive: [], ux: [], recommendation: "" };
    let section = null;
    for (const line of markdown.split("\n")) {
      const t = line.trim();
      const h = t.match(/^##\s+(.+)$/i);
      if (h) {
        const name = h[1].toLowerCase();
        if (name.includes("layout")) section = "layout";
        else if (name.includes("responsive")) section = "responsive";
        else if (name.includes("ux") || name.includes("user experience")) section = "ux";
        else if (name.includes("recommend")) section = "recommendation";
        else section = null;
        continue;
      }
      if (!section) continue;
      if (section === "recommendation") {
        if (t) out.recommendation += (out.recommendation ? " " : "") + t.replace(/^[-*]\s*/, "");
      } else if (t.startsWith("-") || t.startsWith("*")) {
        out[section].push(t.replace(/^[-*]\s*/, "").trim());
      }
    }
    return out;
  }

  parseSteps(markdown) {
    const steps = [];
    const findings = [];
    let inFindings = false;
    for (const line of markdown.split("\n")) {
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
