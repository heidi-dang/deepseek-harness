# Agent Note: Web all-interfaces host re-enabled

Status: implemented

English | [中文](2026-08-16-web-all-interfaces-host.zh.md)

## Problem

The CLI rejects `dsh web --host 0.0.0.0` as a usage error, removing a documented capability: the [web bind address note](2026-07-22-web-bind-address.md) and the [api browser-trust boundary note](../architecture/2026-07-28-api-browser-trust-boundary.md) both describe `--host 0.0.0.0` as the supported explicit all-interface mode, and the trust fence, LAN IP derivation, and loopback-gated privileged methods already exist to serve non-loopback deployments.

## Decision

`dsh web --host 0.0.0.0` is accepted again as the explicit all-interfaces mode. The `/api` browser-trust fence remains the protection: every request must present a loopback or trusted Host (DNS-rebinding defense), the Web runtime derives the machine's LAN IP literals into the trust list, `--trusted-host` declares named authorities, and the privileged method set stays loopback-only. There is still no authentication layer; an unauthenticated `0.0.0.0` deployment's trusted-network assumption is documented, not enforced.

## Alternatives considered

**Keep rejecting until an authentication layer exists.** Rejected because the fence already provides confused-deputy defense, the operator explicitly opts into network exposure, and authentication is deferred work tracked in the connection README — the rejection removed a capability the fence was built to support.

**Require `--trusted-host` alongside `--host 0.0.0.0`.** Rejected because the CLI already derives LAN IP literals for all-interfaces binds, and named authorities exist for DNS-reachable deployments; a mandatory flag would add ceremony without closing a fence gap.

## Consequences

A browser on another machine can reach the GUI with `dsh web --host 0.0.0.0`; privileged methods (settings, credentials, native dialogs, preset authoring) remain loopback-only. The trusted-network assumption of an unauthenticated all-interfaces deployment is explicit in the connection README, and the fence is a reachability policy, not authentication.