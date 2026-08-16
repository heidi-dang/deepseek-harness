# dsh-uuid

[English](README.md) | 中文

零依赖的 RFC 4122 版本 4 UUID 生成，可在不安全的浏览器源上工作——基于 `crypto.getRandomValues`，而非仅限安全上下文的 `crypto.randomUUID`。

## 为什么存在

`crypto.randomUUID` 是仅限安全上下文的 Web API：在纯 HTTP 源（提供 `dsh web` 的 LAN 或 Tailscale 地址）上它是 `undefined`，任何调用它的浏览器代码都会抛出 `crypto.randomUUID is not a function`。`crypto.getRandomValues` 在不安全源上同样可用，因此这个辅助函数是浏览器可达代码中 wire 关联 id、消息 id 与草稿附件 id 的安全基础。参见 [Agent Note](../../../.agents/notes/implemented/feature/2026-08-16-uuid-insecure-origin.md)。

## 对外接口

```ts
import { randomUuid } from '@deepseek-ai/dsh-uuid'
```

| 导出 | 作用 |
|---|---|
| `randomUuid()` | 从 `crypto.getRandomValues()` 生成 RFC 4122 版本 4 UUID，版本半字节设为 4，变体半字节设为 8/9/a/b。 |

## 模型体验

无，此工具仅生成随机 id；消费者拥有该值的任何模型可见用途。

#### KV 缓存影响

无直接失效；具名消费者拥有任何请求前缀变更。

## 已知限制与延期工作

- **无单调或有序 id**——这只是随机 v4 生成器。
- **无基于命名空间（v3/v5）或基于时间（v1/v7）的变体**——仅提供随机 v4。
