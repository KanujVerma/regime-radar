import { useState, useEffect, useRef } from 'react'
import { api } from '../api/client'
import type { HealthResponse } from '../types/api'

const POLL_INTERVAL_MS = 60_000
const RETRY_INTERVAL_MS = 5_000

export function useHealthStatus() {
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const connectedRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    let timerId: ReturnType<typeof setTimeout>

    async function poll() {
      try {
        const data = await api.health()
        if (!cancelled) {
          connectedRef.current = true
          setHealth(data)
        }
      } catch {
        // backend unreachable — retry quickly if never connected, else wait full interval
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
