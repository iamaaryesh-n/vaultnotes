import { useEffect, useMemo, useRef, useState } from "react"
import { supabase } from "../lib/supabase"
import { useNavigate } from "react-router-dom"
import Modal from "../components/Modal"
import { applyTheme, getStoredTheme, setStoredTheme } from "../utils/theme"
import { useToast } from "../hooks/useToast"
import { IMAGE_TOO_LARGE_MESSAGE, prepareImageForUpload } from "../lib/imageCompression"

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function Login({ initialMode = "login" }) {
  const navigate = useNavigate()
  const { addToast } = useToast()

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [username, setUsername] = useState("")
  const [fullName, setFullName] = useState("")
  const [bio, setBio] = useState("")
  const [avatarFile, setAvatarFile] = useState(null)
  const [avatarPreview, setAvatarPreview] = useState("")
  const [coverPhotoFile, setCoverPhotoFile] = useState(null)
  const [coverPhotoPreview, setCoverPhotoPreview] = useState("")
  const [signupStep, setSignupStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [isSignup, setIsSignup] = useState(initialMode === "signup")
  const [formError, setFormError] = useState("")
  const [usernameStatus, setUsernameStatus] = useState("idle")
  const [usernameMessage, setUsernameMessage] = useState("")
  const [modalConfig, setModalConfig] = useState({ open: false, title: "", message: "", onConfirm: null })
  const [selectedTheme, setSelectedTheme] = useState("system")
  const usernameCheckTimeoutRef = useRef(null)
  const usernameRequestIdRef = useRef(0)

  const stepProgress = useMemo(() => {
    if (!isSignup) return 0
    return signupStep === 1 ? 50 : 100
  }, [isSignup, signupStep])

  const resetSignupForm = () => {
    setSignupStep(1)
    setUsername("")
    setFullName("")
    setBio("")
    setAvatarFile(null)
    setAvatarPreview("")
    setCoverPhotoFile(null)
    setCoverPhotoPreview("")
    setUsernameStatus("idle")
    setUsernameMessage("")
    setFormError("")
  }

  const toggleMode = () => {
    setIsSignup(!isSignup)
    setEmail("")
    setPassword("")
    resetSignupForm()
    setModalConfig({ open: false, title: "", message: "", onConfirm: null })
  }

  const validateStep1 = () => {
    if (!emailPattern.test(email.trim())) {
      setFormError("Please enter a valid email address.")
      return false
    }

    if (password.length < 6) {
      setFormError("Password must be at least 6 characters.")
      return false
    }

    setFormError("")
    return true
  }

  const validateStep2 = () => {
    const cleanUsername = username.trim().toLowerCase()
    const cleanFullName = fullName.trim()

    if (!cleanUsername) {
      setFormError("Username is required.")
      return false
    }

    if (!/^[a-z0-9_]{3,20}$/.test(cleanUsername)) {
      setFormError("Username must be 3-20 chars and use lowercase letters, numbers, or _.")
      return false
    }

    if (usernameStatus === "taken") {
      setFormError("This username is already taken. Please choose another one.")
      return false
    }

    if (!cleanFullName) {
      setFormError("Full name is required.")
      return false
    }

    setFormError("")
    return true
  }

  useEffect(() => {
    const savedTheme = getStoredTheme()
    setSelectedTheme(savedTheme)
    applyTheme(savedTheme)
  }, [])

  useEffect(() => {
    if (!(isSignup && signupStep === 2)) {
      return
    }

    const normalized = username.trim().toLowerCase()

    if (!normalized) {
      setUsernameStatus("idle")
      setUsernameMessage("")
      return
    }

    if (!/^[a-z0-9_]{3,20}$/.test(normalized)) {
      setUsernameStatus("invalid")
      setUsernameMessage("Username must be 3-20 chars and use lowercase letters, numbers, or _.")
      return
    }

    setUsernameStatus("checking")
    setUsernameMessage("Checking username...")

    if (usernameCheckTimeoutRef.current) {
      clearTimeout(usernameCheckTimeoutRef.current)
    }

    const requestId = ++usernameRequestIdRef.current
    usernameCheckTimeoutRef.current = setTimeout(async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id")
        .eq("username", normalized)
        .maybeSingle()

      if (requestId !== usernameRequestIdRef.current) {
        return
      }

      if (error) {
        setUsernameStatus("idle")
        setUsernameMessage("")
        return
      }

      if (data) {
        setUsernameStatus("taken")
        setUsernameMessage("This username is already taken.")
      } else {
        setUsernameStatus("available")
        setUsernameMessage("Username is available.")
      }
    }, 350)

    return () => {
      if (usernameCheckTimeoutRef.current) {
        clearTimeout(usernameCheckTimeoutRef.current)
      }
    }
  }, [username, isSignup, signupStep])

  const handleContinue = (e) => {
    e.preventDefault()
    if (!validateStep1()) return
    setSignupStep(2)
  }

  const handleGoogleAuth = async () => {
    if (isSignup) {
      setFormError("Username is mandatory for signup. Please continue with email and complete step 2.")
      return
    }

    setFormError("")
    setLoading(true)

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.origin,
      },
    })

    if (error) {
      setModalConfig({
        open: true,
        title: "Google Login Error",
        message: error.message,
        onConfirm: () => setModalConfig({ ...modalConfig, open: false })
      })
      setLoading(false)
    }
  }

  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      const compressedFile = await prepareImageForUpload(file)
      setAvatarFile(compressedFile)
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

  const handleCoverPhotoChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      const compressedFile = await prepareImageForUpload(file)
      setCoverPhotoFile(compressedFile)
      setCoverPhotoPreview(URL.createObjectURL(compressedFile))
    } catch (err) {
      if (err?.code === "IMAGE_TOO_LARGE") {
        addToast(IMAGE_TOO_LARGE_MESSAGE, "error")
      } else {
        addToast(err?.message || "Failed to process image.", "error")
      }
      e.target.value = ""
    }
  }

  const getDefaultAvatarUrl = (nameSeed) => {
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(nameSeed)}&background=F3F4F6&color=111827&size=256`
  }

  const uploadFileToBucket = async ({ file, bucket, fileName }) => {
    if (!file) return null

    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(fileName, file, { upsert: true })

    if (uploadError) {
      throw new Error(`Failed to upload ${bucket} file: ${uploadError.message}`)
    }

    const { data: publicUrlData } = supabase.storage
      .from(bucket)
      .getPublicUrl(fileName)

    return publicUrlData?.publicUrl || null
  }

  const insertProfile = async ({ authUserId, signupEmail, signupUsername, signupName, signupBio, avatarUrl, coverPhotoUrl }) => {
    const profilePayload = {
      id: authUserId,
      email: signupEmail,
      username: signupUsername,
      name: signupName,
      bio: signupBio,
      avatar_url: avatarUrl,
      cover_photo_url: coverPhotoUrl,
    }

    const { error } = await supabase
      .from("profiles")
      .insert(profilePayload)

    if (!error) return

    // Backward compatible fallback if cover_photo_url is not available yet.
    if (error.message?.toLowerCase().includes("cover_photo_url")) {
      const { cover_photo_url, ...fallbackPayload } = profilePayload
      const { error: fallbackError } = await supabase
        .from("profiles")
        .insert(fallbackPayload)

      if (!fallbackError) return
      throw new Error(fallbackError.message)
    }

    throw new Error(error.message)
  }

  const handleLogin = async (e) => {
    e.preventDefault()
    setFormError("")

    if (!validateStep1()) return

    setLoading(true)

    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })

    if (error) {
      setModalConfig({
        open: true,
        title: "Login Error",
        message: error.message,
        onConfirm: () => setModalConfig({ ...modalConfig, open: false })
      })
    } else {
      navigate("/")
    }

    setLoading(false)
  }

  const handleSignup = async (e) => {
    e.preventDefault()

    if (!validateStep1() || !validateStep2()) {
      return
    }

    setLoading(true)

    try {
      const normalizedEmail = email.trim()
      const normalizedUsername = username.trim().toLowerCase()
      const normalizedName = fullName.trim()
      const normalizedBio = bio.trim()

      const { data: existingUsername, error: usernameCheckError } = await supabase
        .from("profiles")
        .select("id")
        .eq("username", normalizedUsername)
        .maybeSingle()

      if (usernameCheckError) {
        throw new Error(usernameCheckError.message)
      }

      if (existingUsername) {
        throw new Error("This username is already taken. Please choose another one.")
      }

      const { data, error } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
      })

      if (error) {
        throw new Error(error.message)
      }

      const authUser = data?.user
      if (!authUser?.id) {
        throw new Error("Unable to complete signup. No user id was returned.")
      }

      if (authUser?.identities && authUser.identities.length === 0) {
        setModalConfig({
          open: true,
          title: "Account Already Exists",
          message: "This email is already registered. Please log in instead.",
          onConfirm: () => {
            setModalConfig({ ...modalConfig, open: false })
            setIsSignup(false)
            setEmail("")
            setPassword("")
            resetSignupForm()
          }
        })
        setLoading(false)
        return
      }

      const avatarExt = avatarFile?.name.split(".").pop() || "png"
      const coverExt = coverPhotoFile?.name.split(".").pop() || "png"

      const uploadedAvatar = await uploadFileToBucket({
        file: avatarFile,
        bucket: "avatars",
        fileName: `${authUser.id}.${avatarExt}`,
      })
      const uploadedCoverPhoto = await uploadFileToBucket({
        file: coverPhotoFile,
        bucket: "cover-photos",
        fileName: `${authUser.id}.${coverExt}`,
      })

      const fallbackAvatar = getDefaultAvatarUrl(normalizedName || normalizedUsername || "User")
      const avatarUrl = uploadedAvatar || fallbackAvatar
      const coverPhotoUrl = uploadedCoverPhoto || null

      await insertProfile({
        authUserId: authUser.id,
        signupEmail: normalizedEmail,
        signupUsername: normalizedUsername,
        signupName: normalizedName,
        signupBio: normalizedBio,
        avatarUrl,
        coverPhotoUrl,
      })

      // Redirect only after full onboarding is complete (credentials -> profile setup -> app)
      navigate("/")
      return
    } catch (err) {
      setModalConfig({
        open: true,
        title: "Signup Error",
        message: err.message,
        onConfirm: () => setModalConfig({ ...modalConfig, open: false })
      })
    }

    setLoading(false)
  }

  const handleCloseModal = () => {
    setModalConfig({ ...modalConfig, open: false })
    if (modalConfig.onConfirm) {
      modalConfig.onConfirm()
    }
  }

  const handleThemeChange = (theme) => {
    setStoredTheme(theme)
    applyTheme(theme)
    setSelectedTheme(theme)
  }

  return (
    <div className="relative flex min-h-screen min-h-dvh items-start justify-center overflow-x-hidden overflow-y-auto bg-[var(--profile-bg)] px-4 py-6 sm:items-center">
      <div
        className="pointer-events-none absolute inset-0 opacity-100"
        style={{ backgroundImage: "radial-gradient(circle, rgba(244,180,0,0.06) 1px, transparent 1px)", backgroundSize: "32px 32px" }}
      />
      <div
        className="pointer-events-none absolute -top-[180px] -left-[180px] h-[520px] w-[520px] rounded-full"
        style={{ background: "radial-gradient(circle, rgba(244,180,0,0.07) 0%, transparent 70%)" }}
      />
      <div
        className="pointer-events-none absolute -bottom-[200px] -right-[200px] h-[600px] w-[600px] rounded-full"
        style={{ background: "radial-gradient(circle, rgba(244,180,0,0.05) 0%, transparent 70%)" }}
      />

      <div className="relative z-10 w-full max-w-[420px] overflow-hidden rounded-[24px] border border-[var(--profile-border)] bg-[var(--profile-surface)]">
        <div className="h-[3px] bg-gradient-to-r from-[#F4B400] via-[rgba(244,180,0,0.2)] to-transparent" />

        <div className="px-8 pt-8 pb-6">
          <div className="mb-4 flex items-center justify-end">
            <div className="flex items-center gap-1 rounded-[10px] border border-[var(--profile-border)] bg-[var(--profile-elev)] p-1">
              <button
                type="button"
                onClick={() => handleThemeChange("light")}
                className={`rounded-[8px] px-2.5 py-1 text-[11px] font-[700] transition-all ${selectedTheme === "light" ? "bg-[#F4B400] text-[#111]" : "text-[var(--profile-text-subtle)] hover:text-[var(--profile-text)]"}`}
                aria-label="Use light theme"
              >
                Light
              </button>
              <button
                type="button"
                onClick={() => handleThemeChange("dark")}
                className={`rounded-[8px] px-2.5 py-1 text-[11px] font-[700] transition-all ${selectedTheme === "dark" ? "bg-[#F4B400] text-[#111]" : "text-[var(--profile-text-subtle)] hover:text-[var(--profile-text)]"}`}
                aria-label="Use dark theme"
              >
                Dark
              </button>
              <button
                type="button"
                onClick={() => handleThemeChange("system")}
                className={`rounded-[8px] px-2.5 py-1 text-[11px] font-[700] transition-all ${selectedTheme === "system" ? "bg-[#F4B400] text-[#111]" : "text-[var(--profile-text-subtle)] hover:text-[var(--profile-text)]"}`}
                aria-label="Use system theme"
              >
                Auto
              </button>
            </div>
          </div>

          <div className="mb-7 flex items-center gap-[10px]">
            <div className="flex h-[40px] w-[40px] items-center justify-center rounded-[12px] border border-[rgba(244,180,0,0.2)] bg-[#2A2000] font-['Sora'] text-[18px] font-[800] text-[#F4B400]">V</div>
            <div className="font-['Sora'] text-[18px] font-[700] text-[var(--profile-text)]">Vault<span className="text-[#F4B400]">.</span>Notes</div>
          </div>

          <div>
            <h1 className="font-['Sora'] text-[24px] font-[800] leading-[1.2] text-[var(--profile-text)]">{isSignup ? "Create your account" : "Welcome back"}</h1>
            <p className="mt-[6px] text-[14px] text-[var(--profile-text-subtle)]">{isSignup ? "Join VaultNotes — free, encrypted, yours" : "Sign in to your encrypted workspace"}</p>
          </div>

          {isSignup && (
            <div className="mt-5">
              <div className="h-[3px] overflow-hidden rounded-full bg-[var(--profile-elev)]">
                <div className="h-full rounded-full bg-[#F4B400] transition-all duration-[400ms]" style={{ width: `${stepProgress}%` }} />
              </div>
              <div className="mt-2 flex justify-between">
                <div className={`flex items-center gap-[5px] text-[11px] font-[600] ${signupStep === 1 ? "text-[#F4B400]" : signupStep >= 2 ? "text-[#F4B400]" : "text-[var(--profile-text-muted)]"}`}>
                  <div className={`flex h-[16px] w-[16px] items-center justify-center rounded-full border text-[9px] font-[700] ${signupStep >= 2 ? "border-[#F4B400] bg-[#F4B400] text-[#000]" : signupStep === 1 ? "border-[#F4B400] text-[#F4B400]" : "border-[var(--profile-border-strong)] text-[var(--profile-text-muted)]"}`}>1</div>
                  Credentials
                </div>
                <div className={`flex items-center gap-[5px] text-[11px] font-[600] ${signupStep === 2 ? "text-[#F4B400]" : "text-[var(--profile-text-muted)]"}`}>
                  <div className={`flex h-[16px] w-[16px] items-center justify-center rounded-full border text-[9px] font-[700] ${signupStep === 2 ? "border-[#F4B400] bg-[#F4B400] text-[#000]" : "border-[var(--profile-border-strong)] text-[var(--profile-text-muted)]"}`}>2</div>
                  Your Profile
                </div>
              </div>
            </div>
          )}

          <form onSubmit={isSignup ? (signupStep === 2 ? handleSignup : handleContinue) : handleLogin} className="mt-6 space-y-4">
          {!isSignup ? (
            <div className="space-y-4 onboard-step">
              <div>
                <label className="mb-[7px] block text-[12px] font-[600] tracking-[.03em] text-[var(--profile-text-subtle)]">Email *</label>
                <input
                  type="email"
                  placeholder="you@example.com"
                  className="h-[48px] w-full rounded-[12px] border border-[var(--profile-border)] bg-[var(--profile-elev)] px-4 font-['DM_Sans'] text-[14px] text-[var(--profile-text)] outline-none transition-all duration-200 placeholder:text-[var(--profile-text-muted)] focus:border-[#F4B400] focus:bg-[var(--profile-hover)]"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="mb-[7px] block text-[12px] font-[600] tracking-[.03em] text-[var(--profile-text-subtle)]">Password *</label>
                <div className="relative">
                  <input
                    type="password"
                    placeholder="Minimum 6 characters"
                    className="h-[48px] w-full rounded-[12px] border border-[var(--profile-border)] bg-[var(--profile-elev)] px-4 pr-12 font-['DM_Sans'] text-[14px] text-[var(--profile-text)] outline-none transition-all duration-200 placeholder:text-[var(--profile-text-muted)] focus:border-[#F4B400] focus:bg-[var(--profile-hover)]"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  <button type="button" className="absolute right-[14px] top-1/2 -translate-y-1/2 border-none bg-transparent p-0 text-[16px] text-[var(--profile-text-muted)] transition-colors hover:text-[var(--profile-text-subtle)]">👁</button>
                </div>
              </div>

              <div className="flex items-center gap-3 py-1">
                <div className="h-[1px] flex-1 bg-[var(--profile-border)]" />
                <div className="text-[12px] font-[500] text-[var(--profile-text-muted)]">or continue with</div>
                <div className="h-[1px] flex-1 bg-[var(--profile-border)]" />
              </div>

              <button
                type="button"
                onClick={handleGoogleAuth}
                className="flex h-[48px] w-full items-center justify-center gap-[10px] rounded-[12px] border border-[var(--profile-border-strong)] bg-[var(--profile-elev)] font-['DM_Sans'] text-[14px] font-[600] text-[var(--profile-text)] transition-all hover:border-[var(--profile-text-subtle)] hover:bg-[var(--profile-hover)]"
              >
                <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                Continue with Google
              </button>
            </div>
          ) : signupStep === 1 ? (
            <div className="space-y-4 onboard-step">
              <div>
                <label className="mb-[7px] block text-[12px] font-[600] tracking-[.03em] text-[var(--profile-text-subtle)]">Email *</label>
                <input
                  type="email"
                  placeholder="you@example.com"
                  className="h-[48px] w-full rounded-[12px] border border-[var(--profile-border)] bg-[var(--profile-elev)] px-4 font-['DM_Sans'] text-[14px] text-[var(--profile-text)] outline-none transition-all duration-200 placeholder:text-[var(--profile-text-muted)] focus:border-[#F4B400] focus:bg-[var(--profile-hover)]"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="mb-[7px] block text-[12px] font-[600] tracking-[.03em] text-[var(--profile-text-subtle)]">Password *</label>
                <div className="relative">
                  <input
                    type="password"
                    placeholder="Minimum 6 characters"
                    className="h-[48px] w-full rounded-[12px] border border-[var(--profile-border)] bg-[var(--profile-elev)] px-4 pr-12 font-['DM_Sans'] text-[14px] text-[var(--profile-text)] outline-none transition-all duration-200 placeholder:text-[var(--profile-text-muted)] focus:border-[#F4B400] focus:bg-[var(--profile-hover)]"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  <button type="button" className="absolute right-[14px] top-1/2 -translate-y-1/2 border-none bg-transparent p-0 text-[16px] text-[var(--profile-text-muted)] transition-colors hover:text-[var(--profile-text-subtle)]">👁</button>
                </div>
              </div>

              <p className="rounded-[10px] border border-[var(--profile-border)] bg-[var(--profile-elev)] px-3 py-2 text-[12px] text-[var(--profile-text-subtle)]">
                Username is mandatory and will be collected in the next step.
              </p>
            </div>
          ) : (
            <div className="space-y-4 onboard-step">
              <div>
                <label className="mb-[7px] block text-[12px] font-[600] tracking-[.03em] text-[var(--profile-text-subtle)]">Username *</label>
                <input
                  type="text"
                  placeholder="username"
                  className={`h-[48px] w-full rounded-[12px] border bg-[var(--profile-elev)] px-4 font-['DM_Sans'] text-[14px] text-[var(--profile-text)] outline-none transition-all duration-200 placeholder:text-[var(--profile-text-muted)] focus:border-[#F4B400] focus:bg-[var(--profile-hover)] ${
                    usernameStatus === "taken" || usernameStatus === "invalid"
                      ? "border-[#EF4444]"
                      : usernameStatus === "available"
                        ? "border-[#22C55E]"
                        : "border-[var(--profile-border)]"
                  }`}
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value.toLowerCase())
                    setFormError("")
                  }}
                  required
                />
                {usernameMessage && (
                  <p
                    className={`mt-[5px] text-[11px] leading-[1.4] ${
                      usernameStatus === "taken" || usernameStatus === "invalid"
                        ? "text-[#EF4444]"
                        : usernameStatus === "available"
                          ? "text-[#22C55E]"
                          : "text-[var(--profile-text-muted)]"
                    }`}
                  >
                    {usernameMessage}
                  </p>
                )}
              </div>

              <div>
                <label className="mb-[7px] block text-[12px] font-[600] tracking-[.03em] text-[var(--profile-text-subtle)]">Full Name *</label>
                <input
                  type="text"
                  placeholder="Your full name"
                  className="h-[48px] w-full rounded-[12px] border border-[var(--profile-border)] bg-[var(--profile-elev)] px-4 font-['DM_Sans'] text-[14px] text-[var(--profile-text)] outline-none transition-all duration-200 placeholder:text-[var(--profile-text-muted)] focus:border-[#F4B400] focus:bg-[var(--profile-hover)]"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="mb-[7px] block text-[12px] font-[600] tracking-[.03em] text-[var(--profile-text-subtle)]">Bio</label>
                <textarea
                  rows={3}
                  placeholder="Tell people a little about you"
                  className="w-full resize-none rounded-[12px] border border-[var(--profile-border)] bg-[var(--profile-elev)] px-4 py-3 font-['DM_Sans'] text-[14px] text-[var(--profile-text)] outline-none placeholder:text-[var(--profile-text-muted)] focus:border-[#F4B400] focus:bg-[var(--profile-hover)]"
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                />
              </div>

              <div>
                <label className="mb-[7px] block text-[12px] font-[600] tracking-[.03em] text-[var(--profile-text-subtle)]">Avatar</label>
                <div className="flex items-center gap-[14px] rounded-[12px] border border-[var(--profile-border)] bg-[var(--profile-elev)] p-[12px_14px]">
                  <div className="h-[48px] w-[48px] overflow-hidden rounded-full border border-[rgba(244,180,0,0.2)] bg-[#2A2000]">
                    {avatarPreview ? (
                      <img src={avatarPreview} alt="Avatar preview" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center font-['Sora'] text-[18px] font-[700] text-[#F4B400]">{(fullName.trim().charAt(0) || "?").toUpperCase()}</div>
                    )}
                  </div>
                  <div>
                    <label className="cursor-pointer rounded-[8px] border border-[var(--profile-border-strong)] bg-[#1C1C1C] px-[14px] py-[6px] text-[12px] font-[600] text-[var(--profile-text-subtle)] transition-all hover:border-[#F4B400] hover:text-[#F4B400]">
                      Upload photo
                      <input type="file" accept="image/*" onChange={handleAvatarChange} className="hidden" />
                    </label>
                    <div className="mt-[3px] text-[11px] text-[var(--profile-text-muted)]">JPG, PNG up to 5MB</div>
                  </div>
                </div>
              </div>

              <div>
                <label className="mb-[7px] block text-[12px] font-[600] tracking-[.03em] text-[var(--profile-text-subtle)]">Cover Photo</label>
                <div className="overflow-hidden rounded-[12px] border border-[var(--profile-border)] bg-[var(--profile-elev)]">
                  <div className="h-[80px] w-full overflow-hidden">
                    {coverPhotoPreview ? (
                      <img src={coverPhotoPreview} alt="Cover photo preview" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-gradient-to-r from-[#1A1200] to-[#2A2000] text-[11px] text-[var(--profile-text-muted)]">No cover selected</div>
                    )}
                  </div>
                  <div className="flex items-center justify-between px-[14px] py-[10px]">
                    <span className="text-[11px] text-[var(--profile-text-muted)]">Recommended: 1200x300px</span>
                    <label className="cursor-pointer rounded-[8px] border border-[var(--profile-border-strong)] bg-[#1C1C1C] px-[14px] py-[6px] text-[12px] font-[600] text-[var(--profile-text-subtle)] transition-all hover:border-[#F4B400] hover:text-[#F4B400]">
                      Upload
                      <input type="file" accept="image/*" onChange={handleCoverPhotoChange} className="hidden" />
                    </label>
                  </div>
                </div>
              </div>
            </div>
          )}

          {formError && (
            <p className="mb-4 rounded-[10px] border border-[rgba(239,68,68,0.25)] bg-[rgba(239,68,68,0.08)] px-[14px] py-[10px] text-[13px] text-[#EF4444]">{formError}</p>
          )}

          <div className="flex gap-2">
            {isSignup && signupStep === 2 && (
              <button
                type="button"
                onClick={() => {
                  setSignupStep(1)
                  setFormError("")
                }}
                className="min-w-[90px] h-[50px] rounded-[12px] border border-[var(--profile-border-strong)] bg-[var(--profile-elev)] px-4 text-[14px] font-[600] text-[var(--profile-text-subtle)] transition-all hover:border-[var(--profile-text-subtle)] hover:text-[var(--profile-text)]"
                disabled={loading}
              >
                ← Back
              </button>
            )}

            <button
              type="submit"
              className={`btn-primary h-[50px] rounded-[12px] px-4 font-['Sora'] text-[15px] font-[700] text-[#000000] transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-50 ${loading ? "loading" : ""} ${
                isSignup && signupStep === 2 ? "w-2/3" : "w-full"
              }`}
              style={{ boxShadow: "0 4px 20px rgba(244,180,0,0.35)" }}
              disabled={loading}
            >
              <span>{loading
                ? isSignup
                  ? "Creating..."
                  : "Logging in..."
                : isSignup
                  ? signupStep === 1
                    ? "Continue ->"
                    : "Create Account"
                  : "Sign In"}</span>
              <div className="spinner" />
            </button>
          </div>

            <div className="mt-4 flex items-center justify-center gap-[6px]">
              <svg className="h-[13px] w-[13px]" viewBox="0 0 16 16" fill="none">
                <path d="M8 1L2 3.5V8c0 3.1 2.4 5.9 6 6.9 3.6-1 6-3.8 6-6.9V3.5L8 1z" stroke="var(--profile-text-muted)" strokeWidth="1.2" fill="none"/>
                <path d="M5.5 8l2 2 3-3" stroke="var(--profile-text-muted)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span className="text-[11px] text-[var(--profile-text-muted)]">End-to-end encrypted · Your data stays yours</span>
            </div>
          </form>
        </div>

        <div className="border-t border-[var(--profile-border)] px-8 py-[18px] text-center">
          <p className="text-[13px] text-[var(--profile-text-muted)]">
            {isSignup ? "Already have an account?" : "Don't have an account?"}
            <button
              type="button"
              onClick={toggleMode}
              className="ml-1 border-none bg-transparent text-[13px] font-[700] text-[#F4B400] underline decoration-[rgba(244,180,0,0.4)] underline-offset-[3px] transition-all hover:text-[#C49000] hover:decoration-[#C49000]"
            >
              {isSignup ? "Sign in" : "Create one"}
            </button>
          </p>
        </div>
      </div>

      <Modal
        open={modalConfig.open}
        title={modalConfig.title}
        message={modalConfig.message}
        confirmText="OK"
        showCancel={false}
        onConfirm={handleCloseModal}
      />

      <style>{`
        @keyframes onboardStepIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .btn-primary {
          background: #F4B400;
          border: none;
          cursor: pointer;
          position: relative;
          overflow: hidden;
        }

        .btn-primary:hover {
          background: #C49000;
          transform: translateY(-1px);
          box-shadow: 0 6px 24px rgba(244,180,0,0.45);
        }

        .btn-primary:active {
          transform: translateY(0);
          box-shadow: 0 2px 10px rgba(244,180,0,0.3);
        }

        .btn-primary .spinner {
          display: none;
          width: 18px;
          height: 18px;
          border: 2.5px solid rgba(0,0,0,0.3);
          border-top-color: #000;
          border-radius: 50%;
          animation: spin 0.7s linear infinite;
          margin: 0 auto;
        }

        .btn-primary.loading span {
          display: none;
        }

        .btn-primary.loading .spinner {
          display: block;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .onboard-step {
          animation: onboardStepIn 260ms ease-out;
        }
      `}</style>
    </div>
  )
}
