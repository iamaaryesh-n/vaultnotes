import { useState, useEffect, useRef } from "react"
import { supabase } from "../lib/supabase"
import { removeUserFromWorkspace, getWorkspaceMembers, updateUserWorkspaceRole } from "../lib/workspaceMembers"

export default function RemoveUserModal({ onClose, workspaceId, isOwner, onUserRemoved }) {
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [removingUserId, setRemovingUserId] = useState(null)
  const [confirmRemoveUser, setConfirmRemoveUser] = useState(null)
  const [message, setMessage] = useState(null)
  const [messageType, setMessageType] = useState(null)
  const [currentUserId, setCurrentUserId] = useState(null)
  const [updatingRoleUserId, setUpdatingRoleUserId] = useState(null)

  // Track to prevent concurrent member loads
  const isLoadingRef = useRef(false)
  const loadControllerRef = useRef(null)

  useEffect(() => {
    loadMembers()

    // 🎯 Listen for membership changes (when new users are invited)
    const handleMembershipChange = (event) => {
      console.log("[RemoveUserModal] workspaceMembershipChanged event received:", event.detail)
      if (event.detail?.workspaceId === workspaceId) {
        console.log("[RemoveUserModal] Refreshing members due to workspace change...")
        loadMembers()
      }
    }

    window.addEventListener("workspaceMembershipChanged", handleMembershipChange)

    return () => {
      // Cleanup: remove event listener and cancel pending load on unmount
      window.removeEventListener("workspaceMembershipChanged", handleMembershipChange)
      if (loadControllerRef.current) {
        loadControllerRef.current.abort()
      }
    }
  }, [workspaceId])

  const loadMembers = async () => {
    // Prevent concurrent loads
    if (isLoadingRef.current) {
      console.log("[RemoveUserModal] Load already in progress, skipping duplicate request")
      return
    }

    isLoadingRef.current = true
    loadControllerRef.current = new AbortController()

    try {
      setLoading(true)
      
      console.log("[RemoveUserModal] Starting member load for workspace:", workspaceId)

      // Small delay to ensure database has committed new members
      await new Promise(resolve => setTimeout(resolve, 500))

      // Step 1: Get current user
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

      // Step 2: Fetch workspace members with profiles (LEFT JOIN)
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
      
      // NO filtering - accept all members including those with null profiles
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

      // Step 1: Remove user from workspace
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

      // Step 2: Update UI
      console.log("[RemoveUserModal] Step 2: Updating UI...")
      setMembers(members.filter(m => m.user_id !== confirmRemoveUser))
      
      const removedProfile = memberProfiles[confirmRemoveUser]
      const removedEmail = removedProfile?.email || "User"
      
      setMessage(`✓ ${removedEmail} has been removed from the workspace`)
      setMessageType("success")
      setRemovingUserId(null)
      setConfirmRemoveUser(null)

      console.log("[RemoveUserModal] ✅ UI updated")

      // Step 3: Notify and refresh
      console.log("[RemoveUserModal] Step 3: Notifying parent and dispatching events...")
      if (onUserRemoved) {
        onUserRemoved()
      }
      window.dispatchEvent(new CustomEvent("workspaceMembershipChanged", { detail: { workspaceId } }))
      
      // Step 4: Refresh member list after 1 second
      console.log("[RemoveUserModal] Step 4: Refreshing member list...")
      setTimeout(() => {
        loadMembers()
      }, 1000)

      // Close after 2 seconds
      setTimeout(() => {
        onClose()
      }, 2000)
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

      // Step 1: Update role
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

      // Step 2: Update UI with success message
      console.log("[RemoveUserModal] Step 2: Updating UI...")
      const member = members.find(m => m.user_id === memberUserId)
      const memberEmail = member?.email || "User"
      setMessage(`✓ ${memberEmail}'s role updated to ${newRole}`)
      setMessageType("success")
      setUpdatingRoleUserId(null)

      // Step 3: Refresh member list after 1 second
      console.log("[RemoveUserModal] Step 3: Refreshing member list...")
      setTimeout(() => {
        loadMembers()
        
        // Notify parent
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
    <div className="fixed inset-0 bg-gray-900 bg-opacity-30 flex items-center justify-center z-50 fade-in">
      <div className="bg-white p-8 rounded-xl w-full max-w-2xl space-y-4 shadow-lg border border-gray-200 max-h-96 overflow-y-auto">
        <h2 className="text-xl font-bold text-gray-900">Workspace Members</h2>
        <p className="text-slate-500 text-sm">
          {isOwner ? "Manage workspace members and their access" : "Members in this workspace"}
        </p>

        {message && (
          <div
            className={`p-3 rounded-lg text-sm font-medium transition-all duration-200 ${
              messageType === "success"
                ? "bg-green-50 text-green-700 border border-green-200"
                : messageType === "error"
                ? "bg-red-50 text-red-700 border border-red-200"
                : "bg-blue-50 text-blue-700 border border-blue-200"
            }`}
          >
            {message}
          </div>
        )}

        {loading ? (
          <div className="text-center py-8 text-slate-500">Loading members...</div>
        ) : members.length === 0 ? (
          <div className="text-center py-8 text-slate-500">No members in this workspace</div>
        ) : (
          <div className="space-y-2">
            {members.map((member) => {
              const isCurrentUser = member.user_id === currentUserId
              const isOwnerRole = member.role === "owner"
              const email = member.email || "Unknown User"
              
              return (
                <div
                  key={member.user_id}
                  className="flex items-center justify-between p-3 rounded-lg bg-gray-50 border border-gray-200 hover:bg-gray-100 transition-colors"
                >
                  <div className="flex-1">
                    <p className="font-medium text-gray-900">
                      {email}
                      {isCurrentUser && <span className="text-xs text-slate-500 ml-2">(You)</span>}
                    </p>
                    <p className="text-sm text-slate-600">
                      <span className={isOwnerRole ? "font-semibold text-blue-600" : "text-slate-500"}>
                        {member.role}
                      </span>
                    </p>
                  </div>

                  {isOwner && !isCurrentUser && !isOwnerRole && (
                    <div className="flex gap-2 items-center">
                      <select
                        value={member.role}
                        onChange={(e) => handleRoleChange(member.user_id, e.target.value)}
                        disabled={updatingRoleUserId === member.user_id || removingUserId === member.user_id}
                        className="px-3 py-1 text-sm bg-white border border-slate-300 rounded font-medium text-gray-900 hover:border-slate-400 transition-all disabled:opacity-50 cursor-pointer"
                      >
                        <option value="viewer">👁️ Viewer</option>
                        <option value="editor">✏️ Editor</option>
                        <option value="owner">👑 Owner</option>
                      </select>
                      {confirmRemoveUser === member.user_id ? (
                        <div className="flex gap-2">
                          <button
                            onClick={handleCancelRemove}
                            disabled={removingUserId === member.user_id}
                            className="px-3 py-1 text-sm bg-gray-200 text-gray-900 rounded font-medium hover:bg-gray-300 transition-all disabled:opacity-50"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={handleConfirmRemove}
                            disabled={removingUserId === member.user_id}
                            className="px-3 py-1 text-sm bg-red-500 text-white rounded font-medium hover:bg-red-600 transition-all disabled:opacity-50 flex items-center gap-1"
                          >
                            {removingUserId === member.user_id && <span className="animate-spin">⏳</span>}
                            Confirm
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => handleRemoveClick(member.user_id)}
                          disabled={removingUserId !== null || updatingRoleUserId !== null}
                          className="px-4 py-2 text-sm bg-red-100 text-red-700 rounded-lg font-medium hover:bg-red-200 transition-all disabled:opacity-50"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  )}

                  {isOwnerRole && (
                    <span className="text-xs bg-blue-100 text-blue-700 px-3 py-1 rounded-full font-medium">
                      Owner
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        )}

        <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
          <button
            onClick={onClose}
            disabled={removingUserId !== null}
            className="px-4 py-2 bg-gray-100 text-gray-900 rounded-lg border border-gray-200 hover:bg-gray-200 active:scale-95 transition-all font-medium disabled:opacity-50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

