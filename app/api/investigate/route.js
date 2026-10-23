import {NextResponse} from 'next/server';
import {randomUUID} from 'node:crypto';
import {authError,fail} from '../../../lib/security.mjs';
import {diagnose,ledger,now,propose,safeService,verify} from '../../../lib/core.mjs';
import {readTelemetry,liveAvailable} from '../../../lib/telemetry.mjs';
import {scenarioById} from '../../../lib/scenarios.mjs';
import {explainWithLLM,chooseNextTool} from '../../../lib/llm.mjs';
import {saveIncident,storeAvailable} from '../../../lib/store.mjs';
export const dynamic='force-dynamic';export const maxDuration=60;
export async function POST(request){
 const denied=authError(request);if(denied)return denied;
 try{
  const input=await request.json();const mode=input.mode==='real'?'real':'demo';
  if(mode==='real'&&!liveAvailable())return NextResponse.json({error:'Connect reachable HTTPS Prometheus, Jaeger and OpenSearch endpoints first. Demo runs without them.'},{status:400});
  if(mode==='real'&&!storeAvailable())return NextResponse.json({error:'Live incident workflow requires Upstash Redis durable persistence'},{status:400});
  const scenario=mode==='demo'?scenarioById(String(input.scenario_id||'')):null;
  if(mode==='demo'&&!scenario)return fail(Error('Choose one of the provided synthetic scenarios'));
  const service=mode==='demo'?scenario.service:String(input.service||'checkout');if(!safeService(service))return fail(Error('Invalid or forbidden service'));
  const symptom=mode==='demo'?scenario.symptom:String(input.symptom||'Unknown service symptom').slice(0,250);
  const incident={id:randomUUID(),created_at:now(),mode,service,symptom,scenario_id:scenario?.id||null,status:'INVESTIGATING',evidence:[],diagnosis:null,action:null,postcheck:null,timeline:[{ts:now(),event:'DETECTED',note:mode==='demo'?'Synthetic incident injected':'Manually opened real investigation'},{ts:now(),event:'INVESTIGATING',note:'Read-only investigation started'}]};
  const collected=[];async function run(tool){
   try{const data=await readTelemetry(tool,service,{demoId:scenario?.id,mode});collected.push({tool,args:{service},data})}
   catch(e){collected.push({tool,args:{service},data:{error:`${tool} unavailable: ${e.message}`}})}
   incident.timeline.push({ts:now(),event:`TOOL_${tool.toUpperCase()}`,note:collected.at(-1).data.summary||collected.at(-1).data.error});
  }
  // Tool ordering responds to interim findings; never inspect flag settings.
  await run('metrics');const m=collected[0].data;
  const anomaly=typeof m.error_rate_pct==='number'&&m.error_rate_pct>=8||typeof m.p95_latency_ms==='number'&&m.p95_latency_ms>=1500;
  if(anomaly||mode==='real'){
   const choices=['traces','logs','health'];
   // The optional LLM chooses one next read-only tool; code fixes its inputs.
   const selected=await chooseNextTool(service,ledger(collected),choices);
   if(selected){incident.timeline.push({ts:now(),event:'MODEL_TOOL_CHOICE',note:`Selected ${selected.tool} from allowlist: ${selected.reason}`});}
   const ordered=selected?[selected.tool,...choices.filter(x=>x!==selected.tool)]:choices;
   for(const tool of ordered)await run(tool);
  }
  incident.evidence=ledger(collected);
  const d=diagnose(incident.evidence);d.validated=verify(d,incident.evidence);
  if(!d.validated&&d.cause_code){d.unknowns.push('Evidence verification failed; refusing the action proposal.');d.cause_code=null;d.confidence=0;}
  // Optional LLM provides only a summary: code owns component, confidence, action and evidence.
  d.llm_explanation=await explainWithLLM(d,incident.evidence);
  incident.diagnosis=d;incident.action=propose(d);
  incident.status=incident.action?'AWAITING_APPROVAL':'ESCALATED';
  incident.timeline.push({ts:now(),event:'EVIDENCE_CHECK',note:d.validated?`Verified ${d.evidence_ids.length} stored citations`:'Insufficient corroborated evidence; safe escalation'});
  incident.timeline.push({ts:now(),event:incident.status,note:incident.action?'Awaiting human consent; no changes made':'No action approved; escalate with evidence'});
  if(storeAvailable())await saveIncident(incident);
  return NextResponse.json({incident,mode_note:mode==='demo'?'Synthetic telemetry; demonstration only':'Live telemetry; verify API and metrics compatibility before use'},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return fail(e,500)}
}
