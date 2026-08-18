# Agent Note: 远程配置面访问的显式选择加入

Status: implemented

[English](2026-08-16-web-config-plane-remote-opt-in.md) | 中文

## 问题

特权方法集——`settings.describe`/`update`/`replace`/`mutate`、`credentials.describe`/`set`/`unset`、agent（智能体）preset 管理（`agentPreset.read`/`copy`/`openDocument`/`remove`）、`host.pickDirectory`/`openPath` 与 `llm.discoverModels`——仍只限回环本机，因此 `dsh web --host 0.0.0.0` 把 GUI 的 settings、models 与 agent-presets 页面提供给 LAN 或 Tailscale 浏览器，而这些页面会返回 403。这是设计使然：`trustedHosts` 是 DNS-rebinding 栅栏而不是认证，Web 载体也没有认证层，所以仅凭栅栏信任不能打开会读取并改写 settings 与凭据的方法。

## 决策

`dsh-client-connection` 上新增的 `privilegedTrustedHosts` 配置（web CLI flag `--trusted-config-host <authority...>`）把特权配置面方法显式开放给具名权威。该授权刻意与 `trustedHosts` 分离：栅栏不是认证，因此这个选择加入才是用户从 LAN 或 Tailscale 设备使用 settings、models 与 agent-presets 页面的既有方式。默认值为空，保持只限回环本机。权威仍必须先通过栅栏；选择加入只在栅栏放行该请求之后才解除回环限制。

## 曾考虑的替代方案

**向所有栅栏信任的宿主开放配置面。** 不予采纳，因为栅栏是针对 DNS rebinding 的可达性策略而不是认证：任何浏览器可被重绑到的 LAN 设备都能在明文 HTTP 下读取并改写 settings 与凭据。

**引入真正的认证层。** 暂缓：Web 载体仍然没有认证层，而显式选择加入在默认关闭危险表面的同时，让全接口宿主重新启用所恢复的 GUI 页面得以使用。

## 后果

具名权威可以在明文 HTTP 下读取并改写 settings 与凭据、管理 agent（智能体）preset、驱动原生对话框并发现模型——这是操作者通过配置 `privilegedTrustedHosts` 或传 `--trusted-config-host` 而明确接受的信任权衡。默认值为空使现有全接口部署的配置面在选择加入前仍只限回环本机。CLI reference 记录了该 flag。

## 相关

[api 浏览器信任边界 note](../architecture/2026-07-28-api-browser-trust-boundary.md)——本选择加入刻意与之分离、且每个请求仍必须通过的栅栏。[web 全接口宿主 note](2026-08-16-web-all-interfaces-host.md)——`--host 0.0.0.0` 重新启用所恢复的 GUI 页面，由本选择加入提供远程服务。
