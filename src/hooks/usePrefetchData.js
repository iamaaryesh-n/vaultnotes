import { useEffect } from 'react'
import { prefetchPosts } from './useSmartFetchPosts'

/**
 * Prefetch data strategically to improve navigation perception
 * - When Explore loads, prefetch workspace data
 * - When Profile loads, prefetch related profiles
 * 
 * @param {string} pageType - Type of page ("explore", "profile", etc.)
 * @param {Object} options - Fetch functions for different data types
 */
export function usePrefetchData(pageType, options = {}) {
  useEffect(() => {
    if (pageType === 'explore' && options.prefetchWorkspaces) {
      // Prefetch workspaces while user is viewing current page
      setTimeout(() => {
        options.prefetchWorkspaces()
      }, 1000) // Delay to avoid blocking initial render
    }
    
    if (pageType === 'profile' && options.prefetchRelatedProfiles) {
      // Prefetch related profiles
      setTimeout(() => {
        options.prefetchRelatedProfiles()
      }, 500)
    }
  }, [pageType, options])
}

/**
 * Ready-to-use prefetch strategy for Explore page
 * Call when Explore mounts to prefetch related data
 */
export async function prefetchExploreData() {
  try {
    // Prefetch could include workspaces, categories, etc.
    // Implement based on your data model
    console.log('[prefetchExploreData] Prefetch strategy initialized')
  } catch (err) {
    console.error('[prefetchExploreData] Error:', err)
  }
}

/**
 * Deferred load hook - load non-critical data after initial render
 * Great for UI elements below the fold
 * 
 * @param {Function} loadFn - Function to execute after render
 * @param {number} delay - Delay in ms
 */
export function useDeferredLoad(loadFn, delay = 500) {
  useEffect(() => {
    const timer = setTimeout(() => {
      loadFn()
    }, delay)
    
    return () => clearTimeout(timer)
  }, [loadFn, delay])
}
