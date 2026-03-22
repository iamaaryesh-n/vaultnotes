import { useState } from "react"
import { supabase } from "../lib/supabase"
import { useNavigate } from "react-router-dom"

export default function Signup() {
  const navigate = useNavigate()

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)

  const handleSignup = async (e) => {
    e.preventDefault()
    setLoading(true)

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    })

    if (error) {
      alert(error.message)
    } else {
      alert("Signup successful 🔥")
      navigate("/")
    }

    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 fade-in">
      <form onSubmit={handleSignup} className="flex flex-col gap-4 w-80 bg-white p-8 rounded-xl shadow-sm border border-gray-200">
        <h1 className="text-3xl font-bold text-yellow-500 mb-2">Create Account</h1>

        <input
          type="email"
          placeholder="Email"
          className="p-3 rounded-lg bg-gray-50 text-gray-900 border border-gray-200 placeholder-gray-500 focus:outline-none focus:border-yellow-400 focus:ring-2 focus:ring-yellow-400/40 transition-all duration-200"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        <input
          type="password"
          placeholder="Password"
          className="p-3 rounded-lg bg-gray-50 text-gray-900 border border-gray-200 placeholder-gray-500 focus:outline-none focus:border-yellow-400 focus:ring-2 focus:ring-yellow-400/40 transition-all duration-200"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        <button
          type="submit"
          className="bg-yellow-500 hover:bg-yellow-400 hover:scale-105 active:scale-95 text-gray-900 p-3 rounded-lg font-bold transition-all duration-200 shadow-sm hover:shadow-md"
          disabled={loading}
        >
          {loading ? "Creating..." : "Sign Up"}
        </button>
      </form>
    </div>
  )
}