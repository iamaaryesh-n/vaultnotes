import { Routes, Route } from "react-router-dom"
import { useEffect, useState } from "react"
import { supabase } from "./lib/supabase"
import { useScrollToTop } from "./hooks/useScrollToTop"
import { ToastProvider } from "./context/ToastContext"
import LoadingBar from "./components/LoadingBar"
import ToastContainer from "./components/ToastContainer"
import FloatingActionButton from "./components/FloatingActionButton"

import Dashboard from "./pages/Dashboard"
import WorkspaceDetail from "./pages/WorkspaceDetail"
import MemoryView from "./pages/MemoryView"
import MemoryEditor from "./pages/MemoryEditor"
import Login from "./pages/Login"

export default function App() {

  const [session, setSession] = useState(null)
  useScrollToTop()

  useEffect(() => {

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
    })

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session)
      }
    )

    return () => listener.subscription.unsubscribe()

  }, [])

  const handleLogout = async () => {
    // Clear all cached encryption keys and decrypted memory data
    localStorage.clear()
    sessionStorage.clear()
    await supabase.auth.signOut()
  }

  if (!session) {
    return <Login />
  }

  return (
    <ToastProvider>
      <div className="min-h-screen bg-gray-50">
        <ToastContainer />
        <LoadingBar />
        <FloatingActionButton />
        <div className="flex justify-end px-6 py-3 border-b border-gray-200">
          <button
            onClick={handleLogout}
            className="text-sm text-gray-500 hover:text-red-500 transition-colors duration-200"
          >
            Logout
          </button>
        </div>
        <Routes>

          <Route
            path="/"
            element={<Dashboard session={session} />}
          />

          <Route
            path="/workspace/:id"
            element={<WorkspaceDetail />}
          />

          <Route
            path="/workspace/:id/new"
            element={<MemoryEditor />}
          />

          <Route
            path="/workspace/:id/memory/:memoryId"
            element={<MemoryView />}
          />

          <Route
            path="/workspace/:id/memory/:memoryId/edit"
            element={<MemoryEditor />}
          />

        </Routes>
      </div>
    </ToastProvider>
  )

}