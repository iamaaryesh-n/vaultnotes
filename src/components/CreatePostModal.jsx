import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function CreatePostModal({ isOpen, onClose, onPostCreated, user }) {
  const [postContent, setPostContent] = useState('')
  const [postImageFile, setPostImageFile] = useState(null)
  const [posting, setPosting] = useState(false)
  const [modalConfig, setModalConfig] = useState({ open: false, title: '', message: '', onConfirm: null })

  if (!isOpen || !user) return null

  const handleCreatePost = async () => {
    console.log("Creating post...")

    const trimmedContent = postContent.trim()
    if (!trimmedContent && !postImageFile) {
      setModalConfig({
        open: true,
        title: 'Error',
        message: 'Add text content or an image before posting.',
        onConfirm: () => setModalConfig({ ...modalConfig, open: false })
      })
      return
    }

    setPosting(true)

    try {
      let uploadedImageUrl = null

      // Upload image if provided
      if (postImageFile) {
        console.log('[CreatePostModal] Uploading post image for user:', user.id)
        const ext = postImageFile.name.split('.').pop()
        const fileName = `posts/${user.id}/${Date.now()}.${ext}`

        // Upload to post-images bucket
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('post-images')
          .upload(fileName, postImageFile, { upsert: false })

        if (uploadError) {
          console.error('[CreatePostModal] Post image upload error:', uploadError.message)
          setModalConfig({
            open: true,
            title: 'Upload Error',
            message: 'Failed to upload post image. ' + uploadError.message,
            onConfirm: () => setModalConfig({ ...modalConfig, open: false })
          })
          setPosting(false)
          return
        }

        console.log('[CreatePostModal] Image uploaded successfully:', uploadData)

        // Get public URL for the uploaded image
        const { data: publicUrlData } = supabase.storage
          .from('post-images')
          .getPublicUrl(fileName)

        uploadedImageUrl = publicUrlData.publicUrl
        console.log('[CreatePostModal] Image public URL:', uploadedImageUrl)
      }

      // Create post (public by default)
      const { data, error } = await supabase
        .from('posts')
        .insert([
          {
            user_id: user.id,
            content: trimmedContent || null,
            visibility: 'public',
            image_url: uploadedImageUrl || null
          }
        ])
        .select()

      const insertedPost = Array.isArray(data) ? data[0] : data

      if (error) {
        console.error('POST ERROR:', error)
        setModalConfig({
          open: true,
          title: 'Error',
          message: 'Failed to create post. ' + error.message,
          onConfirm: () => setModalConfig({ ...modalConfig, open: false })
        })
        setPosting(false)
        return
      }

      console.log('[CreatePostModal] Post created successfully:', insertedPost)

      // Call callback to notify parent
      if (onPostCreated) {
        onPostCreated(insertedPost)
      }

      // Reset form and close modal
      setPostContent('')
      setPostImageFile(null)
      onClose()

      setModalConfig({
        open: true,
        title: 'Success',
        message: 'Post created successfully!',
        onConfirm: () => setModalConfig({ ...modalConfig, open: false })
      })
    } catch (err) {
      console.error('[CreatePostModal] Exception creating post:', err.message)
      setModalConfig({
        open: true,
        title: 'Error',
        message: 'An unexpected error occurred while creating post.',
        onConfirm: () => setModalConfig({ ...modalConfig, open: false })
      })
    } finally {
      setPosting(false)
    }
  }

  return (
    <>
      {isOpen && (
        <div className="fixed inset-0 z-[1000] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
              <h4 className="text-lg font-bold text-slate-900">Create Post</h4>
            </div>

            <div className="p-6 space-y-4">
              <textarea
                value={postContent}
                onChange={(e) => setPostContent(e.target.value)}
                rows={5}
                placeholder="What's on your mind?"
                className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent resize-none"
              />

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Optional image</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setPostImageFile(e.target.files?.[0] || null)}
                  className="block w-full text-sm text-slate-600"
                />
                {postImageFile && (
                  <p className="text-xs text-slate-500 mt-2">Selected: {postImageFile.name}</p>
                )}
              </div>
            </div>

            <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex justify-end gap-3">
              <button
                onClick={() => {
                  if (posting) return
                  setPostContent('')
                  setPostImageFile(null)
                  onClose()
                }}
                disabled={posting}
                className="px-4 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleCreatePost}
                disabled={posting || (!postContent.trim() && !postImageFile)}
                className="px-4 py-2 rounded-lg bg-yellow-500 text-slate-900 font-semibold hover:bg-yellow-400 disabled:opacity-50"
              >
                {posting ? 'Posting...' : 'Post'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal for messages */}
      {modalConfig.open && (
        <div className="fixed inset-0 z-[1000] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
              <h4 className="text-lg font-bold text-slate-900">{modalConfig.title}</h4>
            </div>
            <div className="px-6 py-4">
              <p className="text-slate-700">{modalConfig.message}</p>
            </div>
            <div className="px-6 py-4 border-t border-slate-200 bg-slate-50">
              <button
                onClick={() => {
                  setModalConfig({ ...modalConfig, open: false })
                  if (modalConfig.onConfirm) {
                    modalConfig.onConfirm()
                  }
                }}
                className="w-full px-4 py-2 rounded-lg bg-yellow-500 text-slate-900 font-semibold hover:bg-yellow-400"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
