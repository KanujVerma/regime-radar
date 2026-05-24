import { describe, it, expect } from 'vitest'
import { clampFrame, isAtEnd } from '../useScrubber'

describe('scrubber logic', () => {
  it('clamps frame to valid range', () => {
    expect(clampFrame(-1, 10)).toBe(0)
    expect(clampFrame(15, 10)).toBe(9)
    expect(clampFrame(5, 10)).toBe(5)
  })

  it('isAtEnd is true when frame is last', () => {
    expect(isAtEnd(9, 10)).toBe(true)
    expect(isAtEnd(8, 10)).toBe(false)
  })
})
