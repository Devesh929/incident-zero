# Incident Zero — AI On-Call Engineer (Vercel Edition)

A **GitHub → Vercel deployable** Next.js 16 application with a polished incident command center, rule-driven investigation agent, evidence ledger, optional LLM tool selection and explanations, report exports, human approval UI and a fail-closed adapter for the event's Action API.

> **IMPORTANT: deployment scope.** Vercel hosts the dashboard and serverless investigation API. It **cannot** host the Astronomy Shop's Docker Compose microservices/Prometheus/Jaeger/OpenSearch stack as a single Compose deployment, and cannot provide a persistent 10-second alert daemon on its Hobby plan. This repository launches in clearly labeled **synthetic demo mode** without any credentials. Live mode works only after linking **externally hosted telemetry**. Real mutating actions are **locked** until the organiser's exact API contract is supplied, approved and mapped. This is **not a claim of a completed integration with the Bosch starter kit**.

> **Hackathon compliance:** The displayed event rules say code must be written on the event day after **09:15**, every teammate must contribute commits, and work must run on the team's own laptop. Using pre-written code or external cloud hosting for competition evaluation may violate these rules. Obtain approval or use this solely for learning/prototyping outside the judged submission. Do not conceal AI assistance or code provenance.

## 1. Deploy from your phone (no laptop)

1. Download `incident-zero-vercel.zip` from the chat. Unzip it using Android's Files app or a zip utility.
2. In GitHub, create a **new empty repository** (e.g. `incident-zero`).
3. Upload the **extracted files and folders** to the root of the GitHub repository, preserving `app/`, `lib/`, `public/`, `tests/`, `package.json`, etc. **Do not upload the ZIP itself expecting Vercel to unpack it.** GitHub's mobile browser may require “Desktop site” for multi-file/folder upload, or use a Git client on mobile that can commit a directory.
4. Open https://vercel.com/new and sign in with GitHub. Import the new repository.
5. Vercel should auto-detect **Next.js**. Keep Root Directory as `./`, Build Command `npm run build`, Install Command `npm install`.
6. Press **Deploy**. Without any keys, `/` opens the synthetic Incident Zero demo. The app's own `/api/health` shows which features are connected.
7. In Vercel → Project → Settings → Environment Variables, set the variables below **only when needed**. Redeploy after edits.

The first deploy is useful as a working interactive demo, not as a live on-call system.

## 2. Environment variables

Copy `.env.example` to `.env.local` for local development (never commit that file). **Do not place LLM keys in the frontend or in GitHub.**

| Variable | Required for | Explanation |
| --- | --- | --- |
| `APP_ACCESS_TOKEN` | Any API integrations | Nontrivial secret entered in UI's bottom-right password box; browser stores it in sessionStorage only. |
| `LLM_API_KEY` | Model narrative & tool selection | Groq API key (`gsk_...`) |
| `LLM_BASE_URL` | Provider endpoint | Defaults to `https://api.groq.com/openai/v1` |
| `LLM_MODEL` | Model ID | Defaults to `qwen/qwen3.8-27b` (on Groq) |
| `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` | Cloud state | Durable incident, approval lock and safety state; connect via Vercel Marketplace |
| `PROMETHEUS_URL`, `JAEGER_URL`, `OPENSEARCH_URL` | Live incident reads | Remote HTTPS endpoints accessible by Vercel Functions. Not `localhost`. |
| `OPENSEARCH_INDEX` | OpenSearch log reads | Defaults to `otel-logs-*`; index schema may require adjustment |
| `TELEMETRY_BEARER_TOKEN` | Optional telemetry proxy auth | Only use if all telemetry endpoints accept the same token. |
| `PROMETHEUS_ERROR_QUERY_TEMPLATE` / `PROMETHEUS_TOTAL_QUERY_TEMPLATE` | Custom metrics | Optional PromQL with `{service}` placeholder; calibrate to real OTel metric names |
| `ACTION_API_URL`, `ACTION_API_TOKEN` | Real execution | Requires organiser's documented and permitted Action API |
| `ACTION_API_MAPPING_JSON` | Real execution | Per-action approved `{path,method}` mapping from official starter kit. Adapter request BODY may require adaptation to organiser contract before enabling. |
| `KILL_SWITCH` | Real execution | Defaults to **true**, blocking all actions. Must explicitly set `false` after safe testing. Redis safety switch can additionally halt it. |

**Model behavior:** No LLM key → still works in deterministic evidence-driven synthetic mode. With an LLM key → selects one next read-only telemetry tool from a code-enforced allowlist and generates a supplementary explanation; it cannot change the diagnosis, evidence IDs, action, or approval. If LLM tool calling fails, a deterministic safe fallback investigates. No free-form shell or arbitrary HTTP tool is exposed.

## 3. Key features

