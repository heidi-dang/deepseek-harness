# Agent Note: 不安全源上的 UUID 生成

Status: implemented

[English](2026-08-16-uuid-insecure-origin.md) | 中文

## 问题

`crypto.randomUUID` 是仅限安全上下文的 Web API：在纯 HTTP 源（提供 `dsh web` 的 LAN 或 Tailscale 地址）上它为 `undefined`，因此浏览器可达的代码调用它会抛出 `crypto.randomUUID is not a function`。`--host 0.0.0.0` 变更让 GUI 可从其他机器的浏览器经纯 HTTP 访问，使 wire 关联 id（`dsh-client-connection` fixture 与 rpc）和草稿附件 id（`dsh-client-ui-conversation`）暴露于该故障。

## 决策

新的零依赖 `@deepseek-ai/dsh-uuid` 包提供 `randomUuid()`，由 `crypto.getRandomValues()` 支撑——它在不安全源上同样可用。已更新的消费者：`dsh-client-connection`（fixture + rpc）、`dsh-host-apiproxy`（`mintRpcId`）、`dsh-client-ui-conversation`（草稿附件 id）。

有意保持不变的仅宿主站点：`dsh-llm` `createMessage`、`dsh-commands` `instanceToken`、`dsh-anonymous-user-id`——它们运行在 Node >=19 上，后者拥有 `crypto.randomUUID`。

## 曾考虑的替代方案

**要求浏览器可达代码处于安全上下文。** 不予采纳，因为全接口 Web 部署明确是纯 HTTP LAN；强制 HTTPS 会移除 `--host 0.0.0.0` 变更恢复的能力。

**引入第三方 UUID 依赖。** 不予采纳，因为所需表面只是基于 `crypto.getRandomValues` 的几行代码，零依赖的 `dsh-uuid` 工具符合仓库的工具包模式。

## 后果

浏览器可达代码不再依赖安全上下文的可用性：wire 关联 id 与草稿附件 id 在纯 HTTP LAN/Tailscale 源上正常工作。仅宿主站点在 Node >=19 上继续使用 `crypto.randomUUID`。`@deepseek-ai/dsh-uuid` 是跨浏览器与 Node 消费者的 UUID 生成的唯一归属。

## 相关

[web 全接口宿主 note](2026-08-16-web-all-interfaces-host.md)——`--host 0.0.0.0` 变更通过让 GUI 可从其他机器的浏览器经纯 HTTP 访问而暴露了此 bug。
