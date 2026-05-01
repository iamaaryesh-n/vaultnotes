import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { supabase } from "../lib/supabase"
import PostContent from "./PostContent"

// Module-level cache to share data across all PostPreview instances
const postCache = {}
const pendingFetches = {}

/**
 * PostPreview — renders a shared post inside a chat bubble.
 * Fetches post data by post_id. Displays author, content snippet, and optional image.
 * Clicking navigates to the author's profile.
 */
export default function PostPreview({ postId, isMine = false }) {
  const navigate = useNavigate()
  const [post, setPost] = useState(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [likesCount, setLikesCount] = useState(0)

  useEffect(() => {
    if (!postId) {
      setLoading(false)
      setNotFound(true)
      return
    }

    let canceled = false
    const fetchPost = async () => {
      // 1. Check if already cached
      if (postCache[postId]) {
        if (postCache[postId] === "NOT_FOUND") {
          setNotFound(true)
        } else {
          setPost(postCache[postId])
        }
        setLoading(false)
        return
      }

      // 2. Check if a fetch is already in progress for this post
      if (pendingFetches[postId]) {
        try {
          const { data, error } = await pendingFetches[postId]
          if (canceled) return
          if (error || !data) {
            setNotFound(true)
          } else {
            setPost(data)
          }
        } catch {
          if (!canceled) setNotFound(true)
        } finally {
          if (!canceled) setLoading(false)
        }
        return
      }

      // 3. Fetch from Supabase
      try {
        setLoading(true)
        
        const fetchPromise = supabase
          .from("posts")
          .select("id, content, image_url, created_at, user_id, profiles:user_id(name, username, avatar_url)")
          .eq("id", postId)
          .maybeSingle()

        pendingFetches[postId] = fetchPromise
        
        const { data, error } = await fetchPromise

        if (canceled) return

        if (error || !data) {
          postCache[postId] = "NOT_FOUND"
          setNotFound(true)
        } else {
          postCache[postId] = data
          setPost(data)
        }
      } catch {
        if (!canceled) setNotFound(true)
      } finally {
        delete pendingFetches[postId]
        if (!canceled) setLoading(false)
      }
    }

    fetchPost()
    return () => { canceled = true }
  }, [postId])

  // Fetch likes count for the post
  useEffect(() => {
    if (!postId) return

    const fetchLikesCount = async () => {
      try {
        const { count } = await supabase
          .from("likes")
          .select("*", { count: "exact", head: true })
          .eq("post_id", postId)

        setLikesCount(count || 0)
      } catch (err) {
        console.error("[PostPreview] Error fetching likes count:", err)
        setLikesCount(0)
      }
    }

    fetchLikesCount()
  }, [postId])

  const profile = post?.profiles
    ? (Array.isArray(post.profiles) ? post.profiles[0] : post.profiles)
    : null

  const displayName = profile?.name || profile?.username || "Unknown"
  const username = profile?.username || "unknown"
  const avatarUrl = profile?.avatar_url || null
  const initial = displayName.charAt(0).toUpperCase()

  const handleClick = () => {
    if (postId) {
      window.dispatchEvent(new CustomEvent("openGlobalPostModal", { detail: { postId } }))
    }
  }

  const handleProfileClick = (e) => {
    e.stopPropagation()
    if (username !== "unknown") {
      navigate(`/profile/${username}`)
    }
  }

  // Skeleton state
  if (loading) {
    return (
      <div className={`w-fit max-w-[280px] overflow-hidden rounded-2xl border ${
        isMine
          ? "border-[rgba(255,255,255,0.15)] bg-[rgba(255,255,255,0.1)]"
          : "border-[var(--chat-border)] bg-[var(--chat-surface)]"
      }`}>
        <div className={`border-b px-3 py-2.5 ${isMine ? "border-[rgba(255,255,255,0.12)]" : "border-[var(--chat-border)]"}`}>
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 shrink-0 animate-pulse rounded-full bg-[var(--chat-border-strong)]" />
            <div className="h-3 w-24 animate-pulse rounded-full bg-[var(--chat-border-strong)]" />
          </div>
        </div>
        <div className="space-y-1.5 px-3 py-2.5">
          <div className="h-3 w-full animate-pulse rounded-full bg-[var(--chat-border-strong)]" />
          <div className="h-3 w-4/5 animate-pulse rounded-full bg-[var(--chat-border-strong)]" />
        </div>
      </div>
    )
  }

  // Deleted / not found post
  if (notFound || !post) {
    return (
      <div className={`w-fit max-w-[280px] rounded-2xl border px-3 py-2.5 text-[12px] italic ${
        isMine
          ? "border-[rgba(255,255,255,0.12)] text-[rgba(255,255,255,0.5)]"
          : "border-[var(--chat-border)] text-[var(--chat-text-muted)]"
      }`}>
        Post no longer available
      </div>
    )
  }

  return (
    <div
      onClick={handleClick}
      className={`group w-fit max-w-[280px] cursor-pointer overflow-hidden rounded-2xl border transition-all ${
        isMine
          ? "border-[rgba(255,255,255,0.18)] bg-[rgba(255,255,255,0.1)] hover:bg-[rgba(255,255,255,0.15)]"
          : "border-[var(--chat-border)] bg-[var(--chat-surface)] hover:border-[var(--chat-border-strong)] hover:bg-[var(--chat-elev)]"
      }`}
    >
      {/* Header row: avatar + name */}
      <div 
        onClick={handleProfileClick}
        className={`flex items-center gap-2 border-b px-3 py-2 hover:bg-[var(--chat-hover)] transition-colors ${
        isMine ? "border-[rgba(255,255,255,0.12)]" : "border-[var(--chat-border)]"
      }`}>
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={displayName}
            className="h-6 w-6 shrink-0 rounded-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-['Sora'] text-[10px] font-bold ${
            isMine
              ? "bg-[rgba(255,255,255,0.2)] text-white"
              : "bg-[var(--chat-accent-soft)] text-[var(--chat-accent)]"
          }`}>
            {initial}
          </div>
        )}
        <span className={`truncate font-['DM_Sans'] text-[12px] font-semibold ${
          isMine ? "text-[rgba(255,255,255,0.9)]" : "text-[var(--chat-text)]"
        }`}>
          {displayName}
        </span>
        <span className={`ml-auto shrink-0 text-[10px] ${
          isMine ? "text-[rgba(255,255,255,0.5)]" : "text-[var(--chat-text-muted)]"
        }`}>
          @{username}
        </span>
      </div>

      {/* Post content */}
      {post.content && (
        <div className="px-3 py-2">
          <PostContent
            content={post.content}
            className={`line-clamp-4 font-['DM_Sans'] text-[13px] leading-[1.55] ${
              isMine ? "text-[rgba(255,255,255,0.88)]" : "text-[var(--chat-text)]"
            }`}
          />
        </div>
      )}

      {/* Post image thumbnail */}
      {post.image_url && (
        <div className="relative overflow-hidden" style={{ maxHeight: 140 }}>
          <img
            src={post.image_url}
            alt="Post"
            className="h-full w-full object-cover"
            loading="lazy"
            style={{ maxHeight: 140 }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
        </div>
      )}

      {/* Footer: likes + tap hint */}
      <div className={`flex items-center justify-between px-3 py-1.5 ${
        isMine ? "border-t border-[rgba(255,255,255,0.12)]" : "border-t border-[var(--chat-border)]"
      }`}>
        <div className={`flex items-center gap-1 text-[10px] font-medium ${
          isMine ? "text-[rgba(255,255,255,0.5)]" : "text-[var(--chat-text-muted)]"
        }`}>
          {likesCount > 0 && (
            <>
              <span>❤️</span>
              <span>{likesCount}</span>
            </>
          )}
        </div>
        <div className={`text-[10px] font-medium ${
          isMine ? "text-[rgba(255,255,255,0.4)]" : "text-[var(--chat-text-muted)]"
        }`}>
          Tap to view ↗
        </div>
      </div>
    </div>
  )
}
