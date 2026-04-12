import { useState, useEffect, useCallback, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useNavigate } from "react-router-dom"
import { supabase } from "../lib/supabase"
import { followUser, unfollowUser } from "../lib/followsLib"

export function FollowersModal({ isOpen, onClose, userId, currentUserId }) {
  const navigate = useNavigate()
  const [followers, setFollowers] = useState([])
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [followingStates, setFollowingStates] = useState({})

  useEffect(() => {
    if (isOpen && userId) {
      fetchFollowers()
    }
  }, [isOpen, userId])

  const fetchFollowers = async () => {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from("follows")
        .select("follower_id, follower:profiles!follows_follower_id_fkey(id, username, name, avatar_url)")
        .eq("following_id", userId)

      if (error) {
        console.error("[FollowersModal] Error fetching followers:", error)
        return
      }

      const followersList = data?.map(f => f.follower).filter(Boolean) || []
      setFollowers(followersList)

      // Check follow status for current user
      if (currentUserId) {
        const followStates = {}
        for (const follower of followersList) {
          const { data: followData } = await supabase
            .from("follows")
            .select("id")
            .eq("follower_id", currentUserId)
            .eq("following_id", follower.id)
            .single()

          followStates[follower.id] = !!followData
        }
        setFollowingStates(followStates)
      }
    } catch (err) {
      console.error("[FollowersModal] Exception:", err)
    } finally {
      setLoading(false)
    }
  }

  const filteredFollowers = useMemo(() => {
    return followers.filter(f =>
      f.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
      f.name?.toLowerCase().includes(searchQuery.toLowerCase())
    )
  }, [followers, searchQuery])

  const handleFollowToggle = async (followerId) => {
    if (!currentUserId) return

    const isFollowing = followingStates[followerId]
    const targetStates = { ...followingStates }

    // Optimistic update
    targetStates[followerId] = !isFollowing
    setFollowingStates(targetStates)

    try {
      if (isFollowing) {
        await unfollowUser(currentUserId, followerId)
      } else {
        await followUser(currentUserId, followerId)
      }
    } catch (err) {
      // Revert on error
      setFollowingStates(followingStates)
      console.error("[FollowersModal] Error toggling follow:", err)
    }
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-[var(--overlay-backdrop)] backdrop-blur-sm"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed left-1/2 top-1/2 z-50 flex max-h-96 w-full max-w-md -translate-x-1/2 -translate-y-1/2 transform flex-col rounded-[20px] border border-[var(--overlay-border)] bg-[var(--overlay-surface)] shadow-[var(--overlay-shadow)]"
          >
            {/* Header */}
            <div className="flex shrink-0 items-center justify-between border-b border-[var(--overlay-border)] px-6 py-4">
              <h2 className="font-['Sora'] text-xl font-bold text-[var(--overlay-text)]">Followers</h2>
              <button
                onClick={onClose}
                className="text-[var(--overlay-text-subtle)] transition-colors hover:text-[var(--overlay-text)]"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Search */}
            <div className="shrink-0 border-b border-[var(--overlay-border)] px-6 py-3">
              <input
                type="text"
                placeholder="Search followers..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-[44px] w-full rounded-[10px] border border-[var(--overlay-border-strong)] bg-[var(--overlay-elev)] px-3 text-[13px] text-[var(--overlay-text)] outline-none placeholder:text-[var(--overlay-text-muted)] focus:border-[#F4B400] focus:shadow-[0_0_0_2px_rgba(244,180,0,0.12)]"
              />
            </div>

            {/* List */}
            <div className="overflow-y-auto flex-1">
              {loading ? (
                <div className="px-6 py-8 text-center text-[var(--overlay-text-subtle)]">
                  <svg className="animate-spin h-6 w-6 m-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Loading...
                </div>
              ) : filteredFollowers.length === 0 ? (
                <div className="px-6 py-8 text-center text-sm text-[var(--overlay-text-subtle)]">
                  {searchQuery ? "No followers found" : "No followers yet"}
                </div>
              ) : (
                <div className="divide-y divide-[var(--overlay-border)]">
                  {filteredFollowers.map((follower) => (
                    <motion.div
                      key={follower.id}
                      initial={{ opacity: 0, x: -4 }}
                      animate={{ opacity: 1, x: 0 }}
                      onClick={() => {
                        navigate(`/profile/${follower.username}`)
                        onClose()
                      }}
                      className="flex w-full cursor-pointer items-center gap-3 rounded-[10px] px-6 py-3 transition-colors hover:bg-[var(--overlay-hover)]"
                    >
                      {follower.avatar_url ? (
                        <img
                          src={follower.avatar_url}
                          alt={follower.username}
                          className="h-10 w-10 rounded-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--chat-accent-soft)] text-xs font-bold text-[var(--chat-accent)]">
                          {follower.username?.charAt(0) || "?"}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-semibold text-[var(--overlay-text)]">{follower.name || follower.username}</p>
                        <p className="text-[12px] text-[var(--overlay-text-muted)]">@{follower.username}</p>
                      </div>
                      {currentUserId && follower.id !== currentUserId && (
                        <motion.button
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={(e) => {
                            e.stopPropagation()
                            handleFollowToggle(follower.id)
                          }}
                          className={`rounded-[8px] px-3 py-1 text-[12px] font-bold transition-all ${
                            followingStates[follower.id]
                              ? "border border-[var(--overlay-border-strong)] bg-[var(--overlay-elev)] text-[var(--overlay-text)] hover:border-[#EF4444] hover:bg-[rgba(239,68,68,0.08)] hover:text-[#EF4444]"
                              : "bg-[#F4B400] text-[var(--profile-on-accent)] hover:bg-[#C49000]"
                          }`}
                        >
                          {followingStates[follower.id] ? "Following" : "Follow"}
                        </motion.button>
                      )}
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
