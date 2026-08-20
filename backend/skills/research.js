                                                                            
  
                                                                                          

import { BaseSkill } from "./base.js";

export class ResearchSkill extends BaseSkill {
  static name = "research";
  static description = "Search the web, find documentation, and gather information";
  static triggers = [
    /(?:search|research|look up|find out|google|search for|look for)/i,
    /what (?:is|are|was|were) (?:the |a |an )?(?:best|latest|current|top|recommended)/i,
    /how (?:do|does|did|should|would|can|could) (?:I|we|you)/i,
    /(?:compare|vs|versus|differences between|alternatives to)/i,
    /(?:documentation|docs|tutorial|guide|example|reference)/i,
    /(?:latest|newest|recent|current|up to date|202[4-9])/i,
    /(?:best practices|patterns|conventions|standards)/i,
  ];
  static tools = ["search_web", "read_file", "search_files"];
  static riskLevel = "low";
  static priority = 40;

  static score(task, context = {}) {
    const t = String(task || "").toLowerCase();

    const triggered = this.triggers.some((p) => p.test(t));
    if (!triggered) return 0;

    let score = 40;

                                                      
    if (/search|research|google|look up/i.test(t)) score += 20;

                                                                     
    if (/(?:library|framework|tool|service|api|package|npm|pip)/i.test(t)) score += 10;

                                          
    if (/(?:vs|versus|compare|alternatives|difference)/i.test(t)) score += 10;

    return Math.min(100, score);
  }

  async execute(task, context) {
    const { callAI, memoryText } = context;

                            
    let webResults = null;
    try {
      const searchQuery = this.extractSearchQuery(task);
      const { toolRegistry } = await import("../tools/index.js");
      const searchTool = toolRegistry.get("search_web");
      if (searchTool) {
        webResults = await searchTool.execute({ query: searchQuery }, {});
      }
    } catch (err) {
                                                
      console.log(`[research] Web search failed: ${err.message}`);
    }

    const system = `You are Hermes, an AI developer assistant running the RESEARCH skill. The user wants information, comparisons, or documentation.

Respond EXACTLY in this structure — the sections and labels are parsed automatically:

# <short title of the research>

## Findings
- <key finding or fact>
- <another finding>
- <another finding>

## Recommendation
<what to do with this information, or which option/approach to choose>

${webResults ? `Web search results:\n${webResults.results.map((r) => `- ${r.title}: ${r.text} (${r.url})`).join("\n")}` : "No web search results available."}

${memoryText ? `Memory:\n${memoryText}\n` : ""}
Rules:
- Base your answer on the search results when available
- Cite sources when possible (URL or title)
- If the search didn't find what you need, say so and suggest what to search for
- Be concise and actionable
- Plain language, no emojis
`;

    const result = await callAI([
      { role: "system", content: system },
      { role: "user", content: task },
    ]);

    const answer = result.content || "";
    const findings = this.parseFindings(answer);

    return {
      answer,
      steps: [],
      findings,
      skill: "research",
      webResults: webResults?.results || [],
    };
  }

  extractSearchQuery(task) {
                                                           
    let q = String(task || "")
      .replace(/^(?:search|research|look up|find out|google)\s+(?:for\s+)?/i, "")
      .replace(/^(?:what is|what are|how do|how does|how to|how can)\s+/i, "")
      .replace(/^(?:the |a |an )/i, "")
      .trim();
                   
    if (q.length > 120) q = q.slice(0, 120);
    return q || task;
  }

  parseFindings(markdown) {
    const findings = [];
    let inFindings = false;
    for (const line of markdown.split("\n")) {
      if (line.startsWith("# ") || line.trim() === "") continue;
      if (line.startsWith("## ")) {
        inFindings = line.toLowerCase().includes("finding") || line.toLowerCase().includes("result");
        continue;
      }
      if (inFindings && (line.startsWith("- ") || line.startsWith("* "))) {
        findings.push(line.replace(/^[-*•]\s*/, "").trim());
      }
    }
    return findings.filter(Boolean);
  }
}
