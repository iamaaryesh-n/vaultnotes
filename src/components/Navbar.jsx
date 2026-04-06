import { useState, useEffect, useRef } from "react"
import { useNavigate, useLocation } from "react-router-dom"
import { supabase } from "../lib/supabase"
import { useNotifications } from "../hooks/useNotifications"
import { NotificationDropdown } from "./NotificationDropdown"
import { globalSearch } from "../lib/globalSearch"
import { SearchDropdown } from "./SearchDropdown"

export default function Navbar({ onLogout }) {
  const navigate = useNavigate()
  const location = useLocation()
  
  const { notifications, loading: notificationsLoading, unreadCount, markAsRead } = useNotifications()
  
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [notificationDropdownOpen, setNotificationDropdownOpen] = useState(false)
  const [notification, setNotification] = useState(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState([])
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchLoading, setSearchLoading] = useState(false)
  const notificationsRef = useRef(null)
  const searchRef = useRef(null)
  const debounceTimer = useRef(null)

  useEffect(() => {
    fetchUserAndProfile()
    // Close notification dropdown on mount (e.g., after refresh)
    setNotificationDropdownOpen(false)
    console.log('[Navbar] Component mounted - dropdown closed, fetching user profile')
  }, [])

  // Listen for profile updates from other components
  useEffect(() => {
    const handleProfileUpdate = (event) => {
      console.log("[Navbar] Profile update event received:", event.detail)
      setNotification({
        message: "Profile Updated",
        type: "success"
      })
      fetchUserAndProfile()
      setTimeout(() => setNotification(null), 3000)
    }

    window.addEventListener("profileUpdated", handleProfileUpdate)
    return () => window.removeEventListener("profileUpdated", handleProfileUpdate)
  }, [])

  // Close search dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (searchRef.current && !searchRef.current.contains(event.target)) {
        setSearchOpen(false)
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  // Debounced global search across all content
  useEffect(() => {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current)
    }

    if (!searchQuery.trim()) {
      setSearchResults({ users: [], posts: [], workspaces: [], notes: [], isEmpty: true })
      setSearchOpen(false)
      return
    }

    setSearchOpen(true)
    setSearchLoading(true)

    debounceTimer.current = setTimeout(async () => {
      try {
        const results = await globalSearch(searchQuery)
        setSearchResults(results)
        console.log("[Navbar] Global search completed:", {
          users: results.users.length,
          posts: results.posts.length,
          workspaces: results.workspaces.length,
          notes: results.notes.length
        })
      } catch (err) {
        console.error("[Navbar] Global search error:", err)
        setSearchResults({ users: [], posts: [], workspaces: [], notes: [], isEmpty: true, error: err.message })
      } finally {
        setSearchLoading(false)
      }
    }, 300) // 300ms debounce

    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current)
      }
    }
  }, [searchQuery])

  const fetchUserAndProfile = async () => {
    try {
      setLoading(true)

      // Get current authenticated user
      const { data: { user }, error: authError } = await supabase.auth.getUser()

      if (authError || !user) {
        console.error("[Navbar] Auth error:", authError)
        return
      }

      setUser(user)
      console.log("[Navbar] Fetched user:", user.email)

      // Fetch user's profile from profiles table
      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single()

      if (profileData) {
        setProfile(profileData)
        console.log("[Navbar] Fetched profile:", profileData.name)
      } else if (profileError && profileError.code !== "PGRST116") {
        console.error("[Navbar] Error fetching profile:", profileError.message)
      }
    } catch (err) {
      console.error("[Navbar] Exception:", err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleProfileClick = () => {
    navigate("/profile")
  }

  // Get initials from name
  const getInitials = (name) => {
    if (!name) return "?"
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2)
  }

  return (
    <>
      {/* Navbar */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white border-b border-gray-200 shadow-sm">
        <div className="px-4 md:px-6 py-3 flex justify-between items-center gap-6">
          {/* Left: Logo */}
          <div className="flex-shrink-0">
            {/* Logo */}
            <button
              onClick={() => navigate("/")}
              className="flex items-center gap-2 hover:opacity-80 transition-opacity"
            >
              <svg
                className="w-6 h-6 text-yellow-500"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z" />
              </svg>
              <h1 className="text-lg md:text-xl font-bold text-gray-900 hidden sm:inline">VaultNotes</h1>
            </button>
          </div>

          {/* Center: Search Bar */}
          <div className="relative flex-1 max-w-xs sm:max-w-sm md:max-w-md lg:max-w-2xl" ref={searchRef}>
            <div className="relative">
              {/* Search Icon */}
              <svg
                className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>

              {/* Search Input */}
              <input
                type="text"
                placeholder="Search users, posts, notes..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => searchQuery.trim() && setSearchOpen(true)}
                className="w-full pl-10 pr-4 py-2.5 rounded-full bg-gray-100 border border-gray-300 text-sm placeholder-gray-500 focus:outline-none focus:border-yellow-400 focus:ring-2 focus:ring-yellow-200 focus:bg-white transition-all duration-150"
              />
            </div>

            {/* Global Search Results Dropdown */}
            <SearchDropdown
              searchOpen={searchOpen}
              searchLoading={searchLoading}
              searchResults={searchResults}
              searchQuery={searchQuery}
              onClose={() => {
                setSearchQuery("")
                setSearchResults({ users: [], posts: [], workspaces: [], notes: [], isEmpty: true })
                setSearchOpen(false)
              }}
              onResultClick={() => {
                setSearchQuery("")
                setSearchResults({ users: [], posts: [], workspaces: [], notes: [], isEmpty: true })
                setSearchOpen(false)
              }}
            />
          </div>

          {/* Right: Notification Bell and Avatar */}
          <div className="flex items-center gap-4 flex-shrink-0">
            {/* Notification Bell Icon - Relative for dropdown */}
            <div className="relative" ref={notificationsRef}>
              <button
                onClick={() => {
                  const newState = !notificationDropdownOpen
                  console.log('[Navbar] Notification dropdown toggled:', newState, 'Unread count:', unreadCount)
                  setNotificationDropdownOpen(newState)
                }}
                title="Notifications"
                className="relative p-2 text-gray-600 hover:text-yellow-500 transition-colors duration-200 rounded-lg hover:bg-gray-100"
              >
                <svg
                  className="w-6 h-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                  />
                </svg>

                {/* Unread Badge */}
                {unreadCount > 0 && (
                  <span className="absolute top-1 right-1 inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-white transform translate-x-1/2 -translate-y-1/2 bg-red-600 rounded-full">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </button>

              {/* Notification Dropdown */}
              <NotificationDropdown
                notifications={notifications}
                loading={notificationsLoading}
                unreadCount={unreadCount}
                onMarkAsRead={markAsRead}
                isOpen={notificationDropdownOpen}
                onClose={() => setNotificationDropdownOpen(false)}
              />
            </div>

            {/* Avatar - Clickable to go to Profile */}
            <button
              onClick={handleProfileClick}
              title="Go to profile"
              className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-100 transition-colors duration-200"
            >
              {/* Avatar or Initials */}
              {loading ? (
                <div className="w-8 h-8 rounded-full bg-gray-200 animate-pulse" />
              ) : profile?.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt="Avatar"
                  className="w-8 h-8 rounded-full object-cover border border-yellow-200"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-yellow-200 to-yellow-100 flex items-center justify-center font-semibold text-xs text-yellow-700 border border-yellow-300">
                  {getInitials(profile?.name || user?.email || "?")}
                </div>
              )}

              {/* Name - hidden on small screens */}
              <span className="text-sm font-medium text-gray-900 hidden sm:inline">
                {profile?.name || user?.email?.split("@")[0] || "User"}
              </span>
            </button>
          </div>
        </div>
      </nav>

      {/* Notification Toast */}
      {notification && (
        <div className="fixed top-20 right-6 z-40 bg-green-500 text-white px-4 py-3 rounded-lg shadow-lg animate-slideDown">
          <div className="flex items-center gap-2">
            <svg
              className="w-5 h-5"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
            </svg>
            {notification.message}
          </div>
        </div>
      )}

      {/* Spacer to account for fixed navbar */}
      <div className="h-20"></div>

      {/* Add animations */}
      <style>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(-4px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes slideDown {
          from {
            opacity: 0;
            transform: translateY(-8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .animate-fadeIn {
          animation: fadeIn 0.2s ease-out;
        }

        .animate-slideDown {
          animation: slideDown 0.3s ease-out;
        }
      `}</style>
    </>
  )
}
