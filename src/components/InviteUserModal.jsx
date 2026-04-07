import { useState, useRef, useEffect } from "react"
import { supabase } from "../lib/supabase"
import { getWorkspaceMembers } from "../lib/workspaceMembers"

// Helper to get initials
function getInitials(name, username) {
  const text = name || username || "U"
  return text
    .split(" ")
    .map(part => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)
}

// Helper to get avatar color
function getAvatarColor(username) {
  const colors = [
    "bg-yellow-400", "bg-blue-400", "bg-purple-400", "bg-pink-400", "bg-green-400",
    "bg-indigo-400", "bg-orange-400", "bg-rose-400", "bg-cyan-400", "bg-teal-400"
  ]
  let hash = 0
  for (let i = 0; i < username.length; i++) {
    hash = ((hash << 5) - hash) + username.charCodeAt(i)
    hash = hash & hash
  }
  return colors[Math.abs(hash) % colors.length]
}

// Helper to highlight matching text
function highlightMatch(text, query) {
  if (!query) return text
  const regex = new RegExp(`(${query})`, "gi")
  return text.split(regex).map((part, idx) =>
    regex.test(part) ? `<span class="font-bold text-yellow-600">${part}</span>` : part
  ).join("")
}

export default function InviteUserModal({ onClose, workspaceId, onSuccess }) {
  const [username, setUsername] = useState("")
  const [loading, setLoading] = useState(false)
  const [searching, setSearching] = useState(false)
  const [message, setMessage] = useState(null)
  const [messageType, setMessageType] = useState(null)
  const [suggestions, setSuggestions] = useState([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [selectedUserId, setSelectedUserId] = useState(null)
  const [selectedUser, setSelectedUser] = useState(null)
  const [currentUserId, setCurrentUserId] = useState(null)
  const [workspaceMembers, setWorkspaceMembers] = useState([])
  
  const searchTimeoutRef = useRef(null)
  const inviteControllerRef = useRef(null)
  const dropdownRef = useRef(null)

  // Initialize: get current user and workspace members
  useEffect(() => {
    const initialize = async () => {
      try {
        console.log("[InviteUserModal] Starting initialization...")

        // Step 1: Get current user
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user) {
          console.error("[InviteUserModal] ❌ Auth error:", authError)
          return
        }
        
        console.log("[InviteUserModal] ✅ Current user authenticated:", user.id)
        setCurrentUserId(user.id)

        // Step 2: Fetch workspace members (ALL fields for proper filtering)
        console.log("[InviteUserModal] Fetching workspace members...")
        const result = await getWorkspaceMembers(workspaceId)
        if (result.success) {
          console.log(`[InviteUserModal] ✅ Fetched ${result.data?.length || 0} workspace member(s)`)
          console.log("[InviteUserModal] Workspace members:", result.data)
          setWorkspaceMembers(result.data || [])
        } else {
          console.warn("[InviteUserModal] ⚠️ Failed to fetch members:", result.error)
          setWorkspaceMembers([])
        }
      } catch (err) {
        console.error("[InviteUserModal] ❌ Init error:", err)
      }
    }

    initialize()
  }, [workspaceId])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowDropdown(false)
      }
    }

    if (showDropdown) {
      document.addEventListener("mousedown", handleClickOutside)
      return () => document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [showDropdown])

  // Debounced search
  const searchUsers = async (query) => {
    if (!query.trim() || query.length < 1) {
      console.log("[InviteUserModal] Empty query, clearing suggestions")
      setSuggestions([])
      setShowDropdown(false)
      return
    }

    setSearching(true)
    setMessage(null)

    try {
      console.log("[InviteUserModal] ========== SEARCH START ==========")
      console.log("[InviteUserModal] Search query:", query)
      console.log("[InviteUserModal] Current user ID:", currentUserId)
      console.log("[InviteUserModal] Workspace members count:", workspaceMembers.length)
      console.log("[InviteUserModal] Workspace member IDs:", workspaceMembers.map(m => m.user_id))

      // Step 1: Fetch ALL matching users from profiles (no filtering in query)
      console.log("[InviteUserModal] Step 1: Fetching matching profiles...")
      const { data: allUsers, error: searchError } = await supabase
        .from("profiles")
        .select("id, username, email, name, avatar_url")
        .ilike("username", `%${query}%`)
        .limit(10) // Increased limit to ensure we get all matches

      if (searchError) {
        console.error("[InviteUserModal] ❌ Search error:", searchError)
        setSuggestions([])
        setShowDropdown(false)
        return
      }

      console.log(`[InviteUserModal] Step 1: ✅ Found ${allUsers?.length || 0} total matching user(s) in profiles`)
      console.log("[InviteUserModal] All matching users:", allUsers)

      // Step 2: Show ALL users, don't exclude existing members (UX: let user see they're already invited)
      console.log("[InviteUserModal] Step 2: Preparing all results (including existing members)")
      const exclusionSet = new Set()
      
      // Only exclude current user
      if (currentUserId) {
        exclusionSet.add(currentUserId)
        console.log("[InviteUserModal] Excluding current user:", currentUserId)
      }

      // Step 3: Filter ONLY current user, keep existing members visible
      console.log("[InviteUserModal] Step 3: Filtering out current user only...")
      const filtered = (allUsers || []).filter(user => {
        const isCurrentUser = exclusionSet.has(user.id)
        if (isCurrentUser) {
          console.log(`[InviteUserModal] Excluding user ${user.id} (${user.username}) - this is current user`)
        }
        return !isCurrentUser
      })

      console.log(`[InviteUserModal] ✅ Step 3: Showing ${filtered.length} total user(s) (including existing members)`)
      console.log("[InviteUserModal] All suggestions:", filtered)
      console.log("[InviteUserModal] ========== SEARCH END ==========")

      setSuggestions(filtered)
      setShowDropdown(filtered.length > 0)
    } catch (err) {
      console.error("[InviteUserModal] ❌ Search exception:", err)
      setSuggestions([])
      setShowDropdown(false)
    } finally {
      setSearching(false)
    }
  }

  // Handle input change with debounce
  const handleInputChange = (e) => {
    const value = e.target.value.toLowerCase()
    setUsername(value)
    setSelectedUserId(null)
    setSelectedUser(null)

    // Clear pending timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
    }

    // Set new timeout
    if (value.trim()) {
      setSearching(true)
      searchTimeoutRef.current = setTimeout(() => {
        searchUsers(value)
      }, 300)
    } else {
      setSuggestions([])
      setShowDropdown(false)
    }
  }

  // Handle suggestion click
  const handleSuggestionClick = (user) => {
    console.log("[InviteUserModal] ========== USER SELECTED ==========")
    console.log("[InviteUserModal] Selected user object:", user)
    console.log("[InviteUserModal] Selected user ID:", user.id)
    console.log("[InviteUserModal] Selected username:", user.username)
    
    // Store the full user object
    setSelectedUser(user)
    setUsername(user.username)
    setMessage(null)
    
    // Keep dropdown open so user can see their selection is confirmed
    // Don't clear suggestions - just keep them visible or fade them
    setShowDropdown(false)
    
    console.log("[InviteUserModal] State updated - selectedUser object stored:", user)
    console.log("[InviteUserModal] ========== USER SELECTED END ==========")
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    console.log("[InviteUserModal] ========== INVITE SUBMIT START ==========")
    console.log("[InviteUserModal] Selected user object:", selectedUser)
    console.log("[InviteUserModal] Selected user ID:", selectedUser?.id)

    // CRITICAL: Validate that user selected from dropdown (not just typed)
    if (!selectedUser || !selectedUser.id) {
      console.error("[InviteUserModal] ❌ No user selected from suggestions")
      setMessage("Please select a user from suggestions")
      setMessageType("error")
      console.log("[InviteUserModal] ========== INVITE SUBMIT END (NO USER SELECTED) ==========")
      return
    }

    setLoading(true)
    setMessage(null)

    try {
      console.log("[InviteUserModal] ✅ User selected, proceeding with invite")
      console.log("[InviteUserModal] User to invite - ID:", selectedUser.id, "Username:", selectedUser.username)

      // Step 1: Authenticate current user
      console.log("[InviteUserModal] Step 1: Authenticating current user...")
      const { data: authData, error: authError } = await supabase.auth.getUser()
      const currentUser = authData?.user
      
      if (authError || !currentUser) {
        console.error("[InviteUserModal] ❌ Authentication error:", authError)
        setMessage("Authentication error. Please try again.")
        setMessageType("error")
        setLoading(false)
        console.log("[InviteUserModal] ========== INVITE SUBMIT END (AUTH ERROR) ==========")
        return
      }

      console.log("[InviteUserModal] ✅ Step 2: Current user authenticated")
      console.log("[InviteUserModal] Current user ID:", currentUser.id)

      // Step 2b: Double-check user not already in workspace (might be showing in list now)
      console.log("[InviteUserModal] Step 2b: Verifying user not already in workspace...")
      const isMember = workspaceMembers.some(m => m.user_id === selectedUser.id)
      if (isMember) {
        const memberName = selectedUser?.name || selectedUser?.username
        const message = `${memberName} is already in this workspace`
        console.warn("[InviteUserModal] ⚠️ User already a member:", message)
        setMessage(message)
        setMessageType("error")
        setLoading(false)
        console.log("[InviteUserModal] ========== INVITE SUBMIT END (ALREADY MEMBER) ==========")
        return
      }

      console.log("[InviteUserModal] ✅ Step 2b: User not yet a member")

      // Step 3: Check for existing pending invite (non-blocking)
      console.log("[InviteUserModal] Step 3: Checking existing pending invite...")
      let existingInvite = null
      try {
        const { data, error } = await supabase
          .from("workspace_invites")
          .select("id, status")
          .eq("workspace_id", workspaceId)
          .eq("invitee_id", selectedUser.id)
          .eq("status", "pending")
          .limit(1)
          .maybeSingle()

        if (error) {
          console.warn("[InviteUserModal] ⚠️ Existing invite check failed (will proceed anyway):", error)
        } else if (data?.id) {
          existingInvite = data
          console.warn("[InviteUserModal] Found existing pending invite:", data.id)
          setMessage(`@${selectedUser.username} already has a pending invite`)
          setMessageType("error")
          setLoading(false)
          return
        }
      } catch (err) {
        console.warn("[InviteUserModal] ⚠️ Exception checking existing invite (will proceed):", err)
      }

      // Step 4: Create invite instead of directly adding membership.
      console.log("[InviteUserModal] Step 4: Creating workspace invite...")
      const { data: inviteData, error: inviteError } = await supabase
        .from("workspace_invites")
        .insert({
          workspace_id: workspaceId,
          inviter_id: currentUser.id,
          invitee_id: selectedUser.id,
          status: "pending"
        })
        .select("id")

      if (inviteError) {
        console.error("[InviteUserModal] Invite insert error:", inviteError)
        // Check if it's a duplicate error (already exists)
        if (inviteError.code === "23505") {
          setMessage(`@${selectedUser.username} already has a pending invite`)
          setMessageType("error")
        } else {
          setMessage(inviteError.message || "Failed to send workspace invite")
          setMessageType("error")
        }
        setLoading(false)
        return
      }

      console.log("[InviteUserModal] Step 4 complete: invite created", inviteData)

      // Step 5: Create workspace invite notification (with retry logic)
      console.log("[InviteUserModal] Step 5: Creating notification...")
      let notificationCreated = false
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const { error: notificationError } = await supabase
            .from("notifications")
            .insert({
              recipient_id: selectedUser.id,
              actor_id: currentUser.id,
              type: "workspace_invite",
              workspace_id: workspaceId,
              is_read: false,
              post_id: null,
              comment_id: null
            })

          if (!notificationError) {
            console.log("[InviteUserModal] ✅ Notification created on attempt", attempt)
            notificationCreated = true
            break
          } else {
            console.warn(`[InviteUserModal] Notification creation failed attempt ${attempt}:`, notificationError)
            if (attempt < 3) {
              await new Promise(resolve => setTimeout(resolve, 500))
            }
          }
        } catch (err) {
          console.warn(`[InviteUserModal] Exception creating notification attempt ${attempt}:`, err)
          if (attempt < 3) {
            await new Promise(resolve => setTimeout(resolve, 500))
          }
        }
      }

      if (!notificationCreated) {
        console.warn("[InviteUserModal] Failed to create notification after 3 attempts")
      }

      console.log("[InviteUserModal] Invite process completed")
      setMessage(`${selectedUser.name || selectedUser.username} has been invited!`)
      setMessageType("success")

      // Clear form after success
      console.log("[InviteUserModal] Clearing form state...")
      setUsername("")
      setSelectedUser(null)
      setSuggestions([])
      setShowDropdown(false)

      // Close modal after success
      setTimeout(() => {
        console.log("[InviteUserModal] Closing modal and calling onSuccess...")
        onClose()
        if (onSuccess) onSuccess()
      }, 1200)

      console.log("[InviteUserModal] ========== INVITE SUBMIT END (SUCCESS) ==========")
    } catch (error) {
      console.error("[InviteUserModal] ❌ Unexpected error during invite:", error)
      console.error("[InviteUserModal] Error stack:", error.stack)
      setMessage("An unexpected error occurred. Please try again.")
      setMessageType("error")
      console.log("[InviteUserModal] ========== INVITE SUBMIT END (EXCEPTION) ==========")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-gray-900 bg-opacity-30 flex items-center justify-center z-50 fade-in backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl w-full max-w-md shadow-2xl border border-gray-100 flex flex-col max-h-[90vh]">
        
        {/* Header - Fixed */}
        <div className="px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-slate-50 to-white flex-shrink-0">
          <h2 className="text-lg font-bold text-gray-900">Invite User</h2>
          <p className="text-slate-500 text-xs mt-1">Search and invite users by username</p>
        </div>

        {/* Search Box & Suggestions Container - Wraps both */}
        <div ref={dropdownRef} className="flex flex-col flex-1 min-h-0">
          {/* Search Box - Sticky at top of content area */}
          <div className="px-6 py-3 border-b border-gray-100 bg-white flex-shrink-0 space-y-2">
            <div className="relative">
              <input
                type="text"
                placeholder="Search username..."
                value={username}
                onChange={handleInputChange}
                onFocus={() => suggestions.length > 0 && setShowDropdown(true)}
                disabled={loading}
                autoFocus
                className="w-full p-3 rounded-lg bg-white text-gray-900 border border-slate-200 placeholder-slate-400 focus:outline-none focus:border-yellow-400 focus:ring-2 focus:ring-yellow-400/40 transition-all duration-200 disabled:bg-slate-50 disabled:opacity-60"
              />
              
              {searching && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                  <div className="animate-spin">⏳</div>
                </div>
              )}
            </div>
          </div>

          {/* Suggestions List - Scrollable only this section */}
          <div className="flex-1 overflow-y-auto min-h-0">
          {showDropdown && suggestions.length > 0 ? (
            <ul className="divide-y divide-slate-100">
              {suggestions.map((user) => {
                // Check if user is already a member
                const isAlreadyMember = workspaceMembers.some(m => m.user_id === user.id)
                // Check if this user is currently selected (compare by user.id, not object reference)
                const isSelected = selectedUser?.id === user.id
                
                return (
                  <li key={user.id}>
                    <button
                      type="button"
                      onClick={() => !isAlreadyMember && handleSuggestionClick(user)}
                      disabled={isAlreadyMember}
                      className={`w-full px-6 py-3 flex items-center gap-3 text-left transition-all ${
                        isAlreadyMember
                          ? "bg-gray-50 cursor-not-allowed opacity-60"
                          : isSelected
                          ? "bg-yellow-50 hover:bg-yellow-100"
                          : "hover:bg-yellow-50 active:bg-yellow-100"
                      }`}
                    >
                      {/* Avatar */}
                      <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center font-bold text-white text-sm shadow-sm ${getAvatarColor(user.username)}`}>
                        {user.avatar_url ? (
                          <img
                            src={user.avatar_url}
                            alt={user.username}
                            className="w-full h-full rounded-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          getInitials(user.name, user.username)
                        )}
                      </div>

                      {/* User Info */}
                      <div className="flex-1 text-left min-w-0">
                        <p className="font-semibold text-gray-900 text-sm truncate">
                          {user.name || user.username}
                        </p>
                        <p className="text-xs text-slate-500">
                          @{user.username}
                        </p>
                        {user.email && (
                          <p className="text-xs text-slate-400 truncate">
                            {user.email}
                          </p>
                        )}
                      </div>

                      {/* Status Indicator */}
                      {isAlreadyMember ? (
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <span className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded font-medium">
                            Already a member
                          </span>
                        </div>
                      ) : isSelected ? (
                        <svg className="w-5 h-5 text-yellow-500 flex-shrink-0" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                          <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.052-.143Z" clipRule="evenodd" />
                        </svg>
                      ) : (
                        <svg className="w-5 h-5 text-slate-300 flex-shrink-0" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                          <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.052-.143Z" clipRule="evenodd" />
                        </svg>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          ) : showDropdown && searching ? (
            <div className="px-6 py-12 text-center text-slate-500 text-sm flex flex-col items-center gap-3">
              <div className="animate-spin text-lg">⏳</div>
              <span>Searching users...</span>
            </div>
          ) : showDropdown ? (
            <div className="px-6 py-12 text-center text-slate-400 text-sm">
              <p>No users found</p>
              <p className="text-xs mt-1">Try searching with a different username</p>
            </div>
          ) : (
            <div className="px-6 py-12 text-center text-slate-400 text-sm">
              <p>Start typing to search users</p>
            </div>
          )}
          </div>
        </div>

        {/* Selected User Info & Message - Fixed scroll section above footer */}
        <div className="px-6 py-3 border-t border-gray-100 bg-slate-50 space-y-2 flex-shrink-0">
          {selectedUser && (
            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg flex items-center gap-2">
              <svg className="w-4 h-4 text-yellow-600 flex-shrink-0" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                <path fillRule="evenodd" d="M2.25 12c0-6.215 5.034-11.25 11.25-11.25s11.25 5.035 11.25 11.25S19.465 23.25 12 23.25 2.25 18.215 2.25 12zm9-4.5a.75.75 0 01.75.75v4.94l3.72-3.72a.75.75 0 111.06 1.061l-5 5a.75.75 0 01-1.06 0l-5-5a.75.75 0 111.06-1.06l3.72 3.72V8.25a.75.75 0 01.75-.75z" clipRule="evenodd" />
              </svg>
              <span className="text-sm font-medium text-yellow-800">
                Ready to invite <strong>@{selectedUser.username}</strong>
              </span>
            </div>
          )}

          {message && (
            <div
              className={`p-3 rounded-lg text-sm font-medium transition-all duration-200 flex items-start gap-2 ${
                messageType === "success"
                  ? "bg-green-50 text-green-700 border border-green-200"
                  : messageType === "error"
                  ? "bg-red-50 text-red-700 border border-red-200"
                  : "bg-blue-50 text-blue-700 border border-blue-200"
              }`}
            >
              <span className="text-lg flex-shrink-0">
                {messageType === "success" ? "✓" : messageType === "error" ? "✕" : "ℹ"}
              </span>
              <span>{message}</span>
            </div>
          )}
        </div>

        {/* Footer - Buttons Fixed */}
        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex justify-between gap-3 flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 bg-gray-100 text-gray-900 rounded-lg border border-gray-200 hover:bg-gray-200 active:scale-95 transition-all duration-200 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>

          <button
            type="submit"
            onClick={handleSubmit}
            disabled={loading || !selectedUser}
            className="px-4 py-2 bg-yellow-500 hover:bg-yellow-400 active:scale-95 text-gray-900 rounded-lg font-bold transition-all duration-200 shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {loading ? (
              <>
                <span className="animate-spin">⏳</span>
                Sending...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5 11h-4v4h-2v-4H7v-2h4V7h2v4h4v2z" />
                </svg>
                Send Invite
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
