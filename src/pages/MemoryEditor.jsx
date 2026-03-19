import { useState, useEffect } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { supabase } from "../lib/supabase"
import { encrypt, decrypt, importKey } from "../utils/encryption"
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'

export default function MemoryEditor() {

  const navigate = useNavigate()
  const { id, memoryId } = useParams()

  const [title, setTitle] = useState("")
  const [content, setContent] = useState("")
  const [loading, setLoading] = useState(false)
  const [dataLoaded, setDataLoaded] = useState(false)

  const editor = useEditor({
    extensions: [StarterKit.configure({ heading: false })],
    content: "",
    onUpdate: ({ editor }) => {
      setContent(editor.getHTML())
    },
    editorProps: {
      attributes: {
        class: 'w-full bg-gray-800 p-4 rounded min-h-[15rem] text-gray-300 focus:outline-none focus:ring-1 focus:ring-yellow-400',
      },
    },
  })

  useEffect(() => {
    if (editor && dataLoaded) {
      editor.commands.setContent(content)
      setDataLoaded(false)
    }
  }, [editor, dataLoaded, content])

  useEffect(() => {
    if (memoryId) {
      loadMemory()
    }
  }, [memoryId])

  const loadMemory = async () => {
    
    setLoading(true)

    const storedKey = localStorage.getItem(`workspace_key_${id}`)
    if (!storedKey) {
      alert("Encryption key not found.")
      navigate(`/workspace/${id}`)
      return
    }

    const { data: memory, error } = await supabase
      .from("memories")
      .select(`
        id,
        title,
        encrypted_content,
        iv,
        created_at,
        updated_at,
        workspace_id,
        tags,
        is_favorite
      `)
      .eq("id", memoryId)
      .single()

    if (error || !memory) {
      console.error("Failed to load memory:", error)
      setLoading(false)
      return
    }

    try {
      const cryptoKey = await importKey(storedKey)
      const decryptedText = await decrypt(memory.encrypted_content, memory.iv, cryptoKey)
      
      setTitle(memory.title)
      setContent(decryptedText)
      setDataLoaded(true)
    } catch (err) {
      console.error("Decryption failed:", err)
      alert("Could not decrypt this memory.")
    }

    setLoading(false)
  }

  const saveMemory = async () => {

    if (!content.trim()) return

    const storedKey = localStorage.getItem(`workspace_key_${id}`)

    if (!storedKey) {
      alert("Encryption key not found. Please go back and reopen the workspace.")
      return
    }

    setLoading(true)

    const cryptoKey = await importKey(storedKey)
    const { ciphertext, iv } = await encrypt(content, cryptoKey)

    const {
      data: { user }
    } = await supabase.auth.getUser()

    const payload = {
      workspace_id: id,
      title: title || "Untitled",
      encrypted_content: ciphertext,
      iv: iv,
      created_by: user.id
    }

    let error

    if (memoryId) {
      // Edit existing memory
      const { data: updatedData, error: updateError } = await supabase
        .from("memories")
        .update(payload)
        .eq("id", memoryId)
        .select()
        .single()
        
      error = updateError
      if (!error && updatedData) {
        sessionStorage.setItem(`memory_${memoryId}`, JSON.stringify({
          ...updatedData, 
          content: content
        }))
      }
    } else {
      // Create new memory
      const { error: insertError } = await supabase
        .from("memories")
        .insert(payload)
      error = insertError
    }

    setLoading(false)

    if (error) {
      console.error(error)
      return
    }

    navigate(`/workspace/${id}`)
  }

  return (

    <div className="min-h-screen bg-black text-white p-10">

      <button
        onClick={() => navigate(-1)}
        className="mb-6 text-yellow-400"
      >
        ← Back
      </button>

      <h1 className="text-3xl font-bold text-yellow-400 mb-6">
        New Memory
      </h1>

      <input
        type="text"
        placeholder="Title"
        className="w-full bg-gray-800 p-3 rounded mb-4 focus:outline-none focus:border-yellow-400 border border-transparent transition-colors"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />

      <style>{`
        .ProseMirror ul { list-style-type: disc; margin-left: 1.5rem; margin-top: 0.5rem; margin-bottom: 0.5rem; }
        .ProseMirror p { margin-bottom: 0.5rem; }
        .ProseMirror pre { background: #111; padding: 1rem; border-radius: 0.5rem; font-family: monospace; overflow-x: auto; }
        .ProseMirror code { background: #333; padding: 0.2rem 0.4rem; border-radius: 0.25rem; font-size: 0.875em; }
        .ProseMirror pre code { background: transparent; padding: 0; }
      `}</style>

      {editor && (
        <div className="flex gap-2 mb-3 bg-gray-900 p-2 rounded border border-gray-700">
          <button
            onClick={() => editor.chain().focus().toggleBold().run()}
            disabled={!editor.can().chain().focus().toggleBold().run()}
            className={`px-3 py-1.5 rounded text-sm font-medium transition ${editor.isActive('bold') ? 'bg-yellow-500 text-black' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}
          >
            Bold
          </button>
          <button
            onClick={() => editor.chain().focus().toggleItalic().run()}
            disabled={!editor.can().chain().focus().toggleItalic().run()}
            className={`px-3 py-1.5 rounded text-sm font-medium transition ${editor.isActive('italic') ? 'bg-yellow-500 text-black' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}
          >
            Italic
          </button>
          <button
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            className={`px-3 py-1.5 rounded text-sm font-medium transition ${editor.isActive('bulletList') ? 'bg-yellow-500 text-black' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}
          >
            Bullet List
          </button>
          <button
            onClick={() => editor.chain().focus().toggleCodeBlock().run()}
            className={`px-3 py-1.5 rounded text-sm font-medium transition ${editor.isActive('codeBlock') ? 'bg-yellow-500 text-black' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}
          >
            Code Block
          </button>
        </div>
      )}

      <EditorContent editor={editor} />

      <button
        onClick={saveMemory}
        disabled={loading}
        className="mt-6 bg-yellow-500 text-black px-4 py-2 rounded"
      >
        {loading ? "Saving..." : "Save Memory"}
      </button>

    </div>

  )
}