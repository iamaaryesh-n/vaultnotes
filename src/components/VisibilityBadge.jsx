import { motion } from 'framer-motion'
import { VISIBILITY_CONFIG, getVisibilityStyles } from '../lib/postVisibility'

/**
 * Visibility badge component for post cards
 * Shows small badge with icon and label
 */
export default function VisibilityBadge({ visibility = 'public', size = 'sm' }) {
  const config = VISIBILITY_CONFIG[visibility]
  if (!config) return null

  const sizeMap = {
    xs: 'text-[10px] px-2 py-[2px] font-semibold',
    sm: 'text-xs px-2.5 py-1.5',
    md: 'text-sm px-3 py-2'
  }

  return (
    <motion.span
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`
        inline-flex items-center gap-1.5 rounded-full border
        transition-all duration-200
        ${getVisibilityStyles(visibility)}
        ${sizeMap[size]}
      `}
      whileHover={{ scale: 1.05 }}
    >
      <span>{config.icon}</span>
      <span>{config.label}</span>
    </motion.span>
  )
}
