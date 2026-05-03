import { create } from "zustand"
 
const CHAT_CACHE_TTL_MS = 2 * 60 * 1000
 
export const useChatStore = create((set, get) => ({
  conversations: [],
  currentChatId: null,
  messagesByConversationId: {},
  unreadCountsByConversation: {},
  groupConversations: [],
  activeGroupId: null,
  groupMessagesByGroupId: {},
 
  // ─── Pagination state for direct messages ──────────────────────────────────
  // Tracks whether there are older messages to load (scroll-up pagination)
  hasMoreMessagesByConversationId: {},
  // Tracks the created_at timestamp of the oldest loaded message per conversation
  // Used as cursor for fetching older messages
  oldestMessageTimestampByConversationId: {},
  // ───────────────────────────────────────────────────────────────────────────
 
  updatedAt: {
    conversations: 0,
    messagesByConversationId: {},
    groupConversations: 0,
    groupMessagesByGroupId: {},
  },
 
  isFresh: (timestamp, ttl = CHAT_CACHE_TTL_MS) => {
    if (!timestamp) return false
    return Date.now() - timestamp < ttl
  },
 
  shouldFetchConversations: (force = false) => {
    if (force) return true
    const state = get()
    if (!state.conversations?.length) return true
    return !state.isFresh(state.updatedAt.conversations)
  },
 
  shouldFetchMessages: (conversationId, force = false) => {
    if (force) return true
    if (!conversationId) return true
    const state = get()
    const cached = state.messagesByConversationId[conversationId]
    if (!cached?.length) return true
    return !state.isFresh(state.updatedAt.messagesByConversationId[conversationId])
  },
 
  setConversations: (conversations) => {
    set((state) => ({
      conversations: Array.isArray(conversations) ? conversations : [],
      updatedAt: {
        ...state.updatedAt,
        conversations: Date.now(),
      },
    }))
  },
 
  setCurrentChatId: (currentChatId) => set({ currentChatId: currentChatId || null }),
 
  setMessages: (conversationId, messages) => {
    if (!conversationId) return
    set((state) => ({
      messagesByConversationId: {
        ...state.messagesByConversationId,
        [conversationId]: Array.isArray(messages) ? messages : [],
      },
      updatedAt: {
        ...state.updatedAt,
        messagesByConversationId: {
          ...state.updatedAt.messagesByConversationId,
          [conversationId]: Date.now(),
        },
      },
    }))
  },
 
  appendMessage: (conversationId, message) => {
    if (!conversationId || !message) return
    set((state) => ({
      messagesByConversationId: {
        ...state.messagesByConversationId,
        [conversationId]: (() => {
          const existing = state.messagesByConversationId[conversationId] || []
          if (existing.some((item) => item?.id && item.id === message.id)) {
            return existing
          }
          return [...existing, message]
        })(),
      },
      updatedAt: {
        ...state.updatedAt,
        messagesByConversationId: {
          ...state.updatedAt.messagesByConversationId,
          [conversationId]: Date.now(),
        },
      },
    }))
  },
 
  // ─── Prepend older messages at the TOP of the list (scroll-up pagination) ──
  prependMessages: (conversationId, olderMessages) => {
    if (!conversationId || !Array.isArray(olderMessages) || olderMessages.length === 0) return
    set((state) => {
      const existing = state.messagesByConversationId[conversationId] || []
      const existingIds = new Set(existing.map((m) => m.id))
      const uniqueOlder = olderMessages.filter((m) => !existingIds.has(m.id))
      return {
        messagesByConversationId: {
          ...state.messagesByConversationId,
          [conversationId]: [...uniqueOlder, ...existing],
        },
      }
    })
  },
 
  // ─── Pagination helpers ─────────────────────────────────────────────────────
  setHasMoreMessages: (conversationId, hasMore) => {
    if (!conversationId) return
    set((state) => ({
      hasMoreMessagesByConversationId: {
        ...state.hasMoreMessagesByConversationId,
        [conversationId]: hasMore,
      },
    }))
  },
 
  setOldestMessageTimestamp: (conversationId, timestamp) => {
    if (!conversationId) return
    set((state) => ({
      oldestMessageTimestampByConversationId: {
        ...state.oldestMessageTimestampByConversationId,
        [conversationId]: timestamp,
      },
    }))
  },
  // ───────────────────────────────────────────────────────────────────────────
 
  setUnreadCountsByConversation: (counts) => {
    set({ unreadCountsByConversation: counts || {} })
  },
 
  shouldFetchGroupConversations: (force = false) => {
    if (force) return true
    const state = get()
    if (!state.groupConversations?.length) return true
    return !state.isFresh(state.updatedAt.groupConversations)
  },
 
  shouldFetchGroupMessages: (groupId, force = false) => {
    if (force) return true
    if (!groupId) return true
    const state = get()
    const cached = state.groupMessagesByGroupId[groupId]
    if (!cached?.length) return true
    return !state.isFresh(state.updatedAt.groupMessagesByGroupId[groupId])
  },
 
  setGroupConversations: (groupConversations) => {
    set((state) => ({
      groupConversations: Array.isArray(groupConversations) ? groupConversations : [],
      updatedAt: {
        ...state.updatedAt,
        groupConversations: Date.now(),
      },
    }))
  },
 
  setActiveGroupId: (activeGroupId) => set({ activeGroupId: activeGroupId || null }),
 
  setGroupMessages: (groupId, messages) => {
    if (!groupId) return
    set((state) => ({
      groupMessagesByGroupId: {
        ...state.groupMessagesByGroupId,
        [groupId]: Array.isArray(messages) ? messages : [],
      },
      updatedAt: {
        ...state.updatedAt,
        groupMessagesByGroupId: {
          ...state.updatedAt.groupMessagesByGroupId,
          [groupId]: Date.now(),
        },
      },
    }))
  },
 
  clearChatState: () => {
    set({
      conversations: [],
      currentChatId: null,
      messagesByConversationId: {},
      unreadCountsByConversation: {},
      hasMoreMessagesByConversationId: {},
      oldestMessageTimestampByConversationId: {},
      groupConversations: [],
      activeGroupId: null,
      groupMessagesByGroupId: {},
      updatedAt: {
        conversations: 0,
        messagesByConversationId: {},
        groupConversations: 0,
        groupMessagesByGroupId: {},
      },
    })
  },
}))
 