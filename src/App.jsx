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
    <div className="min-h-screen bg-gray-50 text-gray-900 dark:bg-[var(--profile-bg)] dark:text-[var(--profile-text)]">
      {!postDetailFocusMode && <Navbar />}
      <ToastContainer />
      <LoadingBar />
      {!postDetailFocusMode && <BottomNavigation />}
      <CreatePostModal
        isOpen={createPostOpen}
        onClose={() => setCreatePostOpen(false)}
        user={user}
        onPostCreated={() => {
          window.dispatchEvent(new CustomEvent("postCreated"))
        }}
      />
      <main
        className={
          isChatRoute
            ? "h-[calc(100dvh-64px-64px)] overflow-hidden"
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
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 text-gray-900 fade-in dark:from-slate-950 dark:to-slate-900 dark:text-[var(--profile-text)]">
        <div style={{ maxWidth: "900px" }} className="mx-auto px-6 py-12">
          <img
            src={vaultNotesLogoMark}
            alt="VaultNotes logo"
            className="mb-2 h-12 w-12 object-contain"
          />
          <h1 className="text-4xl text-yellow-500 font-bold mb-2">My Vaults</h1>
          <p className="text-slate-600 mb-8">Loading your vaults...</p>
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="card p-4 animate-pulse">
                <div className="h-6 bg-slate-200 rounded mb-2 w-1/3"></div>
                <div className="h-4 bg-slate-200 rounded w-1/4"></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
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
              <Suspense fallback={<div className="min-h-screen bg-slate-50" />}>
                <Explore />
              </Suspense>
            </ErrorBoundary>
          }
        />

        <Route
          path="/workspaces"
          element={
            <Suspense fallback={<div className="min-h-screen bg-slate-50" />}>
              <Dashboard session={session} />
            </Suspense>
          }
        />

        <Route
          path="/profile"
          element={
            <ErrorBoundary resetKey={location.pathname}>
              <Suspense fallback={<div className="min-h-screen bg-slate-50" />}>
                <Profile />
              </Suspense>
            </ErrorBoundary>
          }
        />

        <Route
          path="/profile/:username"
          element={
            <ErrorBoundary resetKey={location.pathname}>
              <Suspense fallback={<div className="min-h-screen bg-slate-50" />}>
                <Profile />
              </Suspense>
            </ErrorBoundary>
          }
        />

        <Route
          path="/settings"
          element={
            <ErrorBoundary resetKey={location.pathname}>
              <Suspense fallback={<div className="min-h-screen bg-slate-50" />}>
                <Settings />
              </Suspense>
            </ErrorBoundary>
          }
        />

        <Route
          path="/chat"
          element={
            <ErrorBoundary resetKey={location.pathname}>
              <Suspense fallback={<div className="h-[calc(100dvh-64px-64px)] bg-slate-50" />}>
                <Chat />
              </Suspense>
            </ErrorBoundary>
          }
        />

        <Route
          path="/chat/group/:groupId"
          element={
            <ErrorBoundary resetKey={location.pathname}>
              <Suspense fallback={<div className="h-[calc(100dvh-64px-64px)] bg-slate-50" />}>
                <Chat />
              </Suspense>
            </ErrorBoundary>
          }
        />

        <Route
          path="/chat/direct/:conversationId"
          element={
            <ErrorBoundary resetKey={location.pathname}>
              <Suspense fallback={<div className="h-[calc(100dvh-64px-64px)] bg-slate-50" />}>
                <Chat />
              </Suspense>
            </ErrorBoundary>
          }
        />

        <Route
          path="/chat/:conversationId"
          element={
            <ErrorBoundary resetKey={location.pathname}>
              <Suspense fallback={<div className="h-[calc(100dvh-64px-64px)] bg-slate-50" />}>
                <Chat />
              </Suspense>
            </ErrorBoundary>
          }
        />

        <Route
          path="/groups"
          element={
            <Suspense fallback={<div className="h-[calc(100dvh-64px-64px)] bg-slate-50" />}>
              <GroupChat />
            </Suspense>
          }
        />

        <Route
          path="/workspace/:id"
          element={
            <ErrorBoundary resetKey={location.pathname}>
              <Suspense fallback={<div className="min-h-screen bg-slate-50" />}>
                <WorkspaceDetail />
              </Suspense>
            </ErrorBoundary>
          }
        />

        <Route
          path="/workspace-preview/:id"
          element={
            <Suspense fallback={<div className="min-h-screen bg-slate-50" />}>
              <PublicWorkspaceLanding />
            </Suspense>
          }
        />

        <Route path="/discover-workspaces" element={<DiscoverWorkspaces />} />

        <Route
          path="/workspace/:id/new"
          element={
            <Suspense fallback={<div className="min-h-screen bg-slate-50" />}>
              <MemoryEditor />
            </Suspense>
          }
        />

        <Route
          path="/workspace/:id/memory/:memoryId"
          element={
            <Suspense fallback={<div className="min-h-screen bg-slate-50" />}>
              <MemoryView />
            </Suspense>
          }
        />

        <Route
          path="/workspace/:id/memory/:memoryId/edit"
          element={
            <Suspense fallback={<div className="min-h-screen bg-slate-50" />}>
              <MemoryEditor />
            </Suspense>
          }
        />

        <Route
          path="/notifications"
          element={
            <Suspense fallback={<div className="min-h-screen bg-slate-50" />}>
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
