                                                 
  
                                                
                                                                    
                                                             
                                                                  
                                                            
  
                
                                                                 
                                                        
                                                       
                                                                        

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "data");
const MEMORY_FILE = path.join(DATA_DIR, "memory.json");
const INSIGHTS_FILE = path.join(DATA_DIR, "insights.json");

const MAX_GLOBAL_NOTES = 8000;
const MAX_PROJECT_NOTES = 6000;

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, "utf-8"));
  } catch {
    return fallback;
  }
}

async function writeJson(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(data, null, 2));
}

async function readMemory() {
  const mem = await readJson(MEMORY_FILE, {});
  return {
    global: {
      notes: mem.global?.notes || "",
      topics: mem.global?.topics || {},
      updatedAt: mem.global?.updatedAt || 0,
    },
    projects: mem.projects || {},
  };
}

async function writeMemory(memory) {
  await writeJson(MEMORY_FILE, memory);
}

async function readInsights() {
  return readJson(INSIGHTS_FILE, { experiments: [], patterns: {} });
}

async function writeInsights(insights) {
  await writeJson(INSIGHTS_FILE, insights);
}

                                                            

   
                                                     
                                                                  
                                      
   
function extractInsights(experiment) {
  const insights = [];
  const task = experiment.task || "";
  const answer = experiment.answer || "";
  const findings = experiment.findings || [];
  const skill = experiment.skill || "general";
  const diagnosis = experiment.diagnosis || null;

                                          
  if (task) {
    const shortTask = task.replace(/\n+/g, " ").trim().slice(0, 300);
    insights.push(`Task: ${shortTask}`);
  }

                                                                                   
  if (answer) {
    const recommendation = extractSection(answer, "Recommendation");
    if (recommendation) {
      insights.push(`Resolution: ${recommendation.slice(0, 300)}`);
    }

                                          
    const titleLine = answer.split("\n").find((l) => l.startsWith("# "));
    if (titleLine) {
      insights.push(`Summary: ${titleLine.replace(/^#+\s*/, "").slice(0, 200)}`);
    }
  }

                                                        
  for (const f of findings) {
    const trimmed = f.trim();
    if (!trimmed) continue;
    const lower = trimmed.toLowerCase();
    if (lower.startsWith("critical:")) {
      insights.push(`Critical: ${trimmed.replace(/^critical:\s*/i, "").slice(0, 200)}`);
    } else if (lower.startsWith("warning:")) {
      insights.push(`Warning: ${trimmed.replace(/^warning:\s*/i, "").slice(0, 200)}`);
    } else if (lower.startsWith("suggestion:")) {
      insights.push(`Suggestion: ${trimmed.replace(/^suggestion:\s*/i, "").slice(0, 200)}`);
    }
  }

                          
  if (diagnosis?.cause) {
    insights.push(`Bug cause: ${diagnosis.cause.slice(0, 200)}`);
  }
  if (diagnosis?.location && !/unknown/i.test(diagnosis.location)) {
    insights.push(`Bug location: ${diagnosis.location}`);
  }
  if (diagnosis?.fix) {
    insights.push(`Fix applied: ${diagnosis.fix.slice(0, 200)}`);
  }

                      
  if (experiment.contextFiles?.length) {
    const files = experiment.contextFiles.slice(0, 8);
    insights.push(`Files: ${files.join(", ")}`);
  }

                  
  if (experiment.toolCalls?.length) {
    const tools = [...new Set(experiment.toolCalls.map((t) => t.name))];
    insights.push(`Tools used: ${tools.join(", ")}`);
  }

                      
  if (skill === "brainstorming" && experiment.brainstorm) {
    const bs = experiment.brainstorm;
    if (bs.iterations?.length) {
      insights.push(
        `Brainstorm: ${bs.iterations.length} iterations, best score ${bs.iterations.at(-1)?.bestScore || "?"}/10`
      );
    }
  }

                                                                 
  const themes = extractThemes(task, answer);

  return { insights: insights.filter(Boolean).slice(0, 15), themes };
}

   
                                                                           
   
function extractThemes(task, answer) {
  const stopWords = new Set([
    "the", "a", "an", "is", "are", "was", "were", "why", "what", "how",
    "do", "does", "did", "my", "it", "to", "of", "in", "on", "for",
    "with", "and", "or", "not", "can", "you", "help", "me", "find",
    "investigate", "debug", "check", "look", "at", "this", "that",
    "error", "bug", "fix", "need", "about", "please", "just",
    "working", "stopped", "issue", "problem", "file", "code",
  ]);

  const text = `${task} ${answer}`.toLowerCase();
  const words = text.split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !stopWords.has(w));

                         
  const freq = {};
  for (const w of words) {
    freq[w] = (freq[w] || 0) + 1;
  }

                                                                    
  const sorted = Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  return sorted.filter(([_, count]) => count >= 2).map(([word]) => word);
}

   
                                              
   
function extractSection(markdown, sectionName) {
  const lines = markdown.split("\n");
  let inSection = false;
  const sectionLines = [];

  for (const line of lines) {
    if (line.startsWith("## ")) {
      if (inSection) break;
      if (line.toLowerCase().includes(sectionName.toLowerCase())) {
        inSection = true;
        continue;
      }
    }
    if (inSection && line.trim()) {
      sectionLines.push(line.replace(/^[-*]\s*/, "").trim());
    }
  }

  return sectionLines.join(" ").slice(0, 400) || null;
}

                                                            

   
                                           
                                                   
   
