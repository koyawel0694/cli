import { test } from "node:test";
import assert from "node:assert/strict";
import { brainstorm } from "../brainstorm.js";

const candidates = (titles) => ({ candidates: titles.map((t) => ({ title: t, idea: `Idea for ${t}` })) });
const critiques = (titles, score) => ({
  critiques: titles.map((t) => ({
    title: t,
    feasibility: score,
    complexity: 10 - score,
    cost: 10 - score,
    reliability: score,
    scalability: score,
    security: score,
    score,
    notes: "ok",
  })),
});

function fakeAI({ scores = [8], clarify = null, needsTools = null, throwOn = null } = {}) {
  let call = 0;
  return async (messages) => {
    call++;
    if (throwOn && call === throwOn) throw new Error("simulated AI outage");
    const system = messages[0].content;
    if (clarify && call === 1) return { content: JSON.stringify({ clarify }) };
    if (needsTools && call === 1) return { content: JSON.stringify({ needs_tools: needsTools }) };
    if (system.startsWith("You are a senior engineer")) return { content: JSON.stringify(candidates(["A", "B", "C"])) };
    if (system.startsWith("You critique")) {
      const score = scores[Math.min(scores.length - 1, Math.floor((call - 1) / 2))];
      return { content: JSON.stringify(critiques(["A", "B", "C"], score)) };
    }
    return {
      content: `# Hard problem\n\n## Best solution\nDo A\n\n## Why\nIt works\n\n## Trade-offs\n- speed\n\n## Next steps\n1. build\n\n## Uncertainties\n- unknown\n\n## Confidence\n70%\n\n## Alternatives compared\n| A | 8 |`,
    };
  };
}

test("simple problem completes in 1 iteration when threshold met", async () => {
  const logs = [];
  const r = await brainstorm({
    problem: "How should I store user uploads?",
    callAI: fakeAI({ scores: [9] }),
    log: (m) => logs.push(m),
  });
  assert.equal(r.iterations.length, 1);
  assert.equal(r.iterations[0].bestScore, 9);
  assert.match(r.report, /Best solution/);
  assert.match(r.report, /## Confidence/);
  assert.equal(r.confidence, 70);
  assert.ok(logs.includes("skill started"));
  assert.ok(logs.includes("skill completed"));
});

test("iteration limit: maxIterations=1 never exceeds 1 round", async () => {
  const r = await brainstorm({
    problem: "Pick a database",
    config: { maxIterations: 1, stoppingThreshold: 10, numCandidates: 3 },
    callAI: fakeAI({ scores: [5] }),
  });
  assert.equal(r.iterations.length, 1);
});

test("iteration limit: maxIterations=3 never exceeds 3 rounds", async () => {
  const r = await brainstorm({
    problem: "Pick a database",
    config: { maxIterations: 3, stoppingThreshold: 10, numCandidates: 3 },
    callAI: fakeAI({ scores: [5, 6, 7] }),
  });
  assert.equal(r.iterations.length, 3);
});

test("stops early when a round stops improving", async () => {
  const r = await brainstorm({
    problem: "Pick a database",
    config: { maxIterations: 3, stoppingThreshold: 10, numCandidates: 3 },
    callAI: fakeAI({ scores: [5, 5, 5] }),
  });
  assert.equal(r.iterations.length, 2);
  assert.equal(r.iterations[1].improved, false);
});

test("ambiguous problem asks for clarification", async () => {
  const r = await brainstorm({
    problem: "Make it better",
    callAI: fakeAI({ clarify: "What are you building?" }),
  });
  assert.equal(r.clarification, "What are you building?");
  assert.equal(r.iterations.length, 0);
  assert.equal(r.report, "");
});

test("needs tools/web search stops instead of guessing", async () => {
  const r = await brainstorm({
    problem: "Which npm package is most maintained?",
    callAI: fakeAI({ needsTools: "web search to compare download stats" }),
  });
  assert.equal(r.needsTools, "web search to compare download stats");
  assert.equal(r.iterations.length, 0);
});

test("unsafe candidate gets score 0 and can never win", async () => {
  const r = await brainstorm({
    problem: "Store passwords",
    callAI: fakeAI({ scores: [0] }),
  });
  assert.equal(r.iterations[0].bestScore, 0);
});

test("config is clamped to sane bounds", async () => {
  const r = await brainstorm({
    problem: "Design a pipeline",
    config: { maxIterations: 99, stoppingThreshold: 0, numCandidates: 1 },
    callAI: fakeAI({ scores: [1] }),
  });
  assert.equal(r.config.maxIterations, 5);
  assert.equal(r.config.stoppingThreshold, 1);
  assert.equal(r.config.numCandidates, 2);
});

test("AI failure propagates as a descriptive error", async () => {
  await assert.rejects(
    brainstorm({
      problem: "Design a pipeline",
      callAI: fakeAI({ throwOn: 1 }),
    }),
    /could not generate candidates/
  );
});

test("garbage AI output is a descriptive error, not a crash", async () => {
  await assert.rejects(
    brainstorm({
      problem: "Design a pipeline",
      callAI: async () => ({ content: "sure, whatever" }),
    }),
    /did not return JSON/
  );
});

test("no problem given is rejected", async () => {
  await assert.rejects(brainstorm({ problem: "  ", callAI: fakeAI() }), /No problem/);
  await assert.rejects(brainstorm({ problem: "x" }), /callAI/);
});