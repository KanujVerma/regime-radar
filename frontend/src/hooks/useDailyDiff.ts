import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { DailyDiffResponse } from '../types/api'

export function useDailyDiff() {
  const [data, setData] = useState<DailyDiffResponse | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.dailyDiff()
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [])

  return { data, loading }
}
