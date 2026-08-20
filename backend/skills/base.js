                                                                            
  
                                                               
                                                                       
  
         
                                      
                                
                                                      
                                                    
                                                    
                                
  
                                           
      

export class BaseSkill {
                                 
  static name = "base";
  static description = "Base skill — override in subclass";
  static triggers = [];                                                 
  static tools = [];                          
  static riskLevel = "low";                           
  static priority = 50;                                                         

     
                                                
                                        
     
  static matches(task, context = {}) {
    const t = String(task || "").toLowerCase();
                     
    const triggered = this.triggers.some((pattern) => pattern.test(t));
    if (!triggered) return false;
                                                       
    return true;
  }

     
                                                     
                                 
     
  static score(task, context = {}) {
    if (!this.matches(task, context)) return 0;
    let score = this.priority;
                                                
    if (context.relevantFiles?.length) score += 10;
                                        
    if (context.memoryText) score += 5;
    return Math.min(100, score);
  }

     
                                         
                                      
    
                                                       
                                                                               
                                                                    
     
  async execute(task, context) {
    throw new Error(`Skill "${this.constructor.name}" must implement execute()`);
  }
}

   
                                                            
                                                   
   
export class SimpleSkill extends BaseSkill {
  static systemPrompt = "You are an AI assistant. Help the user.";

  async execute(task, context) {
    const { callAI, memoryText, trustLevel, project } = context;
    const system = this.constructor.systemPrompt + (memoryText ? `\n\nMemory:\n${memoryText}` : "");
    const result = await callAI([
      { role: "system", content: system },
      { role: "user", content: task },
    ]);
    return {
      answer: result.content,
      steps: [],
      findings: [],
    };
  }
}
