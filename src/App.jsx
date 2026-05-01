import { Routes, Route, useLocation, useNavigate, Navigate, Outlet, useNavigationType } from "react-router-dom"
import { useEffect, useState, Suspense, lazy, useRef } from "react"
import { useAuth } from "./hooks/useAuth"
import { ToastProvider } from "./context/ToastContext"
import { AuthProvider } from "./context/AuthContext"
import LoadingBar from "./components/LoadingBar"
import ToastContainer from "./components/ToastContainer"
import BottomNavigation from "./components/BottomNavigation"
import CreatePostModal from "./components/CreatePostModal"
import Navbar from "./components/Navbar"
import ErrorBoundary from "./components/ErrorBoundary"
import { initializeTheme } from "./utils/theme"
import { useNavigationStore } from "./stores/navigationStore"
import { initializeWebPush } from "./lib/firebaseMessaging"
import { supabase } from "./lib/supabase"
import vaultNotesLogoMark from "./assets/branding/vaultnotes-logo-mark.png"

// Eagerly load lightweight pages
import Login from "./pages/Login"
import DiscoverWorkspaces from "./pages/DiscoverWorkspaces"

// Lazy load heavy routes (code splitting for better performance)
const Explore = lazy(() => import("./pages/Explore"))
const Dashboard = lazy(() => import("./pages/Dashboard"))
const Notifications = lazy(() => import("./pages/Notifications").then((module) => ({ default: module.Notifications })))
const WorkspaceDetail = lazy(() => import("./pages/WorkspaceDetail"))
const MemoryView = lazy(() => import("./pages/MemoryView"))
const MemoryEditor = lazy(() => import("./pages/MemoryEditor"))
const Profile = lazy(() => import("./pages/Profile"))
const Settings = lazy(() => import("./pages/Settings"))
const Chat = lazy(() => import("./pages/Chat"))
const GroupChat = lazy(() => import("./pages/GroupChat"))
const PublicWorkspaceLanding = lazy(() => import("./pages/PublicWorkspaceLanding"))

function ProtectedRoute({ user, children }) {
  if (!user) {
    return <Navigate to="/login" replace />
  }

  return children
}

function VaultsRouteFallback() {
  return (
    <div className="min-h-screen bg-[var(--profile-bg)] text-[var(--profile-text)]">
      <div className="fixed left-0 right-0 top-[56px] z-[95] border-b border-[var(--profile-border)] bg-[var(--profile-bg)] px-5 pb-0 pt-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h1 className="font-['Sora'] text-[24px] font-[800] text-[var(--profile-text)]">My Vaults</h1>
            <p className="mt-1 text-[12px] text-[var(--profile-text-muted)]">Manage your encrypted knowledge spaces</p>
          </div>
          <div className="rounded-[12px] bg-[#F4B400] px-[18px] py-[10px] font-['Sora'] text-[13px] font-[700] text-[var(--profile-on-accent)] shadow-[0_3px_18px_rgba(244,180,0,0.4)]">
            + Create Vault
          </div>
        </div>
        <div className="scrollbar-hide flex gap-[6px] overflow-x-auto pb-3">
          <div className="rounded-[20px] bg-[#F4B400] px-[14px] py-[6px] text-[12px] font-[600] text-[var(--profile-on-accent)]">All</div>
          <div className="rounded-[20px] border border-[var(--profile-border)] bg-[var(--profile-elev)] px-[14px] py-[6px] text-[12px] font-[600] text-[var(--profile-text-muted)]">Owned</div>
          <div className="rounded-[20px] border border-[var(--profile-border)] bg-[var(--profile-elev)] px-[14px] py-[6px] text-[12px] font-[600] text-[var(--profile-text-muted)]">Shared with me</div>
          <div className="rounded-[20px] border border-[var(--profile-border)] bg-[var(--profile-elev)] px-[14px] py-[6px] text-[12px] font-[600] text-[var(--profile-text-muted)]">Public</div>
        </div>
      </div>
      <div style={{ maxWidth: "900px" }} className="mx-auto px-4 pb-[90px] pt-[170px]">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="mb-[10px] rounded-[18px] border border-[var(--profile-border)] bg-[var(--profile-surface)] p-4 shadow-none">
            <div className="mb-3 h-2 w-1/2 animate-pulse rounded-[8px] bg-[var(--profile-elev)]" />
            <div className="mb-2 h-4 w-full animate-pulse rounded-[8px] bg-[var(--profile-elev)]" />
            <div className="mb-2 h-4 w-4/5 animate-pulse rounded-[8px] bg-[var(--profile-elev)]" />
            <div className="h-4 w-2/3 animate-pulse rounded-[8px] bg-[var(--profile-elev)]" />
          </div>
        ))}
      </div>
    </div>
  )
}

