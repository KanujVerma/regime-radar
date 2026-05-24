import { describe, it, expect } from 'vitest'
import { clampFrame, isAtEnd } from '../useScrubber'

describe('scrubber logic', () => {
  it('clamps frame to valid range', () => {
    expect(clampFrame(-1, 10)).toBe(0)
    expect(clampFrame(15, 10)).toBe(9)
    expect(clampFrame(5, 10)).toBe(5)
  })

  it('clamps safely when totalFrames is 0 or 1', () => {
    expect(clampFrame(0, 0)).toBe(0)
    expect(clampFrame(5, 0)).toBe(0)
    expect(clampFrame(0, 1)).toBe(0)
  })

  it('isAtEnd is true when frame is last', () => {
    expect(isAtEnd(9, 10)).toBe(true)
    expect(isAtEnd(8, 10)).toBe(false)
  })

  it('isAtEnd is true when totalFrames is 0', () => {
    expect(isAtEnd(0, 0)).toBe(true)
  })
})
