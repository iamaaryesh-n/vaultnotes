import { useState, useEffect, useCallback, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"
import { supabase } from "../lib/supabase"
import { useAuth } from "../hooks/useAuth"
import { useToast } from "../hooks/useToast"
import { followUser, unfollowUser } from "../lib/followsLib"
import { fetchComments, fetchLikeInfo, addComment } from "../lib/postInteractions"
import PostInteractions from "./PostInteractions"
import PostContent from "./PostContent"
import CommentItem from "./CommentItem"
import { getAvatarImageUrl } from "../utils/imageOptimization"

/**
 * PostModal
 * Can be used controlled (isOpen/onClose props) or via events (window.dispatchEvent).
 * Capable of fetching its own data given a postId.
 */
export default function PostModal({
  isOpen: propIsOpen,
  onClose: propOnClose,
  postId: propPostId,
  initialPostData = null
}) {
  const navigate = useNavigate()
  const { user: contextUser, authReady } = useAuth()
  
  const [modalOpen, setModalOpen] = useState(false)
  const [activePostId, setActivePostId] = useState(null)
  
  const [post, setPost] = useState(initialPostData)
  const [comments, setComments] = useState([])
  const [likes, setLikes] = useState({ count: 0, userLiked: false })
  const [loading, setLoading] = useState(false)
  const [commentsLoading, setCommentsLoading] = useState(false)
  const [showComments, setShowComments] = useState(false)
  const [commentInput, setCommentInput] = useState("")
  const [addingComment, setAddingComment] = useState(false)
  
  const { success, error } = useToast()
  
  const [followedUsers, setFollowedUsers] = useState([])
  const [isMobileViewport, setIsMobileViewport] = useState(() => window.matchMedia("(max-width: 767px)").matches)

  const isControlled = propIsOpen !== undefined

  // Sync props to internal state
  useEffect(() => {
    if (isControlled) {
      setModalOpen(propIsOpen)
      if (propIsOpen && propPostId) {
        setActivePostId(propPostId)
        if (initialPostData) setPost(initialPostData)
      } else if (!propIsOpen) {
        // Reset state on close
        setShowComments(false)
        setComments([])
        setLikes({ count: 0, userLiked: false })
      }
    }
  }, [isControlled, propIsOpen, propPostId, initialPostData])

  // Global event listener
  useEffect(() => {
    if (isControlled) return
    const handleOpenModal = (event) => {
      const pId = event.detail?.postId
      const postData = event.detail?.post
      
      if (pId || postData?.id) {
        setActivePostId(pId || postData.id)
        if (postData) setPost(postData)
        setModalOpen(true)
        window.history.pushState({ globalPostModal: true }, "")
      }
    }
    
    window.addEventListener("openGlobalPostModal", handleOpenModal)
    return () => window.removeEventListener("openGlobalPostModal", handleOpenModal)
  }, [isControlled])

  // Mobile viewport tracking
  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 767px)")
    const handleMediaQueryChange = (e) => setIsMobileViewport(e.matches)
    
    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", handleMediaQueryChange)
      return () => mediaQuery.removeEventListener("change", handleMediaQueryChange)
    }
    mediaQuery.addListener(handleMediaQueryChange)
    return () => mediaQuery.removeListener(handleMediaQueryChange)
  }, [])

  // Followed users tracking
  useEffect(() => {
    if (!contextUser?.id || !modalOpen) return
    let canceled = false

    const fetchFollows = async () => {
      const { data } = await supabase
        .from("follows")
        .select("following_id")
        .eq("follower_id", contextUser.id)
        
      if (!canceled && data) {
        setFollowedUsers(data.map(d => d.following_id))
      }
    }
    fetchFollows()
    return () => { canceled = true }
  }, [contextUser?.id, modalOpen])

  // Fetch full data if we have an activePostId
  useEffect(() => {
    if (!modalOpen || !activePostId || !authReady) return
    
    let canceled = false
    
    const loadData = async () => {
      setLoading(true)
      
      try {
        // 1. Fetch Post (if missing or mismatch)
        if (!post || post.id !== activePostId) {
          const { data: postData } = await supabase
            .from("posts")
            .select("id, user_id, content, image_url, created_at, visibility, profiles(id, username, name, avatar_url)")
            .eq("id", activePostId)
            .maybeSingle()
            
          if (!canceled && postData) {
            setPost(postData)
          }
        }
        
        // 2. Fetch Likes
        const likeInfo = await fetchLikeInfo(activePostId)
        if (!canceled && likeInfo) {
          setLikes(likeInfo)
        }
        
        // 3. Fetch Comments
        setCommentsLoading(true)
        const commentsData = await fetchComments(activePostId)
        if (!canceled && commentsData) {
          setComments(commentsData || [])
        }
      } catch (err) {
        console.error("Error loading post modal data:", err)
      } finally {
        if (!canceled) {
          setLoading(false)
          setCommentsLoading(false)
        }
      }
    }
    
    loadData()
    return () => { canceled = true }
  }, [modalOpen, activePostId, authReady])

  // Handle back button and body scroll locking
  useEffect(() => {
    if (!modalOpen) return
    
    document.body.style.overflow = "hidden"
    
    const handlePopState = () => {
      handleClose()
    }
    
    window.addEventListener("popstate", handlePopState)
    return () => {
      document.body.style.overflow = "unset"
      window.removeEventListener("popstate", handlePopState)
    }
  }, [modalOpen])

  const handleClose = () => {
    if (isControlled && propOnClose) {
      propOnClose()
    } else {
      setModalOpen(false)
      setActivePostId(null)
      setShowComments(false)
      if (window.history.state?.globalPostModal) {
        window.history.back()
      }
    }
  }

  const handleToggleFollow = useCallback(async (userId) => {
    if (!contextUser?.id) return
    if (followedUsers.includes(userId)) {
      const result = await unfollowUser(contextUser.id, userId)
      if (result.success) setFollowedUsers(prev => prev.filter(id => id !== userId))
    } else {
      const result = await followUser(contextUser.id, userId)
      if (result.success) setFollowedUsers(prev => [...prev, userId])
    }
  }, [contextUser?.id, followedUsers])

  const formatPostTime = (value) => {
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

  // Handle profile click from modal
  const handleProfileClick = (username) => {
    if (username) {
      handleClose()
      navigate(`/profile/${username}`)
    }
  }

  // Format profile object
  const profile = post?.profiles 
    ? (Array.isArray(post.profiles) ? post.profiles[0] : post.profiles)
    : null

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
      setComments((prev) => [result.comment, ...prev])
    } else {
      error(result.error || "Failed to add comment")
    }

    setAddingComment(false)
  }

  const displayName = profile?.name || profile?.username || "Unknown"
  const username = profile?.username
  const avatarUrl = profile?.avatar_url
  const initial = displayName.charAt(0).toUpperCase()

  const shouldRenderComments = comments.length > 0 || showComments

  return (
    <AnimatePresence>
      {modalOpen && post && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="fixed inset-0 z-[120] bg-[var(--overlay-backdrop)] backdrop-blur-sm"
          />

          <motion.div
            initial={isMobileViewport ? { opacity: 0, y: 48 } : { opacity: 0, scale: 0.95, y: 20 }}
            animate={isMobileViewport ? { opacity: 1, y: 0 } : { opacity: 1, scale: 1, y: 0 }}
            exit={isMobileViewport ? { opacity: 0, y: 48 } : { opacity: 0, scale: 0.95, y: 20 }}
            transition={isMobileViewport ? { duration: 0.24, ease: "easeOut" } : { type: "spring", stiffness: 300, damping: 30 }}
            onClick={(event) => event.stopPropagation()}
            className="fixed inset-0 z-[130] flex h-[100dvh] w-[100vw] flex-col overflow-hidden border border-[var(--overlay-border)] bg-[var(--overlay-surface)] shadow-[var(--overlay-shadow)] md:m-auto md:h-auto md:max-h-[90vh] md:w-[90vw] md:max-w-3xl md:rounded-[20px]"
          >
            {/* Header */}
            <div className="flex-shrink-0 border-b border-[var(--overlay-border)] px-6 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <button onClick={() => handleProfileClick(username)}>
                    {avatarUrl ? (
                      <img
                        src={getAvatarImageUrl(avatarUrl)}
                        alt={displayName}
                        className="h-10 w-10 rounded-full border border-[var(--overlay-border-strong)] object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--chat-accent-soft)] text-xs font-bold text-[var(--chat-accent)]">
                        {initial}
                      </div>
                    )}
                  </button>
                  <div>
                    <button
                      onClick={() => handleProfileClick(username)}
                      className="text-sm font-semibold text-[var(--overlay-text)] transition-colors hover:text-[#F4B400]"
                    >
                      {displayName}
                    </button>
                    <p className="text-xs text-[var(--overlay-text-muted)]">{formatPostTime(post.created_at)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {contextUser?.id && post.user_id !== contextUser.id && (
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => handleToggleFollow(post.user_id)}
                      className={`rounded-[16px] border px-3 py-[5px] text-xs font-semibold transition-all duration-200 ${
                        followedUsers.includes(post.user_id)
                          ? "border-[var(--overlay-border-strong)] bg-[var(--overlay-elev)] text-[var(--overlay-text)]"
                          : "border-transparent bg-[#F4B400] text-[var(--profile-on-accent)]"
                      }`}
                    >
                      {followedUsers.includes(post.user_id) ? "Following" : "Follow"}
                    </motion.button>
                  )}
                  <button
                    onClick={handleClose}
                    className="rounded-full p-2 text-[var(--overlay-text-subtle)] transition-colors hover:bg-[var(--overlay-elev)] hover:text-[var(--overlay-text)]"
                  >
                    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>

            {/* Scrollable content area */}
            <div className="flex-1 overflow-y-auto" style={{ overscrollBehavior: "contain" }}>
              {post.image_url && (
                <img
                  src={post.image_url}
                  alt="Post"
                  className="max-h-[60vh] w-full object-contain bg-[var(--overlay-elev)]"
                  loading="lazy"
                />
              )}

              <div className={`${post.image_url ? "p-5" : "p-8"} text-base leading-7 text-[var(--overlay-text)]`}>
                {post.content ? (
                  <PostContent content={post.content} className="text-base leading-7 text-[var(--overlay-text)]" />
                ) : (
                  "No content available"
                )}
              </div>

              <div className="border-t border-[var(--overlay-border)] px-6 py-4">
                <PostInteractions
                  post={post}
                  initialComments={comments}
                  initialLikes={likes}
                  onCommentClick={() => setShowComments((prev) => !prev)}
                  showInlineComments={false}
                  authReady={authReady}
                />
              </div>

              {shouldRenderComments && (
                <div className="border-t border-[var(--overlay-border)] px-6 py-4">
                  <div className="mb-4 flex items-center gap-2">
                    <p className="text-sm font-semibold text-[var(--overlay-text)]">
                      Comments ({comments.length})
                    </p>
                  </div>

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
                      className="h-[40px] flex-1 rounded-[10px] border border-[var(--overlay-border-strong)] bg-[var(--overlay-elev)] px-3 text-sm text-[var(--overlay-text)] outline-none placeholder:text-[var(--overlay-text-muted)] transition-all focus:border-[#F4B400] focus:shadow-[0_0_0_2px_rgba(244,180,0,0.12)] disabled:opacity-50"
                    />
                    <button
                      onClick={handleAddComment}
                      disabled={addingComment || !commentInput.trim()}
                      className="rounded-[10px] bg-[#F4B400] px-4 py-2 text-sm font-bold text-[var(--profile-on-accent)] transition-colors hover:bg-[#C49000] disabled:opacity-50"
                    >
                      {addingComment ? "..." : "Post"}
                    </button>
                  </div>

                  {commentsLoading && (
                    <p className="mb-3 text-xs text-[var(--overlay-text-subtle)]">Loading comments...</p>
                  )}

                  <div className="space-y-2">
                    {comments.filter(Boolean).length === 0 && !commentsLoading ? (
                      <p className="py-4 text-center text-xs text-[var(--overlay-text-muted)]">No comments yet. Be the first!</p>
                    ) : (
                      comments.map((comment, index) =>
                        comment ? (
                          <CommentItem
                            key={comment.id}
                            comment={comment}
                            currentUserId={contextUser?.id || null}
                            postOwnerId={post.user_id}
                            onDelete={(commentId) => {
                              setComments(prev => prev.filter(c => c?.id !== commentId))
                            }}
                            onNavigate={handleProfileClick}
                            theme="overlay"
                          />
                        ) : (
                          <div key={`placeholder-${index}`} className="py-2 text-xs text-[var(--overlay-text-muted)]">
                            Loading comment...
                          </div>
                        )
                      )
                    )}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
