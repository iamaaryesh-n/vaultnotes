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
    console.log("[addUserToWorkspace] ========== USING RLS-BYPASS FUNCTION ==========")
    console.log("[addUserToWorkspace] Parameters:")
    console.log("  - workspace_id:", workspaceId)
    console.log("  - user_id:", userId)
    console.log("  - role:", role)

    // Call the RLS-bypass function
    const { data, error } = await supabase
      .rpc('add_user_to_workspace_safe', {
        p_workspace_id: workspaceId,
        p_user_id: userId,
        p_role: role
      })

    if (error) {
      console.error("[addUserToWorkspace] ❌ Function error:", error)
      return { success: false, error: error.message }
    }

    console.log("[addUserToWorkspace] Function result:", data)

    // Check if the function returned success
    if (data && data[0]) {
      if (data[0].success) {
        console.log("[addUserToWorkspace] ✅ User added successfully:", data[0].message)
        return { success: true, data }
      } else {
        console.warn("[addUserToWorkspace] ⚠️ Function returned error:", data[0].message)
        return { success: false, error: data[0].message }
      }
    }

    console.log("[addUserToWorkspace] ✅ Operation completed")
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
    console.log("[getWorkspaceMembers] Fetching all members...")

    // Step 1: Fetch all workspace_members (NO filtering)
    const { data: members, error: memberError } = await supabase
      .from("workspace_members")
      .select("user_id, workspace_id, role, created_at")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: true })

    if (memberError) {
      console.error("[getWorkspaceMembers] Error fetching members:", memberError.message)
      return { success: false, error: memberError.message, data: [] }
    }

    console.log(`[getWorkspaceMembers] Fetched ${members?.length || 0} member(s)`)

    // Step 2: If we have members, fetch their profiles
    let profileMap = {}
    if (members && members.length > 0) {
      const userIds = members.map(m => m.user_id)
      console.log("[getWorkspaceMembers] Fetching profiles for user IDs:", userIds)
      
      const { data: profiles, error: profileError } = await supabase
        .from("profiles")
        .select("id, email")
        .in("id", userIds)

      if (profileError) {
        console.warn("[getWorkspaceMembers] Warning fetching profiles:", profileError)
        // Continue anyway - members will have "Unknown User" as fallback
      } else if (profiles && profiles.length > 0) {
        console.log(`[getWorkspaceMembers] Fetched ${profiles.length} profile(s)`)
        profiles.forEach(p => {
          profileMap[p.id] = p.email
        })
      }
    }

    // Step 3: Join members with profile emails (use fallback if not found)
    const allMembers = (members || []).map(member => ({
      ...member,
      email: profileMap[member.user_id] || "Unknown User"
    }))

    console.log(`[getWorkspaceMembers] Final result: ${allMembers.length} member(s)`)
    console.log("[getWorkspaceMembers] Full data:", JSON.stringify(allMembers, null, 2))
    
    allMembers.forEach((m, idx) => {
      console.log(`  [${idx}] user_id: ${m.user_id}, email: ${m.email}, role: ${m.role}`)
    })

    return { success: true, data: allMembers }

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

    const { data, error } = await supabase
      .from("workspace_members")
      .select("role")
      .eq("user_id", userId)
      .eq("workspace_id", workspaceId)
      .maybeSingle()

    if (error && error.code !== "PGRST116") {
      // PGRST116 = no rows found (expected case)
      console.error("[isUserWorkspaceMember] Database error:", error.message)
      return { success: false, isMember: false, error: error.message }
    }

    const isMember = !!data
    
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
 * Verify user has BOTH membership AND encryption key for workspace
 * @param {string} userId - The user's UUID
 * @param {string} workspaceId - The workspace's UUID
 * @returns {Promise<{success: boolean, isMember: boolean, hasKey: boolean, role?: string, error?: string}>}
 */
export async function verifyWorkspaceAccess(userId, workspaceId) {
  if (!userId || !workspaceId) {
    const error = "Missing required parameters: user_id and workspace_id are required"
    console.error("[verifyWorkspaceAccess] Error:", error)
    return { success: false, isMember: false, hasKey: false, error }
  }

  try {

    // Check membership
    const { data: memberData, error: memberError } = await supabase
      .from("workspace_members")
      .select("role")
      .eq("user_id", userId)
      .eq("workspace_id", workspaceId)
      .maybeSingle()

    const isMember = !!memberData
    const role = memberData?.role

    if (isMember) {
    }

    // Check encryption key
    const { data: keyData, error: keyError } = await supabase
      .from("workspace_keys")
      .select("id")
      .eq("user_id", userId)
      .eq("workspace_id", workspaceId)
      .maybeSingle()

    const hasKey = !!keyData

    if (hasKey) {
    }

    const allGood = isMember && hasKey

    return { 
      success: true, 
      isMember, 
      hasKey,
      role,
      allGood
    }

  } catch (err) {
    console.error("[verifyWorkspaceAccess] Unexpected error:", err)
    return { success: false, isMember: false, hasKey: false, error: err.message }
  }
}

