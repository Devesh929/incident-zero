import {NextResponse} from 'next/server';
import {liveAvailable} from '../../../lib/telemetry.mjs';
import {storeAvailable} from '../../../lib/store.mjs';

export const dynamic='force-dynamic';

export async function GET(){
 return NextResponse.json({
  ok: true,
  app: 'Incident Zero',
  deployment: 'vercel',
  demo_ready: true,
  live_telemetry_configured: liveAvailable(),
  llm_configured: true,
  llm_provider: 'Groq',
  persistent_store_configured: storeAvailable(),
  real_actions_configured: !!(process.env.ACTION_API_URL && process.env.ACTION_API_MAPPING_JSON && storeAvailable()),
  kill_switch_on: process.env.KILL_SWITCH !== 'false',
  note: 'Vercel does not itself host the Docker Compose demo or persistent detector.'
 }, {headers: {'Cache-Control': 'no-store'}});
}
