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
        class: 'w-full min-h-[15rem] p-4 text-gray-900 text-[15px] leading-relaxed focus:outline-none',
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

    <div className="min-h-screen bg-gray-50 text-gray-900 fade-in">
      <div className="max-w-4xl mx-auto px-4 sm:px-8 lg:px-16 py-10">

        <button
          onClick={() => navigate(-1)}
          className="mb-8 text-yellow-500 hover:text-yellow-400 transition-colors text-sm"
        >
          ← Back
        </button>

        <h1 className="text-2xl font-bold text-yellow-500 mb-6">
          {memoryId ? "Edit Memory" : "New Memory"}
        </h1>

        {/* Title Input */}
        <input
          type="text"
          placeholder="Memory title..."
          className="w-full bg-white text-gray-900 text-xl font-semibold px-4 py-3 rounded-lg mb-6 border border-gray-200 focus:outline-none focus:border-yellow-400 focus:ring-2 focus:ring-yellow-400/40 transition-all duration-200 placeholder-gray-400 shadow-sm"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />

        <style>{`
          .ProseMirror p { margin-bottom: 0.6rem; line-height: 1.75; }
          .ProseMirror ul { list-style-type: disc; margin-left: 1.5rem; margin-top: 0.5rem; margin-bottom: 0.5rem; }
          .ProseMirror ul li { margin-bottom: 0.25rem; }
          .ProseMirror pre { background: #f9fafb; border: 1px solid #e5e7eb; padding: 1rem 1.25rem; border-radius: 0.5rem; font-family: 'Fira Code', 'Cascadia Code', monospace; overflow-x: auto; margin: 0.75rem 0; }
          .ProseMirror code { background: #f3f4f6; color: #92400e; padding: 0.15rem 0.4rem; border-radius: 0.25rem; font-size: 0.85em; font-family: monospace; }
          .ProseMirror pre code { background: transparent; color: #1f2937; padding: 0; font-size: 0.875em; }
          .ProseMirror p.is-empty::before { content: attr(data-placeholder); color: #9ca3af; pointer-events: none; }
          .ProseMirror strong { color: #111827; }
          .ProseMirror em { color: #374151; }
        `}</style>

        {/* Unified Editor Card: toolbar + content */}
        <div className="rounded-xl border border-gray-200 shadow-sm ring-1 ring-gray-100 overflow-hidden focus-within:border-yellow-400 focus-within:shadow-md focus-within:ring-2 focus-within:ring-yellow-400/40 transition-all duration-200">

          {/* Toolbar */}
          {editor && (
            <div className="flex items-center gap-1.5 bg-gray-100 border-b border-gray-200 px-3 py-2">
              <button
                type="button"
                onClick={() => editor.chain().focus().toggleBold().run()}
                disabled={!editor.can().chain().focus().toggleBold().run()}
                title="Bold"
                className={`px-3 py-1.5 rounded text-sm font-bold transition-all duration-200 hover:scale-110 active:scale-95 ${
                  editor.isActive('bold')
                    ? 'bg-yellow-400 text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:bg-white hover:text-gray-900'
                }`}
              >
                B
              </button>
              <button
                type="button"
                onClick={() => editor.chain().focus().toggleItalic().run()}
                disabled={!editor.can().chain().focus().toggleItalic().run()}
                title="Italic"
                className={`px-3 py-1.5 rounded text-sm italic font-semibold transition-all duration-200 hover:scale-110 active:scale-95 ${
                  editor.isActive('italic')
                    ? 'bg-yellow-400 text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:bg-white hover:text-gray-900'
                }`}
              >
                I
              </button>

              <div className="w-px h-5 bg-gray-200 mx-1" />

              <button
                type="button"
                onClick={() => editor.chain().focus().toggleBulletList().run()}
                title="Bullet List"
                className={`px-3 py-1.5 rounded text-sm transition-all duration-200 hover:scale-110 active:scale-95 ${
                  editor.isActive('bulletList')
                    ? 'bg-yellow-400 text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:bg-white hover:text-gray-900'
                }`}
              >
                • List
              </button>
              <button
                type="button"
                onClick={() => editor.chain().focus().toggleCodeBlock().run()}
                title="Code Block"
                className={`px-3 py-1.5 rounded text-sm font-mono transition-all duration-200 hover:scale-110 active:scale-95 ${
                  editor.isActive('codeBlock')
                    ? 'bg-yellow-400 text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:bg-white hover:text-gray-900'
                }`}
              >
                {'</>'}  
              </button>
            </div>
          )}

          {/* Editor body */}
          <div className="relative bg-white">
            {editor && editor.isEmpty && (
              <p className="absolute px-4 pt-4 text-gray-400 text-[15px] pointer-events-none select-none">
                Start writing your memory...
              </p>
            )}
            <EditorContent editor={editor} />
          </div>

        </div>

        {/* Save Button */}
        <div className="mt-6 flex justify-end">
          <button
            onClick={saveMemory}
            disabled={loading}
            className="bg-yellow-500 hover:bg-yellow-400 hover:scale-105 active:scale-95 text-gray-900 font-semibold px-6 py-2.5 rounded-lg shadow-sm hover:shadow-md transition-all duration-200 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
          >
            {loading ? "Saving..." : "Save Memory"}
          </button>
        </div>

      </div>
    </div>

  )
}