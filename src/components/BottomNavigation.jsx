import { useState, useEffect } from "react"
import { useNavigate, useLocation } from "react-router-dom"
import { supabase } from "../lib/supabase"
import { useAuth } from "../hooks/useAuth"
import { AnimatePresence, motion } from "framer-motion"

export default function BottomNavigation() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuth()
  const [profile, setProfile] = useState(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [currentUserId, setCurrentUserId] = useState(null)
  const [unreadDirectCount, setUnreadDirectCount] = useState(0)
  const [unreadGroupCount, setUnreadGroupCount] = useState(0)
  const unreadChatCount = unreadDirectCount + unreadGroupCount

  useEffect(() => {
    if (user?.id) {
      setCurrentUserId(user.id)
      fetchProfile(user.id)
    }
  }, [user?.id])

  const fetchProfile = async (userId) => {
    if (!userId) return

    try {
      console.log("[BottomNav] Fetching profile for user:", userId)
      const { data: profileData } = await supabase
        .from("profiles")
        .select("username")
        .eq("id", userId)
        .single()

      if (profileData) {
        setProfile(profileData)
      }
    } catch (err) {
      console.error("[BottomNav] Error fetching profile:", err)
    }
  }

  const fetchUnreadChatCount = async (userId) => {
    if (!userId) return

    try {
      const { data, error } = await supabase
        .from("messages")
        .select("conversation_id")
        .eq("receiver_id", userId)
        .eq("is_read", false)

      if (error) {
        console.error("[BottomNav] Error fetching unread chat count:", error)
        return
      }

      const uniqueConversationIds = [...new Set((data || []).map((item) => item.conversation_id).filter(Boolean))]
      setUnreadDirectCount(uniqueConversationIds.length)
    } catch (err) {
      console.error("[BottomNav] Exception fetching unread chat count:", err)
    }
  }

  useEffect(() => {
    if (!currentUserId) return
    fetchUnreadChatCount(currentUserId)
  }, [currentUserId])

  useEffect(() => {
    if (!currentUserId) return

    const handleUnreadRefresh = (event) => {
      const detail = event?.detail || {}

      if (typeof detail.unreadDirectCount === "number") {
        setUnreadDirectCount(detail.unreadDirectCount)
      }

      if (typeof detail.unreadGroupCount === "number") {
        setUnreadGroupCount(detail.unreadGroupCount)
      }

      if (detail.unreadCountsByConversation) {
        const conversationIds = Object.entries(detail.unreadCountsByConversation)
          .filter(([, count]) => count > 0)
          .map(([conversationId]) => conversationId)

        setUnreadDirectCount(conversationIds.length)
        return
      }

      if (typeof detail.totalUnreadConversations === "number") {
        if (detail.totalUnreadConversations === 0) {
          setUnreadDirectCount(0)
        } else {
          fetchUnreadChatCount(currentUserId)
        }
        return
      }

      fetchUnreadChatCount(currentUserId)
    }

    window.addEventListener("chatUnreadChanged", handleUnreadRefresh)
    window.addEventListener("totalChatUnreadChanged", handleUnreadRefresh)
    return () => {
      window.removeEventListener("chatUnreadChanged", handleUnreadRefresh)
      window.removeEventListener("totalChatUnreadChanged", handleUnreadRefresh)
    }
  }, [currentUserId])

  useEffect(() => {
    if (!currentUserId) return

    const channel = supabase
      .channel(`chat-unread-badge-${currentUserId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `receiver_id=eq.${currentUserId}`
        },
        (payload) => {
          const message = payload.new
          if (!message) return

          if (message.receiver_id === currentUserId && message.is_read === false) {
            fetchUnreadChatCount(currentUserId)
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "messages",
          filter: `receiver_id=eq.${currentUserId}`
        },
        (payload) => {
          if (payload.new?.is_read === true) {
            fetchUnreadChatCount(currentUserId)
          }
        }
      )
      .subscribe((status) => {
        console.log("[BottomNav] Chat unread subscription status:", status)
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [currentUserId])

  const isActive = (path) => {
    if (path === "/explore" && (location.pathname === "/explore" || location.pathname === "/")) {
      return true
    }
    if (path === "/workspaces" && (location.pathname === "/workspaces" || location.pathname.startsWith("/workspace/"))) {
      return true
    }
    if (path === "/chat" && location.pathname.startsWith("/chat")) {
      return true
    }
    if (path === "/profile" && location.pathname.startsWith("/profile")) {
      return true
    }
    return false
  }

  const handleNavigation = (path) => {
    setMenuOpen(false)
    navigate(path)
  }

  const handleCreateClick = (e) => {
    if (e) e.stopPropagation()
    setMenuOpen(!menuOpen)
  }

  const handleProfileNavigation = () => {
    const currentUsername = profile?.username || user?.user_metadata?.username

    if (currentUsername) {
      navigate(`/profile/${currentUsername}`)
      return
    }

    navigate("/profile")
  }

  return (
    <>
      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-[#1F1F1F] bg-[rgba(0,0,0,0.92)] shadow-[0_-6px_22px_rgba(0,0,0,0.45)] backdrop-blur-[20px]">
        <div className="flex h-[62px] items-center justify-around px-2">
          {/* Explore */}
          <button
            onClick={() => handleNavigation("/explore")}
            className={`flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors ${
              isActive("/explore") ? "text-[#F4B400]" : "text-[#5C5248] hover:text-[#A09080]"
            }`}
          >
            <svg
              className="h-[22px] w-[22px]"
              fill={isActive("/explore") ? "currentColor" : "none"}
              stroke="currentColor"
              strokeWidth={isActive("/explore") ? 0 : 2}
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <span className="text-[10px] font-semibold">Explore</span>
          </button>

          {/* Vaults */}
          <button
            onClick={() => handleNavigation("/workspaces")}
            className={`flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors ${
              isActive("/workspaces") ? "text-[#F4B400]" : "text-[#5C5248] hover:text-[#A09080]"
            }`}
          >
            <svg
              className="h-[22px] w-[22px]"
              fill={isActive("/workspaces") ? "currentColor" : "none"}
              stroke="currentColor"
              strokeWidth={isActive("/workspaces") ? 0 : 2}
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span className="text-[10px] font-semibold">Vaults</span>
          </button>

          {/* Center FAB slot */}
          <div className="flex-1 flex items-center justify-center" />

          {/* Chat */}
          <button
            onClick={() => handleNavigation("/chat")}
            className={`flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors ${
              isActive("/chat") ? "text-[#F4B400]" : "text-[#5C5248] hover:text-[#A09080]"
            }`}
          >
            <div className="relative">
              <svg
                className="h-[22px] w-[22px]"
                fill={isActive("/chat") ? "currentColor" : "none"}
                stroke="currentColor"
                strokeWidth={isActive("/chat") ? 0 : 2}
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M8 10h8M8 14h5m6 7l-4-4H6a2 2 0 01-2-2V6a2 2 0 012-2h12a2 2 0 012 2v9a2 2 0 01-2 2h-1v4z"
                />
              </svg>
              {unreadChatCount > 0 && (
                <span className="absolute -right-2 -top-2 min-w-[18px] rounded-full bg-[#EF4444] px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
                  {unreadChatCount > 99 ? "99+" : unreadChatCount}
                </span>
              )}
            </div>
            <span className="text-[10px] font-semibold">Chat</span>
          </button>

          {/* Profile */}
          <button
            onClick={handleProfileNavigation}
            className={`flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors ${
              isActive("/profile") ? "text-[#F4B400]" : "text-[#5C5248] hover:text-[#A09080]"
            }`}
          >
            <svg
              className="h-[22px] w-[22px]"
              fill={isActive("/profile") ? "currentColor" : "none"}
              stroke="currentColor"
              strokeWidth={isActive("/profile") ? 0 : 2}
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
              />
            </svg>
            <span className="text-[10px] font-semibold">Profile</span>
          </button>
        </div>
      </nav>

      {/* Floating Create Button */}
      <button
        onClick={handleCreateClick}
        className="fixed bottom-[8px] left-1/2 z-[60] flex h-[46px] w-[46px] -translate-x-1/2 items-center justify-center rounded-[14px] bg-[#F4B400] text-[#0D0D0D] shadow-[0_4px_18px_rgba(244,180,0,0.4)] transition-all duration-200 hover:bg-[#C49000] hover:scale-[1.06] active:scale-95"
      >
        {menuOpen ? (
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 4v16m8-8H4" />
          </svg>
        )}
      </button>

      <AnimatePresence>
        {menuOpen && (
          <>
            {/* Backdrop for menu */}
            <motion.div
              className="fixed inset-0 z-50 bg-black/35 backdrop-blur-[1px]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.16 }}
              onClick={() => setMenuOpen(false)}
            />

            {/* Create Menu */}
            <motion.div
              className="fixed bottom-[66px] left-1/2 z-[60] w-[244px] overflow-hidden rounded-[16px] border border-[#2A2A2A] bg-[linear-gradient(180deg,#111111_0%,#0B0B0B_100%)] shadow-[0_22px_44px_rgba(0,0,0,0.62),0_0_0_1px_rgba(244,180,0,0.08)]"
              style={{ x: "-50%", transformOrigin: "center bottom" }}
              initial={{ opacity: 0, y: 10, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.97 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="h-[2px] bg-gradient-to-r from-transparent via-[#F4B400] to-transparent opacity-70" />

              <button
                onClick={(e) => {
                  e.stopPropagation()
                  window.dispatchEvent(new CustomEvent("openCreatePostModal"))
                  setMenuOpen(false)
                }}
                className="flex w-full items-center gap-3 whitespace-nowrap px-5 py-3.5 text-left text-[14px] font-semibold text-[#F5F0E8] transition-colors hover:bg-[#171717]"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-[10px] border border-[rgba(244,180,0,0.25)] bg-[rgba(244,180,0,0.08)] text-[#F4B400]">
                  <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M11 5H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-6m-7-10l6-6v11H5z" />
                  </svg>
                </span>
                <span>Create Post</span>
              </button>

              <button
                onClick={(e) => {
                  e.stopPropagation()
                  navigate("/workspaces")
                  setMenuOpen(false)
                }}
                className="flex w-full items-center gap-3 whitespace-nowrap border-t border-[#1F1F1F] px-5 py-3.5 text-left text-[14px] font-semibold text-[#F5F0E8] transition-colors hover:bg-[#171717]"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-[10px] border border-[rgba(244,180,0,0.25)] bg-[rgba(244,180,0,0.08)] text-[#F4B400]">
                  <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5 11h-4v4h-2v-4H7v-2h4V7h2v4h4v2z" />
                  </svg>
                </span>
                <span>New Vault</span>
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  )
}
