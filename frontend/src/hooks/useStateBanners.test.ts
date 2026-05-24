import { describe, it, expect, beforeEach } from 'vitest'
import { canShowBanner, COOLDOWN_MS } from './useStateBanners'

describe('canShowBanner', () => {
  let lastFiredAt: Record<string, number>

  beforeEach(() => {
    lastFiredAt = {}
  })

  it('allows banner when no active banner and no prior fire', () => {
    expect(canShowBanner('watch', 3, Infinity, lastFiredAt, Date.now())).toBe(true)
  })

  it('blocks banner fired within cooldown window', () => {
    const now = Date.now()
    lastFiredAt['watch'] = now - (COOLDOWN_MS - 50)
    expect(canShowBanner('watch', 3, Infinity, lastFiredAt, now)).toBe(false)
  })

  it('allows banner after cooldown has expired', () => {
    const now = Date.now()
    lastFiredAt['watch'] = now - (COOLDOWN_MS + 10)
    expect(canShowBanner('watch', 3, Infinity, lastFiredAt, now)).toBe(true)
  })

  it('blocks lower-priority banner when higher-priority is active', () => {
    expect(canShowBanner('watch', 3, 1, lastFiredAt, Date.now())).toBe(false)
  })

  it('allows higher-priority banner to replace lower-priority active banner', () => {
    expect(canShowBanner('flip', 1, 3, lastFiredAt, Date.now())).toBe(true)
  })

  it('allows equal-priority banner when different id (independent cooldowns)', () => {
    const now = Date.now()
    lastFiredAt['alert'] = now - (COOLDOWN_MS + 10)
    expect(canShowBanner('alert', 2, Infinity, lastFiredAt, now)).toBe(true)
  })
})
