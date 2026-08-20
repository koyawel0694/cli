                                                       
                                                                               
                                                                   

import fs from "fs/promises";
import path from "path";

export const MAX_NOTE_SIZE = 200 * 1024;
export const EXCERPT_CHARS = 500;
export const DEFAULT_MAX_NOTES = 6;
export const DEFAULT_MAX_CHARS = 4000;

const SKIP_DIRS = new Set([".obsidian", ".trash", ".git", "node_modules", ".cache"]);
const NOTE_EXT = new Set([".md", ".markdown"]);

                                                              

const YAML_LIST_ITEM = /^\s*-\s+(.+)$/;
const YAML_KEY_VALUE = /^([A-Za-z0-9_\-]+)\s*:\s*(.*)$/;

function splitList(value) {
  return value
    .replace(/^\[|\]$/g, "")
    .split(",")
    .map((s) => s.trim().replace(/^["']|["']$/g, ""))
    .filter(Boolean);
}

                                                                                
                                                                                
                                          
export function parseFrontmatter(text) {
  const src = String(text || "").replace(/^\uFEFF/, "");
  const m = /^---\s*\r?\n([\s\S]*?)\r?\n---/.exec(src);
  if (!m) return null;
  const body = m[1];
  const out = { title: "", tags: [], aliases: [] };
  let currentKey = null;
  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const item = YAML_LIST_ITEM.exec(line);
    if (item && currentKey) {
      const val = item[1].trim().replace(/^["']|["']$/g, "");
      if (currentKey === "tags") out.tags.push(val);
      else if (currentKey === "aliases") out.aliases.push(val);
      continue;
    }
    const kv = YAML_KEY_VALUE.exec(line);
    if (!kv) continue;
    currentKey = kv[1].toLowerCase();
    const value = kv[2].trim();
    if (currentKey === "title" && !out.title) out.title = value.replace(/^["']|["']$/g, "");
    else if (currentKey === "tags") out.tags.push(...splitList(value));
    else if (currentKey === "aliases") out.aliases.push(...splitList(value));
  }
  out.tags = [...new Set(out.tags)];
  out.aliases = [...new Set(out.aliases)];
  return out;
}

                                                              

const WIKILINK = /\[\[([^\]|#]+?)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g;

                                                                              
export function extractLinks(text) {
  const links = [];
  const src = String(text || "");
  let m;
  while ((m = WIKILINK.exec(src)) !== null) {
    const target = m[1].trim();
    const alias = (m[2] || "").trim();
    if (!target) continue;
    links.push({ target, alias: alias || null });
  }
  return links;
}

                                                              

function stripFrontmatter(text) {
  return String(text || "").replace(/^\uFEFF/, "").replace(/^---\s*\r?\n[\s\S]*?\r?\n---/, "").trim();
}

                                                                      
                                             
export async function scanVault(vaultPath, opts = {}) {
  const root = path.resolve(vaultPath);
  const stat = await fs.stat(root);
  if (!stat.isDirectory()) throw new Error("Vault path is not a folder");
  const notes = [];
  const maxSize = opts.maxNoteSize || MAX_NOTE_SIZE;
  const excerptChars = opts.excerptChars || EXCERPT_CHARS;

  async function walk(dir, rel) {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".") && SKIP_DIRS.has(entry.name)) continue;
      if (SKIP_DIRS.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      const relPath = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await walk(full, relPath);
      else if (NOTE_EXT.has(path.extname(entry.name).toLowerCase())) {
        try {
          const st = await fs.stat(full);
          if (st.size > maxSize) continue;
          const raw = await fs.readFile(full, "utf8");
          const front = parseFrontmatter(raw);
          const body = stripFrontmatter(raw);
          const links = extractLinks(raw);
          const title = front?.title || entry.name.replace(/\.(md|markdown)$/i, "");
          notes.push({
            path: relPath,
            name: entry.name,
            title,
            tags: front?.tags || [],
            aliases: front?.aliases || [],
            links: links.map((l) => l.target),
            linkCount: links.length,
            size: st.size,
            updatedAt: st.mtimeMs,
            excerpt: body.replace(/\s+/g, " ").slice(0, excerptChars),
          });
        } catch {
                                                            
        }
      }
    }
  }
  await walk(root, "");
  notes.sort((a, b) => b.updatedAt - a.updatedAt);
  return {
    notes,
    stats: { totalNotes: notes.length, totalBytes: notes.reduce((n, x) => n + x.size, 0) },
  };
}

                                                              

function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1);
}

function scoreNote(note, tokens) {
  let score = 0;
  const title = String(note.title || "").toLowerCase();
  const excerpt = String(note.excerpt || "").toLowerCase();
  for (const tok of tokens) {
    if (title.includes(tok)) score += 10;
    if (note.tags.some((t) => t.toLowerCase().includes(tok))) score += 8;
    if (note.aliases.some((a) => a.toLowerCase().includes(tok))) score += 6;
    if (note.links.some((l) => l.toLowerCase().includes(tok))) score += 4;
    if (excerpt.includes(tok)) score += 1;
  }
  return score;
}

                                                                        
                                      
export function searchNotes(notes, query, opts = {}) {
  const tokens = tokenize(query);
  if (!tokens.length) return [];
  const limit = opts.limit || 50;
  return notes
    .map((note) => ({ note, score: scoreNote(note, tokens) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || b.note.updatedAt - a.note.updatedAt)
    .slice(0, limit);
}

                                                                           
                                                                        
export function pickRelevant(notes, task, opts = {}) {
  const maxNotes = opts.maxNotes || DEFAULT_MAX_NOTES;
  const maxChars = opts.maxChars || DEFAULT_MAX_CHARS;
  const ranked = task ? searchNotes(notes, task, { limit: maxNotes }) : [];
  const chosen = ranked.length
    ? ranked.map((r) => r.note)
    : [...notes].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, maxNotes);
  const out = [];
  let used = 0;
  for (const note of chosen) {
    const block = `${note.title}: ${note.excerpt}`;
    const add = Math.min(block.length, maxChars - used);
    if (add <= 0) break;
    out.push({ note, block: block.slice(0, add) });
    used += add;
    if (out.length >= maxNotes) break;
  }
  return out;
}

                                                              

export function makeVaultId(name, vaultPath) {
  const seed = `${name}::${vaultPath}`;
  let hash = 0;
  for (const ch of seed) hash = (hash * 31 + ch.codePointAt(0)) >>> 0;
  return String(hash % 100000);
}