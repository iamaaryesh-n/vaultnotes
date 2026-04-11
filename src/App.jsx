import { Routes, Route, useLocation } from "react-router-dom"
import { useEffect, useState, Suspense, lazy } from "react"
import { useScrollToTop } from "./hooks/useScrollToTop"
import { useAuth } from "./hooks/useAuth"
import { ToastProvider } from "./context/ToastContext"
import { AuthProvider } from "./context/AuthContext"
import LoadingBar from "./components/LoadingBar"
import ToastContainer from "./components/ToastContainer"
import BottomNavigation from "./components/BottomNavigation"
import CreatePostModal from "./components/CreatePostModal"
import Navbar from "./components/Navbar"
import ErrorBoundary from "./components/ErrorBoundary"

// Eagerly load lightweight pages
import Login from "./pages/Login"
import PublicWorkspaceLanding from "./pages/PublicWorkspaceLanding"
import DiscoverWorkspaces from "./pages/DiscoverWorkspaces"

// Lazy load heavy routes (code splitting for better performance)
const Explore = lazy(() => import("./pages/Explore"))
const Dashboard = lazy(() => import("./pages/Dashboard"))
const Notifications = lazy(() => import("./pages/Notifications").then((module) => ({ default: module.Notifications })))
const WorkspaceDetail = lazy(() => import("./pages/WorkspaceDetail"))
const MemoryView = lazy(() => import("./pages/MemoryView"))
const MemoryEditor = lazy(() => import("./pages/MemoryEditor"))
const Profile = lazy(() => import("./pages/Profile"))
const Chat = lazy(() => import("./pages/Chat"))
const GroupChat = lazy(() => import("./pages/GroupChat"))

