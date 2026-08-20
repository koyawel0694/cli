                                                                
  
                                                                
                                                              
                                             
                                               
                                               
                                           
  
                                                 
                                                   
                                                     
                       

import { WebSocketServer } from "ws";

class ProgressBroadcaster {
  constructor() {
    this.clients = new Map();                           
    this.wss = null;
  }

     
                                                           
     
  start(httpServer) {
    this.wss = new WebSocketServer({ server: httpServer, path: "/ws" });

    this.wss.on("connection", (ws) => {
      this.clients.set(ws, new Set());

                             
      this.send(ws, { type: "connected", message: "Hermes WebSocket connected" });

      ws.on("message", (data) => {
        try {
          const msg = JSON.parse(String(data));
          this.handleMessage(ws, msg);
        } catch {
          this.send(ws, { type: "error", error: "Invalid message format" });
        }
      });

      ws.on("close", () => {
        this.clients.delete(ws);
      });

      ws.on("error", () => {
        this.clients.delete(ws);
      });
    });

    console.log("[ws] WebSocket server started on /ws");
  }

     
                                           
     
  handleMessage(ws, msg) {
    if (msg.action === "subscribe" && msg.experimentId) {
      const subs = this.clients.get(ws);
      if (subs) subs.add(msg.experimentId);
      this.send(ws, { type: "subscribed", experimentId: msg.experimentId });
    } else if (msg.action === "unsubscribe" && msg.experimentId) {
      const subs = this.clients.get(ws);
      if (subs) subs.delete(msg.experimentId);
      this.send(ws, { type: "unsubscribed", experimentId: msg.experimentId });
    } else if (msg.action === "ping") {
      this.send(ws, { type: "pong", timestamp: Date.now() });
    }
  }

     
                                       
     
  send(ws, data) {
    if (ws.readyState === 1) {
      ws.send(JSON.stringify(data));
    }
  }

     
                                                                   
                                                                     
     
  broadcast(experimentId, event) {
    const msg = JSON.stringify({ ...event, experimentId, timestamp: Date.now() });

    for (const [ws, subs] of this.clients) {
      if (ws.readyState !== 1) continue;
                                                                                  
      if (!experimentId || subs.has(experimentId) || subs.size === 0) {
        ws.send(msg);
      }
    }
  }

     
                                             
     
  progress(experimentId, step, progress) {
    this.broadcast(experimentId, { type: "progress", step, progress });
  }

     
                                
     
  status(experimentId, status) {
    this.broadcast(experimentId, { type: "status", status });
  }

     
                          
     
  finding(experimentId, finding) {
    this.broadcast(experimentId, { type: "finding", finding });
  }

     
                             
     
  complete(experimentId, result) {
    this.broadcast(experimentId, { type: "complete", result });
  }

     
                         
     
  error(experimentId, error) {
    this.broadcast(experimentId, { type: "error", error });
  }

  token(experimentId, token) {
    this.broadcast(experimentId, { type: "token", token });
  }

     
                                
     
  get clientCount() {
    return this.clients.size;
  }
}

                     
export const broadcaster = new ProgressBroadcaster();
