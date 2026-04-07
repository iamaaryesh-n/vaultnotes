import { useCallback, useState, useEffect, useMemo, useRef } from "react"
import { supabase } from "../lib/supabase"
import { useNavigate } from "react-router-dom"
import { useAuth } from "../hooks/useAuth"
import PostInteractions from "../components/PostInteractions"
import { usePrefetchData } from "../hooks/usePrefetchData"
import { usePrefetchWorkspaces } from "../hooks/usePrefetchWorkspaces"
import { PostListSkeleton } from "../components/PostSkeleton"
import { usePostsRealtime } from "../hooks/usePostsRealtime"
import { followUser, unfollowUser } from "../lib/followsLib"
import { motion, AnimatePresence } from "framer-motion"
import VisibilityBadge from "../components/VisibilityBadge"
import { fetchPublicWorkspaceDiscoverCards } from "../lib/globalSearch"
import WorkspaceVisibilityBadge from "../components/WorkspaceVisibilityBadge"
import PublicWorkspaceCard from "../components/PublicWorkspaceCard"
import { getFeedImageUrl, getAvatarImageUrl } from "../utils/imageOptimization"
import { fetchCommentCountsForPosts, fetchLikeCountsForPosts } from "../lib/postInteractions"

/**
 * INSTAGRAM-STYLE INFINITE SCROLL
 * - Load only 3 posts initially
 * - Load next 3 posts in batches
 * - Use IntersectionObserver for infinite scroll
 * - Background preload after initial render
 */
const INITIAL_POST_LIMIT = 3
const BATCH_SIZE = 3

