import { useEffect, useState } from 'react'
import { usePostCacheStore } from '../stores/postCacheStore'
import { fetchCommentsForPosts, fetchLikesForPosts } from '../lib/postInteractions'
import { supabase } from '../lib/supabase'

/**
 * Smart post fetching hook with caching
 * - Returns immediately if data is cached
 * - Only fetches missing data
 * - Updates cache on successful fetch
 * 
 * @param {Function} fetchFn - Async function to fetch posts (e.g., from Supabase)
 * @param {string} cacheKey - Unique key for this fetch operation (e.g., "explore", "profile_user123")
 * @param {boolean} forceFresh - Force refetch even if cached
 * @returns {Object} { posts, comments, likes, loading, error }
 */
export function useSmartFetchPosts(fetchFn, cacheKey, forceFresh = false, user, authReady) {
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
    if (!authReady) return;
    const fetchData = async () => {
      try {
        setCurrentUserId(user?.id || null)
        setLoading(true)
        setError(null)
        store.setFetching(true)
        const fetchedPosts = await fetchFn()
        if (!fetchedPosts || fetchedPosts.length === 0) {
          setPosts([])
          setLoading(false)
          store.setFetching(false)
          return
        }
        store.setCachedPosts(fetchedPosts)
        const postIds = fetchedPosts.map(p => p.id)
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
        console.log('[useSmartFetchPosts] Fetched fresh data for', cacheKey)
      } catch (err) {
        console.error('[useSmartFetchPosts] Error:', err)
        setError(err.message || 'Failed to fetch posts')
        store.setError(err.message)
      } finally {
        setLoading(false)
        store.setFetching(false)
      }
    }
    fetchData()
  }, [cacheKey, forceFresh, user, authReady])
  
  return {
    posts,
    comments: commentsByPost,
    likes: likesByPost,
    loading,
    error,
    
    // Helper methods for UI updates - update state immutably for realtime
    updateComment: (postId, newComment) => {
      const hasCommentAlready = (commentsByPost[postId] || []).some(comment => comment.id === newComment.id)
      if (hasCommentAlready) {
        return
      }

      setCommentsByPost(prev => {
        const existing = prev[postId] || []
        if (existing.some(comment => comment.id === newComment.id)) {
          return prev
        }
        return {
          ...prev,
          [postId]: [...existing, newComment]
        }
      })

      setPosts(prevPosts =>
        prevPosts.map(post => {
          if (post.id === postId) {
            return {
              ...post,
              comments: Array.isArray(post.comments)
                ? [...post.comments, newComment]
                : post.comments,
              comments_count: Math.max(0, (post.comments_count || 0) + 1)
            }
          }
          return post
        })
      )

      // Also update cache
      store.addComment(postId, newComment)
    },
    removeComment: (postId, commentId) => {
      setCommentsByPost(prev => {
        const existing = prev[postId] || []
        const next = existing.filter(comment => comment.id?.toString() !== commentId?.toString())
        if (next.length === existing.length) {
          return prev
        }

        return {
          ...prev,
          [postId]: next
        }
      })

      setPosts(prevPosts =>
        prevPosts.map(post => {
          if (post.id?.toString() === postId?.toString()) {
            return {
              ...post,
              comments: Array.isArray(post.comments)
                ? post.comments.filter(comment => comment.id?.toString() !== commentId?.toString())
                : post.comments,
              comments_count: Math.max(0, (post.comments_count || 0) - 1)
            }
          }
          return post
        })
      )

      store.removeComment(postId, commentId)
    },
    removeCommentById: (commentId) => {
      const affectedPostIds = Object.keys(commentsByPost).filter(postId =>
        (commentsByPost[postId] || []).some(comment => comment.id?.toString() === commentId?.toString())
      )

      if (affectedPostIds.length === 0) {
        return
      }

      setCommentsByPost(prev => {
        const next = { ...prev }
        affectedPostIds.forEach(postId => {
          next[postId] = (next[postId] || []).filter(comment => comment.id?.toString() !== commentId?.toString())
        })
        return next
      })

      setPosts(prevPosts =>
        prevPosts.map(post => {
          if (affectedPostIds.includes(post.id)) {
            return {
              ...post,
              comments: Array.isArray(post.comments)
                ? post.comments.filter(comment => comment.id?.toString() !== commentId?.toString())
                : post.comments,
              comments_count: Math.max(0, (post.comments_count || 0) - 1)
            }
          }
          return post
        })
      )

      affectedPostIds.forEach(postId => {
        store.removeComment(postId, commentId)
      })
    },
    updateLike: (postId, eventType, eventUserId) => {
      const isInsert = eventType === "INSERT"
      const isOwnEvent = !!currentUserId && eventUserId === currentUserId

      setPosts(prevPosts =>
        prevPosts.map(post => {
          if (post.id === postId) {
            return {
              ...post,
              likes_count: isInsert
                ? Math.max(0, (post.likes_count || 0) + 1)
                : Math.max(0, (post.likes_count || 0) - 1)
            }
          }
          return post
        })
      )

      setLikesByPost(prev => ({
        ...prev,
        [postId]: {
          ...prev[postId],
          count: isInsert
            ? (prev[postId]?.count || 0) + 1
            : Math.max(0, (prev[postId]?.count || 1) - 1),
          userLiked: isOwnEvent
            ? isInsert
            : (prev[postId]?.userLiked || false)
        }
      }))

      // Also update cache
      if (isInsert) {
        store.addLike(postId, isOwnEvent)
      } else {
        store.removeLike(postId, isOwnEvent)
      }
    }
  }
}

/**
 * Prefetch posts for a page before navigation
 * Called in advance to populate cache
 * 
 * @param {Function} fetchFn - Async function to fetch posts
 * @param {string} cacheKey - Unique cache key
 */
export async function prefetchPosts(fetchFn, cacheKey) {
  const store = usePostCacheStore()
  
  try {
    // Check if already cached and valid
    const cachedPostIds = store.getCachedPostIds()
    if (cachedPostIds.length > 0 && cachedPostIds.every(id => store.isCacheValid(id))) {
      console.log('[prefetchPosts] Data already cached:', cacheKey)
      return
    }
    
    const posts = await fetchFn()
    if (posts && posts.length > 0) {
      store.setCachedPosts(posts)
      
      // Prefetch interactions
      const postIds = posts.map(p => p.id)
      const [comments, likeData] = await Promise.all([
        fetchCommentsForPosts(postIds),
        (async () => {
          const { data: { user } } = await supabase.auth.getUser()
          return fetchLikesForPosts(postIds, user?.id)
        })()
      ])
      
      store.setCachedComments(comments)
      store.setCachedLikes(likeData)
      console.log('[prefetchPosts] Prefetched data for:', cacheKey)
    }
  } catch (err) {
    console.error('[prefetchPosts] Error prefetching:', err)
  }
}
