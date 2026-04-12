/**
 * Post Visibility Constants & Helpers
 */

export const VISIBILITY_MODES = {
  PUBLIC: 'public',
  PRIVATE: 'private'
}

export const VISIBILITY_CONFIG = {
  public: {
    label: 'Public',
    icon: '🌍',
    description: 'Everyone can see this post',
    color: 'blue'
  },
  private: {
    label: 'Private',
    icon: '🔒',
    description: 'Only followers and you can see this post',
    color: 'red'
  }
}

/**
 * Check if user can see a post based on visibility and ownership
 */
export function canUserSeePost(post, currentUserId) {
  // Owner can always see their own posts
  if (post.user_id === currentUserId) {
    return true
  }

  // Public posts visible to everyone
  if (post.visibility === 'public') {
    return true
  }

  // Private posts not visible to others (owner check above handles this)
  return false
}

/**
 * Get visibility badge styling
 */
export function getVisibilityStyles(visibility) {
  const config = VISIBILITY_CONFIG[visibility]
  if (!config) return VISIBILITY_CONFIG.public

  const colorMap = {
    blue: 'bg-[var(--visibility-public-bg)] text-[var(--visibility-public-text)] border-[var(--visibility-public-border)]',
    purple: 'bg-purple-100 text-purple-700 border-purple-200',
    red: 'bg-[var(--visibility-private-bg)] text-[var(--visibility-private-text)] border-[var(--visibility-private-border)]'
  }

  return colorMap[config.color]
}

/**
 * Get visibility drop icon
 */
export function getVisibilityIcon(visibility) {
  return VISIBILITY_CONFIG[visibility]?.icon || '🌍'
}
