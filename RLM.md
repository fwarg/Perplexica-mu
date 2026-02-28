# RLM × Perplexica Integration

Recursive LM (RLM) is used as an optional source-compression sidecar: after the researcher
collects web findings, RLM synthesises them into a compact digest before they are handed to
the writer LLM.  This reduces the writer's context size at the cost of a short extra latency
step.

---

## Architecture

```
Researcher → [searchFindings: Chunk[]]
    ↓  (if rlmEnabled && rlmServiceURL configured)
RLM HTTP service  ←── POST /summarize {findings, query}
    │  runs rlm.completion(context=findings, root_prompt=query)
    │  chunks → llm_query per chunk → synthesises → condensed digest
    ↓
[condensedFindings: string]  (replaces raw XML in writer prompt)
    ↓
Writer streamText (unchanged, now with smaller context)
```

If the RLM service is unavailable, disabled, or returns an error the raw XML findings are
used exactly as in the baseline — no change in user-visible behaviour.

The RLM service always uses the OpenAI client protocol.  It works with any OpenAI-compatible
local server (Lemonade, vLLM, LM Studio, Ollama with OpenAI adapter) as well as real OpenAI
cloud.

---

## Files created / modified (Phases 1 & 2)

### New files

| File | Purpose |
|---|---|
| `services/rlm-svc/main.py` | FastAPI service — `POST /summarize` calls `rlms.completion()` |
| `services/rlm-svc/requirements.txt` | Python deps: fastapi, uvicorn, rlms, python-dotenv |
| `services/rlm-svc/Dockerfile` | python:3.12-slim image, port 8020 |
| `src/lib/rlmClient.ts` | TypeScript fetch wrapper with 60 s timeout; returns null on error |

### Modified files

| File | Change |
|---|---|
| `docker-compose.yaml` | Added `rlm-svc` service under `profiles: [rlm]` (opt-in, invisible to existing deployments) |
| `src/lib/config/index.ts` | Added `rlmEnabled` (switch, default false) and `rlmServiceURL` (string) to system UI config section |
| `src/lib/agents/search/index.ts` | After research: reads config, optionally calls `summarizeWithRLM`, replaces `finalContext` with `<rlm_synthesis>` on success |

### Key implementation details

**`services/rlm-svc/main.py`**
- Receives `{ findings: [{title, content}], query }` via POST
- Formats findings as `["[1] Title\nContent", ...]`
- Calls `rlms.completion()` with:
  - `backend="openai"` (uses `OPENAI_BASE_URL` / `OPENAI_API_KEY` / `RLM_MODEL` from env)
  - `max_depth=1` (no child RLMs)
  - `max_iterations=8`
  - `environment="local"`
  - `compaction=False`
  - Extraction-focused system prompt (see source for full text)
- Returns `{ condensed: str }` or HTTP 500

**`src/lib/rlmClient.ts`**
- `summarizeWithRLM(findings, query, serviceURL): Promise<string | null>`
- 60 s AbortController timeout
- Returns `null` on any error (timeout, non-200, network failure)
- Caller (`search/index.ts`) falls back to raw XML findings when `null` is returned

**`src/lib/agents/search/index.ts`** change (lines 103–126):
```typescript
// finalContext starts as raw XML (original behaviour)
let finalContext = searchResults?.searchFindings.map(...).join('\n') || '';

const rlmEnabled = configManager.getConfig('system.rlmEnabled', false);
const rlmServiceURL = configManager.getConfig('system.rlmServiceURL', '');

if (rlmEnabled && rlmServiceURL && searchResults?.searchFindings.length) {
  const condensed = await summarizeWithRLM(
    searchResults.searchFindings.map(f => ({ title: f.metadata.title, content: f.content })),
    input.followUp,
    rlmServiceURL,
  );
  if (condensed) {
    finalContext = `<rlm_synthesis>${condensed}</rlm_synthesis>`;
  }
  // else: condensed is null → finalContext stays as raw XML
}
```

---

## Usage

### 1. Configure environment variables

In your `.env` or shell before starting docker compose:

