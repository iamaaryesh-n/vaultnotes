import { Routes, Route } from "react-router-dom"
import { useEffect, useState } from "react"
import { supabase } from "./lib/supabase"

import Dashboard from "./pages/Dashboard"
import WorkspaceDetail from "./pages/WorkspaceDetail"
import MemoryEditor from "./pages/MemoryEditor"
import Login from "./pages/Login"

export default function App() {

  const [session, setSession] = useState(null)

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

  if (!session) {
    return <Login />
  }

  return (

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
        element={<MemoryEditor />}
      />

    </Routes>

  )

}