import {NextResponse} from 'next/server';
import {authError,fail} from '../../../lib/security.mjs';
import {constantEqual,hashPayload,now,reportFor,SAFE_ACTION_TYPES,safeService} from '../../../lib/core.mjs';
import {getIncident,updateIncident,acquireApproval,isKilled,storeAvailable} from '../../../lib/store.mjs';
import {readTelemetry} from '../../../lib/telemetry.mjs';
export const dynamic='force-dynamic';export const maxDuration=60;
function mappedAction(action){
 const raw=process.env.ACTION_API_MAPPING_JSON;if(!raw)throw Error('Organiser Action API mappings not supplied; real execution is intentionally locked');
 const mapping=JSON.parse(raw)[action.type];if(!SAFE_ACTION_TYPES.includes(action.type)||!mapping||mapping.method!=='POST'||!/^\/[a-zA-Z0-9/_-]{1,150}$/.test(mapping.path)||mapping.path.includes('..'))throw Error('Unapproved Action API mapping');
 if(!safeService(action.target))throw Error('Unsafe target');return mapping;
}
async function fireAction(action,incidentId){
 if(!process.env.ACTION_API_URL||!process.env.ACTION_API_TOKEN)throw Error('Bosch Action API URL/token not configured');const root=new URL(process.env.ACTION_API_URL);if(root.protocol!=='https:'||root.username||root.password)throw Error('Action API requires HTTPS and no inline credentials');
 if(/localhost|127\.0\.0\.1|^10\.|^192\.168\.|\.local$/i.test(root.hostname))throw Error('Private Action API endpoints cannot be reached from Vercel');
 const mapping=mappedAction(action);
 const url=new URL(mapping.path,root);if(url.origin!==root.origin)throw Error('Invalid action endpoint');
 const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),12000);
 try{const res=await fetch(url,{method:'POST',redirect:'error',signal:controller.signal,headers:{'Content-Type':'application/json',Authorization:`Bearer ${process.env.ACTION_API_TOKEN}`,'Idempotency-Key':incidentId},body:JSON.stringify({action:action.type,target:action.target,parameters:action.parameters,incident_id:incidentId})});
 const text=(await res.text()).slice(0,2000);if(!res.ok)throw Error(`Action API returned HTTP ${res.status}`);return {status:res.status,response_excerpt:text};}
 finally{clearTimeout(timeout)}
}
export async function POST(req){const denied=authError(req,{sensitive:true});if(denied)return denied;
 try{
  if(!storeAvailable())return fail(Error('Upstash Redis required for approvals'));
  const payload=await req.json();const actor=String(payload.actor||'').trim().slice(0,100);
  if(!actor||!payload.approval_hash||!payload.incident_id)return fail(Error('Human name, incident ID and exact action hash required'));
  const inc=await getIncident(payload.incident_id);if(!inc||inc.mode!=='real'||inc.status!=='AWAITING_APPROVAL'||!inc.action)return fail(Error('No pending real action found'));
  const {payload_hash,...coreAction}=inc.action;if(!constantEqual(hashPayload(coreAction),payload_hash)||!constantEqual(payload_hash,payload.approval_hash))return fail(Error('Approval hash does not match the exact immutable action'));
  if(await isKilled())return fail(Error('Kill switch is ON. No action has been sent.'));
  mappedAction(inc.action); // fail closed before claiming approval
  if(!await acquireApproval(inc.id))return fail(Error('Approval is already being processed'));
  inc.status='ACTING';inc.approved_by=actor;inc.timeline.push({ts:now(),event:'APPROVED',note:`Explicit approval by ${actor}; hash ${payload_hash.slice(0,12)}…`});await updateIncident(inc);
  try{
   if(await isKilled())throw Error('Kill switch engaged before Action API request');
   const before=await readTelemetry('metrics',inc.service,{mode:'real'}).catch(()=>null);
   const result=await fireAction(inc.action,inc.id);
   await new Promise(r=>setTimeout(r,3500));
   const after=await readTelemetry('metrics',inc.service,{mode:'real'}).catch(()=>null);
   const improved=typeof before?.error_rate_pct==='number'&&typeof after?.error_rate_pct==='number'&&after.error_rate_pct<before.error_rate_pct&&after.error_rate_pct<8;
   inc.postcheck={mode:'real',verified:improved,before,after,action_api_result:result,notice:'Single post-action sample is preliminary; inspect sustained metrics. No automatic rollback is executed.'};
   inc.status=improved?'RESOLVED':'ESCALATED';inc.timeline.push({ts:now(),event:'POSTCHECK',note:improved?'Initial health metric improved':'Recovery not established; escalation required; no unapproved rollback'});
  }catch(error){inc.status='ESCALATED';inc.postcheck={mode:'real',verified:false,error:String(error.message).slice(0,300)};inc.timeline.push({ts:now(),event:'EXECUTION_FAILED',note:'Action outcome uncertain or failed; manual review required. Do not automatically retry.'})}
  await updateIncident(inc);return NextResponse.json({incident:inc,report:reportFor(inc)},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return fail(e,500)}
}
