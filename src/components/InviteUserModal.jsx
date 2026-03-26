import { useState } from "react"
import { supabase } from "../lib/supabase"
import { addUserToWorkspace } from "../lib/workspaceMembers"

export default function InviteUserModal({ onClose, workspaceId, onSuccess }) {
  const [email, setEmail] = useState("")
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState(null)
  const [messageType, setMessageType] = useState(null) // "success", "error", "info"

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    if (!email.trim()) {
      setMessage("Please enter an email address")
      setMessageType("error")
      return
    }

    setLoading(true)
    setMessage(null)

    try {
      // Get current user
      const { data: { user: currentUser }, error: userError } = await supabase.auth.getUser()
      if (userError || !currentUser) {
        console.error("[InviteUserModal] Auth error:", userError)
        setMessage("Authentication error. Please try again.")
        setMessageType("error")
        setLoading(false)
        return
      }
      
      const currentUserId = currentUser.id
      console.log("[InviteUserModal] Current user ID:", currentUserId)

      // Step 1: Find user by email
      console.log("[InviteUserModal] Looking up user:", email)
      
      const { data: userData, error: lookupError } = await supabase
        .from("profiles")
        .select("id, email")
        .eq("email", email)
        .single()

      if (lookupError || !userData) {
        console.log("[InviteUserModal] User not found:", email)
        setMessage("User not found")
        setMessageType("error")
        setLoading(false)
        return
      }

      const invitedUserId = userData.id
      console.log("[InviteUserModal] Found user ID:", invitedUserId)

      // Step 2: Fetch current user's workspace encryption key
      console.log("[InviteUserModal] Fetching workspace encryption key")
      console.log("Fetching key with:", workspaceId, currentUserId)
      const { data: keyData, error: keyFetchError } = await supabase
        .from("workspace_keys")
        .select("encrypted_key")
        .eq("workspace_id", workspaceId)
        .eq("user_id", currentUserId)
        .maybeSingle()

      if (keyFetchError) {
        console.error("[InviteUserModal] Error fetching workspace key:", keyFetchError)
        setMessage("Failed to fetch encryption key")
        setMessageType("error")
        setLoading(false)
        return
      }

      if (!keyData || !keyData.encrypted_key) {
        console.error("[InviteUserModal] No workspace key found for current user")
        setMessage("Failed to fetch encryption key")
        setMessageType("error")
        setLoading(false)
        return
      }

      const workspaceKey = keyData.encrypted_key
      console.log("[InviteUserModal] Successfully fetched workspace key")

      // Step 3: Add user to workspace_members
      console.log("[InviteUserModal] Adding user to workspace")
      const result = await addUserToWorkspace(invitedUserId, workspaceId, "editor")

      if (!result.success) {
        console.error("[InviteUserModal] Add failed:", result.error)
        setMessage(result.error || "Failed to add user")
        setMessageType("error")
        setLoading(false)
        return
      }

      // Check if user was already a member
      const userWasAlreadyMember = result.data?.message?.includes("already exists")
      console.log("[InviteUserModal] DEBUG: userWasAlreadyMember =", userWasAlreadyMember)
      
      if (userWasAlreadyMember) {
        console.log("[InviteUserModal] User already a member of workspace")
      } else {
        console.log("[InviteUserModal] User successfully added to workspace")
      }

      console.log("[InviteUserModal] CONTINUING TO KEY CHECK (not returning early)")
      
      // Step 4: Ensure workspace_keys entry exists for this user
      // Even if user already existed, they might not have a key (so add one)
      console.log("[InviteUserModal] Checking workspace_keys for user")
      console.log("[InviteUserModal] DEBUG: invitedUserId =", invitedUserId, "workspaceId =", workspaceId)
      
      const { data: existingKey, error: keyCheckError } = await supabase
        .from("workspace_keys")
        .select("id")
        .eq("workspace_id", workspaceId)
        .eq("user_id", invitedUserId)
        .maybeSingle()

      if (keyCheckError) {
        console.error("[InviteUserModal] Error checking existing key:", keyCheckError)
        // Continue anyway - might be a permission issue, try to insert
      }

      if (existingKey?.id) {
        console.log("[InviteUserModal] Key already exists for user, skipping insert")
        setMessage(`✓ ${email} is ready to access! (Key already set up)`)
        setMessageType("success")
      } else {
        // Key doesn't exist, insert it
        console.log("[InviteUserModal] Adding user to workspace_keys")
        console.log("Inserting key for:", invitedUserId, workspaceId, workspaceKey)
        
        const { error: keyInsertError } = await supabase
          .from("workspace_keys")
          .insert({
            user_id: invitedUserId,
            workspace_id: workspaceId,
            encrypted_key: workspaceKey
          })

        if (keyInsertError) {
          console.error("KEY INSERT FAILED:", keyInsertError)
          const errorMsg = `Failed to setup encryption key: ${keyInsertError.message}`
          console.error("[InviteUserModal]", errorMsg)
          setMessage(errorMsg)
          setMessageType("error")
          setLoading(false)
          alert(keyInsertError.message)
          return
        }

        console.log("[InviteUserModal] Successfully added user to workspace_keys")
        setMessage(`✓ ${email} added successfully!`)
        setMessageType("success")
      }

      setTimeout(() => {
        onClose()
        if (onSuccess) onSuccess()
      }, 2000)
    } catch (err) {
      console.error("[InviteUserModal] EXCEPTION CAUGHT:", err)
      console.error("[InviteUserModal] Stack:", err.stack)
      setMessage("An error occurred. Please try again.")
      setMessageType("error")
    }

    setLoading(false)
  }

  return (
    <div className="fixed inset-0 bg-gray-900 bg-opacity-30 flex items-center justify-center z-50 fade-in">
      <div className="bg-white p-8 rounded-xl w-96 space-y-4 shadow-lg border border-gray-200">
        <h2 className="text-xl font-bold text-gray-900">Invite User</h2>
        <p className="text-slate-500 text-sm">Add a user to this workspace by their email address</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="email"
            placeholder="Enter email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
            autoFocus
            className="w-full p-3 rounded-lg bg-white text-gray-900 border border-slate-200 placeholder-slate-400 focus:outline-none focus:border-yellow-400 focus:ring-2 focus:ring-yellow-400/40 transition-all duration-200 disabled:bg-slate-50 disabled:opacity-60"
          />

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

          <div className="flex justify-between gap-3 pt-2">
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
              disabled={loading}
              className="px-4 py-2 bg-yellow-500 hover:bg-yellow-400 active:scale-95 text-gray-900 rounded-lg font-bold transition-all duration-200 shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {loading ? (
                <>
                  <span className="animate-spin">⏳</span>
                  Adding...
                </>
              ) : (
                "Add User"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
