// Serverless-safe, optional durable persistence via Upstash Redis REST.
export function storeAvailable(){return !!(process.env.UPSTASH_REDIS_REST_URL&&process.env.UPSTASH_REDIS_REST_TOKEN)}
async function command(args){if(!storeAvailable())throw Error('Upstash Redis must be connected for durable real operations');const r=await fetch(process.env.UPSTASH_REDIS_REST_URL,{method:'POST',headers:{Authorization:`Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify(args),cache:'no-store'});const body=await r.json();if(!r.ok||body.error)throw Error('State store request failed');return body.result}
export async function saveIncident(incident){await command(['SET',`iz:incident:${incident.id}`,JSON.stringify(incident),'EX',604800]);await command(['LPUSH','iz:index',incident.id]);await command(['LTRIM','iz:index',0,99]);}
export async function updateIncident(incident){await command(['SET',`iz:incident:${incident.id}`,JSON.stringify(incident),'EX',604800]);}
export async function getIncident(id){if(!/^[a-z0-9-]{6,80}$/i.test(id||''))return null;const s=await command(['GET',`iz:incident:${id}`]);return s?JSON.parse(s):null}
export async function getIncidents(){const ids=await command(['LRANGE','iz:index',0,29])||[];const rows=await Promise.all(ids.map(id=>getIncident(id)));return rows.filter(Boolean)}
export async function acquireApproval(id){return (await command(['SET',`iz:approve:${id}`,'locked','NX','EX',300]))==='OK'}
export async function setKilled(value){await command(['SET','iz:kill',value?'1':'0'])}
export async function isKilled(){return process.env.KILL_SWITCH!=='false'||(storeAvailable()&&(await command(['GET','iz:kill']))==='1')}
