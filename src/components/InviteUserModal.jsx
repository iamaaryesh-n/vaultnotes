import { useState, useRef } from "react"
import { supabase } from "../lib/supabase"
import { addUserToWorkspace } from "../lib/workspaceMembers"

export default function InviteUserModal({ onClose, workspaceId, onSuccess }) {
  const [email, setEmail] = useState("")
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState(null)
  const [messageType, setMessageType] = useState(null)
  
  // Track abort controller for cleanup
  const inviteControllerRef = useRef(null)

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!email.trim()) {
      setMessage("Please enter an email address")
      setMessageType("error")
      return
    }

    setLoading(true)
    setMessage(null)

    // Create new abort controller for this invite
    inviteControllerRef.current = new AbortController()

    try {
      console.log("[InviteUserModal] Starting invite process for:", email.trim())

      // Step 1: Authenticate current user
      console.log("[InviteUserModal] Step 1: Authenticating current user...")
      const { data: authData, error: authError } = await supabase.auth.getUser()
      const currentUser = authData?.user
      if (authError || !currentUser) {
        console.error("[InviteUserModal] ❌ Authentication error:", authError)
        setMessage("Authentication error. Please try again.")
        setMessageType("error")
        setLoading(false)
        return
      }

      console.log("[InviteUserModal] ✅ Current user authenticated")

      // Step 2: Find user by email
      console.log("[InviteUserModal] Step 2: Looking up user by email...")
      const { data: userData, error: userError } = await supabase
        .from("profiles")
        .select("id, email")
        .eq("email", email.trim())
        .maybeSingle()

      if (userError) {
        console.error("[InviteUserModal] ❌ Email lookup error:", userError)
        setMessage("Email lookup failed. Please try again.")
        setMessageType("error")
        setLoading(false)
        return
      }

      if (!userData?.id) {
        console.error("[InviteUserModal] ❌ User not found:", email.trim())
        setMessage("User not found")
        setMessageType("error")
        setLoading(false)
        return
      }

      const invitedUserId = userData.id
      console.log("[InviteUserModal] ✅ User found:", invitedUserId)

      // Step 3: Fetch current user's workspace encryption key
      console.log("[InviteUserModal] Step 3: Fetching workspace encryption key...")
      const { data: keyData, error: keyError } = await supabase
        .from("workspace_keys")
        .select("encrypted_key")
        .eq("workspace_id", workspaceId)
        .eq("user_id", currentUser.id)
        .maybeSingle()

      if (keyError) {
        console.error("[InviteUserModal] ❌ Key fetch error:", keyError)
        setMessage("Failed to fetch encryption key")
        setMessageType("error")
        setLoading(false)
        return
      }

      if (!keyData?.encrypted_key) {
        console.error("[InviteUserModal] ❌ No encryption key found for workspace")
        setMessage("Failed to fetch encryption key")
        setMessageType("error")
        setLoading(false)
        return
      }

      const workspaceKey = keyData.encrypted_key
      console.log("[InviteUserModal] ✅ Encryption key fetched")

      // Step 4: Add user to workspace_members
      console.log("[InviteUserModal] Step 4: Adding user to workspace_members...")
      const result = await addUserToWorkspace(invitedUserId, workspaceId, "editor")
      if (!result.success) {
        console.error("[InviteUserModal] ❌ Failed to add user to workspace:", result.error)
        setMessage(result.error || "Failed to add user")
        setMessageType("error")
        setLoading(false)
        return
      }

      console.log("[InviteUserModal] ✅ User added to workspace_members")

      // Step 5: Check if workspace_keys entry already exists
      console.log("[InviteUserModal] Step 5: Checking for existing encryption key...")
      const { data: existingKey, error: existingKeyError } = await supabase
        .from("workspace_keys")
        .select("id")
        .eq("workspace_id", workspaceId)
        .eq("user_id", invitedUserId)
        .maybeSingle()

      if (existingKeyError) {
        console.warn("[InviteUserModal] Warning checking existing key:", existingKeyError)
        // Continue anyway - might be permission issue
      }

      if (existingKey?.id) {
        console.log("[InviteUserModal] ℹ️ Key already exists for this user, skipping insert")
        setMessage(`✓ ${email.trim()} added successfully! (Key already set up)`)
        setMessageType("success")
      } else {
        // Step 6: Insert encryption key
        console.log("[InviteUserModal] Step 6: Inserting encryption key for invited user...")
        const { error: keyInsertError } = await supabase
          .from("workspace_keys")
          .insert({
            user_id: invitedUserId,
            workspace_id: workspaceId,
            encrypted_key: workspaceKey,
          })

        if (keyInsertError) {
          console.error("[InviteUserModal] ❌ Failed to insert encryption key:", keyInsertError)
          setMessage(`Failed to setup encryption key: ${keyInsertError.message}`)
          setMessageType("error")
          setLoading(false)
          return
        }

        console.log("[InviteUserModal] ✅ Encryption key inserted")
        setMessage(`✓ ${email.trim()} added successfully!`)
        setMessageType("success")
      }

      console.log("[InviteUserModal] ✅ Invite process completed successfully")
      
      // Notify parent about membership change
      window.dispatchEvent(new CustomEvent("workspaceMembershipChanged", { detail: { workspaceId } }))

      setTimeout(() => {
        onClose()
        if (onSuccess) onSuccess()
      }, 1200)
    } catch (error) {
      console.error("[InviteUserModal] ❌ Unexpected error:", error)
      setMessage("An error occurred. Please try again.")
      setMessageType("error")
    } finally {
      setLoading(false)
      inviteControllerRef.current = null
    }
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
              {loading ? "Adding..." : "Add User"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
