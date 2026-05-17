import { useCallback, useEffect, useMemo, useRef, useState, lazy, Suspense, memo } from "react"
import { createPortal } from "react-dom"
import { useNavigate, useParams, useSearchParams } from "react-router-dom"
import { supabase } from "../lib/supabase"
import { useAuth } from "../hooks/useAuth"
import { ChatListSkeleton } from "../components/SkeletonLoader"
import { EditProfileModal } from "../components/EditProfileModal"
import { DropdownMenu } from "../components/DropdownMenu"
import { followUser, unfollowUser } from "../lib/followsLib"
import { useToast } from "../hooks/useToast"
import { encrypt, decrypt, importKey, generateKey, exportKey, validateKey, debugLogKey } from "../utils/encryption"
import { getSignedImageUrl, uploadImageToPrivateStorage, isSignedUrlValid, deletePrivateImage } from "../lib/privateImageStorage"
import { IMAGE_TOO_LARGE_MESSAGE, prepareImageForUpload } from "../lib/imageCompression"
import { dispatchPushNotification } from "../lib/pushNotifications"
import { Copy, Forward, Info, MessageCircle, MoreVertical, Reply, SmilePlus, Trash2, ChevronUp, ChevronDown, UserPlus, Users } from "lucide-react"
import PostPreview from "../components/PostPreview"
import { usePostCacheStore } from "../stores/postCacheStore"
import dayjs from "dayjs"
import relativeTime from "dayjs/plugin/relativeTime"
import utc from "dayjs/plugin/utc"
import { AnimatePresence, motion } from "framer-motion"
import { useChatStore } from "../stores/chatStore"
import { useRouteScrollRestoration } from "../hooks/useRouteScrollRestoration"

dayjs.extend(relativeTime)
dayjs.extend(utc)

const ReactionModal = lazy(() => import("../components/ReactionModal"))

const CHAT_LIST_VIEW = {
  ACTIVE: "active",
  ARCHIVED: "archived"
}

const _restoringConversationIds = new Set()
const isDev = import.meta.env.DEV
const devLog = (...args) => {
  if (isDev) {
    console.log(...args)
  }
}
const devWarn = (...args) => {
  if (isDev) {
    console.warn(...args)
  }
}

