import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import dayjs from "dayjs"
import relativeTime from "dayjs/plugin/relativeTime"
import utc from "dayjs/plugin/utc"
import { supabase } from "../lib/supabase"
import { useAuth } from "../hooks/useAuth"
import { useToast } from "../hooks/useToast"
import { decrypt, encrypt, exportKey, generateKey, importKey } from "../utils/encryption"
import { Copy, Forward, Info, MoreHorizontal, Reply, SmilePlus, Trash2 } from "lucide-react"

dayjs.extend(relativeTime)
dayjs.extend(utc)

const MESSAGE_BATCH_SIZE = 20
const GROUP_BATCH_SIZE = 15

export default function GroupChat() {
  const { user: contextUser } = useAuth()
  const { success: showSuccess, error: showToastError } = useToast()

  const [groups, setGroups] = useState([])
  const [activeGroupId, setActiveGroupId] = useState(null)
  const [loadingGroups, setLoadingGroups] = useState(true)
  const [groupPage, setGroupPage] = useState(0)
  const [hasMoreGroups, setHasMoreGroups] = useState(true)
  const [loadingMoreGroups, setLoadingMoreGroups] = useState(false)
  const [groupSearch, setGroupSearch] = useState("")

  const [messages, setMessages] = useState([])
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [messagePage, setMessagePage] = useState(0)
  const [hasMoreMessages, setHasMoreMessages] = useState(true)
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false)
  const [draft, setDraft] = useState("")
  const [sending, setSending] = useState(false)
  const [error, setError] = useState("")

  const [groupMembers, setGroupMembers] = useState([])
  const [groupKey, setGroupKey] = useState(null)
  const [membersDropdownOpen, setMembersDropdownOpen] = useState(false)

  const [messageReadsById, setMessageReadsById] = useState({})
  const [openMessageOptionsId, setOpenMessageOptionsId] = useState(null)
  const [messageInfoMessageId, setMessageInfoMessageId] = useState(null)
  const [replyTarget, setReplyTarget] = useState(null)

  const [newGroupModalOpen, setNewGroupModalOpen] = useState(false)
  const [newGroupName, setNewGroupName] = useState("")
  const [newGroupUserSearch, setNewGroupUserSearch] = useState("")
  const [newGroupUserSearchResults, setNewGroupUserSearchResults] = useState([])
  const [newGroupUserSearchLoading, setNewGroupUserSearchLoading] = useState(false)
  const [newGroupSelectedUsers, setNewGroupSelectedUsers] = useState([])
  const [creatingGroup, setCreatingGroup] = useState(false)

  const messageListRef = useRef(null)
  const groupListRef = useRef(null)
  const bottomRef = useRef(null)
  const inputRef = useRef(null)
  const groupChannelRef = useRef(null)
  const readReceiptsChannelRef = useRef(null)
  const messageIdsRef = useRef(new Set())
  const isPrependingOlderRef = useRef(false)

  const activeGroup = useMemo(
    () => groups.find((group) => group.id === activeGroupId) || null,
    [groups, activeGroupId]
  )

  const filteredGroups = useMemo(
    () => groups.filter((group) => group.name.toLowerCase().includes(groupSearch.toLowerCase())),
    [groups, groupSearch]
  )

  const messageInfoReads = useMemo(() => {
    if (!messageInfoMessageId) return []
    return messageReadsById[messageInfoMessageId] || []
  }, [messageInfoMessageId, messageReadsById])

  const getDisplayName = useCallback((profile) => {
    if (!profile) return "Unknown"
    return profile.name || profile.username || "Unknown"
  }, [])

  const getMemberProfileById = useCallback(
    (userId) => {
      const member = groupMembers.find((item) => item.user_id === userId)
      return member?.profiles || null
    },
    [groupMembers]
  )

  const updatePresence = useCallback(
    async (isOnline) => {
      if (!contextUser?.id) return

      const payload = isOnline
        ? { is_online: true }
        : { is_online: false, last_seen: new Date().toISOString() }

      const { error: presenceError } = await supabase
        .from("profiles")
        .update(payload)
        .eq("id", contextUser.id)

      if (presenceError) {
        console.warn("[GroupChat] Failed to update presence:", presenceError)
      }
    },
    [contextUser?.id]
  )

  const fetchGroups = useCallback(async () => {
    if (!contextUser?.id) return

    try {
      setLoadingGroups(true)
      setError("")
      setGroupPage(0)
      setHasMoreGroups(true)
      setLoadingMoreGroups(false)

      const { data, error: fetchError } = await supabase
        .from("group_conversations")
        .select(`
          id,
          name,
          last_message,
          last_message_at,
          group_members!inner(user_id)
        `)
        .eq("group_members.user_id", contextUser.id)
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .limit(GROUP_BATCH_SIZE)

      if (fetchError) {
        console.error("[GroupChat] Error fetching groups:", fetchError)
        setError("Failed to load groups")
        return
      }

      const list = (data || []).map((group) => ({
        id: group.id,
        name: group.name,
        last_message: group.last_message,
        last_message_at: group.last_message_at
      }))
      setGroups(list)

      if (list.length < GROUP_BATCH_SIZE) {
        setHasMoreGroups(false)
      }

      setActiveGroupId((prev) => {
        if (prev && list.some((group) => group.id === prev)) {
          return prev
        }

        return list[0]?.id || null
      })
    } catch (err) {
      console.error("[GroupChat] Exception fetching groups:", err)
      setError("Failed to load groups")
    } finally {
      setLoadingGroups(false)
    }
  }, [contextUser?.id])

  const loadMoreGroups = useCallback(async () => {
    if (!contextUser?.id || loadingGroups || loadingMoreGroups || !hasMoreGroups) {
      return
    }

    try {
      setLoadingMoreGroups(true)
      const nextPage = groupPage + 1
      const offset = nextPage * GROUP_BATCH_SIZE

      const { data, error: fetchError } = await supabase
        .from("group_conversations")
        .select(`
          id,
          name,
          last_message,
          last_message_at,
          group_members!inner(user_id)
        `)
        .eq("group_members.user_id", contextUser.id)
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .range(offset, offset + GROUP_BATCH_SIZE - 1)

      if (fetchError) {
        console.error("[GroupChat] Error loading more groups:", fetchError)
        return
      }

      const nextRows = (data || []).map((group) => ({
        id: group.id,
        name: group.name,
        last_message: group.last_message,
        last_message_at: group.last_message_at
      }))

      if (nextRows.length < GROUP_BATCH_SIZE) {
        setHasMoreGroups(false)
      }

      setGroups((prev) => {
        const existingIds = new Set(prev.map((group) => group.id))
        const newUniqueGroups = nextRows.filter((group) => !existingIds.has(group.id))
        return [...prev, ...newUniqueGroups]
      })

      setGroupPage(nextPage)
    } catch (err) {
      console.error("[GroupChat] Exception loading more groups:", err)
    } finally {
      setLoadingMoreGroups(false)
    }
  }, [contextUser?.id, groupPage, hasMoreGroups, loadingGroups, loadingMoreGroups])

  const handleGroupListScroll = useCallback(() => {
    const container = groupListRef.current
    if (!container) return

    if (container.scrollHeight - container.scrollTop - container.clientHeight < 80) {
      void loadMoreGroups()
    }
  }, [loadMoreGroups])

  const fetchGroupMembers = useCallback(async (groupId) => {
    if (!groupId) return

    try {
      const { data, error: fetchError } = await supabase
        .from("group_members")
        .select(`
          user_id,
          role,
          profiles(id, username, name, avatar_url)
        `)
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

  const fetchGroupKey = useCallback(async (groupId) => {
    if (!groupId) {
      setGroupKey(null)
      return
    }

    try {
      const { data, error: fetchError } = await supabase
        .from("group_conversations")
        .select("encryption_key")
        .eq("id", groupId)
        .maybeSingle()

      if (fetchError) {
        console.error("[GroupChat] Error fetching group key:", fetchError)
        setGroupKey(null)
        return
      }

      if (!data?.encryption_key) {
        setGroupKey(null)
        return
      }

      const importedKey = await importKey(data.encryption_key)
      setGroupKey(importedKey)
    } catch (err) {
      console.error("[GroupChat] Exception fetching group key:", err)
      setGroupKey(null)
    }
  }, [])

  const fetchGroupMessageReads = useCallback(async (messageIds) => {
    const ids = [...new Set((messageIds || []).filter(Boolean))]
    if (ids.length === 0) {
      setMessageReadsById({})
      return {}
    }

    try {
      const { data, error: readsError } = await supabase
        .from("group_message_reads")
        .select("message_id, user_id, read_at, profiles(id, username, name, avatar_url)")
        .in("message_id", ids)

      if (readsError) {
        console.error("[GroupChat] Error fetching read receipts:", readsError)
        return {}
      }

      const mapped = {}
      ;(data || []).forEach((row) => {
        if (!row?.message_id) return
        if (!mapped[row.message_id]) mapped[row.message_id] = []

        mapped[row.message_id].push({
          user_id: row.user_id,
          read_at: row.read_at,
          profile: row.profiles || null
        })
      })

      setMessageReadsById(mapped)
      return mapped
    } catch (err) {
      console.error("[GroupChat] Exception fetching read receipts:", err)
      return {}
    }
  }, [])

  const markGroupMessagesAsRead = useCallback(
    async (messageList) => {
      if (!contextUser?.id || !Array.isArray(messageList) || messageList.length === 0) {
        return
      }

      const unreadMessageIds = messageList
        .filter((message) => message.sender_id !== contextUser.id)
        .map((message) => message.id)

      if (unreadMessageIds.length === 0) {
        return
      }

      const now = new Date().toISOString()
      const rows = unreadMessageIds.map((messageId) => ({
        message_id: messageId,
        user_id: contextUser.id,
        read_at: now
      }))

      const { error: upsertError } = await supabase
        .from("group_message_reads")
        .upsert(rows, { onConflict: "message_id,user_id" })

      if (upsertError) {
        console.error("[GroupChat] Failed to upsert read receipts:", upsertError)
      }
    },
    [contextUser?.id]
  )

  const hydrateMessages = useCallback(
    async (rows) => {
      const nextRows = rows || []

      return Promise.all(
        nextRows.map(async (message) => {
          let content = message.content || ""

          if (message.is_encrypted && message.encrypted_content && message.iv && groupKey) {
            try {
              content = await decrypt(message.encrypted_content, message.iv, groupKey)
            } catch (decryptError) {
              console.warn("[GroupChat] Could not decrypt message", message.id, decryptError)
              content = "[Unable to decrypt]"
            }
          }

          return {
            ...message,
            content,
            profiles: message.profiles || getMemberProfileById(message.sender_id)
          }
        })
      )
    },
    [getMemberProfileById, groupKey]
  )

  const hydrateAndSetMessages = useCallback(
    async (rows) => {
      const decrypted = await hydrateMessages(rows)

      setMessages(decrypted)
      messageIdsRef.current = new Set(decrypted.map((msg) => msg.id))

      const ids = decrypted.map((msg) => msg.id)
      await fetchGroupMessageReads(ids)
      await markGroupMessagesAsRead(decrypted)
    },
    [fetchGroupMessageReads, hydrateMessages, markGroupMessagesAsRead]
  )

  const fetchGroupMessages = useCallback(async () => {
    if (!activeGroupId) return

    try {
      setLoadingMessages(true)
      setMessagePage(0)
      setHasMoreMessages(true)

      const { data, error: fetchError } = await supabase
        .from("group_messages")
        .select(`
          id,
          group_id,
          sender_id,
          content,
          encrypted_content,
          iv,
          is_encrypted,
          created_at,
          profiles(id, username, name, avatar_url)
        `)
        .eq("group_id", activeGroupId)
        .order("created_at", { ascending: false })
        .limit(MESSAGE_BATCH_SIZE)

      if (fetchError) {
        console.error("[GroupChat] Error fetching messages:", fetchError)
        setMessages([])
        return
      }

      const fetchedRows = data || []
      const orderedMessages = [...fetchedRows].reverse()
      await hydrateAndSetMessages(orderedMessages)

      if (fetchedRows.length < MESSAGE_BATCH_SIZE) {
        setHasMoreMessages(false)
      }
    } catch (err) {
      console.error("[GroupChat] Exception fetching messages:", err)
      setMessages([])
    } finally {
      setLoadingMessages(false)
    }
  }, [activeGroupId, hydrateAndSetMessages])

  const loadOlderMessages = useCallback(async () => {
    if (!activeGroupId || loadingOlderMessages || loadingMessages || !hasMoreMessages) {
      return
    }

    const container = messageListRef.current
    if (!container) {
      return
    }

    try {
      setLoadingOlderMessages(true)

      const previousHeight = container.scrollHeight
      const nextPage = messagePage + 1
      const offset = nextPage * MESSAGE_BATCH_SIZE

      const { data, error: fetchError } = await supabase
        .from("group_messages")
        .select(`
          id,
          group_id,
          sender_id,
          content,
          encrypted_content,
          iv,
          is_encrypted,
          created_at,
          profiles(id, username, name, avatar_url)
        `)
        .eq("group_id", activeGroupId)
        .order("created_at", { ascending: false })
        .range(offset, offset + MESSAGE_BATCH_SIZE - 1)

      if (fetchError) {
        console.error("[GroupChat] Error fetching older messages:", fetchError)
        return
      }

      const fetchedRows = data || []
      const orderedMessages = [...fetchedRows].reverse()
      const hydratedOlderMessages = await hydrateMessages(orderedMessages)

      let prependedMessages = []
      setMessages((prev) => {
        const existingIds = new Set(prev.map((item) => item.id))
        prependedMessages = hydratedOlderMessages.filter((item) => !existingIds.has(item.id))
        if (prependedMessages.length === 0) {
          return prev
        }

        isPrependingOlderRef.current = true
        return [...prependedMessages, ...prev]
      })

      if (prependedMessages.length > 0) {
        prependedMessages.forEach((item) => messageIdsRef.current.add(item.id))

        const combinedIds = [...new Set([...messages.map((item) => item.id), ...prependedMessages.map((item) => item.id)])]
        await fetchGroupMessageReads(combinedIds)
        await markGroupMessagesAsRead(prependedMessages)

        requestAnimationFrame(() => {
          const currentContainer = messageListRef.current
          if (currentContainer) {
            currentContainer.scrollTop = currentContainer.scrollHeight - previousHeight
          }
          isPrependingOlderRef.current = false
        })
      }

      if (fetchedRows.length < MESSAGE_BATCH_SIZE) {
        setHasMoreMessages(false)
      }

      setMessagePage(nextPage)
    } catch (err) {
      console.error("[GroupChat] Exception loading older messages:", err)
    } finally {
      setLoadingOlderMessages(false)
    }
  }, [
    activeGroupId,
    fetchGroupMessageReads,
    hasMoreMessages,
    hydrateMessages,
    loadingMessages,
    loadingOlderMessages,
    markGroupMessagesAsRead,
    messagePage,
    messages
  ])

  const handleMessageListScroll = useCallback(() => {
    const container = messageListRef.current
    if (!container) return

    if (container.scrollTop < 50) {
      void loadOlderMessages()
    }
  }, [loadOlderMessages])

  const sendMessage = useCallback(async () => {
    if (!activeGroupId || !contextUser?.id || !groupKey || !draft.trim()) {
      return
    }

    try {
      setSending(true)
      const baseContent = draft.trim()
      const replyPrefix = replyTarget
        ? `Reply to ${getDisplayName(replyTarget.profiles)}: ${replyTarget.content || "[message]"}\n`
        : ""
      const contentToEncrypt = `${replyPrefix}${baseContent}`

      const encrypted = await encrypt(contentToEncrypt, groupKey)

      const insertPayload = {
        group_id: activeGroupId,
        sender_id: contextUser.id,
        encrypted_content: encrypted.ciphertext,
        iv: encrypted.iv,
        is_encrypted: true,
        type: "text",
        content: null
      }

      const { data: insertedRows, error: insertError } = await supabase
        .from("group_messages")
        .insert([insertPayload])
        .select("id, group_id, sender_id, content, encrypted_content, iv, is_encrypted, created_at")

      if (insertError) {
        console.error("[GroupChat] Error sending message:", insertError)
        showToastError("Failed to send message")
        return
      }

      const inserted = insertedRows?.[0]
      if (inserted) {
        setMessages((prev) => [
          ...prev,
          {
            ...inserted,
            content: contentToEncrypt,
            profiles: getMemberProfileById(contextUser.id) || null
          }
        ])
        messageIdsRef.current.add(inserted.id)
        // Initialize empty read state for new message
        setMessageReadsById((prev) => ({
          ...prev,
          [inserted.id]: []
        }))
        console.log("[GroupChat] Initialized empty read state for message", inserted.id)
      }

      await supabase
        .from("group_conversations")
        .update({
          last_message: baseContent,
          last_message_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq("id", activeGroupId)

      setDraft("")
      setReplyTarget(null)
      requestAnimationFrame(() => inputRef.current?.focus())
    } catch (err) {
      console.error("[GroupChat] Exception sending message:", err)
      showToastError("Failed to send message")
    } finally {
      setSending(false)
    }
  }, [
    activeGroupId,
    contextUser?.id,
    draft,
    getDisplayName,
    getMemberProfileById,
    groupKey,
    replyTarget,
    showToastError
  ])

  const createGroup = useCallback(async () => {
    if (!contextUser?.id) return
    if (!newGroupName.trim() || newGroupSelectedUsers.length === 0) {
      showToastError("Group name and at least one member required")
      return
    }

    try {
      setCreatingGroup(true)

      const key = await generateKey()
      const exportedKey = await exportKey(key)

      const { data: groupData, error: groupError } = await supabase
        .from("group_conversations")
        .insert([
          {
            name: newGroupName.trim(),
            created_by: contextUser.id,
            encryption_key: exportedKey
          }
        ])
        .select("id")
        .single()

      if (groupError || !groupData?.id) {
        console.error("[GroupChat] Error creating group:", groupError)
        showToastError("Failed to create group")
        return
      }

      const memberRows = [
        { group_id: groupData.id, user_id: contextUser.id, role: "admin" },
        ...newGroupSelectedUsers.map((user) => ({
          group_id: groupData.id,
          user_id: user.id,
          role: "member"
        }))
      ]

      const { error: membersError } = await supabase.from("group_members").insert(memberRows)
      if (membersError) {
        console.error("[GroupChat] Error adding members:", membersError)
        showToastError("Failed to add group members")
        return
      }

      showSuccess("Group created successfully")
      setNewGroupModalOpen(false)
      setNewGroupName("")
      setNewGroupUserSearch("")
      setNewGroupSelectedUsers([])
      await fetchGroups()
    } catch (err) {
      console.error("[GroupChat] Exception creating group:", err)
      showToastError("Failed to create group")
    } finally {
      setCreatingGroup(false)
    }
  }, [contextUser?.id, fetchGroups, newGroupName, newGroupSelectedUsers, showSuccess, showToastError])

  const handleCopyMessage = useCallback(
    async (message) => {
      const text = message?.content || ""
      if (!text) return

      try {
        if (navigator?.clipboard?.writeText) {
          await navigator.clipboard.writeText(text)
          showSuccess("Message copied")
        }
      } catch (err) {
        console.error("[GroupChat] Failed to copy message:", err)
        showToastError("Unable to copy message")
      }
    },
    [showSuccess, showToastError]
  )

  const handleForwardMessage = useCallback(
    (message) => {
      const text = message?.content || ""
      if (!text) return
      setDraft((prev) => (prev ? `${prev}\nFwd: ${text}` : `Fwd: ${text}`))
      showSuccess("Message prepared for forwarding")
      requestAnimationFrame(() => inputRef.current?.focus())
    },
    [showSuccess]
  )

  const handleDeleteMessage = useCallback(
    async (message) => {
      if (!contextUser?.id || message?.sender_id !== contextUser.id) {
        showToastError("You can only delete your own messages")
        return
      }

      const { error: deleteError } = await supabase
        .from("group_messages")
        .delete()
        .eq("id", message.id)
        .eq("sender_id", contextUser.id)

      if (deleteError) {
        console.error("[GroupChat] Failed to delete message:", deleteError)
        showToastError("Failed to delete message")
        return
      }

      setMessages((prev) => prev.filter((item) => item.id !== message.id))
      showSuccess("Message deleted")
    },
    [contextUser?.id, showSuccess, showToastError]
  )

  const handleReactToMessage = useCallback(() => {
    showSuccess("Reaction picker coming soon")
  }, [showSuccess])

  useEffect(() => {
    if (!contextUser?.id) return

    fetchGroups()
  }, [contextUser?.id, fetchGroups])

  useEffect(() => {
    if (!contextUser?.id) return

    updatePresence(true)

    const handlePageHide = () => {
      updatePresence(false)
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        updatePresence(false)
      }

      if (document.visibilityState === "visible") {
        updatePresence(true)
      }
    }

    window.addEventListener("beforeunload", handlePageHide)
    window.addEventListener("pagehide", handlePageHide)
    document.addEventListener("visibilitychange", handleVisibilityChange)

    return () => {
      window.removeEventListener("beforeunload", handlePageHide)
      window.removeEventListener("pagehide", handlePageHide)
      document.removeEventListener("visibilitychange", handleVisibilityChange)
      updatePresence(false)
    }
  }, [contextUser?.id, updatePresence])

  useEffect(() => {
    if (!newGroupUserSearch.trim()) {
      setNewGroupUserSearchResults([])
      return
    }

    let canceled = false
    const timeoutId = setTimeout(async () => {
      try {
        setNewGroupUserSearchLoading(true)

        const { data, error: searchError } = await supabase
          .from("profiles")
          .select("id, username, name, avatar_url")
          .or(`username.ilike.%${newGroupUserSearch}%,name.ilike.%${newGroupUserSearch}%`)
          .limit(10)

        if (searchError) {
          console.error("[GroupChat] Error searching users:", searchError)
          if (!canceled) setNewGroupUserSearchResults([])
          return
        }

        if (canceled) return

        const filtered = (data || []).filter(
          (profile) =>
            profile.id !== contextUser?.id && !newGroupSelectedUsers.some((user) => user.id === profile.id)
        )

        setNewGroupUserSearchResults(filtered)
      } catch (err) {
        console.error("[GroupChat] Exception searching users:", err)
      } finally {
        if (!canceled) {
          setNewGroupUserSearchLoading(false)
        }
      }
    }, 250)

    return () => {
      canceled = true
      clearTimeout(timeoutId)
    }
  }, [contextUser?.id, newGroupSelectedUsers, newGroupUserSearch])

  useEffect(() => {
    if (!activeGroupId) {
      setMessages([])
      setMessagePage(0)
      setHasMoreMessages(true)
      setLoadingOlderMessages(false)
      setMessageReadsById({})
      setGroupMembers([])
      setGroupKey(null)
      return
    }

    fetchGroupMembers(activeGroupId)
    fetchGroupKey(activeGroupId)
  }, [activeGroupId, fetchGroupKey, fetchGroupMembers])

  useEffect(() => {
    if (!activeGroupId || !groupKey) return
    fetchGroupMessages()
  }, [activeGroupId, fetchGroupMessages, groupKey])

  useEffect(() => {
    if (!activeGroupId || !groupKey) return

    if (groupChannelRef.current) {
      supabase.removeChannel(groupChannelRef.current)
      groupChannelRef.current = null
    }

    const channel = supabase
      .channel(`group-chat-${activeGroupId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "group_messages",
          filter: `group_id=eq.${activeGroupId}`
        },
        async (payload) => {
          if (payload.eventType === "INSERT") {
            const row = payload.new
            if (!row?.id) return

            let content = row.content || ""
            if (row.is_encrypted && row.encrypted_content && row.iv) {
              try {
                content = await decrypt(row.encrypted_content, row.iv, groupKey)
              } catch (decryptError) {
                console.warn("[GroupChat] Failed to decrypt realtime message:", decryptError)
                content = "[Unable to decrypt]"
              }
            }

            setMessages((prev) => {
              if (prev.some((item) => item.id === row.id)) {
                return prev
              }

              return [
                ...prev,
                {
                  ...row,
                  content,
                  profiles: getMemberProfileById(row.sender_id)
                }
              ]
            })

            messageIdsRef.current.add(row.id)

            if (row.sender_id !== contextUser?.id) {
              await markGroupMessagesAsRead([row])
              await fetchGroupMessageReads([row.id])
            }

            return
          }

          if (payload.eventType === "DELETE") {
            const oldRow = payload.old
            if (!oldRow?.id) return

            setMessages((prev) => prev.filter((item) => item.id !== oldRow.id))
            setMessageReadsById((prev) => {
              const next = { ...prev }
              delete next[oldRow.id]
              return next
            })
            messageIdsRef.current.delete(oldRow.id)
            return
          }

          if (payload.eventType === "UPDATE") {
            const updated = payload.new
            if (!updated?.id) return

            let content = updated.content || ""
            if (updated.is_encrypted && updated.encrypted_content && updated.iv) {
              try {
                content = await decrypt(updated.encrypted_content, updated.iv, groupKey)
              } catch (decryptError) {
                console.warn("[GroupChat] Failed to decrypt updated message:", decryptError)
                content = "[Unable to decrypt]"
              }
            }

            setMessages((prev) =>
              prev.map((item) =>
                item.id === updated.id
                  ? {
                      ...item,
                      ...updated,
                      content,
                      profiles: item.profiles || getMemberProfileById(updated.sender_id)
                    }
                  : item
              )
            )
          }
        }
      )
      .subscribe()

    groupChannelRef.current = channel

    return () => {
      supabase.removeChannel(channel)
      if (groupChannelRef.current === channel) {
        groupChannelRef.current = null
      }
    }
  }, [
    activeGroupId,
    contextUser?.id,
    fetchGroupMessageReads,
    getMemberProfileById,
    groupKey,
    markGroupMessagesAsRead
  ])

  useEffect(() => {
    if (readReceiptsChannelRef.current) {
      supabase.removeChannel(readReceiptsChannelRef.current)
      readReceiptsChannelRef.current = null
    }

    const channel = supabase
      .channel("group-read-receipts")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "group_message_reads"
        },
        (payload) => {
          const row = payload.new
          console.log("[GroupChat] group_message_reads INSERT:", row)
          if (!row?.message_id || !messageIdsRef.current.has(row.message_id)) {
            console.log("[GroupChat] message_id not tracked, ignoring")
            return
          }

          setMessageReadsById((prev) => {
            const current = prev[row.message_id] || []
            const hasExisting = current.some((entry) => entry.user_id === row.user_id)
            if (hasExisting) {
              console.log("[GroupChat] user already read this message")
              return prev
            }

            const profile = getMemberProfileById(row.user_id)
            console.log("[GroupChat] Adding read entry for message", row.message_id, "user", row.user_id)
            return {
              ...prev,
              [row.message_id]: [
                ...current,
                {
                  user_id: row.user_id,
                  read_at: row.read_at,
                  profile
                }
              ]
            }
          })
        }
      )
      .subscribe()

    readReceiptsChannelRef.current = channel

    return () => {
      supabase.removeChannel(channel)
      if (readReceiptsChannelRef.current === channel) {
        readReceiptsChannelRef.current = null
      }
    }
  }, [getMemberProfileById])

  useEffect(() => {
    if (!activeGroupId) return

    if (isPrependingOlderRef.current) {
      return
    }

    requestAnimationFrame(() => {
      bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
    })
  }, [activeGroupId, messages.length])

  useEffect(() => {
    const handleClickOutside = () => {
      setMembersDropdownOpen(false)
    }

    if (membersDropdownOpen) {
      document.addEventListener("click", handleClickOutside)
      return () => document.removeEventListener("click", handleClickOutside)
    }

    return undefined
  }, [membersDropdownOpen])

  useEffect(() => {
    setOpenMessageOptionsId(null)
  }, [activeGroupId])

  return (
    <div className="mx-auto flex h-[calc(100dvh-144px)] min-w-0 w-full max-w-[1300px] flex-col overflow-hidden px-2 pt-1 md:px-3 dark:text-slate-100">
      <h1 className="mb-1 shrink-0 text-3xl font-bold text-slate-800 dark:text-slate-100">Group Chat</h1>

      {error && (
        <div className="mb-2 shrink-0 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid min-h-0 min-w-0 w-full flex-1 grid-cols-1 gap-2 overflow-hidden rounded-2xl bg-white dark:bg-slate-900 p-1.5 shadow-[0_4px_20px_rgba(0,0,0,0.05)] lg:grid-cols-[310px,minmax(0,1fr)]">
        <section className="flex min-h-0 flex-col rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-[0_6px_24px_rgba(15,23,42,0.06)]">
          <div className="border-b border-slate-200 dark:border-slate-700 px-3 py-2.5">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Groups</h2>
              <button
                type="button"
                onClick={() => setNewGroupModalOpen(true)}
                className="inline-flex items-center justify-center rounded-lg bg-yellow-400 p-1 text-black transition-colors hover:bg-yellow-500"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14m7-7H5" />
                </svg>
              </button>
            </div>

            <input
              value={groupSearch}
              onChange={(event) => setGroupSearch(event.target.value)}
              placeholder="Search groups..."
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none transition focus:border-[#f4b400]"
            />
          </div>

          <div
            ref={groupListRef}
            onScroll={handleGroupListScroll}
            className="min-h-0 flex-1 overflow-y-auto"
          >
            {loadingGroups ? (
              <div className="space-y-3 p-4">
                {Array.from({ length: 5 }).map((_, index) => (
                  <div key={index} className="h-16 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
                ))}
              </div>
            ) : filteredGroups.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-slate-500 dark:text-slate-400">No groups yet.</p>
            ) : (
              filteredGroups.map((group) => {
                const isActive = group.id === activeGroupId
                const lastMessagePreview = group.last_message?.substring(0, 40) || "No messages yet"
                const lastMessageTime = group.last_message_at ? dayjs(group.last_message_at).fromNow() : ""

                return (
                  <button
                    key={group.id}
                    type="button"
                    onClick={() => setActiveGroupId(group.id)}
                    className={`w-full border-b border-slate-200 dark:border-slate-700 px-3 py-2.5 text-left transition-all duration-200 ${
                      isActive ? "bg-slate-100 dark:bg-slate-800" : "hover:bg-slate-50 dark:hover:bg-slate-800"
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-yellow-200 text-sm font-semibold text-yellow-700">
                        {group.name.charAt(0).toUpperCase()}
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{group.name}</p>
                        <p className="mt-1 truncate text-[0.8125rem] text-slate-400">{lastMessagePreview}</p>
                      </div>

                      <p className="shrink-0 text-[11px] text-slate-500 dark:text-slate-400">{lastMessageTime}</p>
                    </div>
                  </button>
                )
              })
            )}

            {!loadingGroups && loadingMoreGroups && (
              <div className="px-4 py-3 text-center text-xs text-slate-500 dark:text-slate-400">Loading more groups...</div>
            )}
          </div>
        </section>

        <section className="chat-wrapper flex h-full min-h-0 min-w-0 w-full flex-col overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-[0_6px_24px_rgba(15,23,42,0.06)]">
          {activeGroup ? (
            <>
              <div className="shrink-0 border-b border-slate-200 dark:border-slate-700 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{activeGroup.name}</h2>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {groupMembers.length} {groupMembers.length === 1 ? "member" : "members"}
                    </p>
                  </div>

                  <div className="relative">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation()
                        setMembersDropdownOpen((prev) => !prev)
                      }}
                      className="rounded-lg px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      Members
                    </button>

                    {membersDropdownOpen && (
                      <div
                        className="absolute right-0 top-full z-20 mt-2 w-56 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <div className="max-h-64 overflow-y-auto">
                          {groupMembers.map((member) => (
                            <div
                              key={member.user_id}
                              className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-700 px-3 py-2 last:border-b-0"
                            >
                              {member.profiles?.avatar_url ? (
                                <img
                                  src={member.profiles.avatar_url}
                                  alt={getDisplayName(member.profiles)}
                                  className="h-6 w-6 rounded-full object-cover"
                                />
                              ) : (
                                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-200 text-[10px] font-semibold text-slate-600">
                                  {getDisplayName(member.profiles).charAt(0).toUpperCase()}
                                </div>
                              )}

                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                                  {getDisplayName(member.profiles)}
                                </p>
                              </div>

                              {member.role === "admin" && (
                                <span className="rounded bg-yellow-50 px-2 py-0.5 text-[10px] font-semibold text-yellow-600">
                                  Admin
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div
                ref={messageListRef}
                onScroll={handleMessageListScroll}
                onClick={() => setOpenMessageOptionsId(null)}
                className="message-list min-h-0 min-w-0 w-full flex-1 overflow-y-auto overflow-x-hidden px-4 py-4"
              >
                {loadingOlderMessages && (
                  <div className="mb-2 text-center text-xs text-slate-500 dark:text-slate-400">Loading older messages...</div>
                )}
                {loadingMessages ? (
                  <div className="flex h-full items-center justify-center">
                    <p className="text-slate-500 dark:text-slate-400">Loading messages...</p>
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex h-full items-center justify-center">
                    <p className="text-slate-500 dark:text-slate-400">No messages yet. Start the conversation!</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {messages.map((message) => {
                      const isOwn = message.sender_id === contextUser?.id
                      const sender = message.profiles || getMemberProfileById(message.sender_id)
                      const reads = messageReadsById[message.id] || []
                      const seenCount = reads.filter((entry) => entry.user_id !== message.sender_id).length

                      if (isOwn) {
                        console.log("group seenCount", seenCount, message.id, "reads:", reads.length)
                      }

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
                                  alt={getDisplayName(sender)}
                                  className="h-6 w-6 shrink-0 rounded-full object-cover"
                                />
                              ) : (
                                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[10px] font-semibold text-slate-600">
                                  {getDisplayName(sender).charAt(0).toUpperCase()}
                                </div>
                              )}
                            </>
                          )}

                          <div className={`relative flex min-w-0 max-w-[75%] md:max-w-[65%] flex-col ${isOwn ? "items-end" : "items-start"}`}>
                            {!isOwn && (
                              <p className="mb-1 text-xs font-semibold text-slate-600">{getDisplayName(sender)}</p>
                            )}

                            <div className="relative w-fit max-w-sm">
                              <div
                                className={`rounded-2xl px-3 py-2.5 text-sm shadow-sm ${
                                  isOwn ? "bg-yellow-400 text-yellow-900" : "bg-slate-100 text-slate-900 dark:text-slate-100"
                                }`}
                              >
                                <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{message.content}</p>
                              </div>

                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation()
                                  setOpenMessageOptionsId((prev) => (prev === message.id ? null : message.id))
                                }}
                                className={`absolute right-0 -top-8 inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 shadow-sm transition hover:bg-slate-100 dark:hover:bg-slate-800 ${
                                  openMessageOptionsId === message.id ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                                }`}
                                title="More options"
                                aria-label="Open message options"
                              >
                                <MoreHorizontal className="h-3.5 w-3.5" />
                              </button>

                              {openMessageOptionsId === message.id && (
                                <div
                                  className="absolute right-0 top-full z-40 mt-2 min-w-[190px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-1.5 text-slate-800 dark:text-slate-100 shadow-lg"
                                  onClick={(event) => event.stopPropagation()}
                                >
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setReplyTarget(message)
                                      setOpenMessageOptionsId(null)
                                      requestAnimationFrame(() => inputRef.current?.focus())
                                    }}
                                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition hover:bg-slate-100 dark:hover:bg-slate-800"
                                  >
                                    <Reply className="h-3.5 w-3.5" />
                                    Reply
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => {
                                      handleCopyMessage(message)
                                      setOpenMessageOptionsId(null)
                                    }}
                                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition hover:bg-slate-100 dark:hover:bg-slate-800"
                                  >
                                    <Copy className="h-3.5 w-3.5" />
                                    Copy
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => {
                                      handleForwardMessage(message)
                                      setOpenMessageOptionsId(null)
                                    }}
                                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition hover:bg-slate-100 dark:hover:bg-slate-800"
                                  >
                                    <Forward className="h-3.5 w-3.5" />
                                    Forward
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => {
                                      handleReactToMessage()
                                      setOpenMessageOptionsId(null)
                                    }}
                                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition hover:bg-slate-100 dark:hover:bg-slate-800"
                                  >
                                    <SmilePlus className="h-3.5 w-3.5" />
                                    React
                                  </button>

                                  {isOwn && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        handleDeleteMessage(message)
                                        setOpenMessageOptionsId(null)
                                      }}
                                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-red-600 transition hover:bg-red-50"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                      Delete
                                    </button>
                                  )}

                                  <button
                                    type="button"
                                    onClick={() => {
                                      setMessageInfoMessageId(message.id)
                                      setOpenMessageOptionsId(null)
                                    }}
                                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition hover:bg-slate-100 dark:hover:bg-slate-800"
                                  >
                                    <Info className="h-3.5 w-3.5" />
                                    Message info
                                  </button>
                                </div>
                              )}
                            </div>

                            <div className="mt-1 flex items-center gap-2 text-[10px] text-slate-500 dark:text-slate-400">
                              <span>{dayjs(message.created_at).format("HH:mm")}</span>
                              {isOwn && (
                                <span className="inline-flex items-center gap-1 text-slate-500 dark:text-slate-400" title="Delivered">
                                  <span className="font-semibold tracking-[-0.08em]">✓✓</span>
                                  {seenCount > 0 && (
                                    <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                                      {seenCount}
                                    </span>
                                  )}
                                </span>
                              )}
                            </div>

                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}

                <div ref={bottomRef} />
              </div>

              <div className="sticky bottom-0 z-10 shrink-0 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3">
                {replyTarget && (
                  <div className="mb-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-semibold text-slate-600">
                          Replying to {getDisplayName(replyTarget.profiles || getMemberProfileById(replyTarget.sender_id))}
                        </p>
                        <p className="truncate text-xs text-slate-500 dark:text-slate-400">{replyTarget.content || "[message]"}</p>
                      </div>

                      <button
                        type="button"
                        onClick={() => setReplyTarget(null)}
                        className="rounded p-1 text-slate-500 dark:text-slate-400 transition hover:bg-slate-200 hover:text-slate-700"
                        aria-label="Cancel reply"
                      >
                        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </div>
                )}

                <div className="flex gap-2">
                  <input
                    ref={inputRef}
                    type="text"
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault()
                        sendMessage()
                      }
                    }}
                    placeholder="Type your message..."
                    className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-[#f4b400]"
                  />

                  <button
                    type="button"
                    onClick={sendMessage}
                    disabled={!draft.trim() || sending}
                    className="rounded-lg bg-yellow-400 px-4 py-2 font-medium text-yellow-900 transition-colors hover:bg-yellow-500 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    {sending ? "..." : "Send"}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex h-full items-center justify-center">
              <p className="text-slate-500 dark:text-slate-400">Select or create a group to start chatting</p>
            </div>
          )}
        </section>
      </div>

      {newGroupModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-md rounded-xl bg-white dark:bg-slate-900 p-6 shadow-xl">
            <h3 className="mb-4 text-lg font-semibold text-slate-900 dark:text-slate-100">Create New Group</h3>

            <div className="mb-4">
              <label className="mb-1 block text-sm font-medium text-slate-700">Group Name</label>
              <input
                type="text"
                value={newGroupName}
                onChange={(event) => setNewGroupName(event.target.value)}
                placeholder="Enter group name..."
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none transition focus:border-[#f4b400]"
              />
            </div>

            <div className="mb-4">
              <label className="mb-1 block text-sm font-medium text-slate-700">Add Members</label>
              <input
                type="text"
                value={newGroupUserSearch}
                onChange={(event) => setNewGroupUserSearch(event.target.value)}
                placeholder="Search by username..."
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none transition focus:border-[#f4b400]"
              />

              {newGroupUserSearch.trim() && (
                <div className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50">
                  {newGroupUserSearchLoading ? (
                    <p className="p-3 text-center text-sm text-slate-500 dark:text-slate-400">Searching...</p>
                  ) : newGroupUserSearchResults.length === 0 ? (
                    <p className="p-3 text-center text-sm text-slate-500 dark:text-slate-400">No users found.</p>
                  ) : (
                    newGroupUserSearchResults.map((profile) => (
                      <button
                        key={profile.id}
                        type="button"
                        onClick={() => {
                          setNewGroupSelectedUsers((prev) => [...prev, profile])
                          setNewGroupUserSearch("")
                          setNewGroupUserSearchResults([])
                        }}
                        className="flex w-full items-center gap-2 border-b border-slate-200 px-3 py-2 text-left hover:bg-slate-100 last:border-0"
                      >
                        {profile.avatar_url ? (
                          <img
                            src={profile.avatar_url}
                            alt={profile.name || profile.username}
                            className="h-7 w-7 rounded-full object-cover"
                          />
                        ) : (
                          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-300 text-xs font-semibold text-slate-700">
                            {(profile.name || profile.username || "?").charAt(0).toUpperCase()}
                          </div>
                        )}

                        <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                          {profile.name || profile.username}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              )}

              {newGroupSelectedUsers.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {newGroupSelectedUsers.map((user) => (
                    <div key={user.id} className="inline-flex items-center gap-2 rounded-full bg-yellow-100 px-3 py-1">
                      <span className="text-sm font-medium text-yellow-900">{user.name || user.username}</span>
                      <button
                        type="button"
                        onClick={() =>
                          setNewGroupSelectedUsers((prev) => prev.filter((item) => item.id !== user.id))
                        }
                        className="text-yellow-700 transition hover:text-yellow-900"
                      >
                        X
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setNewGroupModalOpen(false)
                  setNewGroupName("")
                  setNewGroupUserSearch("")
                  setNewGroupSelectedUsers([])
                }}
                className="rounded-lg px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={createGroup}
                disabled={creatingGroup || !newGroupName.trim() || newGroupSelectedUsers.length === 0}
                className="rounded-lg bg-yellow-400 px-4 py-2 text-sm font-medium text-yellow-900 transition-colors hover:bg-yellow-500 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {creatingGroup ? "Creating..." : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}

      {messageInfoMessageId && (() => {
        const msg = messages.find((m) => m.id === messageInfoMessageId)
        if (!msg) return null
        
        // Only show delivery/read details for sender's own messages
        const isOwnMessage = msg.sender_id === contextUser?.id
        const reads = messageReadsById[msg.id] || []
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
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
            <div className="w-full max-w-md rounded-xl bg-white dark:bg-slate-900 p-6 shadow-xl">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Message info</h3>
                <button
                  type="button"
                  onClick={() => setMessageInfoMessageId(null)}
                  className="rounded p-1 text-slate-500 dark:text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                  aria-label="Close message info"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="mt-4 max-h-[400px] space-y-3 overflow-y-auto pr-1">
                {isOwnMessage ? (
                  <>
                    {/* Delivered To Section */}
                    {deliveredMembers.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">Delivered to</p>
                        <div className="space-y-1.5">
                          {deliveredMembers.map((member) => (
                            <div key={member.user_id} className="flex items-center gap-2">
                              {member.profiles?.avatar_url ? (
                                <img
                                  src={member.profiles.avatar_url}
                                  alt={getDisplayName(member.profiles)}
                                  className="h-7 w-7 rounded-full object-cover shrink-0"
                                />
                              ) : (
                                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-200 text-[10px] font-semibold text-slate-600 shrink-0">
                                  {getDisplayName(member.profiles).charAt(0).toUpperCase()}
                                </div>
                              )}
                              <p className="text-slate-700 text-sm">{getDisplayName(member.profiles)}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {/* Read By Section */}
                    {readMembers.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">Read by</p>
                        <div className="space-y-1.5">
                          {readMembers
                            .slice()
                            .sort((a, b) => new Date(b.read_at).getTime() - new Date(a.read_at).getTime())
                            .map((read) => (
                              <div key={`${read.user_id}-${read.read_at}`} className="flex items-center gap-2">
                                {read.profile?.avatar_url ? (
                                  <img
                                    src={read.profile.avatar_url}
                                    alt={getDisplayName(read.profile)}
                                    className="h-7 w-7 rounded-full object-cover shrink-0"
                                  />
                                ) : (
                                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-200 text-[10px] font-semibold text-slate-600 shrink-0">
                                    {getDisplayName(read.profile).charAt(0).toUpperCase()}
                                  </div>
                                )}
                                <div className="min-w-0 flex-1">
                                  <p className="text-slate-700 truncate text-sm">{getDisplayName(read.profile)}</p>
                                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
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
                      <p className="text-slate-500 dark:text-slate-400 text-sm">No members yet in this group.</p>
                    )}
                  </>
                ) : (
                  <p className="text-slate-500 dark:text-slate-400 text-sm">Message info only available for your messages.</p>
                )}
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
