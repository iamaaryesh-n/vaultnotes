import { motion } from 'framer-motion'

/**
 * Workspace visibility badge component
 * Shows whether workspace is public or private
 */
export default function WorkspaceVisibilityBadge({ isPublic = false, size = 'sm' }) {
  const sizeMap = {
    xs: 'text-xs px-2 py-1',
    sm: 'text-xs px-2.5 py-1.5',
    md: 'text-sm px-3 py-2'
  }

  const icon = isPublic ? '🌍' : '🔒'
  const label = isPublic ? 'Public' : 'Private'
  const styles = isPublic
    ? 'bg-[var(--visibility-public-bg)] text-[var(--visibility-public-text)] border-[var(--visibility-public-border)]'
    : 'bg-[var(--visibility-private-bg)] text-[var(--visibility-private-text)] border-[var(--visibility-private-border)]'

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`
        inline-flex items-center gap-1.5 rounded-full border font-medium
        transition-all duration-200
        ${styles}
        ${sizeMap[size]}
      `}
      whileHover={{ scale: 1.05 }}
    >
      <span>{icon}</span>
      <span>{label}</span>
    </motion.div>
  )
}
