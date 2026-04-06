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
    blue: 'bg-blue-100 text-blue-700 border-blue-200',
    purple: 'bg-purple-100 text-purple-700 border-purple-200',
    red: 'bg-red-100 text-red-700 border-red-200'
  }

  return colorMap[config.color]
}

/**
 * Get visibility drop icon
 */
export function getVisibilityIcon(visibility) {
  return VISIBILITY_CONFIG[visibility]?.icon || '🌍'
}
