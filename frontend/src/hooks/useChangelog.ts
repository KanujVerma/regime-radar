import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { ChangelogResponse } from '../types/api'

export function useChangelog() {
  const [data, setData] = useState<ChangelogResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    api.changelog({ limit: 20 })
      .then(result => { setData(result); setError(null) })
      .catch(() => { setData(null); setError('Changelog unavailable right now.') })
      .finally(() => setLoading(false))
  }, [])
  return { data, loading, error }
}
