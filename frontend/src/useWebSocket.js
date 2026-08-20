                                                          
  
         
                                                                  
                                                                                                           
                                                             

import { useCallback, useEffect, useRef, useState } from "react";

const WS_URL = import.meta.env.VITE_WS_URL || "ws://localhost:4000/ws";
const RECONNECT_DELAY = 2000;
const MAX_RECONNECT_DELAY = 30000;
const PING_INTERVAL = 30000;

export function useWebSocket() {
  const [connected, setConnected] = useState(false);
  const wsRef = useRef(null);
  const reconnectTimer = useRef(null);
  const pingTimer = useRef(null);
  const reconnectDelay = useRef(RECONNECT_DELAY);
  const subscribedExps = useRef(new Set());

  const dispatch = useCallback((eventType, detail) => {
    window.dispatchEvent(new CustomEvent(`ws:${eventType}`, { detail }));
  }, []);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    try {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        reconnectDelay.current = RECONNECT_DELAY;
        dispatch("connected", {});

                                                           
        for (const expId of subscribedExps.current) {
          ws.send(JSON.stringify({ action: "subscribe", experimentId: expId }));
        }

                              
        pingTimer.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ action: "ping" }));
          }
        }, PING_INTERVAL);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(String(event.data));
          dispatch(msg.type, msg);
        } catch {
                                      
        }
      };

      ws.onclose = () => {
        setConnected(false);
        clearInterval(pingTimer.current);
                                        
        reconnectTimer.current = setTimeout(() => {
          reconnectDelay.current = Math.min(reconnectDelay.current * 1.5, MAX_RECONNECT_DELAY);
          connect();
        }, reconnectDelay.current);
      };

      ws.onerror = () => {
                                           
      };
    } catch {
                                                   
    }
  }, [dispatch]);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectTimer.current);
      clearInterval(pingTimer.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;                                
        wsRef.current.close();
      }
    };
  }, [connect]);

  const subscribe = useCallback((experimentId) => {
    subscribedExps.current.add(experimentId);
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ action: "subscribe", experimentId }));
    }
  }, []);

  const unsubscribe = useCallback((experimentId) => {
    subscribedExps.current.delete(experimentId);
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ action: "unsubscribe", experimentId }));
    }
  }, []);

  return { connected, subscribe, unsubscribe };
}

   
                                                                  
                                                                   
  
         
                                                             
   
export function useWsEvent(eventType, experimentId, callback) {
  const { subscribe, unsubscribe } = useWebSocket();
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    if (!experimentId) return;
    subscribe(experimentId);

    const handler = (e) => {
      const data = e.detail;
      if (data.experimentId === experimentId) {
        callbackRef.current(data);
      }
    };

    window.addEventListener(`ws:${eventType}`, handler);
    return () => {
      window.removeEventListener(`ws:${eventType}`, handler);
      unsubscribe(experimentId);
    };
  }, [eventType, experimentId, subscribe, unsubscribe]);
}
