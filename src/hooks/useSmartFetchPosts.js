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
export function useSmartFetchPosts(fetchFn, cacheKey, forceFresh = false) {
  const store = usePostCacheStore()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [posts, setPosts] = useState([])
  const [commentsByPost, setCommentsByPost] = useState({})
  const [likesByPost, setLikesByPost] = useState({})
  const [cacheKey_, setCacheKey] = useState(cacheKey)
  
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
        // If data is cached and not forcing fresh, return immediately
        if (!forceFresh) {
          const cachedPostIds = store.getCachedPostIds()
          if (cachedPostIds.length > 0) {
            // Check if any are still valid
            const validPosts = cachedPostIds
              .filter(id => store.isCacheValid(id))
              .map(id => store.posts[id])
            
            if (validPosts.length > 0) {
              console.log('[useSmartFetchPosts] Returning cached data for', cacheKey)
              setPosts(validPosts)
              setCommentsByPost(store.commentsByPost)
              setLikesByPost(store.likesByPost)
              setLoading(false)
              return
            }
          }
        }
        
        // Fetch new posts
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
        
        // Cache posts
        store.setCachedPosts(fetchedPosts)
        setPosts(fetchedPosts)
        
        // Fetch and cache interactions
        const postIds = fetchedPosts.map(p => p.id)
        
        // Prefetch comments and likes in parallel
        const [comments, likeData] = await Promise.all([
          fetchCommentsForPosts(postIds),
          (async () => {
            const { data: { user } } = await supabase.auth.getUser()
            return fetchLikesForPosts(postIds, user?.id)
          })()
        ])
        
        store.setCachedComments(comments)
        store.setCachedLikes(likeData)
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
  }, [cacheKey, forceFresh])
  
  return {
    posts,
    comments: commentsByPost,
    likes: likesByPost,
    loading,
    error,
    
    // Helper methods for UI updates
    updateComment: (postId, newComment) => {
      store.addComment(postId, newComment)
      setCommentsByPost(store.commentsByPost)
    },
    updateLike: (postId, liked) => {
      if (liked) {
        store.addLike(postId)
      } else {
        store.removeLike(postId)
      }
      setLikesByPost(store.likesByPost)
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
