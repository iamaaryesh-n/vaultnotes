import { Routes, Route } from "react-router-dom"
import { useEffect, useState } from "react"
import { supabase } from "./lib/supabase"
import { useScrollToTop } from "./hooks/useScrollToTop"
import { ToastProvider } from "./context/ToastContext"
import LoadingBar from "./components/LoadingBar"
import ToastContainer from "./components/ToastContainer"
import BottomNavigation from "./components/BottomNavigation"
import CreatePostModal from "./components/CreatePostModal"
import Navbar from "./components/Navbar"

import Dashboard from "./pages/Dashboard"
import WorkspaceDetail from "./pages/WorkspaceDetail"
import MemoryView from "./pages/MemoryView"
import MemoryEditor from "./pages/MemoryEditor"
import Explore from "./pages/Explore"
import Profile from "./pages/Profile"
import PublicProfile from "./pages/PublicProfile"
import Login from "./pages/Login"
import { Notifications } from "./pages/Notifications"

export default function App() {

  const [session, setSession] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [createPostOpen, setCreatePostOpen] = useState(false)
  useScrollToTop()

  useEffect(() => {

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setAuthLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session)
        setAuthLoading(false)
      }
    )

    return () => listener.subscription.unsubscribe()

  }, [])

  useEffect(() => {
    // Listen for Create Post event from floating action button
    const handleOpenCreatePostModal = () => {
      setCreatePostOpen(true)
    }

    window.addEventListener('openCreatePostModal', handleOpenCreatePostModal)
    return () => window.removeEventListener('openCreatePostModal', handleOpenCreatePostModal)
  }, [])

  const handleLogout = async () => {
    // Clear all cached encryption keys and decrypted memory data
    localStorage.clear()
    sessionStorage.clear()
    await supabase.auth.signOut()
    setSession(null)
  }

  const handleNavbarLogout = () => {
    setSession(null)
  }

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

  return (
    <ToastProvider>
      <div className="min-h-screen bg-gray-50">
        {session && <Navbar onLogout={handleNavbarLogout} />}
        <ToastContainer />
        <LoadingBar />
        {session && <BottomNavigation />}
        {session && (
          <CreatePostModal
            isOpen={createPostOpen}
            onClose={() => setCreatePostOpen(false)}
            user={session.user}
            onPostCreated={() => {
              // Dispatch event to refresh posts if on profile page
              window.dispatchEvent(new CustomEvent('postCreated'))
            }}
          />
        )}
        <Routes>
          <Route
            path="/login"
            element={!session ? <Login /> : <Explore />}
          />

          <Route
            path="/"
            element={session ? <Explore /> : <Login />}
          />

          <Route
            path="/explore"
            element={session ? <Explore /> : <Login />}
          />

          <Route
            path="/workspaces"
            element={session ? <Dashboard session={session} /> : <Login />}
          />

          <Route
            path="/profile"
            element={session ? <Profile /> : <Login />}
          />

          <Route
            path="/profile/:username"
            element={session ? <PublicProfile /> : <Login />}
          />

          <Route
            path="/workspace/:id"
            element={session ? <WorkspaceDetail /> : <Login />}
          />

          <Route
            path="/workspace/:id/new"
            element={session ? <MemoryEditor /> : <Login />}
          />

          <Route
            path="/workspace/:id/memory/:memoryId"
            element={session ? <MemoryView /> : <Login />}
          />

          <Route
            path="/workspace/:id/memory/:memoryId/edit"
            element={session ? <MemoryEditor /> : <Login />}
          />

          <Route
            path="/notifications"
            element={session ? <Notifications /> : <Login />}
          />
        </Routes>
      </div>
    </ToastProvider>
  )
}
