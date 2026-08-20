                                                                        
  
         
                                                                     
                                     
                                                              
                                                                   

import { BaseSkill } from "./base.js";

class SkillRegistry {
  constructor() {
    this.skills = new Map();
  }

  register(SkillClass) {
    if (!SkillClass.name || !SkillClass.name) {
      throw new Error("Skill must have a static name");
    }
    this.skills.set(SkillClass.name, SkillClass);
  }

  get(name) {
    return this.skills.get(name) || null;
  }

  list() {
    return Array.from(this.skills.values()).map((S) => ({
      name: S.name,
      description: S.description,
      tools: S.tools,
      riskLevel: S.riskLevel,
      priority: S.priority,
    }));
  }

     
                                    
                                                                        
     
  route(task, context = {}) {
    const candidates = [];

    for (const SkillClass of this.skills.values()) {
      const score = SkillClass.score(task, context);
      if (score > 0) {
        candidates.push({ skill: SkillClass, score });
      }
    }

                               
    candidates.sort((a, b) => b.score - a.score);

    if (candidates.length === 0) return null;

    return {
      skill: candidates[0].skill,
      score: candidates[0].score,
      alternatives: candidates.slice(1),
    };
  }

     
                                                                 
     
  findAll(task, context = {}, minScore = 10) {
    const matches = [];
    for (const SkillClass of this.skills.values()) {
      const score = SkillClass.score(task, context);
      if (score >= minScore) {
        matches.push({ skill: SkillClass, score });
      }
    }
    matches.sort((a, b) => b.score - a.score);
    return matches;
  }
}

export const skillRegistry = new SkillRegistry();

   
                                  
                                                  
   
export function routeTask(task, context = {}) {
  return skillRegistry.route(task, context);
}

   
                                  
   
export function listSkills() {
  return skillRegistry.list();
}
