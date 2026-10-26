import "jsr:@supabase/functions-js/edge-runtime.d.ts";
const headers={"Content-Type":"application/json","Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"content-type,x-automation-secret","Access-Control-Allow-Methods":"POST,OPTIONS"};
const reply=(status:number,data:unknown)=>new Response(JSON.stringify(data),{status,headers});
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers});
 if(req.method!=="POST")return reply(405,{error:"POST required"});
 const secret=Deno.env.get("NEXUS_AUTOMATION_SECRET")||"";
 if(secret.length<32||req.headers.get("x-automation-secret")!==secret)return reply(401,{error:"Unauthorized"});
 const url=Deno.env.get("SUPABASE_URL")||"";
 const key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
 if(!url||!key)return reply(503,{error:"Supabase service configuration missing"});
 const rest=(path:string,init:RequestInit={})=>fetch(url+"/rest/v1/"+path,{...init,headers:{apikey:key,Authorization:"Bearer "+key,"Content-Type":"application/json",Prefer:"return=representation",...(init.headers||{})}});
 let input:any={};try{input=await req.json()}catch{return reply(400,{error:"Expected JSON"})}
 try{
  if(input.action==="list"){
   const r=await rest("nexus_automation_jobs?select=*&order=run_at.asc");
   const d=await r.json();return reply(r.ok?200:502,{jobs:r.ok?d:[],error:r.ok?undefined:"Could not list schedules"});
  }
  if(input.action==="upsert"){
   const j=input.job;
   if(!j||typeof j.id!=="string"||typeof j.prompt!=="string"||!j.prompt.trim()||j.prompt.length>1200||typeof j.repo!=="string"||!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(j.repo)||!Number.isFinite(Date.parse(j.run_at)))return reply(400,{error:"Invalid schedule"});
   const row={id:j.id,prompt:j.prompt.trim(),repo:j.repo,run_at:new Date(j.run_at).toISOString(),status:"pending",enabled:true,autopilot:false,updated_at:new Date().toISOString()};
   const r=await rest("nexus_automation_jobs?on_conflict=id",{method:"POST",headers:{Prefer:"resolution=merge-duplicates,return=representation"},body:JSON.stringify(row)});
   return reply(r.ok?200:502,{ok:r.ok,result:await r.json()});
  }
  if(input.action==="remove"){
   if(typeof input.id!=="string")return reply(400,{error:"Schedule id required"});
   const r=await rest("nexus_automation_jobs?id=eq."+encodeURIComponent(input.id),{method:"DELETE"});
   return reply(r.ok?200:502,{ok:r.ok});
  }
  if(input.action==="autopilot"){
   if(typeof input.enabled!=="boolean"||typeof input.repo!=="string"||!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(input.repo))return reply(400,{error:"Valid autopilot state and repository required"});
   const id="nexus-autopilot-"+input.repo;
   const row={id,prompt:"Autonomously inspect the repository and propose one high-value, justified improvement as a pull request. Never merge automatically.",repo:input.repo,run_at:new Date(Date.now()+(input.enabled?5*60*1000:365*24*60*60*1000)).toISOString(),status:"pending",enabled:input.enabled,autopilot:true,updated_at:new Date().toISOString()};
   const r=await rest("nexus_automation_jobs?on_conflict=id",{method:"POST",headers:{Prefer:"resolution=merge-duplicates,return=representation"},body:JSON.stringify(row)});
   if(!input.enabled){await rest("nexus_automation_jobs?id=eq."+encodeURIComponent(id),{method:"PATCH",body:JSON.stringify({enabled:false,status:"cancelled",updated_at:new Date().toISOString()})})}
   return reply(r.ok?200:502,{ok:r.ok});
  }
  if(input.action!=="tick")return reply(400,{error:"Unknown action"});
  const now=new Date().toISOString();
  const due=await rest("nexus_automation_jobs?enabled=eq.true&status=eq.pending&run_at=lte."+encodeURIComponent(now)+"&select=*&order=run_at.asc&limit=5");
  if(!due.ok)return reply(502,{error:"Could not load due jobs"});
  const jobs=await due.json(),results=[];
  for(const job of jobs){
   const claim=await rest("nexus_automation_jobs?id=eq."+encodeURIComponent(job.id)+"&status=eq.pending",{method:"PATCH",body:JSON.stringify({status:"running",updated_at:new Date().toISOString()})});
   const claimed=await claim.json();if(!claim.ok||!claimed.length)continue;
   try{
    const ai=await fetch(url+"/functions/v1/nexus-ai",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"build",message:job.prompt,repo:job.repo}),signal:AbortSignal.timeout(90000)});
    const data=await ai.json().catch(()=>({error:"Invalid AI response"}));
    const ok=ai.ok&&!!data.build;
    const status=ok?"completed":"failed";
    const nextRun=job.autopilot&&job.enabled?new Date(Date.now()+30*60*1000).toISOString():job.run_at;
    await rest("nexus_automation_jobs?id=eq."+encodeURIComponent(job.id),{method:"PATCH",body:JSON.stringify({status:job.autopilot&&job.enabled?"pending":status,run_at:nextRun,last_run_at:new Date().toISOString(),last_result:{ok,summary:data.build?.summary||data.error||"No summary",at:new Date().toISOString()},updated_at:new Date().toISOString()})});
    results.push({id:job.id,ok});
   }catch(e){
    await rest("nexus_automation_jobs?id=eq."+encodeURIComponent(job.id),{method:"PATCH",body:JSON.stringify({status:job.autopilot&&job.enabled?"pending":"failed",run_at:job.autopilot&&job.enabled?new Date(Date.now()+30*60*1000).toISOString():job.run_at,last_run_at:new Date().toISOString(),last_result:{ok:false,error:String(e).slice(0,240)},updated_at:new Date().toISOString()})});
    results.push({id:job.id,ok:false});
   }
  }
  return reply(200,{processed:results.length,results});
 }catch(e){return reply(500,{error:String(e).slice(0,300)})}
});