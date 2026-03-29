import { useState, useEffect } from "react"
import { useNavigate, useLocation } from "react-router-dom"
import { supabase } from "../lib/supabase"

export default function BottomNavigation() {
  const navigate = useNavigate()
  const location = useLocation()
  const [profile, setProfile] = useState(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [currentUserId, setCurrentUserId] = useState(null)
  const [unreadConversationIds, setUnreadConversationIds] = useState([])
  const unreadChatCount = unreadConversationIds.length

  useEffect(() => {
    fetchProfile()
  }, [])

  const fetchProfile = async () => {
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (!authError && user) {
        setCurrentUserId(user.id)
        const { data: profileData } = await supabase
          .from("profiles")
          .select("username")
          .eq("id", user.id)
          .single()

        if (profileData) {
          setProfile(profileData)
        }
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
      setUnreadConversationIds(uniqueConversationIds)
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

      if (detail.unreadCountsByConversation) {
        const conversationIds = Object.entries(detail.unreadCountsByConversation)
          .filter(([, count]) => count > 0)
          .map(([conversationId]) => conversationId)

        setUnreadConversationIds(conversationIds)
        return
      }

      if (typeof detail.totalUnreadConversations === "number") {
        if (detail.totalUnreadConversations === 0) {
          setUnreadConversationIds([])
        } else {
          fetchUnreadChatCount(currentUserId)
        }
        return
      }

      fetchUnreadChatCount(currentUserId)
    }

    window.addEventListener("chatUnreadChanged", handleUnreadRefresh)
    return () => window.removeEventListener("chatUnreadChanged", handleUnreadRefresh)
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
            setUnreadConversationIds((prev) => {
              if (prev.includes(message.conversation_id)) {
                return prev
              }

              return [...prev, message.conversation_id]
            })
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
    if (path === "/chat" && location.pathname === "/chat") {
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

  return (
    <>
      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-gray-100 bg-white/95 shadow-[0_-4px_16px_rgba(15,23,42,0.08)] backdrop-blur">
        <div className="flex h-[72px] justify-around items-end">
          {/* Explore */}
          <button
            onClick={() => handleNavigation("/explore")}
            className={`flex-1 flex flex-col items-center justify-center gap-1 transition-colors ${
              isActive("/explore") ? "text-yellow-500" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <svg
              className="w-6 h-6"
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
            <span className="text-xs font-medium">Explore</span>
          </button>

          {/* Workspaces */}
          <button
            onClick={() => handleNavigation("/workspaces")}
            className={`flex-1 flex flex-col items-center justify-center gap-1 transition-colors ${
              isActive("/workspaces") ? "text-yellow-500" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <svg
              className="w-6 h-6"
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
            <span className="text-xs font-medium">Workspaces</span>
          </button>

          {/* Chat */}
          <button
            onClick={() => handleNavigation("/chat")}
            className={`flex-1 flex flex-col items-center justify-center gap-1 transition-colors ${
              isActive("/chat") ? "text-yellow-500" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <div className="relative">
              <svg
                className="w-6 h-6"
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
                <span className="absolute -right-2 -top-2 min-w-[18px] rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
                  {unreadChatCount > 99 ? "99+" : unreadChatCount}
                </span>
              )}
            </div>
            <span className="text-xs font-medium">Chat</span>
          </button>

          {/* Create Spacer */}
          <div className="flex-1" />

          {/* Profile */}
          <button
            onClick={() => {
              if (profile?.username) {
                handleNavigation(`/profile/${profile.username}`)
              }
            }}
            className={`flex-1 flex flex-col items-center justify-center gap-1 transition-colors ${
              isActive("/profile") ? "text-yellow-500" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <svg
              className="w-6 h-6"
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
            <span className="text-xs font-medium">Profile</span>
          </button>
        </div>
      </nav>

      {/* Floating Create Button */}
      <button
        onClick={handleCreateClick}
        className="fixed bottom-[84px] right-5 z-[60] h-12 w-12 rounded-full bg-yellow-500 text-white shadow-md transition-all duration-200 hover:bg-yellow-400 hover:shadow-lg active:scale-95 flex items-center justify-center"
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

      {/* Create Menu */}
      {menuOpen && (
        <div
          className="fixed bottom-[84px] right-5 z-[60] bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden animate-fadeIn"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={(e) => {
              e.stopPropagation()
              console.log("Create Post clicked")
              window.dispatchEvent(new CustomEvent("openCreatePostModal"))
              setMenuOpen(false)
            }}
            className="w-full px-6 py-3 text-left text-sm font-medium text-gray-900 hover:bg-yellow-50 transition-colors flex items-center gap-3 whitespace-nowrap"
          >
            <svg
              className="w-4 h-4"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M11 5H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-6m-7-10l6-6v11H5z" />
            </svg>
            Create Post
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation()
              navigate("/workspaces")
              setMenuOpen(false)
            }}
            className="w-full px-6 py-3 text-left text-sm font-medium text-gray-900 hover:bg-yellow-50 transition-colors flex items-center gap-3 whitespace-nowrap border-t border-gray-100"
          >
            <svg
              className="w-4 h-4"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5 11h-4v4h-2v-4H7v-2h4V7h2v4h4v2z" />
            </svg>
            New Workspace
          </button>
        </div>
      )}

      {/* Backdrop for menu */}
      {menuOpen && (
        <div
          className="fixed inset-0 z-50"
          onClick={() => setMenuOpen(false)}
        />
      )}
    </>
  )
}