export default function Explore() {
  const navigate = useNavigate()
  const { user: contextUser } = useAuth()
  const [activeTab, setActiveTab] = useState("for-you")
  const [viewMode, setViewMode] = useState("posts")
  const [followedUsers, setFollowedUsers] = useState([])
  const [selectedPost, setSelectedPost] = useState(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [publicWorkspaces, setPublicWorkspaces] = useState([])
  const [publicWorkspacesLoading, setPublicWorkspacesLoading] = useState(false)

  // PAGINATION STATE
  const [posts, setPosts] = useState([])
  const [commentsByPost, setCommentsByPost] = useState({})
  const [likesByPost, setLikesByPost] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [currentUserId, setCurrentUserId] = useState(null)

  // REF FOR INFINITE SCROLL
  const loadMoreRef = useRef(null)
  const loadedPagesRef = useRef(new Set([0]))
  const hasMoreRef = useRef(true)
  const loadingMoreRef = useRef(false)

  // Prefetch workspaces in the background for fast navigation to Dashboard
  usePrefetchWorkspaces()

  useEffect(() => {
    if (!contextUser?.id) return

    const loadPublicWorkspaces = async () => {
      setPublicWorkspacesLoading(true)
      try {
        console.log("[Explore] Loading public workspace shelf...")
        const { workspaces, error } = await fetchPublicWorkspaceDiscoverCards(8)

        if (error) {
          console.error("[Explore] Error fetching public workspace shelf:", error)
          setPublicWorkspaces([])
          return
        }

        console.log("[Explore] Public workspace shelf count:", workspaces?.length || 0)
        setPublicWorkspaces(workspaces || [])
      } catch (err) {
        console.error("[Explore] Exception fetching public workspace shelf:", err)
        setPublicWorkspaces([])
      } finally {
        setPublicWorkspacesLoading(false)
      }
    }

    loadPublicWorkspaces()
  }, [contextUser?.id])

  // Fetch followed users
  useEffect(() => {
    if (!contextUser?.id) return

    const fetchFollowedUsers = async () => {
      const { data, error } = await supabase
        .from("follows")
        .select("following_id")
        .eq("follower_id", contextUser.id)

      if (error) {
        console.warn("[Explore] Failed to fetch followed users:", error)
        return
      }

      setFollowedUsers(data?.map((f) => f.following_id) || [])
    }

    fetchFollowedUsers()
  }, [contextUser?.id])

  // Get current user ID
  useEffect(() => {
    const getUserId = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setCurrentUserId(user?.id || null)
    }
    getUserId()
  }, [])

  useEffect(() => {
    hasMoreRef.current = hasMore
  }, [hasMore])

  /**
   * Fetch posts with pagination using range()
   */
  const fetchPostsBatch = useCallback(async (pageNum) => {
    try {
      console.log(`[Explore] Fetching page ${pageNum}...`)
      const start = pageNum * BATCH_SIZE
      const end = start + BATCH_SIZE - 1

      const { data, error: fetchError, count } = await supabase
        .from("posts")
        .select("id, user_id, content, image_url, created_at, visibility, profiles(id, username, name, avatar_url)", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(start, end)

      if (fetchError) {
        console.error("[Explore] Error fetching posts:", fetchError)
        throw new Error("Failed to load posts")
      }

      const fetchedPosts = data || []

      // Check if we've reached the end
      if (fetchedPosts.length < BATCH_SIZE) {
        console.log("[Explore] No more posts available")
        setHasMore(false)
      }

      // Fetch interaction counts (lightweight)
      if (fetchedPosts.length > 0) {
        const postIds = fetchedPosts.map(p => p.id)
        const [commentCounts, likeData] = await Promise.all([
          fetchCommentCountsForPosts(postIds),
          fetchLikeCountsForPosts(postIds, currentUserId)
        ])

        // Convert counts to comment array format for compatibility
        const comments = {}
        Object.keys(commentCounts).forEach(postId => {
          comments[postId] = new Array(commentCounts[postId]).fill(null)
        })

        setCommentsByPost(prev => ({ ...prev, ...comments }))
        setLikesByPost(prev => ({ ...prev, ...likeData }))
      }

      return fetchedPosts
    } catch (err) {
      console.error("[Explore] Error in fetchPostsBatch:", err)
      setError(err.message || "Failed to fetch posts")
      return []
    }
  }, [currentUserId])

  /**
   * Load more posts for an explicit page number
   */
  const loadMorePosts = useCallback(async (pageNumber) => {
    // Prevent duplicate fetches
    if (loadingMoreRef.current || !hasMoreRef.current) {
      console.log("[Explore] Skipping load more - loadingMore:", loadingMoreRef.current, "hasMore:", hasMoreRef.current)
      return
    }

    // Check if page already loaded
    if (loadedPagesRef.current.has(pageNumber)) {
      console.log(`[Explore] Page ${pageNumber} already loaded, skipping`)
      return
    }

    console.log(`[Explore] Loading page ${pageNumber}...`)
    loadingMoreRef.current = true
    setLoadingMore(true)
    try {
      const newPosts = await fetchPostsBatch(pageNumber)

      if (newPosts.length > 0) {
        // Mark page as loaded
        loadedPagesRef.current.add(pageNumber)

        // Filter out duplicates
        setPosts(prev => {
          const existingIds = new Set(prev.map(p => p.id))
          const uniquePosts = newPosts.filter(p => !existingIds.has(p.id))
          if (uniquePosts.length > 0) {
            console.log(`[Explore] Loaded page ${pageNumber} with ${uniquePosts.length} new posts (${newPosts.length - uniquePosts.length} duplicates filtered)`)
            return [...prev, ...uniquePosts]
          }
          return prev
        })
      } else {
        console.log("[Explore] No more posts available")
        setHasMore(false)
      }
    } finally {
      loadingMoreRef.current = false
      setLoadingMore(false)
    }
  }, [fetchPostsBatch])

  const queueNextPageLoad = useCallback(() => {
    if (loadingMoreRef.current || !hasMoreRef.current) {
      return
    }

    setPage((prevPage) => {
      let nextPage = prevPage + 1
      while (loadedPagesRef.current.has(nextPage)) {
        nextPage += 1
      }

      console.log(`[Explore] Advancing page from ${prevPage} to ${nextPage}`)
      void loadMorePosts(nextPage)
      return nextPage
    })
  }, [loadMorePosts])

  /**
   * Initial fetch - load first batch
   */
  useEffect(() => {
    const loadInitialPosts = async () => {
      setLoading(true)
      try {
        const initialPosts = await fetchPostsBatch(0)
        if (initialPosts.length > 0) {
          loadedPagesRef.current = new Set([0])
          setPosts(initialPosts)
          setPage(0)
          console.log(`[Explore] Loaded initial ${initialPosts.length} posts`)


        }
      } catch (err) {
        console.error("[Explore] Error loading initial posts:", err)
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }

    loadInitialPosts()

    return () => {
      // Cleanup - no preload timeout needed
    }
  }, [fetchPostsBatch])

  /**
   * Infinite scroll with IntersectionObserver
   */
  useEffect(() => {
    if (!loadMoreRef.current) return

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          console.log("[Explore] Observer triggered", {
            isIntersecting: entry.isIntersecting,
            hasMore,
            loadingMore,
            page,
            currentPostCount: posts.length
          })
          if (entry.isIntersecting && hasMore && !loadingMore) {
            console.log("[Explore] Load more sentinel visible, loading next batch...")
            queueNextPageLoad()
          }
        })
      },
      { threshold: 0.1, rootMargin: "300px" }
    )

    observer.observe(loadMoreRef.current)

    return () => {
      observer.disconnect()
    }
  }, [hasMore, loadingMore, page, posts.length, queueNextPageLoad])

  /**
   * Fallback: Window scroll event listener for infinite scroll
   * This ensures loading works even if IntersectionObserver doesn't trigger
   */
  useEffect(() => {
    const handleScroll = () => {
      // Check if user is near bottom of page (300px before end)
      const isNearBottom =
        window.innerHeight + window.scrollY >=
        document.body.offsetHeight - 300

      if (isNearBottom && hasMore && !loadingMore) {
        console.log("[Explore] Scroll fallback triggered", {
          scrollY: window.scrollY,
          innerHeight: window.innerHeight,
          offsetHeight: document.body.offsetHeight,
          threshold: document.body.offsetHeight - 300
        })
        queueNextPageLoad()
      }
    }

    window.addEventListener("scroll", handleScroll)
    return () => {
      window.removeEventListener("scroll", handleScroll)
    }
  }, [hasMore, loadingMore, queueNextPageLoad])

  // Memoized realtime handlers
  const handleLikesRealtime = useCallback((payload) => {
    if (payload.eventType === "DELETE") {
      const postId = payload.old?.post_id
      if (!postId) return

      setLikesByPost(prev => {
        const current = prev[postId] || { count: 0, userLiked: false }
        return {
          ...prev,
          [postId]: {
            ...current,
            count: Math.max(0, current.count - 1),
            userLiked: payload.old?.user_id === currentUserId ? false : current.userLiked
          }
        }
      })
      return
    }

    const postId = payload.new?.post_id
    if (!postId) return

    setLikesByPost(prev => {
      const current = prev[postId] || { count: 0, userLiked: false }
      return {
        ...prev,
        [postId]: {
          ...current,
          count: current.count + 1,
          userLiked: payload.new?.user_id === currentUserId ? true : current.userLiked
        }
      }
    })
  }, [currentUserId])

  const handleCommentsRealtime = useCallback(async (payload) => {
    if (payload.eventType === "INSERT" && payload.new?.post_id) {
      const comment = {
        id: payload.new.id,
        user_id: payload.new.user_id,
        content: payload.new.content,
        created_at: payload.new.created_at,
        profiles: { username: "unknown", avatar_url: null }
      }

      setCommentsByPost(prev => ({
        ...prev,
        [payload.new.post_id]: [...(prev[payload.new.post_id] || []), comment]
      }))
      return
    }

    if (payload.eventType === "DELETE") {
      const comment_id = payload.old?.id
      if (!comment_id) return

      let post_id = payload.old?.post_id

      if (!post_id) {
        const { data, error: fetchError } = await supabase
          .from("comments")
          .select("post_id")
          .eq("id", comment_id)
          .single()

        if (!fetchError) {
          post_id = data?.post_id
        }
      }

      if (post_id) {
        setCommentsByPost(prev => ({
          ...prev,
          [post_id]: (prev[post_id] || []).filter(c => c.id !== comment_id)
        }))
      }
    }
  }, [])

  // Setup realtime subscriptions
  usePostsRealtime(
    posts.map((p) => p.id),
    handleLikesRealtime,
    handleCommentsRealtime
  )

  const formatPostTime = (value) => {
    if (!value) return ""
    const date = new Date(value)
    const now = new Date()
    const seconds = Math.floor((now - date) / 1000)

    if (seconds < 60) return "now"
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`

    return date.toLocaleDateString()
  }

  const openPostModal = (post) => {
    setSelectedPost(post)
    setModalOpen(true)
    document.body.style.overflow = "hidden"
  }

  const closePostModal = () => {
    setModalOpen(false)
    setSelectedPost(null)
    document.body.style.overflow = "unset"
  }

  const handleToggleFollow = useCallback(
    async (userId) => {
      if (!contextUser?.id) return

      if (followedUsers.includes(userId)) {
        const result = await unfollowUser(contextUser.id, userId)
        if (result.success) {
          setFollowedUsers((prev) => prev.filter((id) => id !== userId))
        }
      } else {
        const result = await followUser(contextUser.id, userId)
        if (result.success) {
          setFollowedUsers((prev) => [...prev, userId])
        }
      }
    },
    [contextUser?.id, followedUsers]
  )

  // Filter and sort posts based on active tab
  const filteredPosts = useMemo(() => {
    let filtered = [...posts]

    // Apply visibility filtering
    filtered = filtered.filter((post) => {
      if (post.visibility === 'public') {
        return true
      }

      if (post.visibility === 'private') {
        if (post.user_id === contextUser?.id) {
          return true
        }
        return followedUsers.includes(post.user_id)
      }

      return post.visibility === 'public'
    })

    switch (activeTab) {
      case "following":
        filtered = filtered.filter((post) => followedUsers.includes(post.user_id))
        break

      case "trending":
        filtered.sort((a, b) => {
          const aEngagement = (likesByPost[a.id]?.count || 0) * 2 + (commentsByPost[a.id]?.length || 0)
          const bEngagement = (likesByPost[b.id]?.count || 0) * 2 + (commentsByPost[b.id]?.length || 0)
          return bEngagement - aEngagement
        })
        break

      case "recent":
        filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        break

      case "for-you":
      default:
        break
    }

    return filtered
  }, [activeTab, posts, followedUsers, likesByPost, commentsByPost, contextUser?.id])

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100">
        <div className="mx-auto max-w-2xl px-4 py-12">
          <div className="mb-12">
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">Explore</h1>
            <p className="mt-2 text-base text-slate-600">Discover what's happening</p>
          </div>
          <PostListSkeleton count={3} />
        </div>
      </div>
    )
  }

  const postsView = (
    <div className="mx-auto max-w-2xl px-4 py-8">
      {error && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 rounded-2xl border border-red-200/50 bg-gradient-to-r from-red-50 to-red-50/50 p-4 text-red-700 shadow-sm"
        >
          <p className="font-medium">{error}</p>
        </motion.div>
      )}

      {filteredPosts.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-slate-200 bg-white p-12 text-center shadow-sm"
        >
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-slate-100 to-slate-50">
            <svg className="h-8 w-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v12a2 2 0 01-2 2z" />
            </svg>
          </div>
          <p className="mb-1 text-lg font-semibold text-slate-900">No posts yet</p>
          <p className="text-slate-600">Be the first to share something with the community!</p>
        </motion.div>
      ) : (
        <div className="space-y-6">
          <AnimatePresence mode="wait">
            {filteredPosts.map((post, index) => (
              <motion.article
                key={post.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: Math.min(index * 0.02, 0.1) }}
                data-post-id={post.id}
                onClick={() => openPostModal(post)}
                className="group cursor-pointer overflow-hidden rounded-2xl border border-slate-200/60 bg-white shadow-sm transition-all duration-300 hover:border-slate-300 hover:shadow-lg"
              >
                <div className="px-6 pb-4 pt-5">
                  <div className="flex items-start gap-4">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        if (post.profiles?.username) {
                          navigate(`/profile/${post.profiles.username}`)
                        }
                      }}
                      className="flex-shrink-0 transition-transform duration-200 hover:scale-110"
                    >
                      {post.profiles?.avatar_url ? (
                        <img
                          src={getAvatarImageUrl(post.profiles.avatar_url)}
                          alt={post.profiles?.username}
                          width={48}
                          height={48}
                          className="h-12 w-12 rounded-full object-cover ring-2 ring-slate-100 transition-all hover:ring-blue-200"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-blue-400 to-cyan-400 text-sm font-bold text-white ring-2 ring-slate-100">
                          {post.profiles?.name?.charAt(0) || post.profiles?.username?.charAt(0) || "?"}
                        </div>
                      )}
                    </button>

                    <div className="min-w-0 flex-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          if (post.profiles?.username) {
                            navigate(`/profile/${post.profiles.username}`)
                          }
                        }}
                        className="text-left text-base font-semibold text-slate-900 transition-colors hover:text-blue-600 hover:underline"
                      >
                        {post.profiles?.name || post.profiles?.username || "Unknown"}
                      </button>
                      <p className="mt-0.5 flex items-center gap-2 text-sm text-slate-500">
                        <span>@{post.profiles?.username || "unknown"}</span>
                        <span>·</span>
                        <span>{formatPostTime(post.created_at)}</span>
                        <span>·</span>
                        <VisibilityBadge visibility={post.visibility || "public"} size="xs" />
                      </p>
                    </div>

                    {contextUser?.id && post.user_id !== contextUser.id && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleToggleFollow(post.user_id)
                        }}
                        className={`flex-shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold transition-all duration-200 ${
                          followedUsers.includes(post.user_id)
                            ? "bg-slate-200 text-slate-900 hover:bg-slate-300"
                            : "bg-blue-500 text-white hover:bg-blue-600"
                        }`}
                      >
                        {followedUsers.includes(post.user_id) ? "Following" : "Follow"}
                      </button>
                    )}
                  </div>
                </div>

                {post.content && (
                  <div className="break-words px-6 text-base leading-relaxed text-slate-700 whitespace-pre-wrap">
                    {post.content}
                  </div>
                )}

                {post.image_url && (
                  <div className="mt-4 overflow-hidden bg-slate-100">
                    <img 
                      src={getFeedImageUrl(post.image_url, { width: 400, quality: 60 })} 
                      alt="Post" 
                      width={700}
                      height={400}
                      className="h-[400px] w-full object-cover" 
                      loading="lazy"
                    />
                  </div>
                )}

                <div className="border-t border-slate-100 px-6 py-4">
                  <PostInteractions
                    post={post}
                    initialComments={commentsByPost[post.id] || []}
                    initialLikes={likesByPost[post.id] || { count: 0, userLiked: false }}
                  />
                </div>
              </motion.article>
            ))}
          </AnimatePresence>

          {/* Infinite scroll sentinel */}
          <div ref={loadMoreRef} className="h-20 w-full" />

          {/* Loading indicator for next batch */}
          {loadingMore && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex justify-center py-4"
            >
              <div className="flex gap-1">
                <div className="h-2 w-2 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="h-2 w-2 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="h-2 w-2 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </motion.div>
          )}
        </div>
      )}

      {/* POST MODAL */}
      <AnimatePresence>
        {modalOpen && selectedPost && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closePostModal}
              className="fixed inset-0 z-50 bg-black/40 backdrop-blur-md"
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              onClick={(e) => e.stopPropagation()}
              className="fixed inset-0 z-50 m-auto flex max-h-[90vh] max-w-4xl overflow-hidden rounded-3xl bg-white shadow-[0_20px_80px_rgba(0,0,0,0.25)]"
            >
              <div className="hidden w-1/2 flex-col items-center justify-center overflow-y-auto bg-slate-50 md:flex">
                {selectedPost.image_url ? (
                  <img 
                    src={selectedPost.image_url} 
                    alt="Post" 
                    className="h-full w-full object-cover" 
                    loading="lazy"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-blue-50 to-slate-100">
                    <p className="text-sm text-slate-500">No image</p>
                  </div>
                )}
              </div>

              <div className="flex w-full flex-col overflow-hidden md:w-1/2">
                <div className="flex-shrink-0 border-b border-slate-200 px-6 py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          if (selectedPost.profiles?.username) {
                            closePostModal()
                            navigate(`/profile/${selectedPost.profiles.username}`)
                          }
                        }}
                      >
                        {selectedPost.profiles?.avatar_url ? (
                          <img
                            src={getAvatarImageUrl(selectedPost.profiles.avatar_url)}
                            alt={selectedPost.profiles?.username}
                            width={40}
                            height={40}
                            className="h-10 w-10 rounded-full object-cover ring-2 ring-slate-100 transition-all hover:ring-blue-200"
                            loading="lazy"
                          />
                        ) : (
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-blue-400 to-cyan-400 text-xs font-bold text-white ring-2 ring-slate-100">
                            {selectedPost.profiles?.name?.charAt(0) || selectedPost.profiles?.username?.charAt(0) || "?"}
                          </div>
                        )}
                      </button>
                      <div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            if (selectedPost.profiles?.username) {
                              closePostModal()
                              navigate(`/profile/${selectedPost.profiles.username}`)
                            }
                          }}
                          className="text-sm font-semibold text-slate-900 transition-colors hover:text-blue-600"
                        >
                          {selectedPost.profiles?.name || selectedPost.profiles?.username || "Unknown"}
                        </button>
                        <p className="text-xs text-slate-500">{formatPostTime(selectedPost.created_at)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {contextUser?.id && selectedPost.user_id !== contextUser.id && (
                        <motion.button
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={(e) => {
                            e.stopPropagation()
                            handleToggleFollow(selectedPost.user_id)
                          }}
                          className={`rounded-full px-3 py-1 text-xs font-semibold transition-all duration-200 ${
                            followedUsers.includes(selectedPost.user_id)
                              ? "bg-slate-200 text-slate-900 hover:bg-slate-300"
                              : "bg-blue-500 text-white hover:bg-blue-600"
                          }`}
                        >
                          {followedUsers.includes(selectedPost.user_id) ? "Following" : "Follow"}
                        </motion.button>
                      )}
                      <button
                        onClick={closePostModal}
                        className="rounded-full p-2 text-slate-500 transition-colors hover:bg-slate-100"
                      >
                        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto px-6 py-4">
                  {selectedPost.content && (
                    <p className="mb-4 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                      {selectedPost.content}
                    </p>
                  )}

                  {selectedPost.image_url && (
                    <div className="mb-4 overflow-hidden rounded-lg md:hidden">
                      <img src={selectedPost.image_url} alt="Post" loading="lazy" className="max-h-64 w-full object-cover" />
                    </div>
                  )}

                  <div className="mb-4 flex items-center gap-2">
                    <p className="text-sm font-semibold text-slate-900">
                      Comments ({(commentsByPost[selectedPost.id] || []).length})
                    </p>
                  </div>

                  <div className="space-y-3">
                    {(commentsByPost[selectedPost.id] || []).length === 0 ? (
                      <p className="py-4 text-center text-xs text-slate-400">No comments yet. Be the first!</p>
                    ) : (
                      (commentsByPost[selectedPost.id] || []).map((comment) => (
                        <div key={comment.id} className="rounded-lg bg-slate-50 p-3 transition-colors hover:bg-slate-100">
                          <div className="flex items-start gap-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                if (comment.profiles?.username) {
                                  closePostModal()
                                  navigate(`/profile/${comment.profiles.username}`)
                                }
                              }}
                            >
                              {comment.profiles?.avatar_url ? (
                                <img
                                  src={comment.profiles.avatar_url}
                                  alt={comment.profiles?.username}
                                  className="h-8 w-8 rounded-full object-cover"
                                />
                              ) : (
                                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-xs font-bold text-slate-700">
                                  {comment.profiles?.username?.charAt(0)?.toUpperCase() || "?"}
                                </div>
                              )}
                            </button>
                            <div className="flex-1 min-w-0">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  if (comment.profiles?.username) {
                                    closePostModal()
                                    navigate(`/profile/${comment.profiles.username}`)
                                  }
                                }}
                                className="text-xs font-semibold text-slate-900 hover:text-blue-600"
                              >
                                {comment.profiles?.username || "Unknown"}
                              </button>
                              <p className="mt-1 break-words text-xs leading-relaxed text-slate-700">
                                {comment.content}
                              </p>
                              <p className="mt-1 text-[10px] text-slate-500">
                                {formatPostTime(comment.created_at)}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="border-t border-slate-200 px-6 py-4">
                  <PostInteractions
                    post={selectedPost}
                    initialComments={commentsByPost[selectedPost.id] || []}
                    initialLikes={likesByPost[selectedPost.id] || { count: 0, userLiked: false }}
                  />
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100">
      <div className="sticky top-0 z-40 border-b border-slate-200/50 bg-white/80 backdrop-blur shadow-sm">
        <div className="mx-auto max-w-2xl px-4 py-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Explore</h1>
              <p className="text-xs text-slate-600">Discover what's happening</p>
            </div>
          </div>

          {/* Tab Navigation */}
          <div className="mt-4 flex gap-2 overflow-x-auto pb-2">
            {["for-you", "following", "trending", "recent"].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition-all ${
                  activeTab === tab
                    ? "bg-blue-500 text-white shadow-md"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1).replace("-", " ")}
              </button>
            ))}
          </div>
        </div>
      </div>

      {postsView}
    </div>
  )
}
