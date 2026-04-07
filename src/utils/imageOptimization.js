/**
 * Image Optimization Utilities
 * 
 * Provides optimized image URLs for different contexts:
 * - Feed thumbnails: ~600px width, medium quality
 * - Modal views: Full resolution
 * - Avatar thumbnails: ~64px width, medium quality
 */

/**
 * Get optimized image URL for feed display
 * Uses query parameters for dynamic image resizing via CDN/API
 * 
 * @param {string} imageUrl - Original image URL
 * @param {Object} options - Optimization options
 * @param {number} options.width - Width in pixels (default: 700)
 * @param {number} options.quality - Quality 1-100 (default: 80)
 * @returns {string} Optimized image URL
 */
export function getFeedImageUrl(imageUrl, options = {}) {
  if (!imageUrl) return null
  
  const { width = 700, quality = 80 } = options
  
  // If URL is from Supabase storage, add query parameters
  if (imageUrl.includes('supabase') || imageUrl.includes('amazonaws')) {
    const separator = imageUrl.includes('?') ? '&' : '?'
    return `${imageUrl}${separator}w=${width}&q=${quality}`
  }
  
  // Return original URL if not from CDN
  return imageUrl
}

/**
 * Get original image URL (for modal/full view)
 * @param {string} imageUrl - Original image URL
 * @returns {string} Original image URL
 */
export function getOriginalImageUrl(imageUrl) {
  if (!imageUrl) return null
  return imageUrl
}

/**
 * Get avatar image URL (small thumbnail)
 * @param {string} imageUrl - Original avatar URL
 * @param {Object} options - Optimization options
 * @returns {string} Optimized avatar URL
 */
export function getAvatarImageUrl(imageUrl, options = {}) {
  if (!imageUrl) return null
  
  const { width = 64, quality = 85 } = options
  
  // If URL is from Supabase storage, add query parameters
  if (imageUrl.includes('supabase') || imageUrl.includes('amazonaws')) {
    const separator = imageUrl.includes('?') ? '&' : '?'
    return `${imageUrl}${separator}w=${width}&q=${quality}`
  }
  
  return imageUrl
}

/**
 * Get image dimensions for feed display
 * Used to prevent layout shift
 * 
 * @param {Object} options - Options
 * @returns {Object} {width, height} - Dimensions in pixels
 */
export function getFeedImageDimensions(options = {}) {
  const { maxHeight = 400 } = options
  return {
    width: 700,
    height: maxHeight
  }
}
