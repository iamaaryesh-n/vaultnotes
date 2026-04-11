import { useState, useEffect, useRef, lazy, Suspense } from "react"
import { useNavigate, useLocation } from "react-router-dom"
import { supabase } from "../lib/supabase"
import { useAuth } from "../hooks/useAuth"
import { useNotifications } from "../hooks/useNotifications"
import { SearchDropdown } from "./SearchDropdown"
import { EditProfileModal } from "./EditProfileModal"
import Modal from "./Modal"

const NotificationDropdown = lazy(() =>
  import("./NotificationDropdown").then((module) => ({ default: module.NotificationDropdown }))
)

export default function Navbar() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user: authUser, authLoading } = useAuth()
  
  const { notifications, loading: notificationsLoading, unreadCount, markAsRead } = useNotifications()
  
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(authLoading)
  const [notificationDropdownOpen, setNotificationDropdownOpen] = useState(false)
  const [notification, setNotification] = useState(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState([])
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchLoading, setSearchLoading] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)
  const [isEditProfileOpen, setIsEditProfileOpen] = useState(false)
  const [selectedTheme, setSelectedTheme] = useState("system")
  const [confirmModal, setConfirmModal] = useState({
    open: false,
    title: "",
    message: "",
    confirmText: "Confirm",
    cancelText: "Cancel",
    action: null,
  })
  const notificationsRef = useRef(null)
  const searchRef = useRef(null)
  const accountMenuRef = useRef(null)
  const debounceTimer = useRef(null)

  useEffect(() => {
    if (authUser) {
      fetchProfile(authUser.id)
    }
    // Close notification dropdown on mount (e.g., after refresh)
    setNotificationDropdownOpen(false)
    console.log('[Navbar] Component mounted - dropdown closed, fetching user profile')
  }, [authUser])

  useEffect(() => {
    setAccountMenuOpen(false)
  }, [location.pathname])

  useEffect(() => {
    const savedTheme = localStorage.getItem("theme") || "system"
    setSelectedTheme(savedTheme)

    const root = document.documentElement
    if (savedTheme === "dark") {
      root.classList.add("dark")
    } else if (savedTheme === "light") {
      root.classList.remove("dark")
    } else {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches
      root.classList.toggle("dark", prefersDark)
    }
  }, [])

  // Listen for profile updates from other components
  useEffect(() => {
    const handleProfileUpdate = (event) => {
      console.log("[Navbar] Profile update event received:", event.detail)
      setNotification({
        message: "Profile Updated",
        type: "success"
      })
      if (authUser) {
        fetchProfile(authUser.id)
      }
      setTimeout(() => setNotification(null), 3000)
    }

    window.addEventListener("profileUpdated", handleProfileUpdate)
    return () => window.removeEventListener("profileUpdated", handleProfileUpdate)
  }, [authUser])

  // Close search dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (searchRef.current && !searchRef.current.contains(event.target)) {
        setSearchOpen(false)
      }

      if (accountMenuRef.current && !accountMenuRef.current.contains(event.target)) {
        setAccountMenuOpen(false)
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
        const { globalSearch } = await import("../lib/globalSearch")
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

  const fetchProfile = async (userId) => {
    try {
      setLoading(true)

      console.log("[Navbar] Fetching profile for user:", userId)

      // Fetch user's profile from profiles table
      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
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

  const getCurrentUsername = () => {
    if (profile?.username) return profile.username
    if (authUser?.user_metadata?.username) return authUser.user_metadata.username
    return ""
  }

  const handleProfileClick = () => {
    const username = getCurrentUsername()

    if (username) {
      navigate(`/profile/${username}`)
      return
    }

    navigate("/profile")
  }

  const handleViewProfile = () => {
    setAccountMenuOpen(false)
    handleProfileClick()
  }

  const handleOpenEditProfile = () => {
    setAccountMenuOpen(false)
    setIsEditProfileOpen(true)
  }

  const handleSwitchAccount = async () => {
    setAccountMenuOpen(false)

    setConfirmModal({
      open: true,
      title: "Switch account?",
      message: "Your current session will be signed out and you can login with another account.",
      confirmText: "Continue",
      cancelText: "Cancel",
      action: "switch",
    })
  }

  const closeConfirmModal = () => {
    setConfirmModal((prev) => ({ ...prev, open: false, action: null }))
  }

  const executeSessionExit = async () => {
    try {
      setLoggingOut(true)
      await supabase.auth.signOut()
      navigate("/login")
    } catch (err) {
      console.error("[Navbar] Session exit error:", err)
    } finally {
      setLoggingOut(false)
      closeConfirmModal()
    }
  }

  const handleConfirmAction = async () => {
    if (!confirmModal.action) {
      closeConfirmModal()
      return
    }

    await executeSessionExit()
  }

  const handleAccountMenuToggle = () => {
    setSelectedTheme(localStorage.getItem("theme") || "system")
    setAccountMenuOpen((prev) => !prev)
  }

  const handleThemeChange = (theme) => {
    const root = document.documentElement

    if (theme === "dark") {
      root.classList.add("dark")
      localStorage.setItem("theme", "dark")
    } else if (theme === "light") {
      root.classList.remove("dark")
      localStorage.setItem("theme", "light")
    } else {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches
      root.classList.toggle("dark", prefersDark)
      localStorage.setItem("theme", "system")
    }

    // Clean up old key format if it still exists.
    localStorage.removeItem("vaultnotes-theme")
    setSelectedTheme(theme)
    setAccountMenuOpen(false)
  }

  const handleEditProfileSave = async (updateData, mediaChanges = {}) => {
    if (!authUser?.id) {
      throw new Error("Unable to update profile")
    }

    // Validate username uniqueness
    if (updateData.username && updateData.username !== profile?.username) {
      const { data: existingUser, error: checkError } = await supabase
        .from("profiles")
        .select("id")
        .eq("username", updateData.username)
        .neq("id", authUser.id)
        .single()

      if (existingUser) {
        throw new Error("Username is already taken")
      }

      if (checkError && checkError.code !== "PGRST116") {
        throw new Error(checkError.message)
      }
    }

    const payload = {
      name: updateData.name,
      username: updateData.username,
      bio: updateData.bio,
    }

    const createCroppedAvatarBlob = async (file, positionX, positionY, zoom) => {
      const imageUrl = URL.createObjectURL(file)

      try {
        const image = await new Promise((resolve, reject) => {
          const img = new Image()
          img.onload = () => resolve(img)
          img.onerror = reject
          img.src = imageUrl
        })

        const outputSize = 512
        const canvas = document.createElement("canvas")
        canvas.width = outputSize
        canvas.height = outputSize

        const ctx = canvas.getContext("2d")
        if (!ctx) {
          throw new Error("Could not initialize avatar crop canvas")
        }

        const baseScale = Math.max(outputSize / image.width, outputSize / image.height)
        const drawScale = baseScale * (zoom || 1)
        const drawWidth = image.width * drawScale
        const drawHeight = image.height * drawScale

        const posX = (typeof positionX === "number" ? positionX : 50) / 100
        const posY = (typeof positionY === "number" ? positionY : 50) / 100

        const offsetX = outputSize * posX - drawWidth * posX
        const offsetY = outputSize * posY - drawHeight * posY

        ctx.drawImage(image, offsetX, offsetY, drawWidth, drawHeight)

        const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92))
        if (!blob) {
          throw new Error("Failed to generate cropped avatar")
        }

        return blob
      } finally {
        URL.revokeObjectURL(imageUrl)
      }
    }

    const uploadFileToBucket = async (file, bucketName, fileName) => {
      const { error: uploadError } = await supabase.storage
        .from(bucketName)
        .upload(fileName, file, { upsert: true })

      if (uploadError) {
        throw new Error(`Failed to upload ${bucketName}: ${uploadError.message}`)
      }

      const { data: publicUrlData } = supabase.storage
        .from(bucketName)
        .getPublicUrl(fileName)

      return publicUrlData.publicUrl
    }

    if (mediaChanges.pendingAvatarFile) {
      const croppedAvatar = await createCroppedAvatarBlob(
        mediaChanges.pendingAvatarFile,
        mediaChanges.avatarPositionX,
        mediaChanges.avatarPositionY,
        mediaChanges.avatarZoom
      )
      payload.avatar_url = await uploadFileToBucket(croppedAvatar, "avatars", `${authUser.id}/avatar.jpg`)
    }

    if (mediaChanges.pendingCoverFile) {
      const coverExt = mediaChanges.pendingCoverFile.name.split(".").pop() || "jpg"
      payload.cover_photo_url = await uploadFileToBucket(mediaChanges.pendingCoverFile, "cover-photos", `${authUser.id}/cover.${coverExt}`)
    }

    if (typeof mediaChanges.coverPositionX === "number") {
      payload.cover_position_x = mediaChanges.coverPositionX
    }

    if (typeof mediaChanges.coverPositionY === "number") {
      payload.cover_position_y = mediaChanges.coverPositionY
    }

    if (typeof mediaChanges.coverZoom === "number") {
      payload.cover_zoom = mediaChanges.coverZoom
    }

    const { error } = await supabase
      .from("profiles")
      .update(payload)
      .eq("id", authUser.id)

    if (error) {
      throw new Error(error.message)
    }

    const updatedProfile = { ...(profile || {}), ...payload }
    setProfile(updatedProfile)

    window.dispatchEvent(new CustomEvent("profileUpdated", { detail: payload }))

    if (payload.username) {
      navigate(`/profile/${payload.username}`)
    }
  }

  const handleLogout = async () => {
    setAccountMenuOpen(false)

    setConfirmModal({
      open: true,
      title: "Logout",
      message: "Are you sure you want to logout?",
      confirmText: "Logout",
      cancelText: "Cancel",
      action: "logout",
    })
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
      <nav className="fixed top-0 left-0 right-0 z-[100] h-[56px] border-b border-[#1F1F1F] bg-black/85 backdrop-blur-[16px]">
        <div className="px-4 md:px-6 h-full flex justify-between items-center gap-4">
          {/* Left: Logo */}
          <div className="flex-shrink-0">
            {/* Logo */}
            <button
              onClick={() => navigate("/")}
              className="flex items-center gap-2 transition-opacity hover:opacity-90"
            >
              <div className="flex h-[30px] w-[30px] items-center justify-center rounded-[8px] bg-[#F4B400] font-['Sora'] text-[13px] font-bold text-[#0D0D0D] shadow-[0_2px_12px_rgba(244,180,0,0.35)]">
                VN
              </div>
              <h1 className="hidden font-['Sora'] text-[16px] font-bold text-[#F5F0E8] sm:inline">VaultNotes</h1>
            </button>
          </div>

          {/* Center: Search Bar */}
          <div className="relative flex-1 max-w-xs sm:max-w-sm md:max-w-md lg:max-w-2xl" ref={searchRef}>
            <div className="relative">
              {/* Search Icon */}
              <svg
                className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 transform text-[#5C5248]"
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
                className="h-[36px] w-full rounded-[18px] border border-[#1F1F1F] bg-[#141414] pl-[36px] pr-[14px] text-[13px] text-[#F5F0E8] placeholder:text-[#5C5248] outline-none transition-all duration-150 focus:border-[#F4B400] focus:shadow-[0_0_0_2px_rgba(244,180,0,0.12)]"
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
          <div className="flex flex-shrink-0 items-center gap-2">
            {/* Notification Bell Icon - Relative for dropdown */}
            <div className="relative" ref={notificationsRef}>
              <button
                onClick={() => {
                  const newState = !notificationDropdownOpen
                  console.log('[Navbar] Notification dropdown toggled:', newState, 'Unread count:', unreadCount)
                  setNotificationDropdownOpen(newState)
                }}
                title="Notifications"
                className="relative flex h-[36px] w-[36px] items-center justify-center rounded-[10px] text-[#A09080] transition-colors duration-200 hover:bg-[#141414] hover:text-[#F5F0E8]"
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
                {unreadCount > 0 && <span className="absolute right-[6px] top-[6px] h-[8px] w-[8px] rounded-full border-[2px] border-[#000] bg-[#F4B400]" />}
              </button>

              {/* Notification Dropdown */}
              {notificationDropdownOpen && (
                <Suspense fallback={null}>
                  <NotificationDropdown
                    notifications={notifications}
                    loading={notificationsLoading}
                    unreadCount={unreadCount}
                    onMarkAsRead={markAsRead}
                    isOpen={notificationDropdownOpen}
                    onClose={() => setNotificationDropdownOpen(false)}
                  />
                </Suspense>
              )}
            </div>

            {/* Avatar + Name Account Menu */}
            <div className="relative" ref={accountMenuRef}>
              <button
                onClick={handleAccountMenuToggle}
                title="Account actions"
                className="flex items-center gap-2 rounded-[10px] px-2 py-1.5 transition-colors duration-200 hover:bg-[#141414]"
              >
                {/* Avatar or Initials */}
                {loading ? (
                  <div className="h-[32px] w-[32px] animate-pulse rounded-full bg-[#141414]" />
                ) : profile?.avatar_url ? (
                  <img
                    src={profile.avatar_url}
                    alt="Avatar"
                    className="h-[32px] w-[32px] rounded-full border-[2px] border-[#2A2A2A] object-cover transition-colors hover:border-[#F4B400]"
                  />
                ) : (
                  <div className="flex h-[32px] w-[32px] items-center justify-center rounded-full border-[2px] border-[#2A2A2A] bg-[#2A2000] font-['Sora'] text-[13px] font-bold text-[#F4B400] transition-colors hover:border-[#F4B400]">
                    {getInitials(profile?.name || authUser?.email || "?")}
                  </div>
                )}

                <span className="hidden text-sm font-medium text-[#F5F0E8] sm:inline">
                  {profile?.name || authUser?.email?.split("@")[0] || "User"}
                </span>

                <svg
                  className={`h-4 w-4 text-[#5C5248] transition-transform ${accountMenuOpen ? "rotate-180" : ""}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {accountMenuOpen && (
                <div className="absolute right-0 top-full z-50 mt-2 w-56 animate-fadeIn rounded-2xl border border-[#1F1F1F] bg-[#0D0D0D] py-2 shadow-[0_16px_40px_-20px_rgba(0,0,0,0.75)]">
                  <button
                    onClick={handleViewProfile}
                    className="w-full px-4 py-2.5 text-left text-sm text-[#F5F0E8] transition-colors hover:bg-[#141414]"
                  >
                    View Profile
                  </button>
                  <button
                    onClick={handleOpenEditProfile}
                    className="w-full px-4 py-2.5 text-left text-sm text-[#F5F0E8] transition-colors hover:bg-[#141414]"
                  >
                    Edit Profile
                  </button>
                  <div className="my-1 border-t border-[#1F1F1F]" />
                  <button
                    onClick={() => handleThemeChange("light")}
                    className="w-full px-4 py-2.5 text-left text-sm text-[#A09080] transition-colors hover:bg-[#141414]"
                  >
                    {selectedTheme === "light" ? "✓ " : ""}Light Mode
                  </button>
                  <button
                    onClick={() => handleThemeChange("dark")}
                    className="w-full px-4 py-2.5 text-left text-sm text-[#A09080] transition-colors hover:bg-[#141414]"
                  >
                    {selectedTheme === "dark" ? "✓ " : ""}Dark Mode
                  </button>
                  <button
                    onClick={() => handleThemeChange("system")}
                    className="w-full px-4 py-2.5 text-left text-sm text-[#A09080] transition-colors hover:bg-[#141414]"
                  >
                    {selectedTheme === "system" ? "✓ " : ""}System Default
                  </button>
                  <button
                    onClick={handleSwitchAccount}
                    disabled={loggingOut}
                    className="w-full px-4 py-2.5 text-left text-sm text-[#A09080] transition-colors hover:bg-[#141414] disabled:opacity-60"
                  >
                    {loggingOut ? "Switching..." : "Switch Account"}
                  </button>
                  <div className="my-1 border-t border-[#1F1F1F]" />
                  <button
                    onClick={handleLogout}
                    disabled={loggingOut}
                    className="w-full px-4 py-2.5 text-left text-sm text-[#EF4444] transition-colors hover:bg-[rgba(239,68,68,0.08)] disabled:opacity-60"
                  >
                    {loggingOut ? "Logging out..." : "Logout"}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </nav>

      <EditProfileModal
        isOpen={isEditProfileOpen}
        onClose={() => setIsEditProfileOpen(false)}
        profile={profile}
        avatarUrl={profile?.avatar_url || null}
        coverPhotoUrl={profile?.cover_photo_url || null}
        onSave={handleEditProfileSave}
      />

      <Modal
        open={confirmModal.open}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmText={confirmModal.confirmText}
        cancelText={confirmModal.cancelText}
        confirmVariant="danger"
        isLoading={loggingOut}
        onCancel={closeConfirmModal}
        onConfirm={handleConfirmAction}
      />

      {/* Notification Toast */}
      {notification && (
        <div className="fixed right-6 top-20 z-40 animate-slideDown rounded-lg bg-[#141414] px-4 py-3 text-[#F5F0E8] shadow-lg border border-[#1F1F1F]">
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
      <div className="h-[56px]"></div>

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
