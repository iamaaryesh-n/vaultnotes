import { supabase } from "./supabase"

/**
 * Add a user to a workspace with a specified role
 * Handles duplicates gracefully (no-op if user already exists in workspace)
 * 
 * @param {string} userId - The user's UUID
 * @param {string} workspaceId - The workspace's UUID
 * @param {string} role - The role to assign (owner, editor, viewer). Default: "editor"
 * @returns {Promise<{success: boolean, data?: object, error?: string}>}
 */
export async function addUserToWorkspace(userId, workspaceId, role = "editor") {
  // Validate inputs
  if (!userId || !workspaceId) {
    const error = "Missing required parameters: user_id and workspace_id are required"
    console.error("[addUserToWorkspace] Error:", error)
    return { success: false, error }
  }

  if (!["owner", "editor", "viewer"].includes(role)) {
    const error = `Invalid role: ${role}. Must be one of: owner, editor, viewer`
    console.error("[addUserToWorkspace] Error:", error)
    return { success: false, error }
  }

  try {
    console.log(`[addUserToWorkspace] Adding user ${userId} to workspace ${workspaceId} with role ${role}`)

    const { data, error } = await supabase
      .from("workspace_members")
      .insert({
        user_id: userId,
        workspace_id: workspaceId,
        role: role,
      })
      .select()

    // Handle duplicate key violation gracefully (unique constraint on workspace_id, user_id)
    if (error) {
      if (error.code === "23505") {
        // Unique violation - user already in workspace
        console.warn(`[addUserToWorkspace] User already exists in workspace. Skipping.`)
        return { success: true, data: { message: "User already exists in this workspace" } }
      }
      
      console.error("[addUserToWorkspace] Database error:", error.message)
      return { success: false, error: error.message }
    }

    console.log("[addUserToWorkspace] Successfully added user to workspace:", data)
    return { success: true, data }

  } catch (err) {
    console.error("[addUserToWorkspace] Unexpected error:", err)
    return { success: false, error: err.message }
  }
}

/**
 * Fetch all members of a workspace
 * 
 * @param {string} workspaceId - The workspace's UUID
 * @returns {Promise<{success: boolean, data?: array, error?: string}>}
 */
export async function getWorkspaceMembers(workspaceId) {
  // Validate input
  if (!workspaceId) {
    const error = "Missing required parameter: workspace_id is required"
    console.error("[getWorkspaceMembers] Error:", error)
    return { success: false, error, data: [] }
  }

  try {
    console.log(`[getWorkspaceMembers] Fetching members for workspace ${workspaceId}`)

    const { data, error } = await supabase
      .from("workspace_members")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: true })

    if (error) {
      console.error("[getWorkspaceMembers] Database error:", error.message)
      return { success: false, error: error.message, data: [] }
    }

    console.log(`[getWorkspaceMembers] Successfully fetched ${data.length} members:`, data)
    return { success: true, data }

  } catch (err) {
    console.error("[getWorkspaceMembers] Unexpected error:", err)
    return { success: false, error: err.message, data: [] }
  }
}

/**
 * Check if a user is a member of a workspace
 * 
 * @param {string} userId - The user's UUID
 * @param {string} workspaceId - The workspace's UUID
 * @returns {Promise<{success: boolean, isMember: boolean, role?: string, error?: string}>}
 */
export async function isUserWorkspaceMember(userId, workspaceId) {
  if (!userId || !workspaceId) {
    const error = "Missing required parameters: user_id and workspace_id are required"
    console.error("[isUserWorkspaceMember] Error:", error)
    return { success: false, isMember: false, error }
  }

  try {
    console.log(`[isUserWorkspaceMember] Checking if user ${userId} is member of workspace ${workspaceId}`)

    const { data, error } = await supabase
      .from("workspace_members")
      .select("role")
      .eq("user_id", userId)
      .eq("workspace_id", workspaceId)
      .single()

    if (error && error.code !== "PGRST116") {
      // PGRST116 = no rows found (expected case)
      console.error("[isUserWorkspaceMember] Database error:", error.message)
      return { success: false, isMember: false, error: error.message }
    }

    const isMember = !!data
    console.log(`[isUserWorkspaceMember] User is ${isMember ? "a member" : "not a member"} of workspace`)
    
    return { 
      success: true, 
      isMember, 
      role: data?.role 
    }

  } catch (err) {
    console.error("[isUserWorkspaceMember] Unexpected error:", err)
    return { success: false, isMember: false, error: err.message }
  }
}

