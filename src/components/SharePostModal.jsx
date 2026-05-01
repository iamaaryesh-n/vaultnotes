import { useState, useEffect, useRef, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X, Search, Send, Check, Users, MessageCircle } from "lucide-react"
import { supabase } from "../lib/supabase"
import { useToast } from "../hooks/useToast"
import { dispatchPushNotification } from "../lib/pushNotifications"

/**
 * SharePostModal — Instagram/WhatsApp-style post sharing dialog.
 *
 * Props:
 *   isOpen       boolean
 *   onClose      () => void
 *   post         { id, content, profiles: { username } }  — the post being shared
 *   currentUser  { id, name, username }
 */
export default function SharePostModal({ isOpen, onClose, post, currentUser }) {
  const { success, error: showError } = useToast()

  /* ── search ── */
  const [query, setQuery] = useState("")
  const [results, setResults] = useState([])   // { type: 'direct'|'group', id, partnerId?, name, avatar, username? }
  const [searching, setSearching] = useState(false)

  /* ── selection & send ── */
  const [selected, setSelected] = useState([])   // array of result items
  const [sending, setSending] = useState(false)
  const [sentIds, setSentIds] = useState([])     // ids already sent this session

  const inputRef = useRef(null)
  const abortRef = useRef(null)

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setQuery("")
      setResults([])
      setSelected([])
      setSentIds([])
      setTimeout(() => inputRef.current?.focus(), 80)
    }
  }, [isOpen])

  // Lock body scroll
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden"
    } else {
      document.body.style.overflow = ""
    }
    return () => { document.body.style.overflow = "" }
  }, [isOpen])

  // Search conversations + groups
  const doSearch = useCallback(async (q) => {
    if (!currentUser?.id) return

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setSearching(true)
    try {
      // 1. Search user profiles (for direct chats)
      const profilesPromise = supabase
        .from("profiles")
        .select("id, name, username, avatar_url")
        .neq("id", currentUser.id)
        .or(q ? `username.ilike.%${q}%,name.ilike.%${q}%` : "id.neq.00000000-0000-0000-0000-000000000000")
        .limit(12)

      // 2. Search groups the user is a member of
      const groupsPromise = supabase
        .from("group_members")
        .select("group_id, group_conversations(id, name)")
        .eq("user_id", currentUser.id)
        .limit(20)

      const [profilesRes, groupsRes] = await Promise.all([profilesPromise, groupsPromise])

      if (controller.signal.aborted) return

      // Map direct conversations from profile list
      const profileResults = (profilesRes.data || []).map((p) => ({
        type: "direct",
        id: `direct-${p.id}`,
        partnerId: p.id,
        name: p.name || p.username || "Unknown",
        username: p.username || "",
        avatar: p.avatar_url || null,
      }))

      // Map group results, filter by query
      const allGroups = (groupsRes.data || [])
        .map((row) => row.group_conversations)
        .filter(Boolean)
        .filter((g) =>
          !q || g.name?.toLowerCase().includes(q.toLowerCase())
        )
        .map((g) => ({
          type: "group",
          id: `group-${g.id}`,
          groupId: g.id,
          name: g.name || "Unnamed group",
          avatar: null,
        }))

      setResults([...profileResults, ...allGroups])
    } catch {
      // silently ignore errors
    } finally {
      if (!controller.signal.aborted) setSearching(false)
    }
  }, [currentUser?.id])

  // Debounced search trigger
  useEffect(() => {
    if (!isOpen) return
    const timer = setTimeout(() => doSearch(query), 250)
    return () => clearTimeout(timer)
  }, [query, isOpen, doSearch])

  const toggleSelect = (item) => {
    setSelected((prev) => {
      const exists = prev.some((s) => s.id === item.id)
      return exists ? prev.filter((s) => s.id !== item.id) : [...prev, item]
    })
  }

  const isSelected = (item) => selected.some((s) => s.id === item.id)
  const alreadySent = (item) => sentIds.includes(item.id)

  /* ── send ── */
  const handleSend = async () => {
    if (!selected.length || !post?.id || !currentUser?.id || sending) return

    setSending(true)
    const errors = []

    for (const target of selected) {
      try {
        if (target.type === "direct") {
          // Find or create conversation
          const { data: existing } = await supabase
            .from("conversations")
            .select("id")
            .or(
              `and(user1_id.eq.${currentUser.id},user2_id.eq.${target.partnerId}),and(user1_id.eq.${target.partnerId},user2_id.eq.${currentUser.id})`
            )
            .limit(1)
            .maybeSingle()

          let conversationId = existing?.id

          if (!conversationId) {
            const { data: created, error: createErr } = await supabase
              .from("conversations")
              .insert({ user1_id: currentUser.id, user2_id: target.partnerId })
              .select("id")
              .single()
            if (createErr) throw createErr
            conversationId = created.id
          }

          // Insert post message (no content, no encryption — post_id is the payload)
          const { error: msgErr } = await supabase.from("messages").insert({
            conversation_id: conversationId,
            sender_id: currentUser.id,
            receiver_id: target.partnerId,
            type: "post",
            post_id: post.id,
            content: null,
            delivery_status: "sent",
          })
          if (msgErr) throw msgErr

          // Push notification (fire & forget)
          dispatchPushNotification({
            recipientId: target.partnerId,
            actorId: currentUser.id,
            title: currentUser.name || currentUser.username || "Someone",
            body: "Shared a post with you",
            route: `/chat`,
            data: { type: "message" },
          }).catch(() => {})
        } else if (target.type === "group") {
          const { error: msgErr } = await supabase.from("group_messages").insert({
            group_id: target.groupId,
            sender_id: currentUser.id,
            type: "post",
            post_id: post.id,
            content: null,
          })
          if (msgErr) throw msgErr
        }

        setSentIds((prev) => [...prev, target.id])
      } catch (err) {
        console.error("[SharePostModal] Failed to share to:", target.name, err)
        errors.push(target.name)
      }
    }

    setSending(false)
    setSelected([])

    if (errors.length === 0) {
      success(`Shared to ${selected.length} chat${selected.length > 1 ? "s" : ""}`)
      setTimeout(onClose, 600)
    } else {
      showError(`Failed to share to: ${errors.join(", ")}`)
    }
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="share-post-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={onClose}
          className="fixed inset-0 z-[200] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center"
        >
          <motion.div
            key="share-post-panel"
            initial={{ y: 48, opacity: 0, scale: 0.97 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 48, opacity: 0, scale: 0.97 }}
            transition={{ type: "spring", damping: 28, stiffness: 320 }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-md overflow-hidden rounded-t-2xl sm:rounded-2xl border border-[var(--chat-border)] bg-[var(--chat-surface)] shadow-2xl"
            style={{ maxHeight: "min(90vh, 560px)" }}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[var(--chat-border)] px-4 py-3">
              <h2 className="font-['Sora'] text-[15px] font-bold text-[var(--chat-text)]">
                Share Post
              </h2>
              <button
                onClick={onClose}
                className="rounded-full p-1.5 text-[var(--chat-text-subtle)] transition hover:bg-[var(--chat-elev)] hover:text-[var(--chat-text)]"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Post preview strip */}
            {post && (
              <div className="border-b border-[var(--chat-border)] bg-[var(--chat-elev)] px-4 py-2.5">
                <p className="line-clamp-2 font-['DM_Sans'] text-[12px] text-[var(--chat-text-subtle)]">
                  {post.content
                    ? post.content.replace(/<[^>]*>/g, "").slice(0, 120)
                    : "Post"}
                </p>
              </div>
            )}

            {/* Search */}
            <div className="border-b border-[var(--chat-border)] px-3 py-2">
              <div className="flex items-center gap-2 rounded-xl border border-[var(--chat-border-strong)] bg-[var(--chat-elev)] px-3 py-2">
                <Search className="h-4 w-4 shrink-0 text-[var(--chat-text-muted)]" />
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search people or groups..."
                  className="flex-1 bg-transparent font-['DM_Sans'] text-[13px] text-[var(--chat-text)] outline-none placeholder:text-[var(--chat-text-muted)]"
                />
                {searching && (
                  <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[var(--chat-accent)] border-t-transparent" />
                )}
              </div>
            </div>

            {/* Selected chips */}
            {selected.length > 0 && (
              <div className="flex flex-wrap gap-1.5 border-b border-[var(--chat-border)] px-3 py-2">
                {selected.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => toggleSelect(item)}
                    className="flex items-center gap-1 rounded-full border border-[var(--chat-border-strong)] bg-[var(--chat-accent-soft)] px-2 py-0.5 font-['DM_Sans'] text-[11px] font-semibold text-[var(--chat-accent)] transition hover:bg-[var(--chat-elev)]"
                  >
                    {item.name}
                    <X className="h-2.5 w-2.5" />
                  </button>
                ))}
              </div>
            )}

            {/* Results list */}
            <div className="overflow-y-auto" style={{ maxHeight: 260 }}>
              {results.length === 0 && !searching ? (
                <p className="py-8 text-center font-['DM_Sans'] text-[13px] text-[var(--chat-text-muted)]">
                  {query ? "No results found" : "Start typing to search"}
                </p>
              ) : (
                <ul className="divide-y divide-[var(--chat-border)]">
                  {results.map((item) => {
                    const sent = alreadySent(item)
                    const sel = isSelected(item)
                    return (
                      <li key={item.id}>
                        <button
                          onClick={() => !sent && toggleSelect(item)}
                          disabled={sent}
                          className={`flex w-full items-center gap-3 px-4 py-3 transition-colors ${
                            sent
                              ? "opacity-60 cursor-default"
                              : sel
                              ? "bg-[var(--chat-accent-soft)]"
                              : "hover:bg-[var(--chat-elev)]"
                          }`}
                        >
                          {/* Avatar */}
                          {item.type === "group" ? (
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--chat-elev)] text-[var(--chat-text-subtle)]">
                              <Users className="h-4 w-4" />
                            </div>
                          ) : item.avatar ? (
                            <img
                              src={item.avatar}
                              alt={item.name}
                              className="h-9 w-9 shrink-0 rounded-full object-cover"
                              loading="lazy"
                            />
                          ) : (
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--chat-accent-soft)] font-['Sora'] text-[13px] font-bold text-[var(--chat-accent)]">
                              {item.name.charAt(0).toUpperCase()}
                            </div>
                          )}

                          {/* Name */}
                          <div className="min-w-0 flex-1 text-left">
                            <p className="truncate font-['DM_Sans'] text-[13px] font-semibold text-[var(--chat-text)]">
                              {item.name}
                            </p>
                            {item.username && (
                              <p className="truncate font-['DM_Sans'] text-[11px] text-[var(--chat-text-muted)]">
                                @{item.username}
                              </p>
                            )}
                            {item.type === "group" && (
                              <p className="font-['DM_Sans'] text-[11px] text-[var(--chat-text-muted)]">
                                Group
                              </p>
                            )}
                          </div>

                          {/* State indicator */}
                          <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-all ${
                            sent
                              ? "border-[var(--chat-accent)] bg-[var(--chat-accent)]"
                              : sel
                              ? "border-[var(--chat-accent)] bg-[var(--chat-accent)]"
                              : "border-[var(--chat-border-strong)] bg-transparent"
                          }`}>
                            {(sel || sent) && (
                              <Check className="h-3 w-3 text-[var(--chat-on-accent)]" />
                            )}
                          </div>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>

            {/* Send button */}
            <div className="border-t border-[var(--chat-border)] px-4 py-3">
              <motion.button
                onClick={handleSend}
                disabled={selected.length === 0 || sending}
                whileHover={{ scale: selected.length > 0 ? 1.02 : 1 }}
                whileTap={{ scale: selected.length > 0 ? 0.97 : 1 }}
                className={`flex w-full items-center justify-center gap-2 rounded-xl py-2.5 font-['DM_Sans'] text-[14px] font-bold transition-all ${
                  selected.length === 0 || sending
                    ? "cursor-not-allowed bg-[var(--chat-elev)] text-[var(--chat-text-muted)]"
                    : "bg-[var(--chat-accent)] text-[var(--chat-on-accent)] hover:bg-[var(--chat-accent-hover)] shadow-md"
                }`}
              >
                {sending ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    Sending…
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    Send{selected.length > 0 ? ` (${selected.length})` : ""}
                  </>
                )}
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
