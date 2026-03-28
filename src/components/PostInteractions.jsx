import { useState, useEffect } from "react"
import { useToast } from "../hooks/useToast"
import { supabase } from "../lib/supabase"
import {
  fetchLikesForPosts,
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
  onCommentAdded,
  onLikesChange
}) {
  const { success, error } = useToast()

  const [currentUserId, setCurrentUserId] = useState(null)
  const [likesCount, setLikesCount] = useState(initialLikes.count || 0)
  const [userLiked, setUserLiked] = useState(initialLikes.userLiked || false)
  const [comments, setComments] = useState(initialComments)
  const [commentInput, setCommentInput] = useState("")
  const [addingComment, setAddingComment] = useState(false)
  const [showComments, setShowComments] = useState(false)
  const [deletingCommentId, setDeletingCommentId] = useState(null)

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

  // Update comments when initialComments prop changes
  useEffect(() => {
    setComments(initialComments)
  }, [initialComments])

  // Update likes when initialLikes prop changes
  useEffect(() => {
    setLikesCount(initialLikes.count || 0)
    setUserLiked(initialLikes.userLiked || false)
  }, [initialLikes.count, initialLikes.userLiked])

  const handleLikeClick = async () => {
    // Optimistic UI update
    const newLiked = !userLiked
    setUserLiked(newLiked)
    setLikesCount((prev) => (newLiked ? prev + 1 : prev - 1))

    // Notify parent of change
    if (onLikesChange) {
      onLikesChange({
        count: newLiked ? likesCount + 1 : likesCount - 1,
        userLiked: newLiked
      })
    }

    // Make API call
    const result = await toggleLike(post.id)

    if (!result.success) {
      // Revert optimistic update on error
      setUserLiked(!newLiked)
      setLikesCount((prev) => (newLiked ? prev - 1 : prev + 1))
      error("Failed to update like")
    }
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
      setComments([result.comment, ...comments])
      success("Comment added")
      // Notify parent component with new comment
      if (onCommentAdded) {
        onCommentAdded(result.comment)
      }
    } else {
      error(result.error || "Failed to add comment")
    }

    setAddingComment(false)
  }

  const handleDeleteComment = async (commentId) => {
    setDeletingCommentId(commentId)
    const result = await deleteComment(commentId)

    if (result.success) {
      setComments((prev) => prev.filter((c) => c.id !== commentId))
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
    <div className="mt-4 pt-3 border-t border-slate-200">
      {/* Action Buttons */}
      <div className="flex items-center justify-between px-2 py-2 text-sm text-slate-600">
        {/* Like Button */}
        <button
          onClick={handleLikeClick}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
            userLiked
              ? "text-red-500 hover:bg-red-50"
              : "text-slate-600 hover:bg-slate-100"
          }`}
          title={userLiked ? "Unlike" : "Like"}
        >
          <span className={`text-lg ${userLiked ? "animate-pulse" : ""}`}>
            {userLiked ? "❤️" : "🤍"}
          </span>
          <span className="text-xs font-medium">{likesCount}</span>
        </button>

        {/* Comment Button */}
        <button
          onClick={() => setShowComments(!showComments)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors"
        >
          <span className="text-lg">💬</span>
          <span className="text-xs font-medium">{comments.length}</span>
        </button>

        {/* Share Button */}
        <button
          onClick={handleShare}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors"
        >
          <span className="text-lg">🔗</span>
          <span className="text-xs font-medium">Share</span>
        </button>
      </div>

      {/* Comments Section */}
      {showComments && (
        <div className="mt-4 pt-4 border-t border-slate-100">
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
              className="flex-1 px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent disabled:opacity-50"
            />
            <button
              onClick={handleAddComment}
              disabled={addingComment || !commentInput.trim()}
              className="px-3 py-2 text-xs bg-yellow-500 hover:bg-yellow-400 text-gray-900 rounded-lg font-medium disabled:opacity-50 transition-colors"
            >
              {addingComment ? "..." : "Post"}
            </button>
          </div>

          {/* Comments List */}
          {comments.length === 0 ? (
            <div className="text-xs text-slate-400 text-center py-2">No comments yet</div>
          ) : (
            <div className="space-y-3">
              {comments.map((comment) => (
                <div key={comment.id} className="bg-slate-50 rounded-lg p-3 text-xs">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <button className="font-medium text-slate-900 hover:text-blue-600 text-left truncate">
                        @{comment.profiles?.username || "unknown"}
                      </button>
                      <p className="text-slate-600 mt-1 break-words">{comment.content}</p>
                      <p className="text-slate-400 mt-1">
                        {new Date(comment.created_at).toLocaleString("en-US", {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit"
                        })}
                      </p>
                    </div>
                    {/* Delete button - only show for own comments */}
                    {currentUserId === comment.user_id && (
                      <button
                        onClick={() => handleDeleteComment(comment.id)}
                        disabled={deletingCommentId === comment.id}
                        className="text-xs px-2 py-1 text-red-600 hover:bg-red-50 rounded transition-colors disabled:opacity-50 flex-shrink-0"
                        title="Delete comment"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
