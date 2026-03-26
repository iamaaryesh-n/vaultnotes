import { useState, useEffect } from "react"
import { supabase } from "../lib/supabase"
import { removeUserFromWorkspace, getWorkspaceMembers } from "../lib/workspaceMembers"

export default function RemoveUserModal({ onClose, workspaceId, isOwner, onUserRemoved }) {
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [memberProfiles, setMemberProfiles] = useState({})
  const [removingUserId, setRemovingUserId] = useState(null)
  const [confirmRemoveUser, setConfirmRemoveUser] = useState(null)
  const [message, setMessage] = useState(null)
  const [messageType, setMessageType] = useState(null)
  const [currentUserId, setCurrentUserId] = useState(null)

  useEffect(() => {
    loadMembers()
  }, [workspaceId])

  const loadMembers = async () => {
    try {
      // Get current user
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError || !user) {
        setMessage("Authentication error")
        setMessageType("error")
        setLoading(false)
        return
      }
      setCurrentUserId(user.id)

      // Fetch workspace members
      const result = await getWorkspaceMembers(workspaceId)
      if (!result.success) {
        console.error("[RemoveUserModal] Failed to load members:", result.error)
        setMessage("Failed to load members")
        setMessageType("error")
        setLoading(false)
        return
      }

      setMembers(result.data || [])

      // Fetch profile info for all members
      if (result.data && result.data.length > 0) {
        const userIds = result.data.map(m => m.user_id)
        const { data: profiles, error: profileError } = await supabase
          .from("profiles")
          .select("id, email, full_name")
          .in("id", userIds)

        if (!profileError && profiles) {
          const profileMap = {}
          profiles.forEach(p => {
            profileMap[p.id] = p
          })
          setMemberProfiles(profileMap)
        }
      }

      setLoading(false)
    } catch (err) {
      console.error("[RemoveUserModal] Exception loading members:", err)
      setMessage("An error occurred")
      setMessageType("error")
      setLoading(false)
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
      const result = await removeUserFromWorkspace(confirmRemoveUser, workspaceId)

      if (!result.success) {
        console.error("[RemoveUserModal] Remove failed:", result.error)
        setMessage(result.error || "Failed to remove user")
        setMessageType("error")
        setRemovingUserId(null)
        setConfirmRemoveUser(null)
        return
      }

      // Update UI to remove user from list
      setMembers(members.filter(m => m.user_id !== confirmRemoveUser))
      
      const removedProfile = memberProfiles[confirmRemoveUser]
      const removedEmail = removedProfile?.email || "User"
      
      setMessage(`✓ ${removedEmail} has been removed from the workspace`)
      setMessageType("success")
      setRemovingUserId(null)
      setConfirmRemoveUser(null)

      // Notify parent to refresh
      if (onUserRemoved) {
        onUserRemoved()
      }

      // Close after 2 seconds
      setTimeout(() => {
        onClose()
      }, 2000)
    } catch (err) {
      console.error("[RemoveUserModal] Exception:", err)
      setMessage("An unexpected error occurred")
      setMessageType("error")
      setRemovingUserId(null)
      setConfirmRemoveUser(null)
    }
  }

  const handleCancelRemove = () => {
    setConfirmRemoveUser(null)
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
              const profile = memberProfiles[member.user_id]
              const isCurrentUser = member.user_id === currentUserId
              const isOwnerRole = member.role === "owner"
              
              return (
                <div
                  key={member.user_id}
                  className="flex items-center justify-between p-3 rounded-lg bg-gray-50 border border-gray-200 hover:bg-gray-100 transition-colors"
                >
                  <div className="flex-1">
                    <p className="font-medium text-gray-900">
                      {profile?.email || "Unknown User"}
                      {isCurrentUser && <span className="text-xs text-slate-500 ml-2">(You)</span>}
                    </p>
                    <p className="text-sm text-slate-600">
                      {profile?.full_name && `${profile.full_name} • `}
                      <span className={isOwnerRole ? "font-semibold text-blue-600" : "text-slate-500"}>
                        {member.role}
                      </span>
                    </p>
                  </div>

                  {isOwner && !isCurrentUser && !isOwnerRole && (
                    <>
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
                          disabled={removingUserId !== null}
                          className="px-4 py-2 text-sm bg-red-100 text-red-700 rounded-lg font-medium hover:bg-red-200 transition-all disabled:opacity-50"
                        >
                          Remove
                        </button>
                      )}
                    </>
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