/**
 * Check if user has encryption key for workspace
 * @param {string} userId - The user's UUID
 * @param {string} workspaceId - The workspace's UUID
 * @returns {Promise<{success: boolean, hasKey: boolean, error?: string}>}
 */
export async function hasWorkspaceKey(userId, workspaceId) {
  if (!userId || !workspaceId) {
    const error = "Missing required parameters: user_id and workspace_id are required"
    console.error("[hasWorkspaceKey] Error:", error)
    return { success: false, hasKey: false, error }
  }

  try {

    const { data, error } = await supabase
      .from("workspace_keys")
      .select("id")
      .eq("user_id", userId)
      .eq("workspace_id", workspaceId)
      .maybeSingle()

    const hasKey = !!data

    return { success: true, hasKey }

  } catch (err) {
    console.error("[hasWorkspaceKey] Unexpected error:", err)
    return { success: false, hasKey: false, error: err.message }
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
    }

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

    // Update without select() to avoid RLS permission issues
    const { error } = await supabase
      .from("workspace_members")
      .update({ role: newRole })
      .eq("workspace_id", workspaceId)
      .eq("user_id", userId)

    if (error) {
      console.error("[updateUserWorkspaceRole] Database error:", error.message)
      console.error("[updateUserWorkspaceRole] Full error details:", error)
      return { success: false, error: error.message }
    }


    // Verify the update by fetching the updated record
    const { data: verifyData, error: verifyError } = await supabase
      .from("workspace_members")
      .select("user_id, workspace_id, role")
      .eq("workspace_id", workspaceId)
      .eq("user_id", userId)
      .single()

    if (verifyError) {
      console.error("[updateUserWorkspaceRole] Failed to verify update:", verifyError.message)
      return { success: false, error: `Update completed but verification failed: ${verifyError.message}` }
    }

    if (verifyData.role !== newRole) {
      console.error("[updateUserWorkspaceRole] Role verification failed - role did not change!")
      console.error("[updateUserWorkspaceRole] Expected role:", newRole, "Actual role:", verifyData.role)
      return { success: false, error: `Role update failed - role did not change to ${newRole}` }
    }

    return { success: true, data: verifyData }

  } catch (err) {
    console.error("[updateUserWorkspaceRole] Unexpected error:", err)
    return { success: false, error: err.message }
  }
}

/**
 * Check if a user is the sole owner of a workspace
 * @param {string} userId - The user's UUID
 * @param {string} workspaceId - The workspace's UUID
 * @returns {Promise<{success: boolean, isSoleOwner: boolean, ownerCount?: number, error?: string}>}
 */
export async function isSoleWorkspaceOwner(userId, workspaceId) {
  if (!userId || !workspaceId) {
    const error = "Missing required parameters: user_id and workspace_id are required"
    console.error("[isSoleWorkspaceOwner] Error:", error)
    return { success: false, isSoleOwner: false, error }
  }

  try {
    
    // Count all OWNERS (role='owner') in this workspace - ONLY count owners, not editors/viewers
    const { data, error } = await supabase
      .from("workspace_members")
      .select("id, user_id, role")
      .eq("workspace_id", workspaceId)
      .eq("role", "owner")

    if (error) {
      console.error("[isSoleWorkspaceOwner] Database error:", error.message)
      return { success: false, isSoleOwner: false, error: error.message }
    }

    const ownerCount = data?.length || 0
    const isSoleOwner = ownerCount === 1 && data && data.length > 0 && data[0].user_id === userId

    
    return { success: true, isSoleOwner, ownerCount }

  } catch (err) {
    console.error("[isSoleWorkspaceOwner] Unexpected error:", err)
    return { success: false, isSoleOwner: false, error: err.message }
  }
}

/**
 * Leave a workspace (removes user from workspace_members and workspace_keys)
 * Can be called by any member of the workspace
 * 
 * @param {string} userId - The user's UUID
 * @param {string} workspaceId - The workspace's UUID
 * @returns {Promise<{success: boolean, data?: object, error?: string}>}
 */
