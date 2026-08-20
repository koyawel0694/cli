                                                                     
                                                                         
                                                                            
                                                      
  
                             
                                                                   
                                                                    
                                                                          
                                                                                 
                                
                                                    
                                                                               
                                                                                 
  
                                                                       

import { GoogleGenAI } from "@google/genai";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

                                                                          

export class ProviderError extends Error {
  constructor(code, message, { retryable = false, skippable = false, provider = "", model = "" } = {}) {
    super(message);
    this.name = "ProviderError";
    this.code = code;                                                                                                  
    this.retryable = retryable;
    this.skippable = skippable;
    this.provider = provider;
    this.model = model;
  }
}

const RETRYABLE_CODES = new Set(["rate_limit", "timeout", "network", "server", "empty"]);
const ABORT_CODES = new Set(["auth", "bad_request"]);

function detectCode(status, text = "") {
  const t = String(text).toLowerCase();
  if (/quota|insufficient credits|billing|402/i.test(t)) return "quota";
  if (/rate limit|rate_limit|429|too many requests/i.test(t)) return "rate_limit";
  if (/api key|invalid.*key|unauthorized|authentication|401|403|permission/i.test(t)) return "auth";
  if (/model.*(not found|invalid|does not exist)|unknown model|404/i.test(t)) return "model";
  if (/timeout|timed out|timedout/i.test(t)) return "timeout";
  if (/network|fetch failed|econnreset|econnrefused|socket/i.test(t)) return "network";
  if (/server|5\d\d|internal/i.test(t)) return "server";
  if (/bad request|400/i.test(t)) return "bad_request";
  return "unknown";
}

function aiLog(provider, model, msg, extra) {
  const line = `[AI] Provider: ${provider} | Model: ${model} | ${msg}`;
  console.log(extra ? `${line} | ${extra}` : line);
}

                                                                           

function parseToolArgs(s) {
  if (!s) return {};
  try {
    return JSON.parse(s);
  } catch {
    return { raw: String(s).slice(0, 2000) };
  }
}

function messagesNeedVision(messages) {
  return (messages || []).some((m) =>
    Array.isArray(m.content) ? m.content.some((p) => p.type === "image_url") : false
  );
}

function normalizeToolCalls(nativeCalls) {
  if (!nativeCalls?.length) return [];
  return nativeCalls.map((c) => ({
    id: c.id || `call_${Math.random().toString(36).slice(2, 10)}`,
    name: String(c.function?.name || ""),
    args: parseToolArgs(c.function?.arguments),
  }));
}

                                                                            

