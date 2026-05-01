import { useEffect, useMemo, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"
import { PostListSkeleton } from "./PostSkeleton"
import PostInteractions from "./PostInteractions"
import PostContent from "./PostContent"
import { getFeedImageUrl, getAvatarImageUrl } from "../utils/imageOptimization"

function formatPostTime(value) {
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
  authReady
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
  }, [activeTab, commentsByPost, contextUser?.id, followedUsers, likesByPost, posts])

  useEffect(() => {
    if (!loadMoreRef.current) return

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && hasMore && !loadingMore) {
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

  useEffect(() => {
    const handleScroll = () => {
      const isNearBottom = window.innerHeight + window.scrollY >= document.body.offsetHeight - 300

      if (isNearBottom && hasMore && !loadingMore) {
        queueNextPageLoad()
      }
    }

    window.addEventListener("scroll", handleScroll)
    return () => {
      window.removeEventListener("scroll", handleScroll)
    }
  }, [hasMore, loadingMore, queueNextPageLoad])

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
          <AnimatePresence>
            {filteredPosts.map((post, index) => (
              <motion.article
                key={post.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: Math.min(index * 0.02, 0.1) }}
                data-post-id={post.id}
                className="group border-b border-[var(--profile-border)] px-4 py-4 transition-colors duration-200 hover:bg-[rgba(255,255,255,0.015)] first:border-t first:border-[var(--profile-border)]"
              >
                <div
                  onClick={() => onOpenPost(post)}
                  className="cursor-pointer"
                >
                  <div className="flex items-start gap-[11px]">
                    <button
                      onClick={(event) => {
                        event.stopPropagation()
                        if (post.profiles?.username) {
                          navigate(`/profile/${post.profiles.username}`)
                        }
                      }}
                      className="flex-shrink-0"
                    >
                      {post.profiles?.avatar_url ? (
                        <img
                          src={getAvatarImageUrl(post.profiles.avatar_url)}
                          alt={post.profiles?.username}
                          width={40}
                          height={40}
                          className="h-[40px] w-[40px] rounded-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex h-[40px] w-[40px] items-center justify-center rounded-full bg-[#2A2000] font-['Sora'] text-[15px] font-bold text-[#F4B400]">
                          {post.profiles?.name?.charAt(0) || post.profiles?.username?.charAt(0) || "?"}
                        </div>
                      )}
                    </button>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-[6px]">
                        <button
                          onClick={(event) => {
                            event.stopPropagation()
                            if (post.profiles?.username) {
                              navigate(`/profile/${post.profiles.username}`)
                            }
                          }}
                          className="text-left font-['Sora'] text-[14px] font-bold text-[var(--profile-text)] transition-colors hover:text-[#F4B400]"
                        >
                          {post.profiles?.name || post.profiles?.username || "Unknown"}
                        </button>
                        <span className="text-[12px] text-[var(--profile-text-muted)]">@{post.profiles?.username || "unknown"}</span>
                        <span className="h-[3px] w-[3px] rounded-full bg-[var(--profile-text-muted)]" />
                        <span className="text-[12px] text-[var(--profile-text-muted)]">{formatPostTime(post.created_at)}</span>
                      </div>
                    </div>

                    {contextUser?.id && post.user_id !== contextUser.id && (
                      <button
                        onClick={(event) => {
                          event.stopPropagation()
                          onToggleFollow(post.user_id)
                        }}
                        className={`ml-auto flex-shrink-0 rounded-[16px] border px-3 py-[3px] text-[12px] font-semibold transition-all duration-200 ${
                          followedUsers.includes(post.user_id)
                            ? "border-transparent bg-transparent text-[var(--profile-text-muted)]"
                            : "border-[var(--profile-border-strong)] bg-transparent text-[var(--profile-text-subtle)] hover:border-[#F4B400] hover:text-[#F4B400]"
                        }`}
                      >
                        {followedUsers.includes(post.user_id) ? "Following" : "Follow"}
                      </button>
                    )}
                  </div>
                </div>

                <div className="mt-3 mb-3 h-px w-full bg-[var(--profile-border)] opacity-60" />

                {post.content && (
                  <PostContent
                    content={post.content}
                    onClick={() => onOpenPost(post)}
                    className="w-full cursor-pointer text-left text-[15px] leading-7 text-[var(--profile-text)]"
                  />
                )}

                {post.image_url && (
                  <div
                    onClick={() => onOpenPost(post)}
                    className="relative mt-3 w-full cursor-pointer overflow-hidden rounded-[14px]"
                    style={{ aspectRatio: "4/3" }}
                  >
                    <img
                      src={getFeedImageUrl(post.image_url, { width: 600, quality: 75 })}
                      alt="Post"
                      className="absolute inset-0 block h-full w-full object-cover"
                      loading="lazy"
                    />
                  </div>
                )}

                <div className="mt-[12px]">
                  <PostInteractions
                    post={post}
                    initialComments={commentsByPost[post.id] || []}
                    initialLikes={likesByPost[post.id] || { count: 0, userLiked: false }}
                    commentCount={(commentsByPost[post.id] || []).length}
                    authReady={authReady}
                  />
                </div>
              </motion.article>
            ))}
          </AnimatePresence>

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
