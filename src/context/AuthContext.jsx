import { createContext, useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

export const AuthContext = createContext()

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [session, setSession] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)

  useEffect(() => {
    // Fetch session and user once on app load
    const initializeAuth = async () => {
      try {
        console.log('[AuthContext] Initializing auth...')
        
        // Get session
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
        if (sessionError) {
          console.error('[AuthContext] Error getting session:', sessionError)
        } else {
          setSession(sessionData.session)
          console.log('[AuthContext] Session loaded:', sessionData.session?.user?.email)
        }

        // Get user
        const { data: userData, error: userError } = await supabase.auth.getUser()
        if (userError) {
          console.error('[AuthContext] Error getting user:', userError)
        } else {
          setUser(userData.user)
          console.log('[AuthContext] User loaded:', userData.user?.email)
        }
      } catch (err) {
        console.error('[AuthContext] Error during auth initialization:', err)
      } finally {
        setAuthLoading(false)
      }
    }

    initializeAuth()

    // Subscribe to auth state changes
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      console.log('[AuthContext] Auth state changed:', _event, newSession?.user?.email)
      setSession(newSession)
      setUser(newSession?.user || null)
      setAuthLoading(false)
    })

    return () => listener?.subscription?.unsubscribe()
  }, [])

  const logout = useCallback(async () => {
    try {
      console.log('[AuthContext] Logging out...')
      localStorage.clear()
      sessionStorage.clear()
      await supabase.auth.signOut()
      setSession(null)
      setUser(null)
    } catch (err) {
      console.error('[AuthContext] Error during logout:', err)
    }
  }, [])

  const value = {
    user,
    session,
    authLoading,
    logout,
    isAuthenticated: !!user
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}
