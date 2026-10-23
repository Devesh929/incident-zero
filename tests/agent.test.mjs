import test from 'node:test';
import assert from 'node:assert/strict';
import {SCENARIOS,syntheticTool} from '../lib/scenarios.mjs';
import {TOOLS,ledger,diagnose,verify,propose,hashPayload,safeService} from '../lib/core.mjs';
function run(id){const e=ledger(TOOLS.map(tool=>({tool,data:syntheticTool(id,tool)})));const d=diagnose(e);d.validated=verify(d,e);return {e,d,proposal:propose(d)}}
test('sampled scenarios use generic evidence-driven diagnosis',()=>{for(const s of SCENARIOS){const {d,e}=run(s.id);assert.equal(e.length,4);assert.ok(d.confidence>=0&&d.confidence<=1);assert.ok(d.evidence_ids.every(id=>e.some(v=>v.id===id)));}});
test('healthy case abstains',()=>{const {d,proposal}=run('healthy');assert.equal(d.validated,false);assert.equal(proposal,null)});
test('ambiguous case abstains',()=>{const {d,proposal}=run('ambiguous');assert.equal(d.validated,false);assert.equal(proposal,null)});
test('memory fault yields evidence-bound proposal',()=>{const {d,proposal}=run('recommendation_memory');assert.equal(d.cause_code,'memory_exhaustion');assert.equal(d.validated,true);assert.equal(proposal.type,'restart_service')});
test('traffic fault yields throttling proposal',()=>{const {d,proposal}=run('homepage_traffic');assert.equal(d.cause_code,'traffic_overload');assert.equal(proposal.type,'throttle_load_generator')});
test('ambiguous dependency failure escalates without risky restart',()=>{const {d,proposal}=run('database_down');assert.equal(d.validated,true);assert.equal(proposal,null)});
test('missing citations are rejected',()=>{const {d,e}=run('recommendation_memory');d.evidence_ids=['E999'];assert.equal(verify(d,e),false)});
test('single tool is insufficient to verify',()=>{const e=ledger([{tool:'metrics',data:syntheticTool('recommendation_memory','metrics')}]);const d=diagnose(e);assert.equal(verify(d,e),false)});
test('restricted flags cannot be queried by service name',()=>{for(const s of ['flagd','feature-flag','flag-ui','../etc','http://localhost'])assert.equal(safeService(s),false)});
test('hash is stable under property reordering and different for edited payload',()=>{const a={type:'restart_service',target:'payment',parameters:{a:1,b:2}},b={parameters:{b:2,a:1},target:'payment',type:'restart_service'};assert.equal(hashPayload(a),hashPayload(b));assert.notEqual(hashPayload(a),hashPayload({...a,target:'checkout'}))});
test('no proposal for unsupported cause codes',()=>{const d={validated:true,cause_code:'unsupported',component:'frontend'};assert.equal(propose(d),null)});
