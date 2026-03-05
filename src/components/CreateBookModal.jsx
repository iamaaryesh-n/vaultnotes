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
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center">
      <div className="bg-gray-900 p-6 rounded w-96 space-y-4">
        <h2 className="text-xl text-yellow-400 font-bold">
          Create New Book
        </h2>

        <input
          type="text"
          placeholder="Book Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full p-2 rounded bg-gray-800 text-white"
        />

        <input
          type="password"
          placeholder="Book Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full p-2 rounded bg-gray-800 text-white"
        />

        <input
          type="text"
          placeholder="Password Hint (optional)"
          value={hint}
          onChange={(e) => setHint(e.target.value)}
          className="w-full p-2 rounded bg-gray-800 text-white"
        />

        <div className="flex justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-700 rounded"
          >
            Cancel
          </button>

          <button
            onClick={handleSubmit}
            className="px-4 py-2 bg-yellow-500 text-black rounded font-bold"
          >
            Create
          </button>
        </div>
      </div>
    </div>
  )
}