const NEXUS_AI_URL="https://kuvyaytptnghopqbykab.supabase.co/functions/v1/nexus-ai";
const $=id=>document.getElementById(id);
const PROVIDERS=[
 {id:"gemini",name:"Gemini",letter:"G"},
 {id:"gemma4",name:"Gemma 4",letter:"G"},
 {id:"qwen_ollama",name:"Qwen (Ollama)",letter:"Q"},
 {id:"deepseek",name:"DeepSeek",letter:"D"}
];
const STORAGE_KEY="nexus.chats.v2";
let providerStatus={};
let chats=[];
let activeChatId=null;
let sending=false;
let buildMode=false;
let pendingImages=[];
const MAX_IMAGES=4, MAX_IMAGE_BYTES=500*1024;
let executionMode=localStorage.getItem("nexus.build.mode")||"pull_request";
let effortLevel=localStorage.getItem("nexus.build.effort")||"medium";
let repositories=[];
let selectedRepo=localStorage.getItem("nexus.github.repo")||"";
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,8);
const escapeHTML=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function toast(message,error=false){const el=document.createElement("div");el.className="toast"+(error?" error":"");el.textContent=message;$("toastRegion").appendChild(el);setTimeout(()=>el.remove(),4500);}
function activeChat(){return chats.find(c=>c.id===activeChatId)||null;}
function saveChats(){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(chats));}catch{}}
function loadChats(){try{const saved=JSON.parse(localStorage.getItem(STORAGE_KEY)||"[]");if(Array.isArray(saved))chats=saved.filter(c=>c&&c.id&&Array.isArray(c.messages));}catch{chats=[];}if(chats.length){activeChatId=chats[0].id;}renderHistory();renderMessages();}
function renderHistory(){
 const host=$("chatHistory");
 if(!chats.length){host.innerHTML='<div class="history-empty">Your conversations will appear here.</div>';return;}
 host.innerHTML=chats.map(c=>'<div class="history-row"><button class="history-item '+(c.id===activeChatId?"active":"")+'" data-chat-id="'+escapeHTML(c.id)+'"><span class="history-icon">◷</span><span class="history-title">'+escapeHTML(c.title||"New chat")+'</span></button><button class="delete-chat" data-delete-chat="'+escapeHTML(c.id)+'" aria-label="Delete chat" title="Delete chat">×</button></div>').join("");
 host.querySelectorAll("[data-chat-id]").forEach(btn=>btn.addEventListener("click",()=>{activeChatId=btn.dataset.chatId;renderHistory();renderMessages();closeSidebar();}));
 host.querySelectorAll("[data-delete-chat]").forEach(btn=>btn.addEventListener("click",e=>{e.stopPropagation();deleteChat(btn.dataset.deleteChat);}));
}
function renderProviders(){
 const list=PROVIDERS.map(p=>{
   const configured=Boolean(providerStatus[p.id]?.configured);
   const label=configured?"Connected":"Not set up";
   return '<div class="provider-mini"><span class="provider-letter">'+p.letter+'</span><span class="provider-name">'+p.name+'</span><span class="provider-state '+(configured?"online":"")+'">'+label+'</span></div>';
 }).join("");
 $("sidebarProviders").innerHTML=list;
 $("welcomeProviders").innerHTML=PROVIDERS.filter(p=>providerStatus[p.id]?.configured).map(p=>'<span class="ai-pill"><span class="provider-letter">'+p.letter+'</span>'+p.name+'<i class="pill-dot online"></i></span>').join("");
 const count=PROVIDERS.filter(p=>providerStatus[p.id]?.configured).length;
 $("connectionText").textContent=count?count+" AI"+(count===1?"":"s")+" connected":"No AIs connected";
 $("connectionDot").className=count?"online":"offline";
}
async function refreshStatus(){
 $("connectionText").textContent="Checking AIs…";$("connectionDot").className="";
 try{const r=await fetch(NEXUS_AI_URL,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"status"})});const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data.error||"Status request failed");providerStatus=data.providers||{};renderProviders();}
 catch(e){providerStatus={};renderProviders();$("connectionText").textContent="AI gateway unavailable";$("connectionDot").className="offline";toast(e.message||"Could not reach the AI gateway.",true);}
}
async function refreshRepos(){
 const select=$("repoSelect"),hint=$("repoHint"),button=$("refreshRepos");
 if(!select||!hint)return;
 button.disabled=true;hint.className="repo-hint";hint.textContent="Loading repositories…";
 try{
   const r=await fetch(NEXUS_AI_URL,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"github_repos"})});
   const data=await r.json().catch(()=>({}));
   if(!r.ok)throw new Error(data.error||"Could not load GitHub repositories.");
   repositories=Array.isArray(data.repositories)?data.repositories:[];
   select.innerHTML='<option value="">No repository selected</option>'+repositories.map(repo=>'<option value="'+escapeHTML(repo.full_name)+'">'+escapeHTML(repo.full_name)+(repo.private?' · private':'')+'</option>').join("");
   if(selectedRepo&&repositories.some(repo=>repo.full_name===selectedRepo))select.value=selectedRepo;
   else {selectedRepo="";localStorage.removeItem("nexus.github.repo");}
   updateRepoHint();
 }catch(e){
   select.innerHTML='<option value="">No repository selected</option>';
   hint.className="repo-hint error";hint.textContent=e.message||"GitHub connection failed.";
 }finally{button.disabled=false;}
}
function updateRepoHint(){
 const hint=$("repoHint");
 if(!selectedRepo){hint.className="repo-hint";hint.textContent="Choose a repo to let AIs inspect its code.";return;}
 const repo=repositories.find(r=>r.full_name===selectedRepo);
 hint.className="repo-hint selected";hint.textContent=repo?"✓ Selected · "+(repo.default_branch||"default branch"):"Repository selected";
}
$("repoSelect").addEventListener("change",e=>{
 selectedRepo=e.target.value;
 if(selectedRepo)localStorage.setItem("nexus.github.repo",selectedRepo);else localStorage.removeItem("nexus.github.repo");
 updateRepoHint();
 toast(selectedRepo?"Repository selected. Its source files will be sent as context with your next message.":"Repository context turned off.");
});
$("refreshRepos").addEventListener("click",refreshRepos);
function deleteChat(id){const c=chats.find(x=>x.id===id);if(!c)return;if(!confirm('Delete "'+(c.title||"New chat")+'" and all messages?'))return;chats=chats.filter(x=>x.id!==id);if(activeChatId===id)activeChatId=chats[0]?.id||null;saveChats();renderHistory();renderMessages();toast("Chat deleted.");}
function newChat(){
 const c={id:uid(),title:"New chat",createdAt:Date.now(),messages:[]};
 chats.unshift(c);activeChatId=c.id;saveChats();renderHistory();renderMessages();$("chatInput").focus();closeSidebar();
}
function renderMessages(){
 const c=activeChat();const host=$("messages");const welcome=$("welcome");
 if(!c||!c.messages.length){welcome.hidden=false;host.innerHTML="";return;}
 welcome.hidden=true;
 host.innerHTML=c.messages.map(m=>{
   if(m.role==="user")return '<article class="message user"><div class="message-content">'+escapeHTML(m.text||"")+(Array.isArray(m.images)&&m.images.length?'<div class="message-images">'+m.images.map(src=>'<img src="'+src+'" alt="Uploaded image" loading="lazy">').join("")+'</div>':"")+'</div></article>';
   const p=PROVIDERS.find(x=>x.id===m.provider);
   const name=m.name||(p?p.name:(m.provider||"AI"));
   return '<article class="message '+(m.error?"error":"")+'"><div class="message-avatar">'+escapeHTML(p?.letter||name.slice(0,1).toUpperCase())+'</div><div class="message-content"><div class="message-label">'+escapeHTML(name)+' <span class="message-model">'+escapeHTML(m.model||"")+'</span></div><div class="message-text">'+formatText(m.text||"No response returned.")+'</div>'+renderBuildArtifacts(m.files,m.id,m.pr)+renderTeamDiscussion(m.team)+'</div></article>';
 }).join("");

 host.querySelectorAll("[data-build-action]").forEach(btn=>btn.addEventListener("click",()=>{
   const msg=activeChat()?.messages.find(item=>item.id===btn.dataset.buildMessage);
   const file=msg?.files?.[Number(btn.dataset.buildIndex)];
   if(!file)return;
   if(btn.dataset.buildAction==="copy"){
     if(!navigator.clipboard){toast("Clipboard unavailable in this browser.",true);return;}
     navigator.clipboard.writeText(file.content).then(()=>toast("Copied "+file.path)).catch(()=>toast("Could not access clipboard.",true));
   }else{
     const url=URL.createObjectURL(new Blob([file.content],{type:"text/plain;charset=utf-8"}));
     const link=document.createElement("a");link.href=url;link.download=file.path.split("/").pop()||"generated-file.txt";document.body.appendChild(link);link.click();link.remove();URL.revokeObjectURL(url);toast("Downloaded "+file.path);
   }
 }));
 scrollBottom();
}
function renderBuildArtifacts(files,messageId,pr){
 if(!Array.isArray(files)||!files.length)return "";
 const prPanel=pr&&pr.url?'<div class="build-file-head"><strong>Pull request #'+escapeHTML(pr.number||"")+'</strong><a href="'+escapeHTML(pr.url)+'" target="_blank" rel="noopener noreferrer">Review changes on GitHub ↗</a></div>':"";
 return '<div class="build-artifacts">'+prPanel+files.map((file,i)=>'<section class="build-file"><div class="build-file-head"><div><strong>'+escapeHTML(file.path)+'</strong><small>'+escapeHTML(file.reason||"Generated file")+'</small></div><div class="build-file-actions"><button type="button" data-build-action="copy" data-build-message="'+escapeHTML(messageId)+'" data-build-index="'+i+'">Copy</button><button type="button" data-build-action="download" data-build-message="'+escapeHTML(messageId)+'" data-build-index="'+i+'">Download</button></div></div><pre><code>'+escapeHTML(file.content)+'</code></pre></section>').join("")+'</div>';
}