async function updateProjectMemory(projectId, insightData, experiment) {
  if (!projectId) return 0;

  const { insights, themes } = insightData;
  if (!insights.length && !themes.length) return 0;

  const memory = await readMemory();
  const project = memory.projects[projectId] || { notes: "", patterns: {}, updatedAt: 0 };
  const lines = project.notes.split("\n").filter(Boolean);

                                          
  let added = 0;
  for (const insight of insights) {
    const normalized = insight.toLowerCase().trim();
                                                                            
    const isDuplicate = lines.some((l) => {
      const existing = l.replace(/^-\s*/, "").toLowerCase().trim();
      return existing.slice(0, 40) === normalized.slice(0, 40);
    });
    if (!isDuplicate) {
      lines.push(`- ${insight}`);
      added++;
    }
  }

                                      
  const patterns = project.patterns || {};
  for (const theme of themes) {
    patterns[theme] = (patterns[theme] || 0) + 1;
  }

                                                                           
  let notes = lines.join("\n");
  if (notes.length > MAX_PROJECT_NOTES) {
                                                                   
    const splitPoint = Math.floor(lines.length * 0.4);
    const oldLines = lines.slice(0, splitPoint);
    const recentLines = lines.slice(splitPoint);

                                               
    const topPatterns = Object.entries(patterns)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([theme, count]) => `${theme}(${count}x)`)
      .join(", ");

    const compressedOld = `[Earlier: ${oldLines.length} entries. Top themes: ${topPatterns || "none"}]`;
    notes = [compressedOld, ...recentLines].join("\n");
  }

  memory.projects[projectId] = {
    notes,
    patterns,
    updatedAt: Date.now(),
  };

  await writeMemory(memory);
  return added;
}

                                                            

   
                                                               
   
async function updateGlobalMemory(experiment, insightData) {
  const memory = await readMemory();
  const existing = memory.global?.notes || "";
  const lines = existing.split("\n").filter(Boolean);

                                       
  const task = (experiment.task || "").replace(/\n+/g, " ").trim().slice(0, 150);
  if (task) {
    const taskLine = `Worked on: ${task}`;
    const isDuplicate = lines.some(
      (l) => l.replace(/^-\s*/, "").toLowerCase().slice(0, 40) === taskLine.toLowerCase().slice(0, 40)
    );
    if (!isDuplicate) {
      lines.push(`- ${taskLine}`);
    }
  }

                            
  const answer = experiment.answer || "";
  const recommendation = extractSection(answer, "Recommendation");
  if (recommendation) {
    const resLine = `Resolved: ${recommendation.slice(0, 200)}`;
    const isDuplicate = lines.some(
      (l) => l.replace(/^-\s*/, "").toLowerCase().slice(0, 40) === resLine.toLowerCase().slice(0, 40)
    );
    if (!isDuplicate) {
      lines.push(`- ${resLine}`);
    }
  }

                            
  for (const f of experiment.findings || []) {
    const lower = f.toLowerCase();
    if (lower.startsWith("critical:")) {
      const finding = f.replace(/^critical:\s*/i, "").slice(0, 200);
      const findingLine = `Critical issue: ${finding}`;
      const isDuplicate = lines.some((l) => l.includes(finding.slice(0, 40)));
      if (!isDuplicate) {
        lines.push(`- ${findingLine}`);
      }
    }
  }

                      
  if (experiment.skill) {
    const skillLine = `Skill used: ${experiment.skill}`;
    const exists = lines.some((l) => l.toLowerCase() === skillLine.toLowerCase());
    if (!exists) {
      lines.push(`- ${skillLine}`);
    }
  }

                           
  const topics = memory.global?.topics || {};
  for (const theme of insightData?.themes || []) {
    topics[theme] = (topics[theme] || 0) + 1;
  }

                     
  let notes = lines.join("\n");
  if (notes.length > MAX_GLOBAL_NOTES) {
    const splitPoint = Math.floor(lines.length * 0.4);
    const oldLines = lines.slice(0, splitPoint);
    const recentLines = lines.slice(splitPoint);

    const topTopics = Object.entries(topics)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([topic, count]) => `${topic}(${count}x)`)
      .join(", ");

    const compressedOld = `[Earlier: ${oldLines.length} entries. Top topics: ${topTopics || "none"}]`;
    notes = [compressedOld, ...recentLines].join("\n");
  }

  memory.global = {
    notes,
    topics,
    updatedAt: Date.now(),
  };

  await writeMemory(memory);
}

                                                            

   
                                                            
   
async function saveInsightHistory(experiment, insightData) {
  const data = await readInsights();

  data.experiments.push({
    id: experiment.id,
    skill: experiment.skill,
    task: experiment.task?.slice(0, 150),
    insightCount: insightData.insights.length,
    themes: insightData.themes,
    timestamp: Date.now(),
  });

                              
  if (data.experiments.length > 200) {
    data.experiments = data.experiments.slice(-200);
  }

                              
  if (experiment.skill) {
    data.patterns[experiment.skill] = (data.patterns[experiment.skill] || 0) + 1;
  }

                                                 
  if (!data.themeFrequency) data.themeFrequency = {};
  for (const theme of insightData.themes) {
    data.themeFrequency[theme] = (data.themeFrequency[theme] || 0) + 1;
  }

  await writeInsights(data);
}

                                                            

   
                                                                   
                                           
   
export async function autoLearn(experiment) {
  if (!experiment || experiment.status !== "completed") return { added: 0, insights: [] };

                          
  const insightData = extractInsights(experiment);
  if (!insightData.insights.length) return { added: 0, insights: [] };

                          
  let added = 0;
  if (experiment.projectId) {
    added = await updateProjectMemory(experiment.projectId, insightData, experiment);
  }

                         
  await updateGlobalMemory(experiment, insightData);

                             
  await saveInsightHistory(experiment, insightData);

  console.log(
    `[memory] Auto-learned ${added} new insights from experiment ${experiment.id} (${insightData.insights.length} extracted, ${insightData.themes.length} themes)`
  );
  return { added, insights: insightData.insights };
}

   
                                
   
export async function getMemoryStats() {
  const memory = await readMemory();
  const insights = await readInsights();

  return {
    globalNotes: memory.global?.notes?.length || 0,
    globalTopics: Object.keys(memory.global?.topics || {}).length,
    projectCount: Object.keys(memory.projects).length,
    totalInsights: insights.experiments?.length || 0,
    skillUsage: insights.patterns || {},
    topThemes: Object.entries(insights.themeFrequency || {})
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10),
  };
}
