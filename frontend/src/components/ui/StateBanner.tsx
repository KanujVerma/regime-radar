import { motion, AnimatePresence } from 'framer-motion'
import type { BannerState } from '../../hooks/useStateBanners'

interface StateBannerProps {
  banner: BannerState | null
}

export default function StateBanner({ banner }: StateBannerProps) {
  return (
    <AnimatePresence mode="wait">
      {banner && (
        <motion.div
          key={banner.id + banner.text}
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '7px 12px',
            borderRadius: 7,
            border: `1px solid ${banner.color}40`,
            background: `${banner.color}0d`,
            fontSize: 10,
            fontWeight: 600,
            color: '#94a3b8',
            marginBottom: 10,
          }}
        >
          <div style={{
            width: 6, height: 6, borderRadius: '50%',
            background: banner.color, flexShrink: 0,
          }} />
          {banner.text}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
