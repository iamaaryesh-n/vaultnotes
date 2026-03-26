/**
 * TEST FILE FOR WORKSPACE MEMBERS FUNCTIONS
 * 
 * HOW TO RUN TESTS:
 * 1. Open the app in browser (logged in)
 * 2. Open browser Developer Tools (F12)
 * 3. Go to Console tab
 * 4. Paste this and run: testWorkspaceMembersAPI()
 * 
 * This file is NOT part of the production app - use for manual testing only
 */

import { supabase } from "./supabase.js"
import { 
  addUserToWorkspace, 
  getWorkspaceMembers,
  isUserWorkspaceMember,
  removeUserFromWorkspace,
  updateUserWorkspaceRole
} from "./workspaceMembers.js"

/**
 * Main test function - callable from browser console
 */
export async function testWorkspaceMembersAPI() {
  const hr = "=".repeat(60)
  console.log(hr)
  console.log("TESTING WORKSPACE MEMBERS API")
  console.log(hr + "\n")

  try {
    // Step 1: Get current user
    console.log("Step 1: Getting current user session...")
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    
    if (userError || !user) {
      console.error("❌ No user session found. Please log in first.")
      return
    }
    
    const userId = user.id
    console.log(`✅ Current user: ${user.email} (ID: ${userId})\n`)

    // Step 2: Get first workspace
    console.log("Step 2: Fetching workspaces...")
    const { data: workspaces, error: wsError } = await supabase
      .from("workspaces")
      .select("id, name")
      .limit(1)

    if (wsError || !workspaces || workspaces.length === 0) {
      console.error("❌ No workspaces found. Please create a workspace first.")
      return
    }

    const workspaceId = workspaces[0].id
    const workspaceName = workspaces[0].name
    console.log(`✅ Found workspace: "${workspaceName}" (ID: ${workspaceId})\n`)

    // Step 3: Add user to workspace
    console.log("Step 3: Testing addUserToWorkspace()...")
    const addResult = await addUserToWorkspace(userId, workspaceId, "editor")
    
    if (addResult.success) {
      console.log(`✅ ${addResult.data?.message || "User added to workspace!"}\n`)
    } else {
      console.error(`❌ Failed: ${addResult.error}\n`)
      return
    }

    // Step 4: Get workspace members
    console.log("Step 4: Testing getWorkspaceMembers()...")
    const membersResult = await getWorkspaceMembers(workspaceId)
    
    if (membersResult.success) {
      console.log(`✅ Fetched ${membersResult.data.length} member(s)`)
      membersResult.data.forEach((member, index) => {
        console.log(`   [${index + 1}] User: ${member.user_id}, Role: ${member.role}, Created: ${member.created_at}`)
      })
      console.log("")
    } else {
      console.error(`❌ Failed: ${membersResult.error}\n`)
      return
    }

    // Step 5: Check membership
    console.log("Step 5: Testing isUserWorkspaceMember()...")
    const checkResult = await isUserWorkspaceMember(userId, workspaceId)
    
    if (checkResult.success) {
      console.log(`✅ Is member: ${checkResult.isMember}, Role: ${checkResult.role || "N/A"}\n`)
    } else {
      console.error(`❌ Failed: ${checkResult.error}\n`)
    }

    // Step 6: Update role
    console.log("Step 6: Testing updateUserWorkspaceRole()...")
    const updateResult = await updateUserWorkspaceRole(userId, workspaceId, "owner")
    
    if (updateResult.success) {
      console.log(`✅ Role updated to: ${updateResult.data[0].role}\n`)
    } else {
      console.error(`❌ Failed: ${updateResult.error}\n`)
    }

    // Step 7: Verify role update
    console.log("Step 7: Re-fetching members to verify role update...")
    const membersResult2 = await getWorkspaceMembers(workspaceId)
    
    if (membersResult2.success) {
      const currentUser = membersResult2.data.find(m => m.user_id === userId)
      if (currentUser) {
        console.log(`✅ Current role: ${currentUser.role}\n`)
      }
    }

    console.log("=".repeat(60))
    console.log("✅ ALL TESTS COMPLETED SUCCESSFULLY!")
    console.log("=".repeat(60))

  } catch (err) {
    console.error("❌ Unexpected error during testing:", err)
  }
}

// Export for browser console testing
window.testWorkspaceMembersAPI = testWorkspaceMembersAPI
