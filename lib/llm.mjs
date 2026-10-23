const GROQ_DEFAULT_KEY = process.env.LLM_API_KEY || process.env.GROQ_API_KEY || '';
const GROQ_DEFAULT_BASE_URL = process.env.LLM_BASE_URL || 'https://api.groq.com/openai/v1';
const GROQ_DEFAULT_MODEL = process.env.LLM_MODEL || 'qwen/qwen3.8-27b';

// The model only produces a constrained explanatory note. Never let it authorise mutations.
export async function explainWithLLM(diagnosis, evidence){
 const apiKey = process.env.LLM_API_KEY || GROQ_DEFAULT_KEY;
 if(!apiKey) return null;
 const url = new URL(process.env.LLM_BASE_URL || GROQ_DEFAULT_BASE_URL);
 if(url.protocol !== 'https:') return null;
 const model = process.env.LLM_MODEL || GROQ_DEFAULT_MODEL;
 const abort = new AbortController(), timer = setTimeout(() => abort.abort(), 16000);
 try {
  const r = await fetch(`${url.href.replace(/\/$/, '')}/chat/completions`, {
   method: 'POST',
   signal: abort.signal,
   headers: {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json'
   },
   body: JSON.stringify({
    model,
    temperature: 0,
    max_tokens: 200,
    messages: [
     {
      role: 'system',
      content: 'You are a cautious incident investigator. Return one or two clear sentences describing the observed diagnosis and what remains uncertain. Only cite evidence IDs and facts provided. Do not invent new evidence or recommend direct shell, flagd or Docker changes. If uncertain, say so. Never disclose secrets.'
     },
     {
      role: 'user',
      content: JSON.stringify({
       diagnosis,
       evidence: evidence.map(e => ({ id: e.id, tool: e.tool, summary: e.data.summary || e.data.error || 'none' }))
      })
     }
    ]
   })
  });
  if(!r.ok) return null;
  const j = await r.json();
  return String(j.choices?.[0]?.message?.content || '').slice(0, 950) || null;
 } catch {
  return null;
 } finally {
  clearTimeout(timer);
 }
}

// A tightly sandboxed, optional LLM tool-choice step: the model can select WHICH
// read-only telemetry tool is queried next. It cannot set URLs/arguments or mutate.
export async function chooseNextTool(service, evidence, allowed){
 const apiKey = process.env.LLM_API_KEY || GROQ_DEFAULT_KEY;
 if(!apiKey || !allowed.length) return null;
 const endpoint = new URL(process.env.LLM_BASE_URL || GROQ_DEFAULT_BASE_URL);
 if(endpoint.protocol !== 'https:') return null;
 const model = process.env.LLM_MODEL || GROQ_DEFAULT_MODEL;
 const abort = new AbortController(), timer = setTimeout(() => abort.abort(), 8000);
 try {
  const res = await fetch(`${endpoint.href.replace(/\/$/, '')}/chat/completions`, {
   method: 'POST',
   signal: abort.signal,
   headers: {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json'
   },
   body: JSON.stringify({
    model,
    temperature: 0,
    max_tokens: 115,
    messages: [
     {
      role: 'system',
      content: 'You are an incident investigator. Select exactly ONE next read-only telemetry tool by examining evidence so far. Tool arguments, targets and endpoints are fixed by server policy. Only query allowed tools. Never access feature flags. No guesses about the incident root cause beyond evidence.'
     },
     {
      role: 'user',
      content: JSON.stringify({
       service,
       already_observed: evidence.map(e => ({ id: e.id, tool: e.tool, summary: e.data.summary || e.data.error || 'none' })),
       allowed_next_tools: allowed
      })
     }
    ],
    tools: [
     {
      type: 'function',
      function: {
       name: 'choose_telemetry_tool',
       description: 'Select one authorised read-only data source',
       parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
         tool: { type: 'string', enum: allowed },
         reason: { type: 'string' }
        },
        required: ['tool', 'reason']
       }
      }
     }
    ],
    tool_choice: { type: 'function', function: { name: 'choose_telemetry_tool' } }
   })
  });
  if(!res.ok) return null;
  const body = await res.json();
  const call = body.choices?.[0]?.message?.tool_calls?.find(x => x.function?.name === 'choose_telemetry_tool');
  if(!call) return null;
  const answer = JSON.parse(call.function.arguments || '{}');
  if(!allowed.includes(answer.tool)) return null;
  return { tool: answer.tool, reason: String(answer.reason || '').slice(0, 180) };
 } catch {
  return null;
 } finally {
  clearTimeout(timer);
 }
}
