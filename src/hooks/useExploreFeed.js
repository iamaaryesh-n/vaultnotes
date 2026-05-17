import { useCallback, useEffect, useRef, useState } from "react"
import { supabase } from "../lib/supabase"
import { fetchCommentCountsForPosts, fetchLikeCountsForPosts } from "../lib/postInteractions"
import { usePostCacheStore } from "../stores/postCacheStore"

const BATCH_SIZE = 6
const ABORTED_BATCH = { status: "aborted", posts: [] }
const isAbortError = (err, signal) => (
  signal?.aborted ||
  err?.name === "AbortError" ||
  err?.message === "Fetch is aborted" ||
  err?.message?.includes("signal is aborted") ||
  err?.code === "ABORT"
)

const createSuccessBatch = (posts) => ({ status: "success", posts })

export function useExploreFeed(user, authReady) {
  const initialCachedPostsRef = useRef(null)
  if (initialCachedPostsRef.current === null) {
    const state = usePostCacheStore.getState()
    initialCachedPostsRef.current = Object.values(state.posts || {})
      .filter((post) => state.isCacheValid(post.id))
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  }
  const initialCachedPosts = initialCachedPostsRef.current

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

  const abortControllerRef = useRef(null)

  const fetchPostsBatch = useCallback(
    async (pageNum, signal) => {
      try {
        const start = pageNum * BATCH_SIZE
        const end = start + BATCH_SIZE - 1

        if (import.meta.env.DEV) {
          console.log("[ExploreFetch] Fetching posts batch:", { pageNum, start, end, userId: userIdRef.current })
        }

        const { data, error: fetchError } = await supabase
          .from("posts")
          .select("id, user_id, content, image_url, created_at, visibility, profiles(id, username, name, avatar_url)", {
            count: "exact"
          })
          .order("created_at", { ascending: false })
          .range(start, end)
          .abortSignal(signal)

        if (fetchError) {
          if (isAbortError(fetchError, signal)) {
            if (import.meta.env.DEV) console.log("[FetchCancelled] useExploreFeed Supabase query")
            return ABORTED_BATCH
          }

          console.error("[useExploreFeed] Supabase fetch error:", fetchError)
          throw new Error(`Failed to load posts: ${fetchError.message || JSON.stringify(fetchError)}`)
        }

        if (signal?.aborted) {
          if (import.meta.env.DEV) console.log("[FetchCancelled] useExploreFeed after posts query")
          return ABORTED_BATCH
        }

        if (import.meta.env.DEV) {
          console.log("[useExploreFeed] Posts fetched successfully:", { count: data?.length })
        }

        const fetchedPosts = data || []

        if (fetchedPosts.length > 0) {
          setCachedPosts(fetchedPosts)
          const postIds = fetchedPosts.map((post) => post.id)
          const [commentCounts, likeData] = await Promise.all([
            fetchCommentCountsForPosts(postIds, signal),
            fetchLikeCountsForPosts(postIds, userIdRef.current, signal)
          ])

          if (signal?.aborted) {
            if (import.meta.env.DEV) console.log("[FetchCancelled] useExploreFeed after interaction counts")
            return ABORTED_BATCH
          }

          const comments = {}
          Object.keys(commentCounts).forEach((postId) => {
            comments[postId] = new Array(commentCounts[postId]).fill(null)
          })

          setCommentsByPost((prev) => ({ ...prev, ...comments }))
          setLikesByPost((prev) => ({ ...prev, ...likeData }))
        }

        return createSuccessBatch(fetchedPosts)
      } catch (err) {
        if (isAbortError(err, signal)) {
          if (import.meta.env.DEV) console.log("[FetchCancelled] useExploreFeed.fetchPostsBatch")
          return ABORTED_BATCH
        }

        console.error("[useExploreFeed] fetchPostsBatch error:", err)
        throw err
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
      const signal = abortControllerRef.current?.signal

      try {
        const result = await fetchPostsBatch(pageNumber, signal)

        if (result.status === "aborted" || signal?.aborted) {
          return
        }

        const newPosts = result.posts
        loadedPagesRef.current.add(pageNumber)
        setError(null)

        if (newPosts.length > 0) {
          setPosts((prev) => {
            const existingIds = new Set(prev.map((post) => post.id))
            const uniquePosts = newPosts.filter((post) => !existingIds.has(post.id))
            return uniquePosts.length > 0 ? [...prev, ...uniquePosts] : prev
          })
        }

        if (newPosts.length < BATCH_SIZE) {
          setHasMore(false)
        }
      } catch (err) {
        if (isAbortError(err, signal)) {
          if (import.meta.env.DEV) console.log("[FetchCancelled] useExploreFeed.loadMorePosts")
          return
        }

        setError(err.message || "Failed to fetch posts")
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
    if (!authReady) return

    const controller = new AbortController()
    abortControllerRef.current = controller

    const loadInitialPosts = async () => {
      setLoading(initialCachedPosts.length === 0)
      try {
        const result = await fetchPostsBatch(0, controller.signal)
        
        if (result.status === "aborted" || controller.signal.aborted) {
          return
        }

        const initialPosts = result.posts
        loadedPagesRef.current = new Set([0])
        if (initialPosts.length > 0) {
          setPosts(initialPosts)
        }
        if (initialPosts.length < BATCH_SIZE) {
          setHasMore(false)
        } else {
          setHasMore(true)
        }
        setError(null)
        setPage(0)
      } catch (err) {
        if (isAbortError(err, controller.signal)) {
          if (import.meta.env.DEV) console.log("[FetchCancelled] useExploreFeed initial load")
          return
        }

        setError(err.message || "Failed to load posts")
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false)
        }
      }
    }

    loadInitialPosts()

    return () => {
      controller.abort()
    }
  }, [fetchPostsBatch, authReady])

  // Re-fetch userLiked state when user logs in after posts are already loaded.
  useEffect(() => {
    if (!currentUserId) return

    const controller = new AbortController()

    const backfillLikes = async () => {
      if (posts.length === 0) return
      try {
        const postIds = posts.map((p) => p.id)
        const freshLikeData = await fetchLikeCountsForPosts(postIds, currentUserId, controller.signal)
        if (!controller.signal.aborted) {
          setLikesByPost((prev) => ({ ...prev, ...freshLikeData }))
        }
      } catch (err) {
        if (isAbortError(err, controller.signal)) {
          if (import.meta.env.DEV) console.log("[FetchCancelled] useExploreFeed backfillLikes")
          return
        }

        console.error("[useExploreFeed] Error backfilling like state:", err)
      }
    }

    backfillLikes()

    return () => controller.abort()
  }, [currentUserId, posts.length > 0])


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
