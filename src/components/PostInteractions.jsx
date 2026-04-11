import { useState, useEffect } from "react"
import { MoreHorizontal, Trash2 } from "lucide-react"
import { useToast } from "../hooks/useToast"
import { supabase } from "../lib/supabase"
import {
  addComment,
  deleteComment,
  getShareLink,
  copyToClipboard,
  toggleLike
} from "../lib/postInteractions"

export default function PostInteractions({ 
  post, 
  initialComments = [], 
  initialLikes = { count: 0, userLiked: false },
  onCommentClick,
  showInlineComments = true
}) {
  const { success, error } = useToast()

  const [currentUserId, setCurrentUserId] = useState(null)
  const [commentInput, setCommentInput] = useState("")
  const [addingComment, setAddingComment] = useState(false)
  const [likingInProgress, setLikingInProgress] = useState(false)
  const [showComments, setShowComments] = useState(false)
  const [deletingCommentId, setDeletingCommentId] = useState(null)
  const [activeCommentMenuId, setActiveCommentMenuId] = useState(null)
  const [optimisticLikeState, setOptimisticLikeState] = useState({
    count: Math.max(0, initialLikes.count || 0),
    userLiked: !!initialLikes.userLiked
  })

  // Get current user ID on mount
  useEffect(() => {
    const getCurrentUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setCurrentUserId(user.id)
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

  useEffect(() => {
    const handleCommentMenuOutside = (event) => {
      const menuNode = event.target?.closest?.("[data-comment-menu='true']")
      const triggerNode = event.target?.closest?.("[data-comment-menu-trigger='true']")

      if (menuNode || triggerNode) {
        return
      }

      setActiveCommentMenuId(null)
    }

    if (activeCommentMenuId) {
      document.addEventListener("mousedown", handleCommentMenuOutside)
      return () => document.removeEventListener("mousedown", handleCommentMenuOutside)
    }
  }, [activeCommentMenuId])

  const likesCount = Math.max(0, optimisticLikeState.count || 0)
  const userLiked = !!optimisticLikeState.userLiked
  const comments = initialComments

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
    const result = await toggleLike(post.id)

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
    const result = await addComment(post.id, commentInput)

    if (result.success) {
      setCommentInput("")
      success("Comment sent")
    } else {
      error(result.error || "Failed to add comment")
    }

    setAddingComment(false)
  }

  const handleDeleteComment = async (commentId) => {
    setDeletingCommentId(commentId)
    setActiveCommentMenuId(null)
    const result = await deleteComment(commentId)

    if (result.success) {
      success("Comment deleted")
    } else {
      error(result.error || "Failed to delete comment")
    }

    setDeletingCommentId(null)
  }

  const handleShare = async () => {
    const link = getShareLink(post.profiles?.username)
    const result = await copyToClipboard(link)

    if (result.success) {
      success("Link copied to clipboard")
    } else {
      error("Failed to copy link")
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
              : "text-[#5C5248] hover:bg-[rgba(244,180,0,0.06)] hover:text-[#F4B400]"
          } disabled:opacity-60 disabled:cursor-not-allowed group`}
          title={userLiked ? "Unlike" : "Like"}
        >
          <span className={`text-[16px] transition-transform duration-200 ${
            userLiked ? "scale-125" : "group-hover:scale-110"
          }`}>
            {userLiked ? "❤️" : "🤍"}
          </span>
          <span className={`text-xs font-semibold transition-colors ${
            userLiked ? "text-[#EF4444]" : "text-[#5C5248]"
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
          className="group flex items-center gap-[5px] rounded-[8px] border-none bg-transparent px-[10px] py-[5px] text-[12px] text-[#5C5248] transition-all duration-200 hover:bg-[rgba(244,180,0,0.06)] hover:text-[#F4B400]"
        >
          <span className="text-[16px] transition-transform duration-200 group-hover:scale-110">💬</span>
          <span className="text-xs font-semibold text-[#5C5248]">
            {comments.length > 0 && comments.length}
          </span>
        </button>

        {/* Share Button */}
        <button
          onClick={(e) => {
            e.stopPropagation()
            handleShare()
          }}
          className="group flex items-center gap-[5px] rounded-[8px] border-none bg-transparent px-[10px] py-[5px] text-[12px] text-[#5C5248] transition-all duration-200 hover:bg-[rgba(244,180,0,0.06)] hover:text-[#F4B400]"
        >
          <span className="text-[16px] transition-transform duration-200 group-hover:scale-110">🔗</span>
          <span className="text-xs font-semibold text-[#5C5248]">Share</span>
        </button>
      </div>

      {/* Comments Section */}
      {showInlineComments && showComments && (
        <div className="mt-5 animate-in border-t border-[#1F1F1F] pt-5 fade-in duration-200">
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
              className="h-[40px] flex-1 rounded-[10px] border border-[#2A2A2A] bg-[#141414] px-3 text-sm text-[#F5F0E8] outline-none placeholder:text-[#5C5248] transition-all focus:border-[#F4B400] focus:shadow-[0_0_0_2px_rgba(244,180,0,0.12)] disabled:opacity-50"
            />
            <button
              onClick={handleAddComment}
              disabled={addingComment || !commentInput.trim()}
              className="rounded-[10px] bg-[#F4B400] px-4 py-2 text-sm font-bold text-[#0D0D0D] transition-colors hover:bg-[#C49000] disabled:opacity-50"
            >
              {addingComment ? "..." : "Post"}
            </button>
          </div>

          {/* Comments List */}
          {comments.length === 0 ? (
            <div className="py-4 text-center text-sm text-[#5C5248]">No comments yet. Be the first!</div>
          ) : (
            <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
              {comments.map((comment, index) => {
                if (!comment) {
                  return (
                    <div key={`comment-placeholder-${index}`} className="py-2 text-xs text-[#5C5248]">
                      Loading comment...
                    </div>
                  )
                }

                return (
                  <div key={comment.id} className="rounded-[10px] border border-[#1F1F1F] bg-[#141414] p-3 transition-colors hover:bg-[#1C1C1C]">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <button className="truncate text-left text-sm font-semibold text-[#F4B400] transition-colors hover:text-[#C49000]">
                          @{comment.profiles?.username || "unknown"}
                        </button>
                        <p className="mt-1 break-words text-sm text-[#F5F0E8]">{comment.content}</p>
                        <p className="mt-1.5 text-xs text-[#5C5248]">
                          {new Date(comment.created_at).toLocaleString("en-US", {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit"
                          })}
                        </p>
                      </div>
                      {/* Comment menu - only show for own comments */}
                      {currentUserId === comment.user_id && (
                        <div className="relative flex-shrink-0">
                          <button
                            type="button"
                            data-comment-menu-trigger="true"
                            onClick={(event) => {
                              event.stopPropagation()
                              setActiveCommentMenuId((prev) => (prev === comment.id ? null : comment.id))
                            }}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-[#2A2A2A] bg-[#141414] text-[#A09080] transition-colors hover:border-[#F4B400] hover:text-[#F5F0E8]"
                            aria-label="Open comment options"
                            title="More options"
                          >
                            <MoreHorizontal className="h-3.5 w-3.5" />
                          </button>

                          {activeCommentMenuId === comment.id && (
                            <div
                              data-comment-menu="true"
                              className="absolute right-0 top-8 z-20 min-w-[140px] rounded-[10px] border border-[#1F1F1F] bg-[#111111] p-1.5 shadow-2xl"
                            >
                              <button
                                type="button"
                                onClick={() => handleDeleteComment(comment.id)}
                                disabled={deletingCommentId === comment.id}
                                className="flex w-full items-center gap-2 rounded-[8px] px-2.5 py-2 text-left text-[12px] font-semibold text-[#EF4444] transition-colors hover:bg-[rgba(239,68,68,0.08)] disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                {deletingCommentId === comment.id ? "Deleting..." : "Delete"}
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
