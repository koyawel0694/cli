                                          
  
             
                                                           
                                                                        
                                                          
                                                                 
                                                                            

import { getSkills, getTools, previewRoute, getHermesStatus, processTask } from "../hermes.js";

export function registerSkillRoutes(app, { readJson, EXPERIMENTS_FILE, PROJECTS_FILE, MEMORY_FILE, readSettings, loadMemoryForProject, callAI, getAiRouter }) {

                               
  app.get("/api/skills", (req, res) => {
    res.json({
      skills: getSkills(),
      count: getSkills().length,
    });
  });

                                            
  app.get("/api/skills/route", (req, res) => {
    const task = String(req.query.task || "").trim();
    if (!task) {
      return res.status(400).json({ error: "task query parameter is required" });
    }
    const result = previewRoute(task);
    if (!result) {
      return res.json({ matched: false, skill: null, score: 0 });
    }
    res.json({
      matched: true,
      skill: { name: result.skill.name, description: result.skill.description },
      score: result.score,
      alternatives: result.alternatives.map((a) => ({
        name: a.skill.name,
        description: a.skill.description,
        score: a.score,
      })),
    });
  });

                              
  app.get("/api/tools", (req, res) => {
    res.json({
      tools: getTools(),
      count: getTools().length,
    });
  });

                             
  app.get("/api/hermes/status", (req, res) => {
    res.json(getHermesStatus());
  });

                                                                              
  app.post("/api/hermes/process", async (req, res) => {
    const { task, projectId, useAgentLoop } = req.body;
    if (!task?.trim()) {
      return res.status(400).json({ error: "task is required" });
    }

    try {
                      
      const projects = await readJson(PROJECTS_FILE, []);
      const project = projects.find((p) => p.id === projectId) || null;
      const memoryText = await loadMemoryForProject(projectId, task);
      const { trustLevel } = await readSettings();

      const result = await processTask(task, {
        project,
        memoryText,
        trustLevel,
        callAI: (messages, opts) => getAiRouter().generate(messages, opts),
        useAgentLoop: useAgentLoop || false,
      });

      res.json({
        success: true,
        answer: result.answer,
        findings: result.findings,
        steps: result.steps,
        skill: result.skill,
        plan: result.plan || null,
        iterations: result.iterations || 1,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

                     
  app.get("/api/memory/stats", async (req, res) => {
    try {
      const { getMemoryStats } = await import("../memory.js");
      const stats = await getMemoryStats();
      res.json(stats);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}
