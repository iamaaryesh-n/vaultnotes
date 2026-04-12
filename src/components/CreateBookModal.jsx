import { useState } from "react"

export default function CreateBookModal({ onClose, onCreate }) {
  const [title, setTitle] = useState("")
  const [password, setPassword] = useState("")
  const [hint, setHint] = useState("")

  const handleSubmit = () => {
    if (!title || !password) return
    onCreate({ title, password, hint })
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center rounded-lg bg-[var(--overlay-backdrop)] fade-in">
      <div className="w-96 space-y-4 rounded-xl border border-[var(--overlay-border)] bg-[var(--overlay-surface)] p-8 shadow-[var(--overlay-shadow)]">
        <h2 className="text-xl text-yellow-600 font-bold">
          Create New Book
        </h2>

        <input
          type="text"
          placeholder="Book Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full rounded-lg border border-[var(--overlay-border)] bg-[var(--overlay-elev)] p-3 text-[var(--overlay-text)] placeholder-[var(--overlay-text-muted)] transition-all duration-200 focus:border-yellow-400 focus:outline-none focus:ring-2 focus:ring-yellow-400/40"
        />

        <input
          type="password"
          placeholder="Book Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-lg border border-[var(--overlay-border)] bg-[var(--overlay-elev)] p-3 text-[var(--overlay-text)] placeholder-[var(--overlay-text-muted)] transition-all duration-200 focus:border-yellow-400 focus:outline-none focus:ring-2 focus:ring-yellow-400/40"
        />

        <input
          type="text"
          placeholder="Password Hint (optional)"
          value={hint}
          onChange={(e) => setHint(e.target.value)}
          className="w-full rounded-lg border border-[var(--overlay-border)] bg-[var(--overlay-elev)] p-3 text-[var(--overlay-text)] placeholder-[var(--overlay-text-muted)] transition-all duration-200 focus:border-yellow-400 focus:outline-none focus:ring-2 focus:ring-yellow-400/40"
        />

        <div className="flex justify-between gap-3 pt-2">
          <button
            onClick={onClose}
            className="rounded-lg border border-[var(--overlay-border)] bg-[var(--overlay-elev)] px-4 py-2 text-[var(--overlay-text-subtle)] transition-all duration-200 hover:scale-105 hover:bg-[var(--overlay-hover)] active:scale-95"
          >
            Cancel
          </button>

          <button
            onClick={handleSubmit}
            className="rounded-lg bg-yellow-500 px-4 py-2 font-bold text-[var(--profile-on-accent)] shadow-sm transition-all duration-200 hover:scale-105 hover:bg-yellow-400 hover:shadow-md active:scale-95"
          >
            Create
          </button>
        </div>
      </div>
    </div>
  )
}