function renderTeamDiscussion(team){
 if(!team||!Array.isArray(team.messages)||!team.messages.length)return "";
 const messages=team.messages.map(m=>'<article class="team-message"><div class="team-message-head"><strong>'+escapeHTML(m.provider||"AI")+'</strong><span>Round '+escapeHTML(m.round||"")+'</span></div><div>'+formatText(m.text||"")+'</div></article>').join("");
 return '<details class="team-discussion"><summary>Autonomous team discussion · '+team.messages.length+' messages across '+escapeHTML(team.rounds||0)+' rounds</summary><div class="team-discussion-body">'+messages+'</div></details>';
}

function formatText(text){
 // Normalize providers that escape Markdown markers, then escape all model content before formatting.
 const safe=escapeHTML(String(text??"").replace(/\\(\*)/g,"$1"));
 return safe.split(/\n{2,}/).map(part=>{
   if(part.startsWith("```")&&part.endsWith("```")){
     const code=part.replace(/^```[^\n]*\n?/,"").replace(/\n?```$/,"");
     return "<pre><code>"+code+"</code></pre>";
   }
   const formatted=part.replace(/\*\*(.+?)\*\*/g,"<strong>$1</strong>").replace(/~~(.+?)~~/g,"<del>$1</del>");
   return "<p>"+formatted.replace(/\n/g,"<br>")+"</p>";
 }).join("");
}
function scrollBottom(){const sc=$("chatScroll");requestAnimationFrame(()=>{sc.scrollTop=sc.scrollHeight;});}
function setSending(value){sending=value;$("sendButton").disabled=value;$("chatInput").disabled=value;$("composerHint").textContent=value?"Waiting for every configured AI…":"Enter to send · Shift + Enter for a new line";}
function appendMessage(message){const c=activeChat();if(!c)return;c.messages.push(message);saveChats();renderHistory();renderMessages();}
function titleFrom(text){const t=text.replace(/\s+/g," ").trim();return t.length>36?t.slice(0,36).trim()+"…":t||"New chat";}
async function sendMessage(raw){
 const text=raw.trim();if((!text&&!pendingImages.length)||sending)return;
 const images=pendingImages.map(item=>({mimeType:item.mimeType,data:item.data}));
 const visibleImages=pendingImages.map(item=>item.dataUrl);
 pendingImages=[];renderImageAttachments();
 if(!activeChat())newChat();
 const chat=activeChat();
 if(!chat.messages.some(m=>m.role==="user"))chat.title=titleFrom(text);
 appendMessage({id:uid(),role:"user",text,images:visibleImages,at:Date.now()});
 $("chatInput").value="";resizeInput();setSending(true);
 const pending=document.createElement("article");pending.className="message";pending.id="pendingMessage";
 pending.innerHTML='<div class="message-avatar">N</div><div class="message-content"><div class="message-label">Nexus <span class="message-model">Waiting for responses</span></div><div class="loading-dots" aria-label="AI models are responding"><i></i><i></i><i></i></div></div>';
 $("messages").appendChild(pending);$("welcome").hidden=true;scrollBottom();
 try{
   const r=await fetch(NEXUS_AI_URL,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:buildMode?"build":"chat",message:text,images:buildMode?[]:images,repo:selectedRepo,mode:executionMode,effort:effortLevel})});
   const data=await r.json().catch(()=>({}));
   if(!r.ok)throw new Error(data.error||data.message||"AI request failed ("+r.status+")");
   if(buildMode){
     const build=data.build;
     if(!build)throw new Error("The gateway returned no build result.");
     const files=Array.isArray(build.files)?build.files:[];
     appendMessage({id:uid(),role:"assistant",provider:"nexus",name:"Nexus Build",text:String(build.summary||"Build generated.")+(files.length?(build.mode==="pull_request"?"\n\nCommitted to branch "+(build.branch||"")+" and opened PR "+(build.pr?.number?"#"+build.pr.number:"")+".":"\n\nCommitted directly to "+(build.branch||"the default branch")+"."):"\n\nNo files were committed.")+((build.team?.engineers||[]).length?"\n\nTeam: "+build.team.engineers.join(" + ")+" · peer review: "+(build.team.reviews||[]).join(", ")+" · lead: "+(build.team.lead||"Nexus"):"")+((build.notes||[]).length?"\n\nNotes: "+build.notes.join(" · "):""),files,pr:build.pr||null,branch:build.branch||"",team:build.team||null,at:Date.now()});
     return;
   }
   const responses=Array.isArray(data.responses)?data.responses:[];
   if(data.message){
     appendMessage({id:uid(),role:"assistant",provider:"nexus",name:"Nexus · Team conclusion",text:data.message,team:data.team||null,at:Date.now()});
   }else if(responses.length){
     responses.forEach(item=>appendMessage({id:uid(),role:"assistant",provider:item.provider,model:item.model,text:item.text||"No response text returned.",error:Boolean(item.error),at:Date.now()}));
   }else throw new Error("The gateway returned no AI responses.");
   const failed=responses.filter(x=>x.error);
   if(failed.length)toast(failed.length+" AI provider(s) failed. Successful responses are shown.",true);
   providerStatus=providerStatus||{};renderProviders();
 }catch(e){
   appendMessage({id:uid(),role:"assistant",provider:"nexus",name:"Nexus",text:"Message failed: "+(e.message||"Unknown error"),error:true,at:Date.now()});
 }finally{
   $("pendingMessage")?.remove();setSending(false);renderHistory();renderMessages();$("chatInput").focus();
 }
}
$("modeToggle").addEventListener("click",()=>{
 buildMode=!buildMode;
 const button=$("modeToggle");
 button.classList.toggle("active",buildMode);
 button.setAttribute("aria-pressed",String(buildMode));
 button.textContent=buildMode?"🛠 Build mode":"💬 Chat mode";
  $("buildControls").hidden=!buildMode;
 $("chatInput").placeholder=buildMode?"Describe what you want Nexus to implement in the selected repository…":"Message Nexus…";
 $("composerHint").textContent=buildMode?"Choose execution mode and effort. Automatic commits directly; Pull Request opens a PR.":"Enter to send · Shift + Enter for a new line";
});