```bash
# Required: model name as the backend server expects it
RLM_MODEL=llama-3.1-8b-instruct

# For a local OpenAI-compatible server (Lemonade, vLLM, LM Studio, Ollama):
OPENAI_BASE_URL=http://172.17.0.1:8080/v1
OPENAI_API_KEY=local          # any non-empty string for local servers

# For real OpenAI cloud (leave OPENAI_BASE_URL unset):
# OPENAI_API_KEY=sk-...
```

### 2. Start the stack with the rlm profile

```bash
docker compose --profile rlm up --build
```

The `perplexica` service starts as normal regardless of the profile; `rlm-svc` is only
started when `--profile rlm` is passed.

### 3. Enable RLM in the admin UI

1. Log in as admin
2. Settings → System
3. Enable **RLM Source Summarizer**
4. Set **RLM Service URL** to `http://rlm-svc:8020`
5. Save

---

## How to test

### Happy path
1. Start with `--profile rlm` (service must be running)
2. Enable RLM in admin Settings → System, URL = `http://rlm-svc:8020`
3. Run a search query
4. Check `docker compose logs rlm-svc` — you should see RLM iteration logs
5. The response should be returned normally (no regression)

### Graceful fallback — service down
1. Stop `rlm-svc`: `docker compose stop rlm-svc`
2. Keep RLM enabled in settings
3. Run a query — Perplexica should respond normally, using raw findings
4. `rlm-svc` logs will be silent; no error shown to user

### Graceful fallback — disabled in settings
1. Disable RLM Source Summarizer in admin settings
2. Run same query → identical behaviour to baseline

### Timeout test
Send a query while `rlm-svc` is deliberately slow (e.g., add a `time.sleep(70)` in
`main.py`).  After 60 s the `AbortController` fires, `summarizeWithRLM` returns `null`,
and the writer receives raw findings as normal.

---

## Potential Phase 3 — Streaming progress & UI feedback

Currently the RLM step is a silent black-box HTTP call: the user sees nothing until the
writer starts.  Phase 3 would surface RLM activity in the UI:

- **Server-Sent Events (SSE) from rlm-svc** — stream iteration progress events back via a
  `/summarize/stream` endpoint and a `ReadableStream` fetch.
- **Research block updates** — forward RLM progress as `research` sub-step events on the
  existing session event bus so the "Researching…" sidebar reflects RLM iterations.
- **Configurable timeout per query** — expose timeout as a per-request header or query param
  so power users can trade latency for thoroughness.
- **Retry / partial result** — if RLM times out, use whatever partial synthesis was produced
  rather than discarding it entirely.

### Files that would change
| File | Change |
|---|---|
| `services/rlm-svc/main.py` | Add `POST /summarize/stream` with SSE |
| `src/lib/rlmClient.ts` | Add streaming variant, forward events |
| `src/lib/agents/search/index.ts` | Emit RLM progress events to session |
| `src/lib/session.ts` | Possibly new block type for RLM status |

---

## Potential Phase 4 — Extended RLM pipeline roles

Apply RLM at other stages of the pipeline beyond source compression:

- **Query expansion** — before the researcher runs, use RLM to generate a richer set of
  search sub-queries from the user's question (currently the researcher LLM does this
  implicitly through tool calls).
- **Iterative refinement loop** — after the writer produces a draft, run a second RLM pass
  to check citation accuracy and factual consistency, then re-draft if issues are found.
- **Per-source deep-dive** — for each scraped URL, run a short RLM pass to extract the
  page's most relevant facts before deduplification, rather than truncating raw HTML.
- **Multi-hop reasoning** — enable `max_depth=2` for complex multi-step questions so child
  RLMs can independently investigate sub-questions.
- **Embedding-based chunk selection** — before passing findings to RLM, pre-filter with
  cosine similarity against the query using the existing embedding model, so RLM only sees
  the most relevant chunks (reduces token cost and RLM time).

### Files that would change
| File | Change |
|---|---|
| `services/rlm-svc/main.py` | Additional endpoints: `/expand-query`, `/verify-draft` |
| `src/lib/rlmClient.ts` | Additional exported functions per endpoint |
| `src/lib/agents/search/researcher/index.ts` | Optionally call RLM for query expansion |
| `src/lib/agents/search/index.ts` | Optionally call RLM verify pass after writer |
| `src/lib/config/index.ts` | Additional config keys per feature |
