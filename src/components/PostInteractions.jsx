import { useState, useEffect } from "react"
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
  initialLikes = { count: 0, userLiked: false }
}) {
  const { success, error } = useToast()

  const [currentUserId, setCurrentUserId] = useState(null)
  const [commentInput, setCommentInput] = useState("")
  const [addingComment, setAddingComment] = useState(false)
  const [likingInProgress, setLikingInProgress] = useState(false)
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

  const likesCount = Math.max(0, initialLikes.count || 0)
  const userLiked = !!initialLikes.userLiked
  const comments = initialComments

  const handleLikeClick = async () => {
    if (likingInProgress) {
      return
    }

    // Do not mutate local like count manually.
    // Realtime events are the single source of truth for UI like updates.
    setLikingInProgress(true)
    const result = await toggleLike(post.id)

    if (!result.success) {
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
      <div className="flex items-center justify-start gap-2 -ml-2">
        {/* Like Button */}
        <button
          onClick={handleLikeClick}
          disabled={likingInProgress}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all duration-200 ${
            userLiked
              ? "text-red-500 bg-red-50"
              : "text-slate-600 hover:bg-slate-100"
          } disabled:opacity-60 disabled:cursor-not-allowed group`}
          title={userLiked ? "Unlike" : "Like"}
        >
          <span className={`text-base transition-transform duration-200 ${
            userLiked ? "scale-125" : "group-hover:scale-110"
          }`}>
            {userLiked ? "❤️" : "🤍"}
          </span>
          <span className={`text-xs font-semibold transition-colors ${
            userLiked ? "text-red-600" : "text-slate-600"
          }`}>
            {likesCount > 0 && likesCount}
          </span>
        </button>

        {/* Comment Button */}
        <button
          onClick={() => setShowComments(!showComments)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-slate-600 hover:bg-slate-100 transition-all duration-200 group"
        >
          <span className="text-base group-hover:scale-110 transition-transform duration-200">💬</span>
          <span className="text-xs font-semibold text-slate-600">
            {comments.length > 0 && comments.length}
          </span>
        </button>

        {/* Share Button */}
        <button
          onClick={handleShare}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-slate-600 hover:bg-slate-100 transition-all duration-200 group"
        >
          <span className="text-base group-hover:scale-110 transition-transform duration-200">🔗</span>
          <span className="text-xs font-semibold text-slate-600">Share</span>
        </button>
      </div>

      {/* Comments Section */}
      {showComments && (
        <div className="mt-5 pt-5 border-t border-slate-100 animate-in fade-in duration-200">
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
              className="flex-1 px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent focus:bg-white transition-all disabled:opacity-50"
            />
            <button
              onClick={handleAddComment}
              disabled={addingComment || !commentInput.trim()}
              className="px-4 py-2 text-sm bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white rounded-lg font-semibold disabled:opacity-50 transition-all duration-200 shadow-sm hover:shadow-md"
            >
              {addingComment ? "..." : "Post"}
            </button>
          </div>

          {/* Comments List */}
          {comments.length === 0 ? (
            <div className="text-sm text-slate-400 text-center py-4">No comments yet. Be the first!</div>
          ) : (
            <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
              {comments.map((comment) => (
                <div key={comment.id} className="bg-slate-50 hover:bg-slate-100 transition-colors rounded-lg p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <button className="font-semibold text-slate-900 hover:text-blue-600 transition-colors text-left text-sm truncate">
                        @{comment.profiles?.username || "unknown"}
                      </button>
                      <p className="text-slate-700 mt-1 break-words text-sm">{comment.content}</p>
                      <p className="text-slate-400 mt-1.5 text-xs">
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
                        className="text-xs px-2 py-1 text-red-500 hover:bg-red-100 rounded transition-colors disabled:opacity-50 flex-shrink-0 font-semibold"
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
