import { supabase } from "../lib/supabase"

/**
 * Centralized role-based permission helpers
 */

const DEFAULT_ROLE = "viewer"

/**
 * Fetch current user's role in a workspace.
 * Returns "viewer" if membership is missing/hidden by RLS.
 */
export async function getUserRole(workspaceId) {
  if (!workspaceId) return DEFAULT_ROLE

  try {
    const { data: authData, error: authError } = await supabase.auth.getUser()
    const userId = authData?.user?.id
    if (authError || !userId) return DEFAULT_ROLE

    const { data, error } = await supabase
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", workspaceId)
      .eq("user_id", userId)
      .maybeSingle()

    if (error) return DEFAULT_ROLE
    return data?.role || DEFAULT_ROLE
  } catch {
    return DEFAULT_ROLE
  }
}

export function isOwner(role) {
  return role === "owner"
}

export function isEditor(role) {
  return role === "editor"
}

export function isViewer(role) {
  return !role || role === "viewer"
}

/**
 * Can user edit a memory?
 * @param {string} role - User role: "owner", "editor", or "viewer"
 * @returns {boolean}
 */
export function canEdit(role) {
  return isOwner(role) || isEditor(role)
}

/**
 * Can user delete a memory?
 * @param {string} role - User role: "owner", "editor", or "viewer"
 * @returns {boolean}
 */
export function canDelete(role) {
  return isOwner(role)
}

/**
 * Can user share/invite/manage workspace members?
 * Owner only.
 */
export function canShare(role) {
  return isOwner(role)
}

/**
 * Can user create a memory?
 * @param {string} role - User role: "owner", "editor", or "viewer"
 * @returns {boolean}
 */
export function canCreate(role) {
  return canEdit(role)
}

/**
 * Can user manage workspace (add/remove members, change roles)?
 * @param {string} role - User role: "owner", "editor", or "viewer"
 * @returns {boolean}
 */
export function canManageWorkspace(role) {
  return canShare(role)
}

/**
 * Get human-readable role label with description
 * @param {string} role - User role: "owner", "editor", or "viewer"
 * @returns {object} - { role, label, description }
 */
export function getRoleLabel(role) {
  const labels = {
    owner: {
      role: "owner",
      label: "Owner",
      description: "Full access - create, edit, delete, manage members",
    },
    editor: {
      role: "editor",
      label: "Editor",
      description: "Create and edit memories",
    },
    viewer: {
      role: "viewer",
      label: "Viewer",
      description: "Read-only access",
    },
  }

  return labels[role] || labels.viewer
}
