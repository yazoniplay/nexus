const NEXUS_AI_URL="https://kuvyaytptnghopqbykab.supabase.co/functions/v1/nexus-ai";
const $=id=>document.getElementById(id);
const PROVIDERS=[
 {id:"openai",name:"ChatGPT",letter:"O"},
 {id:"gemini",name:"Gemini",letter:"G"},
 {id:"ollama",name:"Ollama Cloud",letter:"◎"},
 {id:"anthropic",name:"Claude",letter:"C"}
];
const STORAGE_KEY="nexus.chats.v2";
let providerStatus={};
let chats=[];
let activeChatId=null;
let sending=false;
let buildMode=false;
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
 host.innerHTML=chats.map(c=>'<button class="history-item '+(c.id===activeChatId?"active":"")+'" data-chat-id="'+escapeHTML(c.id)+'"><span class="history-icon">◷</span><span>'+escapeHTML(c.title||"New chat")+'</span></button>').join("");
 host.querySelectorAll("[data-chat-id]").forEach(btn=>btn.addEventListener("click",()=>{activeChatId=btn.dataset.chatId;renderHistory();renderMessages();closeSidebar();}));
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
function newChat(){
 const c={id:uid(),title:"New chat",createdAt:Date.now(),messages:[]};
 chats.unshift(c);activeChatId=c.id;saveChats();renderHistory();renderMessages();$("chatInput").focus();closeSidebar();
}
function renderMessages(){
 const c=activeChat();const host=$("messages");const welcome=$("welcome");
 if(!c||!c.messages.length){welcome.hidden=false;host.innerHTML="";return;}
 welcome.hidden=true;
 host.innerHTML=c.messages.map(m=>{
   if(m.role==="user")return '<article class="message user"><div class="message-content">'+escapeHTML(m.text)+'</div></article>';
   const p=PROVIDERS.find(x=>x.id===m.provider);
   const name=m.name||(p?p.name:(m.provider||"AI"));
   return '<article class="message '+(m.error?"error":"")+'"><div class="message-avatar">'+escapeHTML(p?.letter||name.slice(0,1).toUpperCase())+'</div><div class="message-content"><div class="message-label">'+escapeHTML(name)+' <span class="message-model">'+escapeHTML(m.model||"")+'</span></div><div class="message-text">'+formatText(m.text||"No response returned.")+'</div></div></article>';
 }).join("");
 scrollBottom();
}
function formatText(text){
 // Escape first; preserve code fences and simple paragraphs without interpreting model output as HTML.
 const safe=escapeHTML(text);
 return safe.split(/\n{2,}/).map(part=>{
   if(part.startsWith("```")&&part.endsWith("```")){
     const code=part.replace(/^```[^\n]*\n?/,"").replace(/\n?```$/,"");
     return "<pre><code>"+code+"</code></pre>";
   }
   return "<p>"+part.replace(/\n/g,"<br>")+"</p>";
 }).join("");
}
function scrollBottom(){const sc=$("chatScroll");requestAnimationFrame(()=>{sc.scrollTop=sc.scrollHeight;});}
function setSending(value){sending=value;$("sendButton").disabled=value;$("chatInput").disabled=value;$("composerHint").textContent=value?"Waiting for every configured AI…":"Enter to send · Shift + Enter for a new line";}
function appendMessage(message){const c=activeChat();if(!c)return;c.messages.push(message);saveChats();renderHistory();renderMessages();}
function titleFrom(text){const t=text.replace(/\s+/g," ").trim();return t.length>36?t.slice(0,36).trim()+"…":t||"New chat";}
async function sendMessage(raw){
 const text=raw.trim();if(!text||sending)return;
 if(!activeChat())newChat();
 const chat=activeChat();
 if(!chat.messages.some(m=>m.role==="user"))chat.title=titleFrom(text);
 appendMessage({id:uid(),role:"user",text,at:Date.now()});
 $("chatInput").value="";resizeInput();setSending(true);
 const pending=document.createElement("article");pending.className="message";pending.id="pendingMessage";
 pending.innerHTML='<div class="message-avatar">N</div><div class="message-content"><div class="message-label">Nexus <span class="message-model">Waiting for responses</span></div><div class="loading-dots" aria-label="AI models are responding"><i></i><i></i><i></i></div></div>';
 $("messages").appendChild(pending);$("welcome").hidden=true;scrollBottom();
 try{
   const r=await fetch(NEXUS_AI_URL,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:buildMode?"build":"chat",message:text,repo:selectedRepo})});
   const data=await r.json().catch(()=>({}));
   if(!r.ok)throw new Error(data.error||data.message||"AI request failed ("+r.status+")");
   if(buildMode){
     const build=data.build;
     if(!build)throw new Error("The gateway returned no build result.");
     const files=Array.isArray(build.files)?build.files:[];
     const artifactText=files.map(file=>"FILE: "+file.path+"\n"+(file.reason||"Generated file")+"\n\n\`\`\`\n"+file.content+"\n\`\`\`").join("\n\n");
     appendMessage({id:uid(),role:"assistant",provider:"nexus",name:"Nexus Build",text:String(build.summary||"Build generated.")+(artifactText?"\n\n"+artifactText:"\n\nNo files were generated.")+((build.notes||[]).length?"\n\nNotes: "+build.notes.join(" · "):""),at:Date.now()});
     return;
   }
   const responses=Array.isArray(data.responses)?data.responses:[];
   if(responses.length){
     // Show every model's response inline. No details element, disclosure button, or extra click.
     responses.forEach(item=>appendMessage({id:uid(),role:"assistant",provider:item.provider,model:item.model,text:item.text||"No response text returned.",error:Boolean(item.error),at:Date.now()}));
   }else if(data.message){
     appendMessage({id:uid(),role:"assistant",provider:"nexus",name:"Nexus",text:data.message,at:Date.now()});
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
 $("chatInput").placeholder=buildMode?"Describe what you want Nexus to implement in the selected repository…":"Message Nexus…";
 $("composerHint").textContent=buildMode?"Build mode generates complete file contents; select a repository first.":"Enter to send · Shift + Enter for a new line";
});
function resizeInput(){const el=$("chatInput");el.style.height="auto";el.style.height=Math.min(el.scrollHeight,220)+"px";}
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
loadChats();refreshStatus();refreshRepos();