function resizeInput(){const el=$("chatInput");el.style.height="auto";el.style.height=Math.min(el.scrollHeight,220)+"px";}
function renderImageAttachments(){const host=$("imageAttachments");if(!host)return;host.hidden=!pendingImages.length;host.innerHTML=pendingImages.map((item,i)=>'<div class="image-attachment"><img src="'+item.dataUrl+'" alt="Image to upload"><button type="button" data-remove-image="'+i+'" aria-label="Remove image">×</button></div>').join("");host.querySelectorAll("[data-remove-image]").forEach(btn=>btn.addEventListener("click",()=>{pendingImages.splice(Number(btn.dataset.removeImage),1);renderImageAttachments();}));}
$("attachImages").addEventListener("click",()=>{if(sending)return;$("imageInput").click();});
$("imageInput").addEventListener("change",async e=>{const files=Array.from(e.target.files||[]);for(const file of files){if(pendingImages.length>=MAX_IMAGES){toast("Maximum 4 images per message.",true);break;}if(!["image/jpeg","image/png","image/webp","image/gif"].includes(file.type)){toast("Use JPG, PNG, WEBP or GIF images.",true);continue;}if(file.size>MAX_IMAGE_BYTES){toast(file.name+" is over 500 KB. Please use a smaller image.",true);continue;}try{const dataUrl=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=reject;reader.readAsDataURL(file);});const comma=dataUrl.indexOf(",");pendingImages.push({mimeType:file.type,data:dataUrl.slice(comma+1),dataUrl});}catch{toast("Could not read "+file.name,true);}}e.target.value="";renderImageAttachments();});
function openSidebar(){$("sidebar").classList.add("open");$("mobileScrim").classList.add("show");}
function closeSidebar(){$("sidebar").classList.remove("open");$("mobileScrim").classList.remove("show");}
$("newChat").addEventListener("click",newChat);
$("chatForm").addEventListener("submit",e=>{e.preventDefault();sendMessage($("chatInput").value);});
$("chatInput").addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();$("chatForm").requestSubmit();}});
$("chatInput").addEventListener("input",resizeInput);
$("refreshStatus").addEventListener("click",refreshStatus);
$("openSidebar").addEventListener("click",openSidebar);
$("closeSidebar").addEventListener("click",closeSidebar);
$("mobileScrim").addEventListener("click",closeSidebar);
window.addEventListener("resize",()=>{if(window.innerWidth>700)closeSidebar();});
$("executionMode").value=executionMode; $("effortLevel").value=effortLevel;
$("executionMode").addEventListener("change",e=>{executionMode=e.target.value;localStorage.setItem("nexus.build.mode",executionMode);});
$("effortLevel").addEventListener("change",e=>{effortLevel=e.target.value;localStorage.setItem("nexus.build.effort",effortLevel);});
loadChats();refreshStatus();refreshRepos();