const ReactionPill = memo(({ item, messageId, onOpenModal }) => {
  const { emoji, count, reactedByCurrentUser, users } = item

  // Tooltip showing names
  const tooltipText = users.slice(0, 5).map(u => u.isCurrentUser ? "You" : u.name).join(", ") + (users.length > 5 ? ` and ${users.length - 5} others` : "")

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onOpenModal(messageId)
      }}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] transition-all duration-200 ${reactedByCurrentUser
        ? "border-[var(--chat-accent)] bg-[var(--chat-accent-soft)] text-[var(--chat-accent)] shadow-sm font-medium"
        : "border-[var(--chat-border-strong)] bg-[var(--chat-elev)] text-[var(--chat-text-subtle)] hover:border-[var(--chat-text-muted)]"
        }`}
      title={tooltipText}
    >
      <span>{emoji}</span>
      <span className={reactedByCurrentUser ? "text-[var(--chat-accent)]" : "text-[var(--chat-text)]"}>{count}</span>
    </button>
  )
})

export default function Chat() {
  const REACTION_EMOJIS = ["\u{1F44D}", "\u2764\uFE0F", "\u{1F602}", "\u{1F62E}", "\u{1F622}", "\u{1F621}"]

  const navigate = useNavigate()
  const { conversationId: routeConversationId, groupId: routeGroupId } = useParams()
  const { user: contextUser, authReady } = useAuth()
  const { success: showSuccess, error: showToastError } = useToast()
  const cachedConversations = useChatStore((state) => state.conversations)
  const cachedCurrentChatId = useChatStore((state) => state.currentChatId)
  const cachedUnreadCountsByConversation = useChatStore((state) => state.unreadCountsByConversation)
  const shouldFetchConversations = useChatStore((state) => state.shouldFetchConversations)
  const shouldFetchMessages = useChatStore((state) => state.shouldFetchMessages)
  const setConversationsCache = useChatStore((state) => state.setConversations)
  const setMessagesCache = useChatStore((state) => state.setMessages)
  const appendMessageToCache = useChatStore((state) => state.appendMessage)
  const setUnreadCountsCache = useChatStore((state) => state.setUnreadCountsByConversation)
  const setCurrentChatIdCache = useChatStore((state) => state.setCurrentChatId)
  const [searchParams] = useSearchParams()
  const [conversations, setConversations] = useState(cachedConversations || [])
  const [allConversations, setAllConversations] = useState(null)
  const [activeConversationId, setActiveConversationId] = useState(null)
  const [selectedConversation, setSelectedConversation] = useState(null)
  const [messages, setMessages] = useState([])
  const [oldestTimestamp, setOldestTimestamp] = useState(null)
  const [hasMoreMessages, setHasMoreMessages] = useState(true)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [profilesById, setProfilesById] = useState({})
  const [hasDraft, setHasDraft] = useState(false)
  const [inputValue, setInputValue] = useState("")
  const [loadingConversations, setLoadingConversations] = useState((cachedConversations || []).length === 0)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [sending, setSending] = useState(false)
  const [userSearchQuery, setUserSearchQuery] = useState("")
  const [userSearchResults, setUserSearchResults] = useState([])
  const [userSearchLoading, setUserSearchLoading] = useState(false)
  const [startingConversationUserId, setStartingConversationUserId] = useState(null)
  const [error, setError] = useState("")
  const [uploadingImage, setUploadingImage] = useState(false)
  const [imagePreviewUrl, setImagePreviewUrl] = useState("")
  const [selectedImageFile, setSelectedImageFile] = useState(null)
  const [selectedImageComposerUrl, setSelectedImageComposerUrl] = useState("")
  const [imageCaption, setImageCaption] = useState("")
  const [activeReactionPickerMessageId, setActiveReactionPickerMessageId] = useState(null)
  const [activeMenuId, setActiveMenuId] = useState(null);
  const [reactionModalMessageId, setReactionModalMessageId] = useState(null)
  const [forwardModalOpen, setForwardModalOpen] = useState(false)
  const [forwardingMessage, setForwardingMessage] = useState(null)
  const [forwardSearchQuery, setForwardSearchQuery] = useState("")
  const [selectedForwardConversationIds, setSelectedForwardConversationIds] = useState([])
  const [forwarding, setForwarding] = useState(false)
  const [conversationSearchOpen, setConversationSearchOpen] = useState(false)
  const [conversationSearchQuery, setConversationSearchQuery] = useState("")
  const [debouncedConversationSearchQuery, setDebouncedConversationSearchQuery] = useState("")
  const [matchedMessageIds, setMatchedMessageIds] = useState([])
  const [activeMatchIndex, setActiveMatchIndex] = useState(0)
  const [presenceNow, setPresenceNow] = useState(Date.now())
  const [unreadCountsByConversation, setUnreadCountsByConversation] = useState({})

  useEffect(() => {
    // Reset unread counts on initial mount to prevent stale UI
    setUnreadCountsByConversation({})
    setUnreadGroupCountsByGroup({})
  }, [])
  const [typingByConversation, setTypingByConversation] = useState({})
  const [onlineUsersById, setOnlineUsersById] = useState({})
  const [replyToMessage, setReplyToMessage] = useState(null)
  const [editingMessage, setEditingMessage] = useState(null)
  const [loadedImageUrls, setLoadedImageUrls] = useState({}) // messageId -> signed URL
  const [deleteConfirmationMessage, setDeleteConfirmationMessage] = useState(null)
  const [directSidebarView, setDirectSidebarView] = useState(CHAT_LIST_VIEW.ACTIVE)
  const [groupSidebarView, setGroupSidebarView] = useState(CHAT_LIST_VIEW.ACTIVE)
  const [conversationPreferencesById, setConversationPreferencesById] = useState({})
  const [groupPreferencesById, setGroupPreferencesById] = useState({})
  const [openConversationOptionsId, setOpenConversationOptionsId] = useState(null)
  const [openGroupOptionsId, setOpenGroupOptionsId] = useState(null)

  // Group chat state
  const [chatMode, setChatMode] = useState('direct') // 'direct' | 'groups'
  const [groups, setGroups] = useState([])
  const [activeGroupId, setActiveGroupId] = useState(null)
  const [groupMessages, setGroupMessages] = useState([])
  const [groupMembers, setGroupMembers] = useState([])
  const [unreadGroupCountsByGroup, setUnreadGroupCountsByGroup] = useState({})
  const [groupDraft, setGroupDraft] = useState('')
  const [sendingGroup, setSendingGroup] = useState(false)
  const [loadingGroups, setLoadingGroups] = useState(false)
  const [hasFetchedGroups, setHasFetchedGroups] = useState(false)
  const [loadingGroupMessages, setLoadingGroupMessages] = useState(false)
  const [showNewGroupModal, setShowNewGroupModal] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [newGroupSearch, setNewGroupSearch] = useState('')
  const [groupListSearchQuery, setGroupListSearchQuery] = useState('')
  const [newGroupSearchResults, setNewGroupSearchResults] = useState([])
  const [newGroupSelectedUsers, setNewGroupSelectedUsers] = useState([])
  const [creatingGroup, setCreatingGroup] = useState(false)
  const [showMembersDropdown, setShowMembersDropdown] = useState(false)
  const [memberSearchQuery, setMemberSearchQuery] = useState('')
  const [memberSearchResults, setMemberSearchResults] = useState([])

  // Group chat features: reactions
  const [groupMessageReactions, setGroupMessageReactions] = useState({})
  const [groupReactionModalMessageId, setGroupReactionModalMessageId] = useState(null)

  // Group chat features: read receipts (seen by)
  const [groupMessageReads, setGroupMessageReads] = useState({}) // maps message_id -> [{ user_id, read_at, profile }]

  // Group chat features: replies
  const [groupReplyTo, setGroupReplyTo] = useState(null)

  // Group chat features: editing
  const [editingGroupMessage, setEditingGroupMessage] = useState(null)

  // Group chat features: deletes
  const [deleteGroupConfirmationMessage, setDeleteGroupConfirmationMessage] = useState(null)

  // Group chat features: images
  const [groupSelectedImage, setGroupSelectedImage] = useState(null)
  const [groupImageCaption, setGroupImageCaption] = useState('')
  const [uploadingGroupImage, setUploadingGroupImage] = useState(false)
  const [groupSelectedImageComposerUrl, setGroupSelectedImageComposerUrl] = useState('')
  const [displayGroupImagePreviewUrl, setDisplayGroupImagePreviewUrl] = useState(null) // For viewing image modal
  const [groupLoadedImageUrls, setGroupLoadedImageUrls] = useState({}) // Cache: messageId -> signed URL
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0, anchorHeight: 0 });

  // Group chat features: message actions menu

  const [activeGroupEmojiPickerMessageId, setActiveGroupEmojiPickerMessageId] = useState(null)
  const [groupMessageInfoModalId, setGroupMessageInfoModalId] = useState(null)
  const [groupTypingIndicators, setGroupTypingIndicators] = useState({}) // userId -> timestamp

  const reactionsByMessageId = useMemo(() => {
    const map = { direct: {}, group: {} }
    let totalMessagesWithReactions = 0

    const buildSummary = (rows) => {
      if (!rows || rows.length === 0) return []
      const byEmoji = new Map()

      rows.forEach((row) => {
        const emoji = row.emoji
        if (!byEmoji.has(emoji)) {
          byEmoji.set(emoji, { emoji, count: 0, users: [], reactedByCurrentUser: false })
        }
        const group = byEmoji.get(emoji)

        const profile = row.profiles || profilesById[row.user_id] || null
        const name = profile?.name || profile?.username || "Unknown"

        group.count++
        group.users.push({
          reactionId: row.id,
          userId: row.user_id,
          name: name,
          avatarUrl: profile?.avatar_url || null,
          isCurrentUser: row.user_id === contextUser?.id
        })
        if (row.user_id === contextUser?.id) {
          group.reactedByCurrentUser = true
        }
      })

      return Array.from(byEmoji.values())
    }

    // Direct Messages
    messages.forEach((msg) => {
      const summary = buildSummary(msg.reactions)
      if (summary.length > 0) {
        map.direct[msg.id] = summary
        totalMessagesWithReactions++
      }
    })

    // Group Messages
    Object.entries(groupMessageReactions).forEach(([msgId, rows]) => {
      const summary = buildSummary(rows)
      if (summary.length > 0) {
        map.group[msgId] = summary
        totalMessagesWithReactions++
      }
    })

    if (import.meta.env.DEV) console.log("[ReactionSummaryBuilt]", totalMessagesWithReactions)
    return map
  }, [messages, groupMessageReactions, profilesById, contextUser?.id])

  const [isMobileView, setIsMobileView] = useState(() => window.matchMedia("(max-width: 767px)").matches)

  const bottomRef = useRef(null)
  const inputRef = useRef(null)
  const userSearchInputRef = useRef(null)
  const conversationSearchInputRef = useRef(null)
  const imageCaptionInputRef = useRef(null)
  const fileInputRef = useRef(null)
  const lastPresenceUpdateRef = useRef(0)
  const activeConversationChannelRef = useRef(null)
  const presenceChannelRef = useRef(null)
  const reactionsChannelRef = useRef(null)
  const typingStopTimerRef = useRef(null)
  const typingConversationTimersRef = useRef({})
  const typingListenerChannelsRef = useRef([])
  const isTypingRef = useRef(false)
  const lastTypingBroadcastAtRef = useRef(0)
  const updateMessageSeenStatusRef = useRef(null)
  const getConversationKeyRef = useRef(null)
  const getMessageTypeRef = useRef(null)
  const appendMessageToCacheRef = useRef(null)
  const clearUnreadForConversationRef = useRef(null)
  const handleReactionInsertRef = useRef(null)
  const updateReactionInStateRef = useRef(null)
  const handleReactionDeleteRef = useRef(null)
  const sortConversationsByPriorityRef = useRef(null)
  const contextUserIdRef = useRef(null)
  const conversationCryptoKeysRef = useRef({})
  const signedImageUrlCacheRef = useRef({}) // Cache: storagePath -> { url, expiresAt }
  const groupMessagesChannelRef = useRef(null)
  const groupReactionsChannelRef = useRef(null)
  const groupUnreadChannelRef = useRef(null)
  const groupBottomRef = useRef(null)
  const groupSignedUrlCacheRef = useRef({}) // Cache: storagePath -> { url, expiresAt }
  const groupFileInputRef = useRef(null)
  const groupMessagesContainerRef = useRef(null)
  const directMessagesContainerRef = useRef(null)
  const directLongPressTimeoutRef = useRef(null)
  const groupLongPressTimeoutRef = useRef(null)
  const draftValueRef = useRef("")
  const menuRef = useRef(null)
  const groupMenuRef = useRef(null)
  const directSwipeStateRef = useRef({
    messageId: null,
    startX: 0,
    startY: 0,
    triggered: false,
    element: null,
  })

  // Refs for stable state access in callbacks
  const messagesRef = useRef([])
  const groupMessageReactionsRef = useRef({})
  const chatModeRef = useRef('direct')

  useEffect(() => {
    messagesRef.current = messages
    groupMessageReactionsRef.current = groupMessageReactions
    chatModeRef.current = chatMode
  })

  const requestedConversationId = routeConversationId || searchParams.get("conversation")
  const requestedTab = searchParams.get("tab")

  const postCache = usePostCacheStore((state) => state.posts)

  const getPostPreview = (post) => {
    if (!post) return "Post";
    if (post.content && post.content.trim().length > 0) {
      return post.content.slice(0, 40) + (post.content.length > 40 ? "..." : "");
    }
    if (post.image || post.image_url) {
      return "📷 Image post";
    }
    return "Post";
  };
  const isMobileConversationView = isMobileView && Boolean(routeConversationId)
  const isMobileGroupDetailView = isMobileView && Boolean(routeGroupId)
  const isMobileDetailView = isMobileConversationView || isMobileGroupDetailView

  useRouteScrollRestoration(`chat-${chatMode}`, false)

  useEffect(() => {
    const html = document.documentElement
    const body = document.body
    const previousHtmlOverflow = html.style.overflow
    const previousBodyOverflow = body.style.overflow
    const previousHtmlOverscroll = html.style.overscrollBehavior
    const previousBodyOverscroll = body.style.overscrollBehavior

    html.style.overflow = "hidden"
    body.style.overflow = "hidden"
    html.style.overscrollBehavior = "none"
    body.style.overscrollBehavior = "none"
    window.scrollTo({ top: 0, left: 0, behavior: "auto" })

    return () => {
      html.style.overflow = previousHtmlOverflow
      body.style.overflow = previousBodyOverflow
      html.style.overscrollBehavior = previousHtmlOverscroll
      body.style.overscrollBehavior = previousBodyOverscroll
    }
  }, [])

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 767px)")
    const handleMediaQueryChange = (event) => {
      setIsMobileView(event.matches)
    }

    setIsMobileView(mediaQuery.matches)

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", handleMediaQueryChange)
      return () => mediaQuery.removeEventListener("change", handleMediaQueryChange)
    }

    mediaQuery.addListener(handleMediaQueryChange)
    return () => mediaQuery.removeListener(handleMediaQueryChange)
  }, [])

  useEffect(() => {
    const setVh = () => {
      const h = window.visualViewport ? window.visualViewport.height : window.innerHeight
      document.documentElement.style.setProperty("--chat-visual-height", `${h}px`)
    }
    setVh()
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", setVh)
      window.visualViewport.addEventListener("scroll", setVh)
      return () => {
        window.visualViewport.removeEventListener("resize", setVh)
        window.visualViewport.removeEventListener("scroll", setVh)
      }
    }
    window.addEventListener("resize", setVh)
    return () => window.removeEventListener("resize", setVh)
  }, [])

  useEffect(() => {
    setHasFetchedGroups(false)
  }, [contextUser?.id])

  useEffect(() => {
    if (routeGroupId) {
      if (import.meta.env.DEV) {
        console.log("[Chat][RouteRestore] chatMode -> groups (routeGroupId present)", { routeGroupId, requestedTab })
      }
      setChatMode("groups")
      return
    }

    if (routeConversationId) {
      if (import.meta.env.DEV) {
        console.log("[Chat][RouteRestore] chatMode -> direct (routeConversationId present)", { routeConversationId, requestedTab })
      }
      setChatMode("direct")
      return
    }

    if (requestedTab === "groups" || requestedTab === "direct") {
      if (import.meta.env.DEV) {
        console.log("[Chat][RouteRestore] chatMode -> tab from query", { requestedTab })
      }
      setChatMode(requestedTab)
    }
  }, [requestedTab, routeConversationId, routeGroupId])

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setActiveMenuId(null);
      }
      if (groupMenuRef.current && !groupMenuRef.current.contains(event.target)) {
        setActiveMenuId(null);
      }

      setActiveReactionPickerMessageId(null)
      setActiveGroupEmojiPickerMessageId(null)
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const activeConversation = useMemo(
    () => {
      const visibleConversation = conversations.find((conversation) => conversation.id === activeConversationId) || null

      if (visibleConversation) {
        return visibleConversation
      }

      if (selectedConversation?.id === activeConversationId) {
        return selectedConversation
      }

      return null
    },
    [conversations, activeConversationId, selectedConversation]
  )

  const activeConversationPartner = useMemo(() => {
    if (!activeConversation?.partner?.id) {
      return activeConversation?.partner || null
    }

    return profilesById[activeConversation.partner.id] || activeConversation.partner
  }, [activeConversation, profilesById])

  const currentUserProfile = useMemo(() => {
    if (!contextUser?.id) {
      return null
    }

    return profilesById[contextUser.id] || null
  }, [contextUser?.id, profilesById])

  const senderDisplayName = useMemo(
    () =>
      contextUser?.full_name ||
      contextUser?.name ||
      contextUser?.username ||
      currentUserProfile?.display_name ||
      currentUserProfile?.full_name ||
      currentUserProfile?.name ||
      currentUserProfile?.username ||
      contextUser?.email ||
      "User",
    [
      contextUser?.full_name,
      contextUser?.name,
      contextUser?.username,
      contextUser?.email,
      currentUserProfile?.display_name,
      currentUserProfile?.full_name,
      currentUserProfile?.name,
      currentUserProfile?.username,
    ]
  )

  const isPartnerTyping = useMemo(
    () => Boolean(activeConversationId && typingByConversation[activeConversationId]),
    [activeConversationId, typingByConversation]
  )

  const mergeProfiles = useCallback((profiles) => {
    if (!profiles || profiles.length === 0) return

    setProfilesById((prev) => {
      const next = { ...prev }
      profiles.forEach((profile) => {
        if (profile?.id) {
          next[profile.id] = profile
        }
      })
      return next
    })
  }, [])

  const getDisplayName = useCallback((profile) => {
    const name = profile?.name?.trim()
    const username = profile?.username?.trim()

    if (name) {
      return name
    }

    if (username) {
      return username
    }

    return "Unknown user"
  }, [])

  const escapeRegExp = useCallback((value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), [])

  const closeConversationSearch = useCallback(() => {
    setConversationSearchOpen(false)
    setConversationSearchQuery("")
    setDebouncedConversationSearchQuery("")
    setMatchedMessageIds([])
    setActiveMatchIndex(0)
  }, [])

  const goToNextSearchMatch = useCallback(() => {
    setActiveMatchIndex((prev) => {
      if (matchedMessageIds.length === 0) {
        return 0
      }

      return (prev + 1) % matchedMessageIds.length
    })
  }, [matchedMessageIds.length])

  const goToPreviousSearchMatch = useCallback(() => {
    setActiveMatchIndex((prev) => {
      if (matchedMessageIds.length === 0) {
        return 0
      }

      return (prev - 1 + matchedMessageIds.length) % matchedMessageIds.length
    })
  }, [matchedMessageIds.length])

  const renderHighlightedMessageText = useCallback(
    (text, messageId) => {
      const normalizedText = typeof text === "string" ? text : ""
      const normalizedQuery = debouncedConversationSearchQuery.trim()

      if (!normalizedText || !normalizedQuery) {
        return normalizedText
      }

      const regex = new RegExp(`(${escapeRegExp(normalizedQuery)})`, "gi")
      const segments = normalizedText.split(regex)
      const activeMatchedMessageId = matchedMessageIds[activeMatchIndex]
      const isActiveMessage = activeMatchedMessageId === messageId

      return segments.map((segment, index) => {
        if (segment.toLowerCase() !== normalizedQuery.toLowerCase()) {
          return <span key={`${messageId}-segment-${index}`}>{segment}</span>
        }

        return (
          <mark
            key={`${messageId}-match-${index}`}
            className={isActiveMessage ? "rounded bg-[var(--chat-accent)]/90 px-0.5" : "rounded bg-[var(--chat-accent-soft)] px-0.5"}
          >
            {segment}
          </mark>
        )
      })
    },
    [activeMatchIndex, debouncedConversationSearchQuery, escapeRegExp, matchedMessageIds]
  )

  const fetchProfilesByIds = useCallback(async (userIds) => {
    const ids = [...new Set((userIds || []).filter(Boolean))]
    if (ids.length === 0) return []

    const { data, error: profileError } = await supabase
      .from("profiles")
      .select("id, username, avatar_url, name, is_online, last_seen")
      .in("id", ids)

    if (profileError) {
      devWarn("[Chat] Failed to load profiles:", profileError)
      return []
    }

    const profiles = data || []
    mergeProfiles(profiles)
    return profiles
  }, [mergeProfiles])

  const formatTime = (value) => {
    if (!value) return ""

    const localValue = dayjs.utc(value).local()
    if (!localValue.isValid()) return ""

    return localValue.format("hh:mm A")
  }

  const formatConversationListTime = (value) => {
    if (!value) return ""

    const localValue = dayjs.utc(value).local()
    if (!localValue.isValid()) return ""

    return localValue.format("hh:mm A")
  }

  // Conversation encryption key management - Shared via Database
  const getOrCreateConversationKey = useCallback(async (conversationId) => {
    if (!conversationId) return null

    // Check if already in memory cache
    if (conversationCryptoKeysRef.current[conversationId]) {
      return conversationCryptoKeysRef.current[conversationId]
    }

    try {
      // Try to fetch existing key from database first
      const { data: existingKey, error: fetchError } = await supabase
        .from("conversation_keys")
        .select("encrypted_key_user1, encrypted_key_user2")
        .eq("conversation_id", conversationId)
        .maybeSingle()

      // If table doesn't exist, the error will be caught and we'll fall back to memory-only
      if (fetchError) {
        console.warn(`[Chat] Could not fetch key from DB (table may not exist yet):`, fetchError.message)
        // Continue - will generate and store in memory only
      } else if (existingKey) {
        // Use the key for this user - we store both so either user can decrypt
        const keyToUse = existingKey.encrypted_key_user1 || existingKey.encrypted_key_user2

        if (keyToUse) {
          const validation = validateKey(keyToUse)
          if (validation.isValid) {
            const cryptoKey = await importKey(keyToUse)
            conversationCryptoKeysRef.current[conversationId] = cryptoKey
            debugLogKey(keyToUse, `Chat-Conversation-${conversationId}-FromDB`)
            devLog(`[Chat] [ok] Successfully loaded shared key for conversation ${conversationId}`)
            return cryptoKey
          }
        }
      }

      // Generate new key for this conversation if it doesn't exist
      devLog(`[Chat] Generating new encryption key for conversation ${conversationId}`)
      const newKey = await generateKey()
      const exportedKey = await exportKey(newKey)

      // Try to store in database so both users can access it
      try {
        const { error: insertError } = await supabase
          .from("conversation_keys")
          .insert({
            conversation_id: conversationId,
            encrypted_key_user1: exportedKey,
            encrypted_key_user2: exportedKey
          })
          .select()
          .single()

        if (insertError) {
          // Table might not exist yet - that's OK, we'll use memory-only
          if (insertError.code === '42P01') {
            console.warn(`[Chat] conversation_keys table does not exist yet. Using memory-only storage for encryption keys.`)
            console.warn(`[Chat] Please run the database migration: 20260402_create_conversation_keys.sql`)
          } else {
            console.warn(`[Chat] Failed to store key in database:`, insertError)
          }
        } else {
          devLog(`[Chat] [ok] Stored shared key in database for conversation ${conversationId}`)
        }
      } catch (dbErr) {
        console.warn(`[Chat] Database error storing key:`, dbErr)
      }

      // Cache in memory
      conversationCryptoKeysRef.current[conversationId] = newKey
      debugLogKey(exportedKey, `Chat-Conversation-${conversationId}-New`)
      return newKey
    } catch (err) {
      console.error(`[Chat] Failed to get/create encryption key for conversation ${conversationId}:`, err)
      return null
    }
  }, [])

  const getConversationKeyFresh = useCallback(async (conversationId) => {
    if (!conversationId) return null

    try {
      // Always fetch fresh from DB - do not use cache
      const { data: keyData, error: fetchError } = await supabase
        .from("conversation_keys")
        .select("encrypted_key_user1, encrypted_key_user2")
        .eq("conversation_id", conversationId)
        .maybeSingle()

      if (fetchError) {
        if (fetchError.code !== '42P01') {
          console.warn(`[Chat] Error fetching fresh key from database for ${conversationId}:`, fetchError.message)
        }
      } else if (keyData) {
        const keyToUse = keyData.encrypted_key_user1 || keyData.encrypted_key_user2

        if (keyToUse) {
          const validation = validateKey(keyToUse)
          if (validation.isValid) {
            const cryptoKey = await importKey(keyToUse)
            // Update cache with fresh key from DB
            conversationCryptoKeysRef.current[conversationId] = cryptoKey
            debugLogKey(keyToUse, `Chat-Conversation-${conversationId}-FreshFromDB`)
            devLog(`[Chat] [ok] Successfully loaded fresh key for conversation ${conversationId}`)
            return cryptoKey
          }
        }
      }

      console.warn(`[Chat] No encryption key found in database for conversation ${conversationId}`)
      return null
    } catch (err) {
      console.error(`[Chat] Failed to fetch fresh encryption key for conversation ${conversationId}:`, err)
      return null
    }
  }, [])

  const getConversationKey = useCallback(async (conversationId) => {
    if (!conversationId) return null

    // Check memory cache first
    if (conversationCryptoKeysRef.current[conversationId]) {
      return conversationCryptoKeysRef.current[conversationId]
    }

    // Cache miss - fetch fresh from DB
    return getConversationKeyFresh(conversationId)
  }, [getConversationKeyFresh])

  const getMessageType = useCallback((message) => {
    if (message?.type) {
      return message.type
    }

    return message?.media_url || message?.image_url ? "image" : "text"
  }, [])

  const getImageMessageUrl = useCallback(
    async (message) => {
      if (!message || getMessageType(message) !== "image") {
        return null
      }

      // Prefer new private storage path
      if (message.storage_path) {
        // Check if we have a valid cached signed URL
        const cached = signedImageUrlCacheRef.current[message.storage_path]
        if (cached && isSignedUrlValid(cached.expiresAt)) {
          devLog(`[Chat] Using cached signed URL for: ${message.storage_path}`)
          return cached.url
        }

        // Generate new signed URL (1 hour expiry)
        const result = await getSignedImageUrl(message.storage_path, 3600)
        if (result) {
          // Cache the signed URL with expiry time
          signedImageUrlCacheRef.current[message.storage_path] = result
          devLog(`[Chat] Generated new signed URL for: ${message.storage_path}`)
          return result.url
        }

        devWarn(`[Chat] Failed to generate signed URL for: ${message.storage_path}`)
        return null
      }

      // Fall back to old public URLs for backward compatibility
      return message.media_url || message.image_url || null
    },
    [getMessageType]
  )

  const formatLastSeenStatus = useCallback((lastSeenValue) => {
    if (!lastSeenValue) {
      return "Last seen unavailable"
    }

    const lastSeenLocal = dayjs.utc(lastSeenValue).local()
    if (!lastSeenLocal.isValid()) {
      return "Last seen unavailable"
    }

    const minutesSinceLastSeen = dayjs().diff(lastSeenLocal, "minute", true)
    if (minutesSinceLastSeen < 1) {
      return "Active now"
    }

    return `Last seen ${dayjs().to(lastSeenLocal)}`
  }, [])

  const activeConversationStatus = useMemo(
    () => {
      const isPartnerOnline = Boolean(activeConversationPartner?.is_online)

      if (isPartnerOnline) {
        return "Active now"
      }

      return formatLastSeenStatus(activeConversationPartner?.last_seen)
    },
    [activeConversationPartner?.is_online, activeConversationPartner?.last_seen, formatLastSeenStatus, presenceNow]
  )

  const getPrivateMessageTickState = useCallback((message) => {
    if (!message || message.sender_id !== contextUser?.id) {
      return null
    }

    if (message.is_read || message.seen_at || message.delivery_status === "seen") {
      return "read"
    }

    if (
      message.delivery_status === "delivered" ||
      Boolean(message.delivered_at) ||
      activeConversationPartner?.is_online
    ) {
      return "delivered"
    }

    return "sent"
  }, [activeConversationPartner?.is_online, contextUser?.id])

  const sortConversationsByPriority = useCallback((conversationList, unreadMap = {}, typingMap = {}) => {
    const list = Array.isArray(conversationList) ? [...conversationList] : []

    return list.sort((a, b) => {
      const aTyping = typingMap[a.id] ? 1 : 0
      const bTyping = typingMap[b.id] ? 1 : 0
      if (aTyping !== bTyping) {
        return bTyping - aTyping
      }

      const aUnread = unreadMap[a.id] > 0 ? 1 : 0
      const bUnread = unreadMap[b.id] > 0 ? 1 : 0
      if (aUnread !== bUnread) {
        return bUnread - aUnread
      }

      const aTime = a.last_message_at || a.created_at
      const bTime = b.last_message_at || b.created_at
      return new Date(bTime).getTime() - new Date(aTime).getTime()
    })
  }, [])

  const isPreferenceArchived = useCallback((preference) => preference?.is_archived === true, [])
  const isPreferenceDeleted = useCallback((preference) => preference?.is_deleted === true, [])
  const getDeleteBoundary = useCallback((conversation, userId) => {
    return conversation?.deleted_by?.[userId] || null
  }, [])

  const normalizeDbTimestamp = useCallback((timestamp) => {
    if (!timestamp) return null
    if (timestamp instanceof Date) return timestamp.toISOString()

    if (typeof timestamp !== "string") return null

    if (/[zZ]$/.test(timestamp) || /[+-]\d\d:\d\d$/.test(timestamp)) {
      return timestamp
    }

    return `${timestamp}Z`
  }, [])

  const parseDbTimestamp = useCallback((timestamp) => {
    const normalized = normalizeDbTimestamp(timestamp)
    if (!normalized) return Number.NaN

    const parsed = Date.parse(normalized)
    return Number.isNaN(parsed) ? Number.NaN : parsed
  }, [normalizeDbTimestamp])

  const fetchConversationPreferences = useCallback(async (userId, conversationIds = []) => {
    if (!userId || conversationIds.length === 0) {
      setConversationPreferencesById({})
      return
    }

    try {
      const { data, error: fetchError } = await supabase
        .from("conversation_preferences")
        .select("conversation_id, is_archived, is_deleted")
        .eq("user_id", userId)
        .is("group_id", null)
        .in("conversation_id", conversationIds)

      if (fetchError) {
        console.error("[Chat] Failed to fetch conversation preferences:", fetchError)
        return
      }

      const mapped = {}
      ;(data || []).forEach((row) => {
        if (!row?.conversation_id) return
        mapped[row.conversation_id] = {
          is_archived: row.is_archived === true,
          is_deleted: row.is_deleted === true,
        }
      })

      setConversationPreferencesById(mapped)
      return mapped
    } catch (err) {
      console.error("[Chat] Exception fetching conversation preferences:", err)
      return {}
    }
  }, [])

  const fetchGroupPreferences = useCallback(async (userId, groupIds = []) => {
    if (!userId || groupIds.length === 0) {
      setGroupPreferencesById({})
      return
    }

    try {
      const { data, error: fetchError } = await supabase
        .from("conversation_preferences")
        .select("group_id, is_archived, is_deleted")
        .eq("user_id", userId)
        .is("conversation_id", null)
        .in("group_id", groupIds)

      if (fetchError) {
        console.error("[Chat] Failed to fetch group preferences:", fetchError)
        return
      }

      const mapped = {}
        ; (data || []).forEach((row) => {
          if (!row?.group_id) return
          mapped[row.group_id] = {
            is_archived: row.is_archived === true,
            is_deleted: row.is_deleted === true
          }
        })

      setGroupPreferencesById(mapped)
    } catch (err) {
      console.error("[Chat] Exception fetching group preferences:", err)
    }
  }, [])

  const upsertConversationPreference = useCallback(
    async (conversationId, updates) => {
      if (!contextUser?.id || !conversationId) return false

      const existingPreference = conversationPreferencesById[conversationId] || {}
      const nextPreference = {
        is_archived: updates?.is_archived ?? existingPreference.is_archived ?? false,
        is_deleted: updates?.is_deleted ?? existingPreference.is_deleted ?? false
      }

      setConversationPreferencesById((prev) => ({
        ...prev,
        [conversationId]: nextPreference
      }))

      const { error: upsertError } = await supabase.from("conversation_preferences").upsert(
        {
          user_id: contextUser.id,
          conversation_id: conversationId,
          group_id: null,
          is_archived: nextPreference.is_archived,
          is_deleted: nextPreference.is_deleted,
          updated_at: new Date().toISOString()
        },
        { onConflict: "user_id,conversation_id" }
      )

      if (upsertError) {
        console.error("[Chat] Failed to update conversation preference:", upsertError)
        setConversationPreferencesById((prev) => {
          const reverted = { ...prev }
          if (existingPreference && Object.keys(existingPreference).length > 0) {
            reverted[conversationId] = existingPreference
          } else {
            delete reverted[conversationId]
          }
          return reverted
        })
        return false
      }

      return true
    },
    [contextUser?.id, conversationPreferencesById]
  )

  const upsertGroupPreference = useCallback(
    async (groupId, updates) => {
      if (!contextUser?.id || !groupId) return false

      const existingPreference = groupPreferencesById[groupId] || {}
      const nextPreference = {
        is_archived: updates?.is_archived ?? existingPreference.is_archived ?? false,
        is_deleted: updates?.is_deleted ?? existingPreference.is_deleted ?? false
      }

      setGroupPreferencesById((prev) => ({
        ...prev,
        [groupId]: nextPreference
      }))

      const { error: upsertError } = await supabase.from("conversation_preferences").upsert(
        {
          user_id: contextUser.id,
          conversation_id: null,
          group_id: groupId,
          is_archived: nextPreference.is_archived,
          is_deleted: nextPreference.is_deleted,
          updated_at: new Date().toISOString()
        },
        { onConflict: "user_id,group_id" }
      )

      if (upsertError) {
        console.error("[Chat] Failed to update group preference:", upsertError)
        setGroupPreferencesById((prev) => {
          const reverted = { ...prev }
          if (existingPreference && Object.keys(existingPreference).length > 0) {
            reverted[groupId] = existingPreference
          } else {
            delete reverted[groupId]
          }
          return reverted
        })
        return false
      }

      return true
    },
    [contextUser?.id, groupPreferencesById]
  )

  const updateMyLastSeen = useCallback(async (force = false) => {
    if (!contextUser?.id) {
      return
    }

    const now = Date.now()
    if (!force && now - lastPresenceUpdateRef.current < 30_000) {
      return
    }

    lastPresenceUpdateRef.current = now

    const { error: updateError } = await supabase
      .from("profiles")
      .update({ last_seen: new Date(now).toISOString(), is_online: true })
      .eq("id", contextUser.id)

    if (updateError) {
      devWarn("[Chat] Failed to update last_seen:", updateError)
    }
  }, [contextUser?.id])

  const persistLastSeenNow = useCallback(async () => {
    if (!contextUser?.id) return

    const { error: updateError } = await supabase
      .from("profiles")
      .update({ is_online: false, last_seen: new Date().toISOString() })
      .eq("id", contextUser.id)

    if (updateError) {
      devWarn("[Chat] Failed to persist last_seen on disconnect:", updateError)
    }
  }, [contextUser?.id])

  const syncOnlineUsersFromPresence = useCallback((channel) => {
    if (!channel) return

    const state = channel.presenceState()
    const nextOnlineUsersById = {}

    Object.entries(state).forEach(([key, entries]) => {
      ; (entries || []).forEach((entry) => {
        const userId = entry?.user_id || key
        if (userId) {
          nextOnlineUsersById[userId] = true
        }
      })
    })

    setOnlineUsersById(nextOnlineUsersById)
  }, [])

  const dispatchUnreadBadgeUpdate = useCallback((countsByConversation) => {
    const totalUnreadCount = Object.values(countsByConversation || {}).reduce((sum, count) => sum + count, 0)

    window.dispatchEvent(
      new CustomEvent("chatUnreadChanged", {
        detail: {
          totalUnreadCount,
          unreadCountsByConversation: countsByConversation || {}
        }
      })
    )
  }, [])

  const clearUnreadForConversation = useCallback((conversationId) => {
    if (!conversationId) return
    let nextCounts = {}
    setUnreadCountsByConversation((prev) => {
      if (!prev[conversationId]) return prev
      const next = { ...prev }
      delete next[conversationId]
      nextCounts = next
      return next
    })
    setTimeout(() => dispatchUnreadBadgeUpdate(nextCounts), 0)
  }, [dispatchUnreadBadgeUpdate])

  const incrementUnreadForConversation = useCallback((conversationId) => {
    if (!conversationId) return
    let nextCounts = {}
    setUnreadCountsByConversation((prev) => {
      const next = { ...prev, [conversationId]: (prev[conversationId] || 0) + 1 }
      nextCounts = next
      return next
    })
    setTimeout(() => dispatchUnreadBadgeUpdate(nextCounts), 0)
  }, [dispatchUnreadBadgeUpdate])

  const decrementUnreadForConversation = useCallback((conversationId) => {
    if (!conversationId) return
    let nextCounts = {}
    setUnreadCountsByConversation((prev) => {
      const current = prev[conversationId] || 0
      if (current <= 0) return prev
      const next = { ...prev }
      const updated = current - 1
      if (updated <= 0) {
        delete next[conversationId]
      } else {
        next[conversationId] = updated
      }
      nextCounts = next
      return next
    })
    setTimeout(() => dispatchUnreadBadgeUpdate(nextCounts), 0)
  }, [dispatchUnreadBadgeUpdate])

  const navigateToConversation = useCallback((conversationId, options = {}) => {
    if (conversationId) {
      navigate(`/chat/direct/${conversationId}`, { replace: options.replace === true })
    } else {
      navigate("/chat?tab=direct", { replace: options.replace === true })
    }

    setActiveConversationId(conversationId || null)
  }, [navigate])

  const handleOpenMenu = (e, messageId, isSentOverride = null) => {
    e.stopPropagation();
    e.preventDefault();

    const rect = e.currentTarget.getBoundingClientRect();
    const isSent = isSentOverride !== null ? isSentOverride : e.currentTarget.closest('.justify-end') !== null;
    
    const x = isSent ? rect.right - 90 : rect.left + 90;
    const y = rect.bottom + 5;
    const anchorHeight = rect.height;

    setMenuPosition({ x, y, anchorHeight });
    setActiveMenuId(messageId);
    
    // Ensure the message and its new menu are visible in the chat area
    e.currentTarget.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };

  const handleOpenMessageMenu = (e, messageId, isSent) => {
    handleOpenMenu(e, messageId, isSent);
    setActiveReactionPickerMessageId(null)
  }

  const handleOpenGroupMessageMenu = (e, messageId, isSent) => {
    handleOpenMenu(e, messageId, isSent);
    setActiveGroupEmojiPickerMessageId(null)
  }

  const startDirectMessageLongPress = useCallback(
    (e, messageId) => {
      if (!isMobileView || !messageId) {
        return
      }

      if (directLongPressTimeoutRef.current) {
        clearTimeout(directLongPressTimeoutRef.current)
      }

      const rect = e.currentTarget.getBoundingClientRect();
      const isOnRightHalf = rect.left > window.innerWidth / 2;
      const x = isOnRightHalf ? rect.right - 90 : rect.left + 90;
      const y = rect.bottom + 5;
      const anchorHeight = rect.height;

      directLongPressTimeoutRef.current = setTimeout(() => {
        setMenuPosition({ x, y, anchorHeight })
        setActiveMenuId(messageId)
        setActiveReactionPickerMessageId(null)
      }, 400)
    },
    [isMobileView]
  )

  const cancelDirectMessageLongPress = useCallback(() => {
    if (directLongPressTimeoutRef.current) {
      clearTimeout(directLongPressTimeoutRef.current)
      directLongPressTimeoutRef.current = null
    }
  }, [])

  const startGroupMessageLongPress = useCallback(
    (e, messageId) => {
      if (!isMobileView || !messageId) {
        return
      }

      if (groupLongPressTimeoutRef.current) {
        clearTimeout(groupLongPressTimeoutRef.current)
      }

      const rect = e.currentTarget.getBoundingClientRect();
      const isOnRightHalf = rect.left > window.innerWidth / 2;
      const x = isOnRightHalf ? rect.right - 90 : rect.left + 90;
      const y = rect.bottom + 5;
      const anchorHeight = rect.height;

      groupLongPressTimeoutRef.current = setTimeout(() => {
        setMenuPosition({ x, y, anchorHeight })
        setActiveMenuId(messageId)
        setActiveGroupEmojiPickerMessageId(null)
      }, 400)
    },
    [isMobileView]
  )

  const cancelGroupMessageLongPress = useCallback(() => {
    if (groupLongPressTimeoutRef.current) {
      clearTimeout(groupLongPressTimeoutRef.current)
      groupLongPressTimeoutRef.current = null
    }
  }, [])

  useEffect(() => {
    return () => {
      if (directLongPressTimeoutRef.current) {
        clearTimeout(directLongPressTimeoutRef.current)
      }

      if (groupLongPressTimeoutRef.current) {
        clearTimeout(groupLongPressTimeoutRef.current)
      }
    }
  }, [])

  const clearTypingTimers = useCallback(() => {
    if (typingStopTimerRef.current) {
      clearTimeout(typingStopTimerRef.current)
      typingStopTimerRef.current = null
    }
  }, [])

  const setConversationTypingState = useCallback((conversationId, isTyping) => {
    if (!conversationId) return

    const timers = typingConversationTimersRef.current

    if (isTyping) {
      setTypingByConversation((prev) => {
        if (prev[conversationId]) {
          return prev
        }

        return {
          ...prev,
          [conversationId]: true
        }
      })

      if (timers[conversationId]) {
        clearTimeout(timers[conversationId])
      }

      timers[conversationId] = setTimeout(() => {
        setTypingByConversation((prev) => {
          if (!prev[conversationId]) {
            return prev
          }

          const next = { ...prev }
          delete next[conversationId]
          return next
        })

        delete timers[conversationId]
      }, 2000)

      return
    }

    if (timers[conversationId]) {
      clearTimeout(timers[conversationId])
      delete timers[conversationId]
    }

    setTypingByConversation((prev) => {
      if (!prev[conversationId]) {
        return prev
      }

      const next = { ...prev }
      delete next[conversationId]
      return next
    })
  }, [])

  const broadcastTyping = useCallback(async (typing) => {
    const channel = activeConversationChannelRef.current
    if (!channel || !activeConversationId || !contextUser?.id) {
      return
    }

    try {
      await channel.send({
        type: "broadcast",
        event: "typing",
        payload: {
          conversation_id: activeConversationId,
          user_id: contextUser.id,
          is_typing: typing
        }
      })
    } catch (typingError) {
      devWarn("[Chat] Failed to broadcast typing state:", typingError)
    }
  }, [activeConversationId, contextUser?.id])

  const stopTyping = useCallback(() => {
    if (!isTypingRef.current) {
      return
    }

    isTypingRef.current = false
    broadcastTyping(false)

    if (typingStopTimerRef.current) {
      clearTimeout(typingStopTimerRef.current)
      typingStopTimerRef.current = null
    }
  }, [broadcastTyping])

  const broadcastReactionEvent = useCallback(
    async (action, reaction) => {
      const channel = activeConversationChannelRef.current

      if (!channel || !activeConversationId || !contextUser?.id || !action || !reaction?.message_id) {
        return
      }

      try {
        await channel.send({
          type: "broadcast",
          event: "reaction",
          payload: {
            action,
            conversation_id: activeConversationId,
            reaction,
            sender_id: contextUser.id
          }
        })
      } catch (broadcastError) {
        devWarn("[Chat] Failed to broadcast reaction event:", broadcastError)
      }
    },
    [activeConversationId, contextUser?.id]
  )

  const setDraftInputValue = useCallback((value) => {
    const nextValue = typeof value === "string" ? value : ""
    draftValueRef.current = nextValue
    setHasDraft(Boolean(nextValue.trim()))

    if (inputRef.current && inputRef.current.value !== nextValue) {
      inputRef.current.value = nextValue
    }
  }, [])

  const handleDraftChange = useCallback((value) => {
    draftValueRef.current = value

    const trimmed = value.trim()
    const nextHasDraft = Boolean(trimmed)
    setHasDraft((prev) => (prev === nextHasDraft ? prev : nextHasDraft))

    if (!activeConversationId || !contextUser?.id || !activeConversationChannelRef.current) {
      return
    }

    if (!trimmed) {
      stopTyping()
      return
    }

    const now = Date.now()
    const shouldBroadcastTyping = !isTypingRef.current || now - lastTypingBroadcastAtRef.current > 1000

    if (shouldBroadcastTyping) {
      isTypingRef.current = true
      lastTypingBroadcastAtRef.current = now
      broadcastTyping(true)
    }

    if (typingStopTimerRef.current) {
      clearTimeout(typingStopTimerRef.current)
    }

    typingStopTimerRef.current = setTimeout(() => {
      stopTyping()
    }, 2000)
  }, [activeConversationId, broadcastTyping, contextUser?.id, stopTyping])

  const updateMessageSeenStatus = useCallback((messageId) => {
    if (!messageId) return

    setMessages((prev) =>
      prev.map((message) =>
        message.id === messageId
          ? {
            ...message,
            is_read: true
          }
          : message
      )
    )
  }, [])

  useEffect(() => {
    updateMessageSeenStatusRef.current = updateMessageSeenStatus
  }, [updateMessageSeenStatus])

  useEffect(() => {
    getConversationKeyRef.current = getConversationKey
    getMessageTypeRef.current = getMessageType
    appendMessageToCacheRef.current = appendMessageToCache
    clearUnreadForConversationRef.current = clearUnreadForConversation
    handleReactionInsertRef.current = handleReactionInsert
    updateReactionInStateRef.current = updateReactionInState
    handleReactionDeleteRef.current = handleReactionDelete
    sortConversationsByPriorityRef.current = sortConversationsByPriority
    contextUserIdRef.current = contextUser?.id
  })

  const addReactionToState = useCallback((newReaction) => {
    const { message_id, emoji, user_id } = newReaction

    if (!message_id || !emoji || !user_id) {
      devWarn("[Chat] Invalid reaction data for INSERT:", newReaction)
      return
    }

    setMessages((prevMessages) =>
      prevMessages.map((msg) => {
        if (msg.id !== message_id) return msg

        const existing = msg.reactions || []

        // Prevent duplicate reaction
        const alreadyExists = existing.some((r) => r.user_id === user_id && r.emoji === emoji)

        if (alreadyExists) {
          devLog("[Chat] Reaction already exists, skipping duplicate")
          return msg
        }

        return {
          ...msg,
          reactions: [...existing, newReaction]
        }
      })
    )
  }, [])

  const removeReactionFromState = useCallback((oldReaction) => {
    const { message_id, emoji, user_id, id } = oldReaction

    if (!message_id) {
      devWarn("[Chat] Invalid reaction data for DELETE:", oldReaction)
      return
    }

    setMessages((prevMessages) =>
      prevMessages.map((msg) => {
        if (msg.id !== message_id) return msg

        return {
          ...msg,
          reactions: (msg.reactions || []).filter(
            (r) => !(r.id === id || (r.user_id === user_id && r.emoji === emoji))
          )
        }
      })
    )
  }, [])

  const handleReactionDelete = useCallback((oldData) => {
    if (import.meta.env.DEV) console.log("[ReactionRealtime] DELETE", oldData)
    const { message_id, group_message_id, user_id, emoji } = oldData

    if (group_message_id) {
      // GROUP reaction — update groupMessageReactions state
      setGroupMessageReactions((prev) => {
        const existing = prev[group_message_id] || []
        const updated = existing.filter((r) => !(r.user_id === user_id && r.emoji === emoji))
        if (existing.length === updated.length) return prev
        return { ...prev, [group_message_id]: updated.length > 0 ? updated : undefined }
      })
      return
    }

    if (!message_id) return

    // DIRECT reaction — update messages state
    setMessages((prevMessages) =>
      prevMessages.map((msg) => {
        if (msg.id !== message_id) return msg
        return {
          ...msg,
          reactions: (msg.reactions || []).filter(
            (r) => !(r.user_id === user_id && r.emoji === emoji)
          )
        }
      })
    )
  }, [])

  const handleReactionInsert = useCallback((newData) => {
    if (import.meta.env.DEV) console.log("[ReactionRealtime] INSERT", newData)
    const { message_id, group_message_id, user_id, emoji } = newData

    // 1. Resolve profile for this reaction
    const profile = newData.profiles || (user_id === contextUser?.id ? currentUserProfile : (profilesById[user_id] || null))
    const reactionWithProfile = { ...newData, profiles: profile }

    if (group_message_id) {
      // GROUP reaction — update groupMessageReactions state
      setGroupMessageReactions((prev) => {
        const existing = prev[group_message_id] || []
        const existingIndex = existing.findIndex((r) => r.user_id === user_id && r.emoji === emoji)
        
        if (existingIndex !== -1) {
          // If we have a temp reaction and this is the real one, replace it
          if (String(existing[existingIndex].id).startsWith('temp-')) {
            const updated = [...existing]
            updated[existingIndex] = reactionWithProfile
            return { ...prev, [group_message_id]: updated }
          }
          return prev // Skip duplicate
        }
        
        return { ...prev, [group_message_id]: [...existing, reactionWithProfile] }
      })
      return
    }

    if (!message_id) return

    // DIRECT reaction — update messages state
    setMessages((prevMessages) =>
      prevMessages.map((msg) => {
        if (msg.id !== message_id) return msg
        const existing = msg.reactions || []
        
        const existingIndex = existing.findIndex((r) => r.user_id === user_id && r.emoji === emoji)
        
        if (existingIndex !== -1) {
          // If we have a temp reaction and this is the real one, replace it
          if (String(existing[existingIndex].id).startsWith('temp-')) {
            const updated = [...existing]
            updated[existingIndex] = reactionWithProfile
            return { ...msg, reactions: updated }
          }
          return msg // Skip duplicate
        }

        return {
          ...msg,
          reactions: [...existing, reactionWithProfile]
        }
      })
    )
  }, [contextUser?.id, currentUserProfile, profilesById])

  const updateReactionInState = useCallback((updatedReaction) => {
    if (!updatedReaction?.message_id || !updatedReaction?.id) {
      devWarn("[Chat] Invalid reaction data for UPDATE:", updatedReaction)
      return
    }

    setMessages((prevMessages) =>
      prevMessages.map((msg) => {
        if (msg.id !== updatedReaction.message_id) return msg
        return {
          ...msg,
          reactions: (msg.reactions || []).map((reaction) =>
            reaction.id === updatedReaction.id ? { ...reaction, ...updatedReaction } : reaction
          )
        }
      })
    )
  }, [])

  const fetchReactionsForMessages = useCallback(
    async (messageList) => {
      const messageIds = [...new Set((messageList || []).map((message) => message?.id).filter(Boolean))]
      if (messageIds.length === 0) {
        // Still set empty reactions in messages
        setMessages((prev) =>
          prev.map((msg) => ({
            ...msg,
            reactions: msg.reactions || []
          }))
        )
        return
      }

      const { data, error: reactionsError } = await supabase
        .from("message_reactions")
        .select("id, message_id, user_id, emoji, profiles ( id, username, avatar_url, name )")
        .in("message_id", messageIds)

      if (reactionsError) {
        console.error("[Chat] Failed to fetch message reactions:", reactionsError)
        return
      }

      devLog("[Chat] Fetched", (data || []).length, "reactions")

      // Group reactions by message_id
      const reactionsByMessageId = {}
        ; (data || []).forEach((reaction) => {
          if (!reaction?.message_id) return
          if (!reactionsByMessageId[reaction.message_id]) {
            reactionsByMessageId[reaction.message_id] = []
          }
          reactionsByMessageId[reaction.message_id].push(reaction)
        })

      devLog("[Chat] Grouped reactions by message:", Object.keys(reactionsByMessageId).length, "messages have reactions")

      // Update messages with reactions
      setMessages((prev) => {
        const updated = prev.map((msg) => ({
          ...msg,
          reactions: reactionsByMessageId[msg.id] || []
        }))
        devLog("[Chat] Updated messages with reactions, total reactions across all messages:", Object.values(reactionsByMessageId).reduce((sum, arr) => sum + arr.length, 0))
        return updated
      })
    },
    []
  )

  const enrichMessagesWithPosts = async (messages) => {
    const updated = await Promise.all(
      messages.map(async (msg) => {
        if (!msg.post_id) return msg;

        try {
          const { data } = await supabase
            .from("posts")
            .select("id, content, image_url, updated_at, is_edited")
            .eq("id", msg.post_id)
            .maybeSingle();

          return { ...msg, post: data };
        } catch (err) {
          devWarn("[Chat] Failed to enrich post for message:", msg.id, err);
          return msg;
        }
      })
    );

    return updated;
  };

  const fetchMessages = useCallback(async (conversationId, { force = false, silent = false } = {}) => {
    if (!conversationId) return

    const cachedMessages = useChatStore.getState().messagesByConversationId[conversationId] || []

    // Immediately set cached messages for fast switching
    if (cachedMessages.length > 0) {
      setMessages(cachedMessages)
      setOldestTimestamp(cachedMessages[0]?.created_at || null)
    }

    // Skip network fetch if cache is fresh
    if (!force && cachedMessages.length > 0 && !shouldFetchMessages(conversationId)) {
      return
    }

    try {
      if (!silent && cachedMessages.length === 0) {
        setLoadingMessages(true)
      }
      setError("")

      // 1. Fetch deleteTime for current user
      const { data: convData } = await supabase
        .from("conversations")
        .select("deleted_by")
        .eq("id", conversationId)
        .single()

      const deleteTime = convData?.deleted_by?.[contextUser?.id]

      // 2. Build query with deleteTime filter if applicable
      let query = supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: false })
        .limit(30)

      if (deleteTime) {
        query = query.gt("created_at", deleteTime)
      }

      const { data, error: fetchError } = await query

      if (fetchError) {
        console.error("[Chat] Failed to load messages:", fetchError)
        setError("Failed to load messages")
        return
      }

      // Reverse to get chronological order
      const sortedData = (data || []).reverse()

      // Get encryption key for this conversation
      const cryptoKey = await getConversationKeyFresh(conversationId)

      // Decrypt messages and store in decrypted_text
      const decryptedMessages = await Promise.all(
        sortedData.map(async (message) => {
          const decrypted = {
            ...message,
            type: getMessageType(message),
            reactions: [],
          }
          try {
            if (message.encrypted_content && message.iv && cryptoKey) {
              const decryptedContent = await decrypt(message.encrypted_content, message.iv, cryptoKey)
              decrypted.content = decryptedContent
              decrypted.decrypted_text = decryptedContent
            } else {
              decrypted.content = message.content || ""
              decrypted.decrypted_text = message.content || ""
            }
          } catch {
            decrypted.content = message.content || "[Unable to decrypt]"
            decrypted.decrypted_text = decrypted.content
          }
          return decrypted
        })
      )

      // Enrich with post data
      const enrichedMessages = await enrichMessagesWithPosts(decryptedMessages)

      const participantIds = enrichedMessages.flatMap((message) => [message.sender_id, message.receiver_id])
      await fetchProfilesByIds(participantIds)

      setMessages((prev) => {
        const map = new Map()
          ;[...prev, ...enrichedMessages].forEach((m) => {
            if (m.id) map.set(m.id, m)
          })
        return Array.from(map.values())
      })
      setMessagesCache(conversationId, enrichedMessages)
      setOldestTimestamp(decryptedMessages[0]?.created_at || null)
      setHasMoreMessages(decryptedMessages.length === 30)

      clearUnreadForConversation(conversationId)
      await fetchReactionsForMessages(decryptedMessages)
    } catch (err) {
      console.error("[Chat] Messages exception:", err)
      setError("Failed to load messages")
    } finally {
      if (!silent) {
        setLoadingMessages(false)
      }
    }
  }, [fetchProfilesByIds, fetchReactionsForMessages, getMessageType, setMessagesCache, shouldFetchMessages, clearUnreadForConversation, getConversationKeyFresh])

  const loadOlderMessages = useCallback(async () => {
    if (!activeConversationId || !oldestTimestamp || !hasMoreMessages || loadingOlder) return

    try {
      setLoadingOlder(true)

      // Fetch deleteTime for current user to prevent loading deleted history
      const { data: convData } = await supabase
        .from("conversations")
        .select("deleted_by")
        .eq("id", activeConversationId)
        .single()

      const deleteTime = convData?.deleted_by?.[contextUser?.id]

      let query = supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", activeConversationId)
        .lt("created_at", oldestTimestamp)
        .order("created_at", { ascending: false })
        .limit(30)

      if (deleteTime) {
        query = query.gt("created_at", deleteTime)
      }

      const { data, error: fetchError } = await query

      if (fetchError) {
        console.error("[Chat] Failed to load older messages:", fetchError)
        return
      }

      if (!data || data.length === 0) {
        setHasMoreMessages(false)
        return
      }

      const cryptoKey = await getConversationKey(activeConversationId)
      const sortedData = data.reverse()

      const decryptedMessages = await Promise.all(
        sortedData.map(async (message) => {
          const decrypted = {
            ...message,
            type: getMessageType(message),
            reactions: [],
          }
          try {
            if (message.encrypted_content && message.iv && cryptoKey) {
              const decryptedContent = await decrypt(message.encrypted_content, message.iv, cryptoKey)
              decrypted.content = decryptedContent
              decrypted.decrypted_text = decryptedContent
            } else {
              decrypted.content = message.content || ""
              decrypted.decrypted_text = message.content || ""
            }
          } catch {
            decrypted.content = message.content || "[Unable to decrypt]"
            decrypted.decrypted_text = decrypted.content
          }
          return decrypted
        })
      )

      // Enrich with post data
      const enrichedMessages = await enrichMessagesWithPosts(decryptedMessages)

      const participantIds = enrichedMessages.flatMap((m) => [m.sender_id, m.receiver_id])
      await fetchProfilesByIds(participantIds)

      setMessages((prev) => {
        const map = new Map()
          ;[...enrichedMessages, ...prev].forEach((m) => {
            if (m.id) map.set(m.id, m)
          })
        return Array.from(map.values())
      })
      setOldestTimestamp(enrichedMessages[0]?.created_at)
      setHasMoreMessages(data.length === 30)

      await fetchReactionsForMessages(enrichedMessages)
    } catch (err) {
      console.error("[Chat] Error loading older messages:", err)
    } finally {
      setLoadingOlder(false)
    }
  }, [activeConversationId, oldestTimestamp, hasMoreMessages, loadingOlder, getConversationKey, getMessageType, fetchProfilesByIds, fetchReactionsForMessages])

  useEffect(() => {
    const container = directMessagesContainerRef.current
    if (!container) return

    const handleScroll = () => {
      // If we are at the top, load more
      if (container.scrollTop < 50 && hasMoreMessages && !loadingOlder && !loadingMessages) {
        loadOlderMessages()
      }
    }

    container.addEventListener("scroll", handleScroll)
    return () => container.removeEventListener("scroll", handleScroll)
  }, [hasMoreMessages, loadingOlder, loadingMessages, loadOlderMessages])

  const fetchConversations = useCallback(async (userId, { force = false, silent = false } = {}) => {
    if (!userId) return

    if (!force && useChatStore.getState().conversations.length > 0 && !shouldFetchConversations()) {
      setLoadingConversations(false)
      return
    }

    try {
      setAllConversations(null)
      if (!silent) {
        setLoadingConversations(true)
      }
      setError("")

      // 1. Load ALL conversations for the current user (no delete filtering yet)
      const { data: allConversationsData, error: fetchError } = await supabase
        .from("conversations")
        .select("id, user1_id, user2_id, created_at, updated_at, deleted_by")
        .or(`user1_id.eq.${userId},user2_id.eq.${userId}`)
        .order("created_at", { ascending: false })

      if (fetchError) {
        console.error("[Chat] Failed to load conversations:", fetchError)
        setError("Failed to load conversations")
        setConversations([])
        setLoadingConversations(false)
        return
      }

      const allConversations = allConversationsData || []
      const rawConversations = allConversations
      const allConversationIds = allConversations.map((c) => c.id).filter(Boolean)

      // 2. Load ALL conversation preferences
      if (allConversationIds.length > 0) {
        const { data: prefsData, error: prefsError } = await supabase
          .from("conversation_preferences")
          .select("conversation_id, is_archived, is_deleted")
          .eq("user_id", userId)
          .is("group_id", null)
          .in("conversation_id", allConversationIds)

        if (!prefsError && prefsData) {
          const prefMap = {}
          prefsData.forEach((row) => {
            prefMap[row.conversation_id] = {
              is_archived: row.is_archived === true,
              is_deleted: row.is_deleted === true
            }
          })
          setConversationPreferencesById((prev) => ({ ...prev, ...prefMap }))
        }
      }

      // 3. Fetch latest messages and unread counts for ALL conversation IDs
      let latestMessageByConversationId = {}
      let unreadMap = {}

      if (allConversationIds.length > 0) {
        // A. Fetch unread counts for all conversations in one batch
        const { data: unreadRows } = await supabase
          .from("messages")
          .select("conversation_id")
          .in("conversation_id", allConversationIds)
          .eq("receiver_id", userId)
          .eq("is_read", false)

        if (unreadRows) {
          unreadRows.forEach((msg) => {
            unreadMap[msg.conversation_id] = (unreadMap[msg.conversation_id] || 0) + 1
          })
        }

        // B. Fetch latest messages for all conversations in one batch for previews/sorting
        const { data: messageRows } = await supabase
          .from("messages")
          .select("id, conversation_id, sender_id, receiver_id, content, encrypted_content, type, is_read, created_at, post_id, storage_path")
          .in("conversation_id", allConversationIds)
          .order("created_at", { ascending: false })
          .limit(allConversationIds.length * 20)

        if (messageRows) {
          messageRows.forEach((message) => {
            if (!latestMessageByConversationId[message.conversation_id]) {
              latestMessageByConversationId[message.conversation_id] = message
            }
          })
        }
      }

      const partnerIds = [
        ...new Set(
          allConversations
            .map((conversation) =>
              conversation.user1_id === userId ? conversation.user2_id : conversation.user1_id
            )
            .filter(Boolean)
        )
      ]

      const profileData = await fetchProfilesByIds(partnerIds)
      const profileMap = (profileData || []).reduce((acc, profile) => {
        acc[profile.id] = profile
        return acc
      }, {})

      const hydrateConversation = (conversation) => {
        const partnerId = conversation.user1_id === userId ? conversation.user2_id : conversation.user1_id
        const latestMessage = latestMessageByConversationId[conversation.id]

        let displayContent = ""

        if (!latestMessage) {
          displayContent = "No messages yet"
        } else if (latestMessage?.type === "image") {
          displayContent = "📷 Photo"
        } else if (latestMessage?.type === "file") {
          displayContent = "📎 File"
        } else if (latestMessage?.type === "post") {
          displayContent = "📝 Post"
        } else if (latestMessage?.encrypted_content) {
          // Message is encrypted — show generic preview, actual content decrypted in chat
          displayContent = latestMessage.sender_id === userId ? "You: sent a message" : "New message"
        } else if (latestMessage?.content?.trim()) {
          let content = latestMessage.content.trim()
          if (latestMessage.sender_id === userId) {
            content = `You: ${content}`
          }
          if (content.length > 50) {
            content = content.substring(0, 47) + "..."
          }
          displayContent = content
        }

        return {
          ...conversation,
          last_message_content: displayContent,
          last_message_type: getMessageType(latestMessage),
          last_message_sender_id: latestMessage?.sender_id || null,
          last_message_is_read: latestMessage?.is_read || false,
          last_message_at: latestMessage?.created_at || null,
          partner: profileMap[partnerId] || {
            id: partnerId,
            username: "unknown",
            name: "Unknown user",
            avatar_url: null
          }
        }
      }

      const hydratedAllConversations = allConversations.map(hydrateConversation)

      // Sort by latest message timestamp (most recent first)
      const visibleConversations = hydratedAllConversations.filter((conversation) => {
        const deleteBoundary = normalizeDbTimestamp(getDeleteBoundary(conversation, userId))

        if (!deleteBoundary) return true

        const updatedAt = normalizeDbTimestamp(conversation.updated_at || conversation.created_at)
        const updatedTime = parseDbTimestamp(updatedAt)
        const deleteTime = parseDbTimestamp(deleteBoundary)

        devLog("DELETE_BOUNDARY", deleteBoundary)
        devLog("UPDATED_AT", updatedAt)
        devLog("UPDATED_TIME", updatedTime)
        devLog("DELETE_TIME", deleteTime)
        devLog("COMPARE_RESULT", updatedTime, deleteTime, updatedTime > deleteTime)

        return updatedTime > deleteTime
      })

      const sortedByTime = visibleConversations.sort((a, b) => {
        const timeA = a.last_message_at || a.created_at || 0
        const timeB = b.last_message_at || b.created_at || 0
        return new Date(timeB) - new Date(timeA)
      })

      const sortedHydrated = sortConversationsByPriority(sortedByTime, unreadMap)

      devLog(
        "[Chat] Final conversations before setConversations",
        sortedHydrated.map(c => ({
          id: c.id,
          latestMessage: c.last_message_at,
          deletedBy: c.deleted_by,
        }))
      )

      devLog("RAW_CONVERSATIONS", rawConversations)
      devLog("ALL_CONVERSATIONS", allConversations)
      devLog("VISIBLE_CONVERSATIONS", visibleConversations)

      setAllConversations(hydratedAllConversations)
      setConversations(sortedHydrated)
      setUnreadCountsByConversation(unreadMap)
      setConversationsCache(sortedHydrated)
      setUnreadCountsCache(unreadMap)
      dispatchUnreadBadgeUpdate(unreadMap)

      if (sortedHydrated.length === 0) {
        setActiveConversationId(null)
        setMessages([])
      }
    } catch (err) {
      console.error("[Chat] Conversations exception:", err)
      setError("Failed to load conversations")
      setAllConversations([])
      setConversations([])
    } finally {
      if (!silent) {
        setLoadingConversations(false)
      }
    }
  }, [dispatchUnreadBadgeUpdate, fetchProfilesByIds, getMessageType, setConversationsCache, setUnreadCountsCache, shouldFetchConversations, sortConversationsByPriority])

  useEffect(() => {
    setConversations((prev) => sortConversationsByPriority(prev, unreadCountsByConversation, typingByConversation))
  }, [sortConversationsByPriority, unreadCountsByConversation, typingByConversation])

  useEffect(() => {
    setUnreadCountsCache(unreadCountsByConversation)
  }, [unreadCountsByConversation, setUnreadCountsCache])

  useEffect(() => {
    if (!authReady) {
      return
    }

    if (!contextUser?.id) {
      setError("You need to sign in to use chat")
      setLoadingConversations(false)
      setConversationPreferencesById({})
      setGroupPreferencesById({})
      return
    }

    fetchConversations(contextUser.id, { force: true, silent: cachedConversations.length > 0 })
  }, [authReady, contextUser?.id, fetchConversations])

  useEffect(() => {
    // Do not persist activeConversationId — causes unwanted auto-open on return
  }, [])

  useEffect(() => {
    if (!contextUser?.id) return
    const conversationIds = conversations.map((conversation) => conversation.id).filter(Boolean)
    fetchConversationPreferences(contextUser.id, conversationIds)
  }, [contextUser?.id, conversations, fetchConversationPreferences])

  useEffect(() => {
    if (!contextUser?.id) {
      return
    }

    const channel = supabase.channel("chat-user-presence", {
      config: {
        presence: { key: contextUser.id }
      }
    })

    channel
      .on("presence", { event: "sync" }, () => {
        syncOnlineUsersFromPresence(channel)
      })
      .on("presence", { event: "join" }, () => {
        syncOnlineUsersFromPresence(channel)
      })
      .on("presence", { event: "leave" }, () => {
        syncOnlineUsersFromPresence(channel)
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          presenceChannelRef.current = channel
          await supabase
            .from("profiles")
            .update({ is_online: true })
            .eq("id", contextUser.id)
          await channel.track({
            user_id: contextUser.id,
            online_at: new Date().toISOString()
          })
        }
      })

    return () => {
      channel.untrack()
      if (presenceChannelRef.current === channel) {
        presenceChannelRef.current = null
      }
      supabase.removeChannel(channel)
      persistLastSeenNow()
    }
  }, [contextUser?.id])

  useEffect(() => {
    if (!contextUser?.id) return

    const handlePageHide = () => {
      persistLastSeenNow()
      if (presenceChannelRef.current) {
        presenceChannelRef.current.untrack()
      }
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        handlePageHide()
        return
      }

      if (document.visibilityState === "visible" && presenceChannelRef.current) {
        supabase
          .from("profiles")
          .update({ is_online: true })
          .eq("id", contextUser.id)
        presenceChannelRef.current.track({
          user_id: contextUser.id,
          online_at: new Date().toISOString()
        })
      }
    }

    window.addEventListener("beforeunload", handlePageHide)
    window.addEventListener("pagehide", handlePageHide)
    document.addEventListener("visibilitychange", handleVisibilityChange)

    return () => {
      window.removeEventListener("beforeunload", handlePageHide)
      window.removeEventListener("pagehide", handlePageHide)
      document.removeEventListener("visibilitychange", handleVisibilityChange)
    }
  }, [contextUser?.id, persistLastSeenNow])

  useEffect(() => {
    const intervalId = setInterval(() => {
      setPresenceNow(Date.now())
    }, 30_000)

    return () => {
      clearInterval(intervalId)
    }
  }, [])

  useEffect(() => {
    if (!contextUser?.id) return

    const reportActivity = () => {
      if (document.visibilityState !== "visible") {
        return
      }

      updateMyLastSeen()
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        updateMyLastSeen(true)
      }
    }

    updateMyLastSeen(true)

    const activityEvents = ["mousemove", "keydown", "click", "scroll", "touchstart"]
    activityEvents.forEach((eventName) => {
      window.addEventListener(eventName, reportActivity, { passive: true })
    })

    window.addEventListener("focus", reportActivity)
    document.addEventListener("visibilitychange", handleVisibilityChange)

    const heartbeatId = setInterval(() => {
      if (document.visibilityState === "visible") {
        updateMyLastSeen()
      }
    }, 30_000)

    return () => {
      activityEvents.forEach((eventName) => {
        window.removeEventListener(eventName, reportActivity)
      })

      window.removeEventListener("focus", reportActivity)
      document.removeEventListener("visibilitychange", handleVisibilityChange)
      clearInterval(heartbeatId)
    }
  }, [contextUser?.id, updateMyLastSeen])

  useEffect(() => {
    const partnerId = activeConversationPartner?.id
    if (!partnerId) {
      return
    }

    let canceled = false

    const refreshPartnerPresence = async () => {
      const { data, error: profileError } = await supabase
        .from("profiles")
        .select("id, username, avatar_url, name, is_online, last_seen")
        .eq("id", partnerId)
        .maybeSingle()

      if (canceled || profileError || !data) {
        if (profileError) {
          devWarn("[Chat] Failed to refresh partner presence:", profileError)
        }
        return
      }

      mergeProfiles([data])
    }

    refreshPartnerPresence()
    const intervalId = setInterval(refreshPartnerPresence, 30_000)

    return () => {
      canceled = true
      clearInterval(intervalId)
    }
  }, [activeConversationPartner?.id, mergeProfiles])

  useEffect(() => {
    // Do not act while the full conversation list is still loading — the visible
    // list alone is not enough to restore hidden routes correctly.
    if (loadingConversations || allConversations === null) {
      if (import.meta.env.DEV) {
        console.log("[Chat][RouteRestore] Waiting for conversations to load")
      }
      return
    }

    if (allConversations.length === 0) {
      if (import.meta.env.DEV) {
        console.log("[Chat][RouteRestore] No conversations available yet")
      }
      setActiveConversationId((prev) => (prev === null ? prev : null))
      return
    }

    if (requestedConversationId) {
      const foundConversation = allConversations.find((conversation) => conversation.id === requestedConversationId)
      if (foundConversation) {
        devLog("[RouteRestore] Found conversation", { requestedConversationId })
        devLog("[RouteRestore] Full restored object", foundConversation)
        setSelectedConversation(foundConversation)
        devLog("[RouteRestore] Restored selectedConversation", { conversationId: foundConversation.id })
        setActiveConversationId((prev) => (prev === requestedConversationId ? prev : requestedConversationId))
        return
      }

      if (import.meta.env.DEV) {
        console.log("[Chat][RouteRestore] Direct conversation missing, falling back", {
          requestedConversationId,
          routeConversationId
        })
      }
      setActiveConversationId((prev) => (prev === null ? prev : null))

      if (routeConversationId) {
        navigate("/chat?tab=direct", { replace: true })
      }

      return
    }

    setActiveConversationId((prev) => {
      if (prev && allConversations.some((conversation) => conversation.id === prev)) {
        return prev
      }

      return null
    })
  }, [allConversations, loadingConversations, navigate, requestedConversationId, routeConversationId])

  useEffect(() => {
    if (!activeConversationId) {
      setMessages([])
      setOldestTimestamp(null)
      return
    }
    const cachedMessages = useChatStore.getState().messagesByConversationId[activeConversationId] || []
    if (cachedMessages.length > 0) {
      setMessages(cachedMessages)
      setOldestTimestamp(cachedMessages[0]?.created_at || null)
    }
    signedImageUrlCacheRef.current = {}
    // fetchMessages calls getConversationKeyFresh internally — no need to pre-fetch key
    fetchMessages(activeConversationId, { silent: cachedMessages.length > 0 })
  }, [activeConversationId, fetchMessages])

  useEffect(() => {
    closeConversationSearch()
  }, [activeConversationId, closeConversationSearch])

  useEffect(() => {
    if (!activeConversationId) return

    // Clean up any existing channel first
    if (reactionsChannelRef.current) {
      supabase.removeChannel(reactionsChannelRef.current)
      reactionsChannelRef.current = null
    }

    const reactionsChannel = supabase
      .channel("reactions-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "message_reactions"
        },
        (payload) => {
          console.log("[ReactionRealtimeReceived]", payload)
          const { eventType, new: newData, old: oldData } = payload

          if (eventType === "INSERT") {
            handleReactionInsert(newData)
          } else if (eventType === "DELETE") {
            handleReactionDelete(oldData)
          } else if (eventType === "UPDATE") {
            // Unify updates to just re-insert/delete flow for simplicity if needed,
            // or handle as update. Standard field is 'emoji'.
            handleReactionInsert(newData)
          }
        }
      )
      .subscribe()

    reactionsChannelRef.current = reactionsChannel

    return () => {
      supabase.removeChannel(reactionsChannel)
      if (reactionsChannelRef.current === reactionsChannel) {
        reactionsChannelRef.current = null
      }
    }
  }, [activeConversationId, handleReactionInsert, handleReactionDelete, updateReactionInState])

  useEffect(() => {
    if (!activeConversationId) return
    setConversationTypingState(activeConversationId, false)

    // Ensure only one active conversation channel exists at a time.
    if (activeConversationChannelRef.current) {
      supabase.removeChannel(activeConversationChannelRef.current)
      activeConversationChannelRef.current = null
    }


    const channel = supabase
      .channel(`messages-${activeConversationId}`)
      .on(
        "broadcast",
        { event: "typing" },
        ({ payload }) => {
          if (!payload || payload.conversation_id !== activeConversationId) {
            return
          }

          if (!contextUserIdRef.current || payload.user_id === contextUserIdRef.current) {
            return
          }

          setConversationTypingState(activeConversationId, payload.is_typing === true)
        }
      )
      .on(
        "broadcast",
        { event: "reaction" },
        ({ payload }) => {
          if (!payload || payload.conversation_id !== activeConversationId || !payload.reaction) {
            return
          }

          const { action, reaction } = payload

          if (action === "INSERT") {
            handleReactionInsertRef.current(reaction)
            return
          }

          if (action === "UPDATE") {
            updateReactionInStateRef.current(reaction)
            return
          }

          if (action === "DELETE") {
            handleReactionDeleteRef.current(reaction)
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${activeConversationId}`
        },
        async (payload) => {
          const nextMessage = payload.new
          if (!nextMessage?.id) return

          let decryptedContent = nextMessage.content

          // Decrypt encrypted content if present
          if (nextMessage.encrypted_content && nextMessage.iv) {
            try {
              const cryptoKey = await getConversationKeyRef.current(activeConversationId)
              if (cryptoKey) {
                decryptedContent = await decrypt(nextMessage.encrypted_content, nextMessage.iv, cryptoKey)
              } else {
                decryptedContent = nextMessage.content || "[Encrypted message]"
              }
            } catch (decryptError) {
              decryptedContent = nextMessage.content || "[Message content unavailable]"
            }
          }

          const normalizedNextMessage = {
            ...nextMessage,
            content: decryptedContent,
            decrypted_text: decryptedContent,
            type: getMessageTypeRef.current(nextMessage),
            reactions: [],
          }

          setMessages((prev) => {
            // Skip if already in list (exact id match)
            if (prev.some((item) => item.id === normalizedNextMessage.id)) {
              return prev
            }

            // Find if there's a matching temp message to replace
            const tempIndex = prev.findIndex(
              (item) =>
                typeof item.id === "string" &&
                item.id.startsWith("temp-") &&
                item.sender_id === normalizedNextMessage.sender_id &&
                item.conversation_id === normalizedNextMessage.conversation_id
            )

            let nextMessages
            if (tempIndex !== -1) {
              // Replace the temp message with the real one
              nextMessages = prev.map((item, index) =>
                index === tempIndex
                  ? { ...normalizedNextMessage, reactions: item.reactions || [] }
                  : item
              )
            } else {
              // Append the new message
              nextMessages = [...prev, normalizedNextMessage]
            }

            // Format message for preview following same logic as hydration
            let displayContent = ""
            if (getMessageTypeRef.current(nextMessage) === "image") {
              displayContent = "📷 Photo"
            } else if (getMessageTypeRef.current(nextMessage) === "file") {
              displayContent = "📎 File"
            } else if (getMessageTypeRef.current(nextMessage) === "post") {
              displayContent = "📝 Shared a post"
            } else if (decryptedContent?.trim()) {
              let content = decryptedContent.trim()
              if (nextMessage.sender_id === contextUserIdRef.current) {
                content = `You: ${content}`
              }
              if (content.length > 50) {
                content = content.substring(0, 47) + "..."
              }
              displayContent = content
            }

            // Update cache with the final deduplicated list
            appendMessageToCacheRef.current(activeConversationId, normalizedNextMessage)

            // Update conversation preview
            setConversations((convPrev) => {
              const updated = convPrev.map((conversation) =>
                conversation.id === activeConversationId
                  ? {
                    ...conversation,
                    last_message_content: displayContent,
                    last_message_type: getMessageTypeRef.current(nextMessage),
                    last_message_sender_id: nextMessage.sender_id,
                    last_message_is_read: normalizedNextMessage.receiver_id === contextUserIdRef.current
                      ? true
                      : (nextMessage.is_read || false),
                    last_message_at: nextMessage.created_at || conversation.last_message_at,
                    updated_at: normalizeDbTimestamp(nextMessage.created_at || conversation.updated_at || conversation.created_at)
                  }
                  : conversation
              )
              return sortConversationsByPriorityRef.current(updated)
            })

            // Mark as read if received by current user
            if (
              normalizedNextMessage.receiver_id === contextUserIdRef.current &&
              normalizedNextMessage.sender_id !== contextUserIdRef.current
            ) {
              supabase
                .from("messages")
                .update({ is_read: true })
                .eq("id", normalizedNextMessage.id)
                .eq("is_read", false)
                .then(({ error: markError }) => {
                  if (markError) {
                    console.error("[Chat] Failed to mark incoming message as read:", markError)
                    return
                  }
                  clearUnreadForConversationRef.current(activeConversationId)
                })
            }

            return nextMessages
          })
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${activeConversationId}`
        },
        async (payload) => {
          if (payload.eventType !== "UPDATE") return

          const updatedMessage = payload.new
          if (!updatedMessage?.id) return


          let decryptedContent = updatedMessage.content

          // Decrypt encrypted content if present
          if (updatedMessage.encrypted_content && updatedMessage.iv) {
            try {
              const cryptoKey = await getConversationKeyRef.current(activeConversationId)
              if (cryptoKey) {
                decryptedContent = await decrypt(updatedMessage.encrypted_content, updatedMessage.iv, cryptoKey)
              } else {
                console.warn("[Chat] Could not decrypt updated message - no key available")
                decryptedContent = updatedMessage.content || "[Message content unavailable]"
              }
            } catch (decryptError) {
              console.warn("[Chat] Could not decrypt updated message:", decryptError.message)
              // Fallback to plaintext or placeholder
              decryptedContent = updatedMessage.content || "[Message content unavailable]"
            }
          }

          setMessages((prev) =>
            prev.map((message) =>
              message.id === updatedMessage.id
                ? {
                  ...message,
                  ...updatedMessage,
                  content: decryptedContent
                }
                : message
            )
          )


          // Update conversation preview if this is the last message
          setConversations((prev) => {
            const updated = prev.map((conversation) => {
              if (conversation.id !== activeConversationId) return conversation

              // If the updated message is the last message, update preview
              const isLastMessage = conversation.last_message_at === updatedMessage.created_at
              if (!isLastMessage) return conversation

              // Format message following same logic as hydration
              let displayContent = ""

              if (getMessageTypeRef.current(updatedMessage) === "image") {
                displayContent = "📷 Photo"
              } else if (getMessageTypeRef.current(updatedMessage) === "file") {
                displayContent = "📎 File"
              } else if (getMessageTypeRef.current(updatedMessage) === "post") {
                displayContent = "📝 Shared a post"
              } else if (decryptedContent?.trim()) {
                let content = decryptedContent.trim()

                if (updatedMessage.sender_id === contextUserIdRef.current) {
                  content = `You: ${content}`
                }

                if (content.length > 50) {
                  content = content.substring(0, 47) + "..."
                }

                displayContent = content
              }

              return {
                ...conversation,
                last_message_content: displayContent,
                last_message_type: getMessageTypeRef.current(updatedMessage),
                last_message_sender_id: updatedMessage.sender_id,
                last_message_at: updatedMessage.created_at
              }
            })

            return sortConversationsByPriorityRef.current(updated)
          })
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          activeConversationChannelRef.current = channel
        }
      })

    return () => {
      if (isTypingRef.current) {
        channel.send({
          type: "broadcast",
          event: "typing",
          payload: {
            conversation_id: activeConversationId,
            user_id: contextUserIdRef.current,
            is_typing: false
          }
        })
      }

      if (activeConversationChannelRef.current === channel) {
        activeConversationChannelRef.current = null
      }

      clearTypingTimers()
      setConversationTypingState(activeConversationId, false)
      isTypingRef.current = false
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeConversationId])

  useEffect(() => {
    if (!contextUser?.id) return

    const conversationIds = [...new Set(conversations.map((conversation) => conversation.id).filter(Boolean))]

    typingListenerChannelsRef.current.forEach((channel) => {
      supabase.removeChannel(channel)
    })
    typingListenerChannelsRef.current = []

    conversationIds
      .filter((conversationId) => conversationId !== activeConversationId)
      .forEach((conversationId) => {
        const channel = supabase
          .channel(`chat-messages-${conversationId}`)
          .on("broadcast", { event: "typing" }, ({ payload }) => {
            if (!payload || payload.conversation_id !== conversationId) {
              return
            }

            if (payload.user_id === contextUser.id) {
              return
            }

            setConversationTypingState(conversationId, payload.is_typing === true)
          })
          .subscribe()

        typingListenerChannelsRef.current.push(channel)
      })

    return () => {
      typingListenerChannelsRef.current.forEach((channel) => {
        supabase.removeChannel(channel)
      })
      typingListenerChannelsRef.current = []
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeConversationId, contextUser?.id, setConversationTypingState, conversations.map(c => c.id).join(',')])

  useEffect(() => {
    return () => {
      Object.values(typingConversationTimersRef.current).forEach((timerId) => {
        clearTimeout(timerId)
      })
      typingConversationTimersRef.current = {}
    }
  }, [])

  useEffect(() => {
    const channel = supabase
      .channel("messages-update")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "messages"
        },
        (payload) => {
          if (payload.new?.is_read === true) {
            updateMessageSeenStatusRef.current?.(payload.new.id)
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  useEffect(() => {
    if (conversationSearchOpen && debouncedConversationSearchQuery.trim()) {
      return
    }

    if (!bottomRef.current) return
    bottomRef.current.scrollIntoView({ behavior: "smooth" })
  }, [conversationSearchOpen, debouncedConversationSearchQuery, messages])

  useEffect(() => {
    if (!conversationSearchOpen) {
      return
    }

    requestAnimationFrame(() => {
      conversationSearchInputRef.current?.focus()
    })
  }, [conversationSearchOpen])

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setDebouncedConversationSearchQuery(conversationSearchQuery)
    }, 180)

    return () => {
      clearTimeout(timeoutId)
    }
  }, [conversationSearchQuery])

  useEffect(() => {
    const query = debouncedConversationSearchQuery.trim().toLowerCase()

    if (!conversationSearchOpen || !query) {
      setMatchedMessageIds([])
      setActiveMatchIndex(0)
      return
    }

    const nextMatchedIds = messages
      .filter((message) => {
        const content = message?.content || ""
        if (!content) {
          return false
        }

        return content.toLowerCase().includes(query)
      })
      .map((message) => message.id)

    setMatchedMessageIds(nextMatchedIds)
    setActiveMatchIndex((prev) => {
      if (nextMatchedIds.length === 0) {
        return 0
      }

      return prev >= nextMatchedIds.length ? 0 : prev
    })
  }, [conversationSearchOpen, debouncedConversationSearchQuery, messages])

  useEffect(() => {
    if (!conversationSearchOpen || matchedMessageIds.length === 0) {
      return
    }

    const activeMatchedMessageId = matchedMessageIds[activeMatchIndex]
    if (!activeMatchedMessageId) {
      return
    }

    const element = document.getElementById(`message-${activeMatchedMessageId}`)
    element?.scrollIntoView({ behavior: "smooth", block: "center" })
  }, [activeMatchIndex, conversationSearchOpen, matchedMessageIds])

  useEffect(() => {
    const query = userSearchQuery.trim()

    if (!query || !contextUser?.id) {
      setUserSearchResults([])
      setUserSearchLoading(false)
      return
    }

    let canceled = false
    const timeoutId = setTimeout(async () => {
      try {
        setUserSearchLoading(true)

        const { data, error: searchError } = await supabase
          .from("profiles")
          .select("id, username, name, avatar_url")
          .or(`username.ilike.%${query}%,name.ilike.%${query}%`)
          .limit(10)

        if (searchError) {
          console.error("[Chat] Failed to search users:", searchError)
          if (!canceled) {
            setUserSearchResults([])
          }
          return
        }

        if (canceled) return

        setUserSearchResults((data || []).filter((profile) => profile.id !== contextUser.id))
      } catch (err) {
        console.error("[Chat] User search exception:", err)
        if (!canceled) {
          setUserSearchResults([])
        }
      } finally {
        if (!canceled) {
          setUserSearchLoading(false)
        }
      }
    }, 250)

    return () => {
      canceled = true
      clearTimeout(timeoutId)
    }
  }, [userSearchQuery, contextUser?.id])

  const markConversationMessagesAsRead = useCallback(async (conversationId, userId) => {
    if (!conversationId || !userId) return

    const now = new Date().toISOString()

    try {
      const { error: updateError } = await supabase
        .from("messages")
        .update({
          is_read: true,
          seen_at: now,
          delivery_status: "seen"
        })
        .eq("conversation_id", conversationId)
        .eq("receiver_id", userId)
        .eq("is_read", false)

      if (updateError) {
        console.error("[Chat] Failed to mark messages as read in DB:", updateError)
        return
      }

      setMessages((prev) =>
        prev.map((msg) =>
          msg.receiver_id === userId &&
            msg.conversation_id === conversationId &&
            !msg.is_read
            ? {
              ...msg,
              is_read: true,
              seen_at: now,
              delivery_status: "seen"
            }
            : msg
        )
      )

      clearUnreadForConversation(conversationId)
    } catch (err) {
      console.error("[Chat] Exception marking messages as read:", err)
    }
  }, [clearUnreadForConversation])

  useEffect(() => {
    if (!navigator.serviceWorker) return

    const handleServiceWorkerMessage = (event) => {
      const payload = event.data

      if (payload?.type !== "MESSAGE_MARKED_READ") return

      const conversationId = payload.conversationId

      if (!conversationId) return

      setMessages((prev) =>
        prev.map((msg) =>
          msg.conversation_id === conversationId &&
            msg.receiver_id === contextUser.id
            ? {
              ...msg,
              is_read: true,
              delivery_status: "seen",
              seen_at: new Date().toISOString(),
            }
            : msg
        )
      )

      clearUnreadForConversation(conversationId)
    }

    navigator.serviceWorker.addEventListener(
      "message",
      handleServiceWorkerMessage
    )

    return () => {
      navigator.serviceWorker.removeEventListener(
        "message",
        handleServiceWorkerMessage
      )
    }
  }, [contextUser?.id])

  const markMessageAsDelivered = useCallback(async (messageId) => {
    if (!messageId) return

    try {
      const { error: updateError } = await supabase
        .from("messages")
        .update({
          delivery_status: 'delivered',
          delivered_at: new Date().toISOString()
        })
        .eq("id", messageId)
        .eq("delivery_status", 'sent') // Only update if still in 'sent' state

      if (updateError) {
        console.error("[Chat] Failed to mark message as delivered:", updateError)
        return
      }

      // Update local state
      setMessages((prev) =>
        prev.map((message) =>
          message.id === messageId && message.delivery_status === 'sent'
            ? {
              ...message,
              delivery_status: 'delivered',
              delivered_at: new Date().toISOString()
            }
            : message
        )
      )
    } catch (err) {
      console.error("[Chat] Exception marking message as delivered:", err)
    }
  }, [])

  useEffect(() => {
    if (!contextUser?.id) return

    const channel = supabase
      .channel(`chat-unread-sync-${contextUser.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `receiver_id=eq.${contextUser.id}`
        },
        async (payload) => {
          const nextMessage = payload.new
          if (!nextMessage?.id || nextMessage.receiver_id !== contextUser.id) {
            return
          }


          // Mark message as delivered to sender
          if (nextMessage.receiver_id === contextUser?.id) {
            markMessageAsDelivered(nextMessage.id)
          }

          // Get conversation to decrypt message if needed
          let decryptedContent = nextMessage.content

          if (nextMessage.encrypted_content && nextMessage.iv) {
            try {
              const cryptoKey = await getConversationKey(nextMessage.conversation_id)
              if (cryptoKey) {
                decryptedContent = await decrypt(nextMessage.encrypted_content, nextMessage.iv, cryptoKey)
              } else {
                decryptedContent = nextMessage.content || "[Message]"
              }
            } catch (decryptError) {
              console.warn("[Chat] Could not decrypt message for sidebar:", decryptError.message)
              // Fallback to plaintext or generic message
              decryptedContent = nextMessage.content || "[Message]"
            }
          }

          // Format message for preview following same logic as hydration
          let displayContent = ""

          if (getMessageType(nextMessage) === "image") {
            displayContent = "📷 Photo"
          } else if (getMessageType(nextMessage) === "file") {
            displayContent = "📎 File"
          } else if (getMessageType(nextMessage) === "post") {
            displayContent = "📝 Shared a post"
          } else if (decryptedContent?.trim() && decryptedContent !== "[Message]") {
            let content = decryptedContent.trim()

            // Add "You: " prefix if current user sent it
            if (nextMessage.sender_id === contextUser?.id) {
              content = `You: ${content}`
            }

            // Truncate long previews
            if (content.length > 50) {
              content = content.substring(0, 47) + "..."
            }

            displayContent = content
          }

          setConversations((prev) => {
            const exists = prev.some((conv) => conv.id === nextMessage.conversation_id)
            const updatedAt = normalizeDbTimestamp(nextMessage.created_at)
            const partnerId = nextMessage.sender_id === contextUser.id ? nextMessage.receiver_id : nextMessage.sender_id
            const partnerProfile = profilesById[partnerId] || {
              id: partnerId,
              username: "unknown",
              name: "Unknown user",
              avatar_url: null
            }

            const updated = prev.map((conversation) =>
              conversation.id === nextMessage.conversation_id
                ? {
                  ...conversation,
                  last_message_content: displayContent,
                  last_message_type: getMessageType(nextMessage),
                  last_message_at: updatedAt,
                  updated_at: updatedAt
                }
                : conversation
            )

            if (!exists) {
              // Add stub immediately so the deleted conversation reappears from the new message alone.
              const newConvStub = {
                id: nextMessage.conversation_id,
                user1_id: nextMessage.sender_id,
                user2_id: nextMessage.receiver_id,
                created_at: updatedAt,
                updated_at: updatedAt,
                last_message_content: displayContent,
                last_message_type: getMessageType(nextMessage),
                last_message_at: updatedAt,
                last_message_sender_id: nextMessage.sender_id,
                last_message_is_read: false,
                partner: partnerProfile
              }

              return sortConversationsByPriority([...updated, newConvStub])
            }
            return sortConversationsByPriority(updated)
          })

          if (nextMessage.conversation_id === activeConversationId) {
            markConversationMessagesAsRead(nextMessage.conversation_id, contextUser.id)
            return
          }

          incrementUnreadForConversation(nextMessage.conversation_id)
        }
      )
      .subscribe((status) => {
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [activeConversationId, contextUser?.id, getMessageType, incrementUnreadForConversation, markConversationMessagesAsRead, markMessageAsDelivered, sortConversationsByPriority, getConversationKey, fetchConversations, upsertConversationPreference, conversationPreferencesById, setMessagesCache, setConversationPreferencesById])

  useEffect(() => {
    if (!contextUser?.id) return

    const channel = supabase
      .channel(`chat-sent-sync-${contextUser.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `sender_id=eq.${contextUser.id}`
        },
        async (payload) => {
          const nextMessage = payload.new
          if (!nextMessage?.id || nextMessage.sender_id !== contextUser.id) {
            return
          }

          // Only handle if not active (active channel handles that)
          if (nextMessage.conversation_id === activeConversationId) return

          // Restore deleted conversation if user sends a new message to it
          setConversations((prev) => {
            const exists = prev.some((conv) => conv.id === nextMessage.conversation_id)
            const updatedAt = normalizeDbTimestamp(nextMessage.created_at)
            const partnerId = nextMessage.sender_id === contextUser.id ? nextMessage.receiver_id : nextMessage.sender_id
            const partnerProfile = profilesById[partnerId] || {
              id: partnerId,
              username: "unknown",
              name: "Unknown user",
              avatar_url: null
            }

            const updated = prev.map((conversation) =>
              conversation.id === nextMessage.conversation_id
                ? {
                  ...conversation,
                  last_message_content: getMessageType(nextMessage) === "post"
                    ? "📝 Shared a post"
                    : getMessageType(nextMessage) === "image"
                      ? "📷 Photo"
                      : nextMessage.content
                        ? `You: ${nextMessage.content.substring(0, 47)}${nextMessage.content.length > 47 ? "..." : ""}`
                        : "You: sent a message",
                  last_message_type: getMessageType(nextMessage),
                  last_message_sender_id: nextMessage.sender_id,
                  last_message_at: updatedAt,
                  updated_at: updatedAt,
                  last_message_is_read: false,
                }
                : conversation
            )

            if (!exists) {
              const newConvStub = {
                id: nextMessage.conversation_id,
                user1_id: nextMessage.sender_id,
                user2_id: nextMessage.receiver_id,
                created_at: updatedAt,
                updated_at: updatedAt,
                last_message_content: getMessageType(nextMessage) === "post"
                  ? "📝 Shared a post"
                  : getMessageType(nextMessage) === "image"
                    ? "📷 Photo"
                    : nextMessage.content
                      ? `You: ${nextMessage.content.substring(0, 47)}${nextMessage.content.length > 47 ? "..." : ""}`
                      : "You: sent a message",
                last_message_type: getMessageType(nextMessage),
                last_message_sender_id: nextMessage.sender_id,
                last_message_at: updatedAt,
                last_message_is_read: false,
                partner: partnerProfile
              }

              return sortConversationsByPriority([...updated, newConvStub])
            }

            return sortConversationsByPriority(updated)
          })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [contextUser?.id, activeConversationId, getMessageType, sortConversationsByPriority, conversationPreferencesById, upsertConversationPreference, fetchConversations, setMessagesCache, setConversationPreferencesById])

  const handleImageButtonClick = () => {
    if (!activeConversation || uploadingImage) {
      return
    }

    fileInputRef.current?.click()
  }

  const handleImageSelected = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ""

    if (!file || !activeConversationId || !contextUser?.id || uploadingImage) {
      return
    }

    let processedFile = null
    try {
      processedFile = await prepareImageForUpload(file)
    } catch (err) {
      if (err?.code === "IMAGE_TOO_LARGE") {
        setError(IMAGE_TOO_LARGE_MESSAGE)
        showToastError(IMAGE_TOO_LARGE_MESSAGE)
      } else {
        setError(err?.message || "Failed to process image")
        showToastError(err?.message || "Failed to process image")
      }
      return
    }

    setError("")
    setSelectedImageFile(processedFile)
    setSelectedImageComposerUrl(URL.createObjectURL(processedFile))
    setImageCaption((prev) => {
      if (prev?.trim()) return prev
      return draftValueRef.current.trim()
    })
    if (draftValueRef.current.trim()) {
      setDraftInputValue("")
    }

    requestAnimationFrame(() => {
      imageCaptionInputRef.current?.focus()
    })
  }

  const clearSelectedImageComposer = useCallback(() => {
    if (selectedImageComposerUrl) {
      URL.revokeObjectURL(selectedImageComposerUrl)
    }

    setSelectedImageFile(null)
    setSelectedImageComposerUrl("")
    setImageCaption("")
  }, [selectedImageComposerUrl, setDraftInputValue])

  useEffect(() => {
    return () => {
      if (selectedImageComposerUrl) {
        URL.revokeObjectURL(selectedImageComposerUrl)
      }
    }
  }, [selectedImageComposerUrl])

  // Refresh expired signed image URLs
  useEffect(() => {
    if (messages.length === 0) return

    const refreshIntervalId = setInterval(() => {
      messages.forEach((message) => {
        if (message.storage_path && signedImageUrlCacheRef.current[message.storage_path]) {
          const cached = signedImageUrlCacheRef.current[message.storage_path]
          if (!isSignedUrlValid(cached.expiresAt)) {
            devLog(`[Chat] Signed URL expired for: ${message.storage_path}, will refresh on next view`)
            delete signedImageUrlCacheRef.current[message.storage_path]
          }
        }
      })
    }, 60000) // Check every minute

    return () => clearInterval(refreshIntervalId)
  }, [messages])

  // Load signed URLs for all image messages
  useEffect(() => {
    const loadImageUrls = async () => {
      const imageMessages = messages.filter((m) => getMessageType(m) === "image")
      const urlsToLoad = {}
      let needsUpdate = false

      for (const message of imageMessages) {
        // Skip if already loaded
        if (loadedImageUrls[message.id]) {
          continue
        }

        needsUpdate = true
        const url = await getImageMessageUrl(message)
        if (url) {
          urlsToLoad[message.id] = url
        } else {
          // Mark as failed to avoid retrying constantly
          urlsToLoad[message.id] = null
        }
      }

      if (needsUpdate) {
        setLoadedImageUrls((prev) => ({
          ...prev,
          ...urlsToLoad
        }))
      }
    }

    loadImageUrls()
  }, [messages, getImageMessageUrl])

  const handleSendImageMessage = async () => {
    if (!selectedImageFile || !activeConversationId || !contextUser?.id || uploadingImage) {
      return
    }

    try {
      stopTyping()
      setUploadingImage(true)
      setError("")

      const receiverId = activeConversation
        ? (activeConversation.user1_id === contextUser.id ? activeConversation.user2_id : activeConversation.user1_id)
        : null

      if (!receiverId) {
        setError("Failed to determine message recipient")
        return
      }

      // Upload image to private chat-media bucket
      const uploadResult = await uploadImageToPrivateStorage(selectedImageFile, contextUser.id, activeConversationId)
      if (!uploadResult?.storagePath) {
        console.error("[Chat] Failed to upload image to private storage")
        setError("Failed to upload image")
        return
      }

      const storagePath = uploadResult.storagePath
      devLog(`[Chat] Image uploaded to private storage: ${storagePath}`)

      // Get encryption key for this conversation
      const cryptoKey = await getOrCreateConversationKey(activeConversationId)
      if (!cryptoKey) {
        console.error("[Chat] Failed to get encryption key for image message")
        setError("Failed to encrypt image caption")
        return
      }

      // Encrypt caption if present
      let encryptedData = null
      let captionContent = imageCaption.trim()

      if (captionContent) {
        try {
          encryptedData = await encrypt(captionContent, cryptoKey)
        } catch (encryptError) {
          console.error("[Chat] Failed to encrypt image caption:", encryptError)
          setError("Failed to encrypt caption")
          return
        }
      }

      // Create message with storage path - only include columns we're actually using
      const messagePayload = {
        conversation_id: activeConversationId,
        sender_id: contextUser.id,
        receiver_id: receiverId,
        type: "image",
        storage_path: storagePath,
        delivery_status: 'sent'
      }

      // Only add encrypted content if we have a caption
      if (encryptedData) {
        messagePayload.encrypted_content = encryptedData.ciphertext
        messagePayload.iv = encryptedData.iv
      }

      const { data: insertedData, error: insertError } = await supabase.from("messages").insert([messagePayload]).select()
      
      if (insertError) {
        console.error("[Chat] Failed to send image message:", insertError)
        setError("Failed to send image")
        return
      }

      const resolvedConversationId = insertedData?.[0]?.conversation_id || activeConversation?.id || activeConversationId

      await dispatchPushNotification({
        recipientId: receiverId,
        actorId: contextUser.id,
        title: senderDisplayName,
        body: imageCaption.trim() || "Sent you a photo",
        route: `/chat/direct/${resolvedConversationId}`,
        data: {
          type: "message",
          senderName: senderDisplayName,
          messageText: imageCaption.trim() || "Sent you a photo",
          conversation_id: resolvedConversationId,
          notification_id: insertedData?.[0]?.id || null,
          recipient_id: receiverId,
          receiver_id: receiverId,
          markReadEndpoint: `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/mark-chat-read`,
          sender_id: contextUser.id,
        },
      })

      // Optimistically add the message to the state immediately
      if (insertedData && insertedData.length > 0) {
        const sentMessage = {
          ...insertedData[0],
          content: imageCaption.trim() || "[Photo]",
          type: "image"
        }

        setMessages((prev) => {
          if (prev.some((item) => item.id === sentMessage.id)) {
            return prev
          }
          return [...prev, sentMessage]
        })

        // Update conversation list with new message preview
        setConversations((prev) => {
          const updated = prev.map((conversation) =>
            conversation.id === activeConversationId
              ? {
                ...conversation,
                last_message_content: "📷 Photo",
                last_message_type: "image",
                last_message_sender_id: contextUser.id,
                last_message_is_read: false,
                last_message_at: sentMessage.created_at || conversation.last_message_at,
                updated_at: sentMessage.created_at || conversation.updated_at
              }
              : conversation
          )
          return sortConversationsByPriority(updated)
        })
      }

      devLog("[Chat] Image message sent successfully")
      clearSelectedImageComposer()
      requestAnimationFrame(() => {
        inputRef.current?.focus()
      })
    } catch (imageSendError) {
      console.error("[Chat] Image send exception:", imageSendError)
      setError("Failed to send image")
    } finally {
      setUploadingImage(false)
    }
  }

  const handleReactionSelect = useCallback(async (messageId, emoji, source = "unknown") => {
    if (!messageId || !emoji || !contextUser?.id) return

    const isGroupMode = chatModeRef.current === 'group' || chatModeRef.current === 'groups'

    if (import.meta.env.DEV) {
      console.log("[ReactionMutationStart]", { 
        messageId, 
        emoji, 
        source,
        userId: contextUser.id,
        chatMode: chatModeRef.current,
        isGroupMode
      })
    }

    try {
      // 1. Identify existing reaction from LOCAL STATE via Ref
      const currentReactions = !isGroupMode
        ? (messagesRef.current.find(m => m.id === messageId)?.reactions || [])
        : (groupMessageReactionsRef.current[messageId] || [])

      const existing = currentReactions.find(r => r.user_id === contextUser.id)

      if (isGroupMode && import.meta.env.DEV) {
        console.log("[GroupReactionExisting]", { messageId, currentReactions, existing })
      }

      if (existing) {
        const oldEmoji = existing.emoji
        if (import.meta.env.DEV) console.log("[ReactionMutation][ExistingFound]", { oldEmoji, newEmoji: emoji, isGroupMode })

        if (isGroupMode) {
          // GROUP: state + DB both use group_message_id
          handleReactionDelete({ group_message_id: messageId, user_id: contextUser.id, emoji: oldEmoji })
          await supabase
            .from("message_reactions")
            .delete()
            .eq("group_message_id", messageId)
            .eq("user_id", contextUser.id)
            .eq("emoji", oldEmoji)
        } else {
          // DIRECT: unchanged — uses message_id
          handleReactionDelete({ message_id: messageId, user_id: contextUser.id, emoji: oldEmoji })
          await supabase
            .from("message_reactions")
            .delete()
            .match({ message_id: messageId, user_id: contextUser.id })
        }

        if (oldEmoji === emoji) {
          setActiveReactionPickerMessageId(null)
          setActiveGroupEmojiPickerMessageId(null)
          return
        }
      }

      // 2. Insert new reaction — payload differs by mode
      if (isGroupMode) {
        // GROUP MODE: group_message_id only — no message_id (avoids 23503 FK violation)
        const optimistic = {
          id: `temp-${Date.now()}`,
          group_message_id: messageId,
          user_id: contextUser.id,
          emoji,
          profiles: currentUserProfile
        }
        handleReactionInsert(optimistic)

        const groupPayload = { group_message_id: messageId, user_id: contextUser.id, emoji }
        if (import.meta.env.DEV) console.log("[GroupReactionPayload]", groupPayload)

        const { data: inserted, error: insertError } = await supabase
          .from("message_reactions")
          .insert(groupPayload)
          .select()
          .single()

        if (insertError) {
          console.error("[ReactionMutation][GroupInsertError]", insertError)
          handleReactionDelete(optimistic)
          if (insertError.code !== '23505') {
            setError("Failed to add reaction")
          }
        } else {
          if (import.meta.env.DEV) console.log("[ReactionMutation][GroupInsertSuccess]", inserted)
          handleReactionDelete(optimistic)
          handleReactionInsert({ ...inserted, profiles: currentUserProfile })
        }
      } else {
        // DIRECT MODE: message_id only — unchanged
        const optimistic = { 
          id: `temp-${Date.now()}`, 
          message_id: messageId, 
          user_id: contextUser.id, 
          emoji,
          profiles: currentUserProfile
        }
        handleReactionInsert(optimistic)

        const { data: inserted, error: insertError } = await supabase
          .from("message_reactions")
          .insert({ message_id: messageId, user_id: contextUser.id, emoji })
          .select()
          .single()

        if (insertError) {
          console.error("[ReactionMutation][InsertError]", insertError)
          handleReactionDelete(optimistic)
          if (insertError.code !== '23505') {
            setError("Failed to add reaction")
          }
        } else {
          if (import.meta.env.DEV) console.log("[ReactionMutation][InsertSuccess]", inserted)
          handleReactionDelete(optimistic)
          const reactionWithProfile = { ...inserted, profiles: currentUserProfile }
          handleReactionInsert(reactionWithProfile)
          await broadcastReactionEvent("INSERT", reactionWithProfile)
        }
      }

      setActiveReactionPickerMessageId(null)
      setActiveGroupEmojiPickerMessageId(null)
    } catch (err) {
      console.error("[ReactionMutation][Exception]", err)
    }
  }, [contextUser?.id, currentUserProfile, handleReactionDelete, handleReactionInsert, broadcastReactionEvent, setError])


  const handleReply = useCallback((message) => {
    setEditingMessage(null)
    setReplyToMessage(message)

    setTimeout(() => {
      inputRef.current?.focus()
    }, 0)
  }, [])

  const handleDirectMessageSwipeStart = useCallback((event, message) => {
    if (!isMobileView || !message?.id || message.is_deleted || event.touches?.length !== 1) {
      return
    }

    const touch = event.touches[0]
    directSwipeStateRef.current = {
      messageId: message.id,
      startX: touch.clientX,
      startY: touch.clientY,
      triggered: false,
      element: event.currentTarget,
    }
  }, [isMobileView])

  const handleDirectMessageSwipeMove = useCallback((event, message) => {
    const state = directSwipeStateRef.current
    if (!isMobileView || !state?.element || !message?.id || state.messageId !== message.id || event.touches?.length !== 1) {
      return
    }

    const touch = event.touches[0]
    const deltaX = touch.clientX - state.startX
    const deltaY = touch.clientY - state.startY
    const absX = Math.abs(deltaX)
    const absY = Math.abs(deltaY)

    if (absY > absX) {
      return
    }

    cancelDirectMessageLongPress()

    if (event.cancelable) {
      event.preventDefault()
    }

    const clamped = Math.max(-72, Math.min(72, deltaX))
    state.element.style.transition = "none"
    state.element.style.transform = `translateX(${clamped}px)`

    if (absX >= 56 && !state.triggered) {
      state.triggered = true
      handleReply(message)
      if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
        navigator.vibrate(10)
      }
    }
  }, [cancelDirectMessageLongPress, handleReply, isMobileView])

  const handleDirectMessageSwipeEnd = useCallback(() => {
    const state = directSwipeStateRef.current
    if (state?.element) {
      state.element.style.transition = "transform 180ms ease-out"
      state.element.style.transform = "translateX(0px)"
    }

    directSwipeStateRef.current = {
      messageId: null,
      startX: 0,
      startY: 0,
      triggered: false,
      element: null,
    }
  }, [])

  const handleStartEditingMessage = useCallback((message) => {
    if (!message?.id || message.is_deleted) {
      return
    }

    setReplyToMessage(null)
    setActiveMenuId(null)
    setEditingMessage(message)
    setDraftInputValue(message.content || "")

    requestAnimationFrame(() => {
      inputRef.current?.focus()
    })
  }, [setDraftInputValue])

  const openForwardModal = useCallback((message) => {
    if (!message?.id || message.is_deleted) {
      return
    }

    setForwardingMessage(message)
    setForwardSearchQuery("")
    setSelectedForwardConversationIds([])
    setForwardModalOpen(true)
    setActiveMenuId(null)
    setActiveReactionPickerMessageId(null)
  }, [])

  const closeForwardModal = useCallback(() => {
    if (forwarding) {
      return
    }

    setForwardModalOpen(false)
    setForwardingMessage(null)
    setForwardSearchQuery("")
    setSelectedForwardConversationIds([])
  }, [forwarding])

  const toggleForwardConversation = useCallback((conversationId) => {
    if (!conversationId) {
      return
    }

    setSelectedForwardConversationIds((prev) =>
      prev.includes(conversationId)
        ? prev.filter((id) => id !== conversationId)
        : [...prev, conversationId]
    )
  }, [])

  const handleCopyMessage = useCallback(
    async (message) => {
      const textToCopy = (message?.content || "").trim() || message?.media_url || message?.image_url || ""

      if (!textToCopy.trim()) {
        showToastError("Nothing to copy")
        return
      }

      try {
        await navigator.clipboard.writeText(textToCopy)
        showSuccess("Message copied")
      } catch (copyError) {
        console.error("[Chat] Failed to copy message:", copyError)
        showToastError("Failed to copy message")
      } finally {
        setActiveMenuId(null)
      }
    },
    [showSuccess, showToastError]
  )

  const handleDeleteMessage = useCallback((message) => {
    if (!message?.id) {
      return
    }

    setMessages((prev) => prev.filter((item) => item.id !== message.id))
    setActiveMenuId(null)
    showSuccess("Message deleted")
  }, [showSuccess])

  const handleForwardMessages = useCallback(async () => {
    if (!forwardingMessage?.id || !contextUser?.id || selectedForwardConversationIds.length === 0 || forwarding) {
      return
    }

    try {
      setForwarding(true)

      const selectedConversations = conversations.filter((conversation) =>
        selectedForwardConversationIds.includes(conversation.id)
      )

      const messageType = getMessageType(forwardingMessage)
      const storagePath = forwardingMessage.storage_path || null
      const mediaUrl = forwardingMessage.media_url || forwardingMessage.image_url || null
      const contentToForward = forwardingMessage.content || null

      const rowsToInsert = await Promise.all(
        selectedConversations.map(async (conversation) => {
          const receiverId =
            conversation.user1_id === contextUser.id ? conversation.user2_id : conversation.user1_id

          if (!receiverId) {
            return null
          }

          // Get encryption key for target conversation
          const targetCryptoKey = await getOrCreateConversationKey(conversation.id)
          if (!targetCryptoKey) {
            console.warn(`[Chat] Could not get encryption key for forward target conversation ${conversation.id}`)
            return null
          }

          let encryptedData = null

          // Encrypt the content for the target conversation if there is content
          if (contentToForward) {
            try {
              encryptedData = await encrypt(contentToForward, targetCryptoKey)
            } catch (encryptError) {
              console.error(`[Chat] Failed to encrypt forwarded message for conversation ${conversation.id}:`, encryptError)
              return null
            }
          }

          const row = {
            conversation_id: conversation.id,
            sender_id: contextUser.id,
            receiver_id: receiverId,
            ...(encryptedData ? { encrypted_content: encryptedData.ciphertext, iv: encryptedData.iv } : { encrypted_content: null, iv: null }),
            type: messageType,
            storage_path: storagePath, // Use private storage path if available
            media_url: mediaUrl,
            is_forwarded: true,
            forwarded_from_message_id: forwardingMessage.id,
            reply_to_id: null
          }

          if (Object.prototype.hasOwnProperty.call(forwardingMessage, "image_url")) {
            row.image_url = mediaUrl
          }

          return row
        })
      )

      const validRows = rowsToInsert.filter(Boolean)

      if (validRows.length === 0) {
        showToastError("No valid chats selected")
        return
      }

      const { data: insertedForwardMessages, error: insertError } = await supabase
        .from("messages")
        .insert(validRows)
        .select("id, conversation_id, receiver_id")

      if (insertError) {
        console.error("[Chat] Failed to forward message:", insertError)
        showToastError("Failed to forward message")
        return
      }

      await Promise.all(
        (insertedForwardMessages && insertedForwardMessages.length > 0 ? insertedForwardMessages : validRows).map((row) =>
          dispatchPushNotification({
            recipientId: row.receiver_id,
            actorId: contextUser.id,
            title: senderDisplayName,
            body: contentToForward || "Forwarded a message",
            route: `/chat/direct/${row.conversation_id}`,
            data: {
              type: "message",
              senderName: senderDisplayName,
              messageText: contentToForward || "Forwarded a message",
              conversation_id: row.conversation_id,
              notification_id: row.id || null,
              recipient_id: row.receiver_id,
              receiver_id: row.receiver_id,
              markReadEndpoint: `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/mark-chat-read`,
              sender_id: contextUser.id,
            },
          })
        )
      )

      closeForwardModal()
      showSuccess("Message forwarded")
    } catch (forwardError) {
      console.error("[Chat] Forward message exception:", forwardError)
      showToastError("Failed to forward message")
    } finally {
      setForwarding(false)
    }
  }, [
    closeForwardModal,
    conversations,
    contextUser?.id,
    forwarding,
    forwardingMessage,
    getMessageType,
    getOrCreateConversationKey,
    selectedForwardConversationIds,
    showSuccess,
    showToastError
  ])

  const handleUnsendMessage = useCallback(
    (message) => {
      if (!message?.id || !contextUser?.id || message.sender_id !== contextUser.id) {
        return
      }

      setDeleteConfirmationMessage(message)
      setActiveMessageMenuId(null)
    },
    [contextUser?.id]
  )

  const confirmDeleteMessage = useCallback(
    async (message) => {
      if (!message?.id || !contextUser?.id || message.sender_id !== contextUser.id) {
        return
      }

      const unsentAt = new Date().toISOString()
      const updatePayload = {
        is_deleted: true,
        deleted_at: unsentAt,
        content: null,
        media_url: null,
        encrypted_content: null,
        iv: null
      }

      if (Object.prototype.hasOwnProperty.call(message, "image_url")) {
        updatePayload.image_url = null
      }

      if (Object.prototype.hasOwnProperty.call(message, "storage_path")) {
        updatePayload.storage_path = null
      }

      const previousMessage = message

      // Optimistic UI update for sender-side instant feedback.
      setMessages((prev) =>
        prev.map((item) => (item.id === message.id ? { ...item, ...updatePayload } : item))
      )

      setDeleteConfirmationMessage(null)

      if (editingMessage?.id === message.id) {
        setEditingMessage(null)
        setDraftInputValue("")
      }

      if (replyToMessage?.id === message.id) {
        setReplyToMessage(null)
      }

      devLog("[Chat] Deleting message:", { messageId: message.id, deletePayload: updatePayload })

      const { error: unsendError } = await supabase
        .from("messages")
        .update(updatePayload)
        .eq("id", message.id)
        .eq("sender_id", contextUser.id)

      if (unsendError) {
        console.error("[Chat] Failed to unsend message:", unsendError)
        setError("Failed to unsend message")

        setMessages((prev) =>
          prev.map((item) => (item.id === message.id ? { ...item, ...previousMessage } : item))
        )
      } else {
        devLog("[Chat] Message successfully deleted")
        showSuccess("Message unsent")

        // Delete image from private storage if it's an image message
        if (message.storage_path) {
          try {
            await deletePrivateImage(message.storage_path)
            devLog("[Chat] Image deleted from storage")
          } catch (deleteError) {
            devWarn("[Chat] Failed to delete image from storage:", deleteError)
          }
        }
      }
    },
    [contextUser?.id, editingMessage?.id, replyToMessage?.id, setDraftInputValue, showSuccess]
  )

  const handleRemoveReaction = async (messageId, emoji, userId, reactionId = null) => {
    if (!messageId || !emoji || !userId) {
      devWarn("[Chat] Missing required fields for remove reaction:", { messageId, emoji, userId })
      return
    }

    devLog("[Chat] Removing reaction:", {
      messageId,
      userId,
      emoji
    })

    try {
      const isGroupMode = chatModeRef.current === 'group' || chatModeRef.current === 'groups'

      // Optimistically remove from UI first
      const optimisticReaction = isGroupMode 
        ? { group_message_id: messageId, user_id: userId, emoji, id: reactionId }
        : { message_id: messageId, user_id: userId, emoji, id: reactionId }

      if (isGroupMode) {
        // Update group state
        setGroupMessageReactions((prev) => {
          const existing = prev[messageId] || []
          const updated = existing.filter((r) => !(r.id === reactionId || (r.user_id === userId && r.emoji === emoji)))
          return { ...prev, [messageId]: updated.length > 0 ? updated : undefined }
        })
      } else {
        // Update direct state
        removeReactionFromState(optimisticReaction)
      }

      // Close modal immediately to show updated badges
      setReactionModalMessageId(null)

      // Delete from Supabase
      const query = supabase.from("message_reactions").delete().eq("user_id", userId).eq("emoji", emoji)
      
      if (isGroupMode) {
        query.eq("group_message_id", messageId)
      } else {
        query.eq("message_id", messageId)
      }

      const { error: deleteError } = await query

      if (deleteError) {
        console.error("[Chat] Failed to remove reaction:", deleteError)
        setError("Failed to remove reaction")
        // Rollback
        if (isGroupMode) {
          setGroupMessageReactions((prev) => ({
            ...prev,
            [messageId]: [...(prev[messageId] || []), optimisticReaction]
          }))
        } else {
          addReactionToState(optimisticReaction)
        }
      } else {
        devLog("[Chat] Reaction removed successfully")
        await broadcastReactionEvent("DELETE", optimisticReaction)
      }
    } catch (removeError) {
      console.error("[Chat] Remove reaction exception:", removeError)
      setError("Failed to remove reaction")
    }
  }

  const handleSendMessage = useCallback(async () => {
    const content = draftValueRef.current.trim()

    if (!activeConversationId || !contextUser?.id || sending) {
      return
    }

    if (!content) {
      return
    }

    try {
      stopTyping()
      setSending(true)
      setError("")

      if (editingMessage?.id) {
        const editedAt = new Date().toISOString()
        const cryptoKey = await getOrCreateConversationKey(activeConversationId)
        if (!cryptoKey) {
          setError("Failed to encrypt message")
          return
        }

        let encryptedData = null
        try {
          encryptedData = await encrypt(content, cryptoKey)
        } catch (encryptError) {
          console.error("[Chat] Failed to encrypt edited message:", encryptError)
          setError("Failed to encrypt message")
          return
        }

        const { error: updateError } = await supabase
          .from("messages")
          .update({
            encrypted_content: encryptedData.ciphertext,
            iv: encryptedData.iv,
            edited_at: editedAt,
          })
          .eq("id", editingMessage.id)
          .eq("sender_id", contextUser.id)
          .eq("is_deleted", false)

        if (updateError) {
          console.error("[Chat] Failed to edit message:", updateError)
          setError("Failed to edit message")
          return
        }

        setMessages((prev) =>
          prev.map((message) =>
            message.id === editingMessage.id
              ? {
                ...message,
                content,
                encrypted_content: encryptedData.ciphertext,
                iv: encryptedData.iv,
                edited_at: editedAt,
              }
              : message
          )
        )

        setDraftInputValue("")
        setEditingMessage(null)
        requestAnimationFrame(() => {
          inputRef.current?.focus()
        })
        bottomRef.current?.scrollIntoView({ behavior: "smooth" })
        return
      }

      const receiverId = activeConversation
        ? (activeConversation.user1_id === contextUser.id ? activeConversation.user2_id : activeConversation.user1_id)
        : null

      if (!receiverId) {
        setError("Failed to determine message recipient")
        return
      }

      const cryptoKey = await getOrCreateConversationKey(activeConversationId)
      if (!cryptoKey) {
        setError("Failed to encrypt message")
        return
      }

      let encryptedData = null
      try {
        encryptedData = await encrypt(content, cryptoKey)
      } catch (encryptError) {
        console.error("[Chat] Failed to encrypt message:", encryptError)
        setError("Failed to encrypt message")
        return
      }

      const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const optimisticCreatedAt = new Date().toISOString()
      const replyReference = replyToMessage
      const optimisticMessage = {
        id: tempId,
        conversation_id: activeConversationId,
        sender_id: contextUser.id,
        receiver_id: receiverId,
        content,
        encrypted_content: encryptedData.ciphertext,
        iv: encryptedData.iv,
        type: "text",
        media_url: null,
        reply_to_id: replyReference?.id || null,
        delivery_status: "sending",
        created_at: optimisticCreatedAt,
        is_read: false,
        reactions: [],
      }

      setMessages((prev) => [...prev, optimisticMessage])
      setConversations((prev) => {
        const exists = prev.some((c) => c.id === activeConversationId)
        if (exists) {
          devLog("[SidebarSync] Updating existing conversation", { conversationId: activeConversationId })
          const updated = prev.map((conversation) =>
            conversation.id === activeConversationId
              ? {
                ...conversation,
                last_message_content: `You: ${content}`,
                last_message_type: "text",
                last_message_sender_id: contextUser.id,
                last_message_is_read: false,
                last_message_at: optimisticCreatedAt,
                updated_at: optimisticCreatedAt,
              }
              : conversation
          )
          devLog("[SidebarSync] Moving conversation to top", { conversationId: activeConversationId })
          const moved = sortConversationsByPriority(updated)
          return moved
        }

        // Insert new conversation object (hydrate minimally from known data)
        devLog("[SidebarSync] Inserting new conversation", { conversationId: activeConversationId })
        const newConversation = {
          id: activeConversationId,
          user1_id: contextUser.id,
          user2_id: receiverId,
          created_at: optimisticCreatedAt,
          updated_at: optimisticCreatedAt,
          last_message_content: `You: ${content}`,
          last_message_type: "text",
          last_message_sender_id: contextUser.id,
          last_message_is_read: false,
          last_message_at: optimisticCreatedAt,
          partner: profilesById[receiverId] || { id: receiverId, username: "unknown", name: "Unknown user", avatar_url: null },
        }

        const inserted = [newConversation, ...prev]
        return sortConversationsByPriority(inserted)
      })

      // Keep the full/all conversations in sync
      setAllConversations((prevAll) => {
        if (!prevAll) return prevAll
        const existsAll = prevAll.some((c) => c.id === activeConversationId)
        if (existsAll) {
          const updatedAll = prevAll.map((conversation) =>
            conversation.id === activeConversationId
              ? {
                ...conversation,
                last_message_content: `You: ${content}`,
                last_message_type: "text",
                last_message_sender_id: contextUser.id,
                last_message_is_read: false,
                last_message_at: optimisticCreatedAt,
                updated_at: optimisticCreatedAt,
              }
              : conversation
          )
          return sortConversationsByPriority(updatedAll)
        }

        const newConversationAll = {
          id: activeConversationId,
          user1_id: contextUser.id,
          user2_id: receiverId,
          created_at: optimisticCreatedAt,
          updated_at: optimisticCreatedAt,
          last_message_content: `You: ${content}`,
          last_message_type: "text",
          last_message_sender_id: contextUser.id,
          last_message_is_read: false,
          last_message_at: optimisticCreatedAt,
          partner: profilesById[receiverId] || { id: receiverId, username: "unknown", name: "Unknown user", avatar_url: null },
        }

        return sortConversationsByPriority([newConversationAll, ...prevAll])
      })

      setDraftInputValue("")
      setReplyToMessage(null)
      requestAnimationFrame(() => {
        inputRef.current?.focus()
      })
      bottomRef.current?.scrollIntoView({ behavior: "smooth" })

      void (async () => {
        const { data: insertedData, error: insertError } = await supabase
          .from("messages")
          .insert([
            {
              conversation_id: activeConversationId,
              sender_id: contextUser.id,
              receiver_id: receiverId,
              encrypted_content: encryptedData.ciphertext,
              iv: encryptedData.iv,
              type: "text",
              media_url: null,
              reply_to_id: replyReference?.id || null,
              delivery_status: "sent",
            },
          ])
          .select()

        if (insertError) {
          // If conversation was hard-deleted from DB (both users deleted it),
          // recreate it and retry the message insert with the new conversation ID
          if (insertError.code === "23503") {
            try {
              const { data: newConv, error: createError } = await supabase
                .from("conversations")
                .insert({ user1_id: contextUser.id, user2_id: receiverId })
                .select("id")
                .single()

              if (createError || !newConv?.id) {
                console.error("[Chat] Failed to recreate conversation:", createError)
                setMessages((prev) => prev.filter((item) => item.id !== tempId))
                setError("Failed to send message")
                return
              }

              const newConversationId = newConv.id

              // Retry insert with new conversation ID
              const { data: retryData, error: retryError } = await supabase
                .from("messages")
                .insert([
                  {
                    conversation_id: newConversationId,
                    sender_id: contextUser.id,
                    receiver_id: receiverId,
                    encrypted_content: encryptedData.ciphertext,
                    iv: encryptedData.iv,
                    type: "text",
                    media_url: null,
                    reply_to_id: replyReference?.id || null,
                    delivery_status: "sent",
                  },
                ])
                .select()

              if (retryError) {
                console.error("[Chat] Failed to send message after recreating conversation:", retryError)
                setMessages((prev) => prev.filter((item) => item.id !== tempId))
                setError("Failed to send message")
                return
              }

              // Update local message with real data using the new conversation ID
              const retriedMessage = retryData?.[0]
              if (retriedMessage) {
                setMessages((prev) =>
                  prev.map((item) =>
                    item.id === tempId
                      ? { ...retriedMessage, content, type: "text", reactions: item.reactions || [] }
                      : item
                  )
                )
              }

              // Update conversation preferences and refresh
              await upsertConversationPreference(newConversationId, { is_deleted: false, is_archived: false })
              setConversationPreferencesById((prev) => ({
                ...prev,
                [newConversationId]: { is_deleted: false, is_archived: false },
              }))
              setConversations((prev) => {
                const updated = prev.map((conversation) =>
                  conversation.id === activeConversationId
                    ? {
                      ...conversation,
                      id: newConversationId,
                      last_message_at: conversation.last_message_at,
                      updated_at: conversation.updated_at,
                    }
                    : conversation
                )
                return sortConversationsByPriority(updated)
              })
              setConversationsCache((prev) => {
                const updated = prev.map((conversation) =>
                  conversation.id === activeConversationId
                    ? {
                      ...conversation,
                      id: newConversationId,
                      last_message_at: conversation.last_message_at,
                      updated_at: conversation.updated_at,
                    }
                    : conversation
                )
                return sortConversationsByPriority(updated)
              })
              // Navigate to the new conversation ID so subsequent sends use the correct ID
              navigateToConversation(newConversationId)
              return
            } catch (recreateErr) {
              console.error("[Chat] Exception recreating conversation:", recreateErr)
              setMessages((prev) => prev.filter((item) => item.id !== tempId))
              setError("Failed to send message")
              return
            }
          }

          console.error("[Chat] Failed to send message:", insertError)
          setMessages((prev) => prev.filter((item) => item.id !== tempId))
          setError("Failed to send message")
          return
        }

        const sentMessage = insertedData?.[0]
        if (sentMessage) {
          setMessages((prev) =>
            prev.map((item) =>
              item.id === tempId
                ? {
                  ...sentMessage,
                  content,
                  type: "text",
                  reactions: item.reactions || [],
                }
                : item
            )
          )
        }

        const resolvedConversationId = sentMessage?.conversation_id || activeConversation?.id || activeConversationId

        await dispatchPushNotification({
          recipientId: receiverId,
          actorId: contextUser.id,
          title: senderDisplayName,
          body: content,
          route: `/chat/direct/${resolvedConversationId}`,
          data: {
            type: "message",
            senderName: senderDisplayName,
            messageText: content,
            conversation_id: resolvedConversationId,
            notification_id: sentMessage?.id || null,
            recipient_id: receiverId,
            receiver_id: receiverId,
            markReadEndpoint: `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/mark-chat-read`,
            sender_id: contextUser.id,
          },
        })
      })()
    } catch (err) {
      console.error("[Chat] Send exception:", err)
      setError("Failed to send message")
    } finally {
      setSending(false)
    }
  }, [
    activeConversation,
    activeConversationId,
    contextUser?.id,
    dispatchPushNotification,
    editingMessage?.id,
    getOrCreateConversationKey,
    replyToMessage,
    senderDisplayName,
    sending,
    setDraftInputValue,
    sortConversationsByPriority,
    stopTyping,
  ])

  useEffect(() => {
    if (!activeConversationId || !contextUser?.id) return
    const unread = unreadCountsByConversation[activeConversationId] || 0
    if (unread <= 0) return
    markConversationMessagesAsRead(activeConversationId, contextUser.id)
  }, [activeConversationId, contextUser?.id])

  // Also mark messages as read when window gains focus
  useEffect(() => {
    if (!activeConversationId || !contextUser?.id) return
    const handleFocus = () => markConversationMessagesAsRead(activeConversationId, contextUser.id)
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [activeConversationId, contextUser?.id, markConversationMessagesAsRead])

  const handleStartConversationWithUser = async (selectedUser) => {
    if (!contextUser?.id || !selectedUser?.id) {
      return
    }

    if (selectedUser.id === contextUser.id) {
      return
    }

    try {
      setStartingConversationUserId(selectedUser.id)
      setError("")

      const me = contextUser.id
      const them = selectedUser.id

      const { data: existingConversation, error: existingError } = await supabase
        .from("conversations")
        .select("id, user1_id, user2_id")
        .or(`and(user1_id.eq.${me},user2_id.eq.${them}),and(user1_id.eq.${them},user2_id.eq.${me})`)
        .limit(1)
        .maybeSingle()

      if (existingError) {
        console.error("[Chat] Failed to check existing conversation:", existingError)
        setError("Failed to open conversation")
        return
      }

      let conversationId = existingConversation?.id

      if (!conversationId) {
        const { data: createdConversation, error: createError } = await supabase
          .from("conversations")
          .insert({
            user1_id: me,
            user2_id: them
          })
          .select("id")
          .single()

        if (createError) {
          console.error("[Chat] Failed to create conversation:", createError)
          setError("Failed to create conversation")
          return
        }

        conversationId = createdConversation?.id
      } else {
        // Always clear is_deleted from local state immediately — prevents visibleConversations
        // filter from hiding conversation during the fetchConversations round-trip
        setConversationPreferencesById((prev) => ({
          ...prev,
          [conversationId]: {
            ...(prev[conversationId] || {}),
            is_deleted: false,
            is_archived: false
          }
        }))
        // Also persist to DB if needed
        const convPref = conversationPreferencesById[conversationId]
        if (!convPref || convPref?.is_deleted === true) {
          await upsertConversationPreference(conversationId, {
            is_deleted: false,
            is_archived: false
          })
        }
        // Clear stale cached messages so fresh ones load with deleteTime filter applied
        setMessagesCache(conversationId, [])
      }

      if (!conversationId) {
        setError("Failed to open conversation")
        return
      }

      // Ensure conversation has an encryption key
      await getOrCreateConversationKey(conversationId)

      // Small delay to allow DB write to propagate before re-fetching
      _restoringConversationIds.add(conversationId)
      await new Promise((resolve) => setTimeout(resolve, 600))
      await fetchConversations(me, { force: true })
      _restoringConversationIds.delete(conversationId)
      navigateToConversation(conversationId)
      setUserSearchQuery("")
      setUserSearchResults([])
    } catch (err) {
      console.error("[Chat] Start conversation exception:", err)
      setError("Failed to open conversation")
    } finally {
      setStartingConversationUserId(null)
    }
  }

  // ============ GROUP CHAT FUNCTIONS ============

  const fetchUnreadGroupCounts = useCallback(async (userId, groupIds) => {
    const resolvedUserId = userId || contextUser?.id
    const ids = Array.isArray(groupIds) ? groupIds.filter(Boolean) : []

    if (!resolvedUserId || ids.length === 0) {
      setUnreadGroupCountsByGroup({})
      return {}
    }

    try {
      const { data: messageRows, error: messageError } = await supabase
        .from("group_messages")
        .select("id, group_id, sender_id")
        .in("group_id", ids)

      if (messageError) {
        console.error("[GroupChat] Error fetching unread group message rows:", messageError)
        return {}
      }

      const candidateRows = (messageRows || []).filter((row) => row.sender_id !== resolvedUserId)
      const candidateMessageIds = candidateRows.map((row) => row.id).filter(Boolean)

      let readMessageIds = new Set()
      if (candidateMessageIds.length > 0) {
        const { data: readsRows, error: readsError } = await supabase
          .from("group_message_reads")
          .select("message_id")
          .eq("user_id", resolvedUserId)
          .in("message_id", candidateMessageIds)

        if (readsError) {
          console.error("[GroupChat] Error fetching unread group read rows:", readsError)
          return {}
        }

        readMessageIds = new Set((readsRows || []).map((row) => row.message_id).filter(Boolean))
      }

      const nextCounts = ids.reduce((acc, groupId) => {
        acc[groupId] = 0
        return acc
      }, {})

      candidateRows.forEach((row) => {
        if (!readMessageIds.has(row.id)) {
          nextCounts[row.group_id] = (nextCounts[row.group_id] || 0) + 1
        }
      })

      setUnreadGroupCountsByGroup(nextCounts)
      return nextCounts
    } catch (err) {
      console.error("[GroupChat] Exception fetching unread group counts:", err)
      return {}
    }
  }, [contextUser?.id])

  const fetchGroups = useCallback(async () => {
    if (!contextUser?.id) return
    try {
      setLoadingGroups(true)
      const { data, error: fetchError } = await supabase
        .from("group_conversations")
        .select(`
          id,
          name,
          created_by,
          created_at,
          last_message,
          last_message_at,
          encryption_key,
          group_members!inner(user_id)
        `)
        .eq("group_members.user_id", contextUser.id)
        .order("last_message_at", { ascending: false })

      if (fetchError) {
        console.error("[GroupChat] Error fetching groups:", fetchError)
        return
      }

      setGroups(data || [])
      const groupIds = (data || []).map((group) => group.id).filter(Boolean)
      await fetchUnreadGroupCounts(contextUser.id, groupIds)
      if (!isMobileView && data?.length > 0 && !activeGroupId) {
        setActiveGroupId(data[0].id)
      }
    } catch (err) {
      console.error("[GroupChat] Exception fetching groups:", err)
    } finally {
      setLoadingGroups(false)
      setHasFetchedGroups(true)
    }
  }, [contextUser?.id, activeGroupId, fetchUnreadGroupCounts, isMobileView])

  const fetchGroupMessages = useCallback(async (groupId, encryptionKey) => {
    if (!groupId || !encryptionKey) return
    try {
      setLoadingGroupMessages(true)
      const { data: rawMessages, error: fetchError } = await supabase
        .from("group_messages")
        .select("*")
        .eq("group_id", groupId)
        .order("created_at", { ascending: true })
        .limit(100)

      if (fetchError) {
        console.error("[GroupChat] Error fetching messages:", fetchError)
        return
      }

      // Get sender profiles
      const senderIds = [...new Set((rawMessages || []).map((m) => m.sender_id).filter(Boolean))]
      const { data: profiles, error: profileError } = await supabase
        .from("profiles")
        .select("id, username, name, avatar_url")
        .in("id", senderIds)

      if (profileError) {
        console.error("[GroupChat] Error fetching profiles:", profileError)
      }

      const senderProfiles = profiles || []
      mergeProfiles(senderProfiles)

      const senderProfilesById = {}
      senderProfiles.forEach((p) => {
        senderProfilesById[p.id] = p
      })

      // Decrypt messages
      const decryptedMessages = await Promise.all(
        (rawMessages || []).map(async (msg) => {
          let content = msg.content
          if (msg.is_encrypted && msg.encrypted_content && msg.iv && encryptionKey) {
            try {
              const cryptoKey = await importKey(encryptionKey)
              content = await decrypt(msg.encrypted_content, msg.iv, cryptoKey)
            } catch (err) {
              console.error("[GroupChat] Error decrypting message:", err)
              content = "[Unable to decrypt]"
            }
          }
          return {
            ...msg,
            content,
            senderProfile: senderProfilesById[msg.sender_id]
          }
        })
      )

      setGroupMessages((prev) => {
        const map = new Map()
          ;[...prev, ...decryptedMessages].forEach((m) => {
            if (m.id) map.set(m.id, m)
          })
        return Array.from(map.values())
      })
      return decryptedMessages
    } catch (err) {
      console.error("[GroupChat] Exception fetching messages:", err)
    } finally {
      setLoadingGroupMessages(false)
    }
  }, [])

  const fetchGroupMembers = useCallback(async (groupId) => {
    if (!groupId) return
    try {
      const { data, error: fetchError } = await supabase
        .from("group_members")
        .select(`user_id, role, profiles(id, username, name, avatar_url)`)
        .eq("group_id", groupId)

      if (fetchError) {
        console.error("[GroupChat] Error fetching members:", fetchError)
        return
      }

      setGroupMembers(data || [])
      const membersProfiles = (data || []).map(m => m.profiles).filter(Boolean)
      mergeProfiles(membersProfiles)
    } catch (err) {
      console.error("[GroupChat] Exception fetching members:", err)
    }
  }, [])

  // Validate group membership for RLS policy compliance
  const validateGroupMembership = useCallback(async (groupId) => {
    if (!groupId || !contextUser?.id) return false

    try {
      const { data, error } = await supabase
        .from('group_members')
        .select('id')
        .eq('group_id', groupId)
        .eq('user_id', contextUser.id)
        .limit(1)

      if (error) {
        devWarn('[GroupChat] [RLS-FIX] Error checking group membership:', {
          groupId,
          authUserId: contextUser.id,
          error: error.message
        })
        return false
      }

      const isMember = (data && data.length > 0)
      devLog('[GroupChat] [RLS-FIX] Group membership validation:', {
        groupId,
        authUserId: contextUser.id,
        is_member: isMember,
        rls_requirement: 'User must be in group_members for auth.uid() to pass nested EXISTS check'
      })
      return isMember
    } catch (err) {
      devWarn('[GroupChat] [RLS-FIX] Exception validating group membership:', err)
      return false
    }
  }, [contextUser?.id])

  const fetchGroupMessageReads = useCallback(async (messageIds) => {
    if (!messageIds || messageIds.length === 0) return

    try {
      const { data: reads, error } = await supabase
        .from('group_message_reads')
        .select('message_id, user_id, read_at, profiles(id, username, name, avatar_url)')
        .in('message_id', messageIds)

      if (error) {
        console.error('[GroupChat] Error fetching read receipts:', error)
        return
      }

      const map = {}

        ; (reads || []).forEach((read) => {
          if (!map[read.message_id]) {
            map[read.message_id] = []
          }
          map[read.message_id].push({
            user_id: read.user_id,
            read_at: read.read_at,
            profile: read.profiles
          })
        })

      setGroupMessageReads(map)
      devLog('[GroupChat] Fetched read receipts for', messageIds.length, 'messages')
      return map
    } catch (err) {
      console.error('[GroupChat] Exception fetching message reads:', err)
    }
  }, [])

  const markGroupMessagesAsRead = useCallback(async (groupId, messageIds) => {
    if (!groupId || !messageIds || messageIds.length === 0) {
      devWarn('[GroupChat] markGroupMessagesAsRead: Missing groupId or messageIds')
      return
    }

    try {
      const rows = messageIds.map((id) => ({
        message_id: id,
        user_id: contextUser.id,
        read_at: new Date().toISOString()
      }))

      const { error } = await supabase
        .from('group_message_reads')
        .upsert(rows, {
          onConflict: 'message_id,user_id'
        })

      if (error) {
        console.error('[GroupChat] Read receipt error:', error)
        return
      }

      await fetchGroupMessageReads(messageIds)
    } catch (err) {
      devWarn('[GroupChat] Exception marking messages as read:', {
        error: err.message,
        userId: contextUser.id,
        groupId
      })
    }
  }, [contextUser?.id, fetchGroupMessageReads])

  const searchUsersToAdd = useCallback(async (query) => {
    if (!query.trim()) {
      setMemberSearchResults([])
      return
    }

    const existingIds = groupMembers.map(m => m.user_id)
    try {
      const { data } = await supabase
        .from('profiles')
        .select('id, username, name, avatar_url')
        .ilike('username', `%${query}%`)
        .not('id', 'in', `(${existingIds.join(',')})`)
        .limit(5)
      setMemberSearchResults(data || [])
    } catch (err) {
      console.error("[GroupChat] Error searching users:", err)
    }
  }, [groupMembers])

  const handleAddMemberToGroup = useCallback(async (userId) => {
    if (!activeGroupId) return
    try {
      const { error } = await supabase
        .from('group_members')
        .insert({ group_id: activeGroupId, user_id: userId, role: 'member' })
      if (!error) {
        await fetchGroupMembers(activeGroupId)
        showSuccess('Member added')
      } else {
        showToastError('Failed to add member')
      }
    } catch (err) {
      console.error("[GroupChat] Error adding member:", err)
      showToastError('Failed to add member')
    }
  }, [activeGroupId, fetchGroupMembers, showSuccess, showToastError])

  const handleRemoveMember = useCallback(async (userId) => {
    if (!activeGroupId) return
    try {
      const { error } = await supabase
        .from('group_members')
        .delete()
        .eq('group_id', activeGroupId)
        .eq('user_id', userId)
      if (!error) {
        await fetchGroupMembers(activeGroupId)
        showSuccess('Member removed')
      } else {
        showToastError('Failed to remove member')
      }
    } catch (err) {
      console.error("[GroupChat] Error removing member:", err)
      showToastError('Failed to remove member')
    }
  }, [activeGroupId, fetchGroupMembers, showSuccess, showToastError])

  const handleMakeMemberAdmin = useCallback(async (userId) => {
    if (!activeGroupId) return
    try {
      const { error } = await supabase
        .from('group_members')
        .update({ role: 'admin' })
        .eq('group_id', activeGroupId)
        .eq('user_id', userId)
      if (!error) {
        await fetchGroupMembers(activeGroupId)
        showSuccess('Member is now an admin')
      } else {
        showToastError('Failed to update role')
      }
    } catch (err) {
      console.error("[GroupChat] Error updating role:", err)
      showToastError('Failed to update role')
    }
  }, [activeGroupId, fetchGroupMembers, showSuccess, showToastError])


  useEffect(() => {
    if (!activeGroupId || chatMode !== 'groups') return

    const group = groups.find((g) => g.id === activeGroupId)
    if (!group) return

    // Unsubscribe from old channel if exists
    if (groupMessagesChannelRef.current) {
      supabase.removeChannel(groupMessagesChannelRef.current)
    }
    if (groupReactionsChannelRef.current) {
      supabase.removeChannel(groupReactionsChannelRef.current)
    }

    // Subscribe to new group messages
    const channel = supabase
      .channel(`group-messages-${group.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "group_messages",
          filter: `group_id=eq.${group.id}`
        },
        async (payload) => {
          const newMessage = payload.new

          // Skip own messages — already added via optimistic update in handleSendGroupMessage
          if (newMessage.sender_id === contextUser?.id) return

          let content = newMessage.content

          if (newMessage.is_encrypted && newMessage.encrypted_content && newMessage.iv && group.encryption_key) {
            try {
              const cryptoKey = await importKey(group.encryption_key)
              content = await decrypt(newMessage.encrypted_content, newMessage.iv, cryptoKey)
            } catch (err) {
              console.error("[GroupChat] Error decrypting new message:", err)
              content = "[Unable to decrypt]"
            }
          }

          // Fetch sender profile
          const { data: senderProfile } = await supabase
            .from("profiles")
            .select("id, username, name, avatar_url")
            .eq("id", newMessage.sender_id)
            .single()

          // Format message for preview
          let displayContent = ""
          if (content && typeof content === "string" && content.trim()) {
            let previewText = content.trim()
            // Add sender name prefix
            if (senderProfile?.name) {
              previewText = `${senderProfile.name}: ${previewText}`
            }
            // Truncate long previews
            if (previewText.length > 50) {
              previewText = previewText.substring(0, 47) + "..."
            }
            displayContent = previewText
          } else if (newMessage.file_url) {
            displayContent = "📎 File"
          } else if (newMessage.image_url) {
            displayContent = "📷 Photo"
          } else {
            displayContent = "[Message content unavailable]"
          }

          setGroupMessages((prev) => [
            ...prev,
            {
              ...newMessage,
              content,
              senderProfile: senderProfile
            }
          ])

          // Update group list preview
          setGroups((prev) =>
            prev
              .map((g) =>
                g.id === group.id
                  ? {
                    ...g,
                    last_message: displayContent,
                    last_message_at: newMessage.created_at
                  }
                  : g
              )
              .sort((a, b) => {
                const aTime = a.last_message_at || a.created_at
                const bTime = b.last_message_at || b.created_at
                return new Date(bTime).getTime() - new Date(aTime).getTime()
              })
          )

          setTimeout(() => {
            groupBottomRef.current?.scrollIntoView({ behavior: "smooth" })
          }, 0)
        }
      )
      .subscribe()

    // Subscribe to message reactions in real-time
    const groupReactionsChannel = supabase
      .channel(`group-reactions-${group.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "message_reactions"
        },
        async (payload) => {
          console.log("[ReactionRealtimeReceived]", payload)
          if (payload.eventType === "INSERT") {
            handleReactionInsert(payload.new)
          } else if (payload.eventType === "DELETE") {
            handleReactionDelete(payload.old)
          }
        }
      )
      .subscribe()

    groupMessagesChannelRef.current = channel
    groupReactionsChannelRef.current = groupReactionsChannel

    // Subscribe to message reads (seen by) in real-time
    const readsChannel = supabase
      .channel(`group-reads-${group.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "group_message_reads"
        },
        async (payload) => {
          devLog("[Chat] group_message_reads INSERT received:", payload)
          const ids = groupMessages.map((m) => m.id)

          if (ids.length) {
            devLog("[Chat] Fetching message reads for", ids.length, "messages")
            await fetchGroupMessageReads(ids)
          }
        }
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
      supabase.removeChannel(groupReactionsChannel)
      supabase.removeChannel(readsChannel)
      if (groupMessagesChannelRef.current === channel) {
        groupMessagesChannelRef.current = null
      }
      if (groupReactionsChannelRef.current === groupReactionsChannel) {
        groupReactionsChannelRef.current = null
      }
    }
  }, [activeGroupId])

  const handleSelectGroup = useCallback(
    async (group) => {
      setActiveGroupId(group.id)
      setShowMembersDropdown(false)
      setUnreadGroupCountsByGroup((prev) => ({
        ...prev,
        [group.id]: 0
      }))

      if (group.encryption_key) {
        try {
          const cryptoKey = await importKey(group.encryption_key)
          const msgs = await fetchGroupMessages(group.id, group.encryption_key)

          // After fetchGroupMessages completes, fetch reads for all messages
          if (msgs && msgs.length > 0) {
            const allIds = msgs.map(m => m.id)
            await fetchGroupMessageReactions(allIds)
            await fetchGroupMessageReads(allIds)
          }
        } catch (err) {
          console.error("[GroupChat] Error importing key:", err)
        }
      }

      await fetchGroupMembers(group.id)
    },
    [fetchGroupMessages, fetchGroupMembers, fetchGroupMessageReads]
  )

  const handleOpenGroupFromList = useCallback(
    (group) => {
      if (!group?.id) {
        return
      }

      setChatMode("groups")
      navigate(`/chat/group/${group.id}`)

      handleSelectGroup(group)
    },
    [handleSelectGroup, navigate]
  )

  useEffect(() => {
    if (!routeGroupId || !contextUser?.id) {
      return
    }

    const routeGroup = groups.find((group) => group.id === routeGroupId)
    if (!routeGroup) {
      if (!loadingGroups && hasFetchedGroups) {
        if (import.meta.env.DEV) {
          console.log("[Chat][RouteRestore] Group route not found after fetch, fallback to groups list", {
            routeGroupId,
            loadingGroups,
            hasFetchedGroups,
            groupsCount: groups.length
          })
        }
        setActiveGroupId(null)
        navigate("/chat?tab=groups", { replace: true })
      }
      return
    }

    if (activeGroupId === routeGroupId) {
      if (import.meta.env.DEV) {
        console.log("[Chat][RouteRestore] Group already active", { routeGroupId })
      }
      return
    }

    if (import.meta.env.DEV) {
      console.log("[Chat][RouteRestore] Restoring group from route", {
        routeGroupId,
        loadingGroups,
        hasFetchedGroups
      })
    }
    setChatMode("groups")
    handleSelectGroup(routeGroup)
  }, [activeGroupId, contextUser?.id, groups, handleSelectGroup, hasFetchedGroups, loadingGroups, navigate, routeGroupId])

  // Issue 1: Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (groupMessages.length > 0) {
      setTimeout(() => {
        groupBottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
      }, 0)
    }
  }, [groupMessages])

  // Issue 2: Mark group messages as read when viewing group (debounced to avoid constant calls)
  useEffect(() => {
    if (!activeGroupId || !groupMessages || groupMessages.length === 0 || !contextUser?.id) return

    const timer = setTimeout(() => {
      const messageIds = groupMessages.map((msg) => msg.id)

      if (messageIds.length > 0) {
        markGroupMessagesAsRead(activeGroupId, messageIds)
        setUnreadGroupCountsByGroup((prev) => ({
          ...prev,
          [activeGroupId]: 0
        }))
      }
    }, 500)

    return () => clearTimeout(timer)
  }, [activeGroupId, groupMessages, contextUser?.id, markGroupMessagesAsRead])

  // Calculate unread counts - sum of all unread messages
  const unreadDirectCount = useMemo(() => {
    return Object.values(unreadCountsByConversation).reduce((sum, count) => sum + count, 0)
  }, [unreadCountsByConversation])

  const unreadGroupCount = useMemo(() => {
    return Object.values(unreadGroupCountsByGroup).reduce((sum, count) => sum + count, 0)
  }, [unreadGroupCountsByGroup])

  const totalUnreadChatCount = unreadDirectCount + unreadGroupCount

  const visibleConversations = useMemo(() => {
    return conversations.filter((conversation) => {
      const preference = conversationPreferencesById[conversation.id]
      const archived = isPreferenceArchived(preference)

      if (directSidebarView === CHAT_LIST_VIEW.ARCHIVED) return archived
      return !archived
    })
  }, [conversations, conversationPreferencesById, directSidebarView, isPreferenceArchived, CHAT_LIST_VIEW.ARCHIVED])

  const availableConversationCount = useMemo(() => {
    return conversations.length
  }, [conversations])

  const focusDirectUserSearch = useCallback(() => {
    setChatMode("direct")
    setDirectSidebarView(CHAT_LIST_VIEW.ACTIVE)
    navigate("/chat", { replace: true })
    requestAnimationFrame(() => {
      userSearchInputRef.current?.focus()
    })
  }, [navigate])

  const archivedConversationCount = useMemo(() => {
    return conversations.filter((conversation) => {
      const preference = conversationPreferencesById[conversation.id]
      return isPreferenceArchived(preference)
    }).length
  }, [conversations, conversationPreferencesById, isPreferenceArchived])

  const visibleGroups = useMemo(() => {
    return groups.filter((group) => {
      const preference = groupPreferencesById[group.id]
      const archived = isPreferenceArchived(preference)
      const deleted = isPreferenceDeleted(preference)

      if (deleted) return false
      if (groupSidebarView === CHAT_LIST_VIEW.ARCHIVED) return archived
      return !archived
    })
  }, [groups, groupPreferencesById, groupSidebarView, isPreferenceArchived, isPreferenceDeleted, CHAT_LIST_VIEW.ARCHIVED])

  const archivedGroupCount = useMemo(() => {
    return groups.filter((group) => {
      const preference = groupPreferencesById[group.id]
      return isPreferenceArchived(preference) && !isPreferenceDeleted(preference)
    }).length
  }, [groups, groupPreferencesById, isPreferenceArchived, isPreferenceDeleted])

  // Dispatch unread count update to navbar
  useEffect(() => {
    devLog("[Chat] Dispatching unread count update:", {
      totalUnreadChatCount,
      unreadDirectCount,
      unreadGroupCount
    })
    window.dispatchEvent(
      new CustomEvent("totalChatUnreadChanged", {
        detail: {
          totalUnreadChatCount,
          unreadDirectCount,
          unreadGroupCount
        }
      })
    )
  }, [totalUnreadChatCount, unreadDirectCount, unreadGroupCount])

  const handleSendGroupMessage = useCallback(async () => {
    if (!groupDraft.trim() || !activeGroupId || !contextUser?.id) return

    try {
      setSendingGroup(true)
      const activeGroup = groups.find((g) => g.id === activeGroupId)
      if (!activeGroup?.encryption_key) {
        console.error("[GroupChat] No encryption key found for group:", activeGroupId)
        showToastError("No encryption key found")
        return
      }

      devLog("[GroupChat] Preparing to send message", {
        group_id: activeGroupId,
        sender_id: contextUser.id,
        content_length: groupDraft.length
      })

      const cryptoKey = await importKey(activeGroup.encryption_key)
      const encrypted = await encrypt(groupDraft, cryptoKey)

      devLog("[GroupChat] Message encrypted successfully", {
        ciphertext_length: encrypted.ciphertext.length,
        iv_length: encrypted.iv.length
      })

      const insertPayload = [
        {
          group_id: activeGroupId,
          sender_id: contextUser.id,
          encrypted_content: encrypted.ciphertext,
          iv: encrypted.iv,
          is_encrypted: true,
          type: "text",
          content: null,
          reply_to_id: groupReplyTo?.id || null
        }
      ]

      devLog("[GroupChat] Inserting message with payload:", {
        group_id: insertPayload[0].group_id,
        sender_id: insertPayload[0].sender_id,
        is_encrypted: insertPayload[0].is_encrypted,
        type: insertPayload[0].type
      })

      const { data: insertedData, error: insertError } = await supabase
        .from("group_messages")
        .insert(insertPayload)
        .select()

      if (insertError) {
        console.error("[GroupChat] Error inserting message:", {
          error: insertError,
          message: insertError.message,
          details: insertError.details,
          hint: insertError.hint
        })
        showToastError(`Failed to send message: ${insertError.message}`)
        return
      }

      devLog("[GroupChat] Message inserted successfully:", insertedData)

      // Save draft before clearing
      const sentContent = groupDraft.trim()

      // Optimistic update: immediately append message to UI with plaintext content
      if (insertedData && insertedData.length > 0) {
        const newMessageId = insertedData[0].id

        // Format display content
        let displayContent = sentContent
        if (displayContent && displayContent.trim()) {
          // Add "You: " prefix for sent messages
          displayContent = `You: ${displayContent.trim()}`
          if (displayContent.length > 50) {
            displayContent = displayContent.substring(0, 47) + "..."
          }
        }

        setGroupMessages((prev) => [
          ...prev,
          {
            ...insertedData[0],
            content: sentContent,  // Use plaintext for immediate display
            reply_to_id: groupReplyTo?.id || null,
            senderProfile: {
              id: contextUser?.id,
              username: contextUser?.username || '',
              name: contextUser?.name || '',
              avatar_url: contextUser?.avatar_url || null
            }
          }
        ])

        // Update group list preview
        setGroups((prev) =>
          prev
            .map((g) =>
              g.id === activeGroupId
                ? {
                  ...g,
                  last_message: displayContent,
                  last_message_at: insertedData[0].created_at
                }
                : g
            )
            .sort((a, b) => {
              const aTime = a.last_message_at || a.created_at
              const bTime = b.last_message_at || b.created_at
              return new Date(bTime).getTime() - new Date(aTime).getTime()
            })
        )

        // Initialize empty read state for new message
        setGroupMessageReads((prev) => ({
          ...prev,
          [newMessageId]: []
        }))
        devLog("[GroupChat] Optimistically updated message list with new message, initialized read state")
      }

      // Fire-and-forget: Update last message timestamp in group (non-blocking)
      ; (async () => {
        try {
          const { error: updateError } = await supabase
            .from("group_conversations")
            .update({
              last_message_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })
            .eq("id", activeGroupId)

          if (updateError) {
            devWarn("[GroupChat] Warning: Failed to update group last_message_at (non-blocking):", updateError)
          }
        } catch (err) {
          devWarn("[GroupChat] Warning: Exception updating group last_message_at (non-blocking):", err)
        }
      })()

      // ONLY clear draft after successful insert
      setGroupDraft("")
      setGroupReplyTo(null)
      devLog("[GroupChat] Message sent successfully, draft cleared")
    } catch (err) {
      console.error("[GroupChat] Exception sending message:", {
        error: err,
        message: err.message,
        stack: err.stack
      })
      showToastError(`Failed to send message: ${err.message}`)
    } finally {
      setSendingGroup(false)
    }
  }, [groupDraft, activeGroupId, contextUser?.id, groups, groupReplyTo, showToastError])

  const searchNewGroupUsers = useCallback(async (query) => {
    if (!query.trim()) {
      setNewGroupSearchResults([])
      return
    }

    try {
      const { data, error: searchError } = await supabase
        .from("profiles")
        .select("id, username, name, avatar_url")
        .ilike("username", `%${query}%`)
        .neq("id", contextUser?.id)
        .limit(8)

      if (searchError) {
        console.error("[GroupChat] Error searching users:", searchError)
        return
      }

      const filtered = (data || []).filter((profile) => !newGroupSelectedUsers.some((u) => u.id === profile.id))
      setNewGroupSearchResults(filtered)
    } catch (err) {
      console.error("[GroupChat] Exception searching users:", err)
    }
  }, [contextUser?.id, newGroupSelectedUsers])

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) {
      showToastError('Please enter a group name')
      return
    }
    if (newGroupSelectedUsers.length === 0) {
      showToastError('Please add at least one member')
      return
    }

    setCreatingGroup(true)

    try {
      if (!authReady || !contextUser?.id) {
        showToastError('Authentication error. Please refresh and try again.')
        setCreatingGroup(false)
        return
      }
      const userId = contextUser.id
      devLog('[GroupChat] Creating group as user:', userId)

      // Generate encryption key
      const key = await generateKey()
      const exportedKey = await exportKey(key)

      // Step 1: Insert group conversation
      const insertPayload = {
        name: newGroupName.trim(),
        created_by: userId,
        encryption_key: exportedKey,
        last_message_at: new Date().toISOString()
      }
      devLog('[GroupChat] Inserting group with payload:', { ...insertPayload, encryption_key: '[REDACTED]' })

      const { data: newGroup, error: groupError } = await supabase
        .from('group_conversations')
        .insert(insertPayload)
        .select('id, name')
        .single()

      if (groupError) {
        console.error('[GroupChat] Error creating group:', groupError)
        showToastError('Failed to create group')
        setCreatingGroup(false)
        return
      }

      devLog('[GroupChat] Group created:', newGroup.id)

      // Step 2: Add creator as admin
      const { error: creatorError } = await supabase
        .from('group_members')
        .insert({ group_id: newGroup.id, user_id: userId, role: 'admin' })

      if (creatorError) {
        console.error('[GroupChat] Error adding creator as admin:', creatorError)
      }

      // Step 3: Add selected members
      const memberInserts = newGroupSelectedUsers.map(u => ({
        group_id: newGroup.id,
        user_id: u.id,
        role: 'member'
      }))

      if (memberInserts.length > 0) {
        const { error: membersError } = await supabase
          .from('group_members')
          .insert(memberInserts)

        if (membersError) {
          console.error('[GroupChat] Error adding members:', membersError)
        }
      }

      // Reset and refresh
      setShowNewGroupModal(false)
      setNewGroupName('')
      setNewGroupSelectedUsers([])
      setNewGroupSearch('')
      setNewGroupSearchResults([])
      await fetchGroups()
      showSuccess('Group created!')

    } catch (err) {
      console.error('[GroupChat] Exception creating group:', err)
      showToastError('Failed to create group')
    } finally {
      setCreatingGroup(false)
    }
  }

  // ==================== GROUP CHAT FEATURES ====================

  // Fetch reactions for group messages
  const fetchGroupMessageReactions = useCallback(async (messageIds) => {
    if (!messageIds || messageIds.length === 0) return
    try {
      const { data: reactions, error } = await supabase
        .from('message_reactions')
        // Include id so the realtime DELETE id-lookup fallback works
        .select('id, group_message_id, user_id, emoji')
        .in('group_message_id', messageIds)  // ← group_message_id, NOT message_id

      if (error) {
        console.error('[GroupReactionFetch] Error fetching reactions:', error)
        return
      }

      if (import.meta.env.DEV) console.log('[GroupReactionFetch]', reactions)

      // Group by group_message_id (not message_id which is null for group rows)
      const reactionsMap = {}
      ;(reactions || []).forEach((r) => {
        if (!r.group_message_id) return
        if (!reactionsMap[r.group_message_id]) {
          reactionsMap[r.group_message_id] = []
        }
        // Store the full row so id-based lookup in realtime DELETE handler works
        reactionsMap[r.group_message_id].push({ id: r.id, group_message_id: r.group_message_id, user_id: r.user_id, emoji: r.emoji })
      })

      if (import.meta.env.DEV) console.log('[GroupReactionGrouped]', reactionsMap)
      setGroupMessageReactions(reactionsMap)
    } catch (err) {
      console.error('[GroupReactionFetch] Exception:', err)
    }
  }, [])

  // Update group message (edit)
  const handleUpdateGroupMessage = useCallback(async (messageId, newContent) => {
    if (!activeGroupId || !editingGroupMessage) return

    try {
      const activeGroup = groups.find((g) => g.id === activeGroupId)
      if (!activeGroup?.encryption_key) {
        showToastError('No encryption key found')
        return
      }

      const cryptoKey = await importKey(activeGroup.encryption_key)
      const encrypted = await encrypt(newContent, cryptoKey)

      const { error } = await supabase
        .from('group_messages')
        .update({
          encrypted_content: encrypted.ciphertext,
          iv: encrypted.iv,
          edited_at: new Date().toISOString()
        })
        .eq('id', messageId)

      if (error) {
        console.error('[GroupChat] Error updating message:', error)
        showToastError('Failed to edit message')
        return
      }

      showSuccess('Message edited')
      setEditingGroupMessage(null)
      setGroupDraft('')
    } catch (err) {
      console.error('[GroupChat] Exception updating message:', err)
      showToastError('Failed to edit message')
    }
  }, [activeGroupId, editingGroupMessage, groups, showToastError, showSuccess])

  // Delete group message
  const handleDeleteGroupMessage = useCallback(async (messageId) => {
    if (!activeGroupId) return

    try {
      const { error } = await supabase
        .from('group_messages')
        .update({
          is_deleted: true,
          deleted_at: new Date().toISOString(),
          encrypted_content: null,
          iv: null
        })
        .eq('id', messageId)

      if (error) {
        console.error('[GroupChat] Error deleting message:', error)
        showToastError('Failed to delete message')
        return
      }

      showSuccess('Message deleted')
      setDeleteGroupConfirmationMessage(null)
    } catch (err) {
      console.error('[GroupChat] Exception deleting message:', err)
      showToastError('Failed to delete message')
    }
  }, [activeGroupId, showToastError, showSuccess])

  // Copy group message text
  const handleCopyGroupMessage = useCallback((message) => {
    const textToCopy = message.content || (message.type === 'image' ? `[Image: ${message.file_name || 'Shared image'}]` : '')
    if (!textToCopy) return

    navigator.clipboard.writeText(textToCopy).then(() => {
      showSuccess('Message copied to clipboard')
    }).catch(() => {
      showToastError('Failed to copy message')
    })
  }, [showSuccess, showToastError])

  const handleForwardGroupMessage = useCallback((message) => {
    const sourceText = message.content || (message.caption ? message.caption : "")
    if (!sourceText) return

    const forwardPrefix = `Fwd: ${sourceText}`
    setGroupDraft((prev) => (prev ? `${prev}\n${forwardPrefix}` : forwardPrefix))
    setActiveMenuId(null)
    setActiveGroupEmojiPickerMessageId(null)
    showSuccess("Message prepared for forwarding")
  }, [showSuccess])

  // Handle group image file selection
  const handleGroupImageSelected = useCallback(async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) return

    let processedFile = null
    try {
      processedFile = await prepareImageForUpload(file)
    } catch (err) {
      if (err?.code === "IMAGE_TOO_LARGE") {
        showToastError(IMAGE_TOO_LARGE_MESSAGE)
      } else {
        showToastError(err?.message || "Failed to process image")
      }
      return
    }

    if (groupSelectedImageComposerUrl) {
      URL.revokeObjectURL(groupSelectedImageComposerUrl)
    }

    setGroupSelectedImage(processedFile)
    const url = URL.createObjectURL(processedFile)
    setGroupSelectedImageComposerUrl(url)
    setGroupImageCaption((prev) => {
      if (prev?.trim()) return prev
      return groupDraft.trim()
    })
    if (groupDraft.trim()) {
      setGroupDraft('')
    }
  }, [groupDraft, groupSelectedImageComposerUrl, showToastError])

  // Send group message with image
  const handleSendGroupMessageWithImage = useCallback(async () => {
    if (!groupSelectedImage || !activeGroupId || !contextUser?.id) return

    try {
      setUploadingGroupImage(true)

      // Upload image to storage
      const { publicUrl, error: uploadError } = await uploadImageToPrivateStorage(
        groupSelectedImage,
        contextUser.id,
        activeGroupId
      )

      if (uploadError) {
        console.error('[GroupChat] Error uploading image:', uploadError)
        showToastError('Failed to upload image')
        return
      }

      // Insert message with image
      const activeGroup = groups.find((g) => g.id === activeGroupId)
      if (!activeGroup?.encryption_key) {
        showToastError('No encryption key found')
        return
      }

      const cryptoKey = await importKey(activeGroup.encryption_key)
      const caption = groupImageCaption || ''
      const encrypted = caption ? await encrypt(caption, cryptoKey) : {}

      const { error: insertError } = await supabase
        .from('group_messages')
        .insert({
          group_id: activeGroupId,
          sender_id: contextUser.id,
          type: 'image',
          media_url: publicUrl,
          encrypted_content: encrypted.ciphertext || null,
          iv: encrypted.iv || null,
          content: null
        })

      if (insertError) {
        console.error('[GroupChat] Error sending image message:', insertError)
        showToastError('Failed to send image')
        return
      }

      // Update last message timestamp in group and preview (do NOT store plaintext caption/preview)
      const currentTime = new Date().toISOString()
      await supabase
        .from('group_conversations')
        .update({
          last_message_at: currentTime,
          updated_at: currentTime
        })
        .eq('id', activeGroupId)

      // Update group list preview with image indicator
      setGroups((prev) =>
        prev
          .map((g) =>
            g.id === activeGroupId
              ? {
                ...g,
                last_message: "📷 Photo",
                last_message_at: currentTime
              }
              : g
          )
          .sort((a, b) => {
            const aTime = a.last_message_at || a.created_at
            const bTime = b.last_message_at || b.created_at
            return new Date(bTime).getTime() - new Date(aTime).getTime()
          })
      )

      // Reset
      setGroupSelectedImage(null)
      if (groupSelectedImageComposerUrl) {
        URL.revokeObjectURL(groupSelectedImageComposerUrl)
      }
      setGroupSelectedImageComposerUrl('')
      setGroupImageCaption('')
      showSuccess('Image sent!')
    } catch (err) {
      console.error('[GroupChat] Exception sending image:', err)
      showToastError('Failed to send image')
    } finally {
      setUploadingGroupImage(false)
    }
  }, [groupSelectedImage, groupImageCaption, activeGroupId, contextUser?.id, groups, showToastError, showSuccess, groupSelectedImageComposerUrl])

  useEffect(() => {
    return () => {
      if (groupSelectedImageComposerUrl) {
        URL.revokeObjectURL(groupSelectedImageComposerUrl)
      }
    }
  }, [groupSelectedImageComposerUrl])

  // Get signed URL for group image
  const getGroupImageSignedUrl = useCallback(async (storagePath) => {
    if (!storagePath) return null

    try {
      const cached = groupSignedUrlCacheRef.current[storagePath]
      if (cached && isSignedUrlValid(cached)) {
        return cached.url
      }

      const { url, expiresAt } = await getSignedImageUrl(storagePath)
      groupSignedUrlCacheRef.current[storagePath] = { url, expiresAt }
      return url
    } catch (err) {
      console.error('[GroupChat] Error getting signed URL:', err)
      return null
    }
  }, [])

  // ==================== END GROUP CHAT FEATURES ====================

  // useEffect to load groups when mode changes
  useEffect(() => {
    if (chatMode === "groups") {
      fetchGroups()
    }
  }, [chatMode, fetchGroups])

  useEffect(() => {
    if (!contextUser?.id) return
    const groupIds = groups.map((group) => group.id).filter(Boolean)
    fetchGroupPreferences(contextUser.id, groupIds)
  }, [contextUser?.id, groups, fetchGroupPreferences])

  useEffect(() => {
    if (!contextUser?.id || groups.length === 0) {
      if (groups.length === 0) {
        setUnreadGroupCountsByGroup({})
      }
      return
    }

    fetchUnreadGroupCounts(
      contextUser.id,
      groups.map((group) => group.id)
    )
  }, [contextUser?.id, groups, fetchUnreadGroupCounts])

  useEffect(() => {
    if (!contextUser?.id || groups.length === 0) return

    if (groupUnreadChannelRef.current) {
      supabase.removeChannel(groupUnreadChannelRef.current)
      groupUnreadChannelRef.current = null
    }

    const groupIds = new Set(groups.map((group) => group.id).filter(Boolean))

    const channel = supabase
      .channel(`group-unread-${contextUser.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "group_messages"
        },
        (payload) => {
          const row = payload.new
          if (!row?.group_id || !groupIds.has(row.group_id)) return
          if (row.sender_id === contextUser.id) return

          if (chatMode === "groups" && activeGroupId === row.group_id) {
            setUnreadGroupCountsByGroup((prev) => ({ ...prev, [row.group_id]: 0 }))
            return
          }

          setUnreadGroupCountsByGroup((prev) => ({
            ...prev,
            [row.group_id]: (prev[row.group_id] || 0) + 1
          }))
        }
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "group_message_reads",
          filter: `user_id=eq.${contextUser.id}`
        },
        () => {
          fetchUnreadGroupCounts(
            contextUser.id,
            Array.from(groupIds)
          )
        }
      )
      .subscribe()

    groupUnreadChannelRef.current = channel

    return () => {
      supabase.removeChannel(channel)
      if (groupUnreadChannelRef.current === channel) {
        groupUnreadChannelRef.current = null
      }
    }
  }, [activeGroupId, chatMode, contextUser?.id])

  // Debounce member search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (memberSearchQuery.trim()) {
        searchUsersToAdd(memberSearchQuery)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [memberSearchQuery, searchUsersToAdd])

  // Search users for new group modal
  useEffect(() => {
    if (!newGroupSearch.trim()) {
      setNewGroupSearchResults([])
      return
    }

    const searchUsers = async () => {
      try {
        const { data, error: searchError } = await supabase
          .from("profiles")
          .select("id, username, name, avatar_url")
          .ilike("username", `%${newGroupSearch}%`)
          .limit(10)

        if (searchError) {
          console.error("[Chat] Error searching users:", searchError)
          return
        }

        // Filter out current user and already selected users
        const filtered = (data || []).filter(
          (profile) =>
            profile.id !== contextUser?.id &&
            !newGroupSelectedUsers.some((u) => u.id === profile.id)
        )

        setNewGroupSearchResults(filtered)
      } catch (err) {
        console.error("[Chat] Exception searching users:", err)
      }
    }

    const debounce = setTimeout(searchUsers, 300)
    return () => clearTimeout(debounce)
  }, [newGroupSearch, contextUser?.id, newGroupSelectedUsers])



  useEffect(() => {
    const handleSidebarOptionsOutside = (event) => {
      const menuNode = event.target?.closest?.("[data-chat-sidebar-menu='true']")
      const triggerNode = event.target?.closest?.("[data-chat-sidebar-menu-trigger='true']")

      if (menuNode || triggerNode) {
        return
      }

      setOpenConversationOptionsId(null)
      setOpenGroupOptionsId(null)
    }

    if (openConversationOptionsId || openGroupOptionsId) {
      document.addEventListener("mousedown", handleSidebarOptionsOutside)
      return () => document.removeEventListener("mousedown", handleSidebarOptionsOutside)
    }
  }, [openConversationOptionsId, openGroupOptionsId])

  const handleArchiveConversation = useCallback(
    async (conversationId) => {
      const updated = await upsertConversationPreference(conversationId, { is_archived: true, is_deleted: false })
      if (!updated) {
        showToastError("Failed to archive conversation")
        return
      }

      if (activeConversationId === conversationId && directSidebarView === CHAT_LIST_VIEW.ACTIVE) {
        navigateToConversation(null, { replace: true })
      }

      setOpenConversationOptionsId(null)
      showSuccess("Conversation archived")
    },
    [activeConversationId, directSidebarView, navigateToConversation, showSuccess, showToastError, upsertConversationPreference]
  )

  const handleRestoreConversation = useCallback(
    async (conversationId) => {
      const updated = await upsertConversationPreference(conversationId, { is_archived: false, is_deleted: false })
      if (!updated) {
        showToastError("Failed to restore conversation")
        return
      }

      setOpenConversationOptionsId(null)
      showSuccess("Conversation restored")
    },
    [showSuccess, showToastError, upsertConversationPreference]
  )

  const handleDeleteConversationForMe = useCallback(
    async (conversationId) => {
      if (!contextUser?.id) return

      try {
        const { error: updateError } = await supabase.rpc("mark_conversation_deleted_for_user", {
          p_conversation_id: conversationId,
          p_user_id: contextUser.id
        })

        if (updateError) {
          console.error("[Chat] Failed to update deleted_by for conversation:", updateError)
          showToastError("Failed to delete conversation")
          return
        }

        // Update local state immediately so it disappears from the filtered source
        setConversations((prev) => {
          const next = prev.filter((c) => c.id !== conversationId)
          devLog("[DeleteSync] Removed conversation from sidebar", { conversationId })
          return next
        })

        // Also update store cache
        const cached = useChatStore.getState().conversations
        setConversationsCache(cached.filter((c) => c.id !== conversationId))

        // Keep the full/all conversations in sync
        setAllConversations((prevAll) => {
          if (!prevAll) return prevAll
          return prevAll.filter((c) => c.id !== conversationId)
        })

        // Clear messages and selection if the deleted conversation was open
        const wasActive = activeConversationId === conversationId
        const wasSelected = selectedConversation?.id === conversationId

        if (wasActive || wasSelected) {
          setSelectedConversation(null)
          setActiveConversationId(null)
          setMessages([])
          // Clear messages cache for that conversation
          try {
            setMessagesCache(conversationId, [])
            setCurrentChatIdCache(null)
          } catch (e) {
            // ignore if cache funcs behave differently
          }
          devLog("[DeleteSync] Cleared selected conversation", { conversationId })

          // Navigate back to empty chat list view
          navigateToConversation(null)
          devLog("[DeleteSync] Navigated back to empty chat state")
        }

        setOpenConversationOptionsId(null)
        showSuccess("Conversation deleted")
      } catch (err) {
        console.error("[Chat] Unexpected error during conversation deletion:", err)
        showToastError("An unexpected error occurred")
      }
    },
    [
      contextUser?.id,
      showSuccess,
      showToastError,
      setConversationsCache,
      activeConversationId,
      selectedConversation,
      setAllConversations,
      setMessagesCache,
      setCurrentChatIdCache,
      navigateToConversation,
    ]
  )

  const handleArchiveGroup = useCallback(
    async (groupId) => {
      const updated = await upsertGroupPreference(groupId, { is_archived: true, is_deleted: false })
      if (!updated) {
        showToastError("Failed to archive group")
        return
      }

      if (activeGroupId === groupId && groupSidebarView === CHAT_LIST_VIEW.ACTIVE) {
        setActiveGroupId(null)
      }

      setOpenGroupOptionsId(null)
      showSuccess("Group archived")
    },
    [activeGroupId, groupSidebarView, showSuccess, showToastError, upsertGroupPreference]
  )

  const handleRestoreGroup = useCallback(
    async (groupId) => {
      const updated = await upsertGroupPreference(groupId, { is_archived: false, is_deleted: false })
      if (!updated) {
        showToastError("Failed to restore group")
        return
      }

      setOpenGroupOptionsId(null)
      showSuccess("Group restored")
    },
    [showSuccess, showToastError, upsertGroupPreference]
  )

  const handleDeleteGroupForMe = useCallback(
    async (groupId) => {
      const updated = await upsertGroupPreference(groupId, { is_deleted: true, is_archived: false })
      if (!updated) {
        showToastError("Failed to delete group")
        return
      }

      if (activeGroupId === groupId) {
        setActiveGroupId(null)
      }

      setOpenGroupOptionsId(null)
      showSuccess("Group removed")
    },
    [activeGroupId, showSuccess, showToastError, upsertGroupPreference]
  )

  const directMessagesById = useMemo(() => new Map(messages.map((message) => [message.id, message])), [messages])
  const groupMessagesById = useMemo(() => new Map(groupMessages.map((message) => [message.id, message])), [groupMessages])
  const matchedMessageIdSet = useMemo(() => new Set(matchedMessageIds), [matchedMessageIds])
  const activeMatchedMessageId = matchedMessageIds[activeMatchIndex] || null
  const groupMemberProfileById = useMemo(() => {
    const byId = new Map()

    groupMembers.forEach((member) => {
      const profile = member?.profile || member?.profiles
      if (!profile) {
        return
      }

      if (member?.user_id) {
        byId.set(member.user_id, profile)
      }

      if (member?.id) {
        byId.set(member.id, profile)
      }
    })

    return byId
  }, [groupMembers])

  const typingUserIds = useMemo(() => Object.keys(groupTypingIndicators), [groupTypingIndicators])
  const typingProfiles = useMemo(
    () => typingUserIds.map((id) => groupMemberProfileById.get(id)).filter(Boolean),
    [groupMemberProfileById, typingUserIds]
  )
  const getFirst = (p) => p?.name?.split(' ')[0] || p?.username || 'Someone'

  let typingLabel = ''
  if (typingProfiles.length === 1)
    typingLabel = `${getFirst(typingProfiles[0])} is typing...`
  else if (typingProfiles.length === 2)
    typingLabel = `${getFirst(typingProfiles[0])} and ${getFirst(typingProfiles[1])} are typing...`
  else if (typingProfiles.length >= 3)
    typingLabel = 'Several people are typing...'

  const renderedDirectMessages = useMemo(() => {
    return messages.map((message) => {
      const mine = message.sender_id === contextUser?.id
      const messageTickState = getPrivateMessageTickState(message)

      const senderProfile = profilesById[message.sender_id]
      const imageUrl = loadedImageUrls[message.id] || null
      const isImageMessage = Boolean(imageUrl) || getMessageType(message) === "image"
      const isPostMessage = getMessageType(message) === "post"
      const isDeletedMessage = message.is_deleted === true
      const isForwardedMessage = message.is_forwarded === true
      const reactionSummary = reactionsByMessageId.direct[message.id] || []
      const isReactionPickerOpen = activeReactionPickerMessageId === message.id
      const isMessageMenuOpen = activeMenuId === message.id
      const canReplyMessage = !isDeletedMessage && !isPostMessage
      const canReactMessage = !isDeletedMessage
      const canForwardMessage = !isDeletedMessage && !isPostMessage
      const canCopyMessage = !isDeletedMessage && !isPostMessage && Boolean(message.decrypted_text || message.content || imageUrl)
      const canEditMessage = mine && !isDeletedMessage && !isImageMessage && !isPostMessage
      const canUnsendMessage = mine && !isDeletedMessage
      const canDeleteMessage = mine && !isDeletedMessage
      const canShowActionTrigger = canReplyMessage || canReactMessage || canForwardMessage || canCopyMessage || canEditMessage || canUnsendMessage || canDeleteMessage
      const isMatchedMessage = matchedMessageIdSet.has(message.id)
      const isActiveMatchedMessage = activeMatchedMessageId === message.id
      const repliedMessage = message.reply_to_id ? directMessagesById.get(message.reply_to_id) : null

      return (
        <div key={message.id} className={`group flex ${mine ? "justify-end" : "justify-start"}`}>
          {!mine && (
            senderProfile?.avatar_url ? (
              <img
                src={senderProfile.avatar_url}
                alt={getDisplayName(senderProfile)}
                className="mr-2 h-8 w-8 shrink-0 self-end rounded-full object-cover"
              />
            ) : (
              <div className="mr-2 flex h-8 w-8 shrink-0 self-end items-center justify-center rounded-full bg-[var(--chat-accent-soft)] font-['Sora'] text-xs font-semibold text-[var(--chat-accent)]">
                {getDisplayName(senderProfile).charAt(0).toUpperCase()}
              </div>
            )
          )}
          <div className={`max-w-[84%] sm:max-w-[75%] md:max-w-[58%] ${mine ? "items-end" : "items-start"} flex flex-col`}>
            {isForwardedMessage && (
              <p className="mb-1 font-['DM_Sans'] text-[10px] font-medium uppercase tracking-wide text-[var(--chat-text-muted)]">
                Forwarded
              </p>
            )}

            {message.reply_to_id && (
              <div className="mb-0.5 flex max-w-full items-stretch overflow-hidden rounded-lg bg-[var(--chat-elev)]/50 shadow-sm transition hover:bg-[var(--chat-elev)]/80">
                <div className="w-[3px] shrink-0 rounded-full bg-[var(--chat-accent)]" />
                {!repliedMessage ? (
                  <div className="px-2 py-1.5 text-[11px] italic text-[var(--chat-text-muted)]">Original message unavailable</div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      const element = document.getElementById(`message-${repliedMessage.id}`)
                      element?.scrollIntoView({ behavior: "smooth", block: "center" })
                    }}
                    className="flex w-full min-w-0 items-center gap-2 px-2 py-1.5 text-left"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-['Sora'] text-[10.5px] font-medium text-[var(--chat-accent)]">
                        {getDisplayName(profilesById[repliedMessage.sender_id])}
                      </p>
                      <p className="line-clamp-1 font-['DM_Sans'] text-[11px] text-[var(--chat-text-subtle)] opacity-75">
                        {repliedMessage.type === "post" ? (
                          repliedMessage.post_content ? (
                            repliedMessage.post_content.split('\n')[0]
                          ) : (
                            repliedMessage.post_has_image || repliedMessage.post_image_url ? "📷 Image post" : "Shared Post"
                          )
                        ) : (
                          repliedMessage.decrypted_text || repliedMessage.content || (getMessageType(repliedMessage) === "image" ? "📷 Photo" : "Message")
                        )}
                      </p>
                    </div>
                    {loadedImageUrls[repliedMessage.id] && (
                      <div className="h-8 w-8 shrink-0 overflow-hidden rounded-[4px] border border-[var(--chat-border)]/30">
                        <img src={loadedImageUrls[repliedMessage.id]} alt="Reply preview" className="h-full w-full object-cover opacity-60" />
                      </div>
                    )}
                  </button>
                )}
              </div>
            )}
            <div
              id={`message-${message.id}`}
              data-direct-message-interactive="true"
              className={`relative w-fit cursor-pointer ${isMatchedMessage
                ? isActiveMatchedMessage
                  ? "ring-2 ring-[var(--chat-accent)]/70 ring-offset-2 ring-offset-[var(--chat-bg)]"
                  : "ring-1 ring-[var(--chat-accent)]/50 ring-offset-1 ring-offset-[var(--chat-bg)]"
                : ""
                }`}
              onClick={(event) => {
                if (isMobileView) {
                  handleOpenMessageMenu(event, message.id)
                  return
                }

                setActiveReactionPickerMessageId((prev) => (prev === message.id ? null : message.id))
                setActiveMenuId(null)
              }}
              onTouchStart={(event) => {
                startDirectMessageLongPress(event, message.id, mine)
                handleDirectMessageSwipeStart(event, message)
              }}
              onTouchMove={(event) => {
                handleDirectMessageSwipeMove(event, message)
              }}
              onTouchEnd={() => {
                cancelDirectMessageLongPress()
                handleDirectMessageSwipeEnd()
              }}
              onTouchCancel={() => {
                cancelDirectMessageLongPress()
                handleDirectMessageSwipeEnd()
              }}
              style={{ willChange: "transform" }}
              onContextMenu={(event) => {
                event.preventDefault()
                if (isMobileView) {
                  handleOpenMessageMenu(event, message.id)
                }
              }}
            >
              <div
                className={`pointer-events-none absolute top-1/2 -translate-y-1/2 hidden md:flex items-center gap-1 ${mine ? "right-full mr-2" : "left-full ml-2"} ${isReactionPickerOpen || isMessageMenuOpen ? "opacity-100" : "opacity-0 md:group-hover:opacity-100"} transition-opacity duration-150`}
              >
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    setActiveReactionPickerMessageId((prev) => (prev === message.id ? null : message.id))
                    setActiveMenuId(null)
                  }}
                  disabled={isDeletedMessage}
                  className="pointer-events-auto inline-flex h-7 w-7 items-center justify-center rounded-full border border-[var(--chat-border)] bg-[var(--chat-surface)] text-[var(--chat-text-subtle)] shadow-sm transition hover:bg-[var(--chat-elev)]"
                  title="React"
                  aria-label="React to message"
                >
                  <SmilePlus className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleReply(message)
                  }}
                  disabled={isDeletedMessage}
                  className="pointer-events-auto inline-flex h-7 w-7 items-center justify-center rounded-full border border-[var(--chat-border)] bg-[var(--chat-surface)] text-[var(--chat-text-subtle)] shadow-sm transition hover:bg-[var(--chat-elev)]"
                  title="Reply"
                  aria-label="Reply to message"
                >
                  <Reply className="h-3.5 w-3.5" />
                </button>
                {canShowActionTrigger && (
                  <button
                    type="button"
                    onClick={(e) => handleOpenMessageMenu(e, message.id, message.sender_id === contextUser?.id)}
                    className="pointer-events-auto flex h-7 w-7 items-center justify-center rounded-md text-[var(--chat-text-muted)] transition-all duration-150 hover:bg-[rgba(255,255,255,0.06)] hover:text-[var(--chat-text)]"
                    title="More options"
                    aria-label="Open message options"
                  >
                    <MoreVertical className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {isMessageMenuOpen && canShowActionTrigger && (
                <DropdownMenu
                  x={menuPosition.x}
                  y={menuPosition.y}
                  anchorHeight={menuPosition.anchorHeight}
                  onClose={() => setActiveMenuId(null)}
                >
                  <div className="px-2.5 py-2 border-b border-[var(--chat-border)]/40 mb-1 bg-[var(--chat-elev)]/30">
                    <p className="text-[9px] text-[var(--chat-text-muted)] font-bold uppercase tracking-widest opacity-80">
                      {dayjs(message.created_at).format('MMM DD, YYYY · hh:mm A')}
                    </p>
                  </div>

                  <div className="space-y-0.5">

                    <button
                      type="button"
                      onClick={() => {
                        handleCopyMessage(message)
                        setActiveMenuId(null)
                      }}
                      disabled={!canCopyMessage}
                      className="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left font-['DM_Sans'] text-[12px] font-medium transition hover:bg-[var(--chat-elev)] disabled:cursor-not-allowed disabled:opacity-50 group"
                    >
                      <span>{isImageMessage && !message.content ? "Copy Link" : "Copy"}</span>
                      <Copy className="h-3.5 w-3.5 text-[var(--chat-text-muted)] group-hover:text-[var(--chat-text)] transition-colors" />
                    </button>

                    {canEditMessage && (
                      <button
                        type="button"
                        onClick={() => {
                          handleStartEditingMessage(message)
                          setActiveMenuId(null)
                        }}
                        className="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left font-['DM_Sans'] text-[12px] font-medium transition hover:bg-[var(--chat-elev)] group"
                      >
                        <span>Edit</span>
                        <svg className="h-3.5 w-3.5 text-[var(--chat-text-muted)] group-hover:text-[var(--chat-text)] transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                      </button>
                    )}

                    {canForwardMessage && (
                      <button
                        type="button"
                        onClick={() => {
                          openForwardModal(message)
                          setActiveMenuId(null)
                        }}
                        className="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left font-['DM_Sans'] text-[12px] font-medium transition hover:bg-[var(--chat-elev)] group"
                      >
                        <span>Forward</span>
                        <Forward className="h-3.5 w-3.5 text-[var(--chat-text-muted)] group-hover:text-[var(--chat-text)] transition-colors" />
                      </button>
                    )}


                    <div className="h-px bg-[var(--chat-border)]/40 my-1 mx-2" />

                    {canUnsendMessage && (
                      <button
                        type="button"
                        onClick={() => {
                          handleUnsendMessage(message)
                          setActiveMenuId(null)
                        }}
                        className="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left font-['DM_Sans'] text-[12px] font-semibold text-red-500 hover:bg-red-500/10 transition-colors group"
                      >
                        <span>Unsend</span>
                        <Trash2 className="h-3.5 w-3.5 text-red-400 group-hover:text-red-500 transition-colors" />
                      </button>
                    )}

                    {canDeleteMessage && (
                      <button
                        type="button"
                        onClick={() => {
                          handleDeleteMessage(message)
                          setActiveMenuId(null)
                        }}
                        className="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left font-['DM_Sans'] text-[12px] font-semibold text-red-500 hover:bg-red-500/10 transition-colors group"
                      >
                        <span>Delete</span>
                        <Trash2 className="h-3.5 w-3.5 text-red-400 group-hover:text-red-500 transition-colors" />
                      </button>
                    )}
                  </div>
                </DropdownMenu>
              )}

              {isReactionPickerOpen && (
                <div data-direct-message-interactive="true" className={`absolute z-20 ${mine ? "right-0" : "left-0"} -top-12 flex items-center gap-1 rounded-full border border-[var(--chat-border-strong)] bg-[var(--chat-elev)] px-2 py-1 shadow-md`}>
                  {REACTION_EMOJIS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onMouseDown={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        console.error("[ReactionEmojiClicked]", {
                          emoji,
                          messageId: message.id
                        });
                        handleReactionSelect(message.id, emoji, "direct");
                      }}
                      className="rounded-full p-1 text-sm transition hover:bg-[var(--chat-hover)] relative z-[100] cursor-pointer"
                      style={{ pointerEvents: 'auto' }}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}

              {isDeletedMessage ? (
                <div className="w-fit rounded-2xl bg-[var(--chat-elev)] px-2.5 py-1.5 font-['DM_Sans'] text-[13px] italic text-[var(--chat-text-subtle)]">
                  This message was unsent
                </div>
              ) : isPostMessage ? (
                <PostPreview post_id={message.post_id} isMine={mine} />
              ) : isImageMessage ? (
                <div className="relative w-fit max-w-sm md:max-w-xs overflow-hidden rounded-2xl border border-[var(--chat-border)] bg-[var(--chat-surface)]">
                  <div className="absolute right-2 top-2 z-10 flex items-center gap-1">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation()
                        setImagePreviewUrl(imageUrl)
                      }}
                      className="rounded-full bg-black/45 px-2 py-1 text-[10px] text-white"
                    >
                      View
                    </button>
                    <button
                      type="button"
                      onClick={(e) => handleOpenMessageMenu(e, message.id)}
                      className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-black/55 text-xs text-white transition hover:bg-black/70"
                      title="More actions"
                    >
                      ⋯
                    </button>
                  </div>
                  <img
                    src={imageUrl}
                    alt="Shared media"
                    className="max-h-72 w-full max-w-[260px] object-cover"
                    loading="lazy"
                  />
                  {message.decrypted_text || message.content ? (
                    <p className="border-t border-[var(--chat-border)] px-2.5 py-2 font-['DM_Sans'] text-[13px] text-[var(--chat-text)]">
                      {renderHighlightedMessageText(message.decrypted_text || message.content, message.id)}
                    </p>
                  ) : null}
                </div>
              ) : (
                <div
                  className={`w-fit max-w-sm md:max-w-xs px-[13px] py-[9px] font-['DM_Sans'] text-[13px] leading-[1.55] shadow-[0_1px_2px_rgba(0,0,0,0.05)] ${mine
                    ? "rounded-[16px_16px_4px_16px] bg-[var(--chat-accent)] text-[var(--chat-on-accent)]"
                    : "rounded-[16px_16px_16px_4px] bg-[var(--chat-elev)] dark:bg-[var(--chat-hover)] text-[var(--chat-text)] border border-[rgba(0,0,0,0.05)] dark:border-[rgba(255,255,255,0.05)]"
                    }`}
                >
                  <p className="whitespace-pre-wrap break-words">
                    {renderHighlightedMessageText(message.decrypted_text || message.content, message.id)}
                  </p>
                </div>
              )}
            </div>

            {!isDeletedMessage && reactionSummary.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {reactionSummary.map((item) => (
                  <ReactionPill
                    key={`${message.id}-${item.emoji}`}
                    item={item}
                    messageId={message.id}
                    onOpenModal={setReactionModalMessageId}
                  />
                ))}
              </div>
            )}

            <p className="mt-1 flex items-center gap-1 font-['DM_Sans'] text-[10px] text-[var(--chat-text-muted)]">
              <span>
                {formatTime(message.created_at)}
                {message.edited_at && " (edited)"}
              </span>
              {mine && !isDeletedMessage && messageTickState && (
                <span
                  className={`inline-flex items-center text-[12px] font-semibold tracking-[-0.08em] ${messageTickState === "read" ? "text-[var(--chat-tick-read)]" : "text-[var(--chat-tick)]"
                    }`}
                  title={
                    messageTickState === "read"
                      ? "Read"
                      : messageTickState === "delivered"
                        ? "Delivered"
                        : "Sent"
                  }
                  aria-label={
                    messageTickState === "read"
                      ? "Read"
                      : messageTickState === "delivered"
                        ? "Delivered"
                        : "Sent"
                  }
                >
                  {messageTickState === "sent" ? "\u2713" : "\u2713\u2713"}
                </span>
              )}
            </p>
          </div>
        </div>
      )
    })
  }, [
    messages,
    contextUser?.id,
    profilesById,
    loadedImageUrls,
    activeReactionPickerMessageId,
    activeMenuId,
    matchedMessageIdSet,
    activeMatchedMessageId,
    directMessagesById,
    isMobileView,
    getPrivateMessageTickState,
    reactionsByMessageId,
    renderHighlightedMessageText,
    handleReactionSelect,
    handleReply,
    handleCopyMessage,
    handleStartEditingMessage,
    openForwardModal,
    handleUnsendMessage,
    handleDeleteMessage,
    setReactionModalMessageId,
    formatTime,
    getDisplayName,
    getMessageType,
    setImagePreviewUrl
  ])



  return (
    <div
      className="chat-theme mx-auto flex min-w-0 w-full max-w-[1280px] flex-col overflow-hidden px-1.5 pt-2 pb-1 sm:px-2 md:px-3 text-[var(--chat-text)]"
      style={isMobileView ? { height: "var(--chat-visual-height, 100svh)" } : { height: "100%", maxHeight: "100%" }}
    >
      {error && (
        <div className="mb-2 shrink-0 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className={`grid h-full min-h-0 min-w-0 flex-1 w-full grid-cols-1 gap-2 overflow-hidden overscroll-none rounded-2xl bg-[var(--chat-bg)] p-1.5 shadow-[0_4px_20px_rgba(0,0,0,0.35)] ${isMobileDetailView ? "" : "lg:grid-cols-[268px,minmax(0,1fr)]"}`}>
        {!isMobileDetailView && <section className="flex h-full min-h-0 w-full lg:w-[268px] flex-col overflow-hidden rounded-2xl border border-[var(--chat-border)] bg-[var(--chat-surface)] shadow-[0_8px_24px_rgba(0,0,0,0.45)]">
          {/* Mode Toggle */}
          <div className="border-b border-[var(--chat-border)] px-3.5 pt-4 pb-3">
            <div className="mb-3 font-['Sora'] text-[21px] font-bold tracking-[-0.3px] text-[var(--chat-text)]">Chat</div>
            <div className="flex gap-1 rounded-[10px] bg-[var(--chat-elev)] p-[3px]">
              <button
                onClick={() => {
                  setChatMode("direct")
                  navigate("/chat?tab=direct", { replace: true })
                }}
                className={`relative flex-1 rounded-[7px] py-[7px] text-center font-['DM_Sans'] text-[12px] font-semibold transition-colors ${chatMode === "direct"
                  ? "bg-[var(--chat-accent)] text-[var(--chat-surface)]"
                  : "text-[var(--chat-text-muted)] hover:bg-[var(--chat-hover)]"
                  }`}
              >
                Direct
                {unreadDirectCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[var(--chat-accent)] px-1 text-[10px] font-bold leading-none text-[var(--chat-surface)]">
                    {unreadDirectCount > 9 ? "9+" : unreadDirectCount}
                  </span>
                )}
              </button>
              <button
                onClick={() => {
                  setChatMode("groups")
                  navigate("/chat?tab=groups", { replace: true })
                }}
                className={`relative flex-1 rounded-[7px] py-[7px] text-center font-['DM_Sans'] text-[12px] font-semibold transition-colors ${chatMode === "groups"
                  ? "bg-[var(--chat-accent)] text-[var(--chat-surface)]"
                  : "text-[var(--chat-text-muted)] hover:bg-[var(--chat-hover)]"
                  }`}
              >
                Groups
                {unreadGroupCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[var(--chat-accent)] px-1 text-[10px] font-bold leading-none text-[var(--chat-surface)]">
                    {unreadGroupCount > 9 ? "9+" : unreadGroupCount}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Direct Chat Sidebar */}
          {chatMode === "direct" && (
            <>
              <div className="border-b border-[var(--chat-border)] px-3 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="font-['DM_Sans'] text-[10px] font-semibold uppercase tracking-[0.09em] text-[var(--chat-text-muted)]">
                    {directSidebarView === CHAT_LIST_VIEW.ACTIVE ? "Conversations" : "Archived Chats"}
                  </h2>
                  <div className="flex items-center gap-1 rounded-[10px] bg-[var(--chat-elev)] p-[3px]">
                    <button
                      type="button"
                      onClick={() => setDirectSidebarView(CHAT_LIST_VIEW.ACTIVE)}
                      className={`rounded-[7px] px-2 py-1 font-['DM_Sans'] text-[11px] font-semibold transition ${directSidebarView === CHAT_LIST_VIEW.ACTIVE
                        ? "bg-[var(--chat-accent)] text-[var(--chat-surface)]"
                        : "text-[var(--chat-text-muted)] hover:text-[var(--chat-text-subtle)]"
                        }`}
                    >
                      Chats
                    </button>
                    <button
                      type="button"
                      onClick={() => setDirectSidebarView(CHAT_LIST_VIEW.ARCHIVED)}
                      className={`rounded-[7px] px-2 py-1 font-['DM_Sans'] text-[11px] font-semibold transition ${directSidebarView === CHAT_LIST_VIEW.ARCHIVED
                        ? "bg-[var(--chat-accent)] text-[var(--chat-surface)]"
                        : "text-[var(--chat-text-muted)] hover:text-[var(--chat-text-subtle)]"
                        }`}
                    >
                      Archived ({archivedConversationCount})
                    </button>
                  </div>
                </div>

                {directSidebarView === CHAT_LIST_VIEW.ACTIVE && (
                  <div className="relative mt-2">
                    <input
                      ref={userSearchInputRef}
                      value={userSearchQuery}
                      onChange={(event) => setUserSearchQuery(event.target.value)}
                      placeholder="Search users by username"
                      className="h-9 w-full rounded-[10px] border border-[var(--chat-border)] bg-[var(--chat-elev)] px-3 font-['DM_Sans'] text-[12px] text-[var(--chat-text)] placeholder:text-[var(--chat-text-muted)] outline-none transition focus:border-[var(--chat-accent)] focus:shadow-[0_0_0_2px_rgba(244,180,0,0.12)]"
                    />

                    {userSearchQuery.trim() && (
                      <div className="absolute left-0 right-0 top-full z-30 mt-2 max-h-72 overflow-y-auto rounded-[12px] border border-[var(--chat-border)] bg-[var(--chat-surface)] shadow-lg">
                        {userSearchLoading ? (
                          <p className="px-3 py-3 font-['DM_Sans'] text-sm text-[var(--chat-text-subtle)]">Searching...</p>
                        ) : userSearchResults.length === 0 ? (
                          <p className="px-3 py-3 font-['DM_Sans'] text-sm text-[var(--chat-text-subtle)]">No users found.</p>
                        ) : (
                          userSearchResults.map((profile) => (
                            (() => {
                              const displayName = getDisplayName(profile)
                              const shouldShowUsername = Boolean(profile.username && profile.name)

                              return (
                                <button
                                  key={profile.id}
                                  onClick={() => handleStartConversationWithUser(profile)}
                                  disabled={startingConversationUserId === profile.id}
                                  className="flex w-full items-center gap-3 border-b border-[var(--chat-border)] px-3 py-2 text-left hover:bg-[var(--chat-elev)] disabled:cursor-not-allowed disabled:opacity-70"
                                >
                                  {profile.avatar_url ? (
                                    <img
                                      src={profile.avatar_url}
                                      alt={displayName}
                                      className="h-8 w-8 rounded-full object-cover"
                                    />
                                  ) : (
                                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--chat-accent-soft)] font-['Sora'] text-xs font-semibold text-[var(--chat-accent)]">
                                      {displayName.charAt(0).toUpperCase()}
                                    </div>
                                  )}

                                  <div className="min-w-0 flex-1">
                                    <p className="truncate font-['Sora'] text-sm font-medium text-[var(--chat-text)]">
                                      {displayName}
                                      {shouldShowUsername ? ` (@${profile.username})` : ""}
                                    </p>
                                  </div>

                                  {startingConversationUserId === profile.id && (
                                    <span className="font-['DM_Sans'] text-xs text-[var(--chat-text-subtle)]">Opening...</span>
                                  )}
                                </button>
                              )
                            })()
                          ))
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                {loadingConversations ? (
                  <div className="p-4">
                    <ChatListSkeleton />
                  </div>
                ) : visibleConversations.length === 0 ? (
                  <p className="px-4 py-8 text-center font-['DM_Sans'] text-sm text-[var(--chat-text-subtle)]">
                    {directSidebarView === CHAT_LIST_VIEW.ARCHIVED
                      ? "No archived conversations."
                      : "No conversations yet."}
                  </p>
                ) : (
                  visibleConversations.map((conversation) => {
                    const isActive = conversation.id === activeConversationId
                    const displayName = getDisplayName(conversation.partner)
                    const partnerAvatar = conversation.partner?.avatar_url

                    // Simple display - just show the message content like Instagram
                    const latestContent = conversation.last_message_content?.trim() || "No messages yet"
                    const latestTimestamp = conversation.last_message_at || conversation.created_at
                    const unreadCount = unreadCountsByConversation[conversation.id] || 0
                    const hasUnread = unreadCount > 0
                    const showTypingPreview = Boolean(typingByConversation[conversation.id])

                    return (
                      <div
                        key={conversation.id}
                        className="group relative border-b border-[var(--chat-border)]"
                      >
                        <button
                          onClick={() => navigateToConversation(conversation.id)}
                          className={`w-full rounded-[12px] px-[10px] py-[9px] pr-10 text-left transition-all duration-150 ${isActive
                            ? "border-l-[3px] border-[var(--chat-accent)] bg-[var(--chat-hover)] pl-[7px]"
                            : hasUnread
                              ? "hover:bg-[var(--chat-elev)]"
                              : "hover:bg-[var(--chat-elev)]"
                            }`}
                        >
                          <div className="flex items-center gap-2.5">
                            {partnerAvatar ? (
                              <img
                                src={partnerAvatar}
                                alt={displayName}
                                className="h-9 w-9 rounded-full object-cover"
                              />
                            ) : (
                              <div className="flex h-[43px] w-[43px] items-center justify-center rounded-full bg-[var(--chat-accent-soft)] font-['Sora'] text-[14px] font-bold text-[var(--chat-accent)]">
                                {displayName.charAt(0).toUpperCase()}
                              </div>
                            )}

                            <div className="flex min-w-0 flex-1 items-start justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <p className="truncate font-['Sora'] text-[13px] font-semibold text-[var(--chat-text)]">{displayName}</p>
                                {showTypingPreview ? (
                                  <p className="mt-1 truncate font-['DM_Sans'] text-[11px] italic text-[var(--chat-accent)]">typing...</p>
                                ) : latestContent ? (
                                  <p className={`mt-[2px] truncate font-['DM_Sans'] text-[11px] ${hasUnread ? "font-medium text-[var(--chat-text-subtle)]" : "text-[var(--chat-text-muted)]"}`}>
                                    {latestContent}
                                  </p>
                                ) : null}
                              </div>

                              <div className="flex shrink-0 flex-col items-end gap-1">
                                <p className="font-['DM_Sans'] text-[10px] text-[var(--chat-text-muted)]">{formatConversationListTime(latestTimestamp)}</p>
                                {hasUnread && (
                                  <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[var(--chat-accent)] px-[5px] text-[10px] font-bold leading-none text-[var(--chat-surface)]">
                                    {unreadCount > 99 ? "99+" : unreadCount}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </button>
                        <button
                          type="button"
                          data-chat-sidebar-menu-trigger="true"
                          onClick={(event) => {
                            event.stopPropagation()
                            setOpenGroupOptionsId(null)
                            setOpenConversationOptionsId((prev) => (prev === conversation.id ? null : conversation.id))
                          }}
                          className={`absolute right-2 top-2.5 z-10 flex h-7 w-7 items-center justify-center rounded-md text-[var(--chat-text-muted)] transition-all duration-150 hover:bg-[rgba(255,255,255,0.06)] hover:text-[var(--chat-text)] ${openConversationOptionsId === conversation.id ? "opacity-100" : "opacity-100 lg:opacity-0 lg:group-hover:opacity-100"
                            }`}
                          aria-label="Conversation options"
                        >
                          <MoreVertical className="h-3.5 w-3.5" />
                        </button>

                        {openConversationOptionsId === conversation.id && (
                          <div
                            data-chat-sidebar-menu="true"
                            className="absolute right-2 top-11 z-20 min-w-[130px] rounded-lg border border-[var(--chat-border)] bg-[var(--chat-surface)] p-1.5 shadow-lg"
                          >
                            {directSidebarView === CHAT_LIST_VIEW.ARCHIVED ? (
                              <button
                                type="button"
                                onClick={() => handleRestoreConversation(conversation.id)}
                                className="flex w-full items-center rounded-md px-2 py-1.5 text-left font-['DM_Sans'] text-xs font-medium text-[var(--chat-text)] transition hover:bg-[var(--chat-elev)]"
                              >
                                Restore
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleArchiveConversation(conversation.id)}
                                className="flex w-full items-center rounded-md px-2 py-1.5 text-left font-['DM_Sans'] text-xs font-medium text-[var(--chat-text)] transition hover:bg-[var(--chat-elev)]"
                              >
                                Archive
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleDeleteConversationForMe(conversation.id)}
                              className="mt-1 flex w-full items-center rounded-md px-2 py-1.5 text-left font-['DM_Sans'] text-xs font-medium text-[#EF4444] transition hover:bg-[rgba(239,68,68,0.12)]"
                            >
                              Delete
                            </button>
                          </div>
                        )}
                      </div>
                    )
                  })
                )}
              </div>
            </>
          )}

          {/* Groups Chat Sidebar */}
          {chatMode === "groups" && (
            <>
              <div className="border-b border-[var(--chat-border)] px-3 py-2.5">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <h2 className="font-['DM_Sans'] text-[10px] font-semibold uppercase tracking-[0.09em] text-[var(--chat-text-muted)]">
                    {groupSidebarView === CHAT_LIST_VIEW.ACTIVE ? "Groups" : "Archived Chats"}
                  </h2>
                  <button
                    onClick={() => setShowNewGroupModal(true)}
                    disabled={groupSidebarView === CHAT_LIST_VIEW.ARCHIVED}
                    className="inline-flex items-center justify-center rounded-full bg-[var(--chat-accent)] p-1 text-[var(--chat-surface)] shadow-[0_4px_18px_rgba(244,180,0,0.3)] transition-colors hover:bg-[var(--chat-accent-hover)]"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M12 5v14m7-7H5"
                      />
                    </svg>
                  </button>
                </div>
                <div className="mb-2 flex items-center gap-1 rounded-[10px] bg-[var(--chat-elev)] p-[3px]">
                  <button
                    type="button"
                    onClick={() => setGroupSidebarView(CHAT_LIST_VIEW.ACTIVE)}
                    className={`flex-1 rounded-[7px] px-2 py-1 font-['DM_Sans'] text-[11px] font-semibold transition ${groupSidebarView === CHAT_LIST_VIEW.ACTIVE
                      ? "bg-[var(--chat-accent)] text-[var(--chat-surface)]"
                      : "text-[var(--chat-text-muted)] hover:text-[var(--chat-text-subtle)]"
                      }`}
                  >
                    Groups
                  </button>
                  <button
                    type="button"
                    onClick={() => setGroupSidebarView(CHAT_LIST_VIEW.ARCHIVED)}
                    className={`flex-1 rounded-[7px] px-2 py-1 font-['DM_Sans'] text-[11px] font-semibold transition ${groupSidebarView === CHAT_LIST_VIEW.ARCHIVED
                      ? "bg-[var(--chat-accent)] text-[var(--chat-surface)]"
                      : "text-[var(--chat-text-muted)] hover:text-[var(--chat-text-subtle)]"
                      }`}
                  >
                    Archived ({archivedGroupCount})
                  </button>
                </div>
                <input
                  value={groupListSearchQuery}
                  onChange={(e) => setGroupListSearchQuery(e.target.value)}
                  placeholder={groupSidebarView === CHAT_LIST_VIEW.ARCHIVED ? "Search archived groups..." : "Search groups..."}
                  className="h-9 w-full rounded-[10px] border border-[var(--chat-border)] bg-[var(--chat-elev)] px-3 font-['DM_Sans'] text-[12px] text-[var(--chat-text)] placeholder:text-[var(--chat-text-muted)] outline-none transition focus:border-[var(--chat-accent)] focus:shadow-[0_0_0_2px_rgba(244,180,0,0.12)]"
                />
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                {loadingGroups ? (
                  <div className="space-y-3 p-4">
                    {Array.from({ length: 5 }).map((_, index) => (
                      <div key={index} className="h-16 animate-pulse rounded-lg bg-[var(--chat-elev)]" />
                    ))}
                  </div>
                ) : visibleGroups.length === 0 ? (
                  <p className="px-4 py-8 text-center font-['DM_Sans'] text-sm text-[var(--chat-text-subtle)]">
                    {groupSidebarView === CHAT_LIST_VIEW.ARCHIVED
                      ? "No archived groups."
                      : "No groups yet. Create one to get started!"}
                  </p>
                ) : (
                  visibleGroups
                    .filter((group) =>
                      group.name.toLowerCase().includes(groupListSearchQuery.toLowerCase())
                    )
                    .map((group) => {
                      const isActive = group.id === activeGroupId
                      const lastMessagePreview = group.last_message?.substring(0, 40) || "No messages yet"
                      const lastMessageTime = group.last_message_at
                        ? dayjs(group.last_message_at).fromNow()
                        : ""

                      return (
                        <div key={group.id} className="group relative border-b border-[var(--chat-border)]">
                          <button
                            onClick={() => handleOpenGroupFromList(group)}
                            className={`w-full rounded-[12px] px-[10px] py-[9px] pr-10 text-left transition-all duration-150 ${isActive ? "border-l-[3px] border-[var(--chat-accent)] bg-[var(--chat-hover)] pl-[7px]" : "hover:bg-[var(--chat-elev)]"
                              }`}
                          >
                            <div className="flex items-center gap-2.5">
                              <div className="flex h-[43px] w-[43px] flex-shrink-0 items-center justify-center rounded-full bg-[var(--chat-accent-soft)] font-['Sora'] text-[14px] font-bold text-[var(--chat-accent)]">
                                {group.name.charAt(0).toUpperCase()}
                              </div>

                              <div className="min-w-0 flex-1">
                                <p className="truncate font-['Sora'] text-[13px] font-semibold text-[var(--chat-text)]">{group.name}</p>
                                <p className="mt-[2px] truncate font-['DM_Sans'] text-[11px] text-[var(--chat-text-muted)]">
                                  {lastMessagePreview}
                                </p>
                              </div>

                              <div className="flex shrink-0 flex-col items-end gap-1">
                                <p className="font-['DM_Sans'] text-[10px] text-[var(--chat-text-muted)]">{lastMessageTime}</p>
                              </div>
                            </div>
                          </button>
                          <button
                            type="button"
                            data-chat-sidebar-menu-trigger="true"
                            onClick={(event) => {
                              event.stopPropagation()
                              setOpenConversationOptionsId(null)
                              setOpenGroupOptionsId((prev) => (prev === group.id ? null : group.id))
                            }}
                            className={`absolute right-2 top-2.5 z-10 flex h-7 w-7 items-center justify-center rounded-md text-[var(--chat-text-muted)] transition-all duration-150 hover:bg-[rgba(255,255,255,0.06)] hover:text-[var(--chat-text)] ${openGroupOptionsId === group.id ? "opacity-100" : "opacity-100 lg:opacity-0 lg:group-hover:opacity-100"
                              }`}
                            aria-label="Group options"
                          >
                            <MoreVertical className="h-3.5 w-3.5" />
                          </button>

                          {openGroupOptionsId === group.id && (
                            <div
                              data-chat-sidebar-menu="true"
                              className="absolute right-2 top-11 z-20 min-w-[130px] rounded-lg border border-[var(--chat-border)] bg-[var(--chat-surface)] p-1.5 shadow-lg"
                            >
                              {groupSidebarView === CHAT_LIST_VIEW.ARCHIVED ? (
                                <button
                                  type="button"
                                  onClick={() => handleRestoreGroup(group.id)}
                                  className="flex w-full items-center rounded-md px-2 py-1.5 text-left font-['DM_Sans'] text-xs font-medium text-[var(--chat-text)] transition hover:bg-[var(--chat-elev)]"
                                >
                                  Restore
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleArchiveGroup(group.id)}
                                  className="flex w-full items-center rounded-md px-2 py-1.5 text-left font-['DM_Sans'] text-xs font-medium text-[var(--chat-text)] transition hover:bg-[var(--chat-elev)]"
                                >
                                  Archive
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => handleDeleteGroupForMe(group.id)}
                                className="mt-1 flex w-full items-center rounded-md px-2 py-1.5 text-left font-['DM_Sans'] text-xs font-medium text-[#EF4444] transition hover:bg-[rgba(239,68,68,0.12)]"
                              >
                                Delete
                              </button>
                            </div>
                          )}
                        </div>
                      )
                    })
                )}
              </div>
            </>
          )}
        </section>}

        {/* Direct Chat Window */}
        {chatMode === "direct" && (!isMobileView || isMobileConversationView) && (
          <section className="flex h-full min-h-0 min-w-0 w-full flex-col overflow-hidden rounded-2xl border border-[var(--chat-border)] bg-[var(--chat-bg)] shadow-[0_8px_28px_rgba(0,0,0,0.45)]">
            <div className="flex h-full min-h-0 overflow-hidden">
              <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
                <div className="shrink-0 border-b border-[var(--chat-border)] bg-[var(--chat-bg)] px-3 py-2.5 sm:px-4 sm:py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-1.5">
                      {isMobileConversationView && (
                        <button
                          type="button"
                          onClick={() => navigateToConversation(null)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[var(--chat-border)] bg-[var(--chat-surface)] text-[var(--chat-text-subtle)] transition hover:bg-[var(--chat-elev)]"
                          aria-label="Back to chat list"
                        >
                          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M15 18l-6-6 6-6" />
                          </svg>
                        </button>
                      )}
                      {activeConversation && activeConversationPartner && (
                        <>
                          {activeConversationPartner.avatar_url ? (
                            <img
                              src={activeConversationPartner.avatar_url}
                              alt={getDisplayName(activeConversationPartner)}
                              className="h-10 w-10 shrink-0 rounded-full object-cover"
                            />
                          ) : (
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--chat-accent-soft)] font-['Sora'] text-sm font-bold text-[var(--chat-accent)]">
                              {getDisplayName(activeConversationPartner)?.charAt(0)?.toUpperCase() || "?"}
                            </div>
                          )}
                        </>
                      )}
                      <div>
                        <h2 className="font-['Sora'] text-base font-semibold text-[var(--chat-text)]">
                          {activeConversation ? getDisplayName(activeConversationPartner) : "Select a conversation"}
                        </h2>
                        {activeConversation && (
                          <p className="mt-1 font-['DM_Sans'] text-xs text-[var(--chat-text-subtle)]">{activeConversationStatus}</p>
                        )}
                      </div>
                    </div>

                    {activeConversation && (
                      <button
                        type="button"
                        onClick={() => {
                          if (conversationSearchOpen) {
                            closeConversationSearch()
                            return
                          }

                          setConversationSearchOpen(true)
                        }}
                        className="rounded-lg border border-[var(--chat-border)] bg-[var(--chat-surface)] p-2 text-[var(--chat-text-subtle)] transition hover:bg-[var(--chat-elev)] hover:text-[var(--chat-text)]"
                        aria-label="Search messages"
                        title="Search messages"
                      >
                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="11" cy="11" r="7" />
                          <path d="m20 20-3-3" />
                        </svg>
                      </button>
                    )}
                  </div>

                  {conversationSearchOpen && (
                    <div className="mt-3 rounded-xl border border-[var(--chat-border)] bg-[var(--chat-elev)] p-2.5">
                      <div className="flex items-center gap-2">
                        <input
                          ref={conversationSearchInputRef}
                          type="text"
                          value={conversationSearchQuery}
                          onChange={(event) => setConversationSearchQuery(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" && event.shiftKey) {
                              event.preventDefault()
                              goToPreviousSearchMatch()
                              return
                            }

                            if (event.key === "Enter") {
                              event.preventDefault()
                              goToNextSearchMatch()
                            }
                          }}
                          placeholder="Search in conversation"
                          className="flex-1 rounded-[10px] border border-[var(--chat-border)] bg-[var(--chat-surface)] px-3 py-2 font-['DM_Sans'] text-sm text-[var(--chat-text)] outline-none transition focus:border-[var(--chat-accent)]"
                        />

                        <button
                          type="button"
                          onClick={goToPreviousSearchMatch}
                          disabled={matchedMessageIds.length === 0}
                          className="rounded-md border border-[var(--chat-border)] bg-[var(--chat-surface)] px-2 py-1.5 font-['DM_Sans'] text-xs text-[var(--chat-text-subtle)] transition hover:bg-[var(--chat-elev)] disabled:cursor-not-allowed disabled:opacity-50"
                          title="Previous result"
                        >
                          ↑
                        </button>

                        <button
                          type="button"
                          onClick={goToNextSearchMatch}
                          disabled={matchedMessageIds.length === 0}
                          className="rounded-md border border-[var(--chat-border)] bg-[var(--chat-surface)] px-2 py-1.5 font-['DM_Sans'] text-xs text-[var(--chat-text-subtle)] transition hover:bg-[var(--chat-elev)] disabled:cursor-not-allowed disabled:opacity-50"
                          title="Next result"
                        >
                          ↓
                        </button>

                        <button
                          type="button"
                          onClick={closeConversationSearch}
                          className="rounded-md border border-[var(--chat-border)] bg-[var(--chat-surface)] px-2 py-1.5 font-['DM_Sans'] text-xs text-[var(--chat-text-subtle)] transition hover:bg-[var(--chat-elev)]"
                        >
                          Close
                        </button>
                      </div>

                      <p className="mt-2 font-['DM_Sans'] text-xs text-[var(--chat-text-subtle)]">
                        {conversationSearchQuery.trim() && matchedMessageIds.length === 0
                          ? "No messages found"
                          : matchedMessageIds.length > 0
                            ? `${activeMatchIndex + 1} of ${matchedMessageIds.length}`
                            : "Search messages in this conversation"}
                      </p>
                    </div>
                  )}
                </div>

                <div ref={directMessagesContainerRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain bg-[var(--chat-bg)] px-2 py-2 pb-3 sm:px-3 sm:py-2.5 md:px-4">
                  {!activeConversation ? (
                    <div className="flex min-h-full items-center justify-center px-3 py-8">
                      <div className="relative w-full max-w-md overflow-hidden rounded-[24px] border border-[var(--chat-border)] bg-[linear-gradient(145deg,var(--chat-surface)_0%,var(--chat-elev)_100%)] p-6 text-center shadow-[0_24px_70px_rgba(0,0,0,0.36)] sm:p-8">
                        <div className="pointer-events-none absolute -left-20 -top-20 h-44 w-44 rounded-full bg-[rgba(244,180,0,0.12)] blur-3xl" />
                        <div className="pointer-events-none absolute -bottom-24 -right-16 h-48 w-48 rounded-full bg-[rgba(14,165,233,0.08)] blur-3xl" />

                        <div className="relative mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-[20px] border border-[rgba(244,180,0,0.24)] bg-[rgba(244,180,0,0.10)] text-[var(--chat-accent)] shadow-[0_0_32px_rgba(244,180,0,0.12)]">
                          <MessageCircle className="h-8 w-8" />
                        </div>

                        <div className="relative">
                          <h3 className="font-['Sora'] text-xl font-semibold text-[var(--chat-text)]">
                            {availableConversationCount === 0 ? "No conversations yet" : "Select a conversation"}
                          </h3>
                          <p className="mx-auto mt-2 max-w-xs font-['DM_Sans'] text-sm leading-6 text-[var(--chat-text-subtle)]">
                            {availableConversationCount === 0
                              ? "Start a conversation by searching for someone from the left panel."
                              : "Select a chat from the left or search for someone to begin"}
                          </p>

                          <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
                            <button
                              type="button"
                              onClick={focusDirectUserSearch}
                              className="inline-flex w-full items-center justify-center gap-2 rounded-[14px] bg-[var(--chat-accent)] px-5 py-3 font-['DM_Sans'] text-sm font-bold text-[var(--chat-surface)] shadow-[0_10px_30px_rgba(244,180,0,0.28)] transition duration-200 hover:-translate-y-0.5 hover:bg-[var(--chat-accent-hover)] hover:shadow-[0_14px_34px_rgba(244,180,0,0.36)] active:translate-y-0 sm:w-auto"
                            >
                              <UserPlus className="h-4 w-4" />
                              <span>New Chat</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setChatMode("groups")
                                setShowNewGroupModal(true)
                                navigate("/chat?tab=groups", { replace: true })
                              }}
                              className="inline-flex w-full items-center justify-center gap-2 rounded-[14px] border border-[var(--chat-border-strong)] bg-[rgba(255,255,255,0.02)] px-5 py-3 font-['DM_Sans'] text-sm font-semibold text-[var(--chat-text-subtle)] transition duration-200 hover:-translate-y-0.5 hover:border-[rgba(244,180,0,0.35)] hover:bg-[rgba(244,180,0,0.06)] hover:text-[var(--chat-accent)] active:translate-y-0 sm:w-auto"
                            >
                              <Users className="h-4 w-4" />
                              <span>Create Group</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : loadingMessages ? (
                    <div className="space-y-3">
                      {Array.from({ length: 6 }).map((_, index) => (
                        <div key={index} className="h-10 animate-pulse rounded-lg bg-[var(--chat-elev)]" />
                      ))}
                    </div>
                  ) : messages.length === 0 ? (
                    <p className="font-['DM_Sans'] text-sm text-[var(--chat-text-subtle)]">No messages yet. Send the first one.</p>
                  ) : (
                    renderedDirectMessages
                  )}
                  <div ref={bottomRef} />
                </div>

                {activeConversation && (
                  <div className="sticky bottom-0 z-10 shrink-0 border-t border-[var(--chat-border)] bg-[var(--chat-bg)] px-3 py-[10px] pb-[calc(env(safe-area-inset-bottom,0px)+0.5rem)] sm:px-3">
                    {selectedImageFile && selectedImageComposerUrl && (
                      <div className="mb-2 rounded-xl border border-[var(--chat-border)] bg-[var(--chat-elev)] p-2.5">
                        <div className="mb-2 flex items-start gap-2">
                          <img
                            src={selectedImageComposerUrl}
                            alt="Selected"
                            className="h-20 w-20 rounded-lg object-cover"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="font-['DM_Sans'] text-[11px] font-semibold text-[var(--chat-text-subtle)]">Image preview</p>
                            <p className="mt-0.5 truncate font-['DM_Sans'] text-[11px] text-[var(--chat-text-muted)]">{selectedImageFile.name}</p>
                            <input
                              ref={imageCaptionInputRef}
                              value={imageCaption}
                              onChange={(event) => setImageCaption(event.target.value)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter" && !event.shiftKey) {
                                  event.preventDefault()
                                  handleSendImageMessage()
                                }
                              }}
                              placeholder="Add a caption..."
                              className="mt-2 w-full rounded-[10px] border border-[var(--chat-border-strong)] bg-[var(--chat-surface)] px-3 py-2 font-['DM_Sans'] text-sm text-[var(--chat-text)] outline-none transition focus:border-[var(--chat-accent)]"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={clearSelectedImageComposer}
                            className="rounded-md p-1 text-[var(--chat-text-subtle)] transition hover:bg-[rgba(244,180,0,0.08)] hover:text-[var(--chat-accent)]"
                            aria-label="Remove selected image"
                          >
                            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                        <div className="flex items-center justify-end">
                          <button
                            type="button"
                            onClick={handleSendImageMessage}
                            disabled={uploadingImage || !activeConversation}
                            className="rounded-lg bg-[var(--chat-accent)] px-3 py-1.5 font-['DM_Sans'] text-xs font-semibold text-[var(--chat-surface)] transition hover:bg-[var(--chat-accent-hover)] disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {uploadingImage ? "Sending..." : "Send image"}
                          </button>
                        </div>
                      </div>
                    )}

                    {editingMessage && (
                      <div className="mb-2 flex items-center justify-between gap-2 rounded-lg border border-[var(--chat-border-strong)] bg-[var(--chat-accent-soft)] px-2.5 py-2">
                        <div className="min-w-0 flex-1">
                          <p className="font-['DM_Sans'] text-[11px] font-semibold text-[var(--chat-accent)]">Editing message</p>
                          <p className="truncate font-['DM_Sans'] text-xs text-[var(--chat-text-subtle)]">{editingMessage.decrypted_text || editingMessage.content || "[Message]"}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingMessage(null)
                            setDraftInputValue("")
                            requestAnimationFrame(() => {
                              inputRef.current?.focus()
                            })
                          }}
                          className="shrink-0 rounded-md p-1 text-[var(--chat-accent)] transition hover:bg-[rgba(244,180,0,0.08)] hover:text-[var(--chat-accent-hover)]"
                          aria-label="Cancel editing"
                        >
                          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    )}
                    {replyToMessage && (
                      <div className="mb-2 flex items-center justify-between gap-3 rounded-lg border-l-[3px] border-[var(--chat-accent)] bg-[var(--chat-elev)] px-3 py-2">
                        <div className="min-w-0 flex-1">
                          <p className="font-['DM_Sans'] text-[11px] font-semibold text-[var(--chat-text-subtle)]">Replying to {getDisplayName(profilesById[replyToMessage.sender_id])}</p>
                          <p className="truncate font-['DM_Sans'] text-xs text-[var(--chat-text)] opacity-70">
                            {replyToMessage.type === "post"
                              ? getPostPreview(replyToMessage.post || postCache[replyToMessage.post_id])
                              : (replyToMessage.decrypted_text || replyToMessage.content || "[Image]")}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setReplyToMessage(null)}
                          className="shrink-0 rounded-md p-1 text-[var(--chat-text-subtle)] transition hover:bg-[rgba(244,180,0,0.08)] hover:text-[var(--chat-accent)]"
                          aria-label="Cancel reply"
                        >
                          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    )}
                    {activeConversation && isPartnerTyping && (
                      <div className="mb-1.5 flex items-center gap-1 font-['DM_Sans'] text-[11px] italic text-[var(--chat-text-subtle)]">
                        <span>Typing</span>
                        <span className="inline-flex gap-0.5">
                          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--chat-accent)] [animation-delay:0ms]" />
                          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--chat-accent)] [animation-delay:150ms]" />
                          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--chat-accent)] [animation-delay:300ms]" />
                        </span>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="hidden"
                        onChange={handleImageSelected}
                      />
                      <button
                        type="button"
                        onClick={handleImageButtonClick}
                        disabled={!activeConversation || uploadingImage || sending || Boolean(selectedImageFile)}
                        className="inline-flex h-[44px] w-[44px] items-center justify-center rounded-[24px] border border-[var(--chat-border)] bg-[var(--chat-elev)] text-[var(--chat-text-subtle)] transition hover:bg-[rgba(244,180,0,0.08)] hover:text-[var(--chat-accent)] disabled:cursor-not-allowed disabled:opacity-60"
                        aria-label="Upload image"
                        title="Upload image"
                      >
                        {uploadingImage ? (
                          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="9" className="opacity-25" />
                            <path d="M21 12a9 9 0 0 0-9-9" className="opacity-90" />
                          </svg>
                        ) : (
                          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                            <path d="m17 3 4 4" />
                            <path d="M14 7h7" />
                            <path d="m8 15 3-3 2 2 3-3 3 4" />
                            <circle cx="8.5" cy="8.5" r="1.5" />
                          </svg>
                        )}
                      </button>
                      <input
                        ref={inputRef}
                        onChange={(event) => handleDraftChange(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" && !event.shiftKey) {
                            event.preventDefault()
                            handleSendMessage()
                          }
                        }}
                        disabled={!activeConversation || sending || uploadingImage || Boolean(selectedImageFile)}
                        placeholder={
                          activeConversation
                            ? editingMessage
                              ? "Edit your message..."
                              : selectedImageFile
                                ? "Send from image composer..."
                                : "Type a message..."
                            : "Select a conversation first"
                        }
                        className="h-[44px] flex-1 rounded-[24px] border border-[var(--chat-border)] bg-[var(--chat-elev)] px-4 font-['DM_Sans'] text-sm text-[var(--chat-text)] outline-none transition focus:border-[var(--chat-accent)] focus:shadow-[0_0_0_2px_rgba(244,180,0,0.12)]"
                      />
                      <button
                        onClick={handleSendMessage}
                        disabled={!activeConversation || sending || uploadingImage || !hasDraft || Boolean(selectedImageFile)}
                        className="h-[42px] w-[42px] rounded-full bg-[var(--chat-accent)] font-['DM_Sans'] text-xs font-semibold text-[var(--chat-surface)] transition hover:bg-[var(--chat-accent-hover)] disabled:cursor-not-allowed disabled:bg-[var(--chat-border-strong)] disabled:text-[var(--chat-text-muted)]"
                      >
                        {sending ? "Sending..." : "Send"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {/* Group Chat Window */}
        {chatMode === "groups" && (!isMobileView || isMobileGroupDetailView) && (
          <section className="flex h-full min-h-0 min-w-0 w-full flex-col overflow-hidden rounded-2xl border border-[var(--chat-border)] bg-[var(--chat-surface)] shadow-[0_6px_24px_rgba(15,23,42,0.06)]">
            <div className="flex h-full min-h-0 overflow-hidden">
              <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
                {activeGroupId ? (
                  <>
                    {/* Header */}
                    <div className="shrink-0 border-b border-[var(--chat-border)] px-3 py-2.5 sm:px-4 sm:py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          {isMobileGroupDetailView && (
                            <button
                              type="button"
                              onClick={() => {
                                setChatMode("groups")
                                navigate("/chat?tab=groups")
                              }}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[var(--chat-border)] bg-[var(--chat-surface)] text-[var(--chat-text-subtle)] transition hover:bg-[var(--chat-elev)]"
                              aria-label="Back to groups list"
                            >
                              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M15 18l-6-6 6-6" />
                              </svg>
                            </button>
                          )}

                          <div>
                            <h2 className="text-base font-semibold text-[var(--chat-text)]">
                              {groups.find((g) => g.id === activeGroupId)?.name || "Group Chat"}
                            </h2>
                            <p className="mt-1 text-xs text-[var(--chat-text-subtle)]">
                              {groupMembers.length} {groupMembers.length === 1 ? "member" : "members"}
                            </p>
                          </div>
                        </div>

                        <div className="relative">
                          <button
                            onClick={() => setShowMembersDropdown(!showMembersDropdown)}
                            className="px-3 py-2 text-sm font-medium text-[var(--chat-text)] hover:bg-[var(--chat-elev)] rounded-lg transition-colors"
                          >
                            Members
                          </button>

                          {showMembersDropdown && (
                            <div className="absolute right-0 top-full z-20 mt-2 w-64 rounded-lg border border-[var(--chat-border)] bg-[var(--chat-surface)] shadow-lg flex flex-col max-h-96">
                              {/* Current Members */}
                              <div className="border-b border-[var(--chat-border)] px-3 py-2">
                                <p className="text-xs font-semibold text-[var(--chat-text-subtle)] uppercase tracking-wide">Members</p>
                              </div>
                              <div className="min-h-0 flex-1 overflow-y-auto">
                                {groupMembers.map((member) => {
                                  const isAdmin = contextUser?.id && groupMembers.some(m => m.user_id === contextUser.id && m.role === 'admin')
                                  const isCurrentUser = member.user_id === contextUser?.id
                                  return (
                                    <div
                                      key={member.user_id}
                                      className="flex items-center gap-2 px-3 py-2.5 border-b border-[var(--chat-border)] last:border-b-0 hover:bg-[var(--chat-elev)] transition-colors"
                                    >
                                      {member.profiles?.avatar_url ? (
                                        <img
                                          src={member.profiles.avatar_url}
                                          alt={member.profiles.name || member.profiles.username}
                                          className="h-8 w-8 rounded-full object-cover flex-shrink-0"
                                        />
                                      ) : (
                                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--chat-elev)] text-xs font-semibold text-[var(--chat-text-subtle)] flex-shrink-0 bg-gradient-to-br from-[var(--chat-accent-soft)] to-[var(--chat-hover)]">
                                          {(member.profiles?.name || member.profiles?.username || "?").charAt(0).toUpperCase()}
                                        </div>
                                      )}
                                      <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm font-medium text-[var(--chat-text)]">
                                          {member.profiles?.name || member.profiles?.username}
                                        </p>
                                      </div>
                                      <div className="flex items-center gap-1.5 flex-shrink-0">
                                        {member.role === "admin" && (
                                          <span className="text-[9px] font-bold text-[var(--chat-accent)] bg-[var(--chat-accent-soft)] px-2 py-0.5 rounded whitespace-nowrap">
                                            Admin
                                          </span>
                                        )}
                                        {isAdmin && !isCurrentUser && (
                                          <div className="flex gap-1">
                                            {member.role === 'member' && (
                                              <button
                                                onClick={() => handleMakeMemberAdmin(member.user_id)}
                                                className="text-[10px] font-medium text-[var(--chat-text)] hover:bg-[var(--chat-border-strong)] px-1.5 py-0.5 rounded transition-colors"
                                                title="Make admin"
                                              >
                                                Make Admin
                                              </button>
                                            )}
                                            <button
                                              onClick={() => handleRemoveMember(member.user_id)}
                                              className="text-[10px] font-medium text-red-600 hover:text-red-900 hover:bg-red-100 px-1.5 py-0.5 rounded transition-colors"
                                              title="Remove member"
                                            >
                                              Remove
                                            </button>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>

                              {/* Add People Section */}
                              <div className="border-t border-[var(--chat-border)] px-3 py-2">
                                <p className="text-xs font-semibold text-[var(--chat-text-subtle)] uppercase tracking-wide mb-2">Add People</p>
                                <input
                                  type="text"
                                  value={memberSearchQuery}
                                  onChange={(e) => setMemberSearchQuery(e.target.value)}
                                  placeholder="Search by username..."
                                  className="w-full px-2 py-1.5 text-sm border border-[var(--chat-border)] rounded bg-[var(--chat-elev)] text-[var(--chat-text)] outline-none transition focus:border-[var(--chat-accent)] focus:bg-[var(--chat-surface)]"
                                />
                                {memberSearchQuery.trim() && (
                                  <div className="mt-2 max-h-32 overflow-y-auto space-y-0.5">
                                    {memberSearchResults.length > 0 ? (
                                      memberSearchResults.map((user) => (
                                        <button
                                          key={user.id}
                                          onClick={() => {
                                            handleAddMemberToGroup(user.id)
                                            setMemberSearchQuery('')
                                            setMemberSearchResults([])
                                          }}
                                          className="w-full text-left flex items-center gap-2 px-2 py-1.5 text-sm text-[var(--chat-text)] hover:bg-[var(--chat-elev)] rounded transition-colors"
                                        >
                                          {user.avatar_url ? (
                                            <img
                                              src={user.avatar_url}
                                              alt={user.name || user.username}
                                              className="h-6 w-6 rounded-full object-cover flex-shrink-0"
                                            />
                                          ) : (
                                            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--chat-elev)] text-[9px] font-semibold text-[var(--chat-text-subtle)] flex-shrink-0">
                                              {(user.name || user.username || "?").charAt(0).toUpperCase()}
                                            </div>
                                          )}
                                          <span className="truncate">{user.name || user.username}</span>
                                        </button>
                                      ))
                                    ) : (
                                      <p className="text-xs text-[var(--chat-text-subtle)] text-center py-2">No users found</p>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Messages */}
                    <div
                      ref={groupMessagesContainerRef}
                      onClick={() => {
                        setActiveGroupEmojiPickerMessageId(null)
                        setActiveMenuId(null)
                      }}
                      className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain px-3.5 py-2.5 pb-3 md:px-4"
                    >
                      {loadingGroupMessages ? (
                        <div className="flex items-center justify-center h-full">
                          <p className="text-[var(--chat-text-subtle)]">Loading messages...</p>
                        </div>
                      ) : groupMessages.length === 0 ? (
                        <div className="flex items-center justify-center h-full">
                          <p className="text-[var(--chat-text-subtle)]">No messages yet. Start the conversation!</p>
                        </div>
                      ) : (
                        groupMessages.map((message) => {
                          const isMine = message.sender_id === contextUser?.id

                          const reads = groupMessageReads[message.id] || []

                          const seenCount = reads.filter(
                            (r) => r.user_id !== contextUser?.id
                          ).length
                          const totalMembers = Math.max(groupMembers.length - 1, 0)
                          const readCount = Math.min(seenCount, totalMembers)
                          const groupTickMarks = totalMembers > 0 ? "\u2713\u2713" : "\u2713"

                          if (isMine) {
                          }

                          const isOwn = isMine
                          const sender = message.senderProfile
                          const reactionSummary = reactionsByMessageId.group[message.id] || []
                          const isDeleted = message.is_deleted
                          const isImage = message.type === 'image'
                          const isPost = message.type === 'post'
                          const repliedTo = message.reply_to_id ? groupMessagesById.get(message.reply_to_id) : null
                          const isReactionPickerOpen = activeGroupEmojiPickerMessageId === message.id
                          const isMessageMenuOpen = activeMenuId === message.id
                          const canReplyMessage = !isDeleted && !isPost
                          const canReactMessage = !isDeleted
                          const canForwardMessage = !isDeleted && !isPost
                          const canCopyMessage = !isDeleted && !isPost && Boolean(message.content || message.storage_path)
                          const canDeleteMessage = isOwn && !isDeleted
                          const canShowActionTrigger =
                            canReplyMessage || canReactMessage || canForwardMessage || canCopyMessage || canDeleteMessage

                          return (
                            <div
                              key={message.id}
                              className={`group relative flex min-w-0 gap-2 ${isOwn ? "justify-end" : "justify-start"}`}
                            >
                              {!isOwn && (
                                <>
                                  {sender?.avatar_url ? (
                                    <img
                                      src={sender.avatar_url}
                                      alt={sender.name || sender.username}
                                      className="h-6 w-6 rounded-full object-cover flex-shrink-0 mt-5"
                                    />
                                  ) : (
                                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--chat-elev)] text-[10px] font-semibold text-[var(--chat-text-subtle)] flex-shrink-0 mt-5">
                                      {(sender?.name || sender?.username || "?").charAt(0).toUpperCase()}
                                    </div>
                                  )}
                                </>
                              )}

                              <div
                                className={`relative flex min-w-0 max-w-[82%] sm:max-w-[70%] flex-col ${isOwn ? "items-end" : "items-start"}`}
                              >
                                {!isOwn && (
                                  <p className="text-xs font-semibold text-[var(--chat-text-subtle)] mb-1">
                                    {sender?.name || sender?.username || "Unknown"}
                                  </p>
                                )}

                                {message.reply_to_id && (
                                  <div className="mb-0.5 flex max-w-full items-stretch overflow-hidden rounded-lg bg-[var(--chat-elev)]/50 shadow-sm transition hover:bg-[var(--chat-elev)]/80">
                                    <div className="w-[3px] shrink-0 rounded-full bg-[var(--chat-accent)]" />
                                    {repliedTo ? (
                                      <div className="flex w-full min-w-0 items-center gap-2 px-2 py-1.5">
                                        <div className="min-w-0 flex-1">
                                          <p className="font-['Sora'] text-[10.5px] font-medium text-[var(--chat-accent)]">
                                            {repliedTo.senderProfile?.name || repliedTo.senderProfile?.username || "Unknown"}
                                          </p>
                                          <p className="line-clamp-1 font-['DM_Sans'] text-[11px] text-[var(--chat-text-subtle)] opacity-75">
                                            {repliedTo.type === "post" ? (
                                              repliedTo.post_content ? (
                                                repliedTo.post_content.split('\n')[0]
                                              ) : (
                                                repliedTo.post_has_image || repliedTo.post_image_url ? "📷 Image post" : "Shared Post"
                                              )
                                            ) : (
                                              repliedTo.decrypted_text || repliedTo.content || (repliedTo.type === "image" ? "📷 Photo" : "Message")
                                            )}
                                          </p>
                                        </div>
                                        {repliedTo.storage_path && repliedTo.type === "image" && (
                                          <div className="h-8 w-8 shrink-0 overflow-hidden rounded-[4px] border border-[var(--chat-border)]/30">
                                            <img src={repliedTo.storage_path} alt="Reply preview" className="h-full w-full object-cover opacity-60" />
                                          </div>
                                        )}
                                      </div>
                                    ) : (
                                      <div className="px-2 py-1.5 text-[11px] italic text-[var(--chat-text-muted)]">Original message unavailable</div>
                                    )}
                                  </div>
                                )}

                                <div
                                  className="relative w-fit cursor-pointer"
                                  onClick={() => {
                                    if (isMobileView) {
                                      return
                                    }

                                    setActiveGroupEmojiPickerMessageId((prev) => (prev === message.id ? null : message.id))
                                    setActiveMenuId(null)
                                  }}
                                  onTouchStart={(e) => startGroupMessageLongPress(e, message.id, isOwn)}
                                  onTouchEnd={cancelGroupMessageLongPress}
                                  onTouchCancel={cancelGroupMessageLongPress}
                                  onTouchMove={cancelGroupMessageLongPress}
                                  onContextMenu={(event) => {
                                    event.preventDefault()
                                    if (isMobileView) {
                                      handleOpenGroupMessageMenu(event, message.id)
                                    }
                                  }}
                                >
                                  <div
                                    className={`pointer-events-none absolute top-1/2 -translate-y-1/2 hidden md:flex items-center gap-1 ${isOwn ? "right-full mr-2" : "left-full ml-2"} ${isReactionPickerOpen || isMessageMenuOpen ? "opacity-100" : "opacity-0 md:group-hover:opacity-100"} transition-opacity duration-150`}
                                  >
                                    <button
                                      type="button"
                                      onClick={(event) => {
                                        event.stopPropagation()
                                        setActiveGroupEmojiPickerMessageId((prev) => (prev === message.id ? null : message.id))
                                        setActiveMenuId(null)
                                      }}
                                      disabled={!canReactMessage}
                                      className="pointer-events-auto inline-flex h-7 w-7 items-center justify-center rounded-full border border-[var(--chat-border)] bg-[var(--chat-surface)] text-[var(--chat-text-subtle)] shadow-sm transition hover:bg-[var(--chat-elev)] disabled:cursor-not-allowed disabled:opacity-50"
                                      title="React"
                                      aria-label="React to message"
                                    >
                                      <SmilePlus className="h-3.5 w-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(event) => {
                                        event.stopPropagation()
                                        setGroupReplyTo(message)
                                        setActiveGroupEmojiPickerMessageId(null)
                                        setActiveMenuId(null)
                                      }}
                                      disabled={!canReplyMessage}
                                      className="pointer-events-auto inline-flex h-7 w-7 items-center justify-center rounded-full border border-[var(--chat-border)] bg-[var(--chat-surface)] text-[var(--chat-text-subtle)] shadow-sm transition hover:bg-[var(--chat-elev)] disabled:cursor-not-allowed disabled:opacity-50"
                                      title="Reply"
                                      aria-label="Reply to message"
                                    >
                                      <Reply className="h-3.5 w-3.5" />
                                    </button>
                                    {canShowActionTrigger && (
                                      <button
                                        type="button"
                                        onClick={(event) => {
                                          event.stopPropagation()
                                          handleOpenGroupMessageMenu(event, message.id, isOwn)
                                        }}
                                        className="pointer-events-auto flex h-7 w-7 items-center justify-center rounded-md text-[var(--chat-text-muted)] transition-all duration-150 hover:bg-[rgba(255,255,255,0.06)] hover:text-[var(--chat-text)]"
                                        title="More options"
                                        aria-label="Open message options"
                                      >
                                        <MoreVertical className="h-3.5 w-3.5" />
                                      </button>
                                    )}
                                  </div>

                                  {isMessageMenuOpen && canShowActionTrigger && (
                                    <DropdownMenu
                                      x={menuPosition.x}
                                      y={menuPosition.y}
                                      anchorHeight={menuPosition.anchorHeight}
                                      onClose={() => setActiveMenuId(null)}
                                    >
                                      <div className="px-2.5 py-2 border-b border-[var(--chat-border)]/40 mb-1 bg-[var(--chat-elev)]/30">
                                        <p className="text-[9px] text-[var(--chat-text-muted)] font-bold uppercase tracking-widest opacity-80">
                                          {dayjs(message.created_at).format('MMM DD, YYYY · hh:mm A')}
                                        </p>
                                      </div>

                                      <div className="space-y-0.5">

                                        <button
                                          type="button"
                                          onClick={() => {
                                            handleCopyGroupMessage(message)
                                            setActiveMenuId(null)
                                          }}
                                          disabled={!canCopyMessage}
                                          className="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left font-['DM_Sans'] text-[12px] font-medium transition hover:bg-[var(--chat-elev)] disabled:cursor-not-allowed disabled:opacity-50 group"
                                        >
                                          <span>{isImage && !message.content ? "Copy Link" : "Copy"}</span>
                                          <Copy className="h-3.5 w-3.5 text-[var(--chat-text-muted)] group-hover:text-[var(--chat-text)] transition-colors" />
                                        </button>

                                        <button
                                          type="button"
                                          onClick={() => {
                                            handleForwardGroupMessage(message)
                                            setActiveMenuId(null)
                                          }}
                                          disabled={!canForwardMessage}
                                          className="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left font-['DM_Sans'] text-[12px] font-medium transition hover:bg-[var(--chat-elev)] disabled:cursor-not-allowed disabled:opacity-50 group"
                                        >
                                          <span>Forward</span>
                                          <Forward className="h-3.5 w-3.5 text-[var(--chat-text-muted)] group-hover:text-[var(--chat-text)] transition-colors" />
                                        </button>


                                        <button
                                          type="button"
                                          onClick={() => {
                                            setGroupMessageInfoModalId(message.id)
                                            setActiveMenuId(null)
                                          }}
                                          className="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left font-['DM_Sans'] text-[12px] font-medium transition hover:bg-[var(--chat-elev)] group"
                                        >
                                          <span>Message info</span>
                                          <Info className="h-3.5 w-3.5 text-[var(--chat-text-muted)] group-hover:text-[var(--chat-text)] transition-colors" />
                                        </button>

                                        <div className="h-px bg-[var(--chat-border)]/40 my-1 mx-2" />

                                        {canDeleteMessage && (
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setDeleteGroupConfirmationMessage(message)
                                              setActiveMenuId(null)
                                            }}
                                            className="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left font-['DM_Sans'] text-[12px] font-semibold text-red-500 hover:bg-red-500/10 transition-colors group"
                                          >
                                            <span>Delete</span>
                                            <Trash2 className="h-3.5 w-3.5 text-red-400 group-hover:text-red-500 transition-colors" />
                                          </button>
                                        )}
                                      </div>
                                    </DropdownMenu>
                                  )}

                                  {isReactionPickerOpen && (
                                    <div className={`absolute z-20 ${isOwn ? "right-0" : "left-0"} -top-12 flex items-center gap-1 rounded-full border border-[var(--chat-border)] bg-[var(--chat-surface)] px-2 py-1 shadow-md`}>
                                      {REACTION_EMOJIS.map((emoji) => (
                                        <button
                                          key={emoji}
                                          type="button"
                                          onMouseDown={(event) => {
                                            event.preventDefault();
                                            event.stopPropagation();
                                            if (import.meta.env.DEV) {
                                              console.log("[ReactionEmojiClicked]", {
                                                emoji,
                                                messageId: message.id
                                              });
                                            }
                                            handleReactionSelect(message.id, emoji, "group");
                                            setActiveGroupEmojiPickerMessageId(null);
                                          }}
                                          className="rounded-full p-1 text-sm transition hover:bg-[var(--chat-elev)] relative z-[100] cursor-pointer"
                                          style={{ pointerEvents: 'auto' }}
                                          title={emoji}
                                        >
                                          {emoji}
                                        </button>
                                      ))}
                                    </div>
                                  )}

                                  {/* Message bubble or deleted state */}
                                  {isDeleted ? (
                                    <div className="rounded-lg px-3 py-2 text-sm text-[var(--chat-text-muted)] italic">
                                      This message was deleted
                                    </div>
                                  ) : isPost ? (
                                    <PostPreview post_id={message.post_id} isMine={isOwn} />
                                  ) : isImage && message.storage_path ? (
                                    <div className="relative w-full max-w-full cursor-pointer overflow-hidden rounded-2xl bg-[var(--chat-elev)] shadow-sm">
                                      <div className="absolute right-2 top-2 z-10 flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
                                        <button
                                          type="button"
                                          onClick={(event) => {
                                            event.stopPropagation()
                                            setDisplayGroupImagePreviewUrl(message.storage_path)
                                          }}
                                          className="rounded-full bg-black/45 px-2 py-1 text-[10px] text-white transition hover:bg-black/60"
                                        >
                                          View
                                        </button>
                                      </div>
                                      <img
                                        src={message.storage_path}
                                        alt={message.file_name || "Image"}
                                        className="max-h-64 w-full cursor-pointer object-cover transition hover:opacity-90"
                                        onClick={() => setDisplayGroupImagePreviewUrl(message.storage_path)}
                                      />
                                      {message.caption && (
                                        <p className="bg-[var(--chat-elev)] px-2 py-1.5 text-xs text-[var(--chat-text)]">
                                          {message.caption}
                                        </p>
                                      )}
                                    </div>
                                  ) : (
                                    <div
                                      className={`relative w-full rounded-2xl px-3 py-2.5 text-sm shadow-sm transition-colors ${isOwn
                                        ? "bg-[var(--chat-accent)] text-[var(--chat-on-accent)]"
                                        : "bg-[var(--chat-elev)] dark:bg-[var(--chat-hover)] text-[var(--chat-text)] border border-[rgba(0,0,0,0.05)] dark:border-[rgba(255,255,255,0.05)]"
                                        }`}
                                    >
                                      <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{message.decrypted_text || message.content}</p>
                                    </div>
                                  )}
                                </div>

                                {/* Reactions display */}
                                {reactionSummary.length > 0 && (
                                  <div className="mt-2 flex flex-wrap gap-1.5">
                                    {reactionSummary.map((item) => (
                                      <ReactionPill
                                        key={item.emoji}
                                        item={item}
                                        messageId={message.id}
                                        onOpenModal={(id) => {
                                          setReactionModalMessageId(id)
                                        }}
                                      />
                                    ))}
                                  </div>
                                )}

                                <div className="mt-1.5 flex items-center gap-1 text-[10px] text-[var(--chat-text-subtle)]">
                                  <span>
                                    {dayjs(message.created_at).format("HH:mm")}
                                    {message.edited_at && " (edited)"}
                                  </span>
                                  {isOwn && (
                                    <span
                                      className="inline-flex items-center gap-1"
                                      title={readCount > 0 ? `Seen by ${readCount}` : totalMembers > 0 ? "Delivered" : "Sent"}
                                    >
                                      <span className="font-semibold tracking-[-0.08em]">{groupTickMarks}</span>
                                      {readCount > 0 && (
                                        <span className="rounded-full bg-[var(--chat-border-strong)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--chat-text)]">
                                          {readCount}
                                        </span>
                                      )}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          )
                        })
                      )}
                      <AnimatePresence>
                        {typingProfiles.length > 0 && (
                          <motion.div
                            key="group-typing"
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 6 }}
                            transition={{ duration: 0.2 }}
                            style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '6px 0', flexShrink: 0 }}
                          >
                            <div style={{ display: 'flex' }}>
                              {typingProfiles.slice(0, 3).map((p, i) => (
                                <div key={i} style={{
                                  width: 26, height: 26, borderRadius: '50%',
                                  background: '#2A1F00', color: 'var(--chat-accent)',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  fontSize: 10, fontWeight: 700, fontFamily: 'Sora, sans-serif',
                                  marginLeft: i > 0 ? -8 : 0,
                                  border: '2px solid #000',
                                  zIndex: 3 - i
                                }}>
                                  {getFirst(p).charAt(0).toUpperCase()}
                                </div>
                              ))}
                            </div>
                            <div style={{
                              display: 'flex', gap: 4, alignItems: 'center',
                              background: 'var(--chat-hover)', borderRadius: '16px 16px 16px 4px',
                              padding: '10px 14px'
                            }}>
                              {[0, 150, 300].map((delay, i) => (
                                <div key={i} style={{
                                  width: 6, height: 6, borderRadius: '50%',
                                  background: 'var(--chat-accent)',
                                  animation: `groupTypingBounce 1.2s ease-in-out ${delay}ms infinite`
                                }} />
                              ))}
                            </div>
                            <span style={{ fontSize: 10, color: 'var(--chat-text-muted)', fontStyle: 'italic' }}>
                              {typingLabel}
                            </span>
                          </motion.div>
                        )}
                      </AnimatePresence>
                      <div ref={groupBottomRef} />
                    </div>

                    <div className="sticky bottom-0 z-10 shrink-0 border-t border-[var(--chat-border)] bg-[var(--chat-surface)] px-2.5 py-2 pb-[calc(env(safe-area-inset-bottom,0px)+0.5rem)]">
                      {/* Reply preview */}
                      {groupReplyTo && (
                        <div className="mb-2 flex items-center justify-between gap-2 rounded-lg border border-[var(--chat-border)] bg-[var(--chat-elev)] px-2.5 py-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-[11px] font-semibold text-[var(--chat-text-subtle)]">Replying to {groupReplyTo.senderProfile?.name || groupReplyTo.senderProfile?.username || "someone"}</p>
                            <p className="truncate text-xs text-[var(--chat-text)]">{groupReplyTo.content || "[Image]"}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setGroupReplyTo(null)}
                            className="shrink-0 rounded-md p-1 text-[var(--chat-text-muted)] transition hover:bg-[var(--chat-border-strong)] hover:text-[var(--chat-text)]"
                            aria-label="Cancel reply"
                          >
                            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      )}

                      {/* Edit mode */}
                      {editingGroupMessage && (
                        <div className="mb-2 flex items-center justify-between gap-2 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-[11px] font-semibold text-[var(--chat-accent)]">Editing message</p>
                            <p className="truncate text-xs text-[var(--chat-accent)]/80">{editingGroupMessage.decrypted_text || editingGroupMessage.content || "[Message]"}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingGroupMessage(null)
                              setGroupDraft("")
                            }}
                            className="shrink-0 rounded-md p-1 text-[var(--chat-accent)] transition hover:bg-[rgba(244,180,0,0.08)] hover:text-[var(--chat-accent)]"
                            aria-label="Cancel editing"
                          >
                            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      )}

                      {/* Image preview when selected */}
                      {groupSelectedImageComposerUrl && (
                        <div className="mb-2 rounded-lg border border-[var(--chat-border)] bg-[var(--chat-elev)] p-2">
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-xs font-medium text-[var(--chat-text-subtle)]">Image selected</p>
                            <button
                              onClick={() => {
                                setGroupSelectedImage(null)
                                if (groupSelectedImageComposerUrl) {
                                  URL.revokeObjectURL(groupSelectedImageComposerUrl)
                                }
                                setGroupSelectedImageComposerUrl('')
                                setGroupImageCaption('')
                              }}
                              className="text-xs text-[var(--chat-text-subtle)] hover:text-[var(--chat-text)]"
                            >
                              \u2715
                            </button>
                          </div>
                          <img
                            src={groupSelectedImageComposerUrl}
                            alt="Selected"
                            className="max-h-20 max-w-full rounded"
                          />
                          <input
                            type="text"
                            value={groupImageCaption}
                            onChange={(e) => setGroupImageCaption(e.target.value)}
                            placeholder="Add a caption (optional)..."
                            className="mt-2 w-full text-xs border border-[var(--chat-border)] bg-[var(--chat-surface)] text-[var(--chat-text)] rounded px-2 py-1 outline-none focus:border-[var(--chat-accent)]"
                          />
                        </div>
                      )}

                      {/* Message Input */}
                      <div className="pt-1">
                        <div className="flex gap-2">
                          <input
                            type="file"
                            ref={groupFileInputRef}
                            accept="image/jpeg,image/png,image/webp"
                            className="hidden"
                            onChange={handleGroupImageSelected}
                          />
                          <button
                            type="button"
                            onClick={() => groupFileInputRef.current?.click()}
                            disabled={groupSelectedImage !== null || uploadingGroupImage}
                            className="rounded-lg border border-[var(--chat-border)] bg-[var(--chat-surface)] px-2.5 py-2 text-[var(--chat-text-subtle)] transition hover:bg-[var(--chat-elev)] disabled:cursor-not-allowed disabled:opacity-60"
                            aria-label="Attach image"
                            title="Attach image"
                          >
                            ??
                          </button>
                          <input
                            type="text"
                            value={editingGroupMessage ? editingGroupMessage.content || "" : groupDraft}
                            onChange={(e) => editingGroupMessage ? null : setGroupDraft(e.target.value)}
                            onKeyPress={(e) => {
                              if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault()
                                if (editingGroupMessage) {
                                  handleUpdateGroupMessage(editingGroupMessage.id, groupDraft)
                                } else {
                                  handleSendGroupMessage()
                                }
                              }
                            }}
                            placeholder={editingGroupMessage ? "Edit message..." : "Type your message..."}
                            className="flex-1 rounded-lg border border-[var(--chat-border)] bg-[var(--chat-surface)] text-[var(--chat-text)] px-3 py-2 text-sm outline-none transition focus:border-[#f4b400] disabled:bg-[var(--chat-elev)]"
                            disabled={editingGroupMessage ? false : uploadingGroupImage}
                          />
                          <button
                            onClick={() => {
                              if (groupSelectedImage) {
                                handleSendGroupMessageWithImage()
                              } else if (editingGroupMessage) {
                                handleUpdateGroupMessage(editingGroupMessage.id, groupDraft)
                              } else {
                                handleSendGroupMessage()
                              }
                            }}
                            disabled={
                              (editingGroupMessage ? !groupDraft.trim() : !groupDraft.trim() && !groupSelectedImage) ||
                              sendingGroup ||
                              uploadingGroupImage
                            }
                            className="px-4 py-2 rounded-lg bg-[var(--chat-accent)] hover:bg-[var(--chat-accent-hover)] disabled:bg-[var(--chat-accent-soft)] text-[var(--chat-surface)] font-medium transition-colors disabled:cursor-not-allowed"
                          >
                            {uploadingGroupImage
                              ? "Uploading..."
                              : sendingGroup
                                ? "..."
                                : editingGroupMessage
                                  ? "Update"
                                  : groupSelectedImage
                                    ? "Send Image"
                                    : "Send"}
                          </button>
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="flex h-full items-center justify-center">
                    <p className="text-[var(--chat-text-subtle)]">Select a group to start chatting</p>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}
      </div>

      {displayGroupImagePreviewUrl && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4"
          onClick={() => setDisplayGroupImagePreviewUrl("")}
        >
          <button
            type="button"
            className="absolute right-4 top-4 rounded-full bg-black/50 px-3 py-1.5 text-sm text-white"
            onClick={() => setDisplayGroupImagePreviewUrl("")}
          >
            Close
          </button>
          <img
            src={displayGroupImagePreviewUrl}
            alt="Preview"
            className="max-h-[90vh] max-w-[90vw] rounded-xl object-contain"
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      )}

      {deleteGroupConfirmationMessage && (
        <div
          className="fixed inset-0 z-[140] flex items-center justify-center bg-black/45 p-4 backdrop-blur-[3px]"
          onClick={() => setDeleteGroupConfirmationMessage(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-[var(--chat-border)] bg-[var(--chat-surface)] p-5 shadow-[0_24px_70px_rgba(15,23,42,0.2)]"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 className="mb-2 text-base font-semibold text-[var(--chat-text)]">Delete message?</h3>
            <p className="mb-5 text-sm text-[var(--chat-text-subtle)]">
              This will delete the message for everyone in the group.
            </p>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteGroupConfirmationMessage(null)}
                className="rounded-lg border border-[var(--chat-border)] bg-[var(--chat-surface)] px-3 py-2 text-sm text-[var(--chat-text-subtle)] transition hover:bg-[var(--chat-elev)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleDeleteGroupMessage(deleteGroupConfirmationMessage.id)}
                className="rounded-lg bg-red-600 px-3 py-2 text-sm text-white transition hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {groupMessageInfoModalId && (() => {
        const msg = groupMessages.find((m) => m.id === groupMessageInfoModalId)
        if (!msg) return null

        // Only show delivery/read details for sender's own messages
        const isOwnMessage = msg.sender_id === contextUser?.id
        const reads = isOwnMessage ? (groupMessageReads[msg.id] || []) : []
        const readUserIds = new Set(reads.map(r => r.user_id))

        // Get members who haven't read (excluding sender)
        const deliveredMembers = isOwnMessage
          ? groupMembers.filter(m => m.user_id !== contextUser?.id && !readUserIds.has(m.user_id))
          : []

        // Get members who have read (excluding sender)
        const readMembers = isOwnMessage
          ? reads.filter(r => r.user_id !== contextUser?.id)
          : []

        return (
          <div
            className="fixed inset-0 z-[140] flex items-center justify-center bg-black/45 p-4 backdrop-blur-[3px]"
            onClick={() => setGroupMessageInfoModalId(null)}
          >
            <div
              className="w-full max-w-sm rounded-2xl border border-[var(--chat-border)] bg-[var(--chat-surface)] p-5 shadow-[0_24px_70px_rgba(15,23,42,0.2)]"
              onClick={(event) => event.stopPropagation()}
            >
              <h3 className="mb-4 text-base font-semibold text-[var(--chat-text)]">Message info</h3>

              <div className="space-y-4 text-sm max-h-[400px] overflow-y-auto">
                {isOwnMessage ? (
                  <>
                    {/* Delivered To Section */}
                    {deliveredMembers.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-[var(--chat-text-subtle)] uppercase tracking-wide mb-2">Delivered to</p>
                        <div className="space-y-2">
                          {deliveredMembers.map((member) => (
                            <div key={member.user_id} className="flex items-center gap-2">
                              {member.profiles?.avatar_url ? (
                                <img
                                  src={member.profiles.avatar_url}
                                  alt={getDisplayName(member.profiles)}
                                  className="h-6 w-6 rounded-full object-cover shrink-0"
                                />
                              ) : (
                                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--chat-elev)] text-[10px] font-semibold text-[var(--chat-text-subtle)] shrink-0">
                                  {getDisplayName(member.profiles).charAt(0).toUpperCase()}
                                </div>
                              )}
                              <p className="text-[var(--chat-text)]">{getDisplayName(member.profiles)}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Read By Section */}
                    {readMembers.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-[var(--chat-text-subtle)] uppercase tracking-wide mb-2">Read by</p>
                        <div className="space-y-2">
                          {readMembers
                            .slice()
                            .sort((a, b) => new Date(b.read_at).getTime() - new Date(a.read_at).getTime())
                            .map((read) => (
                              <div key={`${read.user_id}-${read.read_at}`} className="flex items-center gap-2">
                                {read.profile?.avatar_url ? (
                                  <img
                                    src={read.profile.avatar_url}
                                    alt={getDisplayName(read.profile)}
                                    className="h-6 w-6 rounded-full object-cover shrink-0"
                                  />
                                ) : (
                                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--chat-elev)] text-[10px] font-semibold text-[var(--chat-text-subtle)] shrink-0">
                                    {getDisplayName(read.profile).charAt(0).toUpperCase()}
                                  </div>
                                )}
                                <div className="min-w-0 flex-1">
                                  <p className="text-[var(--chat-text)] truncate">{getDisplayName(read.profile)}</p>
                                  <p className="text-[11px] text-[var(--chat-text-subtle)]">
                                    {read.read_at ? dayjs(read.read_at).format("h:mm A") : "Time unavailable"}
                                  </p>
                                </div>
                              </div>
                            ))}
                        </div>
                      </div>
                    )}

                    {/* No reads yet message */}
                    {deliveredMembers.length === 0 && readMembers.length === 0 && (
                      <p className="text-[var(--chat-text-subtle)] text-sm">No members yet in this group.</p>
                    )}
                  </>
                ) : (
                  <>
                    {/* For non-own messages, show sender and sent time */}
                    <div>
                      <p className="text-xs font-semibold text-[var(--chat-text-subtle)] uppercase tracking-wide mb-1">From</p>
                      <p className="text-[var(--chat-text)]">{msg.senderProfile?.name || msg.senderProfile?.username || "Unknown"}</p>
                    </div>

                    <div>
                      <p className="text-xs font-semibold text-[var(--chat-text-subtle)] uppercase tracking-wide mb-1">Sent</p>
                      <p className="text-[var(--chat-text)]">
                        {dayjs(msg.created_at).format("MMMM D, YYYY | h:mm A")}
                      </p>
                    </div>
                  </>
                )}
              </div>

              <div className="mt-5 flex items-center justify-end">
                <button
                  type="button"
                  onClick={() => setGroupMessageInfoModalId(null)}
                  className="rounded-lg border border-[var(--chat-border)] bg-[var(--chat-surface)] px-4 py-2 text-sm text-[var(--chat-text-subtle)] transition hover:bg-[var(--chat-elev)]"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {imagePreviewUrl && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4"
          onClick={() => setImagePreviewUrl("")}
        >
          <button
            type="button"
            className="absolute right-4 top-4 rounded-full bg-black/50 px-3 py-1.5 text-sm text-white"
            onClick={() => setImagePreviewUrl("")}
          >
            Close
          </button>
          <img
            src={imagePreviewUrl}
            alt="Preview"
            className="max-h-[90vh] max-w-[90vw] rounded-xl object-contain"
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      )}

      {forwardModalOpen && (
        <div
          className="fixed inset-0 z-[140] flex items-center justify-center bg-black/45 p-4 backdrop-blur-[3px]"
          onClick={closeForwardModal}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-[var(--chat-border)] bg-[var(--chat-surface)] p-4 shadow-[0_24px_70px_rgba(15,23,42,0.2)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-semibold text-[var(--chat-text)]">Forward message</h3>
              <button
                type="button"
                onClick={closeForwardModal}
                disabled={forwarding}
                className="rounded-full p-1 text-[var(--chat-text-subtle)] transition hover:bg-[var(--chat-elev)] hover:text-[var(--chat-text)] disabled:opacity-50"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <input
              type="text"
              value={forwardSearchQuery}
              onChange={(event) => setForwardSearchQuery(event.target.value)}
              placeholder="Search chats"
              className="w-full rounded-lg border border-[var(--chat-border)] bg-[var(--chat-surface)] px-3 py-2 text-sm text-[var(--chat-text)] placeholder:text-[var(--chat-text-muted)] outline-none transition focus:border-[#f4b400]"
            />

            <div className="mt-3 max-h-[320px] space-y-1 overflow-y-auto pr-1">
              {conversations
                .filter((conversation) => {
                  const query = forwardSearchQuery.trim().toLowerCase()
                  if (!query) return true

                  const displayName = getDisplayName(conversation.partner).toLowerCase()
                  const username = conversation.partner?.username?.toLowerCase() || ""
                  return displayName.includes(query) || username.includes(query)
                })
                .map((conversation) => {
                  const displayName = getDisplayName(conversation.partner)
                  const isSelected = selectedForwardConversationIds.includes(conversation.id)

                  return (
                    <button
                      key={conversation.id}
                      type="button"
                      onClick={() => toggleForwardConversation(conversation.id)}
                      className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left transition ${isSelected
                        ? "border-[var(--chat-border-strong)] bg-[var(--chat-accent-soft)]"
                        : "border-[var(--chat-border)] bg-[var(--chat-surface)] hover:bg-[var(--chat-elev)]"
                        }`}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-[var(--chat-text)]">{displayName}</p>
                        <p className="truncate text-xs text-[var(--chat-text-subtle)]">@{conversation.partner?.username || "unknown"}</p>
                      </div>
                      <span
                        className={`ml-3 inline-flex h-5 w-5 items-center justify-center rounded-full border text-[11px] ${isSelected
                          ? "border-[var(--chat-accent)] bg-[#f4b400] text-[var(--chat-surface)]"
                          : "border-[var(--chat-border-strong)] bg-[var(--chat-surface)] text-transparent"
                          }`}
                      >
                        {"\u2713"}
                      </span>
                    </button>
                  )
                })}
            </div>

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={closeForwardModal}
                disabled={forwarding}
                className="rounded-lg border border-[var(--chat-border)] bg-[var(--chat-surface)] px-3 py-2 text-sm text-[var(--chat-text-subtle)] transition hover:bg-[var(--chat-elev)] disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleForwardMessages}
                disabled={forwarding || selectedForwardConversationIds.length === 0}
                className="rounded-lg bg-[#f4b400] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#e0a500] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {forwarding ? "Forwarding..." : `Forward (${selectedForwardConversationIds.length})`}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirmationMessage && (
        <div
          className="fixed inset-0 z-[140] flex items-center justify-center bg-black/45 p-4 backdrop-blur-[3px]"
          onClick={() => setDeleteConfirmationMessage(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-[var(--chat-border)] bg-[var(--chat-surface)] p-5 shadow-[0_24px_70px_rgba(15,23,42,0.2)]"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 className="mb-2 text-base font-semibold text-[var(--chat-text)]">Unsend message?</h3>
            <p className="mb-5 text-sm text-[var(--chat-text-subtle)]">
              This will unsend the message for both you and the recipient. This action cannot be undone.
            </p>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmationMessage(null)}
                className="rounded-lg border border-[var(--chat-border)] bg-[var(--chat-surface)] px-3 py-2 text-sm text-[var(--chat-text-subtle)] transition hover:bg-[var(--chat-elev)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => confirmDeleteMessage(deleteConfirmationMessage)}
                className="rounded-lg bg-red-600 px-3 py-2 text-sm text-white transition hover:bg-red-700"
              >
                Unsend
              </button>
            </div>
          </div>
        </div>
      )}

      {showNewGroupModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay-backdrop)]">
          <div className="w-full max-w-md rounded-xl bg-[var(--chat-surface)] p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-[var(--chat-text)] mb-4">Create New Group</h3>

            {/* Group Name Input */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-[var(--chat-text)] mb-1">
                Group Name
              </label>
              <input
                type="text"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="Enter group name..."
                className="w-full rounded-lg border border-[var(--chat-border)] bg-[var(--chat-surface)] px-3 py-2 text-sm text-[var(--chat-text)] placeholder:text-[var(--chat-text-muted)] outline-none transition focus:border-[#f4b400]"
              />
            </div>

            {/* Add Members */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-[var(--chat-text)] mb-1">
                Add Members
              </label>
              <input
                type="text"
                value={newGroupSearch}
                onChange={(e) => setNewGroupSearch(e.target.value)}
                placeholder="Search by username..."
                className="w-full rounded-lg border border-[var(--chat-border)] bg-[var(--chat-surface)] px-3 py-2 text-sm text-[var(--chat-text)] placeholder:text-[var(--chat-text-muted)] outline-none transition focus:border-[#f4b400]"
              />

              {newGroupSearch.trim() && (
                <div className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-[var(--chat-border)] bg-[var(--chat-elev)]">
                  {newGroupSearchResults.length === 0 ? (
                    <p className="p-3 text-center text-sm text-[var(--chat-text-subtle)]">No users found.</p>
                  ) : (
                    newGroupSearchResults.map((profile) => (
                      <button
                        key={profile.id}
                        onClick={() => {
                          setNewGroupSelectedUsers([...newGroupSelectedUsers, profile])
                          setNewGroupSearch("")
                          setNewGroupSearchResults([])
                        }}
                        className="w-full flex items-center gap-2 border-b border-[var(--chat-border)] px-3 py-2 text-left hover:bg-[var(--chat-elev)] last:border-0"
                      >
                        {profile.avatar_url ? (
                          <img
                            src={profile.avatar_url}
                            alt={profile.name || profile.username}
                            className="h-7 w-7 rounded-full object-cover"
                          />
                        ) : (
                          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--chat-accent-soft)] text-xs font-semibold text-[var(--chat-text)]">
                            {(profile.name || profile.username || "?").charAt(0).toUpperCase()}
                          </div>
                        )}
                        <span className="text-sm font-medium text-[var(--chat-text)]">
                          {profile.name || profile.username}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              )}

              {/* Selected Users */}
              {newGroupSelectedUsers.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {newGroupSelectedUsers.map((user) => (
                    <div
                      key={user.id}
                      className="inline-flex items-center gap-2 rounded-full bg-[var(--chat-accent-soft)] px-3 py-1"
                    >
                      <span className="text-sm font-medium text-[var(--chat-accent)]">
                        {user.name || user.username}
                      </span>
                      <button
                        onClick={() =>
                          setNewGroupSelectedUsers(
                            newGroupSelectedUsers.filter((u) => u.id !== user.id)
                          )
                        }
                        className="text-[var(--chat-accent)] hover:text-[var(--chat-accent)]"
                      >
                        {"\u2715"}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Modal Buttons */}
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => {
                  setShowNewGroupModal(false)
                  setNewGroupName("")
                  setNewGroupSelectedUsers([])
                  setNewGroupSearch("")
                }}
                className="px-4 py-2 text-sm font-medium text-[var(--chat-text)] hover:bg-[var(--chat-elev)] rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateGroup}
                disabled={creatingGroup || !newGroupName.trim() || newGroupSelectedUsers.length === 0}
                className="px-4 py-2 text-sm font-medium text-[var(--chat-accent)] bg-[var(--chat-accent)] hover:bg-[var(--chat-accent-hover)] disabled:bg-[var(--chat-accent-soft)] rounded-lg transition-colors disabled:cursor-not-allowed"
              >
                {creatingGroup ? "Creating..." : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}

      <Suspense fallback={null}>
        <ReactionModal
          open={Boolean(reactionModalMessageId)}
          messageId={reactionModalMessageId}
          groups={reactionModalMessageId ? (reactionsByMessageId.direct[reactionModalMessageId] || reactionsByMessageId.group[reactionModalMessageId] || []) : []}
          onClose={() => setReactionModalMessageId(null)}
          onRemoveReaction={handleRemoveReaction}
        />
      </Suspense>
    </div>
  )
}

