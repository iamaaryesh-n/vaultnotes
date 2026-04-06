import { useState } from 'react'
import { supabase } from '../lib/supabase'
import VisibilitySelector from './VisibilitySelector'
import VisibilityBadge from './VisibilityBadge'

export default function CreatePostModal({ isOpen, onClose, onPostCreated, user }) {
  const [postContent, setPostContent] = useState('')
  const [postImageFile, setPostImageFile] = useState(null)
  const [visibility, setVisibility] = useState('public')
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

      // Create post
      const { data, error } = await supabase
        .from('posts')
        .insert([
          {
            user_id: user.id,
            content: trimmedContent || null,
            visibility: visibility,
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
      setVisibility('public')
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
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-visible">
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

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-3">Who can see this?</label>
                <VisibilitySelector 
                  value={visibility}
                  onChange={setVisibility}
                />
              </div>

              {/* Post Preview */}
              <div className="mt-6 p-4 border border-slate-200 rounded-lg bg-slate-50">
                <p className="text-xs font-semibold text-slate-600 mb-3">PREVIEW</p>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm font-medium text-slate-700">Visibility:</span>
                  <VisibilityBadge visibility={visibility} size="sm" />
                </div>
                {postContent && (
                  <div className="mt-2 p-3 bg-white rounded border border-slate-200">
                    <p className="text-sm text-slate-700 whitespace-pre-wrap break-words">{postContent}</p>
                  </div>
                )}
                {postImageFile && (
                  <div className="mt-2 text-xs text-slate-500">
                    📷 Image will be included
                  </div>
                )}
              </div>
            </div>

            <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex justify-end gap-3">
              <button
                onClick={() => {
                  if (posting) return
                  setPostContent('')
                  setPostImageFile(null)
                  setVisibility('public')
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
