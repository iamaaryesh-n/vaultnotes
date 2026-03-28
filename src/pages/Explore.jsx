import { useState, useEffect, useCallback } from "react"
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
    updateLike
  } = useSmartFetchPosts(
    async () => {
      const { data, error: fetchError } = await supabase
        .from("posts")
        .select("id, user_id, content, image_url, created_at, profiles(id, username, name, avatar_url)")
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
    const { eventType = "INSERT", new: newData, old: oldData } = payload
    const postId = eventType === "DELETE" ? oldData.post_id : newData.post_id
    
    if (eventType === "INSERT") {
      updateLike(postId, true)
    } else if (eventType === "DELETE") {
      updateLike(postId, false)
    }
  }, [updateLike])

  const handleCommentsRealtime = useCallback(async (payload) => {
    const { eventType = "INSERT", new: newData } = payload

    if (eventType === "INSERT") {
      const postId = newData.post_id
      const tempComment = {
        id: newData.id,
        user_id: newData.user_id,
        content: newData.content,
        created_at: newData.created_at,
        profiles: { username: "unknown", avatar_url: null }
      }
      updateComment(postId, tempComment)

      // Fetch and update the profile info asynchronously
      try {
        const { fetchUserProfile } = await import("../lib/postInteractions")
        const profile = await fetchUserProfile(newData.user_id)
        updateComment(postId, { ...tempComment, profiles: profile })
      } catch (err) {
        console.error("[Explore] Error fetching user profile:", err)
      }
    }
  }, [updateComment])

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
                onCommentAdded={(newComment) => {
                  updateComment(post.id, newComment)
                }}
                onLikesChange={(newLikes) => {
                  // newLikes = { count, userLiked }
                  updateLike(post.id, newLikes.userLiked)
                }}
              />
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
