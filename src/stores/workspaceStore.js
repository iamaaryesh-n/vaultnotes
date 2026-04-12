import { create } from "zustand"

const CACHE_TTL_MS = 5 * 60 * 1000

export const useWorkspaceStore = create((set, get) => ({
  workspaceList: [],
  currentWorkspace: null,
  workspaceMemoriesById: {},
  decryptedPreviewsByMemoryId: {},
  selectedMemory: null,
  updatedAt: {
    workspaceList: 0,
    currentWorkspace: 0,
    memoriesByWorkspace: {},
  },

  isFresh: (timestamp, ttl = CACHE_TTL_MS) => {
    if (!timestamp) return false
    return Date.now() - timestamp < ttl
  },

  shouldFetchWorkspaceList: (force = false) => {
    if (force) return true
    const state = get()
    if (!state.workspaceList?.length) return true
    return !state.isFresh(state.updatedAt.workspaceList)
  },

  shouldFetchWorkspaceMemories: (workspaceId, force = false) => {
    if (force) return true
    if (!workspaceId) return true
    const state = get()
    const memories = state.workspaceMemoriesById[workspaceId] || []
    if (!memories.length) return true
    const ts = state.updatedAt.memoriesByWorkspace[workspaceId]
    return !state.isFresh(ts)
  },

  setWorkspaceList: (workspaceList) => {
    set((state) => ({
      workspaceList: Array.isArray(workspaceList) ? workspaceList : [],
      updatedAt: {
        ...state.updatedAt,
        workspaceList: Date.now(),
      },
    }))
  },

  setCurrentWorkspace: (workspace) => {
    set((state) => ({
      currentWorkspace: workspace || null,
      updatedAt: {
        ...state.updatedAt,
        currentWorkspace: Date.now(),
      },
    }))
  },

  setWorkspaceMemories: (workspaceId, memories) => {
    if (!workspaceId) return
    set((state) => ({
      workspaceMemoriesById: {
        ...state.workspaceMemoriesById,
        [workspaceId]: Array.isArray(memories) ? memories : [],
      },
      updatedAt: {
        ...state.updatedAt,
        memoriesByWorkspace: {
          ...state.updatedAt.memoriesByWorkspace,
          [workspaceId]: Date.now(),
        },
      },
    }))
  },

  setDecryptedPreview: (memoryId, content) => {
    if (!memoryId) return
    set((state) => ({
      decryptedPreviewsByMemoryId: {
        ...state.decryptedPreviewsByMemoryId,
        [memoryId]: content,
      },
    }))
  },

  setSelectedMemory: (memory) => set({ selectedMemory: memory || null }),

  clearWorkspaceState: () => {
    set({
      workspaceList: [],
      currentWorkspace: null,
      workspaceMemoriesById: {},
      decryptedPreviewsByMemoryId: {},
      selectedMemory: null,
      updatedAt: {
        workspaceList: 0,
        currentWorkspace: 0,
        memoriesByWorkspace: {},
      },
    })
  },
}))
