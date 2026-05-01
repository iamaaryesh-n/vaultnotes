import { useState, useEffect, useRef } from "react"
import CommentItem from "./CommentItem"
import SharePostModal from "./SharePostModal"
import { useToast } from "../hooks/useToast"
import { supabase } from "../lib/supabase"
import {
  addComment,
  fetchComments,
  getShareLink,
  copyToClipboard,
  toggleLike
} from "../lib/postInteractions"

export default function PostInteractions({ 
  post, 
  initialComments = [], 
  initialLikes = { count: 0, userLiked: false },
  onCommentClick,
  showInlineComments = true,
  authReady = true,
  commentCount,
  onCommentAdded,
  onCommentDeleted
}) {
  const { success, error } = useToast()

  const [shareModalOpen, setShareModalOpen] = useState(false)
  const [currentUser, setCurrentUser] = useState(null)

  const [currentUserId, setCurrentUserId] = useState(null)
  const [commentInput, setCommentInput] = useState("")
  const [addingComment, setAddingComment] = useState(false)
  const [likingInProgress, setLikingInProgress] = useState(false)
  const [showComments, setShowComments] = useState(false)
  const [optimisticLikeState, setOptimisticLikeState] = useState({
    count: Math.max(0, initialLikes.count || 0),
    userLiked: !!initialLikes.userLiked
  })

  // Per-post local comments state for inline feed
  const [commentsData, setCommentsData] = useState(null) // null = not yet fetched
  const [commentsLoading, setCommentsLoading] = useState(false)
  const hasFetchedRef = useRef(false)

  // Get current user on mount
  useEffect(() => {
    const getCurrentUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setCurrentUserId(user.id)
        // Also fetch profile for SharePostModal
        const { data: profile } = await supabase
          .from("profiles")
          .select("id, name, username, avatar_url")
          .eq("id", user.id)
          .maybeSingle()
        setCurrentUser(profile || { id: user.id })
      }
    }
    getCurrentUser()
  }, [])

  useEffect(() => {
    setOptimisticLikeState({
      count: Math.max(0, initialLikes.count || 0),
      userLiked: !!initialLikes.userLiked
    })
  }, [initialLikes.count, initialLikes.userLiked, post?.id])

  // (outside-click handling is now inside CommentItem)

  // Fetch full comments once when inline section is first opened
  useEffect(() => {
    if (!showComments || !showInlineComments) return
    if (!post?.id || !authReady) return
    if (hasFetchedRef.current) return

    hasFetchedRef.current = true
    let canceled = false

    const loadComments = async () => {
      console.log("Fetching comments for:", post.id)
      setCommentsLoading(true)
      try {
        const data = await fetchComments(post.id)
        if (!canceled) {
          setCommentsData(data || [])
        }
      } finally {
        if (!canceled) setCommentsLoading(false)
      }
    }

    loadComments()
    return () => { canceled = true }
  }, [showComments, showInlineComments, post?.id, authReady])

  const likesCount = Math.max(0, optimisticLikeState.count || 0)
  const userLiked = !!optimisticLikeState.userLiked
  // Use fetched comments if available, otherwise fall back to initialComments
  // (filtering out null placeholders from the count-only feed data)
  const comments = commentsData !== null
    ? commentsData
    : initialComments.filter(Boolean)

  // Display count: use live data length when fetched, else pre-fetched commentCount,
  // else initialComments length (filters nulls so only real comments count)
  const displayCount = commentsData !== null
    ? commentsData.length
    : (commentCount !== undefined ? commentCount : initialComments.filter(Boolean).length)

  const handleLikeClick = async () => {
    if (likingInProgress || !currentUserId) {
      return
    }

    const previousState = {
      count: likesCount,
      userLiked
    }

    const nextLiked = !userLiked
    const nextCount = nextLiked ? previousState.count + 1 : Math.max(0, previousState.count - 1)

    // Optimistic UI update for immediate feedback
    setOptimisticLikeState({
      count: nextCount,
      userLiked: nextLiked
    })

    // Notify Explore realtime dedupe to ignore matching self event once
    window.dispatchEvent(
      new CustomEvent("explore:optimistic-like", {
        detail: {
          postId: post.id,
          userId: currentUserId,
          action: nextLiked ? "like" : "unlike",
          ts: Date.now()
        }
      })
    )

    setLikingInProgress(true)
    const result = await toggleLike(post.id, post.user_id)

    if (!result.success || result.liked !== nextLiked) {
      // Roll back optimistic state on failure/mismatch
      setOptimisticLikeState(previousState)
      error("Failed to update like")
    }

    setLikingInProgress(false)
  }

  const handleAddComment = async () => {
    if (!commentInput.trim()) {
      error("Comment cannot be empty")
      return
    }

    setAddingComment(true)
    const result = await addComment(post.id, commentInput, post.user_id)

    if (result.success) {
      setCommentInput("")
      success("Comment sent")
      // Prepend new comment to local state so it shows immediately
      setCommentsData((prev) => {
        const base = prev !== null ? prev : initialComments.filter(Boolean)
        return [result.comment, ...base]
      })
      if (onCommentAdded) {
        onCommentAdded(result.comment)
      }
    } else {
      error(result.error || "Failed to add comment")
    }

    setAddingComment(false)
  }

  const handleDeleteComment = (commentId) => {
    // Called by CommentItem after successful server delete
    setCommentsData((prev) => {
      if (prev === null) return prev
      return prev.filter((c) => c?.id !== commentId)
    })
    if (onCommentDeleted) {
      onCommentDeleted(commentId)
    }
  }

  const handleShare = () => {
    // Open the in-app share modal if we have a user; otherwise fall back to clipboard
    if (currentUser) {
      setShareModalOpen(true)
    } else {
      const link = getShareLink(post.profiles?.username)
      copyToClipboard(link).then((result) => {
        if (result.success) {
          success("Link copied to clipboard")
        } else {
          error("Failed to copy link")
        }
      })
    }
  }

  return (
    <div className="">
      {/* Action Buttons Row */}
      <div className="-ml-2 flex items-center justify-start gap-0">
        {/* Like Button */}
        <button
          onClick={(e) => {
            e.stopPropagation()
            handleLikeClick()
          }}
          disabled={likingInProgress}
          className={`flex items-center gap-[5px] rounded-[8px] border-none bg-transparent px-[10px] py-[5px] text-[12px] transition-all duration-200 ${
            userLiked
              ? "text-[#EF4444] hover:bg-[rgba(239,68,68,0.08)] hover:text-[#EF4444]"
              : "text-[var(--profile-text-muted)] hover:bg-[rgba(244,180,0,0.06)] hover:text-[#F4B400]"
          } disabled:opacity-60 disabled:cursor-not-allowed group`}
          title={userLiked ? "Unlike" : "Like"}
        >
          <span className={`text-[16px] transition-transform duration-200 ${
            userLiked ? "scale-125" : "group-hover:scale-110"
          }`}>
            {userLiked ? "❤️" : "🤍"}
          </span>
          <span className={`text-xs font-semibold transition-colors ${
            userLiked ? "text-[#EF4444]" : "text-[var(--profile-text-muted)]"
          }`}>
            {likesCount > 0 && likesCount}
          </span>
        </button>

        {/* Comment Button */}
        <button
          onClick={(e) => {
            e.stopPropagation()
            if (typeof onCommentClick === "function") {
              onCommentClick()
            } else {
              setShowComments(!showComments)
            }
          }}
          className="group flex items-center gap-[5px] rounded-[8px] border-none bg-transparent px-[10px] py-[5px] text-[12px] text-[var(--profile-text-muted)] transition-all duration-200 hover:bg-[rgba(244,180,0,0.06)] hover:text-[#F4B400]"
        >
          <span className="text-[16px] transition-transform duration-200 group-hover:scale-110">💬</span>
          <span className="text-xs font-semibold text-[var(--profile-text-muted)]">
            {displayCount > 0 && displayCount}
          </span>
        </button>

        {/* Share Button */}
        <button
          onClick={(e) => {
            e.stopPropagation()
            handleShare()
          }}
          className="group flex items-center gap-[5px] rounded-[8px] border-none bg-transparent px-[10px] py-[5px] text-[12px] text-[var(--profile-text-muted)] transition-all duration-200 hover:bg-[rgba(244,180,0,0.06)] hover:text-[#F4B400]"
        >
          <span className="text-[16px] transition-transform duration-200 group-hover:scale-110">🔗</span>
          <span className="text-xs font-semibold text-[var(--profile-text-muted)]">Share</span>
        </button>
      </div>

      {/* Comments Section */}
      {showInlineComments && showComments && (
        <div className="mt-5 animate-in border-t border-[var(--profile-border)] pt-5 fade-in duration-200">
          {/* Comment Input */}
          <div className="mb-4 flex gap-2">
            <input
              type="text"
              value={commentInput}
              onChange={(e) => setCommentInput(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === "Enter") {
                  handleAddComment()
                }
              }}
              placeholder="Add a comment..."
              disabled={addingComment}
              className="h-[40px] flex-1 rounded-[10px] border border-[var(--profile-border-strong)] bg-[var(--profile-elev)] px-3 text-sm text-[var(--profile-text)] outline-none placeholder:text-[var(--profile-text-muted)] transition-all focus:border-[#F4B400] focus:shadow-[0_0_0_2px_rgba(244,180,0,0.12)] disabled:opacity-50"
            />
            <button
              onClick={handleAddComment}
              disabled={addingComment || !commentInput.trim()}
              className="rounded-[10px] bg-[#F4B400] px-4 py-2 text-sm font-bold text-[var(--profile-on-accent)] transition-colors hover:bg-[#C49000] disabled:opacity-50"
            >
              {addingComment ? "..." : "Post"}
            </button>
          </div>

          {/* Comments List */}
          {commentsLoading ? (
            <div className="py-4 text-center text-sm text-[var(--profile-text-muted)]">Loading comments...</div>
          ) : comments.length === 0 ? (
            <div className="py-4 text-center text-sm text-[var(--profile-text-muted)]">No comments yet. Be the first!</div>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
              {comments.map((comment) => {
                if (!comment) return null
                return (
                  <CommentItem
                    key={comment.id}
                    comment={comment}
                    currentUserId={currentUserId}
                    postOwnerId={post?.user_id}
                    onDelete={handleDeleteComment}
                    theme="feed"
                  />
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Share post modal */}
      <SharePostModal
        isOpen={shareModalOpen}
        onClose={() => setShareModalOpen(false)}
        post={post}
        currentUser={currentUser}
      />
    </div>
  )
}