function AppContent() {
  const location = useLocation()
  const { user, session, authLoading } = useAuth()
  const [createPostOpen, setCreatePostOpen] = useState(false)
  useScrollToTop()

  useEffect(() => {
    const savedTheme = localStorage.getItem("theme") || "system"
    const root = document.documentElement

    if (savedTheme === "dark") {
      root.classList.add("dark")
    } else if (savedTheme === "light") {
      root.classList.remove("dark")
    } else {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches
      root.classList.toggle("dark", prefersDark)
    }
  }, [])

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
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 text-gray-900 fade-in dark:from-slate-950 dark:to-slate-900 dark:text-[#F5F0E8]">
        <div style={{ maxWidth: "900px" }} className="mx-auto px-6 py-12">
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

  const isChatRoute = location.pathname.startsWith("/chat") || location.pathname === "/groups"
  const isVaultRoute = location.pathname === "/workspaces" || location.pathname.startsWith("/workspace/")

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 dark:bg-[#000000] dark:text-[#F5F0E8]">
      {user && <Navbar />}
      <ToastContainer />
      <LoadingBar />
      {user && <BottomNavigation />}
      {user && (
        <CreatePostModal
          isOpen={createPostOpen}
          onClose={() => setCreatePostOpen(false)}
          user={user}
          onPostCreated={() => {
            // Dispatch event to refresh posts if on profile page
            window.dispatchEvent(new CustomEvent('postCreated'))
          }}
        />
      )}
      <main
        className={user
          ? isChatRoute
            ? "h-[calc(100dvh-64px-64px)] overflow-hidden"
            : isVaultRoute
              ? "min-h-screen overflow-x-hidden bg-[#000000] pt-[64px] pb-20"
              : "min-h-screen pt-[64px] pb-20"
          : "min-h-screen"}
      >
        <Routes>
          <Route
            path="/login"
            element={!user ? <Login /> : (
              <Suspense fallback={<div className="min-h-screen bg-slate-50" />}>
                <Explore />
              </Suspense>
            )}
          />

          <Route
            path="/"
            element={user ? (
              <ErrorBoundary>
                <Suspense fallback={<div className="min-h-screen bg-slate-50" />}>
                  <Explore />
                </Suspense>
              </ErrorBoundary>
            ) : <Login />}
          />

          <Route
            path="/explore"
            element={user ? (
              <ErrorBoundary>
                <Suspense fallback={<div className="min-h-screen bg-slate-50" />}>
                  <Explore />
                </Suspense>
              </ErrorBoundary>
            ) : <Login />}
          />

          <Route
            path="/workspaces"
            element={user ? (
              <Suspense fallback={<div className="min-h-screen bg-slate-50" />}>
                <Dashboard session={session} />
              </Suspense>
            ) : <Login />}
          />

          <Route
            path="/profile"
            element={user ? (
              <ErrorBoundary>
                <Suspense fallback={<div className="min-h-screen bg-slate-50" />}>
                  <Profile />
                </Suspense>
              </ErrorBoundary>
            ) : (
              <Login />
            )}
          />

          <Route
            path="/profile/:username"
            element={user ? (
              <ErrorBoundary>
                <Suspense fallback={<div className="min-h-screen bg-slate-50" />}>
                  <Profile />
                </Suspense>
              </ErrorBoundary>
            ) : (
              <Login />
            )}
          />

          <Route
            path="/chat"
            element={user ? (
              <ErrorBoundary>
                <Suspense fallback={<div className="h-[calc(100dvh-64px-64px)] bg-slate-50" />}>
                  <Chat />
                </Suspense>
              </ErrorBoundary>
            ) : (
              <Login />
            )}
          />

          <Route
            path="/chat/group/:groupId"
            element={user ? (
              <ErrorBoundary>
                <Suspense fallback={<div className="h-[calc(100dvh-64px-64px)] bg-slate-50" />}>
                  <Chat />
                </Suspense>
              </ErrorBoundary>
            ) : (
              <Login />
            )}
          />

          <Route
            path="/chat/direct/:conversationId"
            element={user ? (
              <ErrorBoundary>
                <Suspense fallback={<div className="h-[calc(100dvh-64px-64px)] bg-slate-50" />}>
                  <Chat />
                </Suspense>
              </ErrorBoundary>
            ) : (
              <Login />
            )}
          />

          <Route
            path="/chat/:conversationId"
            element={user ? (
              <ErrorBoundary>
                <Suspense fallback={<div className="h-[calc(100dvh-64px-64px)] bg-slate-50" />}>
                  <Chat />
                </Suspense>
              </ErrorBoundary>
            ) : (
              <Login />
            )}
          />

          <Route
            path="/groups"
            element={user ? (
              <Suspense fallback={<div className="h-[calc(100dvh-64px-64px)] bg-slate-50" />}>
                <GroupChat />
              </Suspense>
            ) : (
              <Login />
            )}
          />

          <Route
            path="/workspace/:id"
            element={user ? (
              <ErrorBoundary>
                <Suspense fallback={<div className="min-h-screen bg-slate-50" />}>
                  <WorkspaceDetail />
                </Suspense>
              </ErrorBoundary>
            ) : (
              <Login />
            )}
          />

          <Route
            path="/workspace-preview/:id"
            element={user ? <PublicWorkspaceLanding /> : <Login />}
          />

          <Route
            path="/discover-workspaces"
            element={user ? <DiscoverWorkspaces /> : <Login />}
          />

          <Route
            path="/workspace/:id/new"
            element={user ? (
              <Suspense fallback={<div className="min-h-screen bg-slate-50" />}>
                <MemoryEditor />
              </Suspense>
            ) : (
              <Login />
            )}
          />

          <Route
            path="/workspace/:id/memory/:memoryId"
            element={user ? (
              <Suspense fallback={<div className="min-h-screen bg-slate-50" />}>
                <MemoryView />
              </Suspense>
            ) : (
              <Login />
            )}
          />

          <Route
            path="/workspace/:id/memory/:memoryId/edit"
            element={user ? (
              <Suspense fallback={<div className="min-h-screen bg-slate-50" />}>
                <MemoryEditor />
              </Suspense>
            ) : (
              <Login />
            )}
          />

          <Route
            path="/notifications"
            element={user ? (
              <Suspense fallback={<div className="min-h-screen bg-slate-50" />}>
                <Notifications />
              </Suspense>
            ) : <Login />}
          />
        </Routes>
      </main>
    </div>
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