function AppLoadingFallback({ label = "Loading VaultNotes..." }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0a0a0a] px-6 text-[#f5f0e8]">
      <div className="text-center">
        <div className="relative mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-[18px] border border-[rgba(244,180,0,0.24)] bg-[rgba(244,180,0,0.08)] shadow-[0_0_36px_rgba(244,180,0,0.12)]">
          <img
            src={vaultNotesLogoMark}
            alt="VaultNotes logo"
            className="h-10 w-10 object-contain"
          />
          <span className="absolute inset-0 rounded-[18px] border border-[rgba(244,180,0,0.12)] animate-pulse" />
        </div>
        <p className="font-['Sora'] text-sm font-semibold text-[#f4b400]">VaultNotes</p>
        <p className="mt-2 font-['DM_Sans'] text-xs text-[#a09080]">{label}</p>
      </div>
    </div>
  )
}

function AppShell({ user, createPostOpen, setCreatePostOpen }) {
  const location = useLocation()
  const [postDetailFocusMode, setPostDetailFocusMode] = useState(false)

  const isChatRoute = location.pathname.startsWith("/chat") || location.pathname === "/groups"
  const isVaultRoute = location.pathname === "/workspaces" || location.pathname.startsWith("/workspace/")

  useEffect(() => {
    const handlePostDetailFocusMode = (event) => {
      setPostDetailFocusMode(Boolean(event?.detail?.enabled))
    }

    window.addEventListener("postDetailFocusMode", handlePostDetailFocusMode)
    return () => window.removeEventListener("postDetailFocusMode", handlePostDetailFocusMode)
  }, [])

  return (
    <div className={`${isChatRoute ? "h-screen overflow-hidden" : "min-h-screen"} bg-gray-50 text-gray-900 dark:bg-[var(--profile-bg)] dark:text-[var(--profile-text)]`}>
      {!postDetailFocusMode && <Navbar />}
      <ToastContainer />
      <LoadingBar />
      {!postDetailFocusMode && <BottomNavigation />}
      <CreatePostModal
        isOpen={createPostOpen}
        onClose={() => setCreatePostOpen(false)}
        user={user}
        onPostCreated={(newPost) => {
          window.dispatchEvent(new CustomEvent("postCreated", { detail: newPost }))
          window.dispatchEvent(new CustomEvent("explore:new-post", { detail: newPost }))
        }}
      />
      <main
        className={
          isChatRoute
            ? "fixed inset-0 overflow-hidden bg-[var(--chat-bg)] pt-[64px] pb-[calc(62px+env(safe-area-inset-bottom))]"
            : isVaultRoute
              ? `min-h-screen overflow-x-hidden bg-[var(--profile-bg)] ${postDetailFocusMode ? "pt-0 pb-0" : "pt-[64px] pb-[calc(5rem+env(safe-area-inset-bottom))]"}`
              : `min-h-screen ${postDetailFocusMode ? "pt-0 pb-0" : "pt-[64px] pb-[calc(5rem+env(safe-area-inset-bottom))]"}`
        }
      >
        <Outlet />
      </main>
    </div>
  )
}

