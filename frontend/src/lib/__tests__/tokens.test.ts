import { describe, it, expect } from 'vitest'
import { typography, spacing, colors } from '../tokens'

describe('typography tokens', () => {
  it('microLabel uses textMuted color', () => {
    expect(typography.microLabel.color).toBe(colors.textMuted)
  })
  it('statXl is largest at 52', () => {
    expect(typography.statXl.fontSize).toBe(52)
    expect(typography.statXl.fontWeight).toBe(900)
  })
})

describe('spacing tokens', () => {
  it('pageX is 1.5rem', () => {
    expect(spacing.pageX).toBe('1.5rem')
  })
})
