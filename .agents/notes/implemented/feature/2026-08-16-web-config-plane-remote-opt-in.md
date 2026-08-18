# Agent Note: Explicit opt-in for remote configuration-plane access

Status: implemented

English | [中文](2026-08-16-web-config-plane-remote-opt-in.zh.md)

## Problem

The privileged method set — `settings.describe`/`update`/`replace`/`mutate`, `credentials.describe`/`set`/`unset`, agent-preset management (`agentPreset.read`/`copy`/`openDocument`/`remove`), `host.pickDirectory`/`openPath`, and `llm.discoverModels` — stays loopback-only, so `dsh web --host 0.0.0.0` serves the GUI settings, models, and agent-presets pages to LAN or Tailscale browsers that get 403 on them. That is by design: `trustedHosts` is a DNS-rebinding fence, not authentication, and the Web carrier has no authentication layer, so fence trust alone must not open methods that read and mutate settings and credentials.

## Decision

A new `privilegedTrustedHosts` config on `dsh-client-connection` (web CLI flag `--trusted-config-host <authority...>`) explicitly grants the named authorities access to the privileged configuration-plane methods. The grant is deliberately separate from `trustedHosts`: the fence is not authentication, so this opt-in is the user-chosen way to use the settings, models, and agent-presets pages from a LAN or Tailscale device. The default is empty, preserving loopback-only. Authorities must still pass the fence first; the opt-in lifts the loopback pin only after the fence admits the request.

## Alternatives considered

**Open the configuration plane to every fence-trusted host.** Rejected because the fence is a reachability policy against DNS rebinding, not authentication: any LAN device a browser can be rebound to would then read and mutate settings and credentials over plain HTTP.

**Add a real authentication layer.** Deferred: the Web carrier still has none, and the explicit opt-in keeps the dangerous surface closed by default while enabling the GUI pages the all-interfaces host re-enablement restores.

## Consequences

Named authorities can read and mutate settings and credentials, manage agent presets, drive native dialogs, and discover models over plain HTTP — an explicit trust tradeoff the operator makes by configuring `privilegedTrustedHosts` or passing `--trusted-config-host`. Empty-default keeps existing all-interfaces deployments loopback-only on the configuration plane until they opt in. The CLI reference documents the flag.

## Related

The [api browser-trust boundary note](../architecture/2026-07-28-api-browser-trust-boundary.md) — the fence the opt-in is deliberately separate from, and that every request must still pass. The [web all-interfaces host note](2026-08-16-web-all-interfaces-host.md) — the `--host 0.0.0.0` re-enablement whose GUI pages this opt-in serves remotely.
