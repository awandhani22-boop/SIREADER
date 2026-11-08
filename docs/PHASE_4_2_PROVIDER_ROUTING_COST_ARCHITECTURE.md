# SIREADER Phase 4.2 — AI Provider Routing, Execution & Cost Guard

**Status:** PREPARATORY ARCHITECTURE DRAFT — not started  
**Dependency:** Phase 4.1 worker/task contract must pass; provider execution needs explicit owner budget approval  
**Authority:** Python Backend only. Never execute AI calls from the browser or Virtual Office.

## 1. Existing baseline

The Python Backend already contains a server-side AI pipeline:
- app/ai/ai_router.py uses FAST, REASONING and ESCALATION tiers.
- app/ai/omniroute_client.py owns provider HTTP execution.
- app/ai/cost_guard.py resolves provider/model billing, estimates prompt cost, atomically reserves budget, finalizes usage and records failures/duplicate request IDs.
- AIUsageLog stores provider request ID, model/tier, token usage, billing currency, reserved cost and actual cost.
- Existing retry safety treats RESERVED/UNKNOWN billing as uncertain and checks completed requests against persisted checkpoints.

Phase 4.2 must integrate generic worker attempts with this existing system. It must not create a parallel cost guard or bypass the existing Telegram analysis pipeline.

## 2. Locked provider boundary

- All model calls happen in Python Backend through approved server-side provider adapters.
- API keys, provider tokens, base URLs and database credentials remain server-only.
- Provider/model selection comes from backend allowlisted configuration and policy, never arbitrary task or browser input.
- Worker identity and provider/model assignment remain separate; model reassignment does not change a logical worker ID or avatar.
- The Virtual Office may display sanitized provider/model labels only when policy permits.

## 3. Routing contract

Use a deterministic, versioned policy:

| Tier | Intended work | Routing rule |
|---|---|---|
| FAST | bounded extraction/classification | configured FAST model |
| REASONING | multi-message context and structured reasoning | configured REASONING model |
| ESCALATION | difficult or ambiguous review | explicit policy reason and budget availability |

Routing inputs may include task type, capability, sensitivity class, input size, explicit escalation reason, prior attempt outcome and budget headroom. They must not include unvalidated free-form model identifiers.

Every routing decision records task/attempt/correlation IDs, policy version, selected provider/model/tier, allowed fallback and reason code. Unknown model, unknown pricing or disallowed provider fails closed.

## 4. Budget and billing lifecycle

Reuse the existing Cost Guard. Do not create a parallel reservation system.

1. Validate task eligibility, provider/model allowlist and input policy.
2. Allocate unique provider request ID and bind task/attempt context.
3. Estimate cost conservatively, including max output and cache billing rules.
4. Atomically reserve against currency-specific budgets before network I/O.
5. Reject before provider invocation if the reservation cannot be made.
6. Execute with bounded timeout and explicit provider response classification.
7. Finalize actual tokens/cost against reservation in the same billing currency.
8. Persist sanitized provider status, request ID and linked attempt.
9. Release/adjust reservations only through explicit terminal paths.

IDR and USD remain separate. Never add or convert them without an approved FX snapshot, timestamp, source and audit record. Daily/monthly soft and hard thresholds remain configuration-driven. Existing advisory locks and duplicate-request protection must not be removed.

UNKNOWN/RESERVED billing is not a normal retryable error. A timeout after a request may have reached a provider is not proof that no cost occurred.

## 5. Retry, fallback and escalation

- Retry only errors proven transient and only when billing state proves it is safe.
- Never automatically retry an uncertain provider request.
- Fallback is explicit, allowlisted, budget-reserved independently and recorded as another provider request/attempt.
- Escalation requires a policy reason and sufficient budget; never hide low confidence or failed validation by blindly using a more expensive model.
- Partial response, malformed JSON, refusal, timeout and provider outage have distinct normalized outcomes.
- Persist checkpoints so resume cannot double-pay for completed provider requests.

## 6. Task integration and privacy

A task attempt can make zero, one or multiple provider requests. The router must not own ORM, HTTP or UI details. Use a narrow backend service interface for route decision, reserve, execute and finalize.

Preserve the existing Telegram text-only evidence policy. Validate model output against strict schemas before task success. Exact source evidence/provenance stays distinct from model narrative. Unknown fields, fabricated evidence quotes, missing required fields and unsafe output become explicit validation failures. Provider bodies and exception stacks are redacted from logs.

## 7. Acceptance tests

- Provider allowlist and unknown-model fail-closed behavior.
- Reservation concurrency/no-overspend tests.
- IDR/USD separation.
- Hard/soft budget and reservation-finalization tests.
- Duplicate request ID and checkpoint/resume safety.
- Timeout/uncertain billing/manual recovery.
- Safe-vs-uncertain retry/fallback matrix.
- Refusal, malformed output, evidence mismatch and privacy redaction.
- Task attempt linkage and auditable provider request history.
- No provider SDK/key in frontend bundle or browser network.
- Controlled dry-run/canary and owner approval before any paid workload.

**Status:** PLANNED. Do not implement until Phase 4.1 passes and the owner explicitly approves provider execution and budget policy. No trading execution or approval bypass is authorized.
