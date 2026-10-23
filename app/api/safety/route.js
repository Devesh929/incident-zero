import {NextResponse} from 'next/server';
import {authError,fail} from '../../../lib/security.mjs';
import {isKilled,setKilled,storeAvailable} from '../../../lib/store.mjs';
export const dynamic='force-dynamic';
export async function GET(req){const denied=authError(req,{sensitive:true});if(denied)return denied;try{return NextResponse.json({kill_switch_on:await isKilled(),can_update:storeAvailable()&&process.env.KILL_SWITCH==='false'})}catch(e){return fail(e,500)}}
export async function POST(req){const denied=authError(req,{sensitive:true});if(denied)return denied;try{if(!storeAvailable()||process.env.KILL_SWITCH!=='false')return fail(Error('Set KILL_SWITCH=false and configure Upstash before remote switches can be managed'));
 const body=await req.json();if(typeof body.killed!=='boolean')return fail(Error('Expected killed boolean'));
 await setKilled(body.killed);return NextResponse.json({kill_switch_on:await isKilled()});
 }catch(e){return fail(e,500)}}
