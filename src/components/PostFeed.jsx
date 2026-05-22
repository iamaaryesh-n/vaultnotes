import { useEffect, useMemo, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { motion } from "framer-motion"
import { PostListSkeleton } from "./PostSkeleton"
import PostCard from "./PostCard"


export default function PostFeed({
  activeTab,
  contextUser,
  followedUsers,
  posts,
  commentsByPost,
  likesByPost,
  loading,
  loadingMore,
  hasMore,
  error,
  page,
  queueNextPageLoad,
  onToggleFollow,
  onOpenPost,
  authReady,
  currentUserId = null
}) {
  const navigate = useNavigate()
  const loadMoreRef = useRef(null)

  const filteredPosts = useMemo(() => {
    let filtered = [...posts]

    filtered = filtered.filter((post) => {
      if (post.visibility === "public") {
        return true
      }

      if (post.visibility === "private") {
        if (post.user_id === contextUser?.id) {
          return true
        }

        return followedUsers.includes(post.user_id)
      }

      return post.visibility === "public"
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
  }, [activeTab, contextUser?.id, followedUsers, posts, likesByPost, commentsByPost])

  useEffect(() => {
    if (!loadMoreRef.current) return

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && hasMore && !loadingMore) {
            if (import.meta.env.DEV) {
              console.log("[IntersectionTrigger] Load more observer fired")
            }
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
  }, [hasMore, loadingMore, page, filteredPosts.length, queueNextPageLoad])

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <PostListSkeleton count={3} />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-4">
      {error && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 rounded-[14px] border border-[var(--profile-border)] bg-[var(--profile-surface)] p-4 text-[#EF4444]"
        >
          <p className="font-medium">{error}</p>
        </motion.div>
      )}

      {filteredPosts.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-[14px] border border-dashed border-[var(--profile-border-strong)] bg-transparent p-12 text-center"
        >
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--profile-elev)]">
            <svg className="h-8 w-8 text-[var(--profile-text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v12a2 2 0 01-2 2z"
              />
            </svg>
          </div>
          <p className="mb-1 text-lg font-semibold text-[var(--profile-text-subtle)]">No posts yet</p>
          <p className="text-[var(--profile-text-muted)]">Be the first to share something with the community!</p>
        </motion.div>
      ) : (
        <div>
          {filteredPosts.map((post, index) => (
            <PostCard
              key={post.id}
              post={post}
              likes={likesByPost[post.id] || { count: 0, userLiked: false }}
              comments={commentsByPost[post.id] || []}
              isFollowed={followedUsers.includes(post.user_id)}
              isOwnPost={contextUser?.id === post.user_id}
              onToggleFollow={onToggleFollow}
              onOpenPost={onOpenPost}
              authReady={authReady}
              index={index}
              currentUser={contextUser}
              currentUserId={currentUserId || contextUser?.id}
            />
          ))}

          <div ref={loadMoreRef} className="h-20 w-full" />

          {loadingMore && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-center py-4">
              <div className="flex gap-1">
                <div className="h-2 w-2 animate-bounce rounded-full bg-[var(--profile-text-muted)]" style={{ animationDelay: "0ms" }} />
                <div className="h-2 w-2 animate-bounce rounded-full bg-[var(--profile-text-subtle)]" style={{ animationDelay: "150ms" }} />
                <div className="h-2 w-2 animate-bounce rounded-full bg-[#F4B400]" style={{ animationDelay: "300ms" }} />
              </div>
            </motion.div>
          )}
        </div>
      )}
    </div>
  )
}
