import { useState, useEffect, useRef } from 'react'
import { api } from '../api/client'
import type { HealthResponse } from '../types/api'

const POLL_INTERVAL_MS = 60_000
const RETRY_INTERVAL_MS = 5_000
// Abort cold-start hangs so the 5s retry fires promptly instead of waiting 20-30s
const FETCH_TIMEOUT_MS = 8_000

export function useHealthStatus() {
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const connectedRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    let timerId: ReturnType<typeof setTimeout>

    async function poll() {
      const ac = new AbortController()
      const fetchTimeout = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS)
      try {
        const data = await api.health(ac.signal)
        if (!cancelled) {
          connectedRef.current = true
          setHealth(data)
        }
      } catch {
        // timeout, cold start, or unreachable — retry quickly until connected
      } finally {
        clearTimeout(fetchTimeout)
      }

      if (!cancelled) {
        const delay = connectedRef.current ? POLL_INTERVAL_MS : RETRY_INTERVAL_MS
        timerId = setTimeout(poll, delay)
      }
    }

    poll()
    return () => {
      cancelled = true
      clearTimeout(timerId)
    }
  }, [])

  return health
}
