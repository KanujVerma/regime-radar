import { useState, useEffect } from 'react'
import { api } from '../api/client'
import type { EventReplayResponse } from '../types/api'

export function useEventReplay(eventName: string) {
  const [data, setData] = useState<EventReplayResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    api.eventReplay(eventName)
      .then(setData)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Unknown error'))
      .finally(() => setLoading(false))
  }, [eventName])

  return { data, loading, error }
}
