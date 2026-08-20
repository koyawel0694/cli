export const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

async function handle(res) {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${res.status})`);
  }
  return res.json();
}

export async function checkHealth() {
  try {
    const res = await fetch(`${API_URL}/api/health`);
    return res.ok;
  } catch {
    return false;
  }
}

export async function getExperiments() {
  return handle(await fetch(`${API_URL}/api/experiments`));
}

export async function getExperiment(id) {
  return handle(await fetch(`${API_URL}/api/experiments/${id}`));
}

export async function createExperiment(task, projectId, image) {
  return handle(
    await fetch(`${API_URL}/api/experiments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ task, projectId, image }),
    }),
  );
}

export async function deleteExperiment(id) {
  return handle(
    await fetch(`${API_URL}/api/experiments/${id}`, { method: "DELETE" }),
  );
}

export async function replyExperiment(id, message) {
  return handle(
    await fetch(`${API_URL}/api/experiments/${id}/reply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    }),
  );
}

export async function getProjects() {
  return handle(await fetch(`${API_URL}/api/projects`));
}

export async function addProject(name, path) {
  return handle(
    await fetch(`${API_URL}/api/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, path }),
    }),
  );
}

export async function deleteProject(id) {
  return handle(
    await fetch(`${API_URL}/api/projects/${id}`, { method: "DELETE" }),
  );
}

export async function refreshProject(id) {
  return handle(await fetch(`${API_URL}/api/projects/${id}/scan`));
}

export async function getProjectFiles(id, q = "") {
  return handle(
    await fetch(
      `${API_URL}/api/projects/${id}/files?q=${encodeURIComponent(q)}`,
    ),
  );
}

export async function searchProject(id, q) {
  return handle(
    await fetch(
      `${API_URL}/api/projects/${id}/search?q=${encodeURIComponent(q)}`,
    ),
  );
}

export async function getProjectFile(id, relPath) {
  return handle(
    await fetch(
      `${API_URL}/api/projects/${id}/file?path=${encodeURIComponent(relPath)}`,
    ),
  );
}

export async function explainCode(projectId, path, selection) {
  return handle(
    await fetch(`${API_URL}/api/explain`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, path, selection }),
    }),
  );
}

export async function applyFix(id) {
  return handle(
    await fetch(`${API_URL}/api/experiments/${id}/apply-fix`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    }),
  );
}

export async function previewFix(id) {
  return handle(
    await fetch(`${API_URL}/api/experiments/${id}/apply-fix?preview=true`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    }),
  );
}

export async function getMemory() {
  return handle(await fetch(`${API_URL}/api/memory`));
}

export async function saveGlobalMemory(notes) {
  return handle(
    await fetch(`${API_URL}/api/memory/global`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes }),
    }),
  );
}

export async function saveProjectMemory(projectId, notes) {
  return handle(
    await fetch(`${API_URL}/api/memory/projects/${projectId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes }),
    }),
  );
}

export async function learnProjectMemory(projectId) {
  return handle(
    await fetch(`${API_URL}/api/memory/projects/${projectId}/learn`, {
      method: "POST",
    }),
  );
}

export async function approveExperiment(id, approvalId, decision) {
  return handle(
    await fetch(`${API_URL}/api/experiments/${id}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approvalId, decision }),
    }),
  );
}

export async function rollbackFix(id) {
  return handle(
    await fetch(`${API_URL}/api/experiments/${id}/rollback`, {
      method: "POST",
    }),
  );
}

export async function cancelExperiment(id) {
  return handle(
    await fetch(`${API_URL}/api/experiments/${id}/cancel`, {
      method: "POST",
    }),
  );
}

export async function editExperimentMessage(id, index, content, redo = false) {
  return handle(
    await fetch(`${API_URL}/api/experiments/${id}/messages/${index}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, redo }),
    }),
  );
}

export async function getSettings() {
  return handle(await fetch(`${API_URL}/api/settings`));
}

export async function getAutomation() {
  return handle(await fetch(`${API_URL}/api/automation`));
}

export async function saveAutomation(config) {
  return handle(
    await fetch(`${API_URL}/api/automation`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    }),
  );
}

export async function runAutomation() {
  return handle(
    await fetch(`${API_URL}/api/automation/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    }),
  );
}

export async function saveSettings(trustLevel) {
  return handle(
    await fetch(`${API_URL}/api/settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trustLevel }),
    }),
  );
}

export async function getBridge() {
  return handle(await fetch(`${API_URL}/api/bridge`));
}

export async function saveBridge(config) {
  return handle(
    await fetch(`${API_URL}/api/bridge`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    }),
  );
}

export async function testBridge(config) {
  return handle(
    await fetch(`${API_URL}/api/bridge/test`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    }),
  );
}

export async function getKnowledge() {
  return handle(await fetch(`${API_URL}/api/knowledge`));
}

export async function saveKnowledgeConfig(config) {
  return handle(
    await fetch(`${API_URL}/api/knowledge`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    }),
  );
}

export async function addVault(name, path) {
  return handle(
    await fetch(`${API_URL}/api/knowledge/vaults`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, path }),
    }),
  );
}

export async function removeVault(id) {
  return handle(
    await fetch(`${API_URL}/api/knowledge/vaults/${id}`, { method: "DELETE" }),
  );
}

export async function rescanKnowledge() {
  return handle(
    await fetch(`${API_URL}/api/knowledge/scan`, { method: "POST" }),
  );
}

export async function searchKnowledgeNotes(q) {
  return handle(
    await fetch(`${API_URL}/api/knowledge/notes?q=${encodeURIComponent(q)}`),
  );
}

export function parseFindings(markdown) {
  const lines = markdown.split("\n");
  const findings = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (
      trimmed.startsWith("🔴") ||
      trimmed.startsWith("🟡") ||
      trimmed.startsWith("🟢") ||
      /^(critical|warning|suggestion)[:\s-]/i.test(trimmed)
    ) {
      findings.push(trimmed);
    }
  }
  return findings;
}
