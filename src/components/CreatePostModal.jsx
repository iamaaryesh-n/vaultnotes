import { useState } from 'react'
import { supabase } from '../lib/supabase'
import VisibilitySelector from './VisibilitySelector'
import VisibilityBadge from './VisibilityBadge'
import { useToast } from '../hooks/useToast'
import { IMAGE_TOO_LARGE_MESSAGE, prepareImageForUpload } from '../lib/imageCompression'

export default function CreatePostModal({ isOpen, onClose, onPostCreated, user }) {
  const { addToast } = useToast()
  const [postContent, setPostContent] = useState('')
  const [postImageFile, setPostImageFile] = useState(null)
  const [visibility, setVisibility] = useState('public')
  const [posting, setPosting] = useState(false)
  const [modalConfig, setModalConfig] = useState({ open: false, title: '', message: '', onConfirm: null })

  const handlePostImageChange = async (event) => {
    const file = event.target.files?.[0]
    if (!file) {
      setPostImageFile(null)
      return
    }

    try {
      const compressedFile = await prepareImageForUpload(file)
      setPostImageFile(compressedFile)
    } catch (err) {
      if (err?.code === 'IMAGE_TOO_LARGE') {
        addToast(IMAGE_TOO_LARGE_MESSAGE, 'error')
      } else {
        addToast(err?.message || 'Failed to process image.', 'error')
      }
      setPostImageFile(null)
      event.target.value = ''
    }
  }

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
        <div className="fixed inset-0 z-[1000] grid place-items-center bg-[var(--overlay-backdrop)] p-4 backdrop-blur-[6px]">
          <div className="w-[min(680px,92vw)] overflow-visible rounded-2xl border border-[var(--overlay-border)] bg-[var(--overlay-surface)] shadow-[var(--overlay-shadow)]">
            <div className="border-b border-[var(--overlay-border)] bg-[var(--overlay-elev)] px-6 py-4">
              <h4 className="text-lg font-bold text-[var(--overlay-text)]">Create Post</h4>
            </div>

            <div className="p-6 space-y-4">
              <textarea
                value={postContent}
                onChange={(e) => setPostContent(e.target.value)}
                rows={5}
                placeholder="What's on your mind?"
                className="w-full resize-none rounded-lg border border-[var(--overlay-border)] bg-[var(--overlay-elev)] px-4 py-3 text-[var(--overlay-text)] placeholder:text-[var(--overlay-text-muted)] focus:border-[#F4B400] focus:outline-none focus:ring-2 focus:ring-[rgba(244,180,0,0.25)]"
              />

              <div>
                <label className="mb-2 block text-sm font-semibold text-[var(--overlay-text-subtle)]">Optional image</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handlePostImageChange}
                  className="block w-full text-sm text-[var(--overlay-text-subtle)]"
                />
                {postImageFile && (
                  <p className="mt-2 text-xs text-[var(--overlay-text-muted)]">Selected: {postImageFile.name}</p>
                )}
              </div>

              <div>
                <label className="mb-3 block text-sm font-semibold text-[var(--overlay-text-subtle)]">Who can see this?</label>
                <VisibilitySelector 
                  value={visibility}
                  onChange={setVisibility}
                />
              </div>

              {/* Post Preview */}
              <div className="mt-6 rounded-lg border border-[var(--overlay-border)] bg-[var(--overlay-elev)] p-4">
                <p className="mb-3 text-xs font-semibold text-[var(--overlay-text-muted)]">PREVIEW</p>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm font-medium text-[var(--overlay-text-subtle)]">Visibility:</span>
                  <VisibilityBadge visibility={visibility} size="sm" />
                </div>
                {postContent && (
                  <div className="mt-2 rounded border border-[var(--overlay-border)] bg-[var(--overlay-surface)] p-3">
                    <p className="text-sm whitespace-pre-wrap break-words text-[var(--overlay-text)]">{postContent}</p>
                  </div>
                )}
                {postImageFile && (
                  <div className="mt-2 text-xs text-[var(--overlay-text-muted)]">
                    📷 Image will be included
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-3 border-t border-[var(--overlay-border)] bg-[var(--overlay-elev)] px-6 py-4">
              <button
                onClick={() => {
                  if (posting) return
                  setPostContent('')
                  setPostImageFile(null)
                  setVisibility('public')
                  onClose()
                }}
                disabled={posting}
                className="rounded-lg border border-[var(--overlay-border)] bg-[var(--overlay-surface)] px-4 py-2 text-[var(--overlay-text-subtle)] hover:border-[var(--overlay-border-strong)] hover:text-[var(--overlay-text)] disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleCreatePost}
                disabled={posting || (!postContent.trim() && !postImageFile)}
                className="rounded-lg bg-[#F4B400] px-4 py-2 font-semibold text-[var(--profile-on-accent)] hover:bg-[#C49000] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {posting ? 'Posting...' : 'Post'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal for messages */}
      {modalConfig.open && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-[var(--overlay-backdrop)] p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm overflow-hidden rounded-2xl border border-[var(--overlay-border)] bg-[var(--overlay-surface)] shadow-[var(--overlay-shadow)]">
            <div className="border-b border-[var(--overlay-border)] bg-[var(--overlay-elev)] px-6 py-4">
              <h4 className="text-lg font-bold text-[var(--overlay-text)]">{modalConfig.title}</h4>
            </div>
            <div className="bg-[var(--overlay-surface)] px-6 py-4">
              <p className="text-[var(--overlay-text-subtle)]">{modalConfig.message}</p>
            </div>
            <div className="border-t border-[var(--overlay-border)] bg-[var(--overlay-elev)] px-6 py-4">
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
