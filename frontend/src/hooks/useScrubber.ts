import { useState, useEffect, useRef, useCallback } from 'react'

export function clampFrame(frame: number, total: number): number {
  return Math.max(0, Math.min(frame, total - 1))
}

export function isAtEnd(frame: number, total: number): boolean {
  return frame >= total - 1
}

interface UseScrubberOptions {
  totalFrames: number
  playbackMs?: number  // ms per frame, default 80
}

export function useScrubber({ totalFrames, playbackMs = 80 }: UseScrubberOptions) {
  const [frame, setFrame] = useState(0)
  const [playing, setPlaying] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stop = useCallback(() => {
    setPlaying(false)
    if (intervalRef.current) clearInterval(intervalRef.current)
  }, [])

  const play = useCallback(() => {
    if (isAtEnd(frame, totalFrames)) setFrame(0)
    setPlaying(true)
  }, [frame, totalFrames])

  const seek = useCallback((f: number) => {
    stop()
    setFrame(clampFrame(f, totalFrames))
  }, [stop, totalFrames])

  useEffect(() => {
    if (!playing) return
    intervalRef.current = setInterval(() => {
      setFrame(prev => {
        const next = prev + 1
        if (next >= totalFrames) {
          stop()
          return totalFrames - 1
        }
        return next
      })
    }, playbackMs)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [playing, totalFrames, playbackMs, stop])

  return { frame, playing, play, stop, seek }
}

export type UseScrubberReturn = ReturnType<typeof useScrubber>
