                                                                
  
         
                                                                           
                                                   
                                                         

import { skillRegistry, routeTask, listSkills } from "./registry.js";
import { DebuggingSkill } from "./debugging.js";
import { CodingSkill } from "./coding.js";
import { ResearchSkill } from "./research.js";
import { BrainstormingSkill } from "./brainstorming.js";
import { UIAnalysisSkill } from "./ui-analysis.js";

   
                                                                   
                                    
   
export function initSkills() {
  skillRegistry.register(DebuggingSkill);
  skillRegistry.register(CodingSkill);
  skillRegistry.register(ResearchSkill);
  skillRegistry.register(BrainstormingSkill);
  skillRegistry.register(UIAnalysisSkill);

  console.log(`[skills] Registered ${skillRegistry.list().length} skills: ${skillRegistry.list().map((s) => s.name).join(", ")}`);
}

                       
export { skillRegistry, routeTask, listSkills } from "./registry.js";
export { BaseSkill, SimpleSkill } from "./base.js";
export { DebuggingSkill } from "./debugging.js";
export { CodingSkill } from "./coding.js";
export { ResearchSkill } from "./research.js";
export { BrainstormingSkill } from "./brainstorming.js";
export { UIAnalysisSkill } from "./ui-analysis.js";
