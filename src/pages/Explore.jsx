import { useCallback } from "react"
import { supabase } from "../lib/supabase"
import { useNavigate } from "react-router-dom"
import PostInteractions from "../components/PostInteractions"
import { useSmartFetchPosts } from "../hooks/useSmartFetchPosts"
import { usePrefetchData } from "../hooks/usePrefetchData"
import { usePrefetchWorkspaces } from "../hooks/usePrefetchWorkspaces"
import { PostListSkeleton } from "../components/PostSkeleton"
import { usePostsRealtime } from "../hooks/usePostsRealtime"

export default function Explore() {
  const navigate = useNavigate()

  // Prefetch workspaces in the background for fast navigation to Dashboard
  usePrefetchWorkspaces()

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
        .select("id, user_id, content, image_url, created_at, profiles(id, username, name, avatar_url)")
        .eq("visibility", "public")
        .order("created_at", { ascending: false })
        .limit(20)

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

  if (loading) {
    return (
      <div style={{ maxWidth: "600px" }} className="mx-auto px-4 py-8">
        <h1 className="text-4xl text-yellow-500 font-bold mb-8">Explore</h1>
        <PostListSkeleton count={5} />
      </div>
    )
  }

  return (
    <div style={{ maxWidth: "600px" }} className="mx-auto px-4 py-8">
      <h1 className="text-4xl text-yellow-500 font-bold mb-8">Explore</h1>

      {error && (
        <div className="card p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg mb-6">
          {error}
        </div>
      )}

      {posts.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="text-gray-600 mb-4">No posts found</p>
          <p className="text-sm text-gray-500">Be the first to create a post!</p>
        </div>
      ) : (
        <div className="space-y-6">
          {posts.map((post) => (
            <article
              key={post.id}
              data-post-id={post.id}
              className="card border border-slate-200 rounded-xl p-5 bg-white hover:shadow-md transition-shadow duration-200"
            >
              {/* Post Header: Avatar, Username, Timestamp */}
              <div className="flex items-start gap-3 mb-4">
                <button
                  onClick={() => {
                    if (post.profiles?.username) {
                      navigate(`/profile/${post.profiles.username}`)
                    }
                  }}
                  className="flex-shrink-0 flex items-center justify-start"
                >
                  {post.profiles?.avatar_url ? (
                    <img
                      src={post.profiles.avatar_url}
                      alt={post.profiles?.username}
                      className="w-10 h-10 rounded-full object-cover border border-yellow-200 hover:shadow-md transition-shadow"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-yellow-200 to-yellow-100 flex items-center justify-center text-xs font-semibold text-yellow-700 border border-yellow-300">
                      {post.profiles?.name?.charAt(0) || post.profiles?.username?.charAt(0) || "?"}
                    </div>
                  )}
                </button>

                <div className="flex-1 min-w-0">
                  <button
                    onClick={() => {
                      if (post.profiles?.username) {
                        navigate(`/profile/${post.profiles.username}`)
                      }
                    }}
                    className="text-sm font-semibold text-gray-900 hover:text-blue-600 hover:underline transition-colors text-left"
                  >
                    @{post.profiles?.username || "unknown"}
                  </button>
                  <p className="text-xs text-slate-500 mt-1">{formatPostTime(post.created_at)}</p>
                </div>
              </div>

              {/* Post Content */}
              {post.content && (
                <p className="text-gray-800 whitespace-pre-wrap leading-relaxed mb-3 text-sm">
                  {post.content}
                </p>
              )}

              {/* Post Image */}
              {post.image_url && (
                <img
                  src={post.image_url}
                  alt="Post"
                  className="w-full rounded-lg border border-slate-200 object-cover max-h-96 mb-3"
                />
              )}

              {/* Post Interactions */}
              <PostInteractions
                post={post}
                initialComments={commentsByPost[post.id] || []}
                initialLikes={likesByPost[post.id] || { count: 0, userLiked: false }}
              />
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
