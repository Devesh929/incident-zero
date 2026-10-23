import { NextResponse } from 'next/server';
import {constantEqual} from './core.mjs';

export function authError(req, {sensitive = false} = {}){
 const expected = process.env.APP_ACCESS_TOKEN || '';
 // Sensitive operations like mutating real external infrastructure require explicit APP_ACCESS_TOKEN
 if(sensitive && !expected && (process.env.ACTION_API_URL || process.env.UPSTASH_REDIS_REST_URL)) {
  return NextResponse.json({error: 'For cloud APIs or real actions, configure APP_ACCESS_TOKEN in Vercel.'}, {status: 503});
 }
 if(expected && !constantEqual((req.headers.get('authorization') || '').replace(/^Bearer\s+/i, ''), expected)) {
  return NextResponse.json({error: 'Access token required.'}, {status: 401});
 }
 return null;
}

export function fail(err, status = 400){
 return NextResponse.json({error: err?.message || 'Request failed'}, {status});
}