export class OpenAICompatibleProvider {
  constructor(env = {}) {
    this.id = "openai";
    this.label = "OpenAI-compatible";
    this.baseUrl = (env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
    this.apiKey = env.OPENAI_API_KEY || "";
    this.model = env.OPENAI_MODEL || "gpt-4o-mini";
    this.fallbacks = (env.OPENAI_FALLBACK_MODELS || "").split(",").map((s) => s.trim()).filter(Boolean);
    this.models = [this.model, ...this.fallbacks];
    this.supportsVision = true;                                                                       
  }

  isAvailable() {
    return this.apiKey
      ? { available: true, reason: "" }
      : { available: false, reason: "OPENAI_API_KEY is not set in backend/.env" };
  }

  async generate(messages, opts = {}, timeoutMs = 90000) {
    const { toolCalling = false, retries = 1 } = opts;
    const toolPayload = toolCalling
      ? { tools: opts.tools || [], tool_choice: "auto" }
      : {};
    let lastError = null;
    let retriedEmpty = false;
    for (let mi = 0; mi < this.models.length; mi++) {
      const model = this.models[mi];
      let attempt = 0;
      while (true) {
        aiLog(this.label, model, "Request started");
        try {
          const res = await fetchWithTimeout(`${this.baseUrl}/chat/completions`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` },
            body: JSON.stringify({
              model,
              messages,
              temperature: 0.4,
              max_tokens: 4096,
              ...toolPayload,
            }),
          }, timeoutMs);
          if (!res.ok) {
            const text = await res.text();
            const rateLimited = res.status === 429 || /rate limit/i.test(text);
            const skippable =
              /must be a string/i.test(text) ||
              /does not (support|accept) image/i.test(text) ||
              /request too large/i.test(text);
            const code = rateLimited ? "rate_limit" : detectCode(res.status, text);
            throw new ProviderError(
              code,
              `Model ${model} failed (${res.status}): ${text.slice(0, 300)}`,
              { retryable: rateLimited, skippable, provider: this.label, model }
            );
          }
          const data = await res.json();
          const msg = data?.choices?.[0]?.message;
          const nativeCalls = msg?.tool_calls;
          if (nativeCalls?.length) {
            aiLog(this.label, model, "Request completed");
            return { content: msg?.content || "", toolCalls: normalizeToolCalls(nativeCalls) };
          }
          let content = msg?.content || "";
          if (!content) content = msg?.reasoning || msg?.reasoning_content || msg?.thinking || "";
          if (!content) {
            const detail = JSON.stringify(data).slice(0, 600);
            if (data?.choices?.[0]?.finish_reason === "length") {
              throw new ProviderError("bad_request", `Model ${model} response was cut off (finish_reason=length). Raw: ${detail}`, { provider: this.label, model });
            }
            if (msg?.refusal) {
              throw new ProviderError("bad_request", `Model ${model} refused the request: ${String(msg.refusal).slice(0, 200)}`, { provider: this.label, model });
            }
            if (!retriedEmpty) {
              retriedEmpty = true;
              continue;                                           
            }
            throw new ProviderError("empty", `Model ${model} returned an unexpected response: ${detail}`, { retryable: true, provider: this.label, model });
          }
          aiLog(this.label, model, "Request completed");
          return { content, toolCalls: [] };
        } catch (err) {
          const providerErr = err instanceof ProviderError
            ? err
            : new ProviderError(detectCode(err.status, err.message), `Model ${model} failed: ${String(err.message).slice(0, 300)}`, {
                retryable: RETRYABLE_CODES.has(detectCode(err.status, err.message)),
                provider: this.label,
                model,
              });
          lastError = providerErr;
          if (providerErr.skippable || providerErr.code === "model" || providerErr.code === "bad_request") {
            break;                                                           
          }
          if (providerErr.code === "auth") throw providerErr;
          if (providerErr.retryable && attempt < retries) {
            attempt++;
            await sleep(750 * attempt);
            continue;
          }
          break;
        }
      }
    }
    throw lastError || new ProviderError("unknown", "All OpenAI-compatible models failed", { provider: this.label });
  }
}

                                                                             

function dataUrlToInlineData(url) {
  const m = String(url || "").match(/^data:([^;]+);base64,(.+)$/s);
  if (!m) return null;
  return { mimeType: m[1], data: m[2].replace(/\s/g, "") };
}

export class GeminiProvider {
  constructor(env = {}, { client } = {}) {
    this.id = "gemini";
    this.label = "Gemini";
    this.apiKey = env.GEMINI_API_KEY || "";
    this.model = env.GEMINI_MODEL || "gemini-3.6-flash";
    this.supportsVision = true;                                                  
    this.client = client || (this.apiKey ? new GoogleGenAI({ apiKey: this.apiKey }) : null);
  }

  isAvailable() {
    return this.apiKey
      ? { available: true, reason: "" }
      : { available: false, reason: "GEMINI_API_KEY is not set in backend/.env" };
  }

                                                              
  static toGemini(messages) {
    const contents = [];
    let pendingFnNames = [];
    for (const m of messages || []) {
      if (m.role === "system") continue;                                
      if (m.role === "tool") {
                                                                         
        const name = pendingFnNames.shift() || "";
        let parsed = {};
        try {
          parsed = JSON.parse(m.content || "{}");
        } catch {
          parsed = { result: String(m.content || "") };
        }
        contents.push({ role: "user", parts: [{ functionResponse: { name, response: { result: parsed } } }] });
        continue;
      }
      const parts = [];
      if (typeof m.content === "string") {
        if (m.content) parts.push({ text: m.content });
      } else if (Array.isArray(m.content)) {
        for (const p of m.content) {
          if (p.type === "text" && p.text) parts.push({ text: p.text });
          else if (p.type === "image_url") {
            const inline = dataUrlToInlineData(p.image_url?.url);
            if (inline) parts.push({ inlineData: inline });
          }
        }
      }
      if (m.role === "assistant" && Array.isArray(m.tool_calls)) {
        for (const tc of m.tool_calls) {
          const name = tc.function?.name || "";
          pendingFnNames.push(name);
          parts.push({ functionCall: { name, args: parseToolArgs(tc.function?.arguments) } });
        }
      }
      if (parts.length) contents.push({ role: m.role === "assistant" ? "model" : "user", parts });
    }
    const system = messages?.find((m) => m.role === "system")?.content;
    return { contents, systemInstruction: system ? { parts: [{ text: system }] } : null };
  }

  static fromGemini(response, model) {
    const cand = response?.candidates?.[0];
    if (!cand?.content) {
      throw new ProviderError("empty", `Gemini ${model} returned no content`, { retryable: true, provider: "Gemini", model });
    }
    if (cand.finishReason === "MAX_TOKENS") {
      throw new ProviderError("bad_request", `Gemini ${model} response was cut off (MAX_TOKENS)`, { provider: "Gemini", model });
    }
    const parts = cand.content.parts || [];
    const text = parts.filter((p) => p.text).map((p) => p.text).join("\n");
    const calls = parts
      .filter((p) => p.functionCall)
      .map((p, i) => ({
        id: `call_${i}`,
        name: String(p.functionCall.name || ""),
        args: p.functionCall.args && typeof p.functionCall.args === "object" ? p.functionCall.args : {},
      }));
    if (calls.length) return { content: text || "", toolCalls: calls };
    if (!text) {
      throw new ProviderError("empty", `Gemini ${model} returned an empty response (finishReason=${cand.finishReason})`, { retryable: true, provider: "Gemini", model });
    }
    return { content: text, toolCalls: [] };
  }

  async generate(messages, opts = {}, timeoutMs = 90000) {
    const { toolCalling = false, retries = 1 } = opts;
    if (!this.client) throw new ProviderError("auth", "Gemini is not configured (GEMINI_API_KEY missing)", { provider: this.label, model: this.model });
    const { contents, systemInstruction } = GeminiProvider.toGemini(messages);
    const config = {
      maxOutputTokens: 4096,
      temperature: 0.4,
      ...(systemInstruction ? { systemInstruction } : {}),
      ...(toolCalling && opts.tools?.length
        ? {
            tools: [{
              functionDeclarations: opts.tools.map((t) => ({
                name: t.function.name,
                description: t.function.description || "",
                parameters: t.function.parameters || { type: "object" },
              })),
            }],
          }
        : {}),
    };
    let attempt = 0;
    while (true) {
      aiLog(this.label, this.model, "Request started");
      try {
        const result = await withTimeout(this.client.models.generateContent({ model: this.model, contents, config }), timeoutMs);
        const out = GeminiProvider.fromGemini(result, this.model);
        aiLog(this.label, this.model, "Request completed");
        return out;
      } catch (err) {
        if (err instanceof ProviderError) throw err;
        const code = detectGeminiError(err);
        const normalized = new ProviderError(code, `Gemini ${this.model} failed: ${String(err.message).slice(0, 300)}`, {
          retryable: RETRYABLE_CODES.has(code),
          provider: this.label,
          model: this.model,
        });
        if (code === "auth" || code === "bad_request" || code === "model") throw normalized;
        if (normalized.retryable && attempt < retries) {
          attempt++;
          await sleep(750 * attempt);
          continue;
        }
        throw normalized;
      }
    }
  }
}

function detectGeminiError(err) {
  const status = err?.status ?? err?.code;
  const text = String(err?.message || "");
  if (status === 429 || /rate.limit/i.test(text)) return "rate_limit";
  if (status === 401 || status === 403 || /api key|unauthorized|permission/i.test(text)) return "auth";
  if (status === 404 || /model.*(not found|invalid)/i.test(text)) return "model";
  if (status >= 500) return "server";
  if (/quota|resource exhausted/i.test(text)) return "quota";
  return detectCode(status, text);
}

                                                                             

export class OpenRouterProvider {
  constructor(env = {}) {
    this.id = "openrouter";
    this.label = "OpenRouter";
    this.apiKey = env.OPENROUTER_API_KEY || "";
                                                                            
                                                                           
    this.model = env.OPENROUTER_MODEL || "deepseek/deepseek-chat-v3-0324:free";
    this.supportsVision = /vision|gemini|gpt-4o|gpt-4\.1|claude|llava|qwen.*vl|glm-4v/i.test(this.model);
  }

  isAvailable() {
    return this.apiKey
      ? { available: true, reason: "" }
      : { available: false, reason: "OPENROUTER_API_KEY is not set in backend/.env" };
  }

  async generate(messages, opts = {}, timeoutMs = 90000) {
    const { toolCalling = false, retries = 1 } = opts;
    const toolPayload = toolCalling
      ? { tools: opts.tools || [], tool_choice: "auto" }
      : {};
    let attempt = 0;
    while (true) {
      aiLog(this.label, this.model, "Request started");
      try {
        const res = await fetchWithTimeout("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`,
            "HTTP-Referer": "http://localhost:4000",
            "X-Title": "Hermes",
          },
          body: JSON.stringify({
            model: this.model,
            messages,
            temperature: 0.4,
            max_tokens: 4096,
            ...toolPayload,
          }),
        }, timeoutMs);
        if (!res.ok) {
          const text = await res.text();
          const code = detectCode(res.status, text);
          throw new ProviderError(code, `OpenRouter ${this.model} failed (${res.status}): ${text.slice(0, 300)}`, {
            retryable: RETRYABLE_CODES.has(code),
            provider: this.label,
            model: this.model,
          });
        }
        const data = await res.json();
        const msg = data?.choices?.[0]?.message;
        const nativeCalls = msg?.tool_calls;
        if (nativeCalls?.length) {
          aiLog(this.label, this.model, "Request completed");
          return { content: msg?.content || "", toolCalls: normalizeToolCalls(nativeCalls) };
        }
        let content = msg?.content || "";
        if (!content) content = msg?.reasoning || msg?.reasoning_content || "";
        if (!content) {
          if (data?.choices?.[0]?.finish_reason === "length") {
            throw new ProviderError("bad_request", `OpenRouter ${this.model} response was cut off (finish_reason=length)`, { provider: this.label, model: this.model });
          }
          throw new ProviderError("empty", `OpenRouter ${this.model} returned an empty response`, { retryable: true, provider: this.label, model: this.model });
        }
        aiLog(this.label, this.model, "Request completed");
        return { content, toolCalls: [] };
      } catch (err) {
        const normalized = err instanceof ProviderError
          ? err
          : new ProviderError("network", `OpenRouter ${this.model} failed: ${String(err.message).slice(0, 300)}`, {
              retryable: true,
              provider: this.label,
              model: this.model,
            });
        if (normalized.code === "auth" || normalized.code === "bad_request" || normalized.code === "model") throw normalized;
        if (normalized.retryable && attempt < retries) {
          attempt++;
          await sleep(750 * attempt);
          continue;
        }
        throw normalized;
      }
    }
  }
}

                                                                              

