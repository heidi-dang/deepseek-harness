import { describe, expect, it } from 'vitest'
import { randomUuid } from '@deepseek-ai/dsh-uuid'

const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

describe('randomUuid', () => {
  it('returns a string matching the RFC 4122 v4 UUID pattern', () => {
    // Arrange
    const uuid = randomUuid()

    // Act + Assert
    expect(uuid).toMatch(UUID_V4_PATTERN)
  })

  it('sets the version nibble to 4 and the variant nibble to 8/9/a/b', () => {
    // Arrange
    const uuid = randomUuid()

    // Act + Assert: the pattern pins the version digit after the second dash
    // and the variant digit after the third dash.
    expect(uuid).toMatch(UUID_V4_PATTERN)
    expect(uuid[14]).toBe('4')
    expect('89ab').toContain(uuid[19])
  })

  it('returns a different value on each call', () => {
    // Arrange
    const first = randomUuid()
    const second = randomUuid()

    // Act + Assert
    expect(second).not.toBe(first)
  })

  it('works when globalThis.crypto is present', () => {
    // Arrange: Node >=19 exposes globalThis.crypto; no mocking needed.
    expect(globalThis.crypto).toBeDefined()

    // Act + Assert
    expect(randomUuid()).toMatch(UUID_V4_PATTERN)
  })
})
