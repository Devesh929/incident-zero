import {NextResponse} from 'next/server';
import {authError,fail} from '../../../lib/security.mjs';
import {getIncidents,storeAvailable} from '../../../lib/store.mjs';
export const dynamic='force-dynamic';
export async function GET(req){const denied=authError(req);if(denied)return denied;try{return NextResponse.json({incidents:storeAvailable()?await getIncidents():[],persistent:storeAvailable()})}catch(e){return fail(e,500)}}