function AppContent() {
  const location = useLocation()
  const navigate = useNavigate()
  const navigationType = useNavigationType()
  const { user, session, authLoading } = useAuth()
  const [createPostOpen, setCreatePostOpen] = useState(false)
  const setActiveRouteMeta = useNavigationStore((state) => state.setActiveRouteMeta)
  const setBackNavigationState = useNavigationStore((state) => state.setBackNavigationState)
  const previousPathRef = useRef(location.pathname)

  useEffect(() => initializeTheme(), [])

  useEffect(() => {
    setActiveRouteMeta({
      pathname: location.pathname,
      search: location.search,
      navigationType,
      updatedAt: Date.now(),
    })
  }, [location.pathname, location.search, navigationType, setActiveRouteMeta])

  useEffect(() => {
    if (previousPathRef.current !== location.pathname) {
      setBackNavigationState({ fromPath: previousPathRef.current, toPath: location.pathname })
      previousPathRef.current = location.pathname
    } else if (navigationType === "POP") {
      setBackNavigationState({ fromPath: previousPathRef.current, toPath: location.pathname })
    }
  }, [location.pathname, navigationType, setBackNavigationState])

  useEffect(() => {
    if (!user?.id) {
      return
    }

    initializeWebPush(user.id)
  }, [user?.id])

  useEffect(() => {
    if (!user?.id) {
      return
    }

    const params = new URLSearchParams(location.search)
    const action = params.get("action")
    const notificationId = params.get("notificationId")

    if (action !== "mark-read" || !notificationId) {
      return
    }

    const isValidUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(notificationId)
    if (!isValidUuid) {
      params.delete("action")
      params.delete("notificationId")
      const nextSearch = params.toString()
      navigate(`${location.pathname}${nextSearch ? `?${nextSearch}` : ""}`, { replace: true })
      return
    }

    const redirect = params.get("redirect")

    const markRead = async () => {
      await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("id", notificationId)
        .eq("recipient_id", user.id)

      params.delete("action")
      params.delete("notificationId")
      params.delete("redirect")

      if (redirect) {
        navigate(redirect, { replace: true })
        return
      }

      const nextSearch = params.toString()
      navigate(`${location.pathname}${nextSearch ? `?${nextSearch}` : ""}`, { replace: true })
    }

    markRead()
  }, [location.pathname, location.search, navigate, user?.id])

  // Listen for Create Post event from floating action button
  useEffect(() => {
    const handleOpenCreatePostModal = () => {
      console.log("Create Post clicked")
      setCreatePostOpen(true)
    }

    window.addEventListener('openCreatePostModal', handleOpenCreatePostModal)
    return () => window.removeEventListener('openCreatePostModal', handleOpenCreatePostModal)
  }, [])

  if (authLoading) {
    return <AppLoadingFallback label="Preparing your vaults..." />
  }

  return (
    <Routes>
      <Route path="/login" element={!user ? <Login /> : <Navigate to="/explore" replace />} />
      <Route path="/" element={<Navigate to={user ? "/explore" : "/login"} replace />} />

      <Route
        element={
          <ProtectedRoute user={user}>
            <AppShell user={user} createPostOpen={createPostOpen} setCreatePostOpen={setCreatePostOpen} />
          </ProtectedRoute>
        }
      >
        <Route
          path="/explore"
          element={
            <ErrorBoundary resetKey={location.pathname}>
              <Suspense fallback={<AppLoadingFallback />}>
                <Explore />
              </Suspense>
            </ErrorBoundary>
          }
        />

        <Route
          path="/workspaces"
          element={
            <Suspense fallback={<VaultsRouteFallback />}>
              <Dashboard session={session} />
            </Suspense>
          }
        />

        <Route
          path="/profile"
          element={
            <ErrorBoundary resetKey={location.pathname}>
              <Suspense fallback={<AppLoadingFallback />}>
                <Profile />
              </Suspense>
            </ErrorBoundary>
          }
        />

        <Route
          path="/profile/:username"
          element={
            <ErrorBoundary resetKey={location.pathname}>
              <Suspense fallback={<AppLoadingFallback />}>
                <Profile />
              </Suspense>
            </ErrorBoundary>
          }
        />

        <Route
          path="/settings"
          element={
            <ErrorBoundary resetKey={location.pathname}>
              <Suspense fallback={<AppLoadingFallback />}>
                <Settings />
              </Suspense>
            </ErrorBoundary>
          }
        />

        <Route
          path="/chat"
          element={
            <ErrorBoundary resetKey={location.pathname}>
              <Suspense fallback={<div className="h-full overflow-hidden bg-[var(--chat-bg)]" />}>
                <Chat />
              </Suspense>
            </ErrorBoundary>
          }
        />

        <Route
          path="/chat/group/:groupId"
          element={
            <ErrorBoundary resetKey={location.pathname}>
              <Suspense fallback={<div className="h-full overflow-hidden bg-[var(--chat-bg)]" />}>
                <Chat />
              </Suspense>
            </ErrorBoundary>
          }
        />

        <Route
          path="/chat/direct/:conversationId"
          element={
            <ErrorBoundary resetKey={location.pathname}>
              <Suspense fallback={<div className="h-full overflow-hidden bg-[var(--chat-bg)]" />}>
                <Chat />
              </Suspense>
            </ErrorBoundary>
          }
        />

        <Route
          path="/chat/:conversationId"
          element={
            <ErrorBoundary resetKey={location.pathname}>
              <Suspense fallback={<div className="h-full overflow-hidden bg-[var(--chat-bg)]" />}>
                <Chat />
              </Suspense>
            </ErrorBoundary>
          }
        />

        <Route
          path="/groups"
          element={
            <Suspense fallback={<div className="h-full overflow-hidden bg-[var(--chat-bg)]" />}>
              <GroupChat />
            </Suspense>
          }
        />

        <Route
          path="/workspace/:id"
          element={
            <ErrorBoundary resetKey={location.pathname}>
              <Suspense fallback={<AppLoadingFallback />}>
                <WorkspaceDetail />
              </Suspense>
            </ErrorBoundary>
          }
        />

        <Route
          path="/workspace-preview/:id"
          element={
            <Suspense fallback={<AppLoadingFallback />}>
              <PublicWorkspaceLanding />
            </Suspense>
          }
        />

        <Route path="/discover-workspaces" element={<DiscoverWorkspaces />} />

        <Route
          path="/workspace/:id/new"
          element={
            <Suspense fallback={<AppLoadingFallback />}>
              <MemoryEditor />
            </Suspense>
          }
        />

        <Route
          path="/workspace/:id/memory/:memoryId"
          element={
            <Suspense fallback={<AppLoadingFallback />}>
              <MemoryView />
            </Suspense>
          }
        />

        <Route
          path="/workspace/:id/memory/:memoryId/edit"
          element={
            <Suspense fallback={<AppLoadingFallback />}>
              <MemoryEditor />
            </Suspense>
          }
        />

        <Route
          path="/notifications"
          element={
            <Suspense fallback={<AppLoadingFallback />}>
              <Notifications />
            </Suspense>
          }
        />
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <AppContent />
      </ToastProvider>
    </AuthProvider>
  )
}
