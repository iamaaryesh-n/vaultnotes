import { useEffect, useState } from 'react'
import { usePostCacheStore } from '../stores/postCacheStore'
import { 
  fetchCommentsForPosts, 
  fetchLikesForPosts,
  fetchCommentCountsForPosts,
  fetchLikeCountsForPosts
} from '../lib/postInteractions'
import { supabase } from '../lib/supabase'

/**
 * Smart post fetching hook with optional counts-only mode for feed optimization
 * - Returns immediately if data is cached
 * - Only fetches missing data
 * - Updates cache on successful fetch
 * - OPTIMIZED: Can fetch only interaction counts instead of full data
 * 
 * @param {Function} fetchFn - Async function to fetch posts (e.g., from Supabase)
 * @param {string} cacheKey - Unique key for this fetch operation (e.g., "explore", "profile_user123")
 * @param {boolean} forceFresh - Force refetch even if cached
 * @param {boolean} countsOnly - If true, only fetch interaction counts (lighter payload)
 * @returns {Object} { posts, comments, likes, loading, error }
 */
export function useSmartFetchPostsOptimized(fetchFn, cacheKey, forceFresh = false, countsOnly = false) {
  const store = usePostCacheStore()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [posts, setPosts] = useState([])
  const [commentsByPost, setCommentsByPost] = useState({})
  const [likesByPost, setLikesByPost] = useState({})
  const [currentUserId, setCurrentUserId] = useState(null)
  
  // Store cache key in local storage to track which data is loaded
  useEffect(() => {
    const cacheKeys = JSON.parse(localStorage.getItem('postCacheKeys') || '{}')
    if (!cacheKeys[cacheKey]) {
      cacheKeys[cacheKey] = true
      localStorage.setItem('postCacheKeys', JSON.stringify(cacheKeys))
    }
  }, [cacheKey])
  
  useEffect(() => {
    const fetchData = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        setCurrentUserId(user?.id || null)
        
        // Fetch new posts
        setLoading(true)
        setError(null)
        store.setFetching(true)
        
        const fetchedPosts = await fetchFn()
        if (!fetchedPosts || fetchedPosts.length === 0) {
          setPosts([])
          setCommentsByPost({})
          setLikesByPost({})
          setLoading(false)
          store.setFetching(false)
          return
        }
        
        // Cache posts
        store.setCachedPosts(fetchedPosts)
        
        // Fetch interactions based on mode
        const postIds = fetchedPosts.map(p => p.id)
        
        if (countsOnly) {
          // OPTIMIZED: Only fetch counts for feed display
          console.log('[useSmartFetchPostsOptimized] Fetching counts only for', postIds.length, 'posts')
          const [commentCounts, likeData] = await Promise.all([
            fetchCommentCountsForPosts(postIds),
            fetchLikeCountsForPosts(postIds, user?.id)
          ])
          
          // Convert counts to comment array format (empty arrays) for compatibility
          const comments = {}
          Object.keys(commentCounts).forEach(postId => {
            comments[postId] = new Array(commentCounts[postId]).fill(null)
          })
          
          store.setCachedComments(comments)
          store.setCachedLikes(likeData)
          
          const postsWithCounts = fetchedPosts.map(post => ({
            ...post,
            likes_count: likeData[post.id]?.count || 0,
            comments_count: commentCounts[post.id] || 0
          }))
          setPosts(postsWithCounts)
          setCommentsByPost(comments)
          setLikesByPost(likeData)
          
          console.log('[useSmartFetchPostsOptimized] Fetched counts for', cacheKey)
        } else {
          // Standard: Fetch full comment data
          console.log('[useSmartFetchPostsOptimized] Fetching full data for', postIds.length, 'posts')
          const [comments, likeData] = await Promise.all([
            fetchCommentsForPosts(postIds),
            fetchLikesForPosts(postIds, user?.id)
          ])
          
          store.setCachedComments(comments)
          store.setCachedLikes(likeData)
          
          const postsWithCounts = fetchedPosts.map(post => ({
            ...post,
            likes_count: likeData[post.id]?.count || 0,
            comments_count: (comments[post.id] || []).length
          }))
          setPosts(postsWithCounts)
          setCommentsByPost(comments)
          setLikesByPost(likeData)
          
          console.log('[useSmartFetchPostsOptimized] Fetched fresh data for', cacheKey)
        }
      } catch (err) {
        console.error('[useSmartFetchPostsOptimized] Error:', err)
        setError(err.message || 'Failed to fetch posts')
        store.setError(err.message)
      } finally {
        setLoading(false)
        store.setFetching(false)
      }
    }
    
    fetchData()
  }, [cacheKey, forceFresh, countsOnly])
  
  return {
    posts,
    comments: commentsByPost,
    likes: likesByPost,
    loading,
    error,
    
    // Helper methods for UI updates
    updateComment: (postId, newComment) => {
      const hasCommentAlready = (commentsByPost[postId] || []).some(comment => comment.id === newComment.id)
      if (hasCommentAlready) {
        setCommentsByPost(prev => ({
          ...prev,
          [postId]: prev[postId].map(c => c.id === newComment.id ? newComment : c)
        }))
      } else {
        setCommentsByPost(prev => ({
          ...prev,
          [postId]: [...(prev[postId] || []), newComment]
        }))
      }
    },

    removeComment: (postId, commentId) => {
      setCommentsByPost(prev => ({
        ...prev,
        [postId]: (prev[postId] || []).filter(c => c.id !== commentId)
      }))
    },

    removeCommentById: (commentId) => {
      setCommentsByPost(prev => {
        const updated = { ...prev }
        Object.keys(updated).forEach(postId => {
          updated[postId] = updated[postId].filter(c => c.id !== commentId)
        })
        return updated
      })
    },

    updateLike: (postId, eventType, userId) => {
      setLikesByPost(prev => {
        const current = prev[postId] || { count: 0, userLiked: false }
        const newState = { ...current }
        
        if (eventType === 'INSERT') {
          newState.count++
          if (currentUserId && userId === currentUserId) {
            newState.userLiked = true
          }
        } else if (eventType === 'DELETE') {
          newState.count = Math.max(0, newState.count - 1)
          if (currentUserId && userId === currentUserId) {
            newState.userLiked = false
          }
        }
        
        return { ...prev, [postId]: newState }
      })
    }
  }
}
