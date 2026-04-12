import { create } from "zustand"

export const useNavigationStore = create((set) => ({
  activeRouteMeta: null,
  lastOpenedWorkspaceId: null,
  scrollPositions: {},
  backNavigationState: {
    fromPath: null,
    toPath: null,
    at: 0,
  },

  setActiveRouteMeta: (meta) => set({ activeRouteMeta: meta || null }),

  setLastOpenedWorkspaceId: (workspaceId) => set({ lastOpenedWorkspaceId: workspaceId || null }),

  setScrollPosition: (key, value) => {
    if (!key) return
    const nextValue = Math.max(0, Math.round(Number(value) || 0))
    set((state) => {
      if (state.scrollPositions[key] === nextValue) {
        return state
      }

      return {
        scrollPositions: {
          ...state.scrollPositions,
          [key]: nextValue,
        },
      }
    })
  },

  setBackNavigationState: ({ fromPath, toPath }) =>
    set({
      backNavigationState: {
        fromPath: fromPath || null,
        toPath: toPath || null,
        at: Date.now(),
      },
    }),

  clearNavigationState: () =>
    set({
      activeRouteMeta: null,
      lastOpenedWorkspaceId: null,
      scrollPositions: {},
      backNavigationState: {
        fromPath: null,
        toPath: null,
        at: 0,
      },
    }),
}))
