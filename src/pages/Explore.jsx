import { useCallback, useState, useEffect, useMemo } from "react"
import { supabase } from "../lib/supabase"
import { useNavigate } from "react-router-dom"
import { useAuth } from "../hooks/useAuth"
import PostInteractions from "../components/PostInteractions"
import { useSmartFetchPosts } from "../hooks/useSmartFetchPosts"
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

  // Smart fetch with caching
  const {
    posts,
    comments: commentsByPost,
    likes: likesByPost,
    loading,
    error,
    updateComment,
    removeComment,
    removeCommentById,
    updateLike
  } = useSmartFetchPosts(
    async () => {
      const { data, error: fetchError } = await supabase
        .from("posts")
        .select("id, user_id, content, image_url, created_at, visibility, profiles(id, username, name, avatar_url)")
        .order("created_at", { ascending: false })
        .limit(100)

      if (fetchError) {
        console.error("[Explore] Error fetching posts:", fetchError)
        throw new Error("Failed to load posts")
      }

      return data || []
    },
    "explore"
  )

  // Prefetch data strategy
  usePrefetchData("explore", {})

  // Memoized realtime handlers - stable across renders
  const handleLikesRealtime = useCallback((payload) => {
    console.log("Realtime event:", payload)
    if (payload.eventType === "DELETE") {
      const postId = payload.old?.post_id
      if (!postId) return

      console.log("DELETE LIKE:", payload.old)
      console.log("Realtime like received for post_id", postId)
      console.log("Updating post:", postId)
      updateLike(postId, "DELETE", payload.old?.user_id)
      return
    }

    const postId = payload.new?.post_id
    if (!postId) return

    console.log("Realtime like received for post_id", postId)
    console.log("Updating post:", postId)
    updateLike(postId, payload.eventType, payload.new?.user_id)
  }, [updateLike])

  const handleCommentsRealtime = useCallback(async (payload) => {
    if (payload.eventType === "INSERT" && payload.new?.post_id) {
      console.log("Realtime event:", payload)
      console.log("Realtime comment received", payload.new)
      console.log("Updating post:", payload.new.post_id)

      const comment = {
        id: payload.new.id,
        user_id: payload.new.user_id,
        content: payload.new.content,
        created_at: payload.new.created_at,
        profiles: { username: "unknown", avatar_url: null }
      }

      updateComment(payload.new.post_id, comment)
      return
    }

    if (payload.eventType === "DELETE") {
      console.log("DELETE EVENT FULL:", payload)
      console.log("OLD DATA:", payload.old)

      const comment_id = payload.old?.id
      if (!comment_id) return

      let post_id = payload.old?.post_id

      if (!post_id) {
        const { data, error: fetchError } = await supabase
          .from("comments")
          .select("post_id")
          .eq("id", comment_id)
          .single()

        if (fetchError) {
          console.warn("[Explore] Failed to resolve post_id for deleted comment:", fetchError)
        }

        post_id = data?.post_id
      }

      console.log("DELETE COMMENT:", payload.old)
      console.log("Realtime DELETE event:", payload)
      if (post_id) {
        console.log("Updating post:", post_id)
        removeComment(post_id, comment_id)
      } else {
        removeCommentById(comment_id)
      }
    }
  }, [updateComment, removeComment, removeCommentById])

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
        // Unfollow
        const result = await unfollowUser(contextUser.id, userId)
        if (result.success) {
          setFollowedUsers((prev) => prev.filter((id) => id !== userId))
        }
      } else {
        // Follow
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

    // Filter by visibility
    filtered = filtered.filter((post) => {
      // Public posts visible to all
      if (post.visibility === 'public') {
        return true
      }

      // Private posts visible only to author and followers
      if (post.visibility === 'private') {
        // Author can always see their own posts
        if (post.user_id === contextUser?.id) {
          return true
        }
        // Followers can see private posts
        return followedUsers.includes(post.user_id)
      }

      // Default: show public posts
      return post.visibility === 'public'
    })

    switch (activeTab) {
      case "following":
        filtered = filtered.filter((post) => followedUsers.includes(post.user_id))
        break

      case "trending":
        // Sort by engagement score (likes + comments weighted)
        filtered.sort((a, b) => {
          const aEngagement = (likesByPost[a.id]?.count || 0) * 2 + (commentsByPost[a.id]?.length || 0)
          const bEngagement = (likesByPost[b.id]?.count || 0) * 2 + (commentsByPost[b.id]?.length || 0)
          return bEngagement - aEngagement
        })
        break

      case "recent":
        // Already sorted by created_at DESC from fetch, but ensure it's correct
        filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        break

      case "for-you":
      default:
        // Keep default order (recently created)
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
          <PostListSkeleton count={5} />
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
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
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
                          src={post.profiles.avatar_url}
                          alt={post.profiles?.username}
                          className="h-12 w-12 rounded-full object-cover ring-2 ring-slate-100 transition-all hover:ring-blue-200"
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
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
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
                      </motion.button>
                    )}
                  </div>
                </div>

                {post.content && (
                  <div className="break-words px-6 text-base leading-relaxed text-slate-700 whitespace-pre-wrap">
                    {post.content}
                  </div>
                )}

                {post.image_url && (
                  <div className="mt-4 overflow-hidden">
                    <img src={post.image_url} alt="Post" className="max-h-96 w-full object-cover" />
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
        </div>
      )}

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
                  <img src={selectedPost.image_url} alt="Post" className="h-full w-full object-cover" />
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
                            src={selectedPost.profiles.avatar_url}
                            alt={selectedPost.profiles?.username}
                            className="h-10 w-10 rounded-full object-cover ring-2 ring-slate-100 transition-all hover:ring-blue-200"
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
                      <img src={selectedPost.image_url} alt="Post" className="max-h-64 w-full object-cover" />
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
                                  className="h-6 w-6 rounded-full object-cover"
                                />
                              ) : (
                                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-blue-400 to-cyan-400 text-[10px] font-bold text-white">
                                  {comment.profiles?.username?.charAt(0) || "?"}
                                </div>
                              )}
                            </button>
                            <div className="min-w-0 flex-1">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  if (comment.profiles?.username) {
                                    closePostModal()
                                    navigate(`/profile/${comment.profiles.username}`)
                                  }
                                }}
                                className="text-xs font-semibold text-slate-900 transition-colors hover:text-blue-600"
                              >
                                @{comment.profiles?.username || "unknown"}
                              </button>
                              <p className="mt-0.5 break-words text-xs text-slate-700">{comment.content}</p>
                              <p className="mt-1 text-xs text-slate-400">
                                {new Date(comment.created_at).toLocaleString("en-US", {
                                  month: "short",
                                  day: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit"
                                })}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="flex-shrink-0 border-t border-slate-200 px-6 py-4">
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

  const workspacesView = (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-8 flex flex-col gap-2">
        <p className="text-sm font-semibold uppercase tracking-[0.15em] text-blue-600">Discover</p>
        <div className="flex items-end justify-between gap-4">
          <h2 className="text-3xl font-bold text-slate-900">Public Workspaces</h2>
          <p className="text-sm text-slate-500 whitespace-nowrap">
            {publicWorkspacesLoading ? "Loading..." : `${publicWorkspaces.length} available`}
          </p>
        </div>
        <p className="text-slate-600">Browse and join public workspaces shared by the community</p>
      </div>

      {publicWorkspacesLoading ? (
        <div className="flex gap-4 overflow-x-auto pb-4 snap-x snap-mandatory">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="w-[280px] flex-none snap-start rounded-3xl border border-slate-200/70 bg-white shadow-sm animate-pulse">
              <div className="border-b border-slate-100 px-6 pt-5 pb-4">
                <div className="h-3 w-12 rounded-full bg-slate-200 mb-3" />
                <div className="h-6 w-32 rounded bg-slate-100" />
              </div>
              <div className="border-b border-slate-100 px-6 py-4 flex gap-3">
                <div className="h-10 w-10 rounded-full bg-slate-200 flex-none" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-20 rounded bg-slate-100" />
                  <div className="h-3 w-16 rounded bg-slate-100" />
                </div>
              </div>
              <div className="px-6 py-4 grid grid-cols-2 gap-3">
                <div className="h-20 rounded-2xl bg-slate-100" />
                <div className="h-20 rounded-2xl bg-slate-100" />
              </div>
              <div className="border-t border-slate-100 px-6 py-4">
                <div className="h-10 w-full rounded-lg bg-slate-100" />
              </div>
            </div>
          ))}
        </div>
      ) : publicWorkspaces.length > 0 ? (
        <div className="flex gap-4 overflow-x-auto pb-4 snap-x snap-mandatory">
          {publicWorkspaces.map((workspace) => (
            <PublicWorkspaceCard key={workspace.id} workspace={workspace} />
          ))}
        </div>
      ) : (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-gradient-to-br from-slate-50 to-blue-50/30 px-8 py-12 text-center">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 mb-4">
            <svg className="h-6 w-6 text-blue-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
            </svg>
          </div>
          <p className="text-slate-600 font-medium">No public workspaces yet</p>
          <p className="mt-2 text-sm text-slate-500">Create your first workspace to share with the community</p>
        </div>
      )}
    </div>
  )

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100 pb-20">
      <div className="sticky top-0 z-40 border-b border-slate-200/50 bg-white/80 backdrop-blur-lg">
        <div className="mx-auto max-w-2xl px-4 py-8">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">Explore</h1>
          <p className="mt-2 text-base text-slate-600">Discover what's happening in your network</p>
        </div>

        <div className="border-t border-slate-100 bg-white/50 px-4 py-3 backdrop-blur-sm">
          <div className="mx-auto max-w-2xl">
            <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
              {[
                { id: "for-you", label: "For You", icon: "✨" },
                { id: "following", label: "Following", icon: "👥" },
                { id: "trending", label: "Trending", icon: "🔥" },
                { id: "recent", label: "Recent", icon: "🕐" }
              ].map((tab) => (
                <motion.button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`relative flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold whitespace-nowrap transition-colors ${
                    activeTab === tab.id
                      ? "text-blue-600"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  }`}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <span>{tab.icon}</span>
                  <span>{tab.label}</span>
                  {activeTab === tab.id && (
                    <motion.div
                      layoutId="activeTab"
                      className="absolute inset-0 -z-10 rounded-full bg-gradient-to-r from-blue-100 to-blue-50"
                      transition={{ type: "spring", stiffness: 380, damping: 40 }}
                    />
                  )}
                </motion.button>
              ))}
            </div>

            <div className="mt-4 inline-flex rounded-full bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => setViewMode("posts")}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition-all ${
                  viewMode === "posts" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
                }`}
              >
                Posts
              </button>
              <button
                type="button"
                onClick={() => setViewMode("workspaces")}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition-all ${
                  viewMode === "workspaces" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
                }`}
              >
                Workspaces
              </button>
            </div>
          </div>
        </div>
      </div>

      {viewMode === "posts" ? postsView : workspacesView}
    </div>
  )
}
