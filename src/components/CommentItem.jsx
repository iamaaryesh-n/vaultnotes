import { useState, useEffect } from "react"
import { MoreVertical, Trash2 } from "lucide-react"
import { deleteComment } from "../lib/postInteractions"
import { useToast } from "../hooks/useToast"

/**
 * Shared comment item used in both the inline feed and the post modal.
 *
 * Props:
 *   comment        – comment object { id, user_id, content, created_at, profiles }
 *   currentUserId  – id of the logged-in user (null if unauthenticated)
 *   postOwnerId    – user_id of the post this comment belongs to
 *   onDelete       – called with (commentId) after a successful server delete
 *   onNavigate     – optional fn(username) for navigating to a profile
 *                    (modal passes closeModal + navigate; feed can omit it)
 *   theme          – "feed" | "overlay"  (controls colour tokens)
 */
export default function CommentItem({
  comment,
  currentUserId,
  postOwnerId,
  onDelete,
  onNavigate,
  theme = "feed"
}) {
  const { success, error } = useToast()
  const [menuOpen, setMenuOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Permission: comment author OR post owner may delete
  const canDelete =
    currentUserId &&
    (currentUserId === comment.user_id || currentUserId === postOwnerId)

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return
    const close = (e) => {
      if (!e.target?.closest?.("[data-ci-menu]")) setMenuOpen(false)
    }
    document.addEventListener("mousedown", close)
    return () => document.removeEventListener("mousedown", close)
  }, [menuOpen])

  const handleDelete = async () => {
    setMenuOpen(false)
    const confirmed = window.confirm("Delete this comment? This cannot be undone.")
    if (!confirmed) return

    setDeleting(true)
    const result = await deleteComment(comment.id)
    if (result.success) {
      success("Comment deleted")
      onDelete?.(comment.id)
    } else {
      error(result.error || "Failed to delete comment")
    }
    setDeleting(false)
  }

  const handleNavigate = (e) => {
    e.stopPropagation()
    if (comment.profiles?.username && onNavigate) {
      onNavigate(comment.profiles.username)
    }
  }

  // Token sets per theme
  const t =
    theme === "overlay"
      ? {
          card: "rounded-[10px] bg-[var(--overlay-elev)] p-3 transition-colors hover:bg-[var(--overlay-hover)]",
          username: "text-xs font-semibold text-[var(--overlay-text)] hover:text-[#F4B400]",
          content: "mt-1 break-words text-xs leading-relaxed text-[var(--overlay-text-subtle)]",
          time: "mt-1 text-[10px] text-[var(--overlay-text-muted)]",
          menuBtn: "text-[var(--overlay-text-muted)] hover:text-[var(--overlay-text)]",
          dropdown: "border border-[var(--overlay-border)] bg-[var(--overlay-surface)]",
        }
      : {
          card: "rounded-[10px] border border-[var(--profile-border)] bg-[var(--profile-elev)] p-3 transition-colors hover:bg-[var(--profile-hover)]",
          username: "text-sm font-semibold text-[#F4B400] hover:text-[#C49000]",
          content: "mt-1 break-words text-sm text-[var(--profile-text)]",
          time: "mt-1.5 text-xs text-[var(--profile-text-muted)]",
          menuBtn: "text-[var(--profile-text-muted)] hover:text-[var(--profile-text)]",
          dropdown: "border border-[var(--profile-border)] bg-[var(--profile-elev)]",
        }

  const formatTime = (ts) => {
    if (!ts) return ""
    return new Date(ts).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  return (
    <div className={`${t.card} group/ci`}>
      <div className="flex items-start gap-2">
        {/* Avatar */}
        <button onClick={handleNavigate} className="flex-shrink-0">
          {comment.profiles?.avatar_url ? (
            <img
              src={comment.profiles.avatar_url}
              alt={comment.profiles?.username}
              className="h-7 w-7 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--chat-accent-soft)] text-[11px] font-bold text-[var(--chat-accent)]">
              {comment.profiles?.username?.charAt(0)?.toUpperCase() || "?"}
            </div>
          )}
        </button>

        {/* Body */}
        <div className="min-w-0 flex-1">
          <button onClick={handleNavigate} className={`text-left ${t.username}`}>
            @{comment.profiles?.username || "unknown"}
          </button>
          <p className={t.content}>{comment.content}</p>
          <p className={t.time}>{formatTime(comment.created_at)}</p>
        </div>

        {/* 3-dot menu — only for authorised users */}
        {canDelete && (
          <div className="relative flex-shrink-0" data-ci-menu>
            {/*
              Desktop: hidden by default, shown on card-hover (group-hover/ci).
              Mobile:  always visible (no hover support).
              We use a CSS trick: opacity-0 on md+ but opacity-100 on focus/active,
              plus group-hover makes it visible on hover.
            */}
            <button
              type="button"
              data-ci-menu
              onClick={(e) => {
                e.stopPropagation()
                setMenuOpen((v) => !v)
              }}
              disabled={deleting}
              className={`
                flex h-6 w-6 items-center justify-center rounded-md
                transition-all duration-150
                ${t.menuBtn}
                opacity-100 md:opacity-0 md:group-hover/ci:opacity-100
                hover:bg-[rgba(255,255,255,0.06)]
                focus:opacity-100
                disabled:opacity-30
              `}
              aria-label="Comment options"
            >
              <MoreVertical className="h-3.5 w-3.5" />
            </button>

            {menuOpen && (
              <div
                data-ci-menu
                className={`absolute right-0 top-7 z-30 min-w-[120px] rounded-[10px] ${t.dropdown} p-1 shadow-xl`}
              >
                <button
                  type="button"
                  data-ci-menu
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex w-full items-center gap-2 rounded-[8px] px-3 py-[7px] text-left text-[12px] font-semibold text-[#EF4444] transition-colors hover:bg-[rgba(239,68,68,0.08)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Trash2 className="h-3 w-3" />
                  {deleting ? "Deleting…" : "Delete"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
