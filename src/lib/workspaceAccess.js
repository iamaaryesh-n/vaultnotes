/**
 * Centralized workspace access control logic
 * 
 * Single source of truth for:
 * - Workspace visibility → access permissions mapping
 * - Encryption key access rules
 * - Memory read/write permissions
 * 
 * Does NOT re-encrypt data when switching visibility.
 * Only changes who can access the encryption key.
 * 
 * NOTE: Currently using is_public boolean. Will support visibility enum in future.
 */

/**
 * Check if workspace is public
 * @param {object} workspace - Workspace object
 * @returns {boolean} - Is workspace public
 */
export function isWorkspacePublic(workspace) {
  if (!workspace) return false
  return workspace.is_public === true
}

/**
 * Check if user can access workspace encryption key
 * 
 * Rules:
 * - public: Anyone can access (read metadata, view encrypted content)
 * - private: Only members can access
 * 
 * NOTE: This only grants access to fetch the key.
 * RLS policies still control which keys can be fetched.
 * 
 * @param {object} workspace - Workspace object
 * @param {boolean} isMember - Is user a workspace member
 * @returns {boolean} - Can user access encryption key
 */
export function canAccessWorkspaceKey(workspace, isMember) {
  if (!workspace) return false
  
  // Public workspace: all authenticated users can access key
  if (isWorkspacePublic(workspace)) {
    console.log("[canAccessWorkspaceKey] Public workspace - access granted")
    return true
  }
  
  // Private: only members
  if (isMember) {
    console.log("[canAccessWorkspaceKey] Member of private workspace - access granted")
    return true
  }
  
  console.log("[canAccessWorkspaceKey] Non-member of private workspace - access denied")
  return false
}

/**
 * Check if user can decrypt workspace content
 * (Same as canAccessWorkspaceKey - if you have key access, you can decrypt)
 * 
 * @param {object} workspace - Workspace object
 * @param {boolean} isMember - Is user a workspace member
 * @returns {boolean} - Can decrypt content
 */
export function canDecryptWorkspaceContent(workspace, isMember) {
  return canAccessWorkspaceKey(workspace, isMember)
}

/**
 * Check if user can create/edit/delete memories
 * (Only members can modify)
 * 
 * @param {boolean} isMember - Is user a workspace member
 * @returns {boolean} - Can modify memories
 */
export function canModifyMemories(isMember) {
  return isMember
}

/**
 * Check if user can view memory metadata without decryption
 * (Can see titles, tags, timestamps for public workspaces as non-member)
 * 
 * @param {object} workspace - Workspace object
 * @param {boolean} isMember - Is user a workspace member
 * @returns {boolean} - Can view metadata
 */
export function canViewMemoryMetadata(workspace, isMember) {
  if (!workspace) return false
  
  // Members can always view metadata
  if (isMember) {
    return true
  }
  
  // Non-members can view metadata in public workspaces only
  return isWorkspacePublic(workspace)
}

/**
 * Determine what memory content to show to user
 * 
 * @param {object} workspace - Workspace object
 * @param {boolean} isMember - Is user a workspace member
 * @returns {object} - { canDecrypt: boolean, showPlaceholder: boolean, placeholderText: string }
 */
export function getMemoryViewMode(workspace, isMember) {
  if (!workspace) {
    return {
      canDecrypt: false,
      showPlaceholder: true,
      placeholderText: '[Workspace not found]'
    }
  }
  
  const isPublic = isWorkspacePublic(workspace)
  
  // Member: can decrypt
  if (isMember) {
    return {
      canDecrypt: true,
      showPlaceholder: false,
      placeholderText: '' // Not needed
    }
  }
  
  // Non-member in public workspace: show placeholder
  if (isPublic) {
    return {
      canDecrypt: false,
      showPlaceholder: true,
      placeholderText: '[Join workspace to view full content]'
    }
  }
  
  // Non-member in private workspace: shouldn't be here
  return {
    canDecrypt: false,
    showPlaceholder: true,
    placeholderText: '[Access denied]'
  }
}

/**
 * Debug log for access decisions
 * @param {object} workspace - Workspace object
 * @param {boolean} isMember - Is user a workspace member
 * @param {string} context - Where this decision is being made
 */
export function debugAccessDecision(workspace, isMember, context = 'unknown') {
  const isPublic = isWorkspacePublic(workspace)
  const canAccessKey = canAccessWorkspaceKey(workspace, isMember)
  const canViewMetadata = canViewMemoryMetadata(workspace, isMember)
  const canModify = canModifyMemories(isMember)
  
  console.log(`[WorkspaceAccess] ${context}:`, {
    isPublic,
    isMember,
    canAccessKey,
    canViewMetadata,
    canModify,
    workspace: {
      id: workspace?.id,
      name: workspace?.name,
      is_public: workspace?.is_public
    }
  })
}
