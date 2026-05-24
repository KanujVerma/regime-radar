import { colors } from '../../lib/tokens'
import type { UseScrubberReturn } from '../../hooks/useScrubber'

interface ScrubberProps {
  scrubber: UseScrubberReturn
  totalFrames: number
  frameLabel?: (frame: number) => string
}

export default function Scrubber({ scrubber, totalFrames, frameLabel }: ScrubberProps) {
  const { frame, playing, play, stop, seek } = scrubber

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '8px 16px',
      borderTop: `1px solid ${colors.border}`,
      background: colors.surface,
    }}>
      <button
        type="button"
        onClick={playing ? stop : play}
        style={{
          width: 28, height: 28, borderRadius: '50%',
          background: colors.cyan, border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}
        aria-label={playing ? 'Pause' : 'Play'}
      >
        {playing ? (
          <span style={{ display: 'flex', gap: 3 }}>
            <span style={{ width: 3, height: 10, background: colors.bg, borderRadius: 1 }} />
            <span style={{ width: 3, height: 10, background: colors.bg, borderRadius: 1 }} />
          </span>
        ) : (
          <span style={{ borderLeft: `8px solid ${colors.bg}`, borderTop: '5px solid transparent', borderBottom: '5px solid transparent', marginLeft: 2 }} />
        )}
      </button>

      <input
        type="range"
        min={0}
        max={Math.max(0, totalFrames - 1)}
        value={frame}
        onChange={e => seek(Number(e.target.value))}
        style={{ flex: 1, accentColor: colors.cyan, cursor: 'pointer' }}
        aria-label="Playhead"
      />

      {frameLabel && (
        <span style={{ fontSize: 11, color: colors.textSecondary, minWidth: 120, textAlign: 'right', flexShrink: 0 }}>
          {frameLabel(frame)}
        </span>
      )}
    </div>
  )
}
