const NEXUS_API_BASE = window.NEXUS_API_BASE || "http://127.0.0.1:8000";
const providers = [
  {id:"anthropic",name:"Claude",modelLabel:"Anthropic API",letter:"C",className:"claude",description:"Engineering, implementation, and code review."},
  {id:"openai",name:"ChatGPT",modelLabel:"OpenAI API",letter:"O",className:"openai",description:"Planning, orchestration, and reasoning."},
  {id:"gemini",name:"Gemini",modelLabel:"Google AI API",letter:"G",className:"gemini",description:"Research, analysis, and independent review."},
  {id:"ollama",name:"Ollama Cloud",modelLabel:"Hosted Ollama API",letter:"◎",className:"ollama",description:"Additional hosted models for analysis and coding."}
];
let backendHealthy = false;
let providerStatus = {};
let currentView = "overview";

const $ = (id) => document.getElementById(id);
const escapeHTML = (value) => String(value).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function toast(message, type="") {
  const el = document.createElement("div");
  el.className = "toast " + type;
  el.textContent = message;
  $("toastRegion").appendChild(el);
  window.setTimeout(() => el.remove(), 4200);
}
function goTo(view) {
  currentView = view;
  document.querySelectorAll(".view").forEach(el => el.classList.toggle("active-view", el.id === "view-" + view));
  document.querySelectorAll(".nav-item").forEach(el => el.classList.toggle("active", el.dataset.view === view));
  const active = document.querySelector('[data-view="' + view + '"]');
  $("pageName").textContent = active ? active.textContent.trim() : ({overview:"Overview",chat:"AI team chat",projects:"Repositories",workflows:"Workflows",activity:"Activity log",providers:"AI providers",settings:"Settings"}[view] || "Overview");
  if (view === "providers") renderProviderSettings();
  if (view === "chat") renderParticipants();
  window.scrollTo({top:0,behavior:matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth"});
}
function providerRow(p, compact=false) {
  const connected = Boolean(providerStatus[p.id]?.configured);
  const label = connected ? "Configured" : "Not configured";
  return '<div class="provider-row"><div class="provider-logo '+p.className+'">'+p.letter+'</div><div class="provider-info"><strong>'+p.name+'</strong><small>'+p.modelLabel+'</small></div><div class="provider-status"><span class="status-dot '+(connected?"good":"neutral")+'"></span>'+label+'</div></div>';
}
function renderProviders() {
  $("providerList").innerHTML = providers.map(p => providerRow(p)).join("");
  const connected = providers.filter(p => providerStatus[p.id]?.configured).length;
  $("providerCount").innerHTML = connected + '<span class="stat-unit"> / 4</span>';
  $("setupTitle").textContent = connected ? connected + " provider(s) configured" : "Set up your workspace";
  $("setupDescription").textContent = connected ? "Provider credentials are configured on the backend. Run a connection test before using an agent." : "Connect the backend and configure provider credentials to start real AI conversations. This UI does not simulate connected services.";
  renderProviderSettings();
  renderParticipants();
}
function renderProviderSettings() {
  if (!$("providerSettings")) return;
  $("providerSettings").innerHTML = providers.map(p => {
    const configured = Boolean(providerStatus[p.id]?.configured);
    const extra = p.id === "ollama" ? "Uses Ollama Cloud's hosted API. Add OLLAMA_API_KEY on the backend; no local Ollama installation is required." : p.description;
    return '<article class="provider-setting"><div class="provider-setting-head"><div class="provider-logo '+p.className+'">'+p.letter+'</div><div><h3>'+p.name+'</h3><p>'+p.modelLabel+'</p></div></div><p>'+extra+'</p><div class="setting-bottom"><span class="setting-value">'+(configured?"KEY CONFIGURED":"KEY NOT CONFIGURED")+'</span><button class="subtle-button test-provider" data-provider="'+p.id+'" '+(!backendHealthy||!configured?"disabled":"")+'>'+(configured?"Test connection":"Setup required")+'</button></div></article>';
  }).join("");
  document.querySelectorAll(".test-provider").forEach(btn => btn.addEventListener("click", async () => {
    try {
      const response = await fetch(NEXUS_API_BASE + "/api/providers/" + btn.dataset.provider + "/test", {method:"POST"});
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Connection test failed");
      toast(data.message || "Provider connection verified.");
    } catch (err) { toast(err.message || "Provider test failed.", "error"); }
  }));
}
function renderParticipants() {
  if (!$("chatParticipants")) return;
  $("chatParticipants").innerHTML = providers.map(p => providerRow(p, true)).join("");
}
async function refreshStatus() {
  $("connectionText").textContent = "Checking backend…";
  try {
    const response = await fetch(NEXUS_API_BASE + "/api/status", {signal:AbortSignal.timeout(3500)});
    if (!response.ok) throw new Error("Backend unavailable");
    const data = await response.json();
    backendHealthy = true;
    providerStatus = data.providers || {};
    $("connectionText").textContent = "Backend connected";
    $("connectionText").previousElementSibling.classList.add("good");
    $("systemStatus").textContent = "Backend connected";
    $("systemStatus").previousElementSibling.classList.add("good");
    $("repoCount").textContent = String(data.repository_count ?? 0);
    $("runCount").textContent = String(data.active_runs ?? 0);
    $("attentionCount").textContent = String(data.attention_count ?? 0);
    $("repoSubtext").textContent = (data.repository_count ?? 0) + " connected repository connections.";
  } catch {
    backendHealthy = false;
    providerStatus = {};
    $("connectionText").textContent = "Backend offline";
    $("connectionText").previousElementSibling.classList.remove("good");
    $("systemStatus").textContent = "Backend offline";
    $("systemStatus").previousElementSibling.classList.remove("good");
  }
  renderProviders();
}
async function submitChat(message) {
  if (!message.trim()) return;
  if (!backendHealthy) { toast("Start the Nexus backend first. No message was sent.", "error"); return; }
  const box = $("chatMessages");
  const empty = box.querySelector(".empty-chat");
  if (empty) empty.remove();
  const user = document.createElement("div");
  user.className = "message-bubble user-message";
  user.style.cssText = "max-width:90%;margin:0 0 16px auto;padding:12px 14px;border:1px solid #34402a;background:#1b2118;border-radius:12px;color:#eaf3df;font-size:12px;white-space:pre-wrap";
  user.textContent = message;
  box.appendChild(user);
  const status = document.createElement("div");
  status.className = "message-bubble";
  status.style.cssText = "padding:12px 14px;margin-bottom:15px;border:1px solid #2d3340;background:#151923;border-radius:12px;color:#aab3c3;font-size:11px";
  status.textContent = "Submitting to the orchestrator…";
  box.appendChild(status);
  box.scrollTop = box.scrollHeight;
  try {
    const response = await fetch(NEXUS_API_BASE + "/api/chat", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({message,mode:"discuss"})});
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || "Chat request failed");
    status.textContent = data.message || "Task accepted. Check workflow status for progress.";
  } catch (err) {
    status.textContent = "Not sent: " + (err.message || "request failed");
    status.style.borderColor = "#62413f";
  }
  $("chatInput").value = "";
}
document.querySelectorAll("[data-view]").forEach(btn => btn.addEventListener("click", () => goTo(btn.dataset.view)));
document.querySelectorAll("[data-go]").forEach(btn => btn.addEventListener("click", () => goTo(btn.dataset.go)));
$("newChat").addEventListener("click", () => { goTo("chat"); $("chatTitle").textContent = "New team discussion"; $("chatInput").focus(); });
$("refreshButton").addEventListener("click", refreshStatus);
$("reloadRepos").addEventListener("click", async () => {
  if (!backendHealthy) return toast("Start the backend to load repositories.", "error");
  try {
    const response = await fetch(NEXUS_API_BASE + "/api/github/repositories");
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || "Could not load repositories");
    const repos = data.repositories || [];
    $("repoCount").textContent = String(repos.length);
    $("repoSubtext").textContent = repos.length + " repositories returned by the connected GitHub integration.";
    $("repoEmpty").style.display = repos.length ? "none" : "block";
    $("repoGrid").innerHTML = repos.map(repo => '<article class="repo-card"><h3>'+escapeHTML(repo.full_name || repo.name)+'</h3><p>'+escapeHTML(repo.description || "No description")+'</p><span class="setting-value">'+escapeHTML(repo.private?"PRIVATE":"PUBLIC")+'</span></article>').join("");
  } catch (err) { toast(err.message || "Could not load repositories.", "error"); }
});
function connectGithub() { toast("GitHub App OAuth is not implemented yet. The repository integration must be configured server-side before access is granted.", "error"); }
$("connectGithubTop").addEventListener("click", connectGithub);
$("connectGithubMain").addEventListener("click", connectGithub);
$("startTask").addEventListener("click", async () => {
  const message = $("quickTask").value.trim();
  if (!message) return toast("Describe the outcome you want first.", "error");
  if ($("quickMode").value === "build") return toast("Build mode is locked until isolated execution and GitHub permissions are configured.", "error");
  goTo("chat");
  await submitChat(message);
});
$("chatForm").addEventListener("submit", async e => { e.preventDefault(); await submitChat($("chatInput").value); });
$("chatInput").addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("chatForm").requestSubmit(); } });
refreshStatus();
