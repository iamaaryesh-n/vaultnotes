import { lazy, Suspense, useState, useRef, useCallback, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import VisibilitySelector from './VisibilitySelector'
import VisibilityBadge from './VisibilityBadge'
import { useToast } from '../hooks/useToast'
import { IMAGE_TOO_LARGE_MESSAGE, prepareImageForUpload } from '../lib/imageCompression'
import { sanitizePostHtml } from '../utils/postContent'

const RichPostEditor = lazy(() => import('./RichPostEditor'))
 
// ─── Image Cropper ────────────────────────────────────────────────────────────
// Pure canvas-based cropper with selectable target ratios.
const DEFAULT_CROP_RATIO = 4 / 3
const CROP_RATIOS = [
  { label: '1:1', value: 1 },
  { label: '4:3', value: 4 / 3 },
  { label: '3:4', value: 3 / 4 },
  { label: '16:9', value: 16 / 9 },
]
 
function ImageCropper({ src, onConfirm, onCancel }) {
  const containerRef = useRef(null)
  const [drag, setDrag] = useState(null) // { startX, startY, originX, originY }
  const [cropRatio, setCropRatio] = useState(DEFAULT_CROP_RATIO)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const [scale, setScale] = useState(1)
  const [naturalSize, setNaturalSize] = useState({ w: 0, h: 0 })
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 })
  const [needsInitialFit, setNeedsInitialFit] = useState(true)
 
  // Crop viewport size (fit inside container keeping selected ratio)
  const cropW = containerSize.w
  const cropH = containerSize.h

  useEffect(() => {
    const updateContainerSize = () => {
      if (!containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const cw = rect.width
      const ch = rect.height || (cw / cropRatio)
      setContainerSize({ w: cw, h: ch })
    }

    updateContainerSize()
    window.addEventListener('resize', updateContainerSize)
    return () => window.removeEventListener('resize', updateContainerSize)
  }, [cropRatio])

  const fitImageToCrop = useCallback((naturalW, naturalH, cw, ch) => {
    if (!naturalW || !naturalH || !cw || !ch) return

    // Fill crop box instead of shrinking inside it
    const fitScale = Math.max(
      cw / naturalW,
      ch / naturalH
    )

    setScale(fitScale)

    const fittedW = naturalW * fitScale
    const fittedH = naturalH * fitScale

    setPos({
      x: (cw - fittedW) / 2,
      y: (ch - fittedH) / 2,
    })
  }, [])

  useEffect(() => {
    setNeedsInitialFit(true)
  }, [src, cropRatio])
 
  const clampPos = useCallback((x, y, s) => {
    const iw = naturalSize.w * s
    const ih = naturalSize.h * s

    const clampX = iw <= cropW
      ? (cropW - iw) / 2
      : Math.min(0, Math.max(x, cropW - iw))
    const clampY = ih <= cropH
      ? (cropH - ih) / 2
      : Math.min(0, Math.max(y, cropH - ih))

    return {
      x: clampX,
      y: clampY,
    }
  }, [naturalSize, cropW, cropH])
 
  const onImgLoad = (e) => {
    const img = e.target

    const naturalW = img.naturalWidth
    const naturalH = img.naturalHeight

    setNaturalSize({
      w: naturalW,
      h: naturalH,
    })
  }

  useEffect(() => {
    if (!needsInitialFit || !containerRef.current || !naturalSize.w || !naturalSize.h) return
    const rect = containerRef.current.getBoundingClientRect()
    const cw = rect.width
    const ch = rect.height || (cw / cropRatio)
    if (!cw || !ch) return
    setContainerSize({ w: cw, h: ch })
    fitImageToCrop(naturalSize.w, naturalSize.h, cw, ch)
    setNeedsInitialFit(false)
  }, [needsInitialFit, cropRatio, naturalSize, fitImageToCrop])
 
  // Drag handlers
  const onPointerDown = (e) => {
    e.preventDefault()
    setDrag({ startX: e.clientX, startY: e.clientY, originX: pos.x, originY: pos.y })
  }
  const onPointerMove = useCallback((e) => {
    if (!drag) return
    const dx = e.clientX - drag.startX
    const dy = e.clientY - drag.startY
    setPos(clampPos(drag.originX + dx, drag.originY + dy, scale))
  }, [drag, scale, clampPos])
  const onPointerUp = () => setDrag(null)
 
  // Pinch / wheel zoom
  const onWheel = (e) => {
    e.preventDefault()
    if (!naturalSize.w || !naturalSize.h || !cropW || !cropH) return
    const delta = e.deltaY < 0 ? 1.07 : 0.93
    const minScale = Math.min(
      cropW / naturalSize.w,
      cropH / naturalSize.h
    )
    const newScale = Math.max(minScale, Math.min(scale * delta, 4))

    const centerX = cropW / 2
    const centerY = cropH / 2

    const scaleRatio = newScale / scale

    const newX = centerX - (centerX - pos.x) * scaleRatio
    const newY = centerY - (centerY - pos.y) * scaleRatio

    const clamped = clampPos(newX, newY, newScale)

    setScale(newScale)
    setPos(clamped)
  }
 
  useEffect(() => {
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
    }
  }, [onPointerMove])
 
  // Render cropped image to canvas and return blob
  const handleConfirm = () => {
    const OUT_W = 1200
    const OUT_H = Math.round(OUT_W / (cropRatio || DEFAULT_CROP_RATIO))
 
    const canvas = document.createElement('canvas')
    canvas.width = OUT_W
    canvas.height = OUT_H
    const ctx = canvas.getContext('2d')
 
    // Scale factor: canvas output vs. crop viewport
    const scaleX = OUT_W / cropW
    const scaleY = OUT_H / cropH
 
    const img = new window.Image()
    img.onload = () => {
      // pos and scale are in crop-viewport space; project to canvas space
      ctx.drawImage(
        img,
        0, 0,
        naturalSize.w, naturalSize.h,
        pos.x * scaleX,
        pos.y * scaleY,
        naturalSize.w * scale * scaleX,
        naturalSize.h * scale * scaleY
      )
      canvas.toBlob((blob) => {
        if (blob) {
          const file = new File([blob], 'post-image.jpg', { type: 'image/jpeg' })
          onConfirm(file, cropRatio || DEFAULT_CROP_RATIO)
        }
      }, 'image/jpeg', 0.88)
    }
    img.src = src
  }
 
  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-[var(--overlay-text-muted)] text-center">
        Drag to reposition · scroll / pinch to zoom
      </p>

      {/* Ratio selector */}
      <div className="flex flex-wrap items-center justify-center gap-2">
        {CROP_RATIOS.map((ratio) => (
          <button
            key={ratio.label}
            type="button"
            onClick={() => setCropRatio(ratio.value)}
            className={`rounded-md border px-3 py-1 text-xs font-medium transition-colors ${
              cropRatio === ratio.value
                ? 'border-[#F4B400] bg-[#F4B400] text-[#1a1612]'
                : 'border-[var(--overlay-border)] bg-[var(--overlay-elev)] text-[var(--overlay-text-subtle)] hover:text-[var(--overlay-text)]'
            }`}
          >
            {ratio.label}
          </button>
        ))}
      </div>
 
      {/* Crop viewport */}
      <div
        ref={containerRef}
        className="relative w-full overflow-hidden rounded-xl border border-[var(--overlay-border)] cursor-grab active:cursor-grabbing select-none bg-black"
        style={{ aspectRatio: `${cropRatio}` }}
        onPointerDown={onPointerDown}
        onWheel={onWheel}
      >
        {/* Overlay guides */}
        <div className="pointer-events-none absolute inset-0 z-10">
          {/* Rule-of-thirds grid */}
          <div className="absolute inset-0 grid grid-cols-3 grid-rows-3">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="border border-white/10" />
            ))}
          </div>
          {/* Corner brackets */}
          {[
            'top-2 left-2 border-t-2 border-l-2',
            'top-2 right-2 border-t-2 border-r-2',
            'bottom-2 left-2 border-b-2 border-l-2',
            'bottom-2 right-2 border-b-2 border-r-2',
          ].map((cls, i) => (
            <div key={i} className={`absolute w-5 h-5 border-[var(--chat-accent)] ${cls}`} />
          ))}
        </div>
 
        {/* The draggable image */}
        <img
          src={src}
          alt="crop"
          draggable={false}
          onLoad={onImgLoad}
          className="absolute top-0 left-0 pointer-events-none select-none"
          style={{
            width: 'auto',
            height: 'auto',
            maxWidth: 'none',
            maxHeight: 'none',
            transform: `translate(${pos.x}px, ${pos.y}px) scale(${scale})`,
            transformOrigin: 'top left',
            opacity: naturalSize.w > 0 ? 1 : 0,
            willChange: 'transform',
          }}
        />
      </div>
 
      {/* Zoom slider */}
      <div className="flex items-center gap-3 px-1">
        <svg className="w-4 h-4 text-[var(--overlay-text-muted)] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
        </svg>
        <input
          type="range"
          min={1}
          max={3}
          step={0.01}
          value={scale / (Math.min(cropW / (naturalSize.w || 1), cropH / (naturalSize.h || 1)) || 1)}
          onChange={(e) => {
            if (!naturalSize.w || !naturalSize.h || !cropW || !cropH) return
            const minS = Math.min(
              cropW / naturalSize.w,
              cropH / naturalSize.h
            )
            const multiplier = Number(e.target.value)
            const newScale = minS * multiplier

            const centerX = cropW / 2
            const centerY = cropH / 2
            const scaleRatio = newScale / scale

            const newX = centerX - (centerX - pos.x) * scaleRatio
            const newY = centerY - (centerY - pos.y) * scaleRatio

            setScale(newScale)
            setPos(clampPos(newX, newY, newScale))
          }}
          className="flex-1 accent-[#F4B400]"
        />
        <svg className="w-5 h-5 text-[var(--overlay-text-muted)] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </div>
 
      {/* Crop actions */}
      <div className="flex gap-3 justify-end">
        <button
          onClick={onCancel}
          className="rounded-lg border border-[var(--overlay-border)] px-4 py-2 text-sm text-[var(--overlay-text-subtle)] hover:text-[var(--overlay-text)]"
        >
          Cancel
        </button>
        <button
          onClick={handleConfirm}
          className="rounded-lg bg-[#F4B400] px-5 py-2 text-sm font-semibold text-[#1a1612] hover:bg-[#C49000]"
        >
          Use this crop
        </button>
      </div>
    </div>
  )
}
 
