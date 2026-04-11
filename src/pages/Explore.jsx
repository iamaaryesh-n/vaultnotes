import { useCallback, useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"
import { supabase } from "../lib/supabase"
import { useAuth } from "../hooks/useAuth"
import { usePrefetchWorkspaces } from "../hooks/usePrefetchWorkspaces"
import { followUser, unfollowUser } from "../lib/followsLib"
import { fetchComments } from "../lib/postInteractions"
import PostInteractions from "../components/PostInteractions"
import PostFeed from "../components/PostFeed"
import PublicWorkspaceShelf from "../components/PublicWorkspaceShelf"
import { getAvatarImageUrl } from "../utils/imageOptimization"
import { useExploreFeed } from "../hooks/useExploreFeed"
import { useExploreRealtime } from "../hooks/useExploreRealtime"

export default function Explore() {
  const navigate = useNavigate()
  const { user: contextUser } = useAuth()

  const [activeTab, setActiveTab] = useState("for-you")
  const [viewMode, setViewMode] = useState("posts")
  const [selectedPost, setSelectedPost] = useState(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [showModalComments, setShowModalComments] = useState(false)
  const [modalCommentsLoading, setModalCommentsLoading] = useState(false)
  const [followedUsers, setFollowedUsers] = useState([])

  const {
    posts,
    commentsByPost,
    likesByPost,
    loading,
    loadingMore,
    hasMore,
    error,
    page,
    currentUserId,
    queueNextPageLoad,
    setCommentsByPost,
    setLikesByPost
  } = useExploreFeed()

  useExploreRealtime({ posts, currentUserId, setLikesByPost, setCommentsByPost })

  usePrefetchWorkspaces()

  useEffect(() => {
    if (!contextUser?.id) return

    const fetchFollowedUsers = async () => {
      const { data, error: fetchError } = await supabase
        .from("follows")
        .select("following_id")
        .eq("follower_id", contextUser.id)

      if (fetchError) {
        return
      }

      setFollowedUsers(data?.map((item) => item.following_id) || [])
    }

    fetchFollowedUsers()
  }, [contextUser?.id])

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

  const openPostModal = (post) => {
    setSelectedPost(post)
    setModalOpen(true)
    setShowModalComments(false)
    document.body.style.overflow = "hidden"
  }

  const closePostModal = () => {
    setModalOpen(false)
    setSelectedPost(null)
    setShowModalComments(false)
    setModalCommentsLoading(false)
    document.body.style.overflow = "unset"
  }

  useEffect(() => {
    if (!modalOpen || !selectedPost?.id) return

    const existingComments = commentsByPost[selectedPost.id] || []
    const hasPlaceholders = existingComments.some((comment) => !comment)
    const shouldFetchFullComments = existingComments.length === 0 || hasPlaceholders

    if (!shouldFetchFullComments) {
      return
    }

    let canceled = false

    const loadFullComments = async () => {
      setModalCommentsLoading(true)
      try {
        const fullComments = await fetchComments(selectedPost.id)
        if (canceled) return

        setCommentsByPost((prev) => ({
          ...prev,
          [selectedPost.id]: fullComments || []
        }))
      } finally {
        if (!canceled) {
          setModalCommentsLoading(false)
        }
      }
    }

    loadFullComments()

    return () => {
      canceled = true
    }
  }, [modalOpen, selectedPost?.id, showModalComments, commentsByPost, setCommentsByPost])

  const handleToggleFollow = useCallback(
    async (userId) => {
      if (!contextUser?.id) return

      if (followedUsers.includes(userId)) {
        const result = await unfollowUser(contextUser.id, userId)
        if (result.success) {
          setFollowedUsers((prev) => prev.filter((id) => id !== userId))
        }
      } else {
        const result = await followUser(contextUser.id, userId)
        if (result.success) {
          setFollowedUsers((prev) => [...prev, userId])
        }
      }
    },
    [contextUser?.id, followedUsers]
  )

  return (
    <div className="-mt-[64px] min-h-screen bg-[#000000]">
      <div
        className="sticky z-[90] border-b border-[#1F1F1F] bg-[#000000] px-4 pb-0 pt-3"
        style={{ top: "56px" }}
      >
        <div className="mb-[10px] flex items-baseline gap-[10px]">
          <h1 className="font-['Sora'] text-[20px] font-bold text-[#F5F0E8]">Explore</h1>
          <p className="text-[11px] text-[#5C5248]">Discover what's happening</p>
        </div>

        <div className="mb-3 flex gap-2">
          {[
            { key: "posts", label: "Posts" },
            { key: "workspaces", label: "Vaults" }
          ].map((mode) => (
            <button
              key={mode.key}
              onClick={() => setViewMode(mode.key)}
              className={`flex cursor-pointer items-center gap-[6px] rounded-[10px] border-none px-[18px] py-[7px] font-['DM_Sans'] text-[13px] font-bold transition-all ${
                viewMode === mode.key
                  ? "bg-[#F4B400] text-[#0D0D0D] shadow-[0_2px_14px_rgba(244,180,0,0.3)]"
                  : "border border-[#1F1F1F] bg-[#141414] text-[#A09080] hover:border-[#2A2A2A] hover:text-[#F5F0E8]"
              }`}
            >
              {mode.key === "posts" ? (
                <svg className="h-[13px] w-[13px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              ) : (
                <svg className="h-[13px] w-[13px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <rect x="3" y="3" width="7" height="7" />
                  <rect x="14" y="3" width="7" height="7" />
                  <rect x="14" y="14" width="7" height="7" />
                  <rect x="3" y="14" width="7" height="7" />
                </svg>
              )}
              {mode.label}
            </button>
          ))}
        </div>

        {viewMode === "posts" && (
          <div className="scrollbar-hide mb-3 flex gap-[2px] overflow-x-auto rounded-[12px] border border-[#1F1F1F] bg-[#0D0D0D] p-[3px]">
            {[
              { key: "for-you", label: "For you" },
              { key: "following", label: "Following" },
              { key: "trending", label: "Trending" },
              { key: "recent", label: "Recent" }
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex-1 whitespace-nowrap rounded-[9px] border-none px-3 py-[7px] text-center font-['DM_Sans'] text-[13px] font-semibold transition-all ${
                  activeTab === tab.key
                    ? "bg-[#1C1C1C] text-[#F5F0E8]"
                    : "bg-transparent text-[#5C5248] hover:text-[#A09080]"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {viewMode === "posts" ? (
        <div className="explore-feed flex flex-col gap-3 px-4 py-4">
          <PostFeed
            activeTab={activeTab}
            contextUser={contextUser}
            followedUsers={followedUsers}
            posts={posts}
            commentsByPost={commentsByPost}
            likesByPost={likesByPost}
            loading={loading}
            loadingMore={loadingMore}
            hasMore={hasMore}
            error={error}
            page={page}
            queueNextPageLoad={queueNextPageLoad}
            onToggleFollow={handleToggleFollow}
            onOpenPost={openPostModal}
          />
        </div>
      ) : (
        <PublicWorkspaceShelf contextUserId={contextUser?.id} />
      )}

      <AnimatePresence>
        {modalOpen && selectedPost && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closePostModal}
              className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm"
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              onClick={(event) => event.stopPropagation()}
              className="fixed inset-0 z-50 m-auto max-h-[90vh] w-[90vw] max-w-3xl overflow-y-auto rounded-[20px] border border-[#1F1F1F] bg-[#0D0D0D] shadow-[0_20px_60px_rgba(0,0,0,0.6)]"
            >
              <div className="flex w-full flex-col">
                <div className="flex-shrink-0 border-b border-[#1F1F1F] px-6 py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={(event) => {
                          event.stopPropagation()
                          if (selectedPost?.profiles?.username) {
                            closePostModal()
                            navigate(`/profile/${selectedPost?.profiles?.username}`)
                          }
                        }}
                      >
                        {selectedPost?.profiles?.avatar_url ? (
                          <img
                            src={getAvatarImageUrl(selectedPost?.profiles?.avatar_url)}
                            alt={selectedPost?.profiles?.username}
                            width={40}
                            height={40}
                            className="h-10 w-10 rounded-full border border-[#2A2A2A] object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#2A2000] text-xs font-bold text-[#F4B400]">
                            {selectedPost?.profiles?.name?.charAt(0) || selectedPost?.profiles?.username?.charAt(0) || "?"}
                          </div>
                        )}
                      </button>
                      <div>
                        <button
                          onClick={(event) => {
                            event.stopPropagation()
                            if (selectedPost?.profiles?.username) {
                              closePostModal()
                              navigate(`/profile/${selectedPost?.profiles?.username}`)
                            }
                          }}
                          className="text-sm font-semibold text-[#F5F0E8] transition-colors hover:text-[#F4B400]"
                        >
                          {selectedPost?.profiles?.name || selectedPost?.profiles?.username || "Unknown"}
                        </button>
                        <p className="text-xs text-[#5C5248]">{formatPostTime(selectedPost?.created_at)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {contextUser?.id && selectedPost?.user_id !== contextUser.id && (
                        <motion.button
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={(event) => {
                            event.stopPropagation()
                            handleToggleFollow(selectedPost.user_id)
                          }}
                          className={`rounded-[16px] border px-3 py-[5px] text-xs font-semibold transition-all duration-200 ${
                            followedUsers.includes(selectedPost.user_id)
                              ? "border-[#2A2A2A] bg-[#141414] text-[#F5F0E8]"
                              : "border-transparent bg-[#F4B400] text-[#0D0D0D]"
                          }`}
                        >
                          {followedUsers.includes(selectedPost.user_id) ? "Following" : "Follow"}
                        </motion.button>
                      )}
                      <button
                        onClick={closePostModal}
                        className="rounded-full p-2 text-[#A09080] transition-colors hover:bg-[#141414] hover:text-[#F5F0E8]"
                      >
                        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>

                {selectedPost?.image_url && (
                  <img
                    src={selectedPost.image_url}
                    alt="Post"
                    className="max-h-[60vh] w-full object-contain bg-[#141414]"
                    loading="lazy"
                  />
                )}

                <div className={`${selectedPost?.image_url ? "p-5" : "p-8"} text-base leading-7 text-[#F5F0E8]`}>
                  {selectedPost?.content || "No content available"}
                </div>

                <div className="border-t border-[#1F1F1F] px-6 py-4">
                  <PostInteractions
                    post={selectedPost}
                    initialComments={commentsByPost[selectedPost?.id] || []}
                    initialLikes={likesByPost[selectedPost?.id] || { count: 0, userLiked: false }}
                    onCommentClick={() => setShowModalComments((prev) => !prev)}
                    showInlineComments={false}
                  />
                </div>

                {((commentsByPost[selectedPost?.id] || []).length > 0 || showModalComments) && (
                  <div className="border-t border-[#1F1F1F] px-6 py-4">
                    <div className="mb-4 flex items-center gap-2">
                      <p className="text-sm font-semibold text-[#F5F0E8]">
                        Comments ({(commentsByPost[selectedPost?.id] || []).length})
                      </p>
                    </div>

                    {modalCommentsLoading && (
                      <p className="mb-3 text-xs text-[#A09080]">Loading comments...</p>
                    )}

                    <div className="space-y-3">
                      {(commentsByPost[selectedPost?.id] || []).length === 0 ? (
                        <p className="py-4 text-center text-xs text-[#5C5248]">No comments yet. Be the first!</p>
                      ) : (
                           (commentsByPost[selectedPost?.id] || []).map((comment, index) => (
                             comment ? (
                          <div key={comment.id} className="rounded-[10px] bg-[#141414] p-3 transition-colors hover:bg-[#1C1C1C]">
                            <div className="flex items-start gap-2">
                              <button
                                onClick={(event) => {
                                  event.stopPropagation()
                                  if (comment.profiles?.username) {
                                    closePostModal()
                                    navigate(`/profile/${comment.profiles.username}`)
                                  }
                                }}
                              >
                                {comment.profiles?.avatar_url ? (
                                  <img
                                    src={comment.profiles.avatar_url}
                                    alt={comment.profiles?.username}
                                    className="h-8 w-8 rounded-full object-cover"
                                  />
                                ) : (
                                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#2A2000] text-xs font-bold text-[#F4B400]">
                                    {comment.profiles?.username?.charAt(0)?.toUpperCase() || "?"}
                                  </div>
                                )}
                              </button>
                              <div className="min-w-0 flex-1">
                                <button
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    if (comment.profiles?.username) {
                                      closePostModal()
                                      navigate(`/profile/${comment.profiles.username}`)
                                    }
                                  }}
                                  className="text-xs font-semibold text-[#F5F0E8] hover:text-[#F4B400]"
                                >
                                  {comment.profiles?.username || "Unknown"}
                                </button>
                                <p className="mt-1 break-words text-xs leading-relaxed text-[#A09080]">{comment.content}</p>
                                <p className="mt-1 text-[10px] text-[#5C5248]">{formatPostTime(comment.created_at)}</p>
                              </div>
                            </div>
                          </div>
                             ) : (
                               <div key={`comment-placeholder-${index}`} className="py-2 text-xs text-[#5C5248]">
                                 Loading comment...
                               </div>
                             )
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <style>{`
        .explore-feed > div {
          width: 100%;
          max-width: 42rem;
          margin-left: auto;
          margin-right: auto;
          padding: 0;
        }

        .explore-feed [data-post-id] {
          background: #0D0D0D !important;
          border: 1px solid #1F1F1F !important;
          border-radius: 16px !important;
          padding: 16px !important;
          margin-bottom: 12px !important;
          transition: all 150ms ease !important;
        }

        .explore-feed [data-post-id]:hover {
          border-color: #2A2A2A !important;
          background: #111111 !important;
        }

        .explore-feed [data-post-id] [class*='border-b'],
        .explore-feed [data-post-id] [class*='border-t'] {
          border-top-width: 0 !important;
          border-bottom-width: 0 !important;
        }

        .explore-feed [data-post-id] > div:last-child {
          margin-top: 12px !important;
          padding-top: 12px !important;
          border-top: 1px solid #1F1F1F !important;
        }

        .explore-feed [data-post-id] img[alt='Post'] {
          margin-top: 12px !important;
          border-radius: 12px !important;
          border: 1px solid #1F1F1F !important;
          overflow: hidden;
        }

        .explore-feed [data-post-id] button[class*='ml-auto'] {
          border: 1px solid #2A2A2A !important;
          background: transparent !important;
          color: #A09080 !important;
          border-radius: 16px !important;
          padding: 3px 12px !important;
          font-size: 12px !important;
          font-weight: 600 !important;
          margin-left: auto;
        }

        .explore-feed [data-post-id] button[class*='ml-auto']:hover {
          border-color: #F4B400 !important;
          color: #F4B400 !important;
        }

        .explore-feed [data-post-id] button[class*='ml-auto'][class*='text-\[\#5C5248\]'] {
          border-color: #1F1F1F !important;
          color: #5C5248 !important;
        }
      `}</style>
    </div>
  )
}
