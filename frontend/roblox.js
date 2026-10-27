const ENDPOINT="https://kuvyaytptnghopqbykab.supabase.co/functions/v1/nexus-ai";
const KEY="nexus.roblox.session_token";
const $=id=>document.getElementById(id);
let token=localStorage.getItem(KEY)||"";
let pairExpiry=null;
function status(message,kind=""){const el=$("studioStatus");el.textContent=message;el.className="studio-status "+kind;}
async function api(payload){
 const response=await fetch(ENDPOINT,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
 const data=await response.json().catch(()=>({}));
 if(!response.ok)throw new Error(data.error||"Nexus request failed ("+response.status+")");
 return data;
}
function controls(paired){
 $("checkPair").disabled=!token;$("disconnectStudio").disabled=!token;$("taskInput").disabled=!paired;$("sendTask").disabled=!paired;$("refreshTasks").disabled=!paired;
}
function renderTasks(tasks){
 const host=$("taskList");
 if(!Array.isArray(tasks)||!tasks.length){host.innerHTML='<p class="studio-muted">No tasks yet.</p>';return;}
 host.innerHTML=tasks.map(t=>'<article class="studio-task-item"><strong>'+escapeHtml(t.status||"unknown")+' · '+escapeHtml(t.created_at?new Date(t.created_at).toLocaleString():"")+'</strong><p>'+escapeHtml(t.task||"")+'</p>'+(t.result?'<p class="studio-muted">Studio: '+escapeHtml(t.result)+'</p>':"")+'</article>').join("");
}
function escapeHtml(value){return String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
async function checkStatus(){
 if(!token){controls(false);status("Create a pairing code to start.");return;}
 try{
  const data=await api({action:"studio_status",session_token:token});
  if(data.status==="revoked"){token="";localStorage.removeItem(KEY);controls(false);status("This connection was revoked. Pair again.");return;}
  controls(Boolean(data.paired));
  status(data.paired?"Roblox Studio is paired. You can send tasks.":"Pairing code created. Enter it in the Studio plugin, then check again.",data.paired?"good":"");
  renderTasks(data.tasks);
 }catch(e){controls(false);status(e.message,"error");}
}
$("createPair").addEventListener("click",async()=>{
 $("createPair").disabled=true;status("Creating secure pairing code…");
 try{
  if(token){try{await api({action:"studio_revoke",session_token:token});}catch{}}
  const data=await api({action:"studio_pair_create"});
  token=data.session_token;localStorage.setItem(KEY,token);pairExpiry=data.expires_at;
  $("pairCode").textContent=data.pair_code;
  $("pairExpiry").textContent="Expires "+new Date(pairExpiry).toLocaleTimeString()+". Use it once in Studio.";
  controls(false);$("checkPair").disabled=false;
  status("Code ready. Enter it in the Nexus Bridge plugin in Roblox Studio.");
 }catch(e){status(e.message,"error");}
 finally{$("createPair").disabled=false;}
});
$("checkPair").addEventListener("click",checkStatus);
$("refreshTasks").addEventListener("click",checkStatus);
$("sendTask").addEventListener("click",async()=>{
 const task=$("taskInput").value.trim();if(!task)return status("Write a task first.","error");
 $("sendTask").disabled=true;
 try{
  await api({action:"studio_task_create",session_token:token,task});
  $("taskInput").value="";status("Task queued. Keep the Nexus Bridge plugin open in Studio.","good");await 
$("disconnectStudio").addEventListener("click",async()=>{
 if(!token)return;
 $("disconnectStudio").disabled=true;
 try{
  await api({action:"studio_revoke",session_token:token});
  token="";localStorage.removeItem(KEY);$("pairCode").textContent="— — — — — — — —";
  $("pairExpiry").textContent="Connection revoked.";
  $("taskList").innerHTML="";controls(false);status("Nexus Studio connection revoked.","good");
 }catch(e){status(e.message,"error");$("disconnectStudio").disabled=false;}
});
checkStatus();
 }catch(e){status(e.message,"error");}
 finally{$("sendTask").disabled=false;}
});
checkStatus();
