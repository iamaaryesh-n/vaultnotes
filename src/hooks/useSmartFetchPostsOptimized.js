import { useEffect, useState, useRef } from 'react'
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
export function useSmartFetchPostsOptimized(fetchFn, cacheKey, forceFresh = false, countsOnly = false, user, authReady) {
  const setCachedPosts = usePostCacheStore(s => s.setCachedPosts)
  const setCachedComments = usePostCacheStore(s => s.setCachedComments)
  const setCachedLikes = usePostCacheStore(s => s.setCachedLikes)
  const setFetching = usePostCacheStore(s => s.setFetching)
  const setStoreError = usePostCacheStore(s => s.setError)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [posts, setPosts] = useState([])
  const [commentsByPost, setCommentsByPost] = useState({})
  const [likesByPost, setLikesByPost] = useState({})
  const [currentUserId, setCurrentUserId] = useState(null)
  
  const fetchControllerRef = useRef(null)

  // Store cache key in local storage to track which data is loaded
  useEffect(() => {
    const cacheKeys = JSON.parse(localStorage.getItem('postCacheKeys') || '{}')
    if (!cacheKeys[cacheKey]) {
      cacheKeys[cacheKey] = true
      localStorage.setItem('postCacheKeys', JSON.stringify(cacheKeys))
    }
  }, [cacheKey])
  
  useEffect(() => {
    if (!authReady) return;
    
    if (import.meta.env.DEV) {
      console.log("[useSmartFetchPostsOptimized] effect triggered for:", cacheKey)
    }

    const controller = new AbortController()
    fetchControllerRef.current = controller

    const fetchData = async () => {
      try {
        setCurrentUserId(user?.id || null)
        setLoading(true)
        setError(null)
        setFetching(true)

        // Pass the signal to fetchFn if it supports it
        const fetchedPosts = await fetchFn(controller.signal)
        
        if (controller.signal.aborted) return

        if (!fetchedPosts || fetchedPosts.length === 0) {
          setPosts([])
          setCommentsByPost({})
          setLikesByPost({})
          setLoading(false)
          setFetching(false)
          return
        }
        setCachedPosts(fetchedPosts)
        const postIds = fetchedPosts.map(p => p.id)
        if (countsOnly) {
          const [commentCounts, likeData] = await Promise.all([
            fetchCommentCountsForPosts(postIds, controller.signal),
            fetchLikeCountsForPosts(postIds, user?.id, controller.signal)
          ])

          if (controller.signal.aborted) return

          const comments = {}
          Object.keys(commentCounts).forEach(postId => {
            comments[postId] = new Array(commentCounts[postId]).fill(null)
          })
          setCachedComments(comments)
          setCachedLikes(likeData)
          const postsWithCounts = fetchedPosts.map(post => ({
            ...post,
            likes_count: likeData[post.id]?.count || 0,
            comments_count: commentCounts[post.id] || 0
          }))

          if (!controller.signal.aborted) {
            setPosts(postsWithCounts)
            setCommentsByPost(comments)
            setLikesByPost(likeData)
            console.log('[useSmartFetchPostsOptimized] Fetched counts for', cacheKey)
          }
        } else {
          const [comments, likeData] = await Promise.all([
            fetchCommentsForPosts(postIds, controller.signal),
            fetchLikesForPosts(postIds, user?.id, controller.signal)
          ])

          if (controller.signal.aborted) return

          setCachedComments(comments)
          setCachedLikes(likeData)
          const postsWithCounts = fetchedPosts.map(post => ({
            ...post,
            likes_count: likeData[post.id]?.count || 0,
            comments_count: (comments[post.id] || []).length
          }))

          if (!controller.signal.aborted) {
            setPosts(postsWithCounts)
            setCommentsByPost(comments)
            setLikesByPost(likeData)
            console.log('[useSmartFetchPostsOptimized] Fetched fresh data for', cacheKey)
          }
        }
      } catch (err) {
        const isAbort = 
          err.name === 'AbortError' || 
          err.message === 'Fetch is aborted' || 
          err.message?.includes('signal is aborted') ||
          controller.signal.aborted

        if (isAbort) {
          if (import.meta.env.DEV) console.log("[FetchCancelled] useSmartFetchPostsOptimized.fetchData")
          return
        }

        console.error('[useSmartFetchPostsOptimized] Error:', err)
        if (!controller.signal.aborted) {
          setError(err.message || 'Failed to fetch posts')
          setStoreError(err.message)
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false)
          setFetching(false)
        }
      }
    }

    fetchData()

    return () => {
      controller.abort()
    }
  }, [cacheKey, forceFresh, countsOnly, user?.id, authReady, setCachedPosts, setCachedComments, setCachedLikes, setFetching, setStoreError])


  
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
