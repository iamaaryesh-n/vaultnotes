import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { supabase } from "../lib/supabase"
import ReactionModal from "../components/ReactionModal"
import dayjs from "dayjs"
import relativeTime from "dayjs/plugin/relativeTime"
import utc from "dayjs/plugin/utc"

dayjs.extend(relativeTime)
dayjs.extend(utc)

export default function Chat() {
  const MAX_IMAGE_SIZE = 5 * 1024 * 1024
  const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"]
  const REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "😡"]

  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [currentUser, setCurrentUser] = useState(null)
  const [conversations, setConversations] = useState([])
  const [activeConversationId, setActiveConversationId] = useState(null)
  const [messages, setMessages] = useState([])
  const [profilesById, setProfilesById] = useState({})
  const [draft, setDraft] = useState("")
  const [loadingConversations, setLoadingConversations] = useState(true)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [sending, setSending] = useState(false)
  const [userSearchQuery, setUserSearchQuery] = useState("")
  const [userSearchResults, setUserSearchResults] = useState([])
  const [userSearchLoading, setUserSearchLoading] = useState(false)
  const [startingConversationUserId, setStartingConversationUserId] = useState(null)
  const [error, setError] = useState("")
  const [uploadingImage, setUploadingImage] = useState(false)
  const [imagePreviewUrl, setImagePreviewUrl] = useState("")
  const [activeReactionPickerMessageId, setActiveReactionPickerMessageId] = useState(null)
  const [reactionModalMessageId, setReactionModalMessageId] = useState(null)
  const [presenceNow, setPresenceNow] = useState(Date.now())
  const [unreadCountsByConversation, setUnreadCountsByConversation] = useState({})
  const [typingByConversation, setTypingByConversation] = useState({})
  const [onlineUsersById, setOnlineUsersById] = useState({})
  const [replyToMessage, setReplyToMessage] = useState(null)

  const bottomRef = useRef(null)
  const inputRef = useRef(null)
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
  const requestedConversationId = searchParams.get("conversation")

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

  const fetchProfilesByIds = useCallback(async (userIds) => {
    const ids = [...new Set((userIds || []).filter(Boolean))]
    if (ids.length === 0) return []

    const { data, error: profileError } = await supabase
      .from("profiles")
      .select("id, username, avatar_url, name, last_seen")
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

  const getMessageType = useCallback((message) => {
    if (message?.type) {
      return message.type
    }

    return message?.media_url ? "image" : "text"
  }, [])

  const getImageMessageUrl = useCallback((message) => {
    if (!message || getMessageType(message) !== "image") {
      return ""
    }

    return message.media_url || ""
  }, [getMessageType])

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
      const partnerId = activeConversationPartner?.id
      const isPartnerOnline = partnerId ? Boolean(onlineUsersById[partnerId]) : false

      if (isPartnerOnline) {
        return "Active now"
      }

      return formatLastSeenStatus(activeConversationPartner?.last_seen)
    },
    [activeConversationPartner?.id, activeConversationPartner?.last_seen, formatLastSeenStatus, onlineUsersById, presenceNow]
  )

  const lastMessageId = useMemo(() => {
    if (messages.length === 0) return null
    return messages[messages.length - 1]?.id || null
  }, [messages])

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

  const updateMyLastSeen = useCallback(async (force = false) => {
    if (!currentUser?.id) {
      return
    }

    const now = Date.now()
    if (!force && now - lastPresenceUpdateRef.current < 30_000) {
      return
    }

    lastPresenceUpdateRef.current = now

    const { error: updateError } = await supabase
      .from("profiles")
      .update({ last_seen: new Date(now).toISOString() })
      .eq("id", currentUser.id)

    if (updateError) {
      console.warn("[Chat] Failed to update last_seen:", updateError)
    }
  }, [currentUser?.id])

  const persistLastSeenNow = useCallback(async () => {
    if (!currentUser?.id) return

    const { error: updateError } = await supabase
      .from("profiles")
      .update({ last_seen: new Date().toISOString() })
      .eq("id", currentUser.id)

    if (updateError) {
      console.warn("[Chat] Failed to persist last_seen on disconnect:", updateError)
    }
  }, [currentUser?.id])

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

  const navigateToConversation = useCallback((conversationId, options = {}) => {
    const params = new URLSearchParams(searchParams)

    if (conversationId) {
      params.set("conversation", conversationId)
    } else {
      params.delete("conversation")
    }

    const query = params.toString()
    navigate(query ? `/chat?${query}` : "/chat", { replace: options.replace === true })
    setActiveConversationId(conversationId || null)
    clearUnreadForConversation(conversationId)
  }, [navigate, searchParams, clearUnreadForConversation])

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
    if (!channel || !activeConversationId || !currentUser?.id) {
      return
    }

    try {
      await channel.send({
        type: "broadcast",
        event: "typing",
        payload: {
          conversation_id: activeConversationId,
          user_id: currentUser.id,
          is_typing: typing
        }
      })
    } catch (typingError) {
      console.warn("[Chat] Failed to broadcast typing state:", typingError)
    }
  }, [activeConversationId, currentUser?.id])

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

      if (!channel || !activeConversationId || !currentUser?.id || !action || !reaction?.message_id) {
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
            sender_id: currentUser.id
          }
        })
      } catch (broadcastError) {
        console.warn("[Chat] Failed to broadcast reaction event:", broadcastError)
      }
    },
    [activeConversationId, currentUser?.id]
  )

  const handleDraftChange = useCallback((value) => {
    setDraft(value)

    const trimmed = value.trim()

    if (!activeConversationId || !currentUser?.id || !activeConversationChannelRef.current) {
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
  }, [activeConversationId, broadcastTyping, currentUser?.id, stopTyping])

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

  const fetchMessages = useCallback(async (conversationId) => {
    if (!conversationId) return

    try {
      console.log("[Chat] conversationId:", conversationId)
      console.log("[Chat] fetchMessages called for conversation:", conversationId)
      setLoadingMessages(true)
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

      const rawMessages = (data || []).map((message) => ({
        ...message,
        type: getMessageType(message),
        reactions: []
      }))
      const participantIds = rawMessages.flatMap((message) => [message.sender_id, message.receiver_id])
      await fetchProfilesByIds(participantIds)
      
      // First set messages without reactions (to show them immediately)
      setMessages(rawMessages)
      
      // Then fetch and attach reactions
      await fetchReactionsForMessages(rawMessages)
    } catch (err) {
      console.error("[Chat] Messages exception:", err)
      setError("Failed to load messages")
    } finally {
      setLoadingMessages(false)
    }
  }, [fetchProfilesByIds, fetchReactionsForMessages, getMessageType])

  const fetchConversations = useCallback(async (userId) => {
    if (!userId) return

    try {
      setLoadingConversations(true)
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

      const rawConversations = data || []

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

        return {
          ...conversation,
          last_message_content: latestMessage?.content || "",
          last_message_type: getMessageType(latestMessage),
          last_message_at: latestMessage?.created_at || null,
          partner: profileMap[partnerId] || {
            id: partnerId,
            username: "unknown",
            name: "Unknown user",
            avatar_url: null
          }
        }
      })

      const sortedHydrated = sortConversationsByPriority(hydrated, unreadMap)

      setConversations(sortedHydrated)
      setUnreadCountsByConversation(unreadMap)
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
      setLoadingConversations(false)
    }
  }, [dispatchUnreadBadgeUpdate, fetchProfilesByIds, getMessageType, sortConversationsByPriority])

  useEffect(() => {
    setConversations((prev) => sortConversationsByPriority(prev, unreadCountsByConversation, typingByConversation))
  }, [sortConversationsByPriority, unreadCountsByConversation, typingByConversation])

  useEffect(() => {
    const initializeChat = async () => {
      const { data: authData, error: authError } = await supabase.auth.getUser()

      if (authError || !authData?.user) {
        setError("You need to sign in to use chat")
        setLoadingConversations(false)
        return
      }

      setCurrentUser(authData.user)
      fetchConversations(authData.user.id)
    }

    initializeChat()
  }, [fetchConversations])

  useEffect(() => {
    if (!currentUser?.id) {
      return
    }

    const channel = supabase.channel("chat-user-presence", {
      config: {
        presence: { key: currentUser.id }
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
          await channel.track({
            user_id: currentUser.id,
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
  }, [currentUser?.id, persistLastSeenNow, syncOnlineUsersFromPresence])

  useEffect(() => {
    if (!currentUser?.id) return

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
        presenceChannelRef.current.track({
          user_id: currentUser.id,
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
  }, [currentUser?.id, persistLastSeenNow])

  useEffect(() => {
    const intervalId = setInterval(() => {
      setPresenceNow(Date.now())
    }, 30_000)

    return () => {
      clearInterval(intervalId)
    }
  }, [])

  useEffect(() => {
    if (!currentUser?.id) return

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
  }, [currentUser?.id, updateMyLastSeen])

  useEffect(() => {
    const partnerId = activeConversationPartner?.id
    if (!partnerId) {
      return
    }

    let canceled = false

    const refreshPartnerPresence = async () => {
      const { data, error: profileError } = await supabase
        .from("profiles")
        .select("id, username, avatar_url, name, last_seen")
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
      setActiveConversationId(null)
      return
    }

    if (requestedConversationId) {
      const requestedExists = conversations.some((conversation) => conversation.id === requestedConversationId)
      if (requestedExists) {
        setActiveConversationId(requestedConversationId)
        return
      }

      setActiveConversationId(null)
      return
    }

    setActiveConversationId((prev) => {
      if (prev && conversations.some((conversation) => conversation.id === prev)) {
        return prev
      }

      return null
    })
  }, [conversations, requestedConversationId])

  useEffect(() => {
    if (activeConversationId) {
      console.log("[Chat] messages fetch effect triggered for conversation:", activeConversationId)
      fetchMessages(activeConversationId)
    }
  }, [activeConversationId, fetchMessages])

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

          if (!currentUser?.id || payload.user_id === currentUser.id) {
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
        (payload) => {
          const nextMessage = payload.new
          if (!nextMessage?.id) return

          const normalizedNextMessage = {
            ...nextMessage,
            type: getMessageType(nextMessage)
          }

          setMessages((prev) => {
            if (prev.some((item) => item.id === normalizedNextMessage.id)) {
              return prev
            }
            return [...prev, normalizedNextMessage]
          })

          if (normalizedNextMessage.receiver_id === currentUser?.id && normalizedNextMessage.sender_id !== currentUser?.id) {
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
        (payload) => {
          if (payload.eventType !== "UPDATE") return

          const updatedMessage = payload.new
          if (!updatedMessage?.id) return

          setMessages((prev) =>
            prev.map((message) =>
              message.id === updatedMessage.id
                ? {
                    ...message,
                    ...updatedMessage
                  }
                : message
            )
          )
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          activeConversationChannelRef.current = channel
        }
        console.log("[Chat] Realtime status:", status)
      })

    return () => {
      console.log("[Chat] Cleaning active conversation realtime channel:", activeConversationId)
      if (isTypingRef.current) {
        channel.send({
          type: "broadcast",
          event: "typing",
          payload: {
            conversation_id: activeConversationId,
            user_id: currentUser?.id,
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
  }, [activeConversationId, handleReactionDelete, handleReactionInsert, updateReactionInState])

  useEffect(() => {
    if (!currentUser?.id) return

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

            if (payload.user_id === currentUser.id) {
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
  }, [activeConversationId, conversations, currentUser?.id, setConversationTypingState])

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
            updateMessageSeenStatus(payload.new.id)
          }
        }
      )
      .subscribe((status) => {
        console.log("[Chat] Message update subscription status:", status)
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [updateMessageSeenStatus])

  useEffect(() => {
    if (!bottomRef.current) return
    bottomRef.current.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  useEffect(() => {
    const query = userSearchQuery.trim()

    if (!query || !currentUser?.id) {
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

        setUserSearchResults((data || []).filter((profile) => profile.id !== currentUser.id))
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
  }, [userSearchQuery, currentUser?.id])

  const markConversationMessagesAsRead = useCallback(async (conversationId, userId) => {
    if (!conversationId || !userId) return

    try {
      const { error: updateError } = await supabase
        .from("messages")
        .update({ is_read: true })
        .eq("conversation_id", conversationId)
        .eq("receiver_id", userId)
        .eq("is_read", false)
        .neq("sender_id", userId)

      if (updateError) {
        console.error("[Chat] Failed to mark messages as read:", updateError)
        return
      }

      clearUnreadForConversation(conversationId)

      setMessages((prev) =>
        prev.map((message) => {
          if (
            message.conversation_id === conversationId &&
            message.receiver_id === userId &&
            message.sender_id !== userId &&
            message.is_read === false
          ) {
            return { ...message, is_read: true }
          }

          return message
        })
      )
    } catch (err) {
      console.error("[Chat] Exception marking messages as read:", err)
    }
  }, [clearUnreadForConversation])

  useEffect(() => {
    if (!currentUser?.id) return

    const channel = supabase
      .channel(`chat-unread-sync-${currentUser.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `receiver_id=eq.${currentUser.id}`
        },
        (payload) => {
          const nextMessage = payload.new
          if (!nextMessage?.id || nextMessage.receiver_id !== currentUser.id) {
            return
          }

          setConversations((prev) => {
            const updated = prev.map((conversation) =>
              conversation.id === nextMessage.conversation_id
                ? {
                    ...conversation,
                    last_message_content: nextMessage.content || conversation.last_message_content,
                    last_message_type: getMessageType(nextMessage),
                    last_message_at: nextMessage.created_at || conversation.last_message_at
                  }
                : conversation
            )

            return sortConversationsByPriority(updated)
          })

          if (nextMessage.conversation_id === activeConversationId) {
            markConversationMessagesAsRead(nextMessage.conversation_id, currentUser.id)
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
  }, [activeConversationId, currentUser?.id, getMessageType, incrementUnreadForConversation, markConversationMessagesAsRead, sortConversationsByPriority])

  const handleImageButtonClick = () => {
    if (!activeConversation || uploadingImage) {
      return
    }

    fileInputRef.current?.click()
  }

  const handleImageSelected = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ""

    if (!file || !activeConversationId || !currentUser?.id || uploadingImage) {
      return
    }

    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      setError("Only JPG, PNG, and WEBP images are allowed")
      return
    }

    if (file.size > MAX_IMAGE_SIZE) {
      setError("Image must be 5MB or smaller")
      return
    }

    try {
      stopTyping()
      setUploadingImage(true)
      setError("")

      const receiverId = activeConversation
        ? (activeConversation.user1_id === currentUser.id ? activeConversation.user2_id : activeConversation.user1_id)
        : null

      if (!receiverId) {
        setError("Failed to determine message recipient")
        return
      }

      const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_")
      const filePath = `${currentUser.id}/${activeConversationId}/${Date.now()}-${sanitizedName}`

      const { error: uploadError } = await supabase.storage
        .from("chat-media")
        .upload(filePath, file, {
          cacheControl: "3600",
          upsert: false,
          contentType: file.type
        })

      if (uploadError) {
        console.error("[Chat] Failed to upload image:", uploadError)
        setError("Failed to upload image")
        return
      }

      const { data: publicUrlData } = supabase.storage
        .from("chat-media")
        .getPublicUrl(filePath)

      const mediaUrl = publicUrlData?.publicUrl
      if (!mediaUrl) {
        setError("Failed to generate image URL")
        return
      }

      const { error: insertError } = await supabase.from("messages").insert([
        {
          conversation_id: activeConversationId,
          sender_id: currentUser.id,
          receiver_id: receiverId,
          content: null,
          type: "image",
          media_url: mediaUrl
        }
      ])

      if (insertError) {
        console.error("[Chat] Failed to send image message:", insertError)
        setError("Failed to send image")
      }
    } catch (imageSendError) {
      console.error("[Chat] Image send exception:", imageSendError)
      setError("Failed to send image")
    } finally {
      setUploadingImage(false)
    }
  }

  const handleReactionSelect = async (messageId, emoji) => {
    if (!messageId || !emoji || !currentUser?.id) {
      return
    }

    try {
      const { data: existingReaction, error: existingError } = await supabase
        .from("message_reactions")
        .select("id, message_id, user_id, emoji")
        .eq("message_id", messageId)
        .eq("user_id", currentUser.id)
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
          id: `temp-${currentUser.id}-${messageId}-${Date.now()}`,
          message_id: messageId,
          user_id: currentUser.id,
          emoji
        }

        addReactionToState(optimisticReaction)

        const { data: insertedReaction, error: insertError } = await supabase
          .from("message_reactions")
          .insert({
            message_id: messageId,
            user_id: currentUser.id,
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
        isCurrentUser: row.user_id === currentUser?.id
      })
      if (row.user_id === currentUser?.id) {
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
  }, [currentUser?.id, profilesById, messages])

  const handleReply = useCallback((message) => {
    setReplyToMessage(message)

    setTimeout(() => {
      inputRef.current?.focus()
    }, 0)
  }, [])

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

  const handleSendMessage = async () => {
    const content = draft.trim()

    if (!content || !activeConversationId || !currentUser?.id || sending) {
      return
    }

    try {
      stopTyping()
      setSending(true)
      setError("")

      const receiverId = activeConversation
        ? (activeConversation.user1_id === currentUser.id ? activeConversation.user2_id : activeConversation.user1_id)
        : null

      if (!receiverId) {
        setError("Failed to determine message recipient")
        return
      }

      const { error: insertError } = await supabase.from("messages").insert([
        {
          conversation_id: activeConversationId,
          sender_id: currentUser.id,
          receiver_id: receiverId,
          content,
          type: "text",
          media_url: null,
          reply_to_id: replyToMessage?.id || null
        }
      ])

      if (insertError) {
        console.error("[Chat] Failed to send message:", insertError)
        setError("Failed to send message")
        return
      }

      setDraft("")
      setReplyToMessage(null)
      requestAnimationFrame(() => {
        inputRef.current?.focus()
        console.log("[Chat] activeElement after send:", document.activeElement)
      })
      bottomRef.current?.scrollIntoView({ behavior: "smooth" })
    } catch (err) {
      console.error("[Chat] Send exception:", err)
      setError("Failed to send message")
    } finally {
      setSending(false)
    }
  }

  useEffect(() => {
    if (!activeConversationId || !currentUser?.id) return

    markConversationMessagesAsRead(activeConversationId, currentUser.id)
  }, [activeConversationId, currentUser?.id, markConversationMessagesAsRead])

  const handleStartConversationWithUser = async (selectedUser) => {
    if (!currentUser?.id || !selectedUser?.id) {
      return
    }

    if (selectedUser.id === currentUser.id) {
      return
    }

    try {
      setStartingConversationUserId(selectedUser.id)
      setError("")

      const me = currentUser.id
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

  return (
    <div className="mx-auto flex h-full w-full max-w-[1300px] flex-col overflow-hidden px-3 pt-1">
      <h1 className="mb-1 shrink-0 text-3xl font-bold text-slate-800">Chat</h1>

      {error && (
        <div className="mb-2 shrink-0 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid min-h-0 flex-1 w-full grid-cols-[320px,1fr] gap-2 rounded-2xl bg-white p-1.5 shadow-[0_4px_20px_rgba(0,0,0,0.05)] overflow-hidden">
        <section className="flex min-h-0 flex-col rounded-2xl border border-slate-100 bg-white shadow-[0_6px_24px_rgba(15,23,42,0.06)]">
          <div className="border-b border-slate-100 px-3 py-2.5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Conversations</h2>
            <div className="relative mt-2">
              <input
                value={userSearchQuery}
                onChange={(event) => setUserSearchQuery(event.target.value)}
                placeholder="Search users by username"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-[#f4b400]"
              />

              {userSearchQuery.trim() && (
                <div className="absolute left-0 right-0 top-full z-30 mt-2 max-h-72 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                  {userSearchLoading ? (
                    <p className="px-3 py-3 text-sm text-slate-500">Searching...</p>
                  ) : userSearchResults.length === 0 ? (
                    <p className="px-3 py-3 text-sm text-slate-500">No users found.</p>
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
                        className="flex w-full items-center gap-3 border-b border-slate-100 px-3 py-2 text-left hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-70"
                      >
                        {profile.avatar_url ? (
                          <img
                            src={profile.avatar_url}
                            alt={displayName}
                            className="h-8 w-8 rounded-full object-cover"
                          />
                        ) : (
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-600">
                            {displayName.charAt(0).toUpperCase()}
                          </div>
                        )}

                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-slate-900">
                            {displayName}
                            {shouldShowUsername ? ` (@${profile.username})` : ""}
                          </p>
                        </div>

                        {startingConversationUserId === profile.id && (
                          <span className="text-xs text-slate-500">Opening...</span>
                        )}
                      </button>
                        )
                      })()
                    ))
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {loadingConversations ? (
              <div className="space-y-3 p-4">
                {Array.from({ length: 5 }).map((_, index) => (
                  <div key={index} className="h-16 animate-pulse rounded-lg bg-slate-100" />
                ))}
              </div>
            ) : conversations.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-slate-500">No conversations yet.</p>
            ) : (
              conversations.map((conversation) => {
                const isActive = conversation.id === activeConversationId
                const displayName = getDisplayName(conversation.partner)
                const partnerAvatar = conversation.partner?.avatar_url
                const latestContent = conversation.last_message_type === "image"
                  ? "Photo"
                  : (conversation.last_message_content?.trim() || "No messages yet")
                const latestTimestamp = conversation.last_message_at || conversation.created_at
                const unreadCount = unreadCountsByConversation[conversation.id] || 0
                const hasUnread = unreadCount > 0
                const showTypingPreview = Boolean(typingByConversation[conversation.id])

                return (
                  <button
                    key={conversation.id}
                    onClick={() => navigateToConversation(conversation.id)}
                    className={`w-full border-b border-slate-100 px-3 py-2.5 text-left transition-all duration-200 ${
                      isActive
                        ? "bg-slate-100"
                        : hasUnread
                          ? "bg-yellow-50/60 hover:bg-yellow-50"
                          : "hover:bg-slate-50"
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
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-600">
                          {displayName.charAt(0).toUpperCase()}
                        </div>
                      )}

                      <div className="flex min-w-0 flex-1 items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-slate-900">{displayName}</p>
                          {showTypingPreview ? (
                            <p className="mt-1 truncate text-xs italic text-slate-400">Typing...</p>
                          ) : (
                            <p className={`mt-1 truncate text-xs ${hasUnread ? "font-medium text-slate-700" : "text-slate-500"}`}>
                              {latestContent}
                            </p>
                          )}
                        </div>

                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <p className="text-[11px] text-slate-500">{formatConversationListTime(latestTimestamp)}</p>
                          {hasUnread && (
                            <span className="inline-flex min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
                              {unreadCount > 99 ? "99+" : unreadCount}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </section>

        <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-[0_6px_24px_rgba(15,23,42,0.06)]">
          <div className="border-b border-slate-100 px-3 py-2.5">
            <h2 className="text-base font-semibold text-slate-900">
              {activeConversation ? getDisplayName(activeConversationPartner) : "Select a conversation"}
            </h2>
            {activeConversation && (
              <p className="mt-1 text-xs text-slate-500">{activeConversationStatus}</p>
            )}
          </div>

          <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-2.5 py-2 pb-2.5">
            {!activeConversation ? (
              <p className="text-sm text-slate-500">Select a conversation to start chatting</p>
            ) : loadingMessages ? (
              <div className="space-y-3">
                {Array.from({ length: 6 }).map((_, index) => (
                  <div key={index} className="h-10 animate-pulse rounded-lg bg-slate-100" />
                ))}
              </div>
            ) : messages.length === 0 ? (
              <p className="text-sm text-slate-500">No messages yet. Send the first one.</p>
            ) : (
              messages.map((message) => {
                const mine = message.sender_id === currentUser?.id
                const showSeen = mine && message.id === lastMessageId && message.is_read === true
                const senderProfile = profilesById[message.sender_id]
                const imageUrl = getImageMessageUrl(message)
                const isImageMessage = Boolean(imageUrl)
                const reactionSummary = getReactionSummary(message.id)
                const isReactionPickerOpen = activeReactionPickerMessageId === message.id

                return (
                  <div key={message.id} className={`group flex ${mine ? "justify-end" : "justify-start"}`}>
                    {!mine && (
                      senderProfile?.avatar_url ? (
                        <img
                          src={senderProfile.avatar_url}
                          alt={getDisplayName(senderProfile)}
                          className="mr-2 h-8 w-8 self-end rounded-full object-cover"
                        />
                      ) : (
                        <div className="mr-2 flex h-8 w-8 self-end items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-600">
                          {getDisplayName(senderProfile).charAt(0).toUpperCase()}
                        </div>
                      )
                    )}
                    <div className={`max-w-[52%] ${mine ? "items-end" : "items-start"} flex flex-col`}>
                      {message.reply_to_id && (
                        <div className="mb-1.5 border-l-2 border-slate-300 bg-slate-50 px-2 py-1 text-xs text-slate-600">
                          {(() => {
                            const repliedMessage = messages.find((m) => m.id === message.reply_to_id)
                            if (!repliedMessage) return <span className="italic text-slate-400">Original message unavailable</span>
                            const repliedSender = profilesById[repliedMessage.sender_id]
                            const repliedImageUrl = getImageMessageUrl(repliedMessage)
                            return (
                              <button
                                type="button"
                                onClick={() => {
                                  const element = document.getElementById(`message-${repliedMessage.id}`)
                                  element?.scrollIntoView({ behavior: "smooth", block: "center" })
                                }}
                                className="w-full text-left transition hover:text-slate-800"
                              >
                                <p className="font-semibold text-slate-700">{getDisplayName(repliedSender)}</p>
                                <p className="line-clamp-1 italic">{repliedMessage.content || "[Image]"}</p>
                              </button>
                            )
                          })()}
                        </div>
                      )}
                      <div
                        id={`message-${message.id}`}
                        className="relative w-fit cursor-pointer"
                        onClick={() => setActiveReactionPickerMessageId((prev) => (prev === message.id ? null : message.id))}
                      >
                        <span className={`absolute ${mine ? "-left-12" : "-right-12"} top-1/2 -translate-y-1/2 flex gap-0.5 rounded-lg border border-slate-200 bg-white px-0.5 py-1 shadow-sm transition md:opacity-0 md:group-hover:opacity-100 ${isReactionPickerOpen ? "opacity-100" : "opacity-70"}`}>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleReply(message)
                            }}
                            className="px-1 text-xs text-slate-500 transition hover:text-slate-700"
                            title="Reply"
                          >
                            ↩️
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              setActiveReactionPickerMessageId((prev) => (prev === message.id ? null : message.id))
                            }}
                            className="px-1 text-xs text-slate-500 transition hover:text-slate-700"
                            title="React"
                          >
                            🙂
                          </button>
                        </span>

                        {isReactionPickerOpen && (
                          <div className={`absolute z-20 ${mine ? "right-0" : "left-0"} -top-12 flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-1 shadow-md`}>
                            {REACTION_EMOJIS.map((emoji) => (
                              <button
                                key={emoji}
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation()
                                  handleReactionSelect(message.id, emoji)
                                }}
                                className="rounded-full p-1 text-sm transition hover:bg-slate-100"
                              >
                                {emoji}
                              </button>
                            ))}
                          </div>
                        )}

                        {isImageMessage ? (
                          <div className="relative w-fit overflow-hidden rounded-2xl border border-slate-200 bg-white">
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation()
                                setImagePreviewUrl(imageUrl)
                              }}
                              className="absolute right-2 top-2 z-10 rounded-full bg-black/45 px-2 py-1 text-[10px] text-white"
                            >
                              View
                            </button>
                            <img
                              src={imageUrl}
                              alt="Shared media"
                              className="max-h-72 w-full max-w-[260px] object-cover"
                              loading="lazy"
                            />
                          </div>
                        ) : (
                          <div
                            className={`w-fit rounded-2xl px-2.5 py-1.5 text-[14px] ${
                              mine ? "bg-[#f4b400] text-white" : "bg-[#eef1f6] text-slate-900"
                            }`}
                          >
                            <p className="whitespace-pre-wrap break-words">{message.content}</p>
                          </div>
                        )}
                      </div>

                      {reactionSummary.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {reactionSummary.map((item) => (
                            <button
                              key={`${message.id}-${item.emoji}`}
                              type="button"
                              onClick={() => setReactionModalMessageId(message.id)}
                              className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px] ${
                                item.reactedByCurrentUser
                                  ? "border-yellow-300 bg-yellow-50 text-yellow-700"
                                  : "border-slate-200 bg-white text-slate-600"
                              }`}
                            >
                              <span>{item.emoji}</span>
                              <span>{item.count}</span>
                            </button>
                          ))}
                        </div>
                      )}

                      <p className="mt-1 text-[10px] text-slate-500/80">
                        {formatTime(message.created_at)}
                        {showSeen ? " · Seen" : ""}
                      </p>
                    </div>
                  </div>
                )
              })
            )}
            <div ref={bottomRef} />
          </div>

          <div className="sticky bottom-0 z-10 border-t border-[#eee] bg-white px-2.5 py-2">
            {replyToMessage && (
              <div className="mb-2 flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2">
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold text-slate-600">Replying to {getDisplayName(profilesById[replyToMessage.sender_id])}</p>
                  <p className="truncate text-xs text-slate-700">{replyToMessage.content || "[Image]"}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setReplyToMessage(null)}
                  className="shrink-0 rounded-md p-1 text-slate-400 transition hover:bg-slate-200 hover:text-slate-600"
                  aria-label="Cancel reply"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            )}
            {activeConversation && isPartnerTyping && (
              <div className="mb-1.5 flex items-center gap-1 text-[11px] italic text-slate-400">
                <span>Typing</span>
                <span className="inline-flex gap-0.5">
                  <span className="h-1 w-1 animate-pulse rounded-full bg-slate-400 [animation-delay:0ms]" />
                  <span className="h-1 w-1 animate-pulse rounded-full bg-slate-400 [animation-delay:200ms]" />
                  <span className="h-1 w-1 animate-pulse rounded-full bg-slate-400 [animation-delay:400ms]" />
                </span>
              </div>
            )}
            <div className="flex gap-2">
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
                disabled={!activeConversation || uploadingImage || sending}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-slate-500 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
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
                value={draft}
                onChange={(event) => handleDraftChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault()
                    handleSendMessage()
                  }
                }}
                disabled={!activeConversation || sending || uploadingImage}
                placeholder={activeConversation ? "Type a message..." : "Select a conversation first"}
                className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-[#f4b400]"
              />
              <button
                onClick={handleSendMessage}
                disabled={!activeConversation || sending || uploadingImage || !draft.trim()}
                className="rounded-lg bg-[#f4b400] px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-[#e0a500] disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {sending ? "Sending..." : "Send"}
              </button>
            </div>
          </div>
        </section>
      </div>

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

      {activeReactionPickerMessageId && (
        <button
          type="button"
          className="fixed inset-0 z-10 bg-transparent"
          onClick={() => setActiveReactionPickerMessageId(null)}
          aria-label="Close reactions picker"
        />
      )}

      <ReactionModal
        open={Boolean(reactionModalMessageId)}
        messageId={reactionModalMessageId}
        groups={reactionModalMessageId ? getReactionSummary(reactionModalMessageId) : []}
        onClose={() => setReactionModalMessageId(null)}
        onRemoveReaction={handleRemoveReaction}
      />
    </div>
  )
}
