# Agent Note: 重新启用 Web 全接口宿主

Status: implemented

[English](2026-08-16-web-all-interfaces-host.md) | 中文

## 问题

CLI 把 `dsh web --host 0.0.0.0` 当作用法错误拒绝，移除了一项已有文档记载的能力：[web 绑定地址 note](2026-07-22-web-bind-address.md) 与 [api 浏览器信任边界 note](../architecture/2026-07-28-api-browser-trust-boundary.md) 都把 `--host 0.0.0.0` 描述为受支持的显式全接口模式，而信任栅栏、LAN IP 推导与仅限回环的特权方法本就为服务非回环部署而存在。

## 决策

`dsh web --host 0.0.0.0` 重新作为显式全接口模式被接受。`/api` 浏览器信任栅栏仍是防护：每个请求的 `Host` 都必须是回环或受信任权威（DNS rebinding 防御），Web 运行时把本机 LAN IP 字面量推导进信任表，`--trusted-host` 声明具名权威，特权方法集仍仅限回环。依然没有认证层；未认证 `0.0.0.0` 部署的「可信网络」假设是成文的，而非强制执行的。

## 曾考虑的替代方案

**在认证层出现之前继续拒绝。** 不予采纳，因为栅栏已提供混淆代理人防御，操作者显式选择暴露到网络，而认证是 connection README 中记录的延期工作——拒绝移除的正是栅栏为之而建的能力。

**要求 `--host 0.0.0.0` 必须搭配 `--trusted-host`。** 不予采纳，因为 CLI 已为全接口绑定推导 LAN IP 字面量，具名权威是为 DNS 可达部署准备的；强制 flag 只会增加仪式感，不会堵上栅栏的任何缺口。

## 后果

其他机器上的浏览器可以用 `dsh web --host 0.0.0.0` 访问 GUI；特权方法（settings、credentials、原生对话框、preset 创作）仍仅限回环。未认证全接口部署的「可信网络」假设在 connection README 中成文，栅栏是可达性策略，而不是认证。

对于另一台 Tailscale 设备上的浏览器，当 `100.x` 地址在 bind 时已存在时，自动派生的 LAN 字面量已能覆盖；现在 Web 运行时还会探测运行中的 Tailscale 守护进程，信任宿主的 `100.x`/`fd7a::` 地址与 `<device>.ts.net` 魔名 DNS 名，因此纯 Tailscale 部署（无其他 LAN 网卡）或按名字连接时也能通过栅栏，无需手动 `--trusted-host`。探测为尽力而为且有时限：Tailscale 不存在、尚未运行或不可达时不产生额外权威；每个候选都经 `assertTrustedAuthority` 校验，畸形形状会被跳过而非导致加载失败。发现与 LAN 字面量一样是启动期快照，故 `dsh web` 启动后才出现的 Tailscale 地址仍需重启才能被信任。让特权方法对相同远程权威开放的单独 `--trusted-config-host` 授权见 connection README。