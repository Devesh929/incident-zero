// Synthetic practice-like scenarios. These are invented examples and are never used as live diagnoses.
const scenarios = [
  ['payment_timeout','Payment RPC timeout','checkout','Checkout requests failing','payment',38,3200,33,48,'ERROR upstream payment gateway DEADLINE_EXCEEDED after 3000ms','payment span DEADLINE_EXCEEDED', 'running'],
  ['cart_unavailable','Cart database outage','cart','Add-to-cart requests failing','cart',54,2640,21,42,'ERROR cache connection refused: ECONNREFUSED','cart span UNAVAILABLE: cache connection', 'running'],
  ['catalog_failure','Catalog item failures','frontend','Some product requests return errors','product-catalog',21,800,24,46,'ERROR catalog lookup NOT_FOUND for requested item','product-catalog span NOT_FOUND', 'running'],
  ['recommendation_memory','Recommendation memory leak','recommendation','Recommendation error surge','recommendation',33,4100,70,99,'ERROR out of memory: process killed; restarting','recommendation span RESOURCE_EXHAUSTED', 'restarting'],
  ['advertising_cpu','Ad service CPU saturation','ad','Ad requests are delayed','ad',9,3900,99,67,'WARN high CPU, excessive garbage collection pauses','ad span latency exceeded deadline', 'running'],
  ['homepage_traffic','Homepage traffic flood','frontend','Frontend 429 responses rising','frontend',35,2600,95,62,'WARN HTTP 429 too many requests; traffic overload','frontend HTTP 429 rate limited', 'running'],
  ['container_crash','Service restart loop','checkout','Checkout service unavailable','checkout',56,5000,22,96,'ERROR process terminated; OOMKilled; restarting container','checkout span UNAVAILABLE: connection reset', 'restarting'],
  ['shipping_network','Inter-service packet delay','checkout','Checkout p95 latency increasing','shipping',14,5900,31,40,'ERROR shipping upstream network timeout: DEADLINE_EXCEEDED','shipping span DEADLINE_EXCEEDED', 'running'],
  ['database_down','Database unavailability','checkout','Checkout service errors','checkout',63,2200,29,51,'ERROR database connection refused; dependency unavailable','checkout span UNAVAILABLE dependency timeout', 'running'],
  ['healthy','Healthy baseline','checkout','Normal service health check','checkout',0.4,140,24,39,'INFO request succeeded','checkout span HTTP 200', 'running'],
  ['ambiguous','Ambiguous weak signal','checkout','Intermittent checkout latency','checkout',3.5,720,35,43,'INFO request queued','checkout span intermittent delay', 'running']
];
export const SCENARIOS = scenarios.map(([id,title,service,symptom,culprit,errorRate,latency,cpu,memory,log,span,status])=>({id,title,service,symptom,culprit,errorRate,latency,cpu,memory,log,span,status}));
export function scenarioById(id){return SCENARIOS.find(x=>x.id===id)}
export function syntheticTool(id,tool){
 const s=scenarioById(id);if(!s)throw Error('Unknown demo scenario');
 if(tool==='metrics')return {source:'synthetic/prometheus',service:s.service,impacted_service:s.culprit,error_rate_pct:s.errorRate,baseline_error_rate_pct:0.8,p95_latency_ms:s.latency,cpu_pct:s.cpu,memory_pct:s.memory,summary:`${s.service}: error rate ${s.errorRate}%, p95 ${s.latency}ms; impacted: ${s.culprit}`};
 if(tool==='traces')return {source:'synthetic/jaeger',service:s.service,trace_id:`SYN-${s.id}`,deepest_failing_service:s.culprit,span_status:s.span,summary:`Deepest problematic span at ${s.culprit}: ${s.span}`};
 if(tool==='logs')return {source:'synthetic/opensearch',service:s.culprit,entries:[{severity:s.log.startsWith('ERROR')?'ERROR':s.log.startsWith('WARN')?'WARN':'INFO',message:s.log}],summary:`${s.culprit}: ${s.log}`};
 if(tool==='health')return {source:'synthetic/container-health',service:s.culprit,status:s.status,cpu_pct:s.cpu,memory_pct:s.memory,restarts:s.status==='restarting'?3:0,summary:`${s.culprit} ${s.status}, CPU ${s.cpu}%, memory ${s.memory}%`};
 throw Error('Invalid telemetry tool');
}
