import { safeService,redact } from './core.mjs';
import { syntheticTool } from './scenarios.mjs';

function base(v){if(!v)throw Error('Telemetry endpoint not configured');const u=new URL(v);if(u.protocol!=='https:')throw Error('Cloud telemetry endpoint must use HTTPS');if(/localhost|127\.|^10\.|^192\.168\.|^172\.|\.local$|flagd|flag-ui|feature-flag/i.test(u.hostname))throw Error('Internal or forbidden host blocked');if(u.username||u.password)throw Error('Inline telemetry credentials are not allowed');return u.href.replace(/\/$/,'')}
async function jsonCall(url,options={}){
 const abort=new AbortController();const timer=setTimeout(()=>abort.abort(),8500);
 try {const r=await fetch(url,{...options,redirect:'error',cache:'no-store',signal:abort.signal,headers:{...(process.env.TELEMETRY_BEARER_TOKEN?{Authorization:`Bearer ${process.env.TELEMETRY_BEARER_TOKEN}`}:{}) ,'Content-Type':'application/json',...options.headers}}); if(!r.ok)throw Error(`Telemetry HTTP ${r.status}`);return await r.json()}finally{clearTimeout(timer)}
}
async function metricQuery(expression){const url=`${base(process.env.PROMETHEUS_URL)}/api/v1/query?${new URLSearchParams({query:expression})}`;const result=await jsonCall(url);const values=result?.data?.result||[];if(!values.length)return null;const n=Number(values[0]?.value?.[1]);return Number.isFinite(n)?Number(n.toFixed(4)):null}
async function realMetrics(service){
 const label=`service_name="${service}"`;const errorQ=process.env.PROMETHEUS_ERROR_QUERY_TEMPLATE?.replaceAll('{service}',service)||`sum(rate(http_server_request_duration_seconds_count{${label},http_response_status_code=~"5.."}[5m]))`;
 const totalQ=process.env.PROMETHEUS_TOTAL_QUERY_TEMPLATE?.replaceAll('{service}',service)||`sum(rate(http_server_request_duration_seconds_count{${label}}[5m]))`;
 const queries=[errorQ,totalQ,`sum(rate(process_cpu_time_seconds_total{${label}}[5m]))`,`max(process_memory_usage_bytes{${label}})`];
 const values=await Promise.all(queries.map(q=>metricQuery(q).catch(()=>null)));
 const [errors,total,cpu,mem]=values;return {source:'prometheus',service,error_rate_pct:errors!==null&&total>0?Number((100*errors/total).toFixed(2)):null,request_rate_rps:total,cpu_cores:cpu,memory_bytes:mem,p95_latency_ms:null,summary:`Observed query rates: total=${total??'unknown'}, errors=${errors??'unknown'}, CPU cores=${cpu??'unknown'}. Missing signals are unknown, not healthy.`}
}
async function realTraces(service){const url=`${base(process.env.JAEGER_URL)}/api/traces?${new URLSearchParams({service,limit:'20',lookback:'15m'})}`;const payload=await jsonCall(url);
 const traces=(payload?.data||[]).slice(0,20);const failures=[];
 for(const t of traces)for(const span of (t.spans||[])){
  const values=(span.tags||[]).filter(x=>['error','otel.status_code','http.status_code'].includes(x.key)).map(x=>String(x.value));
  if(values.some(v=>v==='true'||v==='ERROR'||/^5\d\d$/.test(v))){const proc=t.processes?.[span.processID];failures.push({trace_id:t.traceID,operation:span.operationName,service:proc?.serviceName||service,status:values.join(',')});}
 }
 return {source:'jaeger',service,trace_count:traces.length,failures:failures.slice(0,15),deepest_failing_service:failures.at(-1)?.service||null,span_status:failures.map(x=>x.status).slice(0,5).join(';'),summary:`${traces.length} traces, ${failures.length} spans carrying error tags; trace presence alone is not evidence of the root cause.`};
}
async function realLogs(service){const index=process.env.OPENSEARCH_INDEX||'otel-logs-*';if(!/^[a-zA-Z0-9_*.-]{1,80}$/.test(index)||/flag/i.test(index))throw Error('Unsafe search index');
 const url=`${base(process.env.OPENSEARCH_URL)}/${index}/_search`;
 const payload=await jsonCall(url,{method:'POST',body:JSON.stringify({size:15,sort:[{'@timestamp':{order:'desc',unmapped_type:'date'}}],query:{bool:{filter:[{range:{'@timestamp':{gte:'now-15m'}}}],should:[{term:{'service.name.keyword':service}},{term:{'resource.attributes.service.name.keyword':service}},{match_phrase:{'service.name':service}}],minimum_should_match:1}}})});
 const entries=(payload?.hits?.hits||[]).slice(0,15).map(x=>{const s=x._source||{};return {severity:s.severity_text||s.severity||s.level||'UNKNOWN',message:redact(s.body||s.message||s.log||'No message') }});
 return {source:'opensearch',service,entries,summary:entries.map(e=>`${e.severity}: ${e.message}`).slice(0,4).join(' | ')||'No matching log records (unknown, not necessarily healthy)'};
}
async function realHealth(service){return {source:'prometheus',service,status:'unknown',cpu_pct:null,memory_pct:null,restarts:null,summary:'Container health cannot be directly inspected from Vercel; connect an approved, read-only infrastructure metrics endpoint. This signal remains unknown.'}}
export async function readTelemetry(tool,service,{demoId,mode='demo'}={}){if(!['metrics','traces','logs','health'].includes(tool))throw Error('Unapproved tool');if(!safeService(service))throw Error('Service is invalid or forbidden');if(mode==='demo')return syntheticTool(demoId,tool);
 switch(tool){case 'metrics':return realMetrics(service);case 'traces':return realTraces(service);case 'logs':return realLogs(service);case 'health':return realHealth(service)}
}
export function liveAvailable(){return !!(process.env.PROMETHEUS_URL&&process.env.JAEGER_URL&&process.env.OPENSEARCH_URL)}
