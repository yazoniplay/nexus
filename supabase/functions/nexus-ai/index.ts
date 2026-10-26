import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const cors = {"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json"};
const json = (status:number, body:unknown) => new Response(JSON.stringify(body),{status,headers:cors});
type P = "openai"|"gemini"|"ollama";
const all:P[] = ["openai","gemini","ollama"];
const defaults:Record<P,string> = {openai:"gpt-4.1-mini",gemini:"gemini-2.5-flash",ollama:"gemma4:31b"};
const key = (p:P) => p==="openai" ? Deno.env.get("OPENAI_API_KEY")||Deno.env.get("CHATGPT_API_KEY")||"" : p==="gemini" ? Deno.env.get("GEMINI_API_KEY")||Deno.env.get("GOOGLE_API_KEY")||"" : Deno.env.get("OLLAMA_API_KEY")||"";
const model = (p:P) => Deno.env.get(p.toUpperCase()+"_MODEL")||defaults[p];
const recent = new Map<string,number[]>();
function rateLimited(req:Request){const ip=req.headers.get("x-forwarded-for")?.split(",")[0]||"unknown";const now=Date.now();const a=(recent.get(ip)||[]).filter(t=>now-t<60000);if(a.length>=8)return true;a.push(now);recent.set(ip,a);return false;}
async function generate(p:P,prompt:string,system="You are an assistant in Nexus. Be concise, accurate, and useful.") {
 const k=key(p);if(!k)throw new Error("No API credential configured for "+p+".");
 const m=model(p);let url="",headers:Record<string,string>={"Content-Type":"application/json"},body:unknown;
 if(p==="openai"){url="https://api.openai.com/v1/chat/completions";headers.Authorization="Bearer "+k;body={model:m,max_tokens:900,messages:[{role:"system",content:system},{role:"user",content:prompt}]};}
 else if(p==="gemini"){url="https://generativelanguage.googleapis.com/v1beta/models/"+encodeURIComponent(m)+":generateContent";headers["x-goog-api-key"]=k;body={systemInstruction:{parts:[{text:system}]},contents:[{role:"user",parts:[{text:prompt}]}],generationConfig:{maxOutputTokens:900}};}
 else {url=(Deno.env.get("OLLAMA_BASE_URL")||"https://ollama.com/api").replace(/\/$/,"")+"/chat";headers.Authorization="Bearer "+k;body={model:m,stream:false,messages:[{role:"system",content:system},{role:"user",content:prompt}],options:{num_predict:900}};}
 const res=await fetch(url,{method:"POST",headers,body:JSON.stringify(body),signal:AbortSignal.timeout(45000)});const d=await res.json().catch(()=>({}));
 if(!res.ok)throw new Error(p+" HTTP "+res.status+": "+String(d?.error?.message||d?.error||d?.message||"request failed").slice(0,240));
 const text=p==="openai"?d?.choices?.[0]?.message?.content||"":p==="gemini"?(d?.candidates?.[0]?.content?.parts||[]).map((x:any)=>x.text||"").join("\n"):d?.message?.content||"";
 if(!String(text).trim())throw new Error(p+" returned an empty response.");
 return {provider:p,model:m,text:String(text).trim()};
}
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 if(req.method!=="POST")return json(405,{error:"POST required"});
 if(rateLimited(req))return json(429,{error:"Too many requests. Wait one minute and try again."});
 let x:any;try{x=await req.json();}catch{return json(400,{error:"Expected JSON body"});}
 try{
  if(x.action==="status"){const providers:any={anthropic:{configured:false,model:"No Claude API credential configured",verified:false}};for(const p of all)providers[p]={configured:!!key(p),model:model(p),verified:false};return json(200,{providers,repository_count:0,active_runs:0,attention_count:0});}
  if(x.action==="test"){const p=x.provider as P;if(!all.includes(p))return json(400,{error:"Unsupported provider"});const r=await generate(p,"Reply with exactly: Nexus connection verified.","Reply with the exact short text requested.");return json(200,{ok:true,message:r.provider+" connection verified using "+r.model+".",provider:r.provider,model:r.model});}
  if(x.action==="chat"){
   const message=typeof x.message==="string"?x.message.trim():"";if(!message||message.length>12000)return json(400,{error:"Message must be 1–12000 characters."});
   const active=all.filter(p=>!!key(p));if(!active.length)return json(503,{error:"No Gemini, OpenAI/ChatGPT, or Ollama credentials were found in Supabase Function secrets."});
   const settled=await Promise.allSettled(active.map(p=>generate(p,message)));
   const responses=settled.map((r,i)=>r.status==="fulfilled"?r.value:{provider:active[i],model:model(active[i]),text:"Provider error: "+String(r.reason?.message||r.reason).slice(0,250),error:true});
   const ok=responses.filter((r:any)=>!r.error);if(!ok.length)return json(502,{error:"All configured providers failed.",responses});
   let answer=ok.map((r:any)=>"["+r.provider.toUpperCase()+" · "+r.model+"]\n"+r.text).join("\n\n──────────\n\n");
   if(ok.length>1){try{answer=(await generate(ok[0].provider,"Synthesize these independent responses into one accurate answer to the user's request. Note meaningful disagreements.\n\nRequest: "+message+"\n\n"+ok.map((r:any)=>r.provider+":\n"+r.text).join("\n\n"),"You are Nexus's moderator. Produce one balanced, useful answer.")).text;}catch{}}
   return json(200,{message:answer,responses});
  }
  return json(400,{error:"Unknown action. Use status, test, or chat."});
 }catch(e){return json(502,{error:String(e instanceof Error?e.message:e).slice(0,500)});}
});