import {NextResponse} from 'next/server';
import {authError,fail} from '../../../lib/security.mjs';
import {readTelemetry,liveAvailable} from '../../../lib/telemetry.mjs';
import {safeService} from '../../../lib/core.mjs';
export const dynamic='force-dynamic';
export async function GET(req){const denied=authError(req);if(denied)return denied;
 try{const service=new URL(req.url).searchParams.get('service')||'checkout';if(!safeService(service))return fail(Error('Invalid service'));
 if(!liveAvailable())return NextResponse.json({mode:'unavailable',error:'Externally reachable telemetry backends not yet configured'},{status:503});
 const metrics=await readTelemetry('metrics',service,{mode:'real'});return NextResponse.json({mode:'real',metrics},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return fail(e,502)}
}
