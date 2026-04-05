import { Routes, Route, useLocation } from "react-router-dom"
import { useEffect, useState } from "react"
import { useScrollToTop } from "./hooks/useScrollToTop"
import { useAuth } from "./hooks/useAuth"
import { ToastProvider } from "./context/ToastContext"
import { AuthProvider } from "./context/AuthContext"
import LoadingBar from "./components/LoadingBar"
import ToastContainer from "./components/ToastContainer"
import BottomNavigation from "./components/BottomNavigation"
import CreatePostModal from "./components/CreatePostModal"
import Navbar from "./components/Navbar"

import Dashboard from "./pages/Dashboard"
import WorkspaceDetail from "./pages/WorkspaceDetail"
import PublicWorkspaceLanding from "./pages/PublicWorkspaceLanding"
import DiscoverWorkspaces from "./pages/DiscoverWorkspaces"
import MemoryView from "./pages/MemoryView"
import MemoryEditor from "./pages/MemoryEditor"
import Explore from "./pages/Explore"
import Profile from "./pages/Profile"
import PublicProfile from "./pages/PublicProfile"
import Chat from "./pages/Chat"
import GroupChat from "./pages/GroupChat"
import Login from "./pages/Login"
import { Notifications } from "./pages/Notifications"

function AppContent() {
  const location = useLocation()
  const { user, session, authLoading, logout } = useAuth()
  const [createPostOpen, setCreatePostOpen] = useState(false)
  useScrollToTop()

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
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 text-gray-900 fade-in">
        <div style={{ maxWidth: "900px" }} className="mx-auto px-6 py-12">
          <h1 className="text-4xl text-yellow-500 font-bold mb-2">My Workspaces</h1>
          <p className="text-slate-600 mb-8">Loading your workspaces...</p>
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

  const isChatRoute = location.pathname === "/chat" || location.pathname === "/groups"

  return (
    <div className="min-h-screen bg-gray-50">
      {user && <Navbar onLogout={logout} />}
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
            : "min-h-screen pt-[64px] pb-20"
          : "min-h-screen"}
      >
        <Routes>
          <Route
            path="/login"
            element={!user ? <Login /> : <Explore />}
          />

          <Route
            path="/"
            element={user ? <Explore /> : <Login />}
          />

          <Route
            path="/explore"
            element={user ? <Explore /> : <Login />}
          />

          <Route
            path="/workspaces"
            element={user ? <Dashboard session={session} /> : <Login />}
          />

          <Route
            path="/profile"
            element={user ? <Profile /> : <Login />}
          />

          <Route
            path="/profile/:username"
            element={user ? <PublicProfile /> : <Login />}
          />

          <Route
            path="/chat"
            element={user ? <Chat /> : <Login />}
          />

          <Route
            path="/groups"
            element={user ? <GroupChat /> : <Login />}
          />

          <Route
            path="/workspace/:id"
            element={user ? <WorkspaceDetail /> : <Login />}
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
            element={user ? <MemoryEditor /> : <Login />}
          />

          <Route
            path="/workspace/:id/memory/:memoryId"
            element={user ? <MemoryView /> : <Login />}
          />

          <Route
            path="/workspace/:id/memory/:memoryId/edit"
            element={user ? <MemoryEditor /> : <Login />}
          />

          <Route
            path="/notifications"
            element={user ? <Notifications /> : <Login />}
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
