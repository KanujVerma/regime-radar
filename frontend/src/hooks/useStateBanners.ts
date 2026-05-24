import { useState, useCallback, useRef } from 'react'

export const COOLDOWN_MS = 250
const AUTO_DISMISS_MS = 2200

export interface BannerState {
  id: string
  text: string
  color: string
  priority: number
}

/**
 * Pure function — extracted for unit testing.
 * Returns true if the banner should be shown given current system state.
 */
export function canShowBanner(
  bannerId: string,
  incomingPriority: number,
  currentPriority: number,
  lastFiredAt: Record<string, number>,
  now: number,
): boolean {
  const lastFired = lastFiredAt[bannerId] ?? 0
  if (now - lastFired < COOLDOWN_MS) return false
  if (incomingPriority >= currentPriority) return false
  return true
}

export function useStateBanners() {
  const [activeBanner, setActiveBanner] = useState<BannerState | null>(null)
  const lastFiredAt = useRef<Record<string, number>>({})
  const currentPriority = useRef<number>(Infinity)
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showBanner = useCallback((banner: BannerState) => {
    const now = Date.now()
    if (!canShowBanner(banner.id, banner.priority, currentPriority.current, lastFiredAt.current, now)) {
      return
    }

    lastFiredAt.current[banner.id] = now
    currentPriority.current = banner.priority

    if (dismissTimer.current) clearTimeout(dismissTimer.current)
    setActiveBanner(banner)

    dismissTimer.current = setTimeout(() => {
      setActiveBanner(null)
      currentPriority.current = Infinity
    }, AUTO_DISMISS_MS)
  }, [])

  return { activeBanner, showBanner }
}
