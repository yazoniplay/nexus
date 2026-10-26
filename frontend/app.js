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
let githubConnected = false;
let githubConfigured = false;
let githubLogin = "";

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
  await refreshGithubConnection();
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
    const response = await fetch(NEXUS_API_BASE + "/api/chat", {method:"POST",headers:{"Content-Type":"application/json"},credentials:"include",body:JSON.stringify({message,mode:"discuss",repository:$("chatRepository")?.value || null})});
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || "Chat request failed");
    status.textContent = data.message || "No final response returned.";
    status.style.whiteSpace = "pre-wrap";
    status.style.lineHeight = "1.6";
    status.style.color = "#e7ebf3";
    if (Array.isArray(data.responses) && data.responses.length) {
      const summary = document.createElement("div");
      summary.textContent = "Independent agent responses · " + data.responses.length;
      summary.style.cssText = "font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#8995aa;margin:16px 0 8px";
      box.appendChild(summary);
      data.responses.forEach(item => {
        const card = document.createElement("details");
        card.style.cssText = "margin:8px 0 10px;padding:10px 12px;border:1px solid #2d3340;background:#11151d;border-radius:10px;color:#cbd3e1;font-size:12px";
        const heading = document.createElement("summary");
        heading.style.cssText = "cursor:pointer;color:#e5eaf3;font-weight:600";
        heading.textContent = (item.provider || "AI agent").toUpperCase() + " · " + (item.model || "model");
        const body = document.createElement("div");
        body.style.cssText = "padding-top:10px;white-space:pre-wrap;line-height:1.6;overflow-wrap:anywhere";
        body.textContent = item.text || "No response text.";
        card.append(heading, body);
        box.appendChild(card);
      });
    }
    if (Array.isArray(data.failed) && data.failed.length) {
      const warning = document.createElement("div");
      warning.style.cssText = "margin:8px 0;padding:10px;border:1px solid #62413f;border-radius:9px;color:#e7b6ad;font-size:11px";
      warning.textContent = data.failed.length + " provider or synthesis operation(s) failed. Some responses may be missing.";
      box.appendChild(warning);
    }
    if (data.execution_note) {
      const note = document.createElement("div");
      note.style.cssText = "margin-top:10px;color:#d6b980;font-size:11px";
      note.textContent = data.execution_note;
      box.appendChild(note);
    }
    box.scrollTop = box.scrollHeight;
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
    const response = await fetch(NEXUS_API_BASE + "/api/github/repositories", {credentials:"include"});
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || "Could not load repositories");
    const repos = data.repositories || [];
    $("repoCount").textContent = String(repos.length);
    $("repoSubtext").textContent = repos.length + " repositories returned by the connected GitHub integration.";
    $("repoEmpty").style.display = repos.length ? "none" : "block";
    $("repoGrid").innerHTML = repos.map(repo => '<article class="repo-card"><h3>'+escapeHTML(repo.full_name || repo.name)+'</h3><p>'+escapeHTML(repo.description || "No description")+'</p><span class="setting-value">'+escapeHTML(repo.private?"PRIVATE":"PUBLIC")+'</span></article>').join("");
  } catch (err) { toast(err.message || "Could not load repositories.", "error"); }
});
async function refreshGithubConnection() {
  try {
    const response = await fetch(NEXUS_API_BASE + "/api/github/connection", {credentials:"include", signal:AbortSignal.timeout(4000)});
    const data = await response.json();
    githubConnected = Boolean(response.ok && data.connected);
    githubConfigured = Boolean(data.configured);
    githubLogin = data.login || "";
    $("connectGithubTop").textContent = githubConnected ? "Connected · " + githubLogin : "Connect GitHub ↗";
    $("connectGithubMain").textContent = githubConnected ? "GitHub connected: " + githubLogin : "Connect GitHub";
    $("githubAccountLabel").textContent = githubConnected ? "Connected as " + githubLogin : "No GitHub account connected.";
    if (githubConnected) loadRepositories();
  } catch {
    githubConnected = false;
    githubLogin = "";
  }
}
async function loadRepositories() {
  if (!backendHealthy || !githubConnected) return;
  try {
    const response = await fetch(NEXUS_API_BASE + "/api/github/repositories", {credentials:"include"});
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || "Could not load repositories");
    const repos = data.repositories || [];
    $("repoCount").textContent = String(repos.length);
    $("repoSubtext").textContent = repos.length + " repositories accessible to " + githubLogin + ".";
    $("chatRepository").innerHTML = '<option value="">No repository selected</option>' + repos.map(repo => '<option value="' + escapeHTML(repo.full_name) + '">' + escapeHTML(repo.full_name) + '</option>').join("");
    $("repoEmpty").style.display = repos.length ? "none" : "block";
    $("repoGrid").innerHTML = repos.map(repo => '<article class="repo-card"><h3>'+escapeHTML(repo.full_name || repo.name)+'</h3><p>'+escapeHTML(repo.description || "No description")+'</p><span class="setting-value">'+escapeHTML(repo.private?"PRIVATE":"PUBLIC")+'</span><a href="'+escapeHTML(repo.html_url || "#")+'" target="_blank" rel="noopener noreferrer">Open repository ↗</a></article>').join("");
  } catch (err) { toast(err.message || "Could not load repositories.", "error"); }
}
function connectGithub() {
  if (!backendHealthy) return toast("Start the Nexus backend first.", "error");
  if (!githubConfigured) return toast("GitHub OAuth is not configured on the backend yet. Follow the GitHub setup section in the repository README.", "error");
  window.location.href = NEXUS_API_BASE + "/api/github/connect";
}
$("connectGithubTop").addEventListener("click", connectGithub);
$("connectGithubMain").addEventListener("click", connectGithub);
$("disconnectGithub").addEventListener("click", async () => {
  try {
    const response = await fetch(NEXUS_API_BASE + "/api/github/disconnect", {method:"POST",credentials:"include"});
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || "Disconnect failed");
    githubConnected = false;
    githubLogin = "";
    $("connectGithubTop").textContent = "Connect GitHub ↗";
    $("connectGithubMain").textContent = "Connect GitHub";
    $("githubAccountLabel").textContent = "No GitHub account connected.";
    $("repoCount").textContent = "0";
    $("repoGrid").innerHTML = "";
    $("repoEmpty").style.display = "block";
    toast("GitHub disconnected.");
  } catch (err) { toast(err.message || "Could not disconnect GitHub.", "error"); }
});
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
