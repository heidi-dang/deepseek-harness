# Agent Note: 仅推理的完成按 EMPTY_RESPONSE 处理

Status: implemented

[English](2026-08-16-reasoning-only-stop-empty-response.md) | 中文

## 问题

模型的某次回复可能以 `stop` 结束，但其内容只包含 reasoning/thinking 块，没有任何可见文本或工具调用。Harness 将此视为一次成功的空回复：`mapStopReason`（pi-ai）和 DeepSeek `translate` 的 `[DONE]` 哨兵此前只检查内容块是否为**零**，因此单个 thinking 块会以 `{kind: 'stop'}` 通过。agent 循环随后看不到工具调用，便以 `completed` 结束该回合——用户看到会话在没有答案、也没有错误的情况下停止。该现象由 `heidi-antigravity` 经 `heidi-gateway`（`gemini-3.6-flash-tiered`）触发：返回的响应 `reasoning_content` 有内容而 `content` 为空。

## 决策

没有用户可见块（`text` 或 `tool-call`）的 `stop` 完成是退化的提供商完成，映射为既有的 `EMPTY_RESPONSE` 错误：

- `packages/llm/llm-pi-ai/src/stream.ts` —— `mapStopReason` 现在要求至少一个 `text` 或 `toolCall` 内容块。
- `packages/llm/llm-deepseek/src/translate.ts` —— `[DONE]` 哨兵现在要求打开过 `text` 或 `tool-call` 块；仅 reasoning 的流以同样的方式失败。

无需修改 agent 循环：`EMPTY_RESPONSE_CODE` 已在 `DEFAULT_RETRYABLE_CODES` 中，既有的 `agent/request-error` → `llm-retry` 路径会以有界退避重试请求，而不是静默完成。

## 备选方案

**在 agent 循环中增加仅 reasoning 检查。** 已拒绝：分类属于适配器，它们本来就负责空响应检测和可重试的 `EMPTY_RESPONSE` 码；循环已经通过重试瀑布处理 `error` 结束。

**将仅 reasoning 视为用户可见答案。** 已拒绝：思考不是答案；被脱敏的思考（`redacted: true`）承载更少信息，两种情况都不会给用户带来任何可执行内容。

## 影响

退化的仅 reasoning 完成会被自动重试，重试耗尽后以 `EMPTY_RESPONSE` 失败呈现，而不是静默地以 `completed` 结束回合。合法的 `stop` + 文本与 `stop` + 工具调用不受影响；`length`（max-tokens）截断保持不变。

## 相关

触发本次变更的审计会话（`session-a05685d7-4443-4423-842e-d184995f6043`）：模型返回仅 reasoning 的输出后，一个 preset 安装任务以 `completed` 结束且没有任何答案。
