                                                                       
                                       
                                       
                                                                                     
                                                                           
                                          
import "dotenv/config";
import { createRouter } from "../aiProviders.js";

const PROMPT = "Hello Hermes. Give me three ideas for a developer tool.";

const env = { ...process.env };
const results = [];
const report = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "SKIP/FAIL"}  ${name}${detail ? ` â€” ${detail}` : ""}`);
};

const run = async (name, label, makeRouter) => {
  try {
    const router = makeRouter();
    const out = await router.generate([{ role: "user", content: PROMPT }]);
    const text = (out.content || "").trim().slice(0, 160);
    report(name, text.length > 10, `${label}: "${text}..."`);
  } catch (err) {
    report(name, false, `${label}: ${err.message.slice(0, 200)}`);
  }
};

const has = (k) => !!process.env[k];

if (has("GEMINI_API_KEY")) {
  await run("Test 1: Gemini enabled (AI_PROVIDER=gemini)", "Gemini", () =>
    createRouter({ ...env, AI_PROVIDER: "gemini", AI_FALLBACK_PROVIDER: "none" }));
} else {
  report("Test 1: Gemini enabled", false, "skipped â€” set GEMINI_API_KEY in backend/.env");
}

if (has("OPENROUTER_API_KEY")) {
  await run("Test 2: OpenRouter enabled (AI_PROVIDER=openrouter)", "OpenRouter", () =>
    createRouter({ ...env, AI_PROVIDER: "openrouter", AI_FALLBACK_PROVIDER: "none" }));
} else {
  report("Test 2: OpenRouter enabled", false, "skipped â€” set OPENROUTER_API_KEY in backend/.env");
}

if (has("GEMINI_API_KEY") && has("OPENAI_API_KEY")) {
  await run(
    "Test 3: Gemini primary + OpenAI fallback (fault injection: bad Gemini model)",
    "Gemini -> OpenAI-compatible",
    () => createRouter({ ...env, AI_PROVIDER: "gemini", GEMINI_MODEL: "models/this-model-does-not-exist", AI_FALLBACK_PROVIDER: "openai", AI_PROVIDER_RETRIES: "0" })
  );
} else {
  report("Test 3: Gemini primary + fallback", false, "skipped â€” needs GEMINI_API_KEY and OPENAI_API_KEY");
}

if (has("OPENROUTER_API_KEY") && has("OPENAI_API_KEY")) {
  await run(
    "Test 4: OpenRouter primary + OpenAI fallback (fault injection: bad OpenRouter model)",
    "OpenRouter -> OpenAI-compatible",
    () => createRouter({ ...env, AI_PROVIDER: "openrouter", OPENROUTER_MODEL: "bad/provider-does-not-exist:free", AI_FALLBACK_PROVIDER: "openai", AI_PROVIDER_RETRIES: "0" })
  );
} else {
  report("Test 4: OpenRouter primary + fallback", false, "skipped â€” needs OPENROUTER_API_KEY and OPENAI_API_KEY");
}

console.log("\nUnit tests already cover: Test 5/6 (missing keys), Test 7 (both unavailable), error normalization, retries, vision routing, Gemini/OpenRouter message conversion (node --test).\n");

if (has("GEMINI_API_KEY") && has("OPENROUTER_API_KEY")) {
  console.log("=== Model comparison (same prompt, both providers) ===");
  for (const [label, cfg] of [
    ["Gemini", { ...env, AI_PROVIDER: "gemini", AI_FALLBACK_PROVIDER: "none" }],
    ["OpenRouter", { ...env, AI_PROVIDER: "openrouter", AI_FALLBACK_PROVIDER: "none" }],
  ]) {
    try {
      const router = createRouter(cfg);
      const out = await router.generate([{ role: "user", content: PROMPT }]);
      console.log(`\n--- ${label} ---\n${(out.content || "").trim()}`);
    } catch (err) {
      console.log(`\n--- ${label} --- FAILED: ${err.message.slice(0, 160)}`);
    }
  }
} else {
  console.log("Model comparison skipped â€” needs both GEMINI_API_KEY and OPENROUTER_API_KEY.");
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
process.exit(failed.some((r) => r.detail && !r.detail.startsWith("skipped")) ? 1 : 0);
