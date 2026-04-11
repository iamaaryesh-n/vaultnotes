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
    <div className="fixed inset-0 bg-gray-900 bg-opacity-30 flex items-center justify-center rounded-lg fade-in">
      <div className="bg-white dark:bg-slate-900 p-8 rounded-xl w-96 space-y-4 shadow-md border border-gray-200 dark:bg-slate-900 dark:border-slate-700">
        <h2 className="text-xl text-yellow-600 font-bold">
          Create New Book
        </h2>

        <input
          type="text"
          placeholder="Book Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full p-3 rounded-lg bg-gray-50 text-gray-900 border border-gray-200 dark:border-slate-700 placeholder-gray-500 focus:outline-none focus:border-yellow-400 focus:ring-2 focus:ring-yellow-400/40 transition-all duration-200 dark:bg-slate-800 dark:text-slate-100 dark:border-slate-700 dark:placeholder-slate-400"
        />

        <input
          type="password"
          placeholder="Book Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full p-3 rounded-lg bg-gray-50 text-gray-900 border border-gray-200 dark:border-slate-700 placeholder-gray-500 focus:outline-none focus:border-yellow-400 focus:ring-2 focus:ring-yellow-400/40 transition-all duration-200 dark:bg-slate-800 dark:text-slate-100 dark:border-slate-700 dark:placeholder-slate-400"
        />

        <input
          type="text"
          placeholder="Password Hint (optional)"
          value={hint}
          onChange={(e) => setHint(e.target.value)}
          className="w-full p-3 rounded-lg bg-gray-50 text-gray-900 border border-gray-200 dark:border-slate-700 placeholder-gray-500 focus:outline-none focus:border-yellow-400 focus:ring-2 focus:ring-yellow-400/40 transition-all duration-200 dark:bg-slate-800 dark:text-slate-100 dark:border-slate-700 dark:placeholder-slate-400"
        />

        <div className="flex justify-between gap-3 pt-2">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-100 dark:bg-slate-950 text-gray-900 rounded-lg border border-gray-200 dark:border-slate-700 hover:bg-gray-200 hover:scale-105 active:scale-95 transition-all duration-200 dark:bg-slate-800 dark:text-slate-100 dark:border-slate-700 dark:hover:bg-slate-700"
          >
            Cancel
          </button>

          <button
            onClick={handleSubmit}
            className="px-4 py-2 bg-yellow-500 hover:bg-yellow-400 hover:scale-105 active:scale-95 text-gray-900 dark:text-white rounded-lg font-bold transition-all duration-200 shadow-sm hover:shadow-md"
          >
            Create
          </button>
        </div>
      </div>
    </div>
  )
}