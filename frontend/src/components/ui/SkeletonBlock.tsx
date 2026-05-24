interface SkeletonBlockProps {
  width?: string
  height?: string
  className?: string
  rounded?: number
}

export default function SkeletonBlock({
  width = '100%',
  height = '16px',
  className = '',
  rounded = 6,
}: SkeletonBlockProps) {
  return (
    <div
      className={`skeleton-pulse ${className}`}
      style={{ width, height, borderRadius: rounded }}
    />
  )
}
