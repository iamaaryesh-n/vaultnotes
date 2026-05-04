import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { supabase } from "../lib/supabase"
import PostContent from "./PostContent"

// Module-level cache to share data across all PostPreview instances
const postCache = new Map()
const pendingFetches = new Map()

/**
 * PostPreview — renders a shared post inside a chat bubble.
 * Auto-loads post data on mount with a skeleton UI to prevent layout shifts.
 */
export default function PostPreview({ post_id, isMine = false }) {
  const navigate = useNavigate()
  const [post, setPost] = useState(() => postCache.get(post_id) || null)
  const [loading, setLoading] = useState(!postCache.has(post_id))
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!post_id || postCache.has(post_id)) return

    let isMounted = true

    const fetchPost = async () => {
      // Check if a fetch is already in progress for this post
      if (pendingFetches.has(post_id)) {
        try {
          const data = await pendingFetches.get(post_id)
          if (isMounted) {
            setPost(data)
            setLoading(false)
          }
        } catch {
          if (isMounted) {
            setError(true)
            setLoading(false)
          }
        }
        return
      }

      try {
        const fetchPromise = supabase
          .from("posts")
          .select("id, content, image_url, created_at, user_id, profiles:user_id(name, username, avatar_url)")
          .eq("id", post_id)
          .maybeSingle()
          .then(res => {
            if (res.error || !res.data) throw new Error("Not found")
            return res.data
          })

        pendingFetches.set(post_id, fetchPromise)
        const data = await fetchPromise

        if (isMounted) {
          postCache.set(post_id, data)
          setPost(data)
          setLoading(false)
        }
      } catch (err) {
        if (isMounted) {
          setError(true)
          setLoading(false)
        }
      } finally {
        pendingFetches.delete(post_id)
      }
    }

    fetchPost()
    return () => {
      isMounted = false
    }
  }, [post_id])

  const handleOpenPost = (e) => {
    e.stopPropagation()
    if (post_id) {
      window.dispatchEvent(new CustomEvent("openGlobalPostModal", { detail: { postId: post_id } }))
    }
  }

  const handleProfileClick = (e) => {
    e.stopPropagation()
    const username = post?.profiles?.username || (Array.isArray(post?.profiles) ? post.profiles[0]?.username : null)
    if (username) {
      navigate(`/profile/${username}`)
    }
  }

  // Error / Not found state
  if (error && !loading) {
    return (
      <div className={`w-fit max-w-[280px] rounded-2xl border px-3 py-2.5 text-[12px] italic ${
        isMine
          ? "border-[var(--chat-accent)]/20 text-[var(--chat-text-muted)] bg-[var(--chat-accent-soft)]/30"
          : "border-[var(--chat-border)] text-[var(--chat-text-muted)]"
      }`}>
        Post no longer available
      </div>
    )
  }

  const profile = post?.profiles ? (Array.isArray(post.profiles) ? post.profiles[0] : post.profiles) : null
  const displayName = profile?.name || profile?.username || "Unknown"
  const username = profile?.username || "unknown"
  const avatarUrl = profile?.avatar_url || null
  const initial = displayName.charAt(0).toUpperCase()

  return (
    <div
      onClick={handleOpenPost}
      className={`group w-fit min-w-[220px] max-w-[280px] cursor-pointer overflow-hidden rounded-[14px] border shadow-[0_2px_8px_rgba(0,0,0,0.05)] transition-all duration-200 hover:scale-[1.01] ${
        isMine
          ? "border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)] bg-[var(--chat-accent-soft)]/60 hover:bg-[var(--chat-accent-soft)]/90"
          : "border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)] bg-[var(--chat-surface)] hover:bg-[var(--chat-elev)]"
      }`}
    >
      {/* Header: Profile Info */}
      <div 
        onClick={handleProfileClick}
        className={`flex items-center gap-2 border-b px-3 py-2 transition-colors ${
        isMine ? "border-[var(--chat-accent)]/10" : "border-[var(--chat-border)]"
      }`}>
        {loading ? (
          <div className="h-6 w-6 animate-pulse rounded-full bg-[var(--chat-border-strong)]" />
        ) : avatarUrl ? (
          <img
            src={avatarUrl}
            alt={displayName}
            className="h-6 w-6 shrink-0 rounded-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-['Sora'] text-[10px] font-bold ${
            isMine
              ? "bg-[var(--chat-accent)] text-[var(--chat-on-accent)]"
              : "bg-[var(--chat-accent-soft)] text-[var(--chat-accent)]"
          }`}>
            {initial}
          </div>
        )}
        
        <div className="flex min-w-0 flex-1 flex-col">
          {loading ? (
            <div className="h-2.5 w-20 animate-pulse rounded-full bg-[var(--chat-border-strong)]" />
          ) : (
            <span className={`truncate font-['DM_Sans'] text-[12px] font-semibold ${
              isMine ? "text-[var(--chat-text)]" : "text-[var(--chat-text)]"
            }`}>
              {displayName}
            </span>
          )}
        </div>
      </div>

      {/* Body: Content */}
      <div className="px-3 py-2.5">
        {loading ? (
          <div className="space-y-1.5">
            <div className="h-2.5 w-full animate-pulse rounded-full bg-[var(--chat-border-strong)]" />
            <div className="h-2.5 w-5/6 animate-pulse rounded-full bg-[var(--chat-border-strong)]" />
            <div className="h-2.5 w-4/6 animate-pulse rounded-full bg-[var(--chat-border-strong)]" />
          </div>
        ) : post?.content && (
          <PostContent
            content={post.content}
            className={`line-clamp-4 font-['DM_Sans'] text-[13px] leading-[1.55] ${
              isMine ? "text-[var(--chat-text)]" : "text-[var(--chat-text)]"
            }`}
          />
        )}
      </div>

      {/* Image Thumbnail */}
      {loading ? (
        <div className="h-[120px] w-full animate-pulse bg-[var(--chat-border-strong)]/30" />
      ) : post?.image_url && (
        <div className="relative overflow-hidden" style={{ maxHeight: 140 }}>
          <img
            src={post.image_url}
            alt="Post"
            className="h-full w-full object-cover"
            loading="lazy"
            style={{ maxHeight: 140 }}
          />
        </div>
      )}

      {/* Footer */}
      <div className={`flex items-center justify-end px-3 py-2 border-t transition-colors ${
        isMine ? "border-[rgba(0,0,0,0.06)] dark:border-[rgba(255,255,255,0.06)] bg-[var(--chat-accent)]/5" : "border-[var(--chat-border)] bg-[var(--chat-elev)]/30"
      }`}>
        <div className={`text-[10px] font-bold tracking-tight uppercase ${
          isMine ? "text-[var(--chat-on-accent)]/70 group-hover:text-[var(--chat-on-accent)]" : "text-[var(--chat-text-muted)] group-hover:text-[var(--chat-text)]"
        }`}>
          {loading ? "..." : (
            <span className="flex items-center gap-1.5">
              Tap to view post <span className="text-[12px] opacity-70">↗</span>
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
