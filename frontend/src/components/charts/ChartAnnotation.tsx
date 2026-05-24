import { ReferenceLine } from 'recharts'
import { colors } from '../../lib/tokens'

interface AnnotationLabelProps {
  viewBox?: { x?: number; y?: number; width?: number; height?: number }
  label: string
  description?: string
  side?: 'left' | 'right'
}

function AnnotationLabel({ viewBox, label, description, side = 'right' }: AnnotationLabelProps) {
  const x = (viewBox?.x ?? 0) + (side === 'right' ? 8 : -8)
  const y = viewBox?.y ?? 0
  const anchor = side === 'right' ? 'start' : 'end'

  return (
    <g>
      <rect
        x={side === 'right' ? x : x - 110}
        y={y + 4}
        width={110}
        height={description ? 34 : 20}
        rx={4}
        fill="rgba(12,16,32,0.85)"
        stroke={colors.cyanDim}
      />
      <text x={x + (side === 'right' ? 6 : -6)} y={y + 15} fill={colors.textPrimary} fontSize={9} fontWeight={700} textAnchor={anchor}>
        {label}
      </text>
      {description && (
        <text x={x + (side === 'right' ? 6 : -6)} y={y + 28} fill={colors.textSecondary} fontSize={8} textAnchor={anchor}>
          {description}
        </text>
      )}
    </g>
  )
}

export interface AnnotationProps {
  x: string | number
  label: string
  description?: string
  side?: 'left' | 'right'
  color?: string
}

export default function ChartAnnotation({ x, label, description, side = 'right', color = colors.cyan }: AnnotationProps) {
  return (
    <ReferenceLine
      x={x}
      stroke={color}
      strokeDasharray="3 3"
      strokeOpacity={0.7}
      label={<AnnotationLabel label={label} description={description} side={side} />}
    />
  )
}