export async function leaveWorkspace(userId, workspaceId) {
  if (!userId || !workspaceId) {
    const error = "Missing required parameters: user_id and workspace_id are required"
    console.error("[leaveWorkspace] Error:", error)
    return { success: false, error }
  }

  try {

    // Step 0: Verify user's role before leaving
    const { data: memberData, error: memberCheckError } = await supabase
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", workspaceId)
      .eq("user_id", userId)
      .maybeSingle()

    if (memberCheckError || !memberData) {
      console.error("[leaveWorkspace] Could not verify user role:", memberCheckError?.message || "No membership row")
      return { success: false, error: "Could not verify workspace membership" }
    }

    const userRole = memberData?.role || "viewer"

    // Step 1: Check if user is the sole owner - prevent leaving if so
    const soleOwnerCheck = await isSoleWorkspaceOwner(userId, workspaceId)
    if (soleOwnerCheck.success && soleOwnerCheck.isSoleOwner) {
      const error = "Cannot leave workspace as the sole owner. Transfer ownership or delete the workspace instead."
      console.warn("[leaveWorkspace]", error)
      return { success: false, error }
    }


    // Step 1B: Verify user is actually a member (membership check)
    const memberCheck = await isUserWorkspaceMember(userId, workspaceId)
    if (!memberCheck.isMember) {
      console.error("[leaveWorkspace] ❌ User is not a member of this workspace")
      return { success: false, error: "You are not a member of this workspace" }
    }

    // Step 2: Delete from workspace_members with verification
    const { data: deletedMembers, error: memberError } = await supabase
      .from("workspace_members")
      .delete()
      .eq("user_id", userId)
      .eq("workspace_id", workspaceId)
      .select("*")

    if (memberError) {
      console.error("[leaveWorkspace] RLS or database error on workspace_members delete:", memberError.message)
      console.error("[leaveWorkspace] Full error details:", JSON.stringify(memberError, null, 2))
      return { success: false, error: `Failed to remove from workspace: ${memberError.message}` }
    }

    // Check if row was actually deleted
    if (!deletedMembers || deletedMembers.length === 0) {
      console.error("[leaveWorkspace] No rows deleted from workspace_members!")
      console.error("[leaveWorkspace] User may not be a member or RLS denied deletion")
      return { success: false, error: "You are not a member of this workspace, or deletion was denied" }
    }


    // Step 3: Delete from workspace_keys (best effort - don't fail if this doesn't work)
    const { data: deletedKeys, error: keyError } = await supabase
      .from("workspace_keys")
      .delete()
      .eq("user_id", userId)
      .eq("workspace_id", workspaceId)
      .select("*")

    if (keyError) {
      console.warn("[leaveWorkspace] Warning - failed to delete workspace_keys:", keyError.message)
      // Don't fail here - user successfully left workspace_members
    }

    const keyRowsDeleted = deletedKeys?.length || 0
    if (keyRowsDeleted > 0) {
    }

    return { success: true, data: { userId, workspaceId, userRole, memberRowsDeleted: deletedMembers.length, keyRowsDeleted } }

  } catch (err) {
    console.error("[leaveWorkspace] Unexpected error:", err)
    return { success: false, error: `Unexpected error: ${err.message}` }
  }
}

/**
 * Delete entire workspace (owner only)
 * Deletes ONLY from workspaces table; related rows are handled by DB cascade.
 * Should only be called after verifying user is the workspace owner.
 * 
 * @param {string} userId - The user's UUID (must be owner)
 * @param {string} workspaceId - The workspace's UUID
 * @returns {Promise<{success: boolean, data?: object, error?: string}>}
 */
export async function deleteWorkspaceCompletely(userId, workspaceId) {
  if (!userId || !workspaceId) {
    const error = "Missing required parameters: user_id and workspace_id are required"
    console.error("[deleteWorkspaceCompletely] Error:", error)
    return { success: false, error }
  }

  try {

    // Step 1: Verify user is owner (safety check)
    const { data: memberData, error: memberCheckError } = await supabase
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", workspaceId)
      .eq("user_id", userId)
      .maybeSingle()

    if (memberCheckError || !memberData) {
      console.error("[deleteWorkspaceCompletely] Could not verify ownership:", memberCheckError?.message || "No membership row")
      return { success: false, error: "Could not verify workspace ownership" }
    }

    if (memberData?.role !== "owner") {
      console.error("[deleteWorkspaceCompletely] User is not workspace owner!")
      return { success: false, error: "Only workspace owners can delete a workspace" }
    }


    // Step 2: Delete workspace itself. DB cascade handles related rows.
    const { error: workspaceError } = await supabase
      .from("workspaces")
      .delete()
      .eq("id", workspaceId)

    if (workspaceError) {
      console.error("[deleteWorkspaceCompletely] Failed to delete workspace:", workspaceError.message)
      return { success: false, error: `Failed to delete workspace: ${workspaceError.message}` }
    }

    return { success: true, data: { workspaceId } }

  } catch (err) {
    console.error("[deleteWorkspaceCompletely] Unexpected error:", err)
    return { success: false, error: err.message }
  }
}


