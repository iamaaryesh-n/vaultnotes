import { useCallback, useEffect, useMemo, useRef, useState, lazy, Suspense } from "react"
import { useNavigate, useParams, useSearchParams } from "react-router-dom"
import { supabase } from "../lib/supabase"
import { useAuth } from "../hooks/useAuth"
import { ChatListSkeleton } from "../components/SkeletonLoader"
import { useToast } from "../hooks/useToast"
import { encrypt, decrypt, importKey, generateKey, exportKey, validateKey, debugLogKey } from "../utils/encryption"
import { getSignedImageUrl, uploadImageToPrivateStorage, isSignedUrlValid, deletePrivateImage } from "../lib/privateImageStorage"
import { IMAGE_TOO_LARGE_MESSAGE, prepareImageForUpload } from "../lib/imageCompression"
import { dispatchPushNotification } from "../lib/pushNotifications"
import { Copy, Forward, Info, MoreHorizontal, Reply, SmilePlus, Trash2, ChevronUp, ChevronDown } from "lucide-react"
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
  const [activeConversationId, setActiveConversationId] = useState(cachedCurrentChatId || null)
  const [messages, setMessages] = useState([])
  const [profilesById, setProfilesById] = useState({})
  const [hasDraft, setHasDraft] = useState(false)
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
  const [activeMessageMenuId, setActiveMessageMenuId] = useState(null)
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
  const [unreadCountsByConversation, setUnreadCountsByConversation] = useState(cachedUnreadCountsByConversation || {})
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

  // Group chat features: message actions menu
  const [activeGroupMessageMenuId, setActiveGroupMessageMenuId] = useState(null)
  const [activeGroupEmojiPickerMessageId, setActiveGroupEmojiPickerMessageId] = useState(null)
  const [groupMessageInfoModalId, setGroupMessageInfoModalId] = useState(null)
  const [groupTypingIndicators, setGroupTypingIndicators] = useState({}) // userId -> timestamp
  const [isMobileView, setIsMobileView] = useState(() => window.matchMedia("(max-width: 767px)").matches)

  const bottomRef = useRef(null)
  const inputRef = useRef(null)
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
  const directSwipeStateRef = useRef({
    messageId: null,
    startX: 0,
    startY: 0,
    triggered: false,
    element: null,
  })
  
  const requestedConversationId = routeConversationId || searchParams.get("conversation")
  const requestedTab = searchParams.get("tab")
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

  const activeConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === activeConversationId) || null,
    [conversations, activeConversationId]
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
      console.warn("[Chat] Failed to load profiles:", profileError)
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
            console.log(`[Chat] [ok] Successfully loaded shared key for conversation ${conversationId}`)
            return cryptoKey
          }
        }
      }

      // Generate new key for this conversation if it doesn't exist
      console.log(`[Chat] Generating new encryption key for conversation ${conversationId}`)
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
          console.log(`[Chat] [ok] Stored shared key in database for conversation ${conversationId}`)
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
            console.log(`[Chat] [ok] Successfully loaded fresh key for conversation ${conversationId}`)
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
          console.log(`[Chat] Using cached signed URL for: ${message.storage_path}`)
          return cached.url
        }

        // Generate new signed URL (1 hour expiry)
        const result = await getSignedImageUrl(message.storage_path, 3600)
        if (result) {
          // Cache the signed URL with expiry time
          signedImageUrlCacheRef.current[message.storage_path] = result
          console.log(`[Chat] Generated new signed URL for: ${message.storage_path}`)
          return result.url
        }

        console.warn(`[Chat] Failed to generate signed URL for: ${message.storage_path}`)
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
          is_deleted: row.is_deleted === true
        }
      })

      setConversationPreferencesById(mapped)
    } catch (err) {
      console.error("[Chat] Exception fetching conversation preferences:", err)
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
      ;(data || []).forEach((row) => {
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
      console.warn("[Chat] Failed to update last_seen:", updateError)
    }
  }, [contextUser?.id])

  const persistLastSeenNow = useCallback(async () => {
    if (!contextUser?.id) return

    const { error: updateError } = await supabase
      .from("profiles")
      .update({ is_online: false, last_seen: new Date().toISOString() })
      .eq("id", contextUser.id)

    if (updateError) {
      console.warn("[Chat] Failed to persist last_seen on disconnect:", updateError)
    }
  }, [contextUser?.id])

  const syncOnlineUsersFromPresence = useCallback((channel) => {
    if (!channel) return

    const state = channel.presenceState()
    const nextOnlineUsersById = {}

    Object.entries(state).forEach(([key, entries]) => {
      ;(entries || []).forEach((entry) => {
        const userId = entry?.user_id || key
        if (userId) {
          nextOnlineUsersById[userId] = true
        }
      })
    })

    setOnlineUsersById(nextOnlineUsersById)
  }, [])

  const dispatchUnreadBadgeUpdate = useCallback((countsByConversation) => {
    const totalUnreadConversations = Object.values(countsByConversation || {}).filter((count) => count > 0).length

    window.dispatchEvent(
      new CustomEvent("chatUnreadChanged", {
        detail: {
          totalUnreadConversations,
          unreadCountsByConversation: countsByConversation || {}
        }
      })
    )
  }, [])

  const clearUnreadForConversation = useCallback((conversationId) => {
    if (!conversationId) return

    setUnreadCountsByConversation((prev) => {
      if (!prev[conversationId]) {
        return prev
      }

      const next = { ...prev }
      delete next[conversationId]
      dispatchUnreadBadgeUpdate(next)
      return next
    })
  }, [dispatchUnreadBadgeUpdate])

  const incrementUnreadForConversation = useCallback((conversationId) => {
    if (!conversationId) return

    setUnreadCountsByConversation((prev) => {
      const next = {
        ...prev,
        [conversationId]: (prev[conversationId] || 0) + 1
      }

      dispatchUnreadBadgeUpdate(next)
      return next
    })
  }, [dispatchUnreadBadgeUpdate])

  const decrementUnreadForConversation = useCallback((conversationId) => {
    if (!conversationId) return

    setUnreadCountsByConversation((prev) => {
      const current = prev[conversationId] || 0
      if (current <= 0) {
        return prev
      }

      const next = { ...prev }
      const updated = current - 1

      if (updated <= 0) {
        delete next[conversationId]
      } else {
        next[conversationId] = updated
      }

      dispatchUnreadBadgeUpdate(next)
      return next
    })
  }, [dispatchUnreadBadgeUpdate])

  const navigateToConversation = useCallback((conversationId, options = {}) => {
    if (conversationId) {
      navigate(`/chat/direct/${conversationId}`, { replace: options.replace === true })
    } else {
      navigate("/chat?tab=direct", { replace: options.replace === true })
    }

    setActiveConversationId(conversationId || null)
    if (conversationId) {
      clearUnreadForConversation(conversationId)
    }
  }, [clearUnreadForConversation, navigate])

  const startDirectMessageLongPress = useCallback(
    (messageId) => {
      if (!isMobileView || !messageId) {
        return
      }

      if (directLongPressTimeoutRef.current) {
        clearTimeout(directLongPressTimeoutRef.current)
      }

      directLongPressTimeoutRef.current = setTimeout(() => {
        setActiveMessageMenuId(messageId)
        setActiveReactionPickerMessageId(null)
      }, 420)
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
    (messageId) => {
      if (!isMobileView || !messageId) {
        return
      }

      if (groupLongPressTimeoutRef.current) {
        clearTimeout(groupLongPressTimeoutRef.current)
      }

      groupLongPressTimeoutRef.current = setTimeout(() => {
        setActiveGroupMessageMenuId(messageId)
        setActiveGroupEmojiPickerMessageId(null)
      }, 420)
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
      console.warn("[Chat] Failed to broadcast typing state:", typingError)
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
        console.warn("[Chat] Failed to broadcast reaction event:", broadcastError)
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

  const addReactionToState = useCallback((newReaction) => {
    const { message_id, emoji, user_id } = newReaction

    if (!message_id || !emoji || !user_id) {
      console.warn("[Chat] Invalid reaction data for INSERT:", newReaction)
      return
    }

    console.log("[Chat] addReactionToState - Adding to messages:", {
      message_id,
      emoji,
      user_id
    })

    setMessages((prevMessages) =>
      prevMessages.map((msg) => {
        if (msg.id !== message_id) return msg

        const existing = msg.reactions || []

        // Prevent duplicate reaction
        const alreadyExists = existing.some((r) => r.user_id === user_id && r.emoji === emoji)

        if (alreadyExists) {
          console.log("[Chat] Reaction already exists, skipping duplicate")
          return msg
        }

        console.log("[Chat] Reaction added to message state:", message_id, emoji)

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
      console.warn("[Chat] Invalid reaction data for DELETE:", oldReaction)
      return
    }

    console.log("[Chat] removeReactionFromState - Removing from messages:", {
      message_id,
      emoji,
      user_id,
      id
    })

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

    console.log("[Chat] Reaction removed from message state:", message_id)
  }, [])

  const handleReactionInsert = useCallback((newData) => {
    if (!newData?.message_id) {
      console.warn("[Chat] Invalid insert data, missing message_id:", newData)
      return
    }

    console.log("[Chat] INSERT RECEIVED for current chat:", newData)
    addReactionToState(newData)
  }, [addReactionToState])

  const handleReactionDelete = useCallback((oldData) => {
    if (!oldData?.message_id) {
      console.warn("[Chat] Invalid delete data, missing message_id:", oldData)
      return
    }

    console.log("[Chat] DELETE RECEIVED:", oldData)
    removeReactionFromState(oldData)
  }, [])

  const updateReactionInState = useCallback((updatedReaction) => {
    if (!updatedReaction?.message_id || !updatedReaction?.id) {
      console.warn("[Chat] Invalid reaction data for UPDATE:", updatedReaction)
      return
    }

    console.log("[Chat] updateReactionInState UPDATE:", updatedReaction)

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

      console.log("[Chat] Fetched", (data || []).length, "reactions")

      // Group reactions by message_id
      const reactionsByMessageId = {}
      ;(data || []).forEach((reaction) => {
        if (!reaction?.message_id) return
        if (!reactionsByMessageId[reaction.message_id]) {
          reactionsByMessageId[reaction.message_id] = []
        }
        reactionsByMessageId[reaction.message_id].push(reaction)
      })

      console.log("[Chat] Grouped reactions by message:", Object.keys(reactionsByMessageId).length, "messages have reactions")

      // Update messages with reactions
      setMessages((prev) => {
        const updated = prev.map((msg) => ({
          ...msg,
          reactions: reactionsByMessageId[msg.id] || []
        }))
        console.log("[Chat] Updated messages with reactions, total reactions across all messages:", Object.values(reactionsByMessageId).reduce((sum, arr) => sum + arr.length, 0))
        return updated
      })
    },
    []
  )

  const fetchMessages = useCallback(async (conversationId, { force = false, silent = false } = {}) => {
    if (!conversationId) return

    const cachedMessages = useChatStore.getState().messagesByConversationId[conversationId] || []
    if (!force && cachedMessages.length > 0 && !shouldFetchMessages(conversationId)) {
      setMessages(cachedMessages)
      return
    }

    try {
      console.log("[Chat] conversationId:", conversationId)
      console.log("[Chat] fetchMessages called for conversation:", conversationId)
      if (!silent) {
        setLoadingMessages(true)
      }
      setError("")

      const { data, error: fetchError } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true })

      if (fetchError) {
        console.error("[Chat] Failed to load messages:", fetchError)
        setError("Failed to load messages")
        return
      }

      // Get encryption key for this conversation - fetch fresh from DB
      const cryptoKey = await getConversationKeyFresh(conversationId)
      if (!cryptoKey) {
        console.warn(`[Chat] Could not get encryption key for conversation ${conversationId}`)
      }

      // Decrypt messages
      const decryptedMessages = await Promise.all(
        (data || []).map(async (message) => {
          const decrypted = { ...message, type: getMessageType(message), reactions: [] }
          
          try {
            // Decrypt content if encrypted_content and iv fields exist
            if (message.encrypted_content && message.iv && cryptoKey) {
              const decryptedContent = await decrypt(message.encrypted_content, message.iv, cryptoKey)
              decrypted.content = decryptedContent
              decrypted.encrypted_content = message.encrypted_content
              decrypted.iv = message.iv
            }
          } catch (decryptError) {
            // Old message corrupted - fallback to plaintext or old message indicator
            console.warn(`[Chat] Could not decrypt old message ${message.id}:`, decryptError.message)
            // Use plaintext content if available, otherwise indicate message is unavailable
            if (message.content) {
              decrypted.content = message.content
              console.log(`[Chat] Displaying plaintext fallback for message ${message.id}`)
            } else {
              decrypted.content = "[Older encrypted message unavailable]"
              console.log(`[Chat] Message ${message.id} has no plaintext fallback - was encrypted with invalid key`)
            }
          }
          
          return decrypted
        })
      )

      const participantIds = decryptedMessages.flatMap((message) => [message.sender_id, message.receiver_id])
      await fetchProfilesByIds(participantIds)
      
      // First set messages without reactions (to show them immediately)
      setMessages(decryptedMessages)
      setMessagesCache(conversationId, decryptedMessages)
      
      // Then fetch and attach reactions
      await fetchReactionsForMessages(decryptedMessages)
    } catch (err) {
      console.error("[Chat] Messages exception:", err)
      setError("Failed to load messages")
    } finally {
      if (!silent) {
        setLoadingMessages(false)
      }
    }
  }, [fetchProfilesByIds, fetchReactionsForMessages, getMessageType, setMessagesCache, shouldFetchMessages])

  const fetchConversations = useCallback(async (userId, { force = false, silent = false } = {}) => {
    if (!userId) return

    if (!force && cachedConversations.length > 0 && !shouldFetchConversations()) {
      setLoadingConversations(false)
      return
    }

    try {
      if (!silent) {
        setLoadingConversations(true)
      }
      setError("")

      const { data, error: fetchError } = await supabase
        .from("conversations")
        .select("id, user1_id, user2_id, created_at")
        .or(`user1_id.eq.${userId},user2_id.eq.${userId}`)
        .order("created_at", { ascending: false })

      if (fetchError) {
        console.error("[Chat] Failed to load conversations:", fetchError)
        setError("Failed to load conversations")
        setConversations([])
        return
      }

      const allConversations = data || []
      const allConversationIds = allConversations.map((conversation) => conversation.id).filter(Boolean)
      const deletedConversationIds = new Set()
      const nonDeletedPreferenceMap = {}

      if (allConversationIds.length > 0) {
        const [deletedPrefsResult, nonDeletedPrefsResult] = await Promise.all([
          supabase
            .from("conversation_preferences")
            .select("conversation_id")
            .eq("user_id", userId)
            .is("group_id", null)
            .eq("is_deleted", true)
            .in("conversation_id", allConversationIds),
          supabase
            .from("conversation_preferences")
            .select("conversation_id, is_archived, is_deleted")
            .eq("user_id", userId)
            .is("group_id", null)
            .in("conversation_id", allConversationIds)
            .or("is_deleted.is.null,is_deleted.eq.false")
        ])

        if (deletedPrefsResult.error) {
          console.warn("[Chat] Failed to fetch deleted conversation preferences:", deletedPrefsResult.error)
        } else {
          ;(deletedPrefsResult.data || []).forEach((row) => {
            if (row?.conversation_id) {
              deletedConversationIds.add(row.conversation_id)
            }
          })
        }

        if (nonDeletedPrefsResult.error) {
          console.warn("[Chat] Failed to fetch non-deleted conversation preferences:", nonDeletedPrefsResult.error)
        } else {
          ;(nonDeletedPrefsResult.data || []).forEach((row) => {
            if (!row?.conversation_id) return
            nonDeletedPreferenceMap[row.conversation_id] = {
              is_archived: row.is_archived === true,
              is_deleted: row.is_deleted === true
            }
          })
        }

        setConversationPreferencesById((prev) => {
          const next = { ...prev }

          deletedConversationIds.forEach((conversationId) => {
            delete next[conversationId]
          })

          Object.entries(nonDeletedPreferenceMap).forEach(([conversationId, preference]) => {
            next[conversationId] = preference
          })

          return next
        })
      }

      // Filter deleted conversations BEFORE any hydration/state updates to avoid stale flash.
      const rawConversations = allConversations.filter(
        (conversation) => !deletedConversationIds.has(conversation.id)
      )

      const conversationIds = rawConversations.map((conversation) => conversation.id)
      let latestMessageByConversationId = {}
      let unreadMap = {}

      if (conversationIds.length > 0) {
        const { data: messageRows, error: messageError } = await supabase
          .from("messages")
          .select("*")
          .in("conversation_id", conversationIds)
          .order("created_at", { ascending: false })

        if (messageError) {
          console.warn("[Chat] Failed to load latest conversation messages:", messageError)
        } else {
          ;(messageRows || []).forEach((message) => {
            if (!latestMessageByConversationId[message.conversation_id]) {
              latestMessageByConversationId[message.conversation_id] = message
            }

            if (message.receiver_id === userId && message.is_read === false) {
              unreadMap[message.conversation_id] = (unreadMap[message.conversation_id] || 0) + 1
            }
          })
        }
      }

      const partnerIds = [
        ...new Set(
          rawConversations
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

      const hydrated = rawConversations.map((conversation) => {
        const partnerId = conversation.user1_id === userId ? conversation.user2_id : conversation.user1_id
        const latestMessage = latestMessageByConversationId[conversation.id]

        // Determine display content - show actual message preview if available
        let displayContent = ""
        
        if (!latestMessage) {
          displayContent = "No messages yet"
        } else if (latestMessage?.type === "image") {
          displayContent = "📷 Photo"
        } else if (latestMessage?.type === "file") {
          displayContent = "📎 File"
        } else if (latestMessage?.content?.trim()) {
          // Use plaintext content if available
          let content = latestMessage.content.trim()
          
          // Add "You: " prefix if sender is current user
          if (latestMessage.sender_id === userId) {
            content = `You: ${content}`
          }
          
          // Truncate to reasonable length for preview
          if (content.length > 50) {
            content = content.substring(0, 47) + "..."
          }
          
          displayContent = content
        } else if (latestMessage?.encrypted_content) {
          // For encrypted messages without plaintext, show nothing
          displayContent = ""
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
      })

      // Sort by latest message timestamp (most recent first)
      const sortedByTime = rawConversations.sort((a, b) => {
        const timeA = latestMessageByConversationId[a.id]?.created_at || a.created_at || 0
        const timeB = latestMessageByConversationId[b.id]?.created_at || b.created_at || 0
        return new Date(timeB) - new Date(timeA)
      })

      // Re-apply hydration after sorting
      const hydratedAndSorted = sortedByTime.map((conversation) => {
        const partnerId = conversation.user1_id === userId ? conversation.user2_id : conversation.user1_id
        const latestMessage = latestMessageByConversationId[conversation.id]

        let displayContent = ""
        
        if (!latestMessage) {
          displayContent = "No messages yet"
        } else if (latestMessage?.type === "image") {
          displayContent = "📷 Photo"
        } else if (latestMessage?.type === "file") {
          displayContent = "📎 File"
        } else if (latestMessage?.content?.trim()) {
          let content = latestMessage.content.trim()
          
          if (latestMessage.sender_id === userId) {
            content = `You: ${content}`
          }
          
          if (content.length > 50) {
            content = content.substring(0, 47) + "..."
          }
          
          displayContent = content
        } else if (latestMessage?.encrypted_content) {
          // For encrypted messages without plaintext, show nothing
          displayContent = ""
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
      })

      const sortedHydrated = sortConversationsByPriority(hydratedAndSorted, unreadMap)

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
      setConversations([])
    } finally {
      if (!silent) {
        setLoadingConversations(false)
      }
    }
  }, [cachedConversations.length, dispatchUnreadBadgeUpdate, fetchProfilesByIds, getMessageType, setConversationsCache, setUnreadCountsCache, shouldFetchConversations, sortConversationsByPriority])

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

    fetchConversations(contextUser.id, { silent: cachedConversations.length > 0 })
  }, [authReady, contextUser?.id, fetchConversations, cachedConversations.length])

  useEffect(() => {
    setCurrentChatIdCache(activeConversationId)
  }, [activeConversationId, setCurrentChatIdCache])

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
  }, [contextUser?.id, persistLastSeenNow, syncOnlineUsersFromPresence])

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
          console.warn("[Chat] Failed to refresh partner presence:", profileError)
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
    if (conversations.length === 0) {
      if (import.meta.env.DEV) {
        console.log("[Chat][RouteRestore] No conversations available yet")
      }
      setActiveConversationId(null)
      return
    }

    if (requestedConversationId) {
      const requestedExists = conversations.some((conversation) => conversation.id === requestedConversationId)
      if (requestedExists) {
        if (import.meta.env.DEV) {
          console.log("[Chat][RouteRestore] Restored direct conversation", { requestedConversationId })
        }
        setActiveConversationId(requestedConversationId)
        return
      }

      if (import.meta.env.DEV) {
        console.log("[Chat][RouteRestore] Direct conversation missing, falling back", {
          requestedConversationId,
          routeConversationId
        })
      }
      setActiveConversationId(null)

      if (routeConversationId) {
        navigate("/chat?tab=direct", { replace: true })
      }

      return
    }

    setActiveConversationId((prev) => {
      if (prev && conversations.some((conversation) => conversation.id === prev)) {
        return prev
      }

      return null
    })
  }, [conversations, navigate, requestedConversationId, routeConversationId])

  useEffect(() => {
    if (activeConversationId) {
      console.log("[Chat] messages fetch effect triggered for conversation:", activeConversationId)
      const cachedMessages = useChatStore.getState().messagesByConversationId[activeConversationId] || []
      if (cachedMessages.length > 0) {
        setMessages(cachedMessages)
      }
      // Clear stale keys from memory cache for this conversation
      delete conversationCryptoKeysRef.current[activeConversationId]
      // Clear cached image signed URLs when switching conversations
      signedImageUrlCacheRef.current = {}
      // Fetch fresh key from DB (overwrites any stale cache)
      getOrCreateConversationKey(activeConversationId)
        .then(() => {
          fetchMessages(activeConversationId, { silent: cachedMessages.length > 0 })
        })
        .catch((err) => {
          console.error("[Chat] Error loading conversation key:", err)
          fetchMessages(activeConversationId, { silent: cachedMessages.length > 0 })
        })
    }
  }, [activeConversationId, fetchMessages, getOrCreateConversationKey])

  useEffect(() => {
    closeConversationSearch()
  }, [activeConversationId, closeConversationSearch])

  useEffect(() => {
    if (!activeConversationId) return

    console.log("[Chat] Setting up reactions realtime subscription")

    // Clean up any existing channel first
    if (reactionsChannelRef.current) {
      console.log("[Chat] Cleaning up existing reactions channel before creating new one")
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
          console.log("[Chat] REACTION EVENT:", payload)

          const { eventType, new: newData, old: oldData } = payload

          if (eventType === "INSERT") {
            handleReactionInsert(newData)
          } else if (eventType === "DELETE") {
            handleReactionDelete(oldData)
          } else if (eventType === "UPDATE") {
            console.log("[Chat] UPDATE received:", newData)
            updateReactionInState(newData)
          }
        }
      )
      .subscribe((status) => {
        console.log("[Chat] Reactions channel status:", status)
      })

    reactionsChannelRef.current = reactionsChannel

    return () => {
      console.log("[Chat] Cleaning up reactions realtime channel")
      supabase.removeChannel(reactionsChannel)
      if (reactionsChannelRef.current === reactionsChannel) {
        reactionsChannelRef.current = null
      }
    }
  }, [activeConversationId])

  useEffect(() => {
    if (!activeConversationId) return
    setConversationTypingState(activeConversationId, false)
    console.log("[Chat] Creating active conversation realtime channel:", activeConversationId)

    const channel = supabase
      .channel(`chat-messages-${activeConversationId}`)
      .on(
        "broadcast",
        { event: "typing" },
        ({ payload }) => {
          if (!payload || payload.conversation_id !== activeConversationId) {
            return
          }

          if (!contextUser?.id || payload.user_id === contextUser.id) {
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
            handleReactionInsert(reaction)
            return
          }

          if (action === "UPDATE") {
            updateReactionInState(reaction)
            return
          }

          if (action === "DELETE") {
            handleReactionDelete(reaction)
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

          console.log("[Chat][Realtime] MESSAGE_RECEIVED", {
            conversationId: activeConversationId,
            messageId: nextMessage.id
          })

          console.log("[Chat] Active conversation INSERT event:", {
            messageId: nextMessage.id,
            sender: nextMessage.sender_id,
            receiver: nextMessage.receiver_id,
            hasEncryption: !!nextMessage.encrypted_content,
            conversation: activeConversationId
          })

          let decryptedContent = nextMessage.content
          
          // Decrypt encrypted content if present
          if (nextMessage.encrypted_content && nextMessage.iv) {
            try {
              const cryptoKey = await getConversationKeyFresh(activeConversationId)
              if (cryptoKey) {
                decryptedContent = await decrypt(nextMessage.encrypted_content, nextMessage.iv, cryptoKey)
              } else {
                console.warn("[Chat] Could not decrypt incoming message - no key available")
                decryptedContent = nextMessage.content || "[Encrypted message]"
              }
            } catch (decryptError) {
              console.warn("[Chat] Could not decrypt incoming message:", decryptError.message)
              // Fallback to plaintext or placeholder
              decryptedContent = nextMessage.content || "[Message content unavailable]"
            }
          }

          const normalizedNextMessage = {
            ...nextMessage,
            content: decryptedContent,
            type: getMessageType(nextMessage)
          }

          setMessages((prev) => {
            if (prev.some((item) => item.id === normalizedNextMessage.id)) {
              return prev
            }
            appendMessageToCache(activeConversationId, normalizedNextMessage)
            return [...prev, normalizedNextMessage]
          })

          // Update conversation list with new message preview (for both sender and receiver)
          setConversations((prev) => {
            // Format message for preview following same logic as hydration
            let displayContent = ""
            
            if (getMessageType(nextMessage) === "image") {
              displayContent = "📷 Photo"
            } else if (getMessageType(nextMessage) === "file") {
              displayContent = "📎 File"
            } else if (decryptedContent?.trim()) {
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
            
            const updated = prev.map((conversation) =>
              conversation.id === activeConversationId
                ? {
                    ...conversation,
                    last_message_content: displayContent,
                    last_message_type: getMessageType(nextMessage),
                    last_message_sender_id: nextMessage.sender_id,
                    last_message_is_read: nextMessage.is_read || false,
                    last_message_at: nextMessage.created_at || conversation.last_message_at
                  }
                : conversation
            )

            return sortConversationsByPriority(updated)
          })

          if (normalizedNextMessage.receiver_id === contextUser?.id && normalizedNextMessage.sender_id !== contextUser?.id) {
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

                clearUnreadForConversation(activeConversationId)
              })

            setMessages((prev) =>
              prev.map((message) =>
                message.id === normalizedNextMessage.id ? { ...message, is_read: true } : message
              )
            )

            // Also update conversation list to show message is read
            setConversations((prev) =>
              prev.map((conversation) =>
                conversation.id === activeConversationId && conversation.last_message_at === normalizedNextMessage.created_at
                  ? { ...conversation, last_message_is_read: true }
                  : conversation
              )
            )
          }
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

          console.log("[Chat] Message UPDATE event received - FULL PAYLOAD:", {
            payloadNew: updatedMessage,
            payloadOld: payload.old,
            deliveryStatus: updatedMessage.delivery_status,
            seen_at: updatedMessage.seen_at,
            is_read: updatedMessage.is_read,
            is_deleted: updatedMessage.is_deleted,
            edited_at: updatedMessage.edited_at,
            messageId: updatedMessage.id
          })

          let decryptedContent = updatedMessage.content
          
          // Decrypt encrypted content if present
          if (updatedMessage.encrypted_content && updatedMessage.iv) {
            try {
              const cryptoKey = await getConversationKeyFresh(activeConversationId)
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

          console.log("[Chat] Message state updated:", {
            messageId: updatedMessage.id,
            wasEdited: Boolean(updatedMessage.edited_at),
            wasDeleted: updatedMessage.is_deleted,
            wasSeen: Boolean(updatedMessage.seen_at)
          })

          // Update conversation preview if this is the last message
          setConversations((prev) => {
            const updated = prev.map((conversation) => {
              if (conversation.id !== activeConversationId) return conversation
              
              // If the updated message is the last message, update preview
              const isLastMessage = conversation.last_message_at === updatedMessage.created_at
              if (!isLastMessage) return conversation
              
              // Format message following same logic as hydration
              let displayContent = ""
              
              if (getMessageType(updatedMessage) === "image") {
                displayContent = "📷 Photo"
              } else if (getMessageType(updatedMessage) === "file") {
                displayContent = "📎 File"
              } else if (decryptedContent?.trim()) {
                let content = decryptedContent.trim()
                
                // Add "You: " prefix if current user sent it
                if (updatedMessage.sender_id === contextUser?.id) {
                  content = `You: ${content}`
                }
                
                // Truncate long previews
                if (content.length > 50) {
                  content = content.substring(0, 47) + "..."
                }
                
                displayContent = content
              }
              
              return {
                ...conversation,
                last_message_content: displayContent,
                last_message_type: getMessageType(updatedMessage),
                last_message_is_read: updatedMessage.is_read || false
              }
            })

            return sortConversationsByPriority(updated)
          })
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          activeConversationChannelRef.current = channel
          console.log("[Chat][Realtime] SUBSCRIBED", { conversationId: activeConversationId })
        }

        if (status === "CLOSED") {
          console.log("[Chat][Realtime] CHANNEL_CLOSED", { conversationId: activeConversationId })
        }
        console.log("[Chat] Realtime status:", status)
      })

    return () => {
      console.log("[Chat][Realtime] CHANNEL_CLOSED", { conversationId: activeConversationId })
      console.log("[Chat] Cleaning active conversation realtime channel:", activeConversationId)
      if (isTypingRef.current) {
        channel.send({
          type: "broadcast",
          event: "typing",
          payload: {
            conversation_id: activeConversationId,
            user_id: contextUser?.id,
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
  }, [activeConversationId, conversations, contextUser?.id, setConversationTypingState])

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
          console.log("Message updated:", payload)

          if (payload.new?.is_read === true) {
            updateMessageSeenStatusRef.current?.(payload.new.id)
          }
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          console.log("[Chat][Realtime] SUBSCRIBED", { channel: "messages-update" })
        }
        if (status === "CLOSED") {
          console.log("[Chat][Realtime] CHANNEL_CLOSED", { channel: "messages-update" })
        }
        console.log("[Chat] Message update subscription status:", status)
      })

    return () => {
      console.log("[Chat][Realtime] CHANNEL_CLOSED", { channel: "messages-update" })
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

    console.log("[Chat] markConversationMessagesAsRead called:", { conversationId, userId })

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

          console.log("[Chat] Receiver listener INSERT event:", {
            messageId: nextMessage.id,
            sender: nextMessage.sender_id,
            receiver: nextMessage.receiver_id,
            conversation: nextMessage.conversation_id,
            hasEncryption: !!nextMessage.encrypted_content
          })

          // Mark message as delivered to sender
          if (nextMessage.receiver_id === contextUser?.id) {
            markMessageAsDelivered(nextMessage.id)
          }

          // Get conversation to decrypt message if needed
          let decryptedContent = nextMessage.content
          
          if (nextMessage.encrypted_content && nextMessage.iv) {
            try {
              const cryptoKey = await getConversationKeyFresh(nextMessage.conversation_id)
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

          setConversations((prev) => {
            // Format message for preview following same logic as hydration
            let displayContent = ""
            
            if (getMessageType(nextMessage) === "image") {
              displayContent = "📷 Photo"
            } else if (getMessageType(nextMessage) === "file") {
              displayContent = "📎 File"
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
            
            const updated = prev.map((conversation) =>
              conversation.id === nextMessage.conversation_id
                ? {
                    ...conversation,
                    last_message_content: displayContent,
                    last_message_type: getMessageType(nextMessage),
                    last_message_at: nextMessage.created_at || conversation.last_message_at
                  }
                : conversation
            )

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
        console.log("[Chat] Unread sync status:", status)
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [activeConversationId, contextUser?.id, getMessageType, incrementUnreadForConversation, markConversationMessagesAsRead, markMessageAsDelivered, sortConversationsByPriority, getConversationKey])

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
            console.log(`[Chat] Signed URL expired for: ${message.storage_path}, will refresh on next view`)
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
      console.log(`[Chat] Image uploaded to private storage: ${storagePath}`)

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
                  last_message_at: sentMessage.created_at || new Date().toISOString()
                }
              : conversation
          )
          return sortConversationsByPriority(updated)
        })
      }

      console.log("[Chat] Image message sent successfully")
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

  const handleReactionSelect = async (messageId, emoji) => {
    if (!messageId || !emoji || !contextUser?.id) {
      return
    }

    try {
      const { data: existingReaction, error: existingError } = await supabase
        .from("message_reactions")
        .select("id, message_id, user_id, emoji")
        .eq("message_id", messageId)
        .eq("user_id", contextUser.id)
        .maybeSingle()

      if (existingError) {
        console.error("[Chat] Failed to check existing reaction:", existingError)
        setError("Failed to add reaction")
        return
      }

      if (existingReaction) {
        updateReactionInState({
          ...existingReaction,
          emoji
        })

        const { error: updateError } = await supabase
          .from("message_reactions")
          .update({ emoji })
          .eq("id", existingReaction.id)

        if (updateError) {
          console.error("[Chat] Failed to update reaction:", updateError)
          setError("Failed to update reaction")
          updateReactionInState(existingReaction)
          return
        }

        await broadcastReactionEvent("UPDATE", {
          ...existingReaction,
          emoji
        })
      } else {
        const optimisticReaction = {
          id: `temp-${contextUser.id}-${messageId}-${Date.now()}`,
          message_id: messageId,
          user_id: contextUser.id,
          emoji
        }

        addReactionToState(optimisticReaction)

        const { data: insertedReaction, error: insertError } = await supabase
          .from("message_reactions")
          .insert({
            message_id: messageId,
            user_id: contextUser.id,
            emoji
          })
          .select("id, message_id, user_id, emoji")
          .single()

        if (insertError) {
          console.error("[Chat] Failed to add reaction:", insertError)
          setError("Failed to add reaction")
          removeReactionFromState(optimisticReaction)
          return
        }

        removeReactionFromState(optimisticReaction)
        addReactionToState(insertedReaction || optimisticReaction)

        await broadcastReactionEvent("INSERT", insertedReaction || optimisticReaction)
      }

      setActiveReactionPickerMessageId(null)
    } catch (reactionError) {
      console.error("[Chat] Reaction error:", reactionError)
      setError("Failed to add reaction")
    }
  }

  const getReactionSummary = useCallback((messageId) => {
    const message = messages.find((m) => m.id === messageId)
    const rows = message?.reactions || []

    const byEmoji = new Map()

    rows.forEach((row) => {
      const current = byEmoji.get(row.emoji) || { count: 0, users: [], reactedByCurrentUser: false }

      const profileFromJoin = row.profiles || null
      const fallbackProfile = profilesById[row.user_id] || null
      const userName =
        profileFromJoin?.name ||
        profileFromJoin?.username ||
        fallbackProfile?.name ||
        fallbackProfile?.username ||
        "Unknown"

      current.count += 1
      current.users.push({
        reactionId: row.id,
        userId: row.user_id,
        name: userName,
        avatarUrl: profileFromJoin?.avatar_url || fallbackProfile?.avatar_url || null,
        isCurrentUser: row.user_id === contextUser?.id
      })
      if (row.user_id === contextUser?.id) {
        current.reactedByCurrentUser = true
      }
      byEmoji.set(row.emoji, current)
    })

    return Array.from(byEmoji.entries()).map(([emoji, value]) => ({
      emoji,
      count: value.count,
      users: value.users,
      reactedByCurrentUser: value.reactedByCurrentUser
    }))
  }, [contextUser?.id, profilesById, messages])

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
    setActiveMessageMenuId(null)
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
    setActiveMessageMenuId(null)
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
        setActiveMessageMenuId(null)
      }
    },
    [showSuccess, showToastError]
  )

  const handleDeleteMessage = useCallback((message) => {
    if (!message?.id) {
      return
    }

    setMessages((prev) => prev.filter((item) => item.id !== message.id))
    setActiveMessageMenuId(null)
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

      console.log("[Chat] Deleting message:", { messageId: message.id, deletePayload: updatePayload })

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
        console.log("[Chat] Message successfully deleted")
        showSuccess("Message unsent")
        
        // Delete image from private storage if it's an image message
        if (message.storage_path) {
          try {
            await deletePrivateImage(message.storage_path)
            console.log("[Chat] Image deleted from storage")
          } catch (deleteError) {
            console.warn("[Chat] Failed to delete image from storage:", deleteError)
          }
        }
      }
    },
    [contextUser?.id, editingMessage?.id, replyToMessage?.id, setDraftInputValue, showSuccess]
  )

  const handleRemoveReaction = async (messageId, emoji, userId, reactionId = null) => {
    if (!messageId || !emoji || !userId) {
      console.warn("[Chat] Missing required fields for remove reaction:", { messageId, emoji, userId })
      return
    }

    console.log("[Chat] Removing reaction:", {
      messageId,
      userId,
      emoji
    })

    try {
      // Optimistically remove from UI first
      const optimisticReaction = {
        message_id: messageId,
        user_id: userId,
        emoji,
        id: reactionId
      }

      removeReactionFromState(optimisticReaction)

      // Close modal immediately to show updated badges
      setReactionModalMessageId(null)

      // Delete from Supabase with safe criteria
      const { error: deleteError } = await supabase
        .from("message_reactions")
        .delete()
        .eq("message_id", messageId)
        .eq("user_id", userId)
        .eq("emoji", emoji)

      if (deleteError) {
        console.error("[Chat] Failed to remove reaction:", deleteError)
        setError("Failed to remove reaction")
        addReactionToState(optimisticReaction)
      } else {
        console.log("[Chat] Reaction removed successfully")
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
        const updated = prev.map((conversation) =>
          conversation.id === activeConversationId
            ? {
                ...conversation,
                last_message_content: `You: ${content}`,
                last_message_type: "text",
                last_message_sender_id: contextUser.id,
                last_message_is_read: false,
                last_message_at: optimisticCreatedAt,
              }
            : conversation
        )
        return sortConversationsByPriority(updated)
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
    if (!activeConversationId || !contextUser?.id) {
      console.log("[Chat] skipping markAsRead - missing:", { activeConversationId, userId: contextUser?.id })
      return
    }

    console.log("[Chat] useEffect calling markConversationMessagesAsRead:", { activeConversationId, userId: contextUser?.id })
    markConversationMessagesAsRead(activeConversationId, contextUser.id)
  }, [activeConversationId, contextUser?.id, markConversationMessagesAsRead])

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
      }

      if (!conversationId) {
        setError("Failed to open conversation")
        return
      }

      // Ensure conversation has an encryption key
      await getOrCreateConversationKey(conversationId)

      await fetchConversations(me)
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
        .select("id, group_id, sender_id, content, encrypted_content, iv, is_encrypted, created_at, reply_to_id")
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

      const profilesById = {}
      ;(profiles || []).forEach((p) => {
        profilesById[p.id] = p
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
            senderProfile: profilesById[msg.sender_id]
          }
        })
      )

      setGroupMessages(decryptedMessages)
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
        console.warn('[GroupChat] [RLS-FIX] Error checking group membership:', {
          groupId,
          authUserId: contextUser.id,
          error: error.message
        })
        return false
      }

      const isMember = (data && data.length > 0)
      console.log('[GroupChat] [RLS-FIX] Group membership validation:', {
        groupId,
        authUserId: contextUser.id,
        is_member: isMember,
        rls_requirement: 'User must be in group_members for auth.uid() to pass nested EXISTS check'
      })
      return isMember
    } catch (err) {
      console.warn('[GroupChat] [RLS-FIX] Exception validating group membership:', err)
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

      ;(reads || []).forEach((read) => {
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
      console.log('[GroupChat] Fetched read receipts for', messageIds.length, 'messages')
      return map
    } catch (err) {
      console.error('[GroupChat] Exception fetching message reads:', err)
    }
  }, [])

  const markGroupMessagesAsRead = useCallback(async (groupId, messageIds) => {
    if (!groupId || !messageIds || messageIds.length === 0) {
      console.warn('[GroupChat] markGroupMessagesAsRead: Missing groupId or messageIds')
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
      console.warn('[GroupChat] Exception marking messages as read:', {
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

            setGroupMessages((prev) => [
              ...prev,
              {
                ...newMessage,
                content,
                senderProfile: senderProfile
              }
            ])

            setTimeout(() => {
              groupBottomRef.current?.scrollIntoView({ behavior: "smooth" })
            }, 0)
          }
        )
        .subscribe()

      // Subscribe to message reactions in real-time
      const reactionsChannel = supabase
        .channel(`group-reactions-${group.id}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "group_message_reactions"
          },
          async (payload) => {
            const { data: curMessages } = await supabase
              .from('group_messages')
              .select('id')
              .eq('group_id', group.id)
            
            if (curMessages && curMessages.length > 0) {
              const messageIds = curMessages.map(m => m.id)
              await fetchGroupMessageReactions(messageIds)
            }
          }
        )
        .subscribe()

      groupMessagesChannelRef.current = channel
      groupReactionsChannelRef.current = reactionsChannel

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
            console.log("[Chat] group_message_reads INSERT received:", payload)
            const ids = groupMessages.map((m) => m.id)

            if (ids.length) {
              console.log("[Chat] Fetching message reads for", ids.length, "messages")
              await fetchGroupMessageReads(ids)
            }
          }
        )
        .subscribe()
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

  // Issue 3: Calculate and sync unread counts
  const unreadDirectCount = useMemo(() => {
    const count = Object.values(unreadCountsByConversation).filter(count => count > 0).length
    return count
  }, [unreadCountsByConversation])

  const unreadGroupCount = useMemo(() => {
    const count = Object.values(unreadGroupCountsByGroup).filter((value) => value > 0).length
    return count
  }, [unreadGroupCountsByGroup])

  const totalUnreadChatCount = unreadDirectCount + unreadGroupCount

  const visibleConversations = useMemo(() => {
    return conversations.filter((conversation) => {
      const preference = conversationPreferencesById[conversation.id]
      const archived = isPreferenceArchived(preference)
      const deleted = isPreferenceDeleted(preference)

      if (deleted) return false
      if (directSidebarView === CHAT_LIST_VIEW.ARCHIVED) return archived
      return !archived
    })
  }, [conversations, conversationPreferencesById, directSidebarView, isPreferenceArchived, isPreferenceDeleted, CHAT_LIST_VIEW.ARCHIVED])

  const archivedConversationCount = useMemo(() => {
    return conversations.filter((conversation) => {
      const preference = conversationPreferencesById[conversation.id]
      return isPreferenceArchived(preference) && !isPreferenceDeleted(preference)
    }).length
  }, [conversations, conversationPreferencesById, isPreferenceArchived, isPreferenceDeleted])

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
    console.log("[Chat] Dispatching unread count update:", {
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

      console.log("[GroupChat] Preparing to send message", {
        group_id: activeGroupId,
        sender_id: contextUser.id,
        content_length: groupDraft.length
      })

      const cryptoKey = await importKey(activeGroup.encryption_key)
      const encrypted = await encrypt(groupDraft, cryptoKey)

      console.log("[GroupChat] Message encrypted successfully", {
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

      console.log("[GroupChat] Inserting message with payload:", {
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

      console.log("[GroupChat] Message inserted successfully:", insertedData)

      // Save draft before clearing
      const sentContent = groupDraft.trim()

      // Optimistic update: immediately append message to UI with plaintext content
      if (insertedData && insertedData.length > 0) {
        const newMessageId = insertedData[0].id
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
        // Initialize empty read state for new message
        setGroupMessageReads((prev) => ({
          ...prev,
          [newMessageId]: []
        }))
        console.log("[GroupChat] Optimistically updated message list with new message, initialized read state")
      }

      // Fire-and-forget: Update last message timestamp in group (non-blocking)
      ;(async () => {
        try {
          const { error: updateError } = await supabase
            .from("group_conversations")
            .update({
              last_message_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })
            .eq("id", activeGroupId)

          if (updateError) {
            console.warn("[GroupChat] Warning: Failed to update group last_message_at (non-blocking):", updateError)
          }
        } catch (err) {
          console.warn("[GroupChat] Warning: Exception updating group last_message_at (non-blocking):", err)
        }
      })()

      // ONLY clear draft after successful insert
      setGroupDraft("")
      setGroupReplyTo(null)
      console.log("[GroupChat] Message sent successfully, draft cleared")
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
      console.log('[GroupChat] Creating group as user:', userId)

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
      console.log('[GroupChat] Inserting group with payload:', { ...insertPayload, encryption_key: '[REDACTED]' })

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

      console.log('[GroupChat] Group created:', newGroup.id)

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
    if (messageIds.length === 0) return
    try {
      const { data: reactions, error } = await supabase
        .from('group_message_reactions')
        .select('message_id, user_id, reaction')
        .in('message_id', messageIds)

      if (error) {
        console.error('[GroupChat] Error fetching reactions:', error)
        return
      }

      const reactionsMap = {}
      reactions.forEach((r) => {
        if (!reactionsMap[r.message_id]) {
          reactionsMap[r.message_id] = []
        }
        reactionsMap[r.message_id].push({ user_id: r.user_id, reaction: r.reaction })
      })
      setGroupMessageReactions(reactionsMap)
    } catch (err) {
      console.error('[GroupChat] Exception fetching reactions:', err)
    }
  }, [])

  // Add/toggle group message reaction
  const handleAddGroupReaction = useCallback(async (messageId, reaction) => {
    if (!contextUser?.id || !activeGroupId) return

    try {
      const reactions = groupMessageReactions[messageId] || []
      const existingReaction = reactions.find(
        (r) => r.user_id === contextUser.id && r.reaction === reaction
      )

      if (existingReaction) {
        // Delete reaction
        const { error } = await supabase
          .from('group_message_reactions')
          .delete()
          .eq('message_id', messageId)
          .eq('user_id', contextUser.id)
          .eq('reaction', reaction)

        if (error) {
          console.error('[GroupChat] Error removing reaction:', error)
          showToastError('Failed to remove reaction')
          return
        }

        // Update local state
        const updated = reactions.filter(
          (r) => !(r.user_id === contextUser.id && r.reaction === reaction)
        )
        setGroupMessageReactions((prev) => ({
          ...prev,
          [messageId]: updated.length > 0 ? updated : undefined
        }))
      } else {
        // Add reaction
        const { error } = await supabase
          .from('group_message_reactions')
          .insert({ message_id: messageId, user_id: contextUser.id, reaction })

        if (error) {
          console.error('[GroupChat] Error adding reaction:', error)
          showToastError('Failed to add reaction')
          return
        }

        // Update local state
        setGroupMessageReactions((prev) => ({
          ...prev,
          [messageId]: [...(prev[messageId] || []), { user_id: contextUser.id, reaction }]
        }))
      }
    } catch (err) {
      console.error('[GroupChat] Exception toggling reaction:', err)
      showToastError('Failed to update reaction')
    }
  }, [contextUser?.id, activeGroupId, groupMessageReactions, showToastError])

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
    setActiveGroupMessageMenuId(null)
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

      // Update last message timestamp in group (do NOT store plaintext caption/preview)
      await supabase
        .from('group_conversations')
        .update({
          last_message_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', activeGroupId)

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
  }, [activeGroupId, chatMode, contextUser?.id, fetchUnreadGroupCounts, groups])

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

  // Handle click outside of group message menus to close them
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (groupMessagesContainerRef.current && !groupMessagesContainerRef.current.contains(event.target)) {
        setActiveGroupEmojiPickerMessageId(null)
        setActiveGroupMessageMenuId(null)
      }
    }

    if (activeGroupEmojiPickerMessageId || activeGroupMessageMenuId) {
      document.addEventListener("mousedown", handleClickOutside)
      return () => document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [activeGroupEmojiPickerMessageId, activeGroupMessageMenuId])

  // Handle click outside of direct message menus to close them
  useEffect(() => {
    const handleClickOutside = (event) => {
      const interactiveNode = event.target?.closest?.("[data-direct-message-interactive='true']")
      if (interactiveNode) return

      setActiveReactionPickerMessageId(null)
      setActiveMessageMenuId(null)
    }

    if (activeReactionPickerMessageId || activeMessageMenuId) {
      document.addEventListener("mousedown", handleClickOutside)
      document.addEventListener("touchstart", handleClickOutside)
      return () => {
        document.removeEventListener("mousedown", handleClickOutside)
        document.removeEventListener("touchstart", handleClickOutside)
      }
    }
  }, [activeReactionPickerMessageId, activeMessageMenuId])

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
      const updated = await upsertConversationPreference(conversationId, { is_deleted: true, is_archived: false })
      if (!updated) {
        showToastError("Failed to delete conversation")
        return
      }

      if (activeConversationId === conversationId) {
        navigateToConversation(null, { replace: true })
      }

      setOpenConversationOptionsId(null)
      showSuccess("Conversation removed")
    },
    [activeConversationId, navigateToConversation, showSuccess, showToastError, upsertConversationPreference]
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


  return (
    <div className="chat-theme mx-auto flex h-full max-h-full min-w-0 w-full max-w-[1280px] flex-col overflow-hidden px-1.5 pt-2 pb-1 sm:px-2 md:px-3 text-[var(--chat-text)]">
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
              className={`relative flex-1 rounded-[7px] py-[7px] text-center font-['DM_Sans'] text-[12px] font-semibold transition-colors ${
                chatMode === "direct"
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
              className={`relative flex-1 rounded-[7px] py-[7px] text-center font-['DM_Sans'] text-[12px] font-semibold transition-colors ${
                chatMode === "groups"
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
                  className={`rounded-[7px] px-2 py-1 font-['DM_Sans'] text-[11px] font-semibold transition ${
                    directSidebarView === CHAT_LIST_VIEW.ACTIVE
                      ? "bg-[var(--chat-accent)] text-[var(--chat-surface)]"
                      : "text-[var(--chat-text-muted)] hover:text-[var(--chat-text-subtle)]"
                  }`}
                >
                  Chats
                </button>
                <button
                  type="button"
                  onClick={() => setDirectSidebarView(CHAT_LIST_VIEW.ARCHIVED)}
                  className={`rounded-[7px] px-2 py-1 font-['DM_Sans'] text-[11px] font-semibold transition ${
                    directSidebarView === CHAT_LIST_VIEW.ARCHIVED
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
                      className={`w-full rounded-[12px] px-[10px] py-[9px] pr-10 text-left transition-all duration-150 ${
                        isActive
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
                      className={`absolute right-2 top-2.5 z-10 inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--chat-border)] bg-[var(--chat-elev)] text-[var(--chat-text-subtle)] shadow-sm transition hover:bg-[var(--chat-hover)] ${
                        openConversationOptionsId === conversation.id ? "opacity-100" : "opacity-100 lg:opacity-0 lg:group-hover:opacity-100"
                      }`}
                      aria-label="Conversation options"
                    >
                      <MoreHorizontal className="h-3.5 w-3.5" />
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
                    className={`flex-1 rounded-[7px] px-2 py-1 font-['DM_Sans'] text-[11px] font-semibold transition ${
                      groupSidebarView === CHAT_LIST_VIEW.ACTIVE
                        ? "bg-[var(--chat-accent)] text-[var(--chat-surface)]"
                        : "text-[var(--chat-text-muted)] hover:text-[var(--chat-text-subtle)]"
                    }`}
                  >
                    Groups
                  </button>
                  <button
                    type="button"
                    onClick={() => setGroupSidebarView(CHAT_LIST_VIEW.ARCHIVED)}
                    className={`flex-1 rounded-[7px] px-2 py-1 font-['DM_Sans'] text-[11px] font-semibold transition ${
                      groupSidebarView === CHAT_LIST_VIEW.ARCHIVED
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
                            className={`w-full rounded-[12px] px-[10px] py-[9px] pr-10 text-left transition-all duration-150 ${
                              isActive ? "border-l-[3px] border-[var(--chat-accent)] bg-[var(--chat-hover)] pl-[7px]" : "hover:bg-[var(--chat-elev)]"
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
                            className={`absolute right-2 top-2.5 z-10 inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--chat-border)] bg-[var(--chat-elev)] text-[var(--chat-text-subtle)] shadow-sm transition hover:bg-[var(--chat-hover)] ${
                              openGroupOptionsId === group.id ? "opacity-100" : "opacity-100 lg:opacity-0 lg:group-hover:opacity-100"
                            }`}
                            aria-label="Group options"
                          >
                            <MoreHorizontal className="h-3.5 w-3.5" />
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
              <div className="flex items-center gap-2">
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
                <div>
                <h2 className="font-['Sora'] text-base font-semibold text-[var(--chat-text)]">
                  {activeConversation ? getDisplayName(activeConversationPartner) : "Select a conversation"}
                </h2>
                {activeConversation && (
                  <p className="mt-1.5 font-['DM_Sans'] text-xs text-[var(--chat-text-subtle)]">{activeConversationStatus}</p>
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
              <p className="font-['DM_Sans'] text-sm text-[var(--chat-text-subtle)]">Select a conversation to start chatting</p>
            ) : loadingMessages ? (
              <div className="space-y-3">
                {Array.from({ length: 6 }).map((_, index) => (
                  <div key={index} className="h-10 animate-pulse rounded-lg bg-[var(--chat-elev)]" />
                ))}
              </div>
            ) : messages.length === 0 ? (
              <p className="font-['DM_Sans'] text-sm text-[var(--chat-text-subtle)]">No messages yet. Send the first one.</p>
            ) : (
              messages.map((message) => {
                const mine = message.sender_id === contextUser?.id
                const messageTickState = getPrivateMessageTickState(message)
                
                const senderProfile = profilesById[message.sender_id]
                const imageUrl = loadedImageUrls[message.id] || null
                const isImageMessage = Boolean(imageUrl) || getMessageType(message) === "image"
                const isDeletedMessage = message.is_deleted === true
                const isForwardedMessage = message.is_forwarded === true
                const reactionSummary = getReactionSummary(message.id)
                const isReactionPickerOpen = activeReactionPickerMessageId === message.id
                const isMessageMenuOpen = activeMessageMenuId === message.id
                const canReplyMessage = !isDeletedMessage
                const canReactMessage = !isDeletedMessage
                const canForwardMessage = !isDeletedMessage
                const canCopyMessage = !isDeletedMessage && Boolean(message.content || imageUrl)
                const canEditMessage = mine && !isDeletedMessage && !isImageMessage
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
                        <div className="mb-1.5 rounded-[4px] border-l-[3px] border-[var(--chat-accent)] bg-[rgba(244,180,0,0.10)] px-2 py-1 font-['DM_Sans'] text-xs italic text-[var(--chat-text-subtle)]">
                          {!repliedMessage ? (
                            <span className="italic text-[var(--chat-text-muted)]">Original message unavailable</span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                const element = document.getElementById(`message-${repliedMessage.id}`)
                                element?.scrollIntoView({ behavior: "smooth", block: "center" })
                              }}
                              className="w-full text-left transition hover:text-[var(--chat-text)]"
                            >
                              <p className="font-['Sora'] font-semibold text-[var(--chat-text)]">{getDisplayName(profilesById[repliedMessage.sender_id])}</p>
                              <p className="line-clamp-1 font-['DM_Sans'] italic text-[var(--chat-text-subtle)]">{repliedMessage.content || "[Image]"}</p>
                            </button>
                          )}
                        </div>
                      )}
                      <div
                        id={`message-${message.id}`}
                        data-direct-message-interactive="true"
                        className={`relative w-fit cursor-pointer ${
                          isMatchedMessage
                            ? isActiveMatchedMessage
                              ? "ring-2 ring-[var(--chat-accent)]/70 ring-offset-2 ring-offset-[var(--chat-bg)]"
                              : "ring-1 ring-[var(--chat-accent)]/50 ring-offset-1 ring-offset-[var(--chat-bg)]"
                            : ""
                        }`}
                        onClick={() => {
                          if (isMobileView) {
                            setActiveMessageMenuId((prev) => (prev === message.id ? null : message.id))
                            setActiveReactionPickerMessageId(null)
                            return
                          }

                          setActiveReactionPickerMessageId((prev) => (prev === message.id ? null : message.id))
                          setActiveMessageMenuId(null)
                        }}
                        onTouchStart={(event) => {
                          startDirectMessageLongPress(message.id)
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
                            setActiveMessageMenuId(message.id)
                            setActiveReactionPickerMessageId(null)
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
                              setActiveMessageMenuId(null)
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
                              onClick={(e) => {
                                e.stopPropagation()
                                setActiveMessageMenuId((prev) => (prev === message.id ? null : message.id))
                                setActiveReactionPickerMessageId(null)
                              }}
                              className="pointer-events-auto inline-flex h-7 w-7 items-center justify-center rounded-full border border-[var(--chat-border)] bg-[var(--chat-surface)] text-[var(--chat-text-subtle)] shadow-sm transition hover:bg-[var(--chat-elev)]"
                              title="More options"
                              aria-label="Open message options"
                            >
                              <MoreHorizontal className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>

                        {isMessageMenuOpen && canShowActionTrigger && (
                          <div
                            data-direct-message-interactive="true"
                            className={`absolute z-40 top-full mt-2 ${mine ? "right-0" : "left-0"} min-w-[190px] rounded-xl border border-[var(--chat-border)] bg-[var(--chat-surface)]/95 p-1.5 text-[var(--chat-text)] shadow-2xl backdrop-blur transition-all duration-150`}
                            onClick={(event) => event.stopPropagation()}
                          >
                            <button
                              type="button"
                              onClick={() => {
                                handleReply(message)
                                setActiveMessageMenuId(null)
                              }}
                              disabled={!canReplyMessage}
                              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left font-['DM_Sans'] text-xs transition hover:bg-[var(--chat-elev)] disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <Reply className="h-3.5 w-3.5" />
                              Reply
                            </button>

                            <button
                              type="button"
                              onClick={() => handleCopyMessage(message)}
                              disabled={!canCopyMessage}
                              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left font-['DM_Sans'] text-xs transition hover:bg-[var(--chat-elev)] disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <Copy className="h-3.5 w-3.5" />
                              {isImageMessage && !message.content ? "Copy image link" : "Copy"}
                            </button>

                            {canEditMessage && (
                              <button
                                type="button"
                                onClick={() => {
                                  handleStartEditingMessage(message)
                                  setActiveMessageMenuId(null)
                                }}
                                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left font-['DM_Sans'] text-xs transition hover:bg-[var(--chat-elev)]"
                              >
                                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                </svg>
                                Edit
                              </button>
                            )}

                            {canForwardMessage && (
                              <button
                                type="button"
                                onClick={() => {
                                  openForwardModal(message)
                                  setActiveMessageMenuId(null)
                                }}
                                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left font-['DM_Sans'] text-xs transition hover:bg-[var(--chat-elev)]"
                              >
                                <Forward className="h-3.5 w-3.5" />
                                Forward
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => {
                                setActiveReactionPickerMessageId((prev) => (prev === message.id ? null : message.id))
                                setActiveMessageMenuId(null)
                              }}
                              disabled={!canReactMessage}
                              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left font-['DM_Sans'] text-xs transition hover:bg-[var(--chat-elev)] disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <SmilePlus className="h-3.5 w-3.5" />
                              React
                            </button>

                            {canUnsendMessage && (
                              <button
                                type="button"
                                onClick={() => {
                                  handleUnsendMessage(message)
                                  setActiveMessageMenuId(null)
                                }}
                                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-red-300 transition hover:bg-red-900/40"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                Unsend
                              </button>
                            )}

                            {canDeleteMessage && (
                              <button
                                type="button"
                                onClick={() => {
                                  handleDeleteMessage(message)
                                  setActiveMessageMenuId(null)
                                }}
                                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-red-300 transition hover:bg-red-900/40"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                Delete
                              </button>
                            )}
                          </div>
                        )}

                        {isReactionPickerOpen && (
                          <div data-direct-message-interactive="true" className={`absolute z-20 ${mine ? "right-0" : "left-0"} -top-12 flex items-center gap-1 rounded-full border border-[var(--chat-border-strong)] bg-[var(--chat-elev)] px-2 py-1 shadow-md`}>
                            {REACTION_EMOJIS.map((emoji) => (
                              <button
                                key={emoji}
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation()
                                  handleReactionSelect(message.id, emoji)
                                }}
                                className="rounded-full p-1 text-sm transition hover:bg-[var(--chat-hover)]"
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
                                onClick={(event) => {
                                  event.stopPropagation()
                                  setActiveMessageMenuId((prev) => (prev === message.id ? null : message.id))
                                  setActiveReactionPickerMessageId(null)
                                }}
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
                            {message.content && (
                              <p className="border-t border-[var(--chat-border)] px-2.5 py-2 font-['DM_Sans'] text-[13px] text-[var(--chat-text)]">
                                {renderHighlightedMessageText(message.content, message.id)}
                              </p>
                            )}
                          </div>
                        ) : (
                          <div
                            className={`w-fit max-w-sm md:max-w-xs px-[13px] py-[9px] font-['DM_Sans'] text-[13px] leading-[1.55] ${
                              mine ? "rounded-[16px_16px_4px_16px] bg-[var(--chat-accent)] text-[var(--chat-surface)]" : "rounded-[16px_16px_16px_4px] bg-[var(--chat-hover)] text-[var(--chat-text)]"
                            }`}
                          >
                            <p className="whitespace-pre-wrap break-words">
                              {renderHighlightedMessageText(message.content, message.id)}
                            </p>
                          </div>
                        )}
                      </div>

                      {!isDeletedMessage && reactionSummary.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {reactionSummary.map((item) => (
                            <button
                              key={`${message.id}-${item.emoji}`}
                              type="button"
                              onClick={() => setReactionModalMessageId(message.id)}
                              className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px] ${
                                item.reactedByCurrentUser
                                  ? "border-[var(--chat-border-strong)] bg-[var(--chat-elev)] text-[var(--chat-text)]"
                                  : "border-[var(--chat-border-strong)] bg-[var(--chat-elev)] text-[var(--chat-text-subtle)]"
                              }`}
                            >
                              <span>{item.emoji}</span>
                              <span>{item.count}</span>
                            </button>
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
                            className={`inline-flex items-center text-[12px] font-semibold tracking-[-0.08em] ${
                              messageTickState === "read" ? "text-[var(--chat-tick-read)]" : "text-[var(--chat-tick)]"
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
            )}
            <div ref={bottomRef} />
          </div>

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
                  <p className="truncate font-['DM_Sans'] text-xs text-[var(--chat-text-subtle)]">{editingMessage.content || "[Message]"}</p>
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
              <div className="mb-2 flex items-center justify-between gap-2 rounded-lg border border-[var(--chat-border-strong)] bg-[var(--chat-elev)] px-2.5 py-2">
                <div className="min-w-0 flex-1">
                  <p className="font-['DM_Sans'] text-[11px] font-semibold text-[var(--chat-text-subtle)]">Replying to {getDisplayName(profilesById[replyToMessage.sender_id])}</p>
                  <p className="truncate font-['DM_Sans'] text-xs text-[var(--chat-text)]">{replyToMessage.content || "[Image]"}</p>
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
                  setActiveGroupMessageMenuId(null)
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
                    const messageReactions = groupMessageReactions[message.id] || []
                    const reactionSummary = {}
                    messageReactions.forEach((r) => {
                      reactionSummary[r.reaction] = (reactionSummary[r.reaction] || 0) + 1
                    })
                    const isDeleted = message.is_deleted
                    const isImage = message.type === 'image'
                    const repliedTo = message.reply_to_id ? groupMessagesById.get(message.reply_to_id) : null
                    const isReactionPickerOpen = activeGroupEmojiPickerMessageId === message.id
                    const isMessageMenuOpen = activeGroupMessageMenuId === message.id
                    const canReplyMessage = !isDeleted
                    const canReactMessage = !isDeleted
                    const canForwardMessage = !isDeleted
                    const canCopyMessage = !isDeleted && Boolean(message.content || message.storage_path)
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

                          {/* Reply preview */}
                          {message.reply_to_id && (
                            <div className="mb-1.5 border-l-2 border-[var(--chat-border-strong)] border-[var(--chat-border-strong)] bg-[var(--chat-elev)] px-2 py-1 text-xs text-[var(--chat-text-subtle)]">
                              {repliedTo ? (
                                <>
                                  <p className="font-semibold text-[var(--chat-text)]">
                                    {repliedTo.senderProfile?.name || repliedTo.senderProfile?.username || "Unknown"}
                                  </p>
                                  <p className="line-clamp-1 italic text-[var(--chat-text-subtle)]">{repliedTo.content || "[Image]"}</p>
                                </>
                              ) : (
                                <>
                                  <p className="font-semibold text-[var(--chat-text)]">Reply</p>
                                  <p className="line-clamp-1 italic text-[var(--chat-text-muted)]">Original message unavailable</p>
                                </>
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
                              setActiveGroupMessageMenuId(null)
                            }}
                            onTouchStart={() => startGroupMessageLongPress(message.id)}
                            onTouchEnd={cancelGroupMessageLongPress}
                            onTouchCancel={cancelGroupMessageLongPress}
                            onTouchMove={cancelGroupMessageLongPress}
                            onContextMenu={(event) => {
                              event.preventDefault()
                              if (isMobileView) {
                                setActiveGroupMessageMenuId(message.id)
                                setActiveGroupEmojiPickerMessageId(null)
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
                                  setActiveGroupMessageMenuId(null)
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
                                  setActiveGroupMessageMenuId(null)
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
                                    setActiveGroupMessageMenuId((prev) => (prev === message.id ? null : message.id))
                                    setActiveGroupEmojiPickerMessageId(null)
                                  }}
                                  className="pointer-events-auto inline-flex h-7 w-7 items-center justify-center rounded-full border border-[var(--chat-border)] bg-[var(--chat-surface)] text-[var(--chat-text-subtle)] shadow-sm transition hover:bg-[var(--chat-elev)]"
                                  title="More options"
                                  aria-label="Open message options"
                                >
                                  <MoreHorizontal className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>

                            {isMessageMenuOpen && canShowActionTrigger && (
                              <div
                                className={`absolute z-40 top-full mt-2 ${isOwn ? "right-0" : "left-0"} min-w-[190px] rounded-xl border border-[var(--chat-border)] bg-[var(--chat-surface)]/95 p-1.5 text-[var(--chat-text)] shadow-2xl backdrop-blur transition-all duration-150`}
                                onClick={(event) => event.stopPropagation()}
                              >
                                <button
                                  type="button"
                                  onClick={() => {
                                    setGroupReplyTo(message)
                                    setActiveGroupMessageMenuId(null)
                                  }}
                                  disabled={!canReplyMessage}
                                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition hover:bg-[var(--chat-elev)] disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  <Reply className="h-3.5 w-3.5" />
                                  Reply
                                </button>

                                <button
                                  type="button"
                                  onClick={() => {
                                    handleCopyGroupMessage(message)
                                    setActiveGroupMessageMenuId(null)
                                  }}
                                  disabled={!canCopyMessage}
                                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition hover:bg-[var(--chat-elev)] disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  <Copy className="h-3.5 w-3.5" />
                                  {isImage && !message.content ? "Copy image link" : "Copy"}
                                </button>

                                <button
                                  type="button"
                                  onClick={() => {
                                    handleForwardGroupMessage(message)
                                    setActiveGroupMessageMenuId(null)
                                  }}
                                  disabled={!canForwardMessage}
                                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition hover:bg-[var(--chat-elev)] disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  <Forward className="h-3.5 w-3.5" />
                                  Forward
                                </button>

                                <button
                                  type="button"
                                  onClick={() => {
                                    setActiveGroupEmojiPickerMessageId((prev) => (prev === message.id ? null : message.id))
                                    setActiveGroupMessageMenuId(null)
                                  }}
                                  disabled={!canReactMessage}
                                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition hover:bg-[var(--chat-elev)] disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  <SmilePlus className="h-3.5 w-3.5" />
                                  React
                                </button>

                                {canDeleteMessage && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setDeleteGroupConfirmationMessage(message)
                                      setActiveGroupMessageMenuId(null)
                                    }}
                                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-red-300 transition hover:bg-red-900/40"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                    Delete
                                  </button>
                                )}

                                <button
                                  type="button"
                                  onClick={() => {
                                    setGroupMessageInfoModalId(message.id)
                                    setActiveGroupMessageMenuId(null)
                                  }}
                                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition hover:bg-[var(--chat-elev)]"
                                >
                                  <Info className="h-3.5 w-3.5" />
                                  Message info
                                </button>
                              </div>
                            )}

                            {isReactionPickerOpen && (
                              <div className={`absolute z-20 ${isOwn ? "right-0" : "left-0"} -top-12 flex items-center gap-1 rounded-full border border-[var(--chat-border)] bg-[var(--chat-surface)] px-2 py-1 shadow-md`}>
                                {REACTION_EMOJIS.map((emoji) => (
                                  <button
                                    key={emoji}
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation()
                                      handleAddGroupReaction(message.id, emoji)
                                      setActiveGroupEmojiPickerMessageId(null)
                                    }}
                                    className="rounded-full p-1 text-sm transition hover:bg-[var(--chat-elev)]"
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
                                className={`relative w-full rounded-2xl px-3 py-2.5 text-sm shadow-sm ${
                                  isOwn
                                    ? "bg-[var(--chat-accent)] text-[var(--chat-surface)]"
                                    : "bg-[var(--chat-elev)] text-[var(--chat-text)]"
                                }`}
                              >
                                <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{message.content}</p>
                              </div>
                            )}
                          </div>

                          {/* Reactions display */}
                          {Object.keys(reactionSummary).length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {Object.entries(reactionSummary).map(([emoji, count]) => (
                                <button
                                  key={emoji}
                                  onClick={() => handleAddGroupReaction(message.id, emoji)}
                                  type="button"
                                  className="inline-flex items-center gap-1 rounded-full border border-[var(--chat-border)] bg-[var(--chat-surface)] px-2 py-1 text-xs text-[var(--chat-text)] hover:bg-[var(--chat-elev)] transition whitespace-nowrap"
                                  title={`${count} ${count === 1 ? 'reaction' : 'reactions'}`}
                                >
                                  <span className="text-sm">{emoji}</span>
                                  <span className="text-[var(--chat-text-subtle)] font-medium">{count}</span>
                                </button>
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
                    <p className="truncate text-xs text-[var(--chat-accent)]/80">{editingGroupMessage.content || "[Message]"}</p>
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
                      className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left transition ${
                        isSelected
                          ? "border-[var(--chat-border-strong)] bg-[var(--chat-accent-soft)]"
                          : "border-[var(--chat-border)] bg-[var(--chat-surface)] hover:bg-[var(--chat-elev)]"
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-[var(--chat-text)]">{displayName}</p>
                        <p className="truncate text-xs text-[var(--chat-text-subtle)]">@{conversation.partner?.username || "unknown"}</p>
                      </div>
                      <span
                        className={`ml-3 inline-flex h-5 w-5 items-center justify-center rounded-full border text-[11px] ${
                          isSelected
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
          groups={reactionModalMessageId ? getReactionSummary(reactionModalMessageId) : []}
          onClose={() => setReactionModalMessageId(null)}
          onRemoveReaction={handleRemoveReaction}
        />
      </Suspense>
    </div>
  )
}