- Synthetic demo scenarios based on the failure *categories* in the provided slides: payment, cart, catalogue, recommendation memory, ad CPU, traffic flood, container restart, network, database, healthy, ambiguous.
- Read-only metrics → LLM-selected next tool (optional) → remaining traces/logs/health tool calls; response logged as E1–E4. Real adapters query Prometheus, Jaeger and OpenSearch over HTTPS.
- Root-cause inference based on observed telemetry keywords and threshold signals rather than scenario IDs in the diagnosis function.
- Programmatic confidence/verification; evidence IDs must exist and at least two different observed signal sources are required.
- Conservative, allowlisted action proposals. An unsupported root cause escalates rather than guessing.
- Human approval UI displaying SHA-256 of immutable action payload.
- **No real actions in demo**, including demo approval, which only simulates a recovered state.
- For real actions: persistent Redis state, explicit authenticated actor, server-side hash check, idempotency approval lock, environment and Redis kill switches, approved mapping, Action API only, measured postcheck, no silent automatic rollback.
- Export JSON and Markdown reports; **organiser-specific JSON schema must still be plugged in**.
- Synthetic browser history in localStorage; optional cross-device server-side Upstash history.

## 4. Real deployment architecture

```text
Externally hosted Astronomy Shop + observability stack
                 │
     HTTPS read-only endpoints
         ┌───────┴──────────┐
         │ Vercel / Next.js │
         │ /api/investigate │──► Prometheus / Jaeger / OpenSearch
         │ rules + verifier│──► LLM (optional annotation only)
         │ /api/approve     │──► Redis: states, hash lock, kill switch
         └───────┬──────────┘
                 │ exact approved command ONLY
        Bosch organiser Action API [contract TBD]
```

This is **request-driven**. The browser initiates investigations; Vercel Hobby doesn't support a continuously running 10-second detector. For true always-on detection, deploy a separate authorised worker/scheduler next to the external telemetry stack. Do not claim automatic incident paging unless you implement and verify this additional component.

## 5. Safety / event restrictions

- No feature-flag reads and no flag API access. The agent only calls preconfigured telemetry services; a restricted name guard is applied.
- No modifications to the OpenTelemetry Demo's source, configuration or scoring harness.
- Do not modify services directly through Docker, Kubernetes or remote shell. All real mutation goes through the provided Action API and only after consent.
- Incomplete or missing telemetry stays unknown. The synthetic signal files are never referenced by live mode.
- No injected practice answer mapping in the core diagnosis function. The synthetic fixture table is for isolated demonstrations only.
- A restart is only temporary mitigation and may not fix the underlying memory leak; action outcomes should be checked over a sustained period.
- Any rollback that mutates the system also needs consent or explicit advance authorisation in the approved plan. This app does not perform unapproved rollback.
- Action API mapping and JSON schema must be confirmed against the official Bosch starter kit. The integration currently does **not** claim to be tested against that kit.
- Protect the deployed app; enabling `LLM_API_KEY` without `APP_ACCESS_TOKEN` intentionally returns HTTP 503.

## 6. Run locally (optional)

```bash
npm install
npm run dev
# open http://localhost:3000
npm test
```

No Docker, Python or databases are needed for demo mode. This Vercel edition uses Node/Next.js rather than the local Python + FastAPI architecture because deployment must fit serverless constraints.

## 7. API routes

- `GET /api/health`: integration status; no secrets
- `POST /api/investigate`: `{ "mode": "demo", "scenario_id": "recommendation_memory" }` or `{ "mode": "real", "service": "checkout", "symptom": "error spike" }`
- `GET /api/telemetry?service=checkout`: real read-only metrics (requires external config)
- `GET /api/history`: latest saved Redis incident records, if configured
- `POST /api/approve`: authenticated real approval `{incident_id, actor, approval_hash}` (no demo mutation)
- `POST /api/decision`: authenticated real rejection `{incident_id, actor}`
- `GET/POST /api/safety`: authenticated real kill-switch status/change (only changeable if environment allows)

Authentication: when `APP_ACCESS_TOKEN` is set, attach `Authorization: Bearer <token>` to API requests. Use the dashboard password box, not query parameters.

## 8. Tests and limitations

Run `npm test` for unit tests on generic root-cause inference, healthy-case abstention, evidence validation, action allowlists, hash binding, and forbidden service guards.

Not yet connected / not independently validated:

1. Bosch-provided `faultctl` and specific 10 practice incidents.
2. Required exact report JSON schema and any official scoring harness.
3. Exact Action API route payloads, permitted actions, any requirements for dry-run or rollback.
4. Real metric/trace/log field naming and authentication in your deployment; Jaeger API versions vary.
5. Browser UI against a real Vercel deployment (this project was generated in an environment without online npm installs).
6. Full always-on alert polling and durable cloud history absent optional services.

### Public source

OpenTelemetry Demo: https://github.com/open-telemetry/opentelemetry-demo

This repository is independent of, and not endorsed by, Bosch, PES University or OpenTelemetry.
