                                                       
  
                                                   
                                          
                                                                     
                                                               
                                                 
                                         
                                           
  
         
                                                                                       
                        
                                                                              

import { initSkills, routeTask, listSkills as getSkillList } from "./skills/index.js";
import { registerBuiltinTools, toolRegistry } from "./tools/index.js";
import { Brain } from "./brain.js";
import { AgentLoop } from "./agent.js";

let initialized = false;

   
                                    
                                    
   
export async function initHermes() {
  if (initialized) return;

                       
  registerBuiltinTools();

                        
  initSkills();

  initialized = true;
  console.log("[hermes] All systems initialized");
}

   
                                            
  
                                                     
                                                                                                                      
                                                                    
   
export async function processTask(task, context = {}) {
  if (!initialized) await initHermes();

  const {
    project = null,
    memoryText = null,
    trustLevel = 1,
    callAI,
    brainstormConfig = null,
    imageDataUrl = null,
    useAgentLoop = false,
  } = context;

  if (!callAI) throw new Error("callAI function is required");

  const fullContext = {
    project,
    memoryText,
    trustLevel,
    callAI,
    brainstormConfig,
    imageDataUrl,
  };

                                                      
  if (useAgentLoop) {
    const agent = new AgentLoop(fullContext);
    return agent.run(task, {
      onProgress: (progress) => {
                                                       
      },
    });
  }

                                        
  const brain = new Brain(fullContext);
  const plan = await brain.plan(task);
  const result = await brain.execute(plan, task);

  return {
    ...result,
    plan,
  };
}

   
                                                      
   
export function getSkills() {
  return getSkillList();
}

   
                                                     
   
export function getTools() {
  return toolRegistry.list();
}

   
                                                        
   
export function previewRoute(task, context = {}) {
  return routeTask(task, context);
}

   
                                       
   
export function getHermesStatus() {
  return {
    initialized,
    skills: getSkillList(),
    tools: toolRegistry.list().map(({ execute, ...meta }) => meta),
    version: "1.0.0",
  };
}

                           
export { Brain } from "./brain.js";
export { AgentLoop } from "./agent.js";
export { toolRegistry, executeTool, assessRisk, gatedToolDecision } from "./tools/index.js";
export { skillRegistry, routeTask, listSkills } from "./skills/index.js";