/**
 * Remove a user from a workspace (deletes from both workspace_members and workspace_keys)
 * 
 * @param {string} userId - The user's UUID
 * @param {string} workspaceId - The workspace's UUID
 * @returns {Promise<{success: boolean, data?: object, error?: string}>}
 */
export async function removeUserFromWorkspace(userId, workspaceId) {
  if (!userId || !workspaceId) {
    const error = "Missing required parameters: user_id and workspace_id are required"
    console.error("[removeUserFromWorkspace] Error:", error)
    return { success: false, error }
  }

  try {
    console.log(`[removeUserFromWorkspace] Removing user ${userId} from workspace ${workspaceId}`)

    // Step 1: Delete from workspace_members
    const { error: memberError } = await supabase
      .from("workspace_members")
      .delete()
      .eq("user_id", userId)
      .eq("workspace_id", workspaceId)

    if (memberError) {
      console.error("[removeUserFromWorkspace] Failed to remove from workspace_members:", memberError.message)
      return { success: false, error: memberError.message }
    }

    console.log("[removeUserFromWorkspace] Successfully removed from workspace_members")

    // Step 2: Delete from workspace_keys
    const { error: keyError } = await supabase
      .from("workspace_keys")
      .delete()
      .eq("user_id", userId)
      .eq("workspace_id", workspaceId)

    if (keyError) {
      console.error("[removeUserFromWorkspace] Failed to remove from workspace_keys:", keyError.message)
      // Don't fail completely - member already removed, just log the key deletion issue
      console.error("[removeUserFromWorkspace] WARNING: User removed from workspace but key cleanup may have failed")
    } else {
      console.log("[removeUserFromWorkspace] Successfully removed from workspace_keys")
    }

    console.log("[removeUserFromWorkspace] Successfully removed user from workspace and keys")
    return { success: true, data: { removed_from_members: true } }

  } catch (err) {
    console.error("[removeUserFromWorkspace] Unexpected error:", err)
    return { success: false, error: err.message }
  }
}

/**
 * Update a user's role in a workspace
 * 
 * @param {string} userId - The user's UUID
 * @param {string} workspaceId - The workspace's UUID
 * @param {string} newRole - The new role (owner, editor, viewer)
 * @returns {Promise<{success: boolean, data?: object, error?: string}>}
 */
export async function updateUserWorkspaceRole(userId, workspaceId, newRole) {
  if (!userId || !workspaceId || !newRole) {
    const error = "Missing required parameters: user_id, workspace_id, and newRole are required"
    console.error("[updateUserWorkspaceRole] Error:", error)
    return { success: false, error }
  }

  if (!["owner", "editor", "viewer"].includes(newRole)) {
    const error = `Invalid role: ${newRole}. Must be one of: owner, editor, viewer`
    console.error("[updateUserWorkspaceRole] Error:", error)
    return { success: false, error }
  }

  try {
    console.log(`[updateUserWorkspaceRole] Updating user ${userId} role to ${newRole} in workspace ${workspaceId}`)

    const { data, error } = await supabase
      .from("workspace_members")
      .update({ role: newRole })
      .eq("user_id", userId)
      .eq("workspace_id", workspaceId)
      .select()

    if (error) {
      console.error("[updateUserWorkspaceRole] Database error:", error.message)
      return { success: false, error: error.message }
    }

    console.log("[updateUserWorkspaceRole] Successfully updated user role:", data)
    return { success: true, data }

  } catch (err) {
    console.error("[updateUserWorkspaceRole] Unexpected error:", err)
    return { success: false, error: err.message }
  }
}
