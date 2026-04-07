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
            className="fixed inset-0 bg-black/50 z-40"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-full max-w-md max-h-96 bg-white rounded-2xl shadow-2xl z-50 flex flex-col"
          >
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between flex-shrink-0">
              <h2 className="text-xl font-bold text-slate-900">Followers</h2>
              <button
                onClick={onClose}
                className="text-slate-500 hover:text-slate-900 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Search */}
            <div className="px-6 py-3 border-b border-slate-200 flex-shrink-0">
              <input
                type="text"
                placeholder="Search followers..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* List */}
            <div className="overflow-y-auto flex-1">
              {loading ? (
                <div className="px-6 py-8 text-center text-slate-500">
                  <svg className="animate-spin h-6 w-6 m-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Loading...
                </div>
              ) : filteredFollowers.length === 0 ? (
                <div className="px-6 py-8 text-center text-slate-500 text-sm">
                  {searchQuery ? "No followers found" : "No followers yet"}
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {filteredFollowers.map((follower) => (
                    <motion.div
                      key={follower.id}
                      initial={{ opacity: 0, x: -4 }}
                      animate={{ opacity: 1, x: 0 }}
                      onClick={() => {
                        navigate(`/profile/${follower.username}`)
                        onClose()
                      }}
                      className="w-full px-6 py-3 flex items-center gap-3 hover:bg-slate-50 transition-colors cursor-pointer"
                    >
                      {follower.avatar_url ? (
                        <img
                          src={follower.avatar_url}
                          alt={follower.username}
                          className="w-10 h-10 rounded-full object-cover ring-2 ring-slate-100"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-cyan-400 flex items-center justify-center text-xs font-bold text-white">
                          {follower.username?.charAt(0) || "?"}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900">{follower.name || follower.username}</p>
                        <p className="text-xs text-slate-500">@{follower.username}</p>
                      </div>
                      {currentUserId && follower.id !== currentUserId && (
                        <motion.button
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={(e) => {
                            e.stopPropagation()
                            handleFollowToggle(follower.id)
                          }}
                          className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                            followingStates[follower.id]
                              ? "bg-slate-200 text-slate-900 hover:bg-slate-300"
                              : "bg-blue-500 text-white hover:bg-blue-600"
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
