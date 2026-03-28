import { useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useWorkspaceCacheStore } from '../stores/workspaceCacheStore'

/**
 * Hook to prefetch workspaces in the background
 * Call this from pages like Explore to load workspaces before user navigates to Dashboard
 */
export function usePrefetchWorkspaces() {
  const prefetchControllerRef = useRef(null)
  const hasPrefetchedRef = useRef(false)
  
  const setCachedWorkspaces = useWorkspaceCacheStore(state => state.setCachedWorkspaces)
  const setFetching = useWorkspaceCacheStore(state => state.setFetching)
  const hasCachedWorkspaces = useWorkspaceCacheStore(state => state.hasCachedWorkspaces)

  useEffect(() => {
    // Only prefetch once per component instance and only if cache is empty
    if (hasPrefetchedRef.current || hasCachedWorkspaces()) {
      return
    }

    hasPrefetchedRef.current = true
    
    const prefetchWorkspaces = async () => {
      try {
        prefetchControllerRef.current = new AbortController()
        setFetching(true)

        // Get current user
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user) {
          console.log('[usePrefetchWorkspaces] User not authenticated, skipping prefetch')
          return
        }

        // Step 1: Fetch user's workspace memberships
        const { data: userMemberData, error: userMemberError } = await supabase
          .from('workspace_members')
          .select('workspace_id, role')
          .eq('user_id', user.id)

        if (userMemberError) {
          console.error('[usePrefetchWorkspaces] Failed to fetch user memberships:', userMemberError)
          return
        }

        const userRolesMap = {}
        const workspaceIds = []
        ;(userMemberData || []).forEach((m) => {
          userRolesMap[m.workspace_id] = m.role
          workspaceIds.push(m.workspace_id)
        })

        // If no workspaces, still cache the empty result
        if (workspaceIds.length === 0) {
          console.log('[usePrefetchWorkspaces] User has no workspaces, caching empty result')
          setCachedWorkspaces([], userRolesMap, {})
          return
        }

        // Step 2: Fetch workspace details
        const { data: workspaceData, error: workspaceError } = await supabase
          .from('workspaces')
          .select('id, name, created_at, created_by')
          .in('id', workspaceIds)
          .order('created_at', { ascending: false })

        if (workspaceError) {
          console.error('[usePrefetchWorkspaces] Failed to fetch workspaces:', workspaceError)
          return
        }

        // Step 3: Count owners for each workspace
        const { data: memberData, error: memberError } = await supabase
          .from('workspace_members')
          .select('workspace_id, role')
          .in('workspace_id', workspaceIds)

        const ownerCountMap = {}
        if (!memberError && memberData) {
          memberData.forEach((m) => {
            if (m.role === 'owner') {
              ownerCountMap[m.workspace_id] = (ownerCountMap[m.workspace_id] || 0) + 1
            }
          })
        }

        console.log('[usePrefetchWorkspaces] ✅ Prefetched', workspaceData?.length || 0, 'workspace(s)')
        setCachedWorkspaces(workspaceData || [], userRolesMap, ownerCountMap)
      } catch (err) {
        console.error('[usePrefetchWorkspaces] Error prefetching workspaces:', err)
      } finally {
        setFetching(false)
      }
    }

    prefetchWorkspaces()

    // Cleanup: cancel pending prefetch on unmount
    return () => {
      if (prefetchControllerRef.current) {
        prefetchControllerRef.current.abort()
        console.log('[usePrefetchWorkspaces] Cancelled pending prefetch on unmount')
      }
    }
  }, [setCachedWorkspaces, setFetching, hasCachedWorkspaces])
}
