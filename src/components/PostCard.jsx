import React from "react"
import { useNavigate } from "react-router-dom"
import { motion } from "framer-motion"
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

const PostCard = React.memo(({ 
  post, 
  likes, 
  comments, 
  isFollowed, 
  isOwnPost,
  onToggleFollow, 
  onOpenPost, 
  authReady, 
  index,
  currentUser = null,
  currentUserId = null
}) => {
  const navigate = useNavigate()

  return (
    <motion.article
      initial={index === 0 ? { opacity: 0 } : { opacity: 1 }}
      animate={{ opacity: 1 }}
      transition={index === 0 ? { duration: 0.2 } : { duration: 0 }}
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
                decoding="async"
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

          {!isOwnPost && (
            <button
              onClick={(event) => {
                event.stopPropagation()
                onToggleFollow(post.user_id)
              }}
              className={`ml-auto flex-shrink-0 rounded-[16px] border px-3 py-[3px] text-[12px] font-semibold transition-all duration-200 ${
                isFollowed
                  ? "border-transparent bg-transparent text-[var(--profile-text-muted)]"
                  : "border-[var(--profile-border-strong)] bg-transparent text-[var(--profile-text-subtle)] hover:border-[#F4B400] hover:text-[#F4B400]"
              }`}
            >
              {isFollowed ? "Following" : "Follow"}
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
          className="mt-3 w-full cursor-pointer overflow-hidden rounded-[14px] bg-[var(--profile-elev)]"
        >
          <img
            src={getFeedImageUrl(post.image_url, { width: 600, quality: 75 })}
            alt="Post"
            className="h-auto w-full max-h-[80vh] object-contain"
            decoding="async"
            loading="lazy"
            fetchpriority="low"
          />
        </div>
      )}

      <div className="mt-[12px]">
        <PostInteractions
          post={post}
          initialComments={comments}
          initialLikes={likes}
          commentCount={comments.length}
          authReady={authReady}
          currentUser={currentUser}
          currentUserId={currentUserId}
        />
      </div>
    </motion.article>
  )
})

PostCard.displayName = "PostCard"

export default PostCard
