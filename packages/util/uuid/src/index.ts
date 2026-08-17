/**
 * Zero-dependency RFC 4122 version 4 UUID generation for browser and Node.
 * @module @deepseek-ai/dsh-uuid
 */

/**
 * Generate an RFC 4122 version 4 UUID without requiring a secure context.
 *
 * `crypto.randomUUID` is a secure-context-only Web API: on a plain-HTTP origin
 * (a LAN or Tailscale address serving `dsh web`) it is `undefined`, so any
 * browser code that calls it throws. `crypto.getRandomValues` is exposed on
 * insecure origins too, so this helper is the safe base for wire correlation
 * ids, message ids, and draft attachment ids in browser-reachable code.
 * @returns a UUID backed by `crypto.getRandomValues()`.
 */
export function randomUuid(): string {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16))
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  view.setUint8(6, (view.getUint8(6) & 0x0f) | 0x40)
  view.setUint8(8, (view.getUint8(8) & 0x3f) | 0x80)
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
