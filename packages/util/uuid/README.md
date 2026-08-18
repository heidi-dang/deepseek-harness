# dsh-uuid

English | [中文](README.zh.md)

Zero-dependency RFC 4122 version 4 UUID generation that works on insecure browser origins — backed by `crypto.getRandomValues`, not the secure-context-only `crypto.randomUUID`.

## Why this exists

`crypto.randomUUID` is a secure-context-only Web API: on a plain-HTTP origin (a LAN or Tailscale address serving `dsh web`) it is `undefined`, so any browser code that calls it throws `crypto.randomUUID is not a function`. `crypto.getRandomValues` is exposed on insecure origins too, so this helper is the safe base for wire correlation ids, message ids, and draft attachment ids in browser-reachable code. See the [Agent Note](../../../.agents/notes/implemented/feature/2026-08-16-uuid-insecure-origin.md).

## API

```ts
import { randomUuid } from '@deepseek-ai/dsh-uuid'
```

| Export | Role |
|---|---|
| `randomUuid()` | Generate an RFC 4122 version 4 UUID from `crypto.getRandomValues()`, with the version nibble set to 4 and the variant nibble set to 8/9/a/b. |

## Model Experience

None, as this utility only mints random ids; consumers own any model-visible use of the value.

#### KV Cache effect

No direct invalidation; the named consumer owns any request-prefix changes.

## Known Limitations and Deferred Work

- **No monotonic or ordered ids** — this is a random v4 generator only.
- **No namespace-based (v3/v5) or time-based (v1/v7) variants** — only random v4 is provided.
