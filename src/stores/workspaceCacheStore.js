import { create } from 'zustand'

/**
 * Global workspace cache store
 * Manages workspace list data to avoid refetching during navigation
 */
export const useWorkspaceCacheStore = create((set, get) => ({
  // State: Workspace data cache
  workspaces: [],
  userRoles: {}, // {workspaceId: role}
  ownerCounts: {}, // {workspaceId: ownerCount}
  
  // State: Metadata
  cacheTimestamp: null,
  isFetching: false,
  error: null,
  
  // Constants
  CACHE_DURATION_MS: 5 * 60 * 1000, // 5 minutes cache duration
  
  /**
   * Check if workspace cache is still valid (not expired)
   */
  isCacheValid: () => {
    const state = get()
    if (!state.cacheTimestamp) return false
    return Date.now() - state.cacheTimestamp < state.CACHE_DURATION_MS
  },
  
  /**
   * Check if we have cached workspaces
   */
  hasCachedWorkspaces: () => {
    const state = get()
    return state.workspaces && state.workspaces.length > 0 && state.isCacheValid()
  },
  
  /**
   * Get all cached workspaces
   */
  getCachedWorkspaces: () => {
    const state = get()
    if (!state.isCacheValid()) {
      return null
    }
    return {
      workspaces: state.workspaces,
      userRoles: state.userRoles,
      ownerCounts: state.ownerCounts
    }
  },
  
  /**
   * Set workspaces in cache
   */
  setCachedWorkspaces: (workspacesData, userRolesData, ownerCountsData) => {
    set({
      workspaces: workspacesData,
      userRoles: userRolesData,
      ownerCounts: ownerCountsData,
      cacheTimestamp: Date.now(),
      error: null
    })
  },
  
  /**
   * Set fetching state
   */
  setFetching: (isFetching) => {
    set({ isFetching })
  },
  
  /**
   * Set error state
   */
  setError: (error) => {
    set({ error })
  },
  
  /**
   * Clear all cache (on logout, etc.)
   */
  clearCache: () => {
    set({
      workspaces: [],
      userRoles: {},
      ownerCounts: {},
      cacheTimestamp: null,
      error: null
    })
  }
}))
