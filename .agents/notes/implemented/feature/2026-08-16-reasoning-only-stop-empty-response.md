# Agent Note: Reasoning-only completions surface as EMPTY_RESPONSE

Status: implemented

English | [中文](2026-08-16-reasoning-only-stop-empty-response.zh.md)

## Problem

A model turn can end with a `stop` finish reason whose content contains only reasoning/thinking blocks and no visible text or tool call. The harness treated this as a successful empty completion: `mapStopReason` (pi-ai) and the DeepSeek `translate` `[DONE]` sentinel only checked for **zero** content blocks, so a single thinking block slipped through as `{kind: 'stop'}`. The agent loop then saw no tool calls and ended the turn `completed` — the user saw the session stop with no answer and no error. Observed with `heidi-antigravity` via `heidi-gateway` (`gemini-3.6-flash-tiered`), which returned a response with `reasoning_content` populated and an empty `content`.

## Decision

A `stop` finish with no user-visible block (`text` or `tool-call`) is a degenerate provider completion and maps to the existing `EMPTY_RESPONSE` error:

- `packages/llm/llm-pi-ai/src/stream.ts` — `mapStopReason` now requires at least one `text` or `toolCall` content block.
- `packages/llm/llm-deepseek/src/translate.ts` — the `[DONE]` sentinel now requires an opened `text` or `tool-call` block; reasoning-only streams fail the same way.

No agent-loop change was needed: `EMPTY_RESPONSE_CODE` is already in `DEFAULT_RETRYABLE_CODES`, so the existing `agent/request-error` → `llm-retry` path retries the request with bounded backoff instead of silently completing.

## Alternatives considered

**Add a reasoning-only check in the agent loop.** Rejected: classification belongs to the adapters, which already own the empty-response detection and the retryable `EMPTY_RESPONSE` code; the loop already routes `error` finishes through the retry waterfall.

**Treat reasoning-only as a user-visible answer.** Rejected: thinking is not an answer; redacted thinking (`redacted: true`) carries even less, and both cases deliver nothing actionable to the user.

## Consequences

Degenerate reasoning-only completions are retried automatically and surface as `EMPTY_RESPONSE` failures when retries are exhausted, instead of silently ending the turn `completed`. Legitimate `stop` + text and `stop` + tool-call completions are unaffected; `length` (max-tokens) truncation is untouched.

## Related

The audited session (`session-a05685d7-4443-4423-842e-d184995f6043`) that motivated this change: a preset-install task ended `completed` with no answer after the model returned reasoning-only output.
