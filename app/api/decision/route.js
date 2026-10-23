import {NextResponse} from 'next/server';
import {authError,fail} from '../../../lib/security.mjs';
import {getIncident,updateIncident,storeAvailable,acquireApproval} from '../../../lib/store.mjs';
import {now,reportFor} from '../../../lib/core.mjs';
export const dynamic='force-dynamic';
export async function POST(req){const denied=authError(req,{sensitive:true});if(denied)return denied;
 try{if(!storeAvailable())return fail(Error('Durable state store missing'));
 const payload=await req.json();const actor=String(payload.actor||'').trim().slice(0,100);if(!actor)return fail(Error('Human actor required'));
 const inc=await getIncident(payload.incident_id);if(!inc||inc.mode!=='real'||inc.status!=='AWAITING_APPROVAL')return fail(Error('No pending real action'));
 if(!await acquireApproval(inc.id))return fail(Error('Decision already being processed'));
 inc.status='DECLINED';inc.timeline.push({ts:now(),event:'DECLINED',note:`${actor} explicitly rejected action; zero changes made`});await updateIncident(inc);return NextResponse.json({incident:inc,report:reportFor(inc)});
 }catch(e){return fail(e,500)}
}
