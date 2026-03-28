import { useState, useEffect } from "react"
import { useNavigate, useLocation } from "react-router-dom"
import { supabase } from "../lib/supabase"

export default function BottomNavigation() {
  const navigate = useNavigate()
  const location = useLocation()
  const [profile, setProfile] = useState(null)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    fetchProfile()
  }, [])

  const fetchProfile = async () => {
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (!authError && user) {
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

  const isActive = (path) => {
    if (path === "/explore" && (location.pathname === "/explore" || location.pathname === "/")) {
      return true
    }
    if (path === "/workspaces" && (location.pathname === "/workspaces" || location.pathname.startsWith("/workspace/"))) {
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

  const handleCreateClick = () => {
    setMenuOpen(!menuOpen)
  }

  return (
    <>
      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-100 shadow-sm">
        <div className="flex justify-around items-end h-16">
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

          {/* Create Button (Center) */}
          <div className="flex-1 flex justify-center">
            <button
              onClick={handleCreateClick}
              className="mb-3 w-12 h-12 rounded-full bg-yellow-500 hover:bg-yellow-400 text-white flex items-center justify-center shadow-md hover:shadow-lg transition-all duration-200 active:scale-95"
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
              <div className="absolute bottom-16 left-1/2 transform -translate-x-1/2 bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden animate-fadeIn z-50">
                <button
                  onClick={() => {
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
                  onClick={() => {
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
          </div>

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

      {/* Bottom spacing */}
      <div className="h-16"></div>

      {/* Backdrop for menu */}
      {menuOpen && (
        <div
          className="fixed bottom-16 left-0 right-0 top-0 z-40"
          onClick={() => setMenuOpen(false)}
        />
      )}
    </>
  )
}
