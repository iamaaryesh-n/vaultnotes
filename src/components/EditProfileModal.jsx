import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { supabase } from "../lib/supabase"

export function EditProfileModal({
  isOpen,
  onClose,
  profile,
  avatarUrl,
  onSave,
  onAvatarUpload,
  uploading
}) {
  const [nameInput, setNameInput] = useState(profile?.name || "")
  const [usernameInput, setUsernameInput] = useState(profile?.username || "")
  const [bioInput, setBioInput] = useState(profile?.bio || "")
  const [usernameError, setUsernameError] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (isOpen && profile) {
      setNameInput(profile.name || "")
      setUsernameInput(profile.username || "")
      setBioInput(profile.bio || "")
      setUsernameError("")
    }
  }, [isOpen, profile])

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
    if (!nameInput.trim() || !usernameInput.trim()) {
      return
    }

    if (!validateUsername(usernameInput)) {
      return
    }

    try {
      setSaving(true)
      await onSave({
        name: nameInput.trim(),
        username: usernameInput.trim(),
        bio: bioInput.trim()
      })
      onClose()
    } catch (err) {
      console.error("[EditProfileModal] Error saving:", err)
    } finally {
      setSaving(false)
    }
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
            onClick={onClose}
            className="fixed inset-0 bg-black/50 z-40"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed inset-0 flex items-center justify-center z-50 p-4 pointer-events-none"
          >
            <motion.div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto pointer-events-auto">
            {/* Header */}
            <div className="sticky top-0 px-6 py-4 border-b border-slate-200 bg-white flex items-center justify-between z-10">
              <h2 className="text-2xl font-bold text-slate-900">Edit Profile</h2>
              <button
                onClick={onClose}
                className="text-slate-500 hover:text-slate-900 transition-colors"
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
                <div className="text-center">
                  <h3 className="text-sm font-semibold text-slate-700 mb-4">Profile Preview</h3>

                  {/* Avatar Preview */}
                  <div className="relative">
                    {avatarUrl ? (
                      <img
                        src={avatarUrl}
                        alt="Avatar"
                        className="w-32 h-32 rounded-full object-cover border-4 border-blue-200 mx-auto"
                      />
                    ) : (
                      <div className="w-32 h-32 rounded-full bg-gradient-to-br from-blue-400 to-cyan-400 flex items-center justify-center text-4xl font-bold text-white border-4 border-blue-200 mx-auto">
                        {nameInput?.charAt(0)?.toUpperCase() || "?"}
                      </div>
                    )}

                    {/* Upload Button */}
                    <label className="absolute bottom-0 right-0 bg-blue-500 hover:bg-blue-600 text-white rounded-full p-2 cursor-pointer transition-colors shadow-lg">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => onAvatarUpload(e)}
                        disabled={uploading}
                        className="hidden"
                      />
                    </label>
                  </div>

                  {uploading && <p className="text-xs text-slate-500 mt-2">Uploading...</p>}

                  {/* Preview Info */}
                  <div className="mt-6 text-left bg-slate-50 rounded-lg p-4 space-y-2">
                    <p className="text-center text-slate-600 font-medium">{nameInput || "Your Name"}</p>
                    <p className="text-center text-slate-500 text-sm">@{usernameInput || "username"}</p>
                    <p className="text-center text-slate-600 text-xs italic max-h-12 overflow-hidden">
                      {bioInput ? bioInput : "Your bio will appear here..."}
                    </p>
                  </div>
                </div>
              </div>

              {/* Right: Form Inputs */}
              <div className="flex flex-col gap-4">
                {/* Name */}
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Full Name</label>
                  <input
                    type="text"
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    placeholder="Enter your full name"
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  />
                </div>

                {/* Username */}
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Username</label>
                  <input
                    type="text"
                    value={usernameInput}
                    onChange={(e) => {
                      const val = e.target.value.toLowerCase()
                      setUsernameInput(val)
                      if (val) validateUsername(val)
                    }}
                    placeholder="lowercase_username"
                    className={`w-full px-4 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:border-transparent transition-all ${
                      usernameError
                        ? "border-red-300 focus:ring-red-500"
                        : "border-slate-300 focus:ring-blue-500"
                    }`}
                  />
                  {usernameError && (
                    <p className="text-xs text-red-600 mt-1">{usernameError}</p>
                  )}
                  <p className="text-xs text-slate-500 mt-1">3-20 characters, lowercase, numbers, underscore</p>
                </div>

                {/* Bio */}
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Bio</label>
                  <textarea
                    value={bioInput}
                    onChange={(e) => setBioInput(e.target.value)}
                    placeholder="Tell us about yourself..."
                    rows={4}
                    maxLength={160}
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none transition-all"
                  />
                  <p className="text-xs text-slate-500 mt-1">{bioInput.length}/160</p>
                </div>

                {/* Buttons */}
                <div className="flex gap-3 pt-4">
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={onClose}
                    className="flex-1 px-4 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-900 font-semibold hover:bg-slate-50 transition-colors"
                  >
                    Cancel
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleSave}
                    disabled={saving || !nameInput.trim() || !usernameInput.trim() || !!usernameError}
                    className="flex-1 px-4 py-2.5 rounded-lg bg-blue-500 hover:bg-blue-600 text-white font-bold disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
