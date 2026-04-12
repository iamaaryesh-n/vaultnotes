import { useState, useEffect, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { supabase } from "../lib/supabase"
import { useToast } from "../hooks/useToast"
import { IMAGE_TOO_LARGE_MESSAGE, prepareImageForUpload } from "../lib/imageCompression"

export function EditProfileModal({
  isOpen,
  onClose,
  profile,
  avatarUrl,
  coverPhotoUrl,
  onSave,
}) {
  const { addToast } = useToast()
  const [nameInput, setNameInput] = useState(profile?.name || "")
  const [usernameInput, setUsernameInput] = useState(profile?.username || "")
  const [bioInput, setBioInput] = useState(profile?.bio || "")
  const [usernameError, setUsernameError] = useState("")
  const [usernameStatus, setUsernameStatus] = useState("idle")
  const [saveError, setSaveError] = useState("")
  const [saving, setSaving] = useState(false)
  const [pendingAvatarFile, setPendingAvatarFile] = useState(null)
  const [pendingCoverFile, setPendingCoverFile] = useState(null)
  const [avatarPreview, setAvatarPreview] = useState(avatarUrl || null)
  const [coverPreview, setCoverPreview] = useState(coverPhotoUrl || null)
  const [coverPositionX, setCoverPositionX] = useState(profile?.cover_position_x ?? 50)
  const [coverPositionY, setCoverPositionY] = useState(profile?.cover_position_y ?? 50)
  const [coverZoom, setCoverZoom] = useState(profile?.cover_zoom ?? 1)
  const [avatarPositionX, setAvatarPositionX] = useState(50)
  const [avatarPositionY, setAvatarPositionY] = useState(50)
  const [avatarZoom, setAvatarZoom] = useState(1)
  const [isDraggingCover, setIsDraggingCover] = useState(false)
  const [isDraggingAvatar, setIsDraggingAvatar] = useState(false)
  const usernameCheckTimeoutRef = useRef(null)
  const usernameRequestIdRef = useRef(0)
  const dragStartRef = useRef({ x: 0, y: 0, coverX: 50, coverY: 50 })
  const avatarDragStartRef = useRef({ x: 0, y: 0, avatarX: 50, avatarY: 50 })

  useEffect(() => {
    if (isOpen && profile) {
      setNameInput(profile.name || "")
      setUsernameInput(profile.username || "")
      setBioInput(profile.bio || "")
      setUsernameError("")
      setUsernameStatus("idle")
      setSaveError("")
      setPendingAvatarFile(null)
      setPendingCoverFile(null)
      setAvatarPreview(avatarUrl || null)
      setCoverPreview(coverPhotoUrl || null)
      setCoverPositionX(profile?.cover_position_x ?? 50)
      setCoverPositionY(profile?.cover_position_y ?? 50)
      setCoverZoom(profile?.cover_zoom ?? 1)
      setAvatarPositionX(50)
      setAvatarPositionY(50)
      setAvatarZoom(1)
      setIsDraggingCover(false)
      setIsDraggingAvatar(false)
    }
  }, [isOpen, profile, avatarUrl, coverPhotoUrl])

  useEffect(() => {
    if (!isOpen || !profile?.id) return

    const normalized = usernameInput.trim().toLowerCase()
    const currentUsername = (profile.username || "").trim().toLowerCase()

    if (!normalized) {
      setUsernameStatus("idle")
      setUsernameError("")
      return
    }

    if (!validateUsername(normalized)) {
      setUsernameStatus("invalid")
      return
    }

    if (normalized === currentUsername) {
      setUsernameStatus("idle")
      setUsernameError("")
      return
    }

    setUsernameStatus("checking")
    setUsernameError("Checking username availability...")

    if (usernameCheckTimeoutRef.current) {
      clearTimeout(usernameCheckTimeoutRef.current)
    }

    const requestId = ++usernameRequestIdRef.current
    usernameCheckTimeoutRef.current = setTimeout(async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id")
        .eq("username", normalized)
        .neq("id", profile.id)
        .maybeSingle()

      if (requestId !== usernameRequestIdRef.current) {
        return
      }

      if (error) {
        setUsernameStatus("idle")
        setUsernameError("")
        return
      }

      if (data) {
        setUsernameStatus("taken")
        setUsernameError("Username is already taken")
      } else {
        setUsernameStatus("available")
        setUsernameError("Username is available")
      }
    }, 350)

    return () => {
      if (usernameCheckTimeoutRef.current) {
        clearTimeout(usernameCheckTimeoutRef.current)
      }
    }
  }, [usernameInput, isOpen, profile?.id, profile?.username])

  const validateUsername = (username) => {
    setUsernameError("")

    if (username.length < 3) {
      setUsernameError("Username must be at least 3 characters")
      return false
    }

    if (username.length > 20) {
      setUsernameError("Username must be no more than 20 characters")
      return false
    }

    if (!/^[a-z0-9_]+$/.test(username)) {
      setUsernameError("Username can only contain lowercase letters, numbers, and underscore")
      return false
    }

    return true
  }

  const handleSave = async () => {
    setSaveError("")

    if (!nameInput.trim() || !usernameInput.trim()) {
      setSaveError("Full name and username are required")
      return
    }

    if (!validateUsername(usernameInput)) {
      return
    }

    if (usernameStatus === "taken") {
      setUsernameError("Username is already taken")
      return
    }

    try {
      setSaving(true)
      await onSave({
        name: nameInput.trim(),
        username: usernameInput.trim(),
        bio: bioInput.trim()
      }, {
        pendingAvatarFile,
        pendingCoverFile,
        coverPositionX,
        coverPositionY,
        coverZoom,
        avatarPositionX,
        avatarPositionY,
        avatarZoom,
      })
      onClose()
    } catch (err) {
      console.error("[EditProfileModal] Error saving:", err)
      const message = err?.message || "Failed to save changes"
      if (message.toLowerCase().includes("username")) {
        setUsernameStatus("taken")
        setUsernameError("Username is already taken")
      } else {
        setSaveError(message)
      }
    } finally {
      setSaving(false)
    }
  }

  const handleAvatarFileSelect = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      const compressedFile = await prepareImageForUpload(file)
      setPendingAvatarFile(compressedFile)
      setAvatarPreview(URL.createObjectURL(compressedFile))
    } catch (err) {
      if (err?.code === "IMAGE_TOO_LARGE") {
        addToast(IMAGE_TOO_LARGE_MESSAGE, "error")
      } else {
        addToast(err?.message || "Failed to process image.", "error")
      }
      e.target.value = ""
    }
  }

  const handleCoverFileSelect = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      const compressedFile = await prepareImageForUpload(file)
      setPendingCoverFile(compressedFile)
      setCoverPreview(URL.createObjectURL(compressedFile))
    } catch (err) {
      if (err?.code === "IMAGE_TOO_LARGE") {
        addToast(IMAGE_TOO_LARGE_MESSAGE, "error")
      } else {
        addToast(err?.message || "Failed to process image.", "error")
      }
      e.target.value = ""
    }
  }

  const handleCancel = () => {
    setPendingAvatarFile(null)
    setPendingCoverFile(null)
    setAvatarPreview(avatarUrl || null)
    setCoverPreview(coverPhotoUrl || null)
    setCoverPositionX(profile?.cover_position_x ?? 50)
    setCoverPositionY(profile?.cover_position_y ?? 50)
    setCoverZoom(profile?.cover_zoom ?? 1)
    setAvatarPositionX(50)
    setAvatarPositionY(50)
    setAvatarZoom(1)
    setIsDraggingCover(false)
    setIsDraggingAvatar(false)
    setSaveError("")
    onClose()
  }

  const clampPercent = (value) => Math.max(0, Math.min(100, value))

  const startCoverDrag = (clientX, clientY) => {
    setIsDraggingCover(true)
    dragStartRef.current = {
      x: clientX,
      y: clientY,
      coverX: coverPositionX,
      coverY: coverPositionY,
    }
  }

  const moveCoverDrag = (clientX, clientY) => {
    if (!isDraggingCover) return
    const dx = clientX - dragStartRef.current.x
    const dy = clientY - dragStartRef.current.y
    const sensitivity = 0.16

    setCoverPositionX(clampPercent(dragStartRef.current.coverX - dx * sensitivity))
    setCoverPositionY(clampPercent(dragStartRef.current.coverY - dy * sensitivity))
  }

  const endCoverDrag = () => {
    setIsDraggingCover(false)
  }

  const startAvatarDrag = (clientX, clientY) => {
    setIsDraggingAvatar(true)
    avatarDragStartRef.current = {
      x: clientX,
      y: clientY,
      avatarX: avatarPositionX,
      avatarY: avatarPositionY,
    }
  }

  const moveAvatarDrag = (clientX, clientY) => {
    if (!isDraggingAvatar) return
    const dx = clientX - avatarDragStartRef.current.x
    const dy = clientY - avatarDragStartRef.current.y
    const sensitivity = 0.16

    setAvatarPositionX(clampPercent(avatarDragStartRef.current.avatarX - dx * sensitivity))
    setAvatarPositionY(clampPercent(avatarDragStartRef.current.avatarY - dy * sensitivity))
  }

  const endAvatarDrag = () => {
    setIsDraggingAvatar(false)
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleCancel}
            className="fixed inset-0 z-40 bg-[var(--overlay-backdrop)] backdrop-blur-sm"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed inset-0 flex items-center justify-center z-50 p-4 pointer-events-none"
          >
            <motion.div className="pointer-events-auto w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-[20px] border border-[var(--overlay-border)] bg-[var(--overlay-surface)] shadow-[var(--overlay-shadow)]">
            {/* Header */}
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--overlay-border)] bg-[var(--overlay-surface)] px-6 py-4">
              <h2 className="font-['Sora'] text-2xl font-bold text-[var(--overlay-text)]">Edit Profile</h2>
              <button
                onClick={handleCancel}
                className="text-[var(--overlay-text-subtle)] transition-colors hover:text-[var(--overlay-text)]"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Content */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-6">
              {/* Left: Avatar + Preview */}
              <div className="flex flex-col items-center gap-6">
                <div className="w-full">
                  <p className="mb-2 text-[12px] font-semibold text-[var(--overlay-text-subtle)]">Change Cover Photo</p>
                  <div
                    className={`h-28 overflow-hidden rounded-[10px] border border-[var(--overlay-border-strong)] bg-[var(--overlay-elev)] ${isDraggingCover ? "cursor-grabbing" : "cursor-grab"}`}
                    onMouseDown={(e) => startCoverDrag(e.clientX, e.clientY)}
                    onMouseMove={(e) => moveCoverDrag(e.clientX, e.clientY)}
                    onMouseUp={endCoverDrag}
                    onMouseLeave={endCoverDrag}
                    onTouchStart={(e) => {
                      const touch = e.touches?.[0]
                      if (touch) startCoverDrag(touch.clientX, touch.clientY)
                    }}
                    onTouchMove={(e) => {
                      const touch = e.touches?.[0]
                      if (touch) moveCoverDrag(touch.clientX, touch.clientY)
                    }}
                    onTouchEnd={endCoverDrag}
                  >
                    {coverPreview ? (
                      <img
                        src={coverPreview}
                        alt="Cover preview"
                        className="h-full w-full object-cover select-none"
                        draggable={false}
                        style={{
                          objectPosition: `${coverPositionX}% ${coverPositionY}%`,
                          transform: `scale(${coverZoom})`,
                          transformOrigin: "center center",
                        }}
                      />
                    ) : (
                      <div className="h-full w-full bg-gradient-to-br from-[#1A1200] via-[#2A2000] to-[#1A0A00]" style={{ backgroundImage: "repeating-linear-gradient(45deg, transparent, transparent 40px, rgba(244,180,0,0.03) 40px, rgba(244,180,0,0.03) 80px)" }} />
                    )}
                  </div>
                  <p className="mt-2 text-xs text-[var(--overlay-text-muted)]">Drag to reposition</p>
                  <div className="mt-2">
                    <label className="text-xs font-medium text-[var(--overlay-text-subtle)]">Zoom slider</label>
                    <input
                      type="range"
                      min="1"
                      max="2"
                      step="0.01"
                      value={coverZoom}
                      onChange={(e) => setCoverZoom(parseFloat(e.target.value))}
                      className="mt-1 w-full"
                    />
                  </div>
                  <label className="mt-2 inline-flex cursor-pointer items-center rounded-[10px] bg-[#F4B400] px-3 py-1.5 text-xs font-bold text-[var(--profile-on-accent)] transition-colors hover:bg-[#C49000]">
                    Change Cover Photo
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleCoverFileSelect}
                      className="hidden"
                    />
                  </label>
                </div>

                <div className="text-center">
                  <h3 className="mb-4 text-[12px] font-semibold text-[var(--overlay-text-subtle)]">Profile Preview</h3>

                  {/* Avatar Preview */}
                  <div className="relative">
                    {avatarPreview ? (
                      <div
                        className={`mx-auto h-32 w-32 overflow-hidden rounded-full border-[2px] border-dashed border-[var(--overlay-border-strong)] bg-[var(--overlay-elev)] ${isDraggingAvatar ? "cursor-grabbing" : "cursor-grab"}`}
                        onMouseDown={(e) => startAvatarDrag(e.clientX, e.clientY)}
                        onMouseMove={(e) => moveAvatarDrag(e.clientX, e.clientY)}
                        onMouseUp={endAvatarDrag}
                        onMouseLeave={endAvatarDrag}
                        onTouchStart={(e) => {
                          const touch = e.touches?.[0]
                          if (touch) startAvatarDrag(touch.clientX, touch.clientY)
                        }}
                        onTouchMove={(e) => {
                          const touch = e.touches?.[0]
                          if (touch) moveAvatarDrag(touch.clientX, touch.clientY)
                        }}
                        onTouchEnd={endAvatarDrag}
                      >
                        <img
                          src={avatarPreview}
                          alt="Avatar"
                          className="h-full w-full object-cover select-none"
                          draggable={false}
                          style={{
                            objectPosition: `${avatarPositionX}% ${avatarPositionY}%`,
                            transform: `scale(${avatarZoom})`,
                            transformOrigin: "center center",
                          }}
                        />
                      </div>
                    ) : (
                      <div className="mx-auto flex h-32 w-32 items-center justify-center rounded-full border-[2px] border-dashed border-[var(--overlay-border-strong)] bg-[var(--overlay-elev)] text-4xl font-bold text-[#F4B400]">
                        {nameInput?.charAt(0)?.toUpperCase() || "?"}
                      </div>
                    )}

                    {/* Upload Button */}
                    <label className="absolute bottom-0 right-0 cursor-pointer rounded-full bg-[#F4B400] p-2 text-[var(--profile-on-accent)] shadow-lg transition-colors hover:bg-[#C49000]">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleAvatarFileSelect}
                        className="hidden"
                      />
                    </label>
                  </div>

                  <p className="mt-2 text-xs text-[var(--overlay-text-muted)]">Change Avatar (circular crop preview)</p>
                  <p className="mt-1 text-xs text-[var(--overlay-text-muted)]">Drag to reposition</p>
                  <div className="mt-2 w-full">
                    <label className="text-xs font-medium text-[var(--overlay-text-subtle)]">Zoom slider</label>
                    <input
                      type="range"
                      min="1"
                      max="2"
                      step="0.01"
                      value={avatarZoom}
                      onChange={(e) => setAvatarZoom(parseFloat(e.target.value))}
                      className="mt-1 w-full"
                    />
                  </div>

                  {/* Preview Info */}
                  <div className="mt-6 space-y-2 rounded-[10px] border border-[var(--overlay-border-strong)] bg-[var(--overlay-elev)] p-4 text-left">
                    <p className="text-center font-medium text-[var(--overlay-text)]">{nameInput || "Your Name"}</p>
                    <p className="text-center text-sm text-[var(--overlay-text-subtle)]">@{usernameInput || "username"}</p>
                    <p className="max-h-12 overflow-hidden text-center text-xs italic text-[var(--overlay-text-subtle)]">
                      {bioInput ? bioInput : "Your bio will appear here..."}
                    </p>
                  </div>
                </div>
              </div>

              {/* Right: Form Inputs */}
              <div className="flex flex-col gap-4">
                {/* Name */}
                <div>
                  <label className="mb-2 block text-[12px] font-semibold text-[var(--overlay-text-subtle)]">Full Name</label>
                  <input
                    type="text"
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    placeholder="Enter your full name"
                    className="h-[44px] w-full rounded-[10px] border border-[var(--overlay-border-strong)] bg-[var(--overlay-elev)] px-3 text-[13px] text-[var(--overlay-text)] outline-none placeholder:text-[var(--overlay-text-muted)] transition-all focus:border-[#F4B400] focus:shadow-[0_0_0_2px_rgba(244,180,0,0.12)]"
                  />
                </div>

                {/* Username */}
                <div>
                  <label className="mb-2 block text-[12px] font-semibold text-[var(--overlay-text-subtle)]">Username</label>
                  <input
                    type="text"
                    value={usernameInput}
                    onChange={(e) => {
                      const val = e.target.value.toLowerCase()
                      setUsernameInput(val)
                      setSaveError("")
                      if (val) validateUsername(val)
                    }}
                    placeholder="lowercase_username"
                    className={`h-[44px] w-full rounded-[10px] border bg-[var(--overlay-elev)] px-3 text-[13px] text-[var(--overlay-text)] outline-none placeholder:text-[var(--overlay-text-muted)] transition-all focus:shadow-[0_0_0_2px_rgba(244,180,0,0.12)] ${
                      usernameError && usernameStatus !== "available"
                        ? "border-[#EF4444] focus:border-[#EF4444]"
                        : "border-[var(--overlay-border-strong)] focus:border-[#F4B400]"
                    }`}
                  />
                  {usernameError && (
                    <p className={`mt-1 text-[11px] ${usernameStatus === "available" ? "text-[var(--overlay-text-subtle)]" : "text-[#EF4444]"}`}>{usernameError}</p>
                  )}
                  <p className="mt-1 text-xs text-[var(--overlay-text-muted)]">3-20 characters, lowercase, numbers, underscore</p>
                </div>

                {saveError && (
                  <p className="-mt-1 text-[11px] text-[#EF4444]">{saveError}</p>
                )}

                {/* Bio */}
                <div>
                  <label className="mb-2 block text-[12px] font-semibold text-[var(--overlay-text-subtle)]">Bio</label>
                  <textarea
                    value={bioInput}
                    onChange={(e) => setBioInput(e.target.value)}
                    placeholder="Tell us about yourself..."
                    rows={4}
                    maxLength={160}
                    className="h-auto w-full resize-none rounded-[10px] border border-[var(--overlay-border-strong)] bg-[var(--overlay-elev)] px-3 py-3 text-[13px] text-[var(--overlay-text)] outline-none placeholder:text-[var(--overlay-text-muted)] transition-all focus:border-[#F4B400] focus:shadow-[0_0_0_2px_rgba(244,180,0,0.12)]"
                  />
                  <p className="mt-1 text-xs text-[var(--overlay-text-muted)]">{bioInput.length}/160</p>
                </div>

                {/* Buttons */}
                <div className="flex gap-3 pt-4">
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleCancel}
                    className="flex-1 rounded-[10px] border border-[var(--overlay-border-strong)] bg-[var(--overlay-elev)] px-4 py-2 text-[13px] text-[var(--overlay-text)] transition-colors hover:bg-[var(--overlay-hover)]"
                  >
                    Cancel
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleSave}
                    disabled={
                      saving ||
                      !nameInput.trim() ||
                      !usernameInput.trim() ||
                      usernameStatus === "taken" ||
                      usernameStatus === "invalid" ||
                      usernameStatus === "checking"
                    }
                    className="flex-1 rounded-[10px] bg-[#F4B400] px-5 py-2 text-[13px] font-bold text-[var(--profile-on-accent)] transition-colors hover:bg-[#C49000] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {saving ? "Saving..." : "Save Changes"}
                  </motion.button>
                </div>
              </div>
            </div>
            </motion.div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
