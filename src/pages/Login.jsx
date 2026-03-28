import { useState } from "react"
import { supabase } from "../lib/supabase"
import { signUpUser } from "../lib/auth"
import { useNavigate } from "react-router-dom"
import Modal from "../components/Modal"

export default function Login() {
  const navigate = useNavigate()

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [isSignup, setIsSignup] = useState(false)
  const [modalConfig, setModalConfig] = useState({ open: false, title: "", message: "", onConfirm: null })

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
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
    setLoading(true)

    const result = await signUpUser(email, password)

    if (!result.success) {
      setModalConfig({
        open: true,
        title: "Signup Error",
        message: result.error,
        onConfirm: () => setModalConfig({ ...modalConfig, open: false })
      })
    } else {
      // Check if email confirmation is required
      const user = result.data?.user
      if (user?.identities && user.identities.length === 0) {
        // User already exists
        setModalConfig({
          open: true,
          title: "Account Already Exists",
          message: "This email is already registered. Please log in instead.",
          onConfirm: () => {
            setModalConfig({ ...modalConfig, open: false })
            setIsSignup(false)
            setEmail("")
            setPassword("")
          }
        })
      } else if (user?.confirmed_at) {
        // Email was auto-confirmed (no email verification required)
        setModalConfig({
          open: true,
          title: "Account Created!",
          message: "Your account has been created successfully. You can now log in.",
          onConfirm: () => {
            setModalConfig({ ...modalConfig, open: false })
            setIsSignup(false)
            setEmail("")
            setPassword("")
          }
        })
      } else {
        // Email confirmation required
        setModalConfig({
          open: true,
          title: "Account Created!",
          message: `A confirmation email has been sent to ${email}. Please check your email to confirm your account, then you can log in.`,
          onConfirm: () => {
            setModalConfig({ ...modalConfig, open: false })
            setIsSignup(false)
            setEmail("")
            setPassword("")
          }
        })
      }
    }

    setLoading(false)
  }

  const handleCloseModal = () => {
    setModalConfig({ ...modalConfig, open: false })
    if (modalConfig.onConfirm) {
      modalConfig.onConfirm()
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 fade-in">
      <form onSubmit={isSignup ? handleSignup : handleLogin} className="flex flex-col gap-4 w-80 card p-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          {isSignup ? "Create Account" : "Login"}
        </h1>
        <p className="text-slate-500 text-sm mb-4">
          {isSignup 
            ? "Join VaultNotes and secure your memories" 
            : "Sign in to your VaultNotes account"
          }
        </p>

        <input
          type="email"
          placeholder="Email"
          className="p-3 rounded-lg bg-white text-gray-900 border border-slate-200 placeholder-slate-400 focus:outline-none focus:border-yellow-400 focus:ring-2 focus:ring-yellow-400/40 transition-all duration-200"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        <input
          type="password"
          placeholder="Password"
          className="p-3 rounded-lg bg-white text-gray-900 border border-slate-200 placeholder-slate-400 focus:outline-none focus:border-yellow-400 focus:ring-2 focus:ring-yellow-400/40 transition-all duration-200"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        <button
          type="submit"
          className="bg-yellow-500 hover:bg-yellow-400 active:scale-95 text-gray-900 p-3 rounded-lg font-bold transition-all duration-200 shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={loading}
        >
          {loading 
            ? isSignup ? "Creating..." : "Logging in..." 
            : isSignup ? "Sign Up" : "Login"
          }
        </button>

        <div className="flex items-center gap-2 text-sm text-slate-600 mt-2">
          <span>{isSignup ? "Already have an account?" : "Don't have an account?"}</span>
          <button
            type="button"
            onClick={() => {
              setIsSignup(!isSignup)
              setEmail("")
              setPassword("")
              setModalConfig({ open: false, title: "", message: "", onConfirm: null })
            }}
            className="text-yellow-500 font-semibold hover:text-yellow-600 transition-colors"
          >
            {isSignup ? "Login" : "Sign Up"}
          </button>
        </div>
      </form>

      <Modal
        open={modalConfig.open}
        title={modalConfig.title}
        message={modalConfig.message}
        confirmText="OK"
        showCancel={false}
        onConfirm={handleCloseModal}
      />
    </div>
  )
}
