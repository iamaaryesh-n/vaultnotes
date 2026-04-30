import { supabase } from "./supabase"
import { getPostPlainText } from "../utils/postContent"

/**
 * Global unified search across profiles, posts, workspaces, and memories
 * Returns results grouped by type with matched text highlighted
 */
export async function globalSearch(query) {
  if (!query || query.trim().length === 0) {
    return {
      users: [],
      posts: [],
      workspaces: [],
      notes: [],
      isEmpty: true,
      error: null
    }
  }

  const searchTerm = `%${query}%`
  const results = {
    users: [],
    posts: [],
    workspaces: [],
    notes: [],
    isEmpty: true,
    error: null
  }

  try {
    // Parallel searches for better performance
    const [usersRes, postsRes, workspacesRes, memoriesRes] = await Promise.all([
      searchUsers(searchTerm),
      searchPosts(searchTerm),
      searchWorkspaces(searchTerm),
      searchMemories(searchTerm)
    ])

    results.users = usersRes || []
    results.posts = postsRes || []
    results.workspaces = workspacesRes || []
    results.notes = memoriesRes || []
    results.isEmpty = !results.users.length && !results.posts.length && !results.workspaces.length && !results.notes.length

    console.log("[GlobalSearch] Results:", {
      users: results.users.length,
      posts: results.posts.length,
      workspaces: results.workspaces.length,
      notes: results.notes.length
    })

    return results
  } catch (err) {
    console.error("[GlobalSearch] Search error:", err)
    results.error = err.message
    return results
  }
}

/**
 * Search users/profiles by username or name
 */
async function searchUsers(searchTerm) {
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, username, name, avatar_url")
      .or(`username.ilike.${searchTerm},name.ilike.${searchTerm}`)
      .limit(6)

    if (error) {
      console.error("[GlobalSearch] User search error:", error)
      return []
    }

    return (data || []).map(user => ({
      id: user.id,
      type: "user",
      title: `@${user.username}`,
      subtitle: user.name || "No name",
      avatar_url: user.avatar_url,
      username: user.username,
      navigationPath: `/profile/${user.username}`
    }))
  } catch (err) {
    console.error("[GlobalSearch] User search exception:", err)
    return []
  }
}

/**
 * Search posts by content
 */
async function searchPosts(searchTerm) {
  try {
    const { data, error } = await supabase
      .from("posts")
      .select("id, user_id, content, image_url, created_at, profiles(username, avatar_url, name)")
      .ilike("content", searchTerm)
      .order("created_at", { ascending: false })
      .limit(6)

    if (error) {
      console.error("[GlobalSearch] Post search error:", error)
      return []
    }

    return (data || []).map(post => {
      const title = getPostPlainText(post.content || "")

      return ({
      id: post.id,
      type: "post",
      title: title ? (title.substring(0, 60) + (title.length > 60 ? "..." : "")) : "Image post",
      subtitle: `by @${post.profiles?.username || "unknown"}`,
      avatar_url: post.profiles?.avatar_url,
      image_url: post.image_url,
      created_at: post.created_at,
      navigationPath: null, // Will be handled by opening modal in Explore
      postId: post.id
      })
    })
  } catch (err) {
    console.error("[GlobalSearch] Post search exception:", err)
    return []
  }
}

/**
 * Search workspaces by name - returns public workspaces + member workspaces
 * Public workspaces are discoverable but access control is enforced by RLS:
 * - Non-members have read-only access
 * - Members can edit based on their role (owner/admin)
 */
async function searchWorkspaces(searchTerm) {
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return []
    }

    // Get public workspaces matching search term
    const { data: publicWorkspaces, error: publicError } = await supabase
      .from("workspaces")
      .select("id, name, created_at, is_public")
      .eq("is_public", true)
      .ilike("name", searchTerm)
      .order("created_at", { ascending: false })
      .limit(6)

    if (publicError) {
      console.error("[GlobalSearch] Public workspace search error:", publicError)
      return []
    }

    // Get user's member workspaces matching search term
    const { data: memberWorkspaces, error: memberError } = await supabase
      .from("workspaces")
      .select("id, name, created_at, is_public, workspace_members(role)")
      .ilike("name", searchTerm)
      .eq("workspace_members.user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(6)

    if (memberError) {
      console.error("[GlobalSearch] Member workspace search error:", memberError)
      return []
    }

    // Combine and deduplicate (remove public workspaces that are also member workspaces)
    const allWorkspaces = [...(memberWorkspaces || []), ...(publicWorkspaces || [])]
    const uniqueWorkspaces = Array.from(
      new Map(allWorkspaces.map(ws => [ws.id, ws])).values()
    ).slice(0, 6)

    return uniqueWorkspaces.map(workspace => {
      // Check if user is member by presence of workspace_members data
      const isMember = workspace.workspace_members && workspace.workspace_members.length > 0

      return {
        id: workspace.id,
        type: "workspace",
        title: workspace.name,
        subtitle: workspace.is_public ? "Public workspace" : "Your workspace",
        created_at: workspace.created_at,
        // Route to preview page for non-members, to full workspace for members
        navigationPath: isMember ? `/workspace/${workspace.id}` : `/workspace-preview/${workspace.id}`
      }
    })
  } catch (err) {
    console.error("[GlobalSearch] Workspace search exception:", err)
    return []
  }
}

/**
 * Search memories (notes) by title and tags
 */
