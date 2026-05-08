import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import dayjs from "dayjs"
import relativeTime from "dayjs/plugin/relativeTime"
import utc from "dayjs/plugin/utc"
import { supabase } from "../lib/supabase"
import { useAuth } from "../hooks/useAuth"
import { useToast } from "../hooks/useToast"
import { decrypt, encrypt, exportKey, generateKey, importKey } from "../utils/encryption"
import { Copy, Forward, Info, MoreHorizontal, MoreVertical, Reply, SmilePlus, Trash2 } from "lucide-react"
import { useRouteScrollRestoration } from "../hooks/useRouteScrollRestoration"
import { useNavigationStore } from "../stores/navigationStore"
import { useChatStore } from "../stores/chatStore"
import { usePostCacheStore } from "../stores/postCacheStore"
import PostPreview from "../components/PostPreview"
import { DropdownMenu } from "../components/DropdownMenu"

dayjs.extend(relativeTime)
dayjs.extend(utc)

const MESSAGE_BATCH_SIZE = 20
const GROUP_BATCH_SIZE = 15

const getProfileDisplayName = (profile) => {
  if (!profile) return "Unknown"
  return profile.name || profile.username || "Unknown"
}

const GroupMessageRow = memo(function GroupMessageRow({
  message,
  isOwn,
  sender,
  messageReadsByIdRef,
  actionsRef
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 })
  const reads = messageReadsByIdRef.current[message.id] || []
  const seenCount = reads.filter((entry) => entry.user_id !== message.sender_id).length

  const handleOpenMenu = (event) => {
    event.preventDefault()
    event.stopPropagation()
    const x = event.clientX || (event.touches && event.touches[0]?.clientX) || 0
    const y = event.clientY || (event.touches && event.touches[0]?.clientY) || 0
    setMenuPosition({ x, y })
    setMenuOpen(true)
    if (import.meta.env.DEV) {
      console.log("[GroupMenuOpen]", { messageId: message.id })
    }
  }

  return (
    <div
      className={`group relative flex min-w-0 gap-2 ${isOwn ? "justify-end" : "justify-start"}`}
    >
      {!isOwn && (
        <>
          {sender?.avatar_url ? (
            <img
              src={sender.avatar_url}
              alt={getProfileDisplayName(sender)}
              className="h-6 w-6 shrink-0 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[10px] font-semibold text-slate-600">
              {getProfileDisplayName(sender).charAt(0).toUpperCase()}
            </div>
          )}
        </>
      )}

      <div className={`relative flex min-w-0 max-w-[75%] md:max-w-[65%] flex-col ${isOwn ? "items-end" : "items-start"}`}>
        {!isOwn && (
          <p className="mb-1 text-xs font-semibold text-slate-600">{getProfileDisplayName(sender)}</p>
        )}

        <div className="relative w-fit max-w-sm">
          <div
            className={`rounded-2xl px-3 py-2.5 text-sm shadow-sm ${
              isOwn ? "bg-yellow-400 text-yellow-900" : "bg-slate-100 text-slate-900 dark:text-slate-100"
            }`}
          >
            {message.type === "post" ? (
              <PostPreview post_id={message.post_id} isMine={isOwn} />
            ) : (
              <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{message.content}</p>
            )}
          </div>

          <button
            type="button"
            onPointerDown={handleOpenMenu}
            onClick={(event) => event.preventDefault()}
            className="absolute right-0 -top-8 z-20 inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 text-slate-600 dark:text-slate-300 shadow-sm transition hover:bg-slate-100 dark:hover:bg-slate-800 opacity-70 group-hover:opacity-100"
            title="More options"
            aria-label="Open message options"
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </button>

          {menuOpen && (
            <DropdownMenu
              x={menuPosition.x}
              y={menuPosition.y}
              onClose={() => setMenuOpen(false)}
            >
              <button
                type="button"
                onClick={() => {
                  actionsRef.current.onReply?.(message)
                  setMenuOpen(false)
                }}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <Reply className="h-3.5 w-3.5" />
                Reply
              </button>

              <button
                type="button"
                onClick={() => {
                  actionsRef.current.onCopy?.(message)
                  setMenuOpen(false)
                }}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <Copy className="h-3.5 w-3.5" />
                Copy
              </button>

              <button
                type="button"
                onClick={() => {
                  actionsRef.current.onForward?.(message)
                  setMenuOpen(false)
                }}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <Forward className="h-3.5 w-3.5" />
                Forward
              </button>

              <button
                type="button"
                onClick={() => {
                  actionsRef.current.onReact?.(message)
                  setMenuOpen(false)
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
                    actionsRef.current.onDelete?.(message)
                    setMenuOpen(false)
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
                  actionsRef.current.onInfo?.(message)
                  setMenuOpen(false)
                }}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <Info className="h-3.5 w-3.5" />
                Message info
              </button>
            </DropdownMenu>
          )}
        </div>

        <div className="mt-1 flex items-center gap-2 text-[10px] text-slate-500 dark:text-slate-400">
          <span>{dayjs(message.created_at).format("HH:mm")}</span>
          {isOwn && (
            <span className="inline-flex items-center gap-1 text-slate-500 dark:text-slate-400" title="Delivered">
              <span className="font-semibold tracking-[-0.08em]">âœ“âœ“</span>
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
})

const MemberRow = memo(function MemberRow({ member, isAdmin, isCurrentUser, onMakeAdmin, onRemove }) {
  return (
    <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-700 px-3 py-2 last:border-b-0">
      {member.profiles?.avatar_url ? (
        <img
          src={member.profiles.avatar_url}
          alt={getProfileDisplayName(member.profiles)}
          className="h-6 w-6 rounded-full object-cover"
        />
      ) : (
        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-200 text-[10px] font-semibold text-slate-600">
          {getProfileDisplayName(member.profiles).charAt(0).toUpperCase()}
        </div>
      )}

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
          {getProfileDisplayName(member.profiles)}
        </p>
      </div>

      <div className="flex items-center gap-1.5">
        {member.role === "admin" && (
          <span className="rounded bg-yellow-50 px-2 py-0.5 text-[10px] font-semibold text-yellow-600">
            Admin
          </span>
        )}
        {isAdmin && !isCurrentUser && (
          <div className="flex items-center gap-1">
            {member.role === "member" && (
              <button
                type="button"
                onClick={onMakeAdmin}
                className="rounded px-1.5 py-0.5 text-[10px] font-medium text-slate-600 transition hover:bg-slate-100"
              >
                Make admin
              </button>
            )}
            <button
              type="button"
              onClick={onRemove}
              className="rounded px-1.5 py-0.5 text-[10px] font-medium text-red-600 transition hover:bg-red-50"
            >
              Remove
            </button>
          </div>
        )}
      </div>
    </div>
  )
})

export default function GroupChat() {
  const { user: contextUser } = useAuth()
  const { success: showSuccess, error: showToastError } = useToast()
  const cachedGroups = useChatStore((state) => state.groupConversations)
  const cachedActiveGroupId = useChatStore((state) => state.activeGroupId)
  const setGroupConversationsCache = useChatStore((state) => state.setGroupConversations)
  const setActiveGroupIdCache = useChatStore((state) => state.setActiveGroupId)
  const setGroupMessagesCache = useChatStore((state) => state.setGroupMessages)
  const shouldFetchGroupConversations = useChatStore((state) => state.shouldFetchGroupConversations)
  const shouldFetchGroupMessages = useChatStore((state) => state.shouldFetchGroupMessages)
  const setScrollPosition = useNavigationStore((state) => state.setScrollPosition)

  const [groups, setGroups] = useState(cachedGroups || [])
  const [activeGroupId, setActiveGroupId] = useState(cachedActiveGroupId || null)
  const [loadingGroups, setLoadingGroups] = useState((cachedGroups || []).length === 0)
  const [groupPage, setGroupPage] = useState(0)
  const [hasMoreGroups, setHasMoreGroups] = useState(true)
  const [loadingMoreGroups, setLoadingMoreGroups] = useState(false)
  const [groupSearch, setGroupSearch] = useState("")
  const [groupPreferencesById, setGroupPreferencesById] = useState({})
  const [openGroupOptionsId, setOpenGroupOptionsId] = useState(null)
  const [groupMenuPosition, setGroupMenuPosition] = useState({ x: 0, y: 0 })
  const [groupActionsOpen, setGroupActionsOpen] = useState(false)
  const [groupActionsPosition, setGroupActionsPosition] = useState({ x: 0, y: 0 })

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
  const [memberSearchQuery, setMemberSearchQuery] = useState("")
  const [memberSearchResults, setMemberSearchResults] = useState([])
  const [memberSearchLoading, setMemberSearchLoading] = useState(false)

  const [messageReadsById, setMessageReadsById] = useState({})
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
  const groupListChannelRef = useRef(null)
  const groupMembershipChannelRef = useRef(null)
  const groupMembersCacheRef = useRef(new Map())
  const groupMembersProfileMapRef = useRef(new Map())
  const groupPreferencesByIdRef = useRef({})
  const messageReadsByIdRef = useRef({})
  const messagesRef = useRef([])
  const activeGroupIdRef = useRef(activeGroupId)
  const groupKeyRef = useRef(null)
  const actionsRef = useRef({})
  const messageIdsRef = useRef(new Set())
  const deletedBeforeTimestampByGroupIdRef = useRef({})
  const groupListScrollRafRef = useRef(null)
  const messageListScrollRafRef = useRef(null)
  const isPrependingOlderRef = useRef(false)
  const isRestoringMessageScrollRef = useRef(true)
  useRouteScrollRestoration("group-chat-page")

  useEffect(() => {
    return () => {
      if (groupListScrollRafRef.current) {
        cancelAnimationFrame(groupListScrollRafRef.current)
      }
      if (messageListScrollRafRef.current) {
        cancelAnimationFrame(messageListScrollRafRef.current)
      }
    }
  }, [])

  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  useEffect(() => {
    activeGroupIdRef.current = activeGroupId
  }, [activeGroupId])

  useEffect(() => {
    groupKeyRef.current = groupKey
  }, [groupKey])

  const applyMessages = useCallback((nextValue) => {
    setMessages((prev) => {
      const next = typeof nextValue === "function" ? nextValue(prev) : (nextValue || [])
      const currentGroupId = activeGroupIdRef.current
      if (currentGroupId) {
        setGroupMessagesCache(currentGroupId, next)
      }
      return next
    })
  }, [setGroupMessagesCache])

  const activeGroup = useMemo(
    () => groups.find((group) => group.id === activeGroupId) || null,
    [groups, activeGroupId]
  )

  const isPreferenceDeleted = useCallback((preference) => preference?.is_deleted === true, [])

  const visibleGroups = useMemo(
    () => groups.filter((group) => !isPreferenceDeleted(groupPreferencesById[group.id])),
    [groups, groupPreferencesById, isPreferenceDeleted]
  )

  const filteredGroups = useMemo(
    () => visibleGroups.filter((group) => group.name.toLowerCase().includes(groupSearch.toLowerCase())),
    [visibleGroups, groupSearch]
  )

  const groupIdsKey = useMemo(
    () => groups.map((group) => group.id).filter(Boolean).join(","),
    [groups]
  )

  const messageInfoReads = useMemo(() => {
    if (!messageInfoMessageId) return []
    return messageReadsById[messageInfoMessageId] || []
  }, [messageInfoMessageId, messageReadsById])

  const currentUserMember = useMemo(
    () => groupMembers.find((member) => member.user_id === contextUser?.id) || null,
    [contextUser?.id, groupMembers]
  )

  const isCurrentUserAdmin = useMemo(
    () => currentUserMember?.role === "admin",
    [currentUserMember]
  )

  const isMembersDropdownOpen = membersDropdownOpen

  const renderedMembers = useMemo(() => {
    if (import.meta.env.DEV && isMembersDropdownOpen) {
      console.log("[GroupMembersRender]", { count: groupMembers.length })
    }

    return groupMembers.map((member) => (
      <MemberRow
        key={member.user_id}
        member={member}
        isAdmin={isCurrentUserAdmin}
        isCurrentUser={member.user_id === contextUser?.id}
        onMakeAdmin={() => handleMakeMemberAdmin(member.user_id)}
        onRemove={() => handleRemoveMember(member.user_id)}
      />
    ))
  }, [contextUser?.id, groupMembers, handleMakeMemberAdmin, handleRemoveMember, isCurrentUserAdmin, isMembersDropdownOpen])

  const getDisplayName = useCallback((profile) => {
    return getProfileDisplayName(profile)
  }, [])

  useEffect(() => {
    groupMembersProfileMapRef.current = new Map(
      groupMembers
        .filter((member) => member?.user_id)
        .map((member) => [member.user_id, member.profiles || null])
    )
  }, [groupMembers])

  useEffect(() => {
    groupPreferencesByIdRef.current = groupPreferencesById
  }, [groupPreferencesById])

  useEffect(() => {
    messageReadsByIdRef.current = messageReadsById
  }, [messageReadsById])

  const getMemberProfileById = useCallback((userId) => {
    return groupMembersProfileMapRef.current.get(userId) || null
  }, [])

  const sortGroupsByLatest = useCallback((list) => {
    const next = Array.isArray(list) ? [...list] : []
    return next.sort((a, b) => {
      const aTime = a.last_message_at || a.created_at
      const bTime = b.last_message_at || b.created_at
      return new Date(bTime || 0).getTime() - new Date(aTime || 0).getTime()
    })
  }, [])

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

  const fetchGroups = useCallback(async ({ force = false, silent = false } = {}) => {
    if (!contextUser?.id) return

    if (!force && groups.length > 0 && !shouldFetchGroupConversations()) {
      setLoadingGroups(false)
      return
    }

    try {
      if (!silent) {
        setLoadingGroups(true)
      }
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
      setGroupConversationsCache(list)

      if (list.length < GROUP_BATCH_SIZE) {
        setHasMoreGroups(false)
      }

      setActiveGroupId((prev) => {
        if (prev && list.some((group) => group.id === prev)) {
          return prev
        }

        const firstVisible = list.find((group) => !isPreferenceDeleted(groupPreferencesById[group.id]))
        return firstVisible?.id || null
      })
    } catch (err) {
      console.error("[GroupChat] Exception fetching groups:", err)
      setError("Failed to load groups")
    } finally {
      if (!silent) {
        setLoadingGroups(false)
      }
    }
  }, [contextUser?.id, groups.length, groupPreferencesById, isPreferenceDeleted, setGroupConversationsCache, shouldFetchGroupConversations])

  const fetchGroupPreferences = useCallback(async (userId, groupIds = []) => {
    if (!userId || groupIds.length === 0) {
      setGroupPreferencesById({})
      return
    }

    try {
      const { data, error: fetchError } = await supabase
        .from("conversation_preferences")
        .select("group_id, is_archived, is_deleted, updated_at")
        .eq("user_id", userId)
        .is("conversation_id", null)
        .in("group_id", groupIds)

      if (fetchError) {
        console.error("[GroupChat] Failed to fetch group preferences:", fetchError)
        return
      }

      const mapped = {}
      ;(data || []).forEach((row) => {
        if (!row?.group_id) return
        mapped[row.group_id] = {
          is_archived: row.is_archived === true,
          is_deleted: row.is_deleted === true,
          updated_at: row.updated_at || null
        }
      })

      setGroupPreferencesById(mapped)
      return mapped
    } catch (err) {
      console.error("[GroupChat] Exception fetching group preferences:", err)
      return {}
    }
  }, [])

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
        [groupId]: {
          ...nextPreference,
          updated_at: new Date().toISOString()
        }
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
        console.error("[GroupChat] Failed to update group preference:", upsertError)
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
        const merged = [...prev, ...newUniqueGroups]
        setGroupConversationsCache(merged)
        return merged
      })

      setGroupPage(nextPage)
    } catch (err) {
      console.error("[GroupChat] Exception loading more groups:", err)
    } finally {
      setLoadingMoreGroups(false)
    }
  }, [contextUser?.id, groupPage, hasMoreGroups, loadingGroups, loadingMoreGroups, setGroupConversationsCache])

  const handleGroupListScroll = useCallback(() => {
    if (groupListScrollRafRef.current) return

    groupListScrollRafRef.current = requestAnimationFrame(() => {
      groupListScrollRafRef.current = null

      const container = groupListRef.current
      if (!container) return

      setScrollPosition("groupchat-group-list", container.scrollTop)

      if (container.scrollHeight - container.scrollTop - container.clientHeight < 80) {
        void loadMoreGroups()
      }
    })
  }, [loadMoreGroups, setScrollPosition])

  const fetchGroupMembers = useCallback(async (groupId, { force = false } = {}) => {
    if (!groupId) return

    const cached = groupMembersCacheRef.current.get(groupId)
    if (!force && cached) {
      if (import.meta.env.DEV) {
        console.log("[GroupMembersCacheHit]", { groupId, count: cached.length })
      }
      setGroupMembers(cached)
      return
    }

    if (import.meta.env.DEV) {
      console.log("[GroupMembersFetch]", { groupId, force })
    }

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

      const nextMembers = data || []
      groupMembersCacheRef.current.set(groupId, nextMembers)
      setGroupMembers(nextMembers)
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

  const fetchGroupMessageReads = useCallback(async (messageIds, { onlyNewIds = true } = {}) => {
    const ids = [...new Set((messageIds || []).filter(Boolean))]
    if (ids.length === 0) {
      setMessageReadsById({})
      return {}
    }

    const idsToFetch = onlyNewIds
      ? ids.filter((id) => !Object.prototype.hasOwnProperty.call(messageReadsByIdRef.current, id))
      : ids

    if (idsToFetch.length === 0) {
      return {}
    }

    try {
      const { data, error: readsError } = await supabase
        .from("group_message_reads")
        .select("message_id, user_id, read_at, profiles(id, username, name, avatar_url)")
        .in("message_id", idsToFetch)

      if (readsError) {
        console.error("[GroupChat] Error fetching read receipts:", readsError)
        return {}
      }

      const mapped = idsToFetch.reduce((acc, id) => {
        acc[id] = []
        return acc
      }, {})
      ;(data || []).forEach((row) => {
        if (!row?.message_id) return
        if (!mapped[row.message_id]) mapped[row.message_id] = []

        mapped[row.message_id].push({
          user_id: row.user_id,
          read_at: row.read_at,
          profile: row.profiles || null
        })
      })

      setMessageReadsById((prev) => ({
        ...prev,
        ...mapped
      }))
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

  const enrichMessagesWithPosts = useCallback(async (messages) => {
    const nextMessages = messages || []
    const postIds = [...new Set(nextMessages.map((msg) => msg.post_id).filter(Boolean))]
    if (postIds.length === 0) return nextMessages

    try {
      const { data, error: postsError } = await supabase
        .from("posts")
        .select("id, content, image_url, updated_at, is_edited")
        .in("id", postIds)

      if (postsError) {
        console.warn("[GroupChat] Failed to enrich posts for messages:", postsError)
        return nextMessages
      }

      const postsById = new Map((data || []).map((post) => [post.id, post]))
      return nextMessages.map((msg) => (
        msg.post_id ? { ...msg, post: postsById.get(msg.post_id) || null } : msg
      ))
    } catch (err) {
      console.warn("[GroupChat] Failed to enrich posts for messages:", err)
      return nextMessages
    }
  }, [])

  const hydrateMessages = useCallback(
    async (rows) => {
      const nextRows = rows || []

      const hydrated = await Promise.all(
        nextRows.map(async (message) => {
          let content = message.content || ""
          const currentGroupKey = groupKeyRef.current

          if (message.is_encrypted && message.encrypted_content && message.iv && currentGroupKey) {
            try {
              content = await decrypt(message.encrypted_content, message.iv, currentGroupKey)
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

      return enrichMessagesWithPosts(hydrated)
    },
    [enrichMessagesWithPosts, getMemberProfileById]
  )

  const hydrateAndSetMessages = useCallback(
    async (rows, expectedGroupId = null) => {
      const decrypted = await hydrateMessages(rows)
      if (expectedGroupId && activeGroupIdRef.current !== expectedGroupId) return

      setMessages(decrypted)
      messageIdsRef.current = new Set(decrypted.map((msg) => msg.id))

      const ids = decrypted.map((msg) => msg.id)
      await fetchGroupMessageReads(ids)
      if (expectedGroupId && activeGroupIdRef.current !== expectedGroupId) return
      await markGroupMessagesAsRead(decrypted)
    },
    [fetchGroupMessageReads, hydrateMessages, markGroupMessagesAsRead]
  )

  const filterMessagesAfterDeletedBefore = useCallback((groupId, rows) => {
    const deletedBefore = deletedBeforeTimestampByGroupIdRef.current[groupId]
    if (!deletedBefore) return rows || []

    const deletedBeforeTime = new Date(deletedBefore).getTime()
    if (!Number.isFinite(deletedBeforeTime)) return rows || []

    return (rows || []).filter((message) => {
      const messageTime = new Date(message.created_at).getTime()
      return Number.isFinite(messageTime) && messageTime >= deletedBeforeTime
    })
  }, [])

  const fetchGroupMessages = useCallback(async ({ force = false, silent = false } = {}) => {
    if (!activeGroupId) return
    const groupIdAtStart = activeGroupId

    const cachedMessages = useChatStore.getState().groupMessagesByGroupId[groupIdAtStart] || []
    if (!force && cachedMessages.length > 0 && !shouldFetchGroupMessages(groupIdAtStart)) {
      if (activeGroupIdRef.current !== groupIdAtStart) return
      applyMessages(filterMessagesAfterDeletedBefore(groupIdAtStart, cachedMessages))
      return
    }

    try {
      if (!silent) {
        setLoadingMessages(true)
      }
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
          type,
          post_id,
          profiles(id, username, name, avatar_url)
        `)
        .eq("group_id", groupIdAtStart)
        .order("created_at", { ascending: false })
        .limit(MESSAGE_BATCH_SIZE)

      if (activeGroupIdRef.current !== groupIdAtStart) return

      if (fetchError) {
        console.error("[GroupChat] Error fetching messages:", fetchError)
        applyMessages([])
        return
      }

      const fetchedRows = data || []
      const orderedMessages = filterMessagesAfterDeletedBefore(groupIdAtStart, [...fetchedRows].reverse())
      await hydrateAndSetMessages(orderedMessages, groupIdAtStart)

      if (activeGroupIdRef.current !== groupIdAtStart) return

      if (fetchedRows.length < MESSAGE_BATCH_SIZE) {
        setHasMoreMessages(false)
      }
    } catch (err) {
      console.error("[GroupChat] Exception fetching messages:", err)
      if (activeGroupIdRef.current === groupIdAtStart) {
        applyMessages([])
      }
    } finally {
      if (!silent && activeGroupIdRef.current === groupIdAtStart) {
        setLoadingMessages(false)
      }
    }
  }, [activeGroupId, applyMessages, filterMessagesAfterDeletedBefore, hydrateAndSetMessages, shouldFetchGroupMessages])

  const loadOlderMessages = useCallback(async () => {
    if (!activeGroupId || loadingOlderMessages || loadingMessages || !hasMoreMessages) {
      return
    }
    const groupIdAtStart = activeGroupId

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
          type,
          post_id,
          profiles(id, username, name, avatar_url)
        `)
        .eq("group_id", groupIdAtStart)
        .order("created_at", { ascending: false })
        .range(offset, offset + MESSAGE_BATCH_SIZE - 1)

      if (activeGroupIdRef.current !== groupIdAtStart) return

      if (fetchError) {
        console.error("[GroupChat] Error fetching older messages:", fetchError)
        return
      }

      const fetchedRows = data || []
      const orderedMessages = filterMessagesAfterDeletedBefore(groupIdAtStart, [...fetchedRows].reverse())
      const hydratedOlderMessages = await hydrateMessages(orderedMessages)

      if (activeGroupIdRef.current !== groupIdAtStart) return

      let prependedMessages = []
      isPrependingOlderRef.current = true
      applyMessages((prev) => {
        const existingIds = new Set(prev.map((item) => item.id))
        prependedMessages = hydratedOlderMessages.filter((item) => !existingIds.has(item.id))
        if (prependedMessages.length === 0) {
          return prev
        }

        return [...prependedMessages, ...prev]
      })

      if (prependedMessages.length > 0) {
        prependedMessages.forEach((item) => messageIdsRef.current.add(item.id))

        const combinedIds = [...new Set([...messagesRef.current.map((item) => item.id), ...prependedMessages.map((item) => item.id)])]
        await fetchGroupMessageReads(combinedIds)
        if (activeGroupIdRef.current !== groupIdAtStart) {
          isPrependingOlderRef.current = false
          return
        }
        await markGroupMessagesAsRead(prependedMessages)
        if (activeGroupIdRef.current !== groupIdAtStart) {
          isPrependingOlderRef.current = false
          return
        }

        requestAnimationFrame(() => {
          if (activeGroupIdRef.current !== groupIdAtStart) {
            isPrependingOlderRef.current = false
            return
          }
          const currentContainer = messageListRef.current
          if (currentContainer) {
            currentContainer.scrollTop = currentContainer.scrollHeight - previousHeight
          }
          isPrependingOlderRef.current = false
        })
      } else {
        isPrependingOlderRef.current = false
      }

      if (fetchedRows.length < MESSAGE_BATCH_SIZE) {
        setHasMoreMessages(false)
      }

      setMessagePage(nextPage)
    } catch (err) {
      console.error("[GroupChat] Exception loading older messages:", err)
    } finally {
      if (activeGroupIdRef.current === groupIdAtStart) {
        setLoadingOlderMessages(false)
      }
    }
  }, [
    activeGroupId,
    applyMessages,
    fetchGroupMessageReads,
    filterMessagesAfterDeletedBefore,
    hasMoreMessages,
    hydrateMessages,
    loadingMessages,
    loadingOlderMessages,
    markGroupMessagesAsRead,
    messagePage
  ])

  const handleMessageListScroll = useCallback(() => {
    if (messageListScrollRafRef.current) return

    messageListScrollRafRef.current = requestAnimationFrame(() => {
      messageListScrollRafRef.current = null

      const container = messageListRef.current
      if (!container) return

      if (activeGroupId) {
        setScrollPosition(`groupchat-messages-${activeGroupId}`, container.scrollTop)
      }

      if (container.scrollTop < 50) {
        void loadOlderMessages()
      }
    })
  }, [activeGroupId, loadOlderMessages, setScrollPosition])

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
        applyMessages((prev) => [
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
    applyMessages,
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

  const handleAddMemberToGroup = useCallback(
    async (userId) => {
      if (!activeGroupId || !userId) return
      if (!isCurrentUserAdmin) {
        showToastError("Only admins can add members")
        return
      }

      try {
        const { error } = await supabase
          .from("group_members")
          .insert({ group_id: activeGroupId, user_id: userId, role: "member" })

        if (error) {
          console.error("[GroupChat] Error adding member:", error)
          showToastError("Failed to add member")
          return
        }

        await fetchGroupMembers(activeGroupId)
        setMemberSearchQuery("")
        setMemberSearchResults([])
        showSuccess("Member added")
      } catch (err) {
        console.error("[GroupChat] Exception adding member:", err)
        showToastError("Failed to add member")
      }
    },
    [activeGroupId, fetchGroupMembers, isCurrentUserAdmin, showSuccess, showToastError]
  )

  const handleRemoveMember = useCallback(
    async (userId) => {
      if (!activeGroupId || !userId) return
      if (!isCurrentUserAdmin) {
        showToastError("Only admins can remove members")
        return
      }
      if (userId === contextUser?.id) {
        showToastError("Use Leave Group to remove yourself")
        return
      }

      if (import.meta.env.DEV) {
        console.log("[GroupMemberRemove]", { groupId: activeGroupId, userId })
      }

      try {
        const { error } = await supabase
          .from("group_members")
          .delete()
          .eq("group_id", activeGroupId)
          .eq("user_id", userId)

        if (error) {
          console.error("[GroupChat] Error removing member:", error)
          showToastError("Failed to remove member")
          return
        }

        await fetchGroupMembers(activeGroupId)
        showSuccess("Member removed")
      } catch (err) {
        console.error("[GroupChat] Exception removing member:", err)
        showToastError("Failed to remove member")
      }
    },
    [activeGroupId, contextUser?.id, fetchGroupMembers, isCurrentUserAdmin, showSuccess, showToastError]
  )

  const handleMakeMemberAdmin = useCallback(
    async (userId) => {
      if (!activeGroupId || !userId) return
      if (!isCurrentUserAdmin) {
        showToastError("Only admins can update roles")
        return
      }

      try {
        const { error } = await supabase
          .from("group_members")
          .update({ role: "admin" })
          .eq("group_id", activeGroupId)
          .eq("user_id", userId)

        if (error) {
          console.error("[GroupChat] Error updating role:", error)
          showToastError("Failed to update role")
          return
        }

        await fetchGroupMembers(activeGroupId)
        showSuccess("Member is now an admin")
      } catch (err) {
        console.error("[GroupChat] Exception updating role:", err)
        showToastError("Failed to update role")
      }
    },
    [activeGroupId, fetchGroupMembers, isCurrentUserAdmin, showSuccess, showToastError]
  )

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

      applyMessages((prev) => prev.filter((item) => item.id !== message.id))
      showSuccess("Message deleted")
    },
    [contextUser?.id, showSuccess, showToastError, applyMessages]
  )

  const handleReactToMessage = useCallback(() => {
    showSuccess("Reaction picker coming soon")
  }, [showSuccess])

  const logGroupInteraction = useCallback((type, messageId) => {
    if (import.meta.env.DEV) {
      console.log("[GroupInteraction]", { type, messageId })
    }
  }, [])

  const handleReplyMessage = useCallback(
    (message) => {
      if (!message) return
      if (import.meta.env.DEV) {
        console.log("[GroupReply]", { messageId: message.id })
      }
      logGroupInteraction("reply", message.id)
      setReplyTarget(message)
      requestAnimationFrame(() => inputRef.current?.focus())
    },
    [logGroupInteraction]
  )

  const handleReactMessage = useCallback(
    (message) => {
      if (!message) return
      if (import.meta.env.DEV) {
        console.log("[GroupReaction]", { messageId: message.id })
      }
      logGroupInteraction("react", message.id)
      handleReactToMessage()
    },
    [handleReactToMessage, logGroupInteraction]
  )

  const handleCopyMessageAction = useCallback(
    (message) => {
      logGroupInteraction("copy", message?.id)
      handleCopyMessage(message)
    },
    [handleCopyMessage, logGroupInteraction]
  )

  const handleForwardMessageAction = useCallback(
    (message) => {
      logGroupInteraction("forward", message?.id)
      handleForwardMessage(message)
    },
    [handleForwardMessage, logGroupInteraction]
  )

  const handleDeleteMessageAction = useCallback(
    (message) => {
      logGroupInteraction("delete", message?.id)
      handleDeleteMessage(message)
    },
    [handleDeleteMessage, logGroupInteraction]
  )

  const handleMessageInfoAction = useCallback(
    (message) => {
      logGroupInteraction("info", message?.id)
      setMessageInfoMessageId(message?.id || null)
    },
    [logGroupInteraction]
  )

  useEffect(() => {
    actionsRef.current = {
      onReply: handleReplyMessage,
      onCopy: handleCopyMessageAction,
      onForward: handleForwardMessageAction,
      onReact: handleReactMessage,
      onDelete: handleDeleteMessageAction,
      onInfo: handleMessageInfoAction
    }
  }, [
    handleCopyMessageAction,
    handleDeleteMessageAction,
    handleForwardMessageAction,
    handleMessageInfoAction,
    handleReactMessage,
    handleReplyMessage
  ])

  /* const UnusedGroupMessageRow = useMemo(
    () =>
      memo(function GroupMessageRow({
        message,
        isOwn,
        sender,
        seenCount,
        onReply,
        onCopy,
        onForward,
        onReact,
        onDelete,
        onInfo
      }) {
        const [menuOpen, setMenuOpen] = useState(false)
        const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 })

        const handleOpenMenu = (event) => {
          event.preventDefault()
          event.stopPropagation()
          const x = event.clientX || (event.touches && event.touches[0]?.clientX) || 0
          const y = event.clientY || (event.touches && event.touches[0]?.clientY) || 0
          setMenuPosition({ x, y })
          setMenuOpen(true)
          if (import.meta.env.DEV) {
            console.log("[GroupMenuOpen]", { messageId: message.id })
          }
        }

        return (
          <div
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
                  {message.type === "post" ? (
                    <PostPreview post_id={message.post_id} isMine={isOwn} />
                  ) : (
                    <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{message.content}</p>
                  )}
                </div>

                <button
                  type="button"
                  onPointerDown={handleOpenMenu}
                  onClick={(event) => event.preventDefault()}
                  className="absolute right-0 -top-8 z-20 inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 text-slate-600 dark:text-slate-300 shadow-sm transition hover:bg-slate-100 dark:hover:bg-slate-800 opacity-70 group-hover:opacity-100"
                  title="More options"
                  aria-label="Open message options"
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </button>

                {menuOpen && (
                  <DropdownMenu
                    x={menuPosition.x}
                    y={menuPosition.y}
                    onClose={() => setMenuOpen(false)}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        onReply(message)
                        setMenuOpen(false)
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      <Reply className="h-3.5 w-3.5" />
                      Reply
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        onCopy(message)
                        setMenuOpen(false)
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      <Copy className="h-3.5 w-3.5" />
                      Copy
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        onForward(message)
                        setMenuOpen(false)
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      <Forward className="h-3.5 w-3.5" />
                      Forward
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        onReact(message)
                        setMenuOpen(false)
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
                          onDelete(message)
                          setMenuOpen(false)
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
                        onInfo(message)
                        setMenuOpen(false)
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      <Info className="h-3.5 w-3.5" />
                      Message info
                    </button>
                  </DropdownMenu>
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
      }),
    [getDisplayName]
  ) */

  const clearGroupSelection = useCallback(
    (groupId, reason) => {
      if (import.meta.env.DEV) {
        console.log("[GroupSelectionClear]", { groupId, reason })
      }

      setActiveGroupId((prev) => (prev === groupId ? null : prev))
      setMessages([])
      setMessagePage(0)
      setHasMoreMessages(true)
      setLoadingOlderMessages(false)
      setMessageReadsById({})
      setDraft("")
      setReplyTarget(null)
      setMessageInfoMessageId(null)
      setGroupMembers([])
      setGroupKey(null)

      if (groupId) {
        setGroupMessagesCache(groupId, [])
      }
    },
    [setGroupMessagesCache]
  )

  const removeGroupFromState = useCallback(
    (groupId, reason) => {
      if (!groupId) return
      if (import.meta.env.DEV) {
        console.log("[GroupSidebarSync]", { groupId, reason })
      }

      setGroups((prev) => {
        const next = prev.filter((group) => group.id !== groupId)
        setGroupConversationsCache(next)
        return next
      })
    },
    [setGroupConversationsCache]
  )

  const handleHideGroup = useCallback(
    async (groupId) => {
      if (!groupId) return

      if (import.meta.env.DEV) {
        console.log("[GroupHide]", { groupId })
      }

      const updated = await upsertGroupPreference(groupId, { is_deleted: true, is_archived: false })
      if (!updated) {
        showToastError("Failed to remove group")
        return
      }

      if (activeGroupId === groupId) {
        clearGroupSelection(groupId, "hidden")
      }

      setOpenGroupOptionsId(null)
      setGroupActionsOpen(false)
      showSuccess("Group removed")
    },
    [activeGroupId, clearGroupSelection, showSuccess, showToastError, upsertGroupPreference]
  )

  const handleDeleteConversation = useCallback(
    async (groupId) => {
      if (!groupId) return

      const deletedBeforeTimestamp = new Date().toISOString()
      deletedBeforeTimestampByGroupIdRef.current = {
        ...deletedBeforeTimestampByGroupIdRef.current,
        [groupId]: deletedBeforeTimestamp
      }

      if (import.meta.env.DEV) {
        console.log("[GroupSoftDelete]", { groupId, deletedBeforeTimestamp })
      }

      const updated = await upsertGroupPreference(groupId, { is_deleted: true })
      if (!updated) {
        const nextDeletedBefore = { ...deletedBeforeTimestampByGroupIdRef.current }
        delete nextDeletedBefore[groupId]
        deletedBeforeTimestampByGroupIdRef.current = nextDeletedBefore
        showToastError("Failed to delete conversation")
        return
      }

      if (activeGroupId === groupId) {
        clearGroupSelection(groupId, "conversation_deleted")
      }

      setOpenGroupOptionsId(null)
      setGroupActionsOpen(false)
      showSuccess("Conversation deleted")
    },
    [activeGroupId, clearGroupSelection, showSuccess, showToastError, upsertGroupPreference]
  )

  const handleLeaveGroup = useCallback(
    async (groupId) => {
      if (!contextUser?.id || !groupId) return

      if (import.meta.env.DEV) {
        console.log("[GroupLeave]", { groupId, userId: contextUser.id })
      }

      try {
        const { error } = await supabase
          .from("group_members")
          .delete()
          .eq("group_id", groupId)
          .eq("user_id", contextUser.id)

        if (error) {
          console.error("[GroupChat] Failed to leave group:", error)
          showToastError("Failed to leave group")
          return
        }

        await supabase
          .from("conversation_preferences")
          .delete()
          .eq("user_id", contextUser.id)
          .eq("group_id", groupId)

        setGroupPreferencesById((prev) => {
          const next = { ...prev }
          delete next[groupId]
          return next
        })

        clearGroupSelection(groupId, "left")
        removeGroupFromState(groupId, "left")
        setOpenGroupOptionsId(null)
        setGroupActionsOpen(false)
        showSuccess("Left group")
      } catch (err) {
        console.error("[GroupChat] Exception leaving group:", err)
        showToastError("Failed to leave group")
      }
    },
    [contextUser?.id, clearGroupSelection, removeGroupFromState, showSuccess, showToastError]
  )

  const handleDeleteGroup = useCallback(
    async (groupId) => {
      if (!contextUser?.id || !groupId) return
      if (!isCurrentUserAdmin) {
        showToastError("Only admins can delete groups")
        return
      }

      if (import.meta.env.DEV) {
        console.log("[GroupDelete]", { groupId, userId: contextUser.id })
      }

      try {
        const { error: messagesError } = await supabase
          .from("group_messages")
          .delete()
          .eq("group_id", groupId)

        if (messagesError) {
          console.error("[GroupChat] Failed to delete group messages:", messagesError)
          showToastError("Failed to delete group")
          return
        }

        const { error: membersError } = await supabase
          .from("group_members")
          .delete()
          .eq("group_id", groupId)

        if (membersError) {
          console.error("[GroupChat] Failed to delete group members:", membersError)
          showToastError("Failed to delete group")
          return
        }

        const { error: groupError } = await supabase
          .from("group_conversations")
          .delete()
          .eq("id", groupId)

        if (groupError) {
          console.error("[GroupChat] Failed to delete group:", groupError)
          showToastError("Failed to delete group")
          return
        }

        clearGroupSelection(groupId, "deleted")
        removeGroupFromState(groupId, "deleted")
        setGroupPreferencesById((prev) => {
          const next = { ...prev }
          delete next[groupId]
          return next
        })
        setOpenGroupOptionsId(null)
        setGroupActionsOpen(false)
        showSuccess("Group deleted")
      } catch (err) {
        console.error("[GroupChat] Exception deleting group:", err)
        showToastError("Failed to delete group")
      }
    },
    [contextUser?.id, isCurrentUserAdmin, clearGroupSelection, removeGroupFromState, showSuccess, showToastError]
  )

  useEffect(() => {
    if (!contextUser?.id) return

    fetchGroups({ silent: groups.length > 0 })
  }, [contextUser?.id, fetchGroups, groups.length])

  useEffect(() => {
    if (!contextUser?.id) return

    const groupIds = groups.map((group) => group.id).filter(Boolean)
    if (groupIds.length === 0) {
      setGroupPreferencesById({})
      return
    }

    fetchGroupPreferences(contextUser.id, groupIds)
  }, [contextUser?.id, fetchGroupPreferences, groups])

  useEffect(() => {
    if (!contextUser?.id) return

    groups.forEach((group) => {
      const preference = groupPreferencesById[group.id]
      if (!preference?.is_deleted || !preference?.updated_at || !group.last_message_at) {
        return
      }

      const hiddenAt = new Date(preference.updated_at).getTime()
      const lastMessageAt = new Date(group.last_message_at).getTime()
      if (!Number.isFinite(hiddenAt) || !Number.isFinite(lastMessageAt)) {
        return
      }

      if (lastMessageAt > hiddenAt) {
        if (import.meta.env.DEV) {
          console.log("[GroupSidebarSync]", { groupId: group.id, reason: "refresh_unhide" })
        }
        void upsertGroupPreference(group.id, { is_deleted: false, is_archived: false })
      }
    })
  }, [contextUser?.id, groupPreferencesById, groups, upsertGroupPreference])

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
    if (!memberSearchQuery.trim() || !activeGroupId || !isCurrentUserAdmin) {
      setMemberSearchResults([])
      setMemberSearchLoading(false)
      return
    }

    let canceled = false
    const timeoutId = setTimeout(async () => {
      try {
        setMemberSearchLoading(true)

        const existingIds = groupMembers.map((member) => member.user_id).filter(Boolean)
        const excludedIds = [...existingIds, contextUser?.id].filter(Boolean)

        let query = supabase
          .from("profiles")
          .select("id, username, name, avatar_url")
          .or(`username.ilike.%${memberSearchQuery}%,name.ilike.%${memberSearchQuery}%`)
          .limit(6)

        if (excludedIds.length > 0) {
          query = query.not("id", "in", `(${excludedIds.join(",")})`)
        }

        const { data, error: searchError } = await query

        if (searchError) {
          console.error("[GroupChat] Error searching users:", searchError)
          if (!canceled) setMemberSearchResults([])
          return
        }

        if (!canceled) {
          setMemberSearchResults(data || [])
        }
      } catch (err) {
        console.error("[GroupChat] Exception searching users:", err)
      } finally {
        if (!canceled) {
          setMemberSearchLoading(false)
        }
      }
    }, 250)

    return () => {
      canceled = true
      clearTimeout(timeoutId)
    }
  }, [activeGroupId, contextUser?.id, groupMembers, isCurrentUserAdmin, memberSearchQuery])

  useEffect(() => {
    if (!activeGroupId) {
      applyMessages([])
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
  }, [activeGroupId, fetchGroupKey, fetchGroupMembers, applyMessages])

  useEffect(() => {
    if (!activeGroupId) return
    if (!groups.some((group) => group.id === activeGroupId)) {
      clearGroupSelection(activeGroupId, "missing")
    }
  }, [activeGroupId, clearGroupSelection, groups])

  useEffect(() => {
    if (!activeGroupId || !groupKey) return
    const cachedMessages = useChatStore.getState().groupMessagesByGroupId[activeGroupId] || []
    isRestoringMessageScrollRef.current = true
    fetchGroupMessages({ silent: cachedMessages.length > 0 })
  }, [activeGroupId, fetchGroupMessages, groupKey])

  useEffect(() => {
    const container = groupListRef.current
    if (!container) return

    const restoreTop = useNavigationStore.getState().scrollPositions["groupchat-group-list"] || 0
    if (restoreTop > 0) {
      container.scrollTop = restoreTop
    }
  }, [])

  useEffect(() => {
    if (!contextUser?.id || !groupIdsKey) return

    if (groupListChannelRef.current) {
      supabase.removeChannel(groupListChannelRef.current)
      groupListChannelRef.current = null
    }

    const channel = supabase
      .channel(`group-list-${contextUser.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "group_conversations",
          filter: `id=in.(${groupIdsKey})`
        },
        (payload) => {
          const updated = payload.new
          if (!updated?.id) return

          let shouldUnhide = false

          setGroups((prev) => {
            const existing = prev.find((group) => group.id === updated.id)
            const hasNewMessage = Boolean(updated.last_message_at) && updated.last_message_at !== existing?.last_message_at
            if (hasNewMessage && isPreferenceDeleted(groupPreferencesById[updated.id])) {
              shouldUnhide = true
            }

            const nextEntry = {
              ...(existing || {}),
              ...updated
            }

            const nextList = existing
              ? prev.map((group) => (group.id === updated.id ? nextEntry : group))
              : [...prev, nextEntry]

            const sorted = sortGroupsByLatest(nextList)
            setGroupConversationsCache(sorted)
            return sorted
          })

          if (shouldUnhide) {
            if (import.meta.env.DEV) {
              console.log("[GroupSidebarSync]", { groupId: updated.id, reason: "new_message_unhide" })
            }
            void upsertGroupPreference(updated.id, { is_deleted: false, is_archived: false })
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "group_conversations",
          filter: `id=in.(${groupIdsKey})`
        },
        (payload) => {
          const removedId = payload.old?.id
          if (!removedId) return

          removeGroupFromState(removedId, "deleted")
          if (activeGroupId === removedId) {
            clearGroupSelection(removedId, "deleted")
          }
        }
      )
      .subscribe()

    groupListChannelRef.current = channel

    return () => {
      supabase.removeChannel(channel)
      if (groupListChannelRef.current === channel) {
        groupListChannelRef.current = null
      }
    }
  }, [activeGroupId, clearGroupSelection, contextUser?.id, groupIdsKey, groupPreferencesById, isPreferenceDeleted, removeGroupFromState, setGroupConversationsCache, sortGroupsByLatest, upsertGroupPreference])

  useEffect(() => {
    if (!contextUser?.id) return

    if (groupMembershipChannelRef.current) {
      supabase.removeChannel(groupMembershipChannelRef.current)
      groupMembershipChannelRef.current = null
    }

    const channel = supabase
      .channel(`group-members-${contextUser.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "group_members",
          filter: `user_id=eq.${contextUser.id}`
        },
        async (payload) => {
          const row = payload.new
          if (!row?.group_id) return

          const { data, error } = await supabase
            .from("group_conversations")
            .select("id, name, last_message, last_message_at")
            .eq("id", row.group_id)
            .maybeSingle()

          if (error || !data) {
            console.error("[GroupChat] Failed to fetch added group:", error)
            return
          }

          setGroups((prev) => {
            if (prev.some((group) => group.id === data.id)) {
              return prev
            }
            const next = sortGroupsByLatest([...prev, data])
            setGroupConversationsCache(next)
            return next
          })

          if (import.meta.env.DEV) {
            console.log("[GroupSidebarSync]", { groupId: row.group_id, reason: "member_added" })
          }

          void upsertGroupPreference(row.group_id, { is_deleted: false, is_archived: false })
        }
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "group_members",
          filter: `user_id=eq.${contextUser.id}`
        },
        (payload) => {
          const row = payload.old
          if (!row?.group_id) return

          if (import.meta.env.DEV) {
            console.log("[GroupMemberRemove]", { groupId: row.group_id, userId: contextUser.id })
          }

          clearGroupSelection(row.group_id, "member_removed")
          removeGroupFromState(row.group_id, "member_removed")
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "group_members",
          filter: `user_id=eq.${contextUser.id}`
        },
        (payload) => {
          if (payload.new?.group_id === activeGroupId) {
            fetchGroupMembers(activeGroupId)
          }
        }
      )
      .subscribe()

    groupMembershipChannelRef.current = channel

    return () => {
      supabase.removeChannel(channel)
      if (groupMembershipChannelRef.current === channel) {
        groupMembershipChannelRef.current = null
      }
    }
  }, [activeGroupId, clearGroupSelection, contextUser?.id, fetchGroupMembers, removeGroupFromState, setGroupConversationsCache, sortGroupsByLatest, upsertGroupPreference])

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

            if (filterMessagesAfterDeletedBefore(row.group_id, [row]).length === 0) {
              return
            }

            if (groupPreferencesByIdRef.current[row.group_id]?.is_deleted === true) {
              if (import.meta.env.DEV) {
                console.log("[GroupSidebarSync]", { groupId: row.group_id, reason: "new_message_unhide" })
              }
              void upsertGroupPreference(row.group_id, { is_deleted: false, is_archived: false })
            }

            const placeholderContent = row.is_encrypted && row.encrypted_content && row.iv
              ? "..."
              : row.content || ""

            applyMessages((prev) => {
              if (prev.some((item) => item.id === row.id)) {
                return prev
              }

              return [
                ...prev,
                {
                  ...row,
                  content: placeholderContent,
                  profiles: getMemberProfileById(row.sender_id)
                }
              ]
            })

            messageIdsRef.current.add(row.id)

            if (row.is_encrypted && row.encrypted_content && row.iv) {
              void (async () => {
                let content = ""
                try {
                  content = await decrypt(row.encrypted_content, row.iv, groupKey)
                } catch (decryptError) {
                  console.warn("[GroupChat] Failed to decrypt realtime message:", decryptError)
                  content = "[Unable to decrypt]"
                }

                applyMessages((prev) =>
                  prev.map((item) =>
                    item.id === row.id
                      ? {
                          ...item,
                          content
                        }
                      : item
                  )
                )
              })()
            }

            if (row.sender_id !== contextUser?.id) {
              await markGroupMessagesAsRead([row])
              await fetchGroupMessageReads([row.id])
            }

            return
          }

          if (payload.eventType === "DELETE") {
            const oldRow = payload.old
            if (!oldRow?.id) return

            applyMessages((prev) => prev.filter((item) => item.id !== oldRow.id))
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

            applyMessages((prev) =>
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
    applyMessages,
    contextUser?.id,
    fetchGroupMessageReads,
    filterMessagesAfterDeletedBefore,
    getMemberProfileById,
    groupKey,
    markGroupMessagesAsRead,
    upsertGroupPreference
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

    if (isRestoringMessageScrollRef.current) {
      const restoreKey = `groupchat-messages-${activeGroupId}`
      const restoreTop = useNavigationStore.getState().scrollPositions[restoreKey] || 0
      if (restoreTop > 0 && messageListRef.current) {
        messageListRef.current.scrollTop = restoreTop
      }
      isRestoringMessageScrollRef.current = false
      return
    }

    if (isPrependingOlderRef.current) {
      return
    }

    requestAnimationFrame(() => {
      bottomRef.current?.scrollIntoView({ behavior: "instant", block: "end" })
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
    if (!openGroupOptionsId) return undefined

    const handleClickOutside = (event) => {
      const target = event.target
      if (!(target instanceof Element)) return
      if (target.closest("[data-group-options-trigger]") || target.closest("[data-group-options-menu]")) {
        return
      }
      setOpenGroupOptionsId(null)
    }

    document.addEventListener("click", handleClickOutside)
    return () => document.removeEventListener("click", handleClickOutside)
  }, [openGroupOptionsId])

  useEffect(() => {
    if (!groupActionsOpen) return undefined

    const handleClickOutside = (event) => {
      const target = event.target
      if (!(target instanceof Element)) return
      if (target.closest("[data-group-actions-trigger]") || target.closest("[data-group-actions-menu]")) {
        return
      }
      setGroupActionsOpen(false)
    }

    document.addEventListener("click", handleClickOutside)
    return () => document.removeEventListener("click", handleClickOutside)
  }, [groupActionsOpen])

  useEffect(() => {
    setOpenGroupOptionsId(null)
    setGroupActionsOpen(false)
    setMemberSearchQuery("")
    setMemberSearchResults([])
  }, [activeGroupId])

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

  useEffect(() => {
    setActiveGroupIdCache(activeGroupId)
  }, [activeGroupId, setActiveGroupIdCache])

  const renderedMessages = useMemo(() => {
    return messages.map((message) => {
      const isOwn = message.sender_id === contextUser?.id
      const sender = message.profiles || getMemberProfileById(message.sender_id)

      return (
        <GroupMessageRow
          key={message.id}
          message={message}
          isOwn={isOwn}
          sender={sender}
          messageReadsByIdRef={messageReadsByIdRef}
          actionsRef={actionsRef}
        />
      )
    })
  }, [contextUser?.id, getMemberProfileById, messages])

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
                  <div key={group.id} className="relative">
                    <button
                      type="button"
                      onClick={() => setActiveGroupId(group.id)}
                      className={`w-full border-b border-slate-200 dark:border-slate-700 px-3 py-2.5 pr-10 text-left transition-all duration-200 ${
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

                    <button
                      type="button"
                      data-group-options-trigger="true"
                      onClick={(event) => {
                        event.stopPropagation()
                        setGroupMenuPosition({
                          x: event.clientX || 0,
                          y: event.clientY || 0
                        })
                        setOpenGroupOptionsId((prev) => (prev === group.id ? null : group.id))
                      }}
                      className="absolute right-2 top-2.5 inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
                      aria-label="Group options"
                    >
                      <MoreVertical className="h-3.5 w-3.5" />
                    </button>

                    {openGroupOptionsId === group.id && (
                      <DropdownMenu
                        x={groupMenuPosition.x}
                        y={groupMenuPosition.y}
                        onClose={() => setOpenGroupOptionsId(null)}
                        className="text-slate-700"
                      >
                        <button
                          type="button"
                          onClick={() => handleHideGroup(group.id)}
                          className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition hover:bg-slate-100"
                        >
                          Remove from conversations
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteConversation(group.id)}
                          className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-red-600 transition hover:bg-red-50"
                        >
                          Delete conversation
                        </button>
                        <button
                          type="button"
                          onClick={() => handleLeaveGroup(group.id)}
                          className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition hover:bg-slate-100"
                        >
                          Leave group
                        </button>
                        {group.id === activeGroupId && isCurrentUserAdmin && (
                          <button
                            type="button"
                            onClick={() => handleDeleteGroup(group.id)}
                            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-red-600 transition hover:bg-red-50"
                          >
                            Delete group
                          </button>
                        )}
                      </DropdownMenu>
                    )}
                  </div>
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

                  <div className="relative flex items-center gap-2">
                    <button
                      type="button"
                      data-group-actions-trigger="true"
                      onClick={(event) => {
                        event.stopPropagation()
                        setGroupActionsPosition({
                          x: event.clientX || 0,
                          y: event.clientY || 0
                        })
                        setGroupActionsOpen((prev) => !prev)
                      }}
                      className="rounded-lg px-2 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
                      aria-label="Group actions"
                    >
                      <MoreVertical className="h-4 w-4" />
                    </button>

                    {groupActionsOpen && (
                      <DropdownMenu
                        x={groupActionsPosition.x}
                        y={groupActionsPosition.y}
                        onClose={() => setGroupActionsOpen(false)}
                        className="text-slate-700"
                      >
                        <button
                          type="button"
                          onClick={() => handleHideGroup(activeGroupId)}
                          className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition hover:bg-slate-100"
                        >
                          Remove from conversations
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteConversation(activeGroupId)}
                          className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-red-600 transition hover:bg-red-50"
                        >
                          Delete conversation
                        </button>
                        <button
                          type="button"
                          onClick={() => handleLeaveGroup(activeGroupId)}
                          className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition hover:bg-slate-100"
                        >
                          Leave group
                        </button>
                        {isCurrentUserAdmin && (
                          <button
                            type="button"
                            onClick={() => handleDeleteGroup(activeGroupId)}
                            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-red-600 transition hover:bg-red-50"
                          >
                            Delete group
                          </button>
                        )}
                      </DropdownMenu>
                    )}

                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation()
                        setMembersDropdownOpen((prev) => {
                          const next = !prev
                          if (import.meta.env.DEV && next) {
                            console.log("[GroupMembersOpen]", { groupId: activeGroupId })
                          }
                          return next
                        })
                      }}
                      className="rounded-lg px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      Members
                    </button>

                    {membersDropdownOpen && (
                      <div
                        className="absolute right-0 top-full z-20 mt-2 w-64 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <div className="max-h-64 overflow-y-auto">
                          {renderedMembers}
                        </div>

                        {isCurrentUserAdmin && (
                          <div className="border-t border-slate-200 dark:border-slate-700 px-3 py-2">
                            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Add people</p>
                            <input
                              type="text"
                              value={memberSearchQuery}
                              onChange={(event) => setMemberSearchQuery(event.target.value)}
                              placeholder="Search by username..."
                              className="mt-2 w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-xs text-slate-900 dark:text-slate-100 outline-none transition focus:border-[#f4b400]"
                            />

                            {memberSearchQuery.trim() && (
                              <div className="mt-2 max-h-32 overflow-y-auto">
                                {memberSearchLoading ? (
                                  <p className="px-2 py-2 text-center text-xs text-slate-500">Searching...</p>
                                ) : memberSearchResults.length === 0 ? (
                                  <p className="px-2 py-2 text-center text-xs text-slate-500">No users found.</p>
                                ) : (
                                  memberSearchResults.map((user) => (
                                    <button
                                      key={user.id}
                                      type="button"
                                      onClick={() => handleAddMemberToGroup(user.id)}
                                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-slate-700 transition hover:bg-slate-100"
                                    >
                                      {user.avatar_url ? (
                                        <img
                                          src={user.avatar_url}
                                          alt={user.name || user.username}
                                          className="h-6 w-6 rounded-full object-cover"
                                        />
                                      ) : (
                                        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-200 text-[10px] font-semibold text-slate-600">
                                          {(user.name || user.username || "?").charAt(0).toUpperCase()}
                                        </div>
                                      )}
                                      <span className="truncate">{user.name || user.username}</span>
                                    </button>
                                  ))
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div
                ref={messageListRef}
                onScroll={handleMessageListScroll}
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
                    {renderedMessages}
                  </div>
                )}

                <div ref={bottomRef} />
              </div>

              <div className="sticky bottom-0 z-10 shrink-0 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3">
                {replyTarget && (
                  <div className="mb-2 rounded-lg border-l-[3px] border-[#f4b400] bg-slate-50 px-3 py-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-semibold text-slate-600">
                          Replying to {getDisplayName(replyTarget.profiles || getMemberProfileById(replyTarget.sender_id))}
                        </p>
                        <p className="truncate text-xs text-slate-500 dark:text-slate-400 opacity-70">
                          {replyTarget.type === "post" 
                            ? getPostPreview(replyTarget.post || postCache[replyTarget.post_id]) 
                            : (replyTarget.content || "[message]")}
                        </p>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay-backdrop)] p-4">
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
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay-backdrop)] p-4">
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
