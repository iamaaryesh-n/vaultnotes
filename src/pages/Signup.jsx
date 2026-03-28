import { useState } from "react"
import { supabase } from "../lib/supabase"
import { useNavigate } from "react-router-dom"
import Modal from "../components/Modal"

export default function Signup() {
  const navigate = useNavigate()

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [modalConfig, setModalConfig] = useState({ open: false, title: "", message: "" })

  const handleSignup = async (e) => {
    e.preventDefault()
    setLoading(true)

    const { error } = await supabase.auth.signUp({
      email,
      password,
    })

    if (error) {
      setModalConfig({ open: true, title: "Signup Error", message: error.message })
    } else {
      setModalConfig({ open: true, title: "Signup Successful", message: "Your account was created successfully." })
    }

    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 fade-in">
      <form onSubmit={handleSignup} className="flex flex-col gap-4 w-80 card p-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Create Account</h1>
        <p className="text-slate-500 text-sm mb-4">Join VaultNotes and secure your memories</p>

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
          className="bg-yellow-500 hover:bg-yellow-400 active:scale-95 text-gray-900 p-3 rounded-lg font-bold transition-all duration-200 shadow-sm hover:shadow-md"
          disabled={loading}
        >
          {loading ? "Creating..." : "Sign Up"}
        </button>
      </form>

      <Modal
        open={modalConfig.open}
        title={modalConfig.title}
        message={modalConfig.message}
        confirmText="OK"
        showCancel={false}
        onConfirm={() => {
          const shouldNavigate = modalConfig.title === "Signup Successful"
          setModalConfig({ open: false, title: "", message: "" })
          if (shouldNavigate) {
            navigate("/")
          }
        }}
      />
    </div>
  )
}
