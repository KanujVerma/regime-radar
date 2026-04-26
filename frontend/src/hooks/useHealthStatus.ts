import { useState, useEffect } from 'react'
import { api } from '../api/client'
import type { HealthResponse } from '../types/api'

const POLL_INTERVAL_MS = 60_000

export function useHealthStatus() {
  const [health, setHealth] = useState<HealthResponse | null>(null)

  useEffect(() => {
    let cancelled = false

    async function poll() {
      try {
        const data = await api.health()
        if (!cancelled) setHealth(data)
      } catch {
        // backend unreachable — leave previous value in place
      }
    }

    poll()
    const id = setInterval(poll, POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [])

  return health
}
