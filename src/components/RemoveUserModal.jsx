import { useState, useEffect, useRef } from "react"
import { supabase } from "../lib/supabase"
import { removeUserFromWorkspace, getWorkspaceMembers, updateUserWorkspaceRole } from "../lib/workspaceMembers"

// Helper function to get initials from name
function getInitials(name) {
  if (!name) return "U"
  return name
    .split(" ")
    .map(part => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)
}

// Helper function to get avatar background color based on username
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

export default function RemoveUserModal({ onClose, workspaceId, isOwner, onUserRemoved }) {
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [removingUserId, setRemovingUserId] = useState(null)
  const [confirmRemoveUser, setConfirmRemoveUser] = useState(null)
  const [message, setMessage] = useState(null)
  const [messageType, setMessageType] = useState(null)
  const [currentUserId, setCurrentUserId] = useState(null)
  const [updatingRoleUserId, setUpdatingRoleUserId] = useState(null)

  const isLoadingRef = useRef(false)
  const loadControllerRef = useRef(null)

  useEffect(() => {
    loadMembers()

    const handleMembershipChange = (event) => {
      console.log("[RemoveUserModal] workspaceMembershipChanged event received:", event.detail)
      if (event.detail?.workspaceId === workspaceId) {
        console.log("[RemoveUserModal] Refreshing members due to workspace change...")
        loadMembers()
      }
    }

    window.addEventListener("workspaceMembershipChanged", handleMembershipChange)

    return () => {
      window.removeEventListener("workspaceMembershipChanged", handleMembershipChange)
      if (loadControllerRef.current) {
        loadControllerRef.current.abort()
      }
    }
  }, [workspaceId])

  const loadMembers = async () => {
    if (isLoadingRef.current) {
      console.log("[RemoveUserModal] Load already in progress, skipping duplicate request")
      return
    }

    isLoadingRef.current = true
    loadControllerRef.current = new AbortController()

    try {
      setLoading(true)
      
      console.log("[RemoveUserModal] Starting member load for workspace:", workspaceId)
      await new Promise(resolve => setTimeout(resolve, 500))

      console.log("[RemoveUserModal] Step 1: Authenticating current user...")
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError || !user) {
        console.error("[RemoveUserModal] ❌ Auth error:", userError)
        setMessage("Authentication error")
        setMessageType("error")
        setLoading(false)
        return
      }
      setCurrentUserId(user.id)
      console.log("[RemoveUserModal] ✅ Current user authenticated")

      console.log("[RemoveUserModal] Step 2: Fetching workspace members with profiles...")
      const result = await getWorkspaceMembers(workspaceId)
      if (!result.success) {
        console.error("[RemoveUserModal] ❌ Failed to load members:", result.error)
        setMessage("Failed to load members")
        setMessageType("error")
        setLoading(false)
        return
      }

      const memberList = result.data || []
      console.log(`[RemoveUserModal] ✅ Fetched ${memberList.length} member(s)`)
      console.log("[RemoveUserModal] Full member data:", memberList)
      
      setMembers(memberList)
      setLoading(false)

      console.log(`[RemoveUserModal] ✅ Member load complete. Total: ${memberList.length}`)

    } catch (err) {
      console.error("[RemoveUserModal] ❌ Error loading members:", err)
      setMessage("Failed to load members")
      setMessageType("error")
      setLoading(false)
    } finally {
      isLoadingRef.current = false
    }
  }

  const handleRemoveClick = (memberUserId) => {
    setConfirmRemoveUser(memberUserId)
  }

  const handleConfirmRemove = async () => {
    if (!confirmRemoveUser) return

    setRemovingUserId(confirmRemoveUser)
    setMessage(null)

    try {
      console.log("[RemoveUserModal] Starting remove process for user:", confirmRemoveUser)

      console.log("[RemoveUserModal] Step 1: Removing user from workspace...")
      const result = await removeUserFromWorkspace(confirmRemoveUser, workspaceId)

      if (!result.success) {
        console.error("[RemoveUserModal] ❌ Remove failed:", result.error)
        setMessage(result.error || "Failed to remove user")
        setMessageType("error")
        setRemovingUserId(null)
        setConfirmRemoveUser(null)
        return
      }

      console.log("[RemoveUserModal] ✅ User removed from workspace")

      console.log("[RemoveUserModal] Step 2: Updating UI...")
      setMembers(members.filter(m => m.user_id !== confirmRemoveUser))
      
      const removedMember = members.find(m => m.user_id === confirmRemoveUser)
      const removedName = removedMember?.name || "User"
      
      setMessage(`✓ ${removedName} has been removed from the vault`)
      setMessageType("success")
      setRemovingUserId(null)
      setConfirmRemoveUser(null)

      console.log("[RemoveUserModal] ✅ UI updated")

      console.log("[RemoveUserModal] Step 3: Notifying parent and dispatching events...")
      if (onUserRemoved) {
        onUserRemoved()
      }
      window.dispatchEvent(new CustomEvent("workspaceMembershipChanged", { detail: { workspaceId } }))
      
      console.log("[RemoveUserModal] Step 4: Refreshing member list...")
      setTimeout(() => {
        loadMembers()
      }, 1000)

      console.log("[RemoveUserModal] ✅ REMOVAL COMPLETE - Modal remains open")
      // DO NOT close the modal - keep it open for further actions
    } catch (err) {
      console.error("[RemoveUserModal] ❌ Exception:", err)
      setMessage("An unexpected error occurred")
      setMessageType("error")
      setRemovingUserId(null)
      setConfirmRemoveUser(null)
    }
  }

  const handleCancelRemove = () => {
    setConfirmRemoveUser(null)
  }

  const handleRoleChange = async (memberUserId, newRole) => {
    setUpdatingRoleUserId(memberUserId)
    setMessage(null)

    try {
      console.log("[RemoveUserModal] Starting role change for user:", memberUserId, "new role:", newRole)

      console.log("[RemoveUserModal] Step 1: Updating user role...")
      const result = await updateUserWorkspaceRole(memberUserId, workspaceId, newRole)

      if (!result.success) {
        console.error("[RemoveUserModal] ❌ Role update failed:", result.error)
        setMessage(result.error || "Failed to update role")
        setMessageType("error")
        setUpdatingRoleUserId(null)
        return
      }

      console.log("[RemoveUserModal] ✅ User role updated")

      console.log("[RemoveUserModal] Step 2: Updating UI...")
      const member = members.find(m => m.user_id === memberUserId)
      const memberName = member?.name || "User"
      setMessage(`✓ ${memberName}'s role updated to ${newRole}`)
      setMessageType("success")
      setUpdatingRoleUserId(null)

      console.log("[RemoveUserModal] Step 3: Refreshing member list...")
      setTimeout(() => {
        loadMembers()
        
        if (onUserRemoved) {
          onUserRemoved()
        }
        window.dispatchEvent(new CustomEvent("workspaceMembershipChanged", { detail: { workspaceId } }))
      }, 1000)
    } catch (err) {
      console.error("[RemoveUserModal] ❌ Exception changing role:", err)
      setMessage("An unexpected error occurred")
      setMessageType("error")
      setUpdatingRoleUserId(null)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(0,0,0,0.72)] backdrop-blur-[6px]">
      <div className="flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-[#1F1F1F] bg-[#0D0D0D] shadow-[0_24px_80px_rgba(0,0,0,0.7)]">
        
        {/* Header */}
        <div className="border-b border-[#1F1F1F] bg-[#141414] px-8 py-6">
          <h2 className="text-2xl font-bold text-[#F5F0E8]">Vault Members</h2>
          <p className="mt-1 text-sm text-[#5C5248]">
            {isOwner ? "Manage member access and roles" : "Members in this vault"}
          </p>
        </div>

        {/* Message */}
        {message && (
          <div className="px-8 pt-6">
            <div
              className={`p-4 rounded-lg text-sm font-medium transition-all duration-200 ${
                messageType === "success"
                  ? "bg-green-50 text-green-700 border border-green-200 flex items-start gap-3"
                  : messageType === "error"
                  ? "bg-red-50 text-red-700 border border-red-200 flex items-start gap-3"
                  : "bg-blue-50 text-blue-700 border border-blue-200 flex items-start gap-3"
              }`}
            >
              <span className="text-lg flex-shrink-0">{messageType === "success" ? "✓" : messageType === "error" ? "✕" : "ℹ"}</span>
              <span>{message}</span>
            </div>
          </div>
        )}

        {/* Members List */}
        <div className="flex-1 overflow-y-auto px-8 py-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <div className="animate-spin mb-3">⏳</div>
                <p className="font-medium text-[#5C5248]">Loading members...</p>
              </div>
            </div>
          ) : members.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <p className="text-[#5C5248] text-lg">👥</p>
                <p className="mt-2 font-medium text-[#5C5248]">No members yet</p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {members.map((member) => {
                const isCurrentUser = member.user_id === currentUserId
                const isOwnerRole = member.role === "owner"
                const isRemoving = removingUserId === member.user_id
                const isUpdatingRole = updatingRoleUserId === member.user_id
                const isDisabled = isRemoving || isUpdatingRole || removingUserId !== null || updatingRoleUserId !== null
                
                return (
                  <div
                    key={member.user_id}
                    className={`relative group p-4 rounded-xl border transition-all duration-200 ${
                      isDisabled
                        ? "border-[#1F1F1F] bg-[#141414] opacity-60"
                        : "border-[#1F1F1F] bg-[#0D0D0D] hover:border-[#2A2A2A] hover:bg-[#141414]"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-4">
                      
                      {/* LEFT: Avatar + User Info */}
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        {/* Avatar */}
                        <div className={`flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center font-bold text-white shadow-sm ${getAvatarColor(member.username || "unknown")}`}>
                          {member.avatar_url ? (
                            <img
                              src={member.avatar_url}
                              alt={member.name}
                              className="w-full h-full rounded-full object-cover"
                            />
                          ) : (
                            getInitials(member.name)
                          )}
                        </div>

                        {/* User Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="truncate font-semibold text-[#F5F0E8]">
                              {member.name || "User"}
                            </p>
                            {isCurrentUser && (
                              <span className="flex-shrink-0 rounded-full border border-[rgba(244,180,0,0.3)] bg-[#2A2000] px-2 py-1 text-xs font-medium text-[#F4B400]">
                                You
                              </span>
                            )}
                          </div>
                          <p className="truncate text-sm text-[#5C5248]">
                            @{member.username || "unknown"}
                          </p>
                        </div>
                      </div>

                      {/* RIGHT: Role + Actions */}
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {isOwnerRole ? (
                          <span className="flex items-center gap-1.5 rounded-full border border-[rgba(244,180,0,0.25)] bg-[#2A2000] px-3 py-1.5 text-xs font-semibold text-[#F4B400]">
                            👑 Owner
                          </span>
                        ) : (
                          isOwner && !isCurrentUser && (
                            <select
                              value={member.role}
                              onChange={(e) => handleRoleChange(member.user_id, e.target.value)}
                              disabled={isDisabled}
                              className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-all border ${
                                isDisabled
                                  ? "cursor-not-allowed border-[#1F1F1F] bg-[#141414] text-[#5C5248]"
                                  : "cursor-pointer border-[#2A2A2A] bg-[#141414] text-[#F5F0E8] hover:border-[#F4B400]"
                              }`}
                            >
                              <option value="viewer">👁️ Viewer</option>
                              <option value="editor">✏️ Editor</option>
                              <option value="owner">👑 Owner</option>
                            </select>
                          )
                        )}

                        {/* Remove/Confirm Buttons */}
                        {isOwner && !isCurrentUser && !isOwnerRole && (
                          <>
                            {confirmRemoveUser === member.user_id ? (
                              <div className="flex gap-2">
                                <button
                                  onClick={handleCancelRemove}
                                  disabled={isRemoving}
                                  className="rounded-lg border border-[#1F1F1F] bg-[#141414] px-3 py-1.5 text-sm font-medium text-[#A09080] transition-all hover:border-[#2A2A2A] hover:text-[#F5F0E8] disabled:opacity-50"
                                >
                                  Cancel
                                </button>
                                <button
                                  onClick={handleConfirmRemove}
                                  disabled={isRemoving}
                                  className="flex items-center gap-1.5 rounded-lg bg-[#EF4444] px-3 py-1.5 text-sm font-medium text-white transition-all hover:bg-[#DC2626] disabled:opacity-50"
                                >
                                  {isRemoving && <span className="animate-spin text-xs">⏳</span>}
                                  Confirm
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => handleRemoveClick(member.user_id)}
                                disabled={isDisabled}
                                className="rounded-lg border border-[rgba(239,68,68,0.3)] bg-[rgba(239,68,68,0.12)] px-4 py-1.5 text-sm font-medium text-[#EF4444] transition-all hover:bg-[rgba(239,68,68,0.2)] disabled:opacity-50"
                              >
                                Remove
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 border-t border-[#1F1F1F] bg-[#141414] px-8 py-4">
          <button
            onClick={onClose}
            disabled={removingUserId !== null}
            className="rounded-lg border border-[#1F1F1F] bg-[#0D0D0D] px-4 py-2 font-medium text-[#A09080] transition-all hover:border-[#2A2A2A] hover:text-[#F5F0E8] disabled:opacity-50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

