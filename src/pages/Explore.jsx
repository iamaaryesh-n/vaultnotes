import { useCallback, useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"
import { supabase } from "../lib/supabase"
import { useAuth } from "../hooks/useAuth"
import { usePrefetchWorkspaces } from "../hooks/usePrefetchWorkspaces"
import { followUser, unfollowUser } from "../lib/followsLib"
import { fetchComments, fetchCommentCountsForPosts, fetchLikeCountsForPosts } from "../lib/postInteractions"
import PostInteractions from "../components/PostInteractions"
import PostFeed from "../components/PostFeed"
import PostContent from "../components/PostContent"
import CommentItem from "../components/CommentItem"
import PublicWorkspaceShelf from "../components/PublicWorkspaceShelf"
import { getAvatarImageUrl } from "../utils/imageOptimization"
import PostModal from "../components/PostModal"
import { useExploreFeed } from "../hooks/useExploreFeed"
import { useExploreRealtime } from "../hooks/useExploreRealtime"
import { useRouteScrollRestoration } from "../hooks/useRouteScrollRestoration"

export default function Explore() {
  const navigate = useNavigate()
  const { user: contextUser, authReady } = useAuth()

  const [activeTab, setActiveTab] = useState("for-you")
  const [viewMode, setViewMode] = useState("posts")
  const [selectedPost, setSelectedPost] = useState(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [showModalComments, setShowModalComments] = useState(false)
  const [modalCommentsLoading, setModalCommentsLoading] = useState(false)
  const [followedUsers, setFollowedUsers] = useState([])
  const [headerVisible, setHeaderVisible] = useState(true)
  const [isMobileViewport, setIsMobileViewport] = useState(() => window.matchMedia("(max-width: 767px)").matches)
  const lastScrollY = useRef(0)

  useRouteScrollRestoration("explore-feed")

  const {
    posts,
    setPosts,
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
    setLikesByPost,
    addNewPost
  } = useExploreFeed(contextUser, authReady)

  useExploreRealtime({ posts, currentUserId, setLikesByPost, setCommentsByPost, addNewPost }, authReady)

  usePrefetchWorkspaces()

  // Track optimistic posts to avoid duplicates from realtime
  const newPostIdsRef = useRef(new Set())

  // Listen for new post creation and add optimistically
  useEffect(() => {
    const handleNewPost = async (event) => {
      const newPost = event?.detail
      if (!newPost || !newPost.id) return

      newPostIdsRef.current.add(newPost.id)
      
      // Fetch full post with profile data
      try {
        const { data: fullPost } = await supabase
          .from("posts")
          .select("id, user_id, content, image_url, created_at, visibility, profiles(id, username, name, avatar_url)")
          .eq("id", newPost.id)
          .maybeSingle()

        if (fullPost) {
          if (addNewPost) {
            addNewPost(fullPost)
          }

          // Fetch initial comment and like counts
          const [commentCounts, likeData] = await Promise.all([
            fetchCommentCountsForPosts([newPost.id]),
            fetchLikeCountsForPosts([newPost.id], currentUserId)
          ])

          // Update counts
          if (commentCounts[newPost.id] !== undefined) {
            setCommentsByPost((prev) => ({
              ...prev,
              [newPost.id]: new Array(commentCounts[newPost.id]).fill(null)
            }))
          }
          if (likeData[newPost.id]) {
            setLikesByPost((prev) => ({
              ...prev,
              [newPost.id]: likeData[newPost.id]
            }))
          }
        }
      } catch (err) {
        console.error("[Explore] Error fetching new post data:", err)
        if (addNewPost) {
          addNewPost(newPost)
        }
      }
    }

    window.addEventListener("explore:new-post", handleNewPost)
    return () => window.removeEventListener("explore:new-post", handleNewPost)
  }, [addNewPost, currentUserId, setCommentsByPost, setLikesByPost])

  useEffect(() => {
    if (!contextUser?.id) return
    let canceled = false

    const fetchFollowedUsers = async () => {
      const { data, error: fetchError } = await supabase
        .from("follows")
        .select("following_id")
        .eq("follower_id", contextUser.id)

      if (fetchError || canceled) {
        return
      }

      setFollowedUsers(data?.map((item) => item.following_id) || [])
    }

    fetchFollowedUsers()

    return () => {
      canceled = true
    }
  }, [contextUser?.id])

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 767px)")
    const handleMediaQueryChange = (event) => {
      setIsMobileViewport(event.matches)
    }

    setIsMobileViewport(mediaQuery.matches)

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", handleMediaQueryChange)
      return () => mediaQuery.removeEventListener("change", handleMediaQueryChange)
    }

    mediaQuery.addListener(handleMediaQueryChange)
    return () => mediaQuery.removeListener(handleMediaQueryChange)
  }, [])

  useEffect(() => {
    const handleScroll = () => {
      const currentY = window.scrollY
      if (currentY < 10) {
        setHeaderVisible(true)
      } else if (currentY > lastScrollY.current + 6) {
        setHeaderVisible(false)
      } else if (currentY < lastScrollY.current - 6) {
        setHeaderVisible(true)
      }
      lastScrollY.current = currentY
    }
    window.addEventListener("scroll", handleScroll, { passive: true })
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

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
    // Push a synthetic history entry so the mobile back button pops this
    // entry instead of navigating to the previous route.
    window.history.pushState({ explorePostModal: true }, "")
  }

  const closePostModal = () => {
    setModalOpen(false)
    setTimeout(() => setSelectedPost(null), 300)
    // Clean up the synthetic history entry when the user closes via X button
    // so the history stack stays accurate.
    if (window.history.state?.explorePostModal) {
      window.history.back()
    }
  }

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
    <div className="profile-theme -mt-[64px] min-h-screen bg-[var(--profile-bg)]">
      <div
        className={`sticky z-[90] border-b border-[var(--profile-border)] bg-[var(--profile-bg)] px-4 pb-0 pt-3 transition-transform duration-300 ease-in-out ${headerVisible ? "translate-y-0" : "-translate-y-full"}`}
        style={{ top: "56px" }}
      >
        <div className="mb-[10px] flex items-baseline gap-[10px]">
          <h1 className="font-['Sora'] text-[20px] font-bold text-[var(--profile-text)]">Explore</h1>
          <p className="text-[11px] text-[var(--profile-text-muted)]">Discover what's happening</p>
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
                  ? "bg-[#F4B400] text-[var(--profile-on-accent)] shadow-[0_2px_14px_rgba(244,180,0,0.3)]"
                  : "border border-[var(--profile-border)] bg-[var(--profile-elev)] text-[var(--profile-text-subtle)] hover:border-[var(--profile-border-strong)] hover:text-[var(--profile-text)]"
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
          <div className="scrollbar-hide mb-3 flex gap-[2px] overflow-x-auto rounded-[12px] border border-[var(--profile-border)] bg-[var(--profile-surface)] p-[3px]">
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
                    ? "bg-[var(--profile-hover)] text-[var(--profile-text)]"
                    : "bg-transparent text-[var(--profile-text-muted)] hover:text-[var(--profile-text-subtle)]"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {viewMode === "posts" ? (
        <div className={`explore-feed flex flex-col gap-3 px-4 pb-4 ${headerVisible ? "pt-[16px]" : "pt-[6px]"}`}>
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
            authReady={authReady}
          />
        </div>
      ) : (
        <PublicWorkspaceShelf contextUserId={contextUser?.id} />
      )}

      <PostModal
        isOpen={modalOpen}
        onClose={closePostModal}
        postId={selectedPost?.id}
        initialPostData={selectedPost}
      />

      <style>{`
        .explore-feed > div {
          width: 100%;
          max-width: 42rem;
          margin-left: auto;
          margin-right: auto;
          padding: 0;
        }

        .explore-feed [data-post-id] {
          background: var(--profile-surface) !important;
          border: 1px solid var(--profile-border) !important;
          border-radius: 16px !important;
          padding: 16px !important;
          margin-bottom: 12px !important;
          transition: all 150ms ease !important;
        }

        .explore-feed [data-post-id]:hover {
          border-color: var(--profile-border-strong) !important;
          background: var(--profile-elev) !important;
        }

        .explore-feed [data-post-id] [class*='border-b'],
        .explore-feed [data-post-id] [class*='border-t'] {
          border-top-width: 0 !important;
          border-bottom-width: 0 !important;
        }

        .explore-feed [data-post-id] > div:last-child {
          margin-top: 12px !important;
          padding-top: 12px !important;
          border-top: 1px solid var(--profile-border) !important;
        }

        .explore-feed [data-post-id] img[alt='Post'] {
          margin-top: 12px !important;
          border-radius: 12px !important;
          border: 1px solid var(--profile-border) !important;
          overflow: hidden;
        }

        .explore-feed [data-post-id] button[class*='ml-auto'] {
          border: 1px solid var(--profile-border-strong) !important;
          background: transparent !important;
          color: var(--profile-text-subtle) !important;
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

        .explore-feed [data-post-id] button[class*='ml-auto'][class*='text-\[\var(--profile-text-muted)\]'] {
          border-color: var(--profile-border) !important;
          color: var(--profile-text-muted) !important;
        }
      `}</style>
    </div>
  )
}