async function searchMemories(searchTerm) {
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return []
    }

    const { data, error } = await supabase
      .from("memories")
      .select("id, title, workspace_id, created_at, workspaces(name)")
      .eq("created_by", user.id)
      .or(`title.ilike.${searchTerm},tags.cs.{${searchTerm.slice(1, -1)}}`)
      .order("created_at", { ascending: false })
      .limit(6)

    if (error) {
      console.error("[GlobalSearch] Memory search error:", error)
      return []
    }

    return (data || []).map(memory => ({
      id: memory.id,
      type: "note",
      title: memory.title || "Untitled Note",
      subtitle: memory.workspaces?.name || "Personal",
      created_at: memory.created_at,
      navigationPath: `/memory/${memory.id}`
    }))
  } catch (err) {
    console.error("[GlobalSearch] Memory search exception:", err)
    return []
  }
}

/**
 * Helper function to highlight matching text in a string
 */
export function highlightText(text, query) {
  if (!text || !query) return text

  const regex = new RegExp(`(${query})`, "gi")
  const parts = text.split(regex)

  return parts
    .map((part, index) =>
      regex.test(part)
        ? `<mark key="${index}">${part}</mark>`
        : part
    )
    .join("")
}

/**
 * Helper to format timestamp for search results
 */
export function formatSearchTime(timestamp) {
  if (!timestamp) return ""

  const date = new Date(timestamp)
  const now = new Date()
  const diffMins = Math.floor((now - date) / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMins < 1) return "just now"
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`

  return date.toLocaleDateString()
}

/**
 * Fetch all public workspaces with pagination
 * Respects RLS - only returns public workspaces visible to authenticated user
 */
export async function fetchAllPublicWorkspaces(limit = 10, offset = 0) {
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return { workspaces: [], total: 0, error: "Not authenticated" }
    }

    console.log("[fetchAllPublicWorkspaces] Fetching public workspaces...")

    // Fetch all public workspaces - RLS will enforce visibility
    // Keep this query table-local and resolve owner profiles separately.
    const { data, error, count } = await supabase
      .from("workspaces")
      .select("id, name, created_at, is_public, created_by, description", { count: "exact" })
      .eq("is_public", true)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) {
      console.error("[fetchAllPublicWorkspaces] Error:", error)
      return { workspaces: [], total: 0, error: error.message }
    }

    console.log("[fetchAllPublicWorkspaces] Fetched", data?.length || 0, "public workspaces")
    return {
      workspaces: data || [],
      total: count || 0,
      error: null
    }
  } catch (err) {
    console.error("[fetchAllPublicWorkspaces] Exception:", err)
    return { workspaces: [], total: 0, error: err.message }
  }
}

/**
 * Fetch public workspaces with discover-card metadata.
 * Adds owner username, member count, and note count for Explore shelf cards.
 */
export async function fetchPublicWorkspaceDiscoverCards(limit = 8, offset = 0) {
  try {
    const { workspaces, total, error } = await fetchAllPublicWorkspaces(limit, offset)

    if (error) {
      return { workspaces: [], total: 0, error }
    }

    const ownerIds = [...new Set((workspaces || []).map((ws) => ws.created_by).filter(Boolean))]

    let ownerById = {}
    if (ownerIds.length > 0) {
      const { data: owners, error: ownersError } = await supabase
        .from("profiles")
        .select("id, username, name, avatar_url")
        .in("id", ownerIds)

      if (ownersError) {
        console.warn("[fetchPublicWorkspaceDiscoverCards] Owner profile lookup failed:", ownersError)
      } else {
        ownerById = (owners || []).reduce((acc, profile) => {
          acc[profile.id] = profile
          return acc
        }, {})
      }
    }

    const enriched = await Promise.all(
      (workspaces || []).map(async (workspace) => {
        const [memberCountRes, noteCountRes] = await Promise.all([
          supabase
            .from("workspace_members")
            .select("id", { count: "exact", head: true })
            .eq("workspace_id", workspace.id),
          supabase
            .from("memories")
            .select("id", { count: "exact", head: true })
            .eq("workspace_id", workspace.id)
        ])

        const owner = ownerById[workspace.created_by]

        return {
          ...workspace,
          owner_username: owner?.username || null,
          owner_name: owner?.name || null,
          owner_avatar_url: owner?.avatar_url || null,
          member_count: memberCountRes.count || 0,
          note_count: noteCountRes.count || 0
        }
      })
    )

    return {
      workspaces: enriched,
      total,
      error: null
    }
  } catch (err) {
    console.error("[fetchPublicWorkspaceDiscoverCards] Exception:", err)
    return { workspaces: [], total: 0, error: err.message }
  }
}

/**
 * Fetch a specific user's public workspaces
 * Uses direct workspace query instead of workspace_members to bypass RLS restrictions
 */
export async function fetchUserPublicWorkspaces(userId) {
  try {
    if (!userId) return []

    console.log("[fetchUserPublicWorkspaces] Fetching public workspaces for user:", userId)

    // Query workspaces directly - RLS will show only public workspaces
    // Don't try to join profiles - just get workspace data
    const { data, error } = await supabase
      .from("workspaces")
      .select("id, name, created_at, is_public, created_by")
      .eq("created_by", userId)
      .eq("is_public", true)
      .order("created_at", { ascending: false })

    if (error) {
      console.error("[fetchUserPublicWorkspaces] Error:", error)
      return []
    }

    console.log("[fetchUserPublicWorkspaces] Fetched", data?.length || 0, "public workspaces")
    return data || []
  } catch (err) {
    console.error("[fetchUserPublicWorkspaces] Exception:", err)
    return []
  }
}
