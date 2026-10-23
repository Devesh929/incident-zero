import { createHash, timingSafeEqual } from 'node:crypto';
export const TOOLS=['metrics','traces','logs','health'];
export const SAFE_ACTION_TYPES=['restart_service','throttle_load_generator'];
export const now=()=>new Date().toISOString();
export function hashPayload(payload){return createHash('sha256').update(JSON.stringify(canonical(payload))).digest('hex')}
function canonical(v){if(Array.isArray(v))return v.map(canonical);if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])]));return v}
export function constantEqual(a,b){if(typeof a!=='string'||typeof b!=='string')return false;const x=Buffer.from(a);const y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y)}
export function safeService(s){return typeof s==='string'&&/^[a-z0-9][a-z0-9_.-]{0,63}$/i.test(s)&&!(/flagd|feature.?flag|flag.?ui/i.test(s))}
export function makeEvidence(tool,data,args={}){return {id:`E${cryptoRandomEvidence++}`,tool,ts:now(),args,data}}
let cryptoRandomEvidence=1;
export function ledger(toolResults){return toolResults.map((x,i)=>({id:`E${i+1}`,ts:now(),tool:x.tool,args:x.args??{},data:x.data}))}
function flatten(x){return JSON.stringify(x??{}).toLowerCase()}
export function diagnose(entries){
 const get=t=>entries.find(e=>e.tool===t)?.data||{};
 const metrics=get('metrics'),traces=get('traces'),logs=get('logs'),health=get('health');
 const log=flatten(logs),trace=flatten(traces); const rate=metrics.error_rate_pct, p95=metrics.p95_latency_ms;
 const anomaly=typeof rate==='number'&&rate>=8||typeof p95==='number'&&p95>=1500;
 const component=traces.deepest_failing_service||logs.service||metrics.impacted_service||metrics.service||'unknown';
 const signals=[];
 if(anomaly)signals.push('metrics');
 if(traces.span_status && (/error|deadline|unavailable|exhaust|429|not_found|latency exceeded/i.test(traces.span_status)))signals.push('traces');
 if(logs.entries?.some(e=>/error|warn/i.test(e.severity)))signals.push('logs');
 if(health.status==='restarting'||health.memory_pct>=95||health.cpu_pct>=95)signals.push('health');
 let code=null,root='Insufficient corroborating observations to isolate a root cause';
 if(/out of memory|oomkilled|resource_exhausted/i.test(log+trace)&&health.memory_pct>=95){code='memory_exhaustion';root=`Memory exhaustion / OOM termination associated with ${component}`}
 else if(/429|traffic overload|too many requests|rate limit/i.test(log+trace)&&anomaly){code='traffic_overload';root=`Elevated traffic / rate limiting associated with ${component}`}
 else if(/connection refused|dependency unavailable|econnrefused/i.test(log+trace)&&anomaly){code='dependency_unavailable';root=`Dependency connection failure seen in ${component} requests`}
 else if(/deadline_exceeded|network timeout|gateway.*timed out/i.test(log+trace)&&anomaly){code='dependency_timeout';root=`Timeouts along the ${component} dependency path`}
 else if(/not_found|catalog lookup/i.test(log+trace)&&anomaly){code='lookup_failure';root=`Application lookup failure observed in ${component}`}
 else if(/garbage collection|high cpu|cpu throttling/i.test(log)&&health.cpu_pct>=95){code='cpu_saturation';root=`CPU/GC pressure observed in ${component}`}
 else if(health.status==='restarting'&&anomaly){code='restart_loop';root=`Container restart instability observed for ${component}`}
 if(!anomaly||signals.length<2||!code){code=null;root='Insufficient corroborating observations to isolate a root cause'}
 const confidence=code?Math.min(0.92,Number((0.27+0.13*signals.length+(traces.deepest_failing_service===logs.service?0.08:0)).toFixed(2))):Math.min(0.45,Number((0.15+signals.length*0.08).toFixed(2)));
 const evidence=entries.filter(e=>signals.includes(e.tool)).map(e=>e.id);
 const alternative='Cannot independently exclude every competing hypothesis from limited available telemetry';
 return {component,cause_code:code,root_cause:root,confidence,signal_count:signals.length,signals,evidence_ids:evidence,unknowns:code?[]:[alternative],counter_hypothesis:'Correlation alone does not prove causality; review alternate upstream/dependency causes.',validated:false};
}
export function verify(diagnosis,entries){const ids=new Set(entries.map(e=>e.id));if(!diagnosis.evidence_ids.every(id=>ids.has(id)))return false; const uniqueTools=new Set(entries.filter(e=>diagnosis.evidence_ids.includes(e.id)).map(e=>e.tool));return uniqueTools.size>=2&&!!diagnosis.cause_code&&diagnosis.confidence>=0.60}
export function propose(diagnosis){if(!diagnosis.validated)return null;let p=null;
 if(diagnosis.cause_code==='memory_exhaustion'||diagnosis.cause_code==='restart_loop') p={type:'restart_service',target:diagnosis.component,parameters:{},reason:'Observed service instability. Attempt controlled restart as temporary mitigation; may not cure underlying leak.',expected_effect:'Restart and subsequent request health recovery',rollback:'Escalate; do not repeatedly restart automatically'};
 if(diagnosis.cause_code==='traffic_overload')p={type:'throttle_load_generator',target:'loadgenerator',parameters:{percentage:50},reason:'Telemetry confirms significant load/rate-limit pressure.',expected_effect:'Reduction in request volume and error rate',rollback:'Restore only if separately approved and supported by organiser API'};
 if(!p||!SAFE_ACTION_TYPES.includes(p.type)||!safeService(p.target))return null;
 return {...p,payload_hash:hashPayload(p)};
}
export function redact(text){return String(text??'').replace(/(Bearer\s+)[^\s]+/ig,'$1[REDACTED]').slice(0,500)}
export function reportFor(inc){return {incident_id:inc.id,mode:inc.mode,synthetic:inc.mode==='demo',status:inc.status,created_at:inc.created_at,service:inc.service,symptom:inc.symptom,diagnosis:inc.diagnosis,evidence:inc.evidence,action:inc.action,postcheck:inc.postcheck||null,timeline:inc.timeline,disclaimer:inc.mode==='demo'?'All telemetry and recovery in this record are SYNTHETIC. No system was modified.':'Verify this output against the organiser-provided reporting schema before submission.'}}
