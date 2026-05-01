import { useCallback, useEffect, useRef, useState } from "react"
import { supabase } from "../lib/supabase"
import { fetchCommentCountsForPosts, fetchLikeCountsForPosts } from "../lib/postInteractions"
import { usePostCacheStore } from "../stores/postCacheStore"

const BATCH_SIZE = 3

export function useExploreFeed(user, authReady) {
  const initialCachedPosts = (() => {
    const state = usePostCacheStore.getState()
    return Object.values(state.posts || {})
      .filter((post) => state.isCacheValid(post.id))
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  })()

  const setCachedPosts = usePostCacheStore((state) => state.setCachedPosts)
  const [posts, setPosts] = useState(initialCachedPosts)
  const [commentsByPost, setCommentsByPost] = useState({})
  const [likesByPost, setLikesByPost] = useState({})
  const [loading, setLoading] = useState(initialCachedPosts.length === 0)
  const [error, setError] = useState(null)
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [currentUserId, setCurrentUserId] = useState(null)

  const loadedPagesRef = useRef(new Set([0]))
  const hasMoreRef = useRef(true)
  const loadingMoreRef = useRef(false)
  // Always-fresh ref so fetchPostsBatch never closes over a stale userId
  const userIdRef = useRef(user?.id || null)

  useEffect(() => {
    hasMoreRef.current = hasMore
  }, [hasMore])

  useEffect(() => {
    if (!authReady) return
    const uid = user?.id || null
    userIdRef.current = uid
    setCurrentUserId(uid)
  }, [user, authReady])

  const fetchPostsBatch = useCallback(
    async (pageNum) => {
      try {
        const start = pageNum * BATCH_SIZE
        const end = start + BATCH_SIZE - 1

        const { data, error: fetchError } = await supabase
          .from("posts")
          .select("id, user_id, content, image_url, created_at, visibility, profiles(id, username, name, avatar_url)", {
            count: "exact"
          })
          .order("created_at", { ascending: false })
          .range(start, end)

        if (fetchError) {
          throw new Error("Failed to load posts")
        }

        const fetchedPosts = data || []

        if (fetchedPosts.length < BATCH_SIZE) {
          setHasMore(false)
        }

        if (fetchedPosts.length > 0) {
          setCachedPosts(fetchedPosts)
          const postIds = fetchedPosts.map((post) => post.id)
          const [commentCounts, likeData] = await Promise.all([
            fetchCommentCountsForPosts(postIds),
            fetchLikeCountsForPosts(postIds, userIdRef.current)
          ])

          const comments = {}
          Object.keys(commentCounts).forEach((postId) => {
            comments[postId] = new Array(commentCounts[postId]).fill(null)
          })

          setCommentsByPost((prev) => ({ ...prev, ...comments }))
          setLikesByPost((prev) => ({ ...prev, ...likeData }))
        }

        return fetchedPosts
      } catch (err) {
        setError(err.message || "Failed to fetch posts")
        return []
      }
    },
    [setCachedPosts]
  )

  const loadMorePosts = useCallback(
    async (pageNumber) => {
      if (loadingMoreRef.current || !hasMoreRef.current) {
        return
      }

      if (loadedPagesRef.current.has(pageNumber)) {
        return
      }

      loadingMoreRef.current = true
      setLoadingMore(true)

      try {
        const newPosts = await fetchPostsBatch(pageNumber)

        if (newPosts.length > 0) {
          loadedPagesRef.current.add(pageNumber)

          setPosts((prev) => {
            const existingIds = new Set(prev.map((post) => post.id))
            const uniquePosts = newPosts.filter((post) => !existingIds.has(post.id))
            return uniquePosts.length > 0 ? [...prev, ...uniquePosts] : prev
          })
        } else {
          setHasMore(false)
        }
      } finally {
        loadingMoreRef.current = false
        setLoadingMore(false)
      }
    },
    [fetchPostsBatch]
  )

  const queueNextPageLoad = useCallback(() => {
    if (loadingMoreRef.current || !hasMoreRef.current) {
      return
    }

    setPage((prevPage) => {
      let nextPage = prevPage + 1

      while (loadedPagesRef.current.has(nextPage)) {
        nextPage += 1
      }

      void loadMorePosts(nextPage)
      return nextPage
    })
  }, [loadMorePosts])

  useEffect(() => {
    const loadInitialPosts = async () => {
      setLoading(initialCachedPosts.length === 0)
      try {
        const initialPosts = await fetchPostsBatch(0)
        loadedPagesRef.current = new Set([0])
        if (initialPosts.length > 0) {
          setPosts(initialPosts)
        }
        setPage(0)
      } catch (err) {
        setError(err.message || "Failed to load posts")
      } finally {
        setLoading(false)
      }
    }

    if (!authReady) return

    loadInitialPosts()
  }, [fetchPostsBatch, authReady])

  // Re-fetch userLiked state when user logs in after posts are already loaded.
  // This backfills the red heart for posts the user liked in a previous session.
  useEffect(() => {
    if (!currentUserId) return

    setPosts((prevPosts) => {
      if (prevPosts.length === 0) return prevPosts
      const postIds = prevPosts.map((p) => p.id)
      fetchLikeCountsForPosts(postIds, currentUserId).then((freshLikeData) => {
        setLikesByPost((prev) => ({ ...prev, ...freshLikeData }))
      })
      return prevPosts
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId])

  const addNewPost = useCallback((newPost) => {
    setPosts((prev) => {
      const postExists = prev.some((p) => p.id === newPost.id)
      if (postExists) return prev
      return [newPost, ...prev]
    })
  }, [])

  return {
    posts,
    setPosts,
    commentsByPost,
    likesByPost,
    loading,
    loadingMore,
    hasMore,
    error,
    page,
    currentUserId,
    queueNextPageLoad,
    loadMorePosts,
    setCommentsByPost,
    setLikesByPost,
    addNewPost
  }
}
