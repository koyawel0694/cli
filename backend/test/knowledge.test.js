import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  parseFrontmatter,
  extractLinks,
  scanVault,
  searchNotes,
  pickRelevant,
  makeVaultId,
} from "../knowledge.js";

async function tmpVault(files) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "hermes-vault-"));
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(root, rel);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, content);
  }
  return root;
}

test("parseFrontmatter: title, tags and aliases", () => {
  const fm = parseFrontmatter(`---
title: My Note
tags: [react, hooks]
aliases: [use-thing, custom-hook]
---
Body here`);
  assert.equal(fm.title, "My Note");
  assert.deepEqual(fm.tags, ["react", "hooks"]);
  assert.deepEqual(fm.aliases, ["use-thing", "custom-hook"]);
});

test("parseFrontmatter: comma lists and multi-line list items", () => {
  const fm = parseFrontmatter(`---
tags: a, b
aliases:
  - first alias
  - "second alias"
---
Body`);
  assert.deepEqual(fm.tags, ["a", "b"]);
  assert.deepEqual(fm.aliases, ["first alias", "second alias"]);
});

test("parseFrontmatter: no frontmatter returns null", () => {
  assert.equal(parseFrontmatter("Just a note without frontmatter"), null);
});

test("parseFrontmatter: quoted title is unquoted", () => {
  const fm = parseFrontmatter(`---
title: "A \"Quoted\" Note"
---
Body`);
  assert.equal(fm.title, 'A "Quoted" Note');
});

test("parseFrontmatter: handles a UTF-8 BOM prefix (Windows editors)", () => {
  const fm = parseFrontmatter(`\uFEFF---
title: Bom Note
tags: [windows]
---
Body`);
  assert.equal(fm.title, "Bom Note");
  assert.deepEqual(fm.tags, ["windows"]);
});

test("extractLinks: plain, aliased and multi links", () => {
  const links = extractLinks("See [[React Hooks]] and [[useEffect|effect hook]] plus [[A#section|a]].");
  assert.deepEqual(links, [
    { target: "React Hooks", alias: null },
    { target: "useEffect", alias: "effect hook" },
    { target: "A", alias: "a" },
  ]);
});

test("extractLinks: empty brackets produce no links", () => {
  assert.deepEqual(extractLinks("No [[]] links here"), []);
});

test("scanVault: indexes md files, skips .obsidian and non-md", async () => {
  const root = await tmpVault({
    "Notes/React.md": `---
title: React Notes
tags: [react, ui]
---
React is a UI library. See [[Hooks]].`,
    "Notes/Hooks.md": "# Hooks\nuseState and useEffect.",
    ".obsidian/app.json": "{\"vault\": true}",
    "notes.txt": "not a note",
  });
  const { notes, stats } = await scanVault(root);
  assert.equal(stats.totalNotes, 2);
  assert.equal(stats.totalBytes > 0, true);
  const react = notes.find((n) => n.name === "React.md");
  assert.equal(react.title, "React Notes");
  assert.deepEqual(react.tags, ["react", "ui"]);
  assert.deepEqual(react.links, ["Hooks"]);
  assert.equal(react.linkCount, 1);
  assert.match(react.excerpt, /UI library/);
  const hooks = notes.find((n) => n.name === "Hooks.md");
  assert.equal(hooks.title, "Hooks");
  assert.equal(hooks.excerpt.includes("useState"), true);
  await fs.rm(root, { recursive: true, force: true });
});

test("scanVault: title falls back to filename without frontmatter", async () => {
  const root = await tmpVault({ "Plain.md": "no frontmatter" });
  const { notes } = await scanVault(root);
  assert.equal(notes[0].title, "Plain");
  await fs.rm(root, { recursive: true, force: true });
});

test("scanVault: nested folders get relative paths", async () => {
  const root = await tmpVault({ "a/b/c/Deep.md": "deep note" });
  const { notes } = await scanVault(root);
  assert.equal(notes[0].path, "a/b/c/Deep.md");
  await fs.rm(root, { recursive: true, force: true });
});

test("scanVault: missing path throws", async () => {
  await assert.rejects(() => scanVault(path.join(os.tmpdir(), "does-not-exist-xyz")), /not a folder|ENOENT/);
});

test("scanVault: oversized notes are skipped", async () => {
  const root = await tmpVault({ "Big.md": "x".repeat(1024) });
  const { notes } = await scanVault(root, { maxNoteSize: 100 });
  assert.equal(notes.length, 0);
  await fs.rm(root, { recursive: true, force: true });
});

test("searchNotes: title beats content, tags and aliases score", () => {
  const notes = [
    { title: "React Hooks", tags: ["react"], aliases: [], links: [], excerpt: "hooks in react", updatedAt: 1 },
    { title: "Deploy Guide", tags: ["devops"], aliases: ["shipping"], links: [], excerpt: "no hooks here", updatedAt: 2 },
    { title: "Styling", tags: [], aliases: [], links: [], excerpt: "inline hooks styling react", updatedAt: 3 },
  ];
  const hits = searchNotes(notes, "hooks");
  assert.equal(hits.length, 3);
  assert.equal(hits[0].note.title, "React Hooks");
  assert.ok(hits[0].score > hits[2].score);
  const byAlias = searchNotes(notes, "shipping");
  assert.equal(byAlias[0].note.title, "Deploy Guide");
  assert.equal(searchNotes(notes, "zzz-nothing").length, 0);
  assert.equal(searchNotes(notes, "").length, 0);
});

test("pickRelevant: respects maxNotes and maxChars budget", () => {
  const notes = Array.from({ length: 10 }, (_, i) => ({
    title: `Note ${i}`,
    tags: i % 2 ? ["react"] : [],
    aliases: [],
    links: [],
    excerpt: `content about hooks number ${i}`,
    updatedAt: i,
  }));
  const picks = pickRelevant(notes, "hooks", { maxNotes: 3, maxChars: 120 });
  assert.ok(picks.length <= 3);
  const total = picks.reduce((n, p) => n + p.block.length, 0);
  assert.ok(total <= 120);
  const chars = 1_000_000;
  const all = pickRelevant(notes, "hooks", { maxNotes: 10, maxChars: chars });
  assert.equal(all.length, 10);
  assert.ok(all.every((p) => p.block.length > 0));
});

test("pickRelevant: no task -> most recent notes, capped", () => {
  const notes = Array.from({ length: 10 }, (_, i) => ({
    title: `Note ${i}`, tags: [], aliases: [], links: [], excerpt: "x", updatedAt: i,
  }));
  const picks = pickRelevant(notes, "", { maxNotes: 4, maxChars: 100000 });
  assert.equal(picks.length, 4);
  assert.equal(picks[0].note.updatedAt, 9);
});

test("makeVaultId: stable and short", () => {
  const a = makeVaultId("My Vault", "C:/notes/obsidian");
  assert.equal(a, makeVaultId("My Vault", "C:/notes/obsidian"));
  assert.equal(String(a).length <= 5, true);
  assert.notEqual(a, makeVaultId("Other", "C:/notes/obsidian"));
});