export async function withTimeout(promise, ms) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("request timed out")), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function fetchWithTimeout(url, opts, ms) {
  return withTimeout(fetch(url, opts), ms);
}

                                                                                

const PROVIDER_NAMES = { openai: OpenAICompatibleProvider, gemini: GeminiProvider, openrouter: OpenRouterProvider };

export function createRouter(env = process.env, { providers = {} } = {}) {
  const injected = {};
  for (const [k, v] of Object.entries(providers || {})) injected[String(k).toLowerCase().trim()] = v;

  const primary = (env.AI_PROVIDER || "openai").toLowerCase().trim();
  const fallbackRaw = (env.AI_FALLBACK_PROVIDER || "openai").toLowerCase().trim();
  const fallback = fallbackRaw === "none" ? "" : fallbackRaw;
  const maxFallbacks = Math.max(0, Math.min(4, Number(env.AI_MAX_FALLBACKS) || 1));
  const retries = Math.max(0, Math.min(3, Number(env.AI_PROVIDER_RETRIES) || 1));
  const timeoutMs = Math.max(1000, Number(env.AI_REQUEST_TIMEOUT_MS) || 90000);

  const instantiate = (name) => {
    if (injected[name]) return injected[name];
    const Cls = PROVIDER_NAMES[name];
    return Cls ? new Cls(env) : null;
  };

  const order = [];
  for (const name of [primary, fallback]) {
    const p = instantiate(name);
    if (p && !order.some((x) => x.id === p.id)) order.push(p);
  }
  const planned = order.slice(0, 1 + maxFallbacks);

  async function generate(messages, opts = {}) {
    const needsVision = messagesNeedVision(messages);
    const toolCalling = !!opts.toolCalling;
    const failures = [];
    let lastError = null;
    for (const provider of planned) {
      const avail = provider.isAvailable();
      if (!avail.available) {
        aiLog(provider.label, "n/a", "Skipped - not available", avail.reason);
        failures.push(`${provider.label}: ${avail.reason}`);
        continue;
      }
      if (needsVision && provider.supportsVision === false) {
        aiLog(provider.label, "n/a", "Skipped - cannot handle vision request");
        failures.push(`${provider.label}: cannot handle vision request`);
        continue;
      }
      try {
        return await provider.generate(messages, { toolCalling, tools: opts.tools || [], retries }, timeoutMs);
      } catch (err) {
        lastError = err;
        if (err instanceof ProviderError && ABORT_CODES.has(err.code)) {
          aiLog(provider.label, provider.model, `Aborting - ${err.code}`, err.message.slice(0, 120));
          throw err;
        }
        aiLog(provider.label, provider.model, "Failed - trying next provider", err.message.slice(0, 120));
        failures.push(`${provider.label} (${provider.model}): ${err.message.slice(0, 200)}`);
      }
    }
    const tried = planned.map((p) => `${p.label} (${p.model || "n/a"})`).join(", ");
    if (lastError instanceof ProviderError) {
      throw new ProviderError(
        lastError.code,
        `All AI providers failed. Tried: ${tried}. ${lastError.message}`
      );
    }
    throw new ProviderError(
      "unknown",
      `All AI providers failed. Tried: ${tried}. Details: ${failures.join(" | ")}`
    );
  }

  return {
    generate,
    providers: planned.map((p) => ({ id: p.id, label: p.label, model: p.model || null })),
    primary,
    fallback,
  };
}

                                                                             
                                 
                                             
                                            
                                                                   
                                                    
                                             
                                                                         
                                                                                