// ─── Main Modal ───────────────────────────────────────────────────────────────
export default function CreatePostModal({ isOpen, onClose, onPostCreated, user }) {
  const { addToast } = useToast()
  const [postContent, setPostContent] = useState('')
  const [postText, setPostText] = useState('')
  const [postImageFile, setPostImageFile] = useState(null)   // final cropped file
  const [cropSrc, setCropSrc] = useState(null)               // raw data-URL for cropper
  const [previewUrl, setPreviewUrl] = useState(null)         // preview of cropped result
  const [previewCropRatio, setPreviewCropRatio] = useState(DEFAULT_CROP_RATIO)
  const [visibility, setVisibility] = useState('public')
  const [posting, setPosting] = useState(false)
  const [modalConfig, setModalConfig] = useState({ open: false, title: '', message: '', onConfirm: null })
  const fileInputRef = useRef(null)
 
  // Cleanup object URLs
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl) }, [previewUrl])
 
  const handleFileSelect = (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    // Show cropper with a data-URL so it works cross-origin
    const reader = new FileReader()
    reader.onload = (e) => setCropSrc(e.target.result)
    reader.readAsDataURL(file)
    // Reset input so same file can be re-selected
    event.target.value = ''
  }
 
  const handleCropConfirm = async (croppedFile, selectedCropRatio = DEFAULT_CROP_RATIO) => {
    setCropSrc(null)
    setPreviewCropRatio(selectedCropRatio || DEFAULT_CROP_RATIO)
    try {
      const compressed = await prepareImageForUpload(croppedFile)
      setPostImageFile(compressed)
      setPreviewUrl(URL.createObjectURL(compressed))
    } catch (err) {
      if (err?.code === 'IMAGE_TOO_LARGE') {
        addToast(IMAGE_TOO_LARGE_MESSAGE, 'error')
      } else {
        addToast(err?.message || 'Failed to process image.', 'error')
      }
    }
  }
 
  const handleCropCancel = () => {
    setCropSrc(null)
    setPostImageFile(null)
    setPreviewUrl(null)
    setPreviewCropRatio(DEFAULT_CROP_RATIO)
  }
 
  const handleRemoveImage = () => {
    setPostImageFile(null)
    setPreviewCropRatio(DEFAULT_CROP_RATIO)
    if (previewUrl) { URL.revokeObjectURL(previewUrl); setPreviewUrl(null) }
  }
 
  const handleClose = () => {
    if (posting) return
    setPostContent('')
    setPostText('')
    setPostImageFile(null)
    setCropSrc(null)
    setPreviewCropRatio(DEFAULT_CROP_RATIO)
    if (previewUrl) { URL.revokeObjectURL(previewUrl); setPreviewUrl(null) }
    setVisibility('public')
    onClose()
  }
 
  if (!isOpen || !user) return null
 
  const handleCreatePost = async () => {
    const sanitizedContent = sanitizePostHtml(postContent).trim()
    const trimmedText = postText.trim()
    if (!trimmedText && !postImageFile) {
      setModalConfig({
        open: true, title: 'Error',
        message: 'Add text content or an image before posting.',
        onConfirm: () => setModalConfig(m => ({ ...m, open: false }))
      })
      return
    }
 
    setPosting(true)
    try {
      let uploadedImageUrl = null
      const contentForInsert = trimmedText ? sanitizedContent : null
 
      if (postImageFile) {
        const ext = 'jpg' // always jpeg from canvas
        const fileName = `posts/${user.id}/${Date.now()}.${ext}`
        const { error: uploadError } = await supabase.storage
          .from('post-images')
          .upload(fileName, postImageFile, { upsert: false })
 
        if (uploadError) {
          setModalConfig({
            open: true, title: 'Upload Error',
            message: 'Failed to upload post image. ' + uploadError.message,
            onConfirm: () => setModalConfig(m => ({ ...m, open: false }))
          })
          setPosting(false)
          return
        }
 
        const { data: publicUrlData } = supabase.storage.from('post-images').getPublicUrl(fileName)
        uploadedImageUrl = publicUrlData.publicUrl
      }
 
      const { data, error } = await supabase
        .from('posts')
        .insert([{ user_id: user.id, content: contentForInsert, visibility, image_url: uploadedImageUrl || null }])
        .select()
 
      if (error) {
        setModalConfig({
          open: true, title: 'Error',
          message: 'Failed to create post. ' + error.message,
          onConfirm: () => setModalConfig(m => ({ ...m, open: false }))
        })
        setPosting(false)
        return
      }
 
      const insertedPost = Array.isArray(data) ? data[0] : data
      if (onPostCreated) onPostCreated(insertedPost)
 
      setPostContent('')
      setPostText('')
      setPostImageFile(null)
      setPreviewCropRatio(DEFAULT_CROP_RATIO)
      if (previewUrl) { URL.revokeObjectURL(previewUrl); setPreviewUrl(null) }
      setVisibility('public')
      onClose()
    } catch (err) {
      setModalConfig({
        open: true, title: 'Error',
        message: 'An unexpected error occurred.',
        onConfirm: () => setModalConfig(m => ({ ...m, open: false }))
      })
    } finally {
      setPosting(false)
    }
  }
 
  return (
    <>
      <div className="fixed inset-0 z-[1000] grid place-items-center bg-[var(--overlay-backdrop)] p-4 backdrop-blur-[6px]">
        <div className="w-[min(680px,95vw)] overflow-visible rounded-2xl border border-[var(--overlay-border)] bg-[var(--overlay-surface)] shadow-[var(--overlay-shadow)] max-h-[90vh] flex flex-col">
 
          {/* Header */}
          <div className="border-b border-[var(--overlay-border)] bg-[var(--overlay-elev)] px-6 py-4 flex-shrink-0">
            <h4 className="text-lg font-bold text-[var(--overlay-text)]">
              {cropSrc ? 'Crop Image' : 'Create Post'}
            </h4>
          </div>
 
          {/* Scrollable body */}
          <div className="p-6 space-y-4 overflow-y-auto flex-1">
 
            {/* ── CROP STEP ── */}
            {cropSrc ? (
              <ImageCropper
                src={cropSrc}
                onConfirm={handleCropConfirm}
                onCancel={handleCropCancel}
              />
            ) : (
              <>
                {/* Text */}
                <Suspense
                  fallback={
                    <div className="min-h-[150px] rounded-[12px] border border-[var(--overlay-border)] bg-[var(--overlay-elev)] px-4 py-3 text-sm text-[var(--overlay-text-muted)]">
                      Loading editor...
                    </div>
                  }
                >
                  <RichPostEditor
                    value={postContent}
                    onChange={({ html, text }) => {
                      setPostContent(html)
                      setPostText(text)
                    }}
                    placeholder="Write your shayari..."
                  />
                </Suspense>
 
                {/* Image picker / preview */}
                <div>
                  <label className="mb-2 block text-sm font-semibold text-[var(--overlay-text-subtle)]">
                    Optional image
                  </label>
 
                  {/* Hidden file input */}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
 
                  {previewUrl ? (
                    /* Cropped preview */
                    <div className="relative rounded-xl overflow-hidden border border-[var(--overlay-border)] bg-black group">
                      <img
                        src={previewUrl}
                        alt="Preview"
                        className="w-full object-cover"
                        style={{ aspectRatio: `${previewCropRatio || DEFAULT_CROP_RATIO}` }}
                      />
                      {/* Action buttons overlay */}
                      <div className="absolute top-2 right-2 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => fileInputRef.current?.click()}
                          className="rounded-lg bg-black/70 px-3 py-1.5 text-xs font-semibold text-white hover:bg-black/90 backdrop-blur-sm"
                        >
                          Change
                        </button>
                        <button
                          onClick={handleRemoveImage}
                          className="rounded-lg bg-red-600/80 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 backdrop-blur-sm"
                        >
                          Remove
                        </button>
                      </div>
                      <div className="absolute bottom-2 left-2 rounded bg-black/60 px-2 py-0.5 text-[10px] text-white/80 backdrop-blur-sm">
                        4:3 · ready to post
                      </div>
                    </div>
                  ) : (
                    /* Drop zone / pick button */
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full rounded-xl border-2 border-dashed border-[var(--overlay-border)] bg-[var(--overlay-elev)] py-8 text-center transition-colors hover:border-[#F4B400] hover:bg-[rgba(244,180,0,0.04)] group"
                    >
                      <div className="flex flex-col items-center gap-2 pointer-events-none">
                        <svg className="w-8 h-8 text-[var(--overlay-text-muted)] group-hover:text-[#F4B400] transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        <span className="text-sm text-[var(--overlay-text-muted)] group-hover:text-[var(--overlay-text-subtle)]">
                          Click to pick an image
                        </span>
                        <span className="text-xs text-[var(--overlay-text-muted)]">
                          You'll be able to crop it to 4:3 before posting
                        </span>
                      </div>
                    </button>
                  )}
                </div>
 
                {/* Visibility */}
                <div>
                  <label className="mb-3 block text-sm font-semibold text-[var(--overlay-text-subtle)]">
                    Who can see this?
                  </label>
                  <VisibilitySelector value={visibility} onChange={setVisibility} />
                </div>
 
                {/* Preview strip */}
                <div className="rounded-lg border border-[var(--overlay-border)] bg-[var(--overlay-elev)] px-4 py-3 flex items-center gap-3">
                  <span className="text-xs text-[var(--overlay-text-muted)] font-semibold uppercase tracking-wide">Preview</span>
                  <VisibilityBadge visibility={visibility} size="sm" />
                  {postImageFile && (
                    <span className="ml-auto text-xs text-[var(--overlay-text-muted)]">📷 Image attached (4:3)</span>
                  )}
                </div>
              </>
            )}
          </div>
 
          {/* Footer — hidden during crop step */}
          {!cropSrc && (
            <div className="flex justify-end gap-3 border-t border-[var(--overlay-border)] bg-[var(--overlay-elev)] px-6 py-4 flex-shrink-0">
              <button
                onClick={handleClose}
                disabled={posting}
                className="rounded-lg border border-[var(--overlay-border)] bg-[var(--overlay-surface)] px-4 py-2 text-[var(--overlay-text-subtle)] hover:border-[var(--overlay-border-strong)] hover:text-[var(--overlay-text)] disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleCreatePost}
                disabled={posting || (!postText.trim() && !postImageFile)}
                className="rounded-lg bg-[#F4B400] px-4 py-2 font-semibold text-[#1a1612] hover:bg-[#C49000] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {posting ? 'Posting…' : 'Post'}
              </button>
            </div>
          )}
        </div>
      </div>
 
      {/* Alert modal */}
      {modalConfig.open && (
        <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-[var(--overlay-backdrop)] p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm overflow-hidden rounded-2xl border border-[var(--overlay-border)] bg-[var(--overlay-surface)] shadow-[var(--overlay-shadow)]">
            <div className="border-b border-[var(--overlay-border)] bg-[var(--overlay-elev)] px-6 py-4">
              <h4 className="text-lg font-bold text-[var(--overlay-text)]">{modalConfig.title}</h4>
            </div>
            <div className="px-6 py-4">
              <p className="text-[var(--overlay-text-subtle)]">{modalConfig.message}</p>
            </div>
            <div className="border-t border-[var(--overlay-border)] bg-[var(--overlay-elev)] px-6 py-4">
              <button
                onClick={() => { setModalConfig(m => ({ ...m, open: false })); modalConfig.onConfirm?.() }}
                className="w-full rounded-lg bg-yellow-500 px-4 py-2 font-semibold text-slate-900 hover:bg-yellow-400"
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
 
