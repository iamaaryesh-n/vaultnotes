import { create } from 'zustand'

/**
 * Global post data cache store
 * Manages posts, likes, and comments to avoid refetching during navigation
 */
export const usePostCacheStore = create((set, get) => ({
  // State: Post data caches
  posts: {},
  commentsByPost: {},
  likesByPost: {},
  
  // State: Metadata
  cacheTimestamps: {}, // Track when each post cache was created
  isFetching: false,
  error: null,
  
  // Constants
  CACHE_DURATION_MS: 5 * 60 * 1000, // 5 minutes cache duration
  
  /**
   * Check if a cache entry is still valid (not expired)
   */
  isCacheValid: (postId) => {
    const state = get()
    const timestamp = state.cacheTimestamps[postId]
    if (!timestamp) return false
    return Date.now() - timestamp < state.CACHE_DURATION_MS
  },
  
  /**
   * Check if we have cached data for given posts
   */
  hasCachedData: (postIds) => {
    const state = get()
    if (!postIds || postIds.length === 0) return false
    return postIds.every(id => state.posts[id] !== undefined && state.isCacheValid(id))
  },
  
  /**
   * Get cached posts for given post IDs
   */
  getCachedPosts: (postIds) => {
    const state = get()
    if (!postIds) return []
    return postIds
      .filter(id => state.posts[id] !== undefined)
      .map(id => state.posts[id])
  },
  
  /**
   * Set posts in cache
   */
  setCachedPosts: (postsData) => {
    const timestamp = Date.now()
    const newPosts = {}
    const newTimestamps = {}
    
    postsData.forEach(post => {
      newPosts[post.id] = post
      newTimestamps[post.id] = timestamp
    })
    
    set(state => ({
      posts: { ...state.posts, ...newPosts },
      cacheTimestamps: { ...state.cacheTimestamps, ...newTimestamps },
      error: null
    }))
  },
  
  /**
   * Set comments for posts in cache
   */
  setCachedComments: (commentsByPostId) => {
    set(state => ({
      commentsByPost: { ...state.commentsByPost, ...commentsByPostId }
    }))
  },
  
  /**
   * Set likes for posts in cache
   */
  setCachedLikes: (likesByPostId) => {
    set(state => ({
      likesByPost: { ...state.likesByPost, ...likesByPostId }
    }))
  },
  
  /**
   * Add a single like to cache
   */
  addLike: (postId, isOwnEvent = false) => {
    set(state => ({
      // Keep counts non-negative and only toggle userLiked for the acting user.
      likesByPost: {
        ...state.likesByPost,
        [postId]: {
          count: (state.likesByPost[postId]?.count || 0) + 1,
          userLiked: isOwnEvent ? true : (state.likesByPost[postId]?.userLiked || false)
        }
      }
    }))
  },
  
  /**
   * Remove a like from cache
   */
  removeLike: (postId, isOwnEvent = false) => {
    set(state => ({
      likesByPost: {
        ...state.likesByPost,
        [postId]: {
          count: Math.max(0, (state.likesByPost[postId]?.count || 1) - 1),
          userLiked: isOwnEvent ? false : (state.likesByPost[postId]?.userLiked || false)
        }
      }
    }))
  },
  
  /**
   * Add a comment to cache
   */
  addComment: (postId, comment) => {
    set(state => ({
      commentsByPost: {
        ...state.commentsByPost,
        [postId]: [...(state.commentsByPost[postId] || []), comment]
      }
    }))
  },

  /**
   * Remove a comment from cache by ID
   */
  removeComment: (postId, commentId) => {
    set(state => ({
      commentsByPost: {
        ...state.commentsByPost,
        [postId]: (state.commentsByPost[postId] || []).filter(comment => comment.id !== commentId)
      }
    }))
  },
  
  /**
   * Update an existing comment's profile information
   * Finds comment by ID and updates profile data without duplication
   */
  updateCommentProfile: (postId, commentId, profileData) => {
    set(state => ({
      commentsByPost: {
        ...state.commentsByPost,
        [postId]: (state.commentsByPost[postId] || []).map(comment =>
          comment.id === commentId
            ? { ...comment, profiles: profileData }
            : comment
        )
      }
    }))
  },
  
  /**
   * Set fetching state
   */
  setFetching: (isFetching) => {
    set({ isFetching })
  },
  
  /**
   * Set error state
   */
  setError: (error) => {
    set({ error })
  },
  
  /**
   * Clear all cache (on logout, etc.)
   */
  clearCache: () => {
    set({
      posts: {},
      commentsByPost: {},
      likesByPost: {},
      cacheTimestamps: {},
      error: null,
      isFetching: false
    })
  },
  
  /**
   * Get all cached post IDs
   */
  getCachedPostIds: () => {
    return Object.keys(get().posts)
  }
}))
