# Agent Note: Insecure-origin UUID generation

Status: implemented

English | [中文](2026-08-16-uuid-insecure-origin.zh.md)

## Problem

`crypto.randomUUID` is a secure-context-only Web API: on a plain-HTTP origin (a LAN or Tailscale address serving `dsh web`) it is `undefined`, so browser-reachable code that calls it throws `crypto.randomUUID is not a function`. The `--host 0.0.0.0` change made the GUI reachable from other machines' browsers over plain HTTP, exposing wire correlation ids (`dsh-client-connection` fixture and rpc) and draft attachment ids (`dsh-client-ui-conversation`) to this failure.

## Decision

A new zero-dependency `@deepseek-ai/dsh-uuid` package provides `randomUuid()`, backed by `crypto.getRandomValues()` — which is exposed on insecure origins too. Consumers updated: `dsh-client-connection` (fixture + rpc), `dsh-host-apiproxy` (`mintRpcId`), `dsh-client-ui-conversation` (draft attachment ids).

Intentionally unchanged host-only sites: `dsh-llm` `createMessage`, `dsh-commands` `instanceToken`, `dsh-anonymous-user-id` — they run on Node >=19, which has `crypto.randomUUID`.

## Alternatives considered

**Require a secure context for browser-reachable code.** Rejected because the all-interfaces web deployment is explicitly plain-HTTP LAN; forcing HTTPS would remove the capability the `--host 0.0.0.0` change restored.

**Add a third-party UUID dependency.** Rejected because the needed surface is a few lines over `crypto.getRandomValues`, and a zero-dependency `dsh-uuid` util keeps the fix in the repo's util package pattern.

## Consequences

Browser-reachable code no longer depends on secure-context availability: wire correlation ids and draft attachment ids work on plain-HTTP LAN/Tailscale origins. Host-only sites keep `crypto.randomUUID` on Node >=19. `@deepseek-ai/dsh-uuid` is the single home for UUID generation across browser and Node consumers.

## Related

The [web all-interfaces host note](2026-08-16-web-all-interfaces-host.md) — the `--host 0.0.0.0` change that exposed this bug by making the GUI reachable from other machines' browsers over plain HTTP.
