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
        const controller = new AbortController()
        prefetchControllerRef.current = controller
        setFetching(true)

        // Get current user
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        
        if (controller.signal.aborted) return

        if (authError || !user) {
          console.log('[usePrefetchWorkspaces] User not authenticated, skipping prefetch')
          return
        }

        // Step 1: Fetch user's workspace memberships
        const { data: userMemberData, error: userMemberError } = await supabase
          .from('workspace_members')
          .select('workspace_id, role')
          .eq('user_id', user.id)
          .abortSignal(controller.signal)

        if (controller.signal.aborted) return

        if (userMemberError) {
          if (userMemberError.message === 'Fetch is aborted' || controller.signal.aborted) {
            if (import.meta.env.DEV) console.log("[FetchCancelled] usePrefetchWorkspaces memberships query")
            return
          }
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
          .abortSignal(controller.signal)

        if (controller.signal.aborted) return

        if (workspaceError) {
          if (workspaceError.message === 'Fetch is aborted' || controller.signal.aborted) {
            if (import.meta.env.DEV) console.log("[FetchCancelled] usePrefetchWorkspaces details query")
            return
          }
          console.error('[usePrefetchWorkspaces] Failed to fetch workspaces:', workspaceError)
          return
        }

        // Step 3: Count owners for each workspace
        const { data: memberData, error: memberError } = await supabase
          .from('workspace_members')
          .select('workspace_id, role')
          .in('workspace_id', workspaceIds)
          .abortSignal(controller.signal)

        if (controller.signal.aborted) return

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
        const isAbort = 
          err.name === 'AbortError' || 
          err.message === 'Fetch is aborted' || 
          err.message?.includes('signal is aborted') ||
          prefetchControllerRef.current?.signal.aborted

        if (isAbort) {
          if (import.meta.env.DEV) console.log("[FetchCancelled] usePrefetchWorkspaces prefetch task")
          return
        }

        console.error('[usePrefetchWorkspaces] Error prefetching workspaces:', err)
      } finally {
        if (prefetchControllerRef.current && !prefetchControllerRef.current.signal.aborted) {
          setFetching(false)
        }
      }
    }

    prefetchWorkspaces()

    // Cleanup: cancel pending prefetch on unmount
    return () => {
      if (prefetchControllerRef.current) {
        prefetchControllerRef.current.abort()
      }
    }

  }, [setCachedWorkspaces, setFetching, hasCachedWorkspaces])
}
