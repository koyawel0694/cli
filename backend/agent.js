                                                                                          
  
                                                 
                                                               
  
         
                                            
                                                                  
                                          

import { Brain } from "./brain.js";

const MAX_ITERATIONS = 8;

export class AgentLoop {
  constructor({ callAI, project, memoryText, trustLevel, brainstormConfig, imageDataUrl }) {
    this.callAI = callAI;
    this.project = project;
    this.memoryText = memoryText;
    this.trustLevel = trustLevel;
    this.brainstormConfig = brainstormConfig;
    this.imageDataUrl = imageDataUrl;
    this.history = [];                                      
  }

     
                                                                          
    
                                           
                                                         
                                                                                
     
  async run(task, opts = {}) {
    const maxIterations = opts.maxIterations || MAX_ITERATIONS;
    const onProgress = opts.onProgress || (() => {});

    this.history = [];
    let iteration = 0;
    let currentTask = task;
    let lastResult = null;

    while (iteration < maxIterations) {
      iteration++;
      onProgress({ phase: "planning", iteration, task: currentTask });

                      
      const brain = new Brain({
        callAI: this.callAI,
        project: this.project,
        memoryText: this.memoryText,
        trustLevel: this.trustLevel,
        brainstormConfig: this.brainstormConfig,
        imageDataUrl: this.imageDataUrl,
      });

      const plan = await brain.plan(currentTask);
      onProgress({ phase: "planned", iteration, skill: plan.skill, confidence: plan.confidence });

      this.history.push({ iteration, phase: "plan", data: plan });

                                        
      onProgress({ phase: "executing", iteration, skill: plan.skill });
      const result = await brain.execute(plan, currentTask);
      lastResult = result;

      this.history.push({ iteration, phase: "execute", data: { skill: result.skill, hasAnswer: !!result.answer } });

                                            
      const observation = this.observe(result);
      this.history.push({ iteration, phase: "observe", data: observation });

      onProgress({ phase: "observed", iteration, done: observation.done, quality: observation.quality });

                          
      if (observation.done) {
        onProgress({ phase: "done", iteration, skill: result.skill });
        return {
          answer: result.answer,
          findings: result.findings || [],
          steps: result.steps || [],
          skill: result.skill,
          iterations: iteration,
          history: this.history,
          diagnosis: result.diagnosis || null,
          uiAnalysis: result.uiAnalysis || null,
          brainstorm: result.brainstorm || null,
          webResults: result.webResults || null,
        };
      }

                                            
      if (observation.reason) {
        currentTask = `${task}\n\n[Attempt ${iteration} failed: ${observation.reason}. Try a different approach.]`;
      }

      onProgress({ phase: "replanning", iteration, reason: observation.reason });
    }

                                                   
    onProgress({ phase: "max_iterations", iteration });
    return {
      answer: lastResult?.answer || "I was unable to complete this task after multiple attempts.",
      findings: lastResult?.findings || [],
      steps: lastResult?.steps || [],
      skill: lastResult?.skill || "general",
      iterations: iteration,
      history: this.history,
      incomplete: true,
    };
  }

     
                                                 
     
  observe(result) {
                                                       
    if (result.answer && result.answer.trim().length > 20) {
      return { done: true, quality: 80 };
    }

                                               
    if (result.findings?.length > 0) {
      return { done: true, quality: 70 };
    }

                                           
    if (result.answer?.includes("need more info") || result.answer?.includes("need data or tools")) {
      return { done: false, reason: "Insufficient information to complete the task" };
    }

                                            
    return { done: false, reason: "Result was empty or too short" };
  }
}
