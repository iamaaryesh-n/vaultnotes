import { useState, useEffect, useRef } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { supabase } from "../lib/supabase"
import { encrypt, decrypt, importKey, debugLogKey, validateKey } from "../utils/encryption"
import { canEdit, canCreate, getUserRole } from "../utils/rolePermissions"
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import { handleNavigationClick } from "../utils/navigation"
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts"
import { useToast } from "../hooks/useToast"
import { EditorSkeleton } from "../components/SkeletonLoader"
import Modal from "../components/Modal"

const FloatingImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      align: {
        default: null,
        parseHTML: (element) => {
          const align = element.getAttribute('data-align')
          return align === 'left' || align === 'right' || align === 'center' ? align : null
        },
        renderHTML: (attributes) => {
          if (!attributes.align) return {}
          return {
            'data-align': attributes.align,
          }
        },
      },
      width: {
        default: null,
        parseHTML: (element) => {
          const width = element.getAttribute('width')
          return width ? Number.parseInt(width, 10) || null : null
        },
        renderHTML: (attributes) => {
          if (!attributes.width) return {}
          return {
            width: String(attributes.width),
          }
        },
      },
    }
  },

  addCommands() {
    return {
      ...this.parent?.(),
      setImageAlign:
        (align) =>
        ({ commands }) =>
          commands.updateAttributes('image', { align }),
      setImageWidth:
        (width) =>
        ({ commands }) =>
          commands.updateAttributes('image', { width }),
      removeImageAlign:
        () =>
        ({ commands }) =>
          commands.updateAttributes('image', { align: null }),
      setImageFloat:
        (align) =>
        ({ commands }) =>
          commands.updateAttributes('image', { align }),
      removeImageFloat:
        () =>
        ({ commands }) =>
          commands.updateAttributes('image', { align: null }),
    }
  },
})

const normalizeEditorHtmlForImages = (html) => {
  if (!html) return html

  const container = document.createElement('div')
  container.innerHTML = html

  container.querySelectorAll('img').forEach((image) => {
    if (image.classList.contains('image-left')) {
      image.setAttribute('data-align', 'left')
      image.classList.remove('image-left')
    }

    if (image.classList.contains('image-right')) {
      image.setAttribute('data-align', 'right')
      image.classList.remove('image-right')
    }

    if (!image.getAttribute('data-align') && image.style.marginLeft === 'auto' && image.style.marginRight === 'auto') {
      image.setAttribute('data-align', 'center')
    }

    const inlineWidth = image.style.width || image.getAttribute('width')
    if (inlineWidth) {
      const parsedWidth = Number.parseInt(inlineWidth, 10)
      if (Number.isFinite(parsedWidth)) {
        image.setAttribute('width', String(parsedWidth))
      }
      image.style.width = ''
    }

    image.style.height = ''
  })

  container.querySelectorAll('figure.image-wrapper, div.image-wrapper').forEach((wrapper) => {
    const fragment = document.createDocumentFragment()
    while (wrapper.firstChild) {
      fragment.appendChild(wrapper.firstChild)
    }
    wrapper.replaceWith(fragment)
  })

  container.querySelectorAll('p').forEach((paragraph) => {
    const hasDirectImage = Array.from(paragraph.childNodes).some(
      (node) => node.nodeType === Node.ELEMENT_NODE && node.nodeName === 'IMG'
    )

    if (!hasDirectImage) return

    const replacementNodes = []
    let textParagraph = null

    const ensureTextParagraph = () => {
      if (!textParagraph) {
        textParagraph = document.createElement('p')
      }
      return textParagraph
    }

    const flushTextParagraph = () => {
      if (!textParagraph) return
      if (textParagraph.textContent.trim() || textParagraph.children.length > 0) {
        replacementNodes.push(textParagraph)
      }
      textParagraph = null
    }

    Array.from(paragraph.childNodes).forEach((node) => {
      if (node.nodeType === Node.ELEMENT_NODE && node.nodeName === 'IMG') {
        flushTextParagraph()
        replacementNodes.push(node.cloneNode(true))
      } else {
        ensureTextParagraph().appendChild(node.cloneNode(true))
      }
    })

    flushTextParagraph()

    if (replacementNodes.length > 0) {
      paragraph.replaceWith(...replacementNodes)
    }
  })

  return container.innerHTML
}

export default function MemoryEditor() {

  const navigate = useNavigate()
  const { id, memoryId } = useParams()
  const { success, error: showError } = useToast()
  const fileInputRef = useRef(null)
  const editorRef = useRef(null)
  const toolbarRef = useRef(null)
  const handlersRef = useRef(null)
  const selectedImageRef = useRef(null)
  const selectedImageElementRef = useRef(null)

  // Track to prevent concurrent loads
  const loadControllerRef = useRef(null)
  const isLoadingMemoryRef = useRef(false)

  const [title, setTitle] = useState("")
  const [content, setContent] = useState("")
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [dataLoaded, setDataLoaded] = useState(false)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [selectedImage, setSelectedImage] = useState(null)
  const [selectedImageElement, setSelectedImageElement] = useState(null)
  const [toolbarPosition, setToolbarPosition] = useState({ top: 0, left: 0 })
  const [isResizing, setIsResizing] = useState(false)
  const [resizeStart, setResizeStart] = useState({ x: 0, width: 0, aspectRatio: 1 })
  const [imageRotation, setImageRotation] = useState(0)
  const [isLoaded, setIsLoaded] = useState(!memoryId)
  const [isCropping, setIsCropping] = useState(false)
  const [cropStart, setCropStart] = useState({ x: 0, y: 0 })
  const [cropDimensions, setCropDimensions] = useState({ startX: 0, startY: 0, endX: 100, endY: 100 })
  const [userRole, setUserRole] = useState(null) // "owner", "editor", or "viewer"
  const [modalConfig, setModalConfig] = useState({ open: false, title: "", message: "" })

  const openModal = (title, message) => {
    setModalConfig({ open: true, title, message })
  }

  // Set up keyboard shortcuts (Esc to exit editor)
  useKeyboardShortcuts({
    onEscape: () => memoryId 
      ? navigate(`/workspace/${id}/memory/${memoryId}`)
      : navigate(`/workspace/${id}`),
  })

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: false }),
      FloatingImage.configure({
        inline: false,
        allowBase64: false,
      })
    ],
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
    if (editor && editor.commands && dataLoaded) {
      editor.commands.setContent(content)
      setDataLoaded(false)
    }
  }, [editor, dataLoaded])

  // Update editor content when loaded from database
  useEffect(() => {
    if (editor && content && isLoaded && memoryId) {
      editor.commands.setContent(content)
    }
  }, [editor, isLoaded, memoryId])

  useEffect(() => {
    if (memoryId) {
      loadMemory()
    }
    loadUserRole()

    return () => {
      // Cleanup: cancel pending load on unmount
      if (loadControllerRef.current) {
        loadControllerRef.current.abort()
      }
    }
  }, [memoryId, id])

  // Auto-focus editor when loaded
  useEffect(() => {
    if (editor && isLoaded && !memoryId) {
      // For new memory, focus editor immediately
      setTimeout(() => {
        editor.commands.focus('end')
      }, 100)
    }
  }, [editor, isLoaded, memoryId])

  // Image click and mousedown handlers - attach after editor is ready
  useEffect(() => {
    // Clean up old handlers if they exist
    if (handlersRef.current) {
      const { editorDom, handleClick, handleMouseDown, handleClickOutside } = handlersRef.current
      editorDom.removeEventListener('click', handleClick, true)
      editorDom.removeEventListener('mousedown', handleMouseDown, true)
      document.removeEventListener('click', handleClickOutside)
    }

    // Use a small timeout to ensure DOM is ready
    const timeoutId = setTimeout(() => {
      if (!editorRef.current) return

      const container = editorRef.current
      const editorDom = container.querySelector('.ProseMirror')
      if (!editorDom) return

      const handleClick = (e) => {
        const target = e.target

        if (target.tagName === 'IMG') {
          e.preventDefault()
          e.stopPropagation()

          const imagePos = editor?.view?.posAtDOM(target, 0)
          if (typeof imagePos === 'number') {
            editor.chain().focus().setNodeSelection(imagePos).run()
          }


          // Deselect previous image
          editorDom.querySelectorAll('img.selected').forEach(img => {
            img.classList.remove('selected')
          })

          // Select new image
          target.classList.add('selected')

          setSelectedImage(target)
          setSelectedImageElement(target)
          
          // Store in refs for immediate access in event handlers
          selectedImageRef.current = target
          selectedImageElementRef.current = target

          const rect = target.getBoundingClientRect()
          const newToolbarPosition = {
            top: rect.top - 70 + window.scrollY,
            left: rect.left + rect.width / 2,
          }
          setToolbarPosition(newToolbarPosition)

          // Store dimensions for resize
          const naturalWidth = target.naturalWidth || target.offsetWidth || 400
          const naturalHeight = target.naturalHeight || target.offsetHeight || 300

          setResizeStart({
            x: 0,
            width: target.offsetWidth || 400,
            aspectRatio: naturalHeight / naturalWidth,
          })

          // Reset rotation
          setImageRotation(0)

          return true
        }

        return false
      }

      const handleMouseDown = (e) => {
        if (e.target.tagName !== 'IMG') return
        if (!e.target.classList.contains('selected')) return

        const imgElement = e.target
        const rect = imgElement.getBoundingClientRect()
        const handleSize = 22

        const isOnHandle =
          e.clientX >= rect.right - handleSize &&
          e.clientX <= rect.right + 2 &&
          e.clientY >= rect.bottom - handleSize &&
          e.clientY <= rect.bottom + 2

        if (isOnHandle) {
          e.preventDefault()
          e.stopPropagation()

          setIsResizing(true)
          setResizeStart(prev => ({
            ...prev,
            x: e.clientX,
            width: imgElement.offsetWidth || 400,
          }))

          return true
        }

        return false
      }

      const handleClickOutside = (e) => {
        // Skip if crop dialog is open
        if (isCropping) return
        
        // Skip if clicking on toolbar or image
        if (toolbarRef.current?.contains(e.target)) return
        if (e.target.tagName === 'IMG') return

        // Skip if clicking inside editor
        if (editorDom.contains(e.target)) return

        // Deselect
        editorDom.querySelectorAll('img.selected').forEach(img => {
          img.classList.remove('selected')
        })
        setSelectedImage(null)
        setSelectedImageElement(null)
        selectedImageRef.current = null
        selectedImageElementRef.current = null
      }

      // Attach listeners
      editorDom.addEventListener('click', handleClick, true)
      editorDom.addEventListener('mousedown', handleMouseDown, true)
      document.addEventListener('click', handleClickOutside)

      // Store handlers for cleanup
      handlersRef.current = { editorDom, handleClick, handleMouseDown, handleClickOutside }
    }, 100)

    return () => {
      clearTimeout(timeoutId)
      // Final cleanup on unmount
      if (handlersRef.current) {
        const { editorDom, handleClick, handleMouseDown, handleClickOutside } = handlersRef.current
        try {
          editorDom.removeEventListener('click', handleClick, true)
          editorDom.removeEventListener('mousedown', handleMouseDown, true)
          document.removeEventListener('click', handleClickOutside)
        } catch (err) {
          console.error('Error cleaning up handlers:', err)
        }
      }
    }
  }, [editor])

  // Image resize handler
  useEffect(() => {
    if (!selectedImageElement || !isResizing) return

    const handleMouseMove = (e) => {
      if (!resizeStart.width) return

      const deltaX = e.clientX - resizeStart.x
      const editorWidth = editorRef.current?.querySelector('.ProseMirror')?.clientWidth || 900
      const maxAllowedWidth = Math.max(320, Math.min(1000, editorWidth))
      const newWidth = Math.min(maxAllowedWidth, Math.max(200, resizeStart.width + deltaX))
      selectedImageElement.setAttribute('width', String(newWidth))
      selectedImageElement.style.width = `${newWidth}px`
      selectedImageElement.style.height = 'auto'
    }

    const handleMouseUp = () => {
      setIsResizing(false)
      if (editor && selectedImageElement) {
        const width = selectedImageElement.getAttribute('width')
        if (width) {
          editor.chain().focus().setImageWidth(Number.parseInt(width, 10)).run()
        }
        setContent(editor.getHTML())
      }
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [selectedImageElement, isResizing, resizeStart, editor])

  // Keyboard handler to deselect with Escape
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && selectedImageElement) {
        selectedImageElement.classList.remove('selected')
        setSelectedImage(null)
        setSelectedImageElement(null)
        selectedImageRef.current = null
        selectedImageElementRef.current = null
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [selectedImageElement])

  const handleImageAlignment = (alignment) => {
    const imgElement = selectedImageElementRef.current
    
    if (!imgElement) {
      console.error('Alignment error: No image element selected')
      return
    }


    if (alignment === 'left') {
      imgElement.setAttribute('data-align', 'left')
      editor?.chain().focus().setImageAlign('left').run()
    } else if (alignment === 'right') {
      imgElement.setAttribute('data-align', 'right')
      editor?.chain().focus().setImageAlign('right').run()
    } else if (alignment === 'center') {
      imgElement.setAttribute('data-align', 'center')
      editor?.chain().focus().setImageAlign('center').run()
    } else {
      imgElement.removeAttribute('data-align')
      editor?.chain().focus().removeImageAlign().run()
    }

    // Update content
    if (editor) {
      const htmlContent = editor.getHTML()
      setContent(htmlContent)
    }
  }

  const handleImageRotation = (degrees) => {
    const imgElement = selectedImageElementRef.current
    
    if (!imgElement) return

    const newRotation = (imageRotation + degrees) % 360
    setImageRotation(newRotation)
    imgElement.style.transform = `rotate(${newRotation}deg)`

    if (editor) {
      const htmlContent = editor.getHTML()
      setContent(htmlContent)
    }
  }

  const handleResetImage = () => {
    const imgElement = selectedImageElementRef.current
    
    if (!imgElement) return

    // Reset rotation
    setImageRotation(0)
    imgElement.style.transform = 'rotate(0deg)'
    
    // Reset size
    imgElement.removeAttribute('width')
    imgElement.style.width = ''
    imgElement.style.height = ''
    
    imgElement.removeAttribute('data-align')
    editor?.chain().focus().setImageWidth(null).removeImageAlign().run()

    if (editor) {
      const htmlContent = editor.getHTML()
      setContent(htmlContent)
    }
  }

  const handleStartCrop = () => {
    const imgElement = selectedImageElementRef.current
    if (!imgElement) return

    setIsCropping(true)
    
    // Initialize crop dimensions as percentages (0-100)
    setCropDimensions({
      startX: 0,
      startY: 0,
      endX: 100,
      endY: 100
    })
  }

  const handleApplyCrop = async () => {
    const imgElement = selectedImageElementRef.current
    if (!imgElement) return

    try {
      const imgElement2 = new window.Image()
      imgElement2.crossOrigin = "anonymous"
      imgElement2.src = imgElement.src

      imgElement2.onload = async () => {
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')
        
        // Convert percentages to actual pixel coordinates
        const sourceX = (cropDimensions.startX / 100) * imgElement2.naturalWidth
        const sourceY = (cropDimensions.startY / 100) * imgElement2.naturalHeight
        const sourceWidth = ((cropDimensions.endX - cropDimensions.startX) / 100) * imgElement2.naturalWidth
        const sourceHeight = ((cropDimensions.endY - cropDimensions.startY) / 100) * imgElement2.naturalHeight
        
        canvas.width = sourceWidth
        canvas.height = sourceHeight
        
        ctx.drawImage(imgElement2, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, sourceWidth, sourceHeight)
        
        // Convert to blob and upload
        canvas.toBlob(async (blob) => {
          try {
            const {
              data: { user }
            } = await supabase.auth.getUser()

            const timestamp = Date.now()
            const filename = `${user.id}/${id}/${timestamp}-cropped.png`

            const { data, error } = await supabase.storage
              .from('memory-images')
              .upload(filename, blob, {
                cacheControl: '3600',
                upsert: false,
              })

            if (error) {
              console.error('Upload error:', error)
              openModal("Crop Image", "Failed to upload cropped image.")
              return
            }

            const { data: publicData } = supabase.storage
              .from('memory-images')
              .getPublicUrl(filename)

            // Update the image source
            imgElement.src = publicData.publicUrl
            
            // Close cropping mode
            setIsCropping(false)
            
            // Update editor content
            if (editor) {
              setTimeout(() => {
                setContent(editor.getHTML())
              }, 100)
            }
          } catch (uploadErr) {
            console.error('Upload error:', uploadErr)
            openModal("Crop Image", "Failed to upload cropped image.")
          }
        }, 'image/png')
      }

      imgElement2.onerror = () => {
        openModal("Crop Image", "Failed to load image for cropping.")
      }
    } catch (err) {
      console.error('Crop error:', err)
      openModal("Crop Image", "Failed to crop image.")
    }
  }

  const handleCancelCrop = () => {
    setIsCropping(false)
    setCropDimensions({ startX: 0, startY: 0, endX: 100, endY: 100 })
  }

  const loadMemory = async () => {
    // Prevent concurrent loads
    if (isLoadingMemoryRef.current) {
      console.log("[MemoryEditor] Memory load already in progress, skipping duplicate request")
      return
    }

    isLoadingMemoryRef.current = true
    loadControllerRef.current = new AbortController()
    const startTime = Date.now()
    
    setLoading(true)

    try {
      console.log("[MemoryEditor] Starting memory load for ID:", memoryId)

      const storedKey = localStorage.getItem(`workspace_key_${id}`)
      if (!storedKey) {
        console.error("[MemoryEditor] ❌ Encryption key not found in localStorage")
        showError("Encryption key not found.")
        navigate(`/workspace/${id}`)
        return
      }

      // Step 1: Fetch memory from database
      console.log("[MemoryEditor] Step 1: Fetching memory from database...")
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
        .eq("workspace_id", id)
        .maybeSingle()

      if (error) {
        console.error("[MemoryEditor] ❌ Database fetch error:", error)
        showError("Memory not found or you no longer have access")
        setLoading(false)
        return
      }

      if (!memory) {
        console.error("[MemoryEditor] ❌ Memory not found:", memoryId)
        showError("Memory not found or you no longer have access")
        setLoading(false)
        return
      }

      console.log("[MemoryEditor] ✅ Memory fetched from database")

      // Step 2: Decrypt memory content
      console.log("[MemoryEditor] Step 2: Decrypting memory content...")
      try {
        const cryptoKey = await importKey(storedKey)
        const decryptedText = await decrypt(memory.encrypted_content, memory.iv, cryptoKey)
        const normalizedContent = normalizeEditorHtmlForImages(decryptedText)

        setTitle(memory.title)
        setContent(normalizedContent)
        setIsLoaded(true)
        
        console.log("[MemoryEditor] ✅ Memory decrypted successfully")
      } catch (decryptErr) {
        console.error("[MemoryEditor] ❌ Decryption error:", decryptErr)
        showError("Could not decrypt this memory")
        setLoading(false)
        return
      }

      const elapsedMs = Date.now() - startTime
      console.log(`[MemoryEditor] ✅ Memory load completed in ${elapsedMs}ms`)
    } catch (err) {
      console.error("[MemoryEditor] ❌ Unexpected error loading memory:", err)
      showError("An error occurred while loading the memory")
      setLoading(false)
    } finally {
      setLoading(false)
      isLoadingMemoryRef.current = false
    }
  }

  const loadUserRole = async () => {
    try {
      const role = await getUserRole(id)
      setUserRole(role)
    } catch {
      setUserRole("viewer")
    }
  }

  const saveMemory = async () => {
    const startTime = Date.now()
    console.log("[MemoryEditor] Starting memory save operation")

    // Check permissions based on action
    const isEditing = !!memoryId
    const action = isEditing ? "edit" : "create"
    
    console.log(`[MemoryEditor] Step 1: Checking permissions for ${action}...`)
    const hasPermission = isEditing ? canEdit(userRole) : canCreate(userRole)

    if (!hasPermission) {
      console.error(`[MemoryEditor] ❌ Permission denied for ${action}`)
      showError(`You don't have permission to ${action} memories`)
      return
    }

    if (!content.trim() && !title.trim()) {
      console.error("[MemoryEditor] ❌ Empty memory: no content or title")
      showError("Please add some content or a title")
      return
    }

    console.log("[MemoryEditor] ✅ Permissions verified")

    const storedKey = localStorage.getItem(`workspace_key_${id}`)

    if (!storedKey) {
      console.error("[MemoryEditor] ❌ Encryption key not found in localStorage")
      showError("Encryption key not found. Please go back and reopen the workspace.")
      return
    }

    // Validate key before using
    console.log("[MemoryEditor] Step 2: Validating encryption key...")
    const keyValidation = validateKey(storedKey)
    debugLogKey(storedKey, "MemoryEditor")
    
    if (!keyValidation.isValid) {
      console.error("[MemoryEditor] ❌ Invalid encryption key:", keyValidation.error)
      showError("Invalid encryption key. Cannot save memory.")
      return
    }

    console.log("[MemoryEditor] ✅ Encryption key validated")

    setSaving(true)

    try {
      // Step 3: Encrypt content
      console.log("[MemoryEditor] Step 3: Encrypting memory content...")
      const cryptoKey = await importKey(storedKey)
      const normalizedContent = normalizeEditorHtmlForImages(content)
      const { ciphertext, iv } = await encrypt(normalizedContent, cryptoKey)
      console.log("[MemoryEditor] ✅ Content encrypted")

      // Step 4: Get current user
      console.log("[MemoryEditor] Step 4: Authenticating current user...")
      const {
        data: { user },
        error: authError
      } = await supabase.auth.getUser()

      if (authError || !user) {
        console.error("[MemoryEditor] ❌ Authentication error:", authError)
        showError("Authentication error. Please try again.")
        setSaving(false)
        return
      }

      console.log("[MemoryEditor] ✅ User authenticated")

      // For updates, do NOT overwrite created_by (RLS will block if you change creator)
      const basePayload = {
        workspace_id: id,
        title: title || "Untitled",
        encrypted_content: ciphertext,
        iv: iv
      }

      let error

      if (memoryId) {
        // Step 5a: Update existing memory
        console.log("[MemoryEditor] Step 5: Updating existing memory...")
        const { error: updateError } = await supabase
          .from("memories")
          .update(basePayload)
          .eq("id", memoryId)
          .eq("workspace_id", id)

        error = updateError
        
        if (!error) {
          console.log("[MemoryEditor] ✅ Memory updated")
        }
      } else {
        // Step 5b: Create new memory
        console.log("[MemoryEditor] Step 5: Creating new memory...")
        const insertPayload = {
          ...basePayload,
          created_by: user.id
        }

        const { error: insertError } = await supabase
          .from("memories")
          .insert(insertPayload)
        error = insertError

        if (!error) {
          console.log("[MemoryEditor] ✅ Memory created")
        }
      }

      if (error) {
        console.error(`[MemoryEditor] ❌ Failed to ${action} memory:`, error)
        showError(`Failed to ${action} memory`)
        setSaving(false)
        return
      }

      const elapsedMs = Date.now() - startTime
      console.log(`[MemoryEditor] ✅ Memory ${action} completed in ${elapsedMs}ms`)
      
      success("Memory saved")
      setSaving(false)
      navigate(`/workspace/${id}`)

    } catch (err) {
      console.error("[MemoryEditor] ❌ Unexpected error during save:", err)
      showError("Something went wrong")
      setSaving(false)
    }
  }

  const handleImageUpload = async (file) => {
    if (!file) return

    // Validate file is an image
    if (!file.type.startsWith('image/')) {
      openModal("Image Upload", "Please select an image file.")
      return
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      openModal("Image Upload", "Image must be less than 5MB.")
      return
    }

    setUploadingImage(true)

    try {
      const {
        data: { user }
      } = await supabase.auth.getUser()

      // Generate unique filename
      const timestamp = Date.now()
      const filename = `${user.id}/${id}/${timestamp}-${file.name}`

      // Upload to Supabase Storage
      const { error } = await supabase.storage
        .from('memory-images')
        .upload(filename, file, {
          cacheControl: '3600',
          upsert: false,
        })

      if (error) {
        console.error('Upload error:', error)
        openModal("Image Upload", "Failed to upload image.")
        return
      }

      // Get public URL
      const { data: publicData } = supabase.storage
        .from('memory-images')
        .getPublicUrl(filename)

      const imageUrl = publicData?.publicUrl
      if (!imageUrl) {
        console.error('Upload succeeded but public URL is missing')
        openModal("Image Upload", "Image uploaded, but URL generation failed.")
        return
      }

      const inserted = editor
        .chain()
        .focus()
        .setImage({ src: imageUrl })
        .run()
      
      if (!inserted) {
        console.error('Image uploaded but insertion command failed')
        openModal("Image Upload", "Image uploaded, but could not insert into the editor.")
      }
    } catch (err) {
      console.error('Image upload error:', err)
      openModal("Image Upload", "Failed to upload image.")
    } finally {
      setUploadingImage(false)
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const openImageUpload = () => {
    fileInputRef.current?.click()
  }

  if (!editor) {
    return null
  }

  // Show skeleton loader while loading an existing memory
  if (memoryId && !isLoaded) {
    return <EditorSkeleton />
  }

  return (

    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 text-gray-900 fade-in">
      <div style={{ maxWidth: '900px' }} className="mx-auto px-6 py-12">

        <button
          onClick={(e) => handleNavigationClick(e, () => memoryId 
            ? navigate(`/workspace/${id}/memory/${memoryId}`)
            : navigate(`/workspace/${id}`))}
          className="mb-8 text-yellow-500 hover:text-yellow-400 transition-colors font-medium"
        >
          ← Back
        </button>

        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900">
            {memoryId ? "Edit Memory" : "New Memory"}
          </h1>
          <p className="text-slate-500 text-sm mt-1">Encrypted and secured</p>
        </div>

        {/* Title Input */}
        <input
          type="text"
          placeholder="Memory title..."
          className="w-full bg-white text-gray-900 text-2xl font-semibold px-4 py-3 rounded-lg mb-4 border border-slate-200 focus:outline-none focus:border-yellow-400 focus:ring-2 focus:ring-yellow-400/40 transition-all duration-200 placeholder-slate-400"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={(e) => handleImageUpload(e.target.files?.[0])}
        />

        <style>{`
          .ProseMirror { 
            width: 100%; 
            display: block;
            overflow-x: visible;
            overflow: visible;
            line-height: 1.6;
            word-wrap: break-word;
            word-break: normal;
            white-space: normal;
            overflow-wrap: break-word;
          }
          .ProseMirror * { max-width: 100%; }
          .ProseMirror p { margin-bottom: 0.6rem; min-height: 20px; line-height: inherit; }
          .ProseMirror ul { list-style-type: disc; margin-left: 1.5rem; margin-top: 0.5rem; margin-bottom: 0.5rem; }
          .ProseMirror ul li { margin-bottom: 0.25rem; }
          .ProseMirror pre { background: #f9fafb; border: 1px solid #e5e7eb; padding: 1rem 1.25rem; border-radius: 0.5rem; font-family: 'Fira Code', 'Cascadia Code', monospace; overflow-x: auto; margin: 0.75rem 0; }
          .ProseMirror code { background: #f3f4f6; color: #92400e; padding: 0.15rem 0.4rem; border-radius: 0.25rem; font-size: 0.85em; font-family: monospace; }
          .ProseMirror pre code { background: transparent; color: #1f2937; padding: 0; font-size: 0.875em; }
          .ProseMirror p.is-empty::before { content: attr(data-placeholder); color: #9ca3af; pointer-events: none; }
          .ProseMirror strong { color: #111827; }
          .ProseMirror em { color: #374151; }
          .ProseMirror img { display: inline-block; min-width: 200px; max-width: 100%; height: auto; object-fit: contain; border: 1px solid #d1d5db; border-radius: 10px; cursor: pointer; pointer-events: auto; position: relative; transition: outline 0.2s ease; }
            .ProseMirror img[data-align="left"] { float: left; margin-right: 12px; margin-bottom: 8px; }
            .ProseMirror img[data-align="right"] { float: right; margin-left: 12px; margin-bottom: 8px; }
            .ProseMirror img[data-align="center"] { display: block; clear: both; float: none; margin: 0 auto 12px; }
            .ProseMirror::after { content: ""; display: block; clear: both; }
          .ProseMirror img.selected { outline: 2px solid #facc15; box-shadow: 0 0 0 4px rgba(250, 204, 21, 0.2); }
          .ProseMirror img.selected::after { content: ''; position: absolute; bottom: 0; right: 0; width: 20px; height: 20px; background: linear-gradient(135deg, transparent 50%, #facc15 50%); cursor: nwse-resize; border-radius: 0 10px 0 0; }
        `}</style>

        {/* Unified Editor Card: toolbar + content */}
        <div ref={editorRef} className="card relative overflow-visible shadow-md focus-within:shadow-lg focus-within:border-yellow-400"
        >

          {/* Image Alignment & Rotation Toolbar */}
          {selectedImageElement && !isCropping && (
            <div
              ref={toolbarRef}
              style={{
                position: 'fixed',
                top: `${toolbarPosition.top}px`,
                left: `${toolbarPosition.left}px`,
                transform: 'translateX(-50%)',
                zIndex: 9999,
              }}
              className="flex gap-0 bg-white border-2 border-yellow-400 rounded-lg shadow-2xl overflow-hidden"
            >
              {/* Alignment Section */}
              <div className="flex gap-0 border-r border-gray-300">
                <button
                  onClick={() => handleImageAlignment('left')}
                  title="Align Left"
                  className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-yellow-100 transition-colors hover:text-gray-900"
                >
                  ⬅️
                </button>
                <button
                  onClick={() => handleImageAlignment('center')}
                  title="Align Center"
                  className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-yellow-100 transition-colors border-l border-r border-gray-300 hover:text-gray-900"
                >
                  ⬇️
                </button>
                <button
                  onClick={() => handleImageAlignment('right')}
                  title="Align Right"
                  className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-yellow-100 transition-colors hover:text-gray-900"
                >
                  ➡️
                </button>
              </div>

              {/* Rotation Section */}
              <div className="flex gap-0">
                <button
                  onClick={() => handleImageRotation(-90)}
                  title="Rotate Left (90°)"
                  className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-yellow-100 transition-colors hover:text-gray-900 border-r border-gray-300"
                >
                  ↺
                </button>
                <button
                  onClick={() => handleImageRotation(90)}
                  title="Rotate Right (90°)"
                  className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-yellow-100 transition-colors hover:text-gray-900 border-r border-gray-300"
                >
                  ↻
                </button>
                <button
                  onClick={() => handleStartCrop()}
                  title="Crop"
                  className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-yellow-100 transition-colors hover:text-gray-900 border-r border-gray-300"
                >
                  ✂️
                </button>
                <button
                  onClick={() => handleResetImage()}
                  title="Reset"
                  className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-yellow-100 transition-colors hover:text-gray-900"
                >
                  🔄
                </button>
              </div>
            </div>
          )}

          {/* Toolbar */}
          {editor && (
            <div className="flex items-center gap-1 bg-slate-100 border-b border-slate-200 px-3 py-2 flex-wrap">
              <button
                type="button"
                onClick={() => editor.chain().focus().toggleBold().run()}
                disabled={!editor.can().chain().focus().toggleBold().run()}
                title="Bold"
                className={`px-2 py-1 rounded text-xs font-bold transition-all duration-200 ${
                  editor.isActive('bold')
                    ? 'bg-yellow-400 text-gray-900'
                    : 'text-slate-600 hover:bg-white hover:text-gray-900'
                }`}
              >
                B
              </button>
              <button
                type="button"
                onClick={() => editor.chain().focus().toggleItalic().run()}
                disabled={!editor.can().chain().focus().toggleItalic().run()}
                title="Italic"
                className={`px-2 py-1 rounded text-xs italic font-semibold transition-all duration-200 ${
                  editor.isActive('italic')
                    ? 'bg-yellow-400 text-gray-900'
                    : 'text-slate-600 hover:bg-white hover:text-gray-900'
                }`}
              >
                I
              </button>

              <div className="w-px h-4 bg-slate-300 mx-1" />

              <button
                type="button"
                onClick={() => editor.chain().focus().toggleBulletList().run()}
                title="Bullet List"
                className={`px-2 py-1 rounded text-xs transition-all duration-200 ${
                  editor.isActive('bulletList')
                    ? 'bg-yellow-400 text-gray-900'
                    : 'text-slate-600 hover:bg-white hover:text-gray-900'
                }`}
              >
                • List
              </button>
              <button
                type="button"
                onClick={() => editor.chain().focus().toggleCodeBlock().run()}
                title="Code Block"
                className={`px-2 py-1 rounded text-xs font-mono transition-all duration-200 ${
                  editor.isActive('codeBlock')
                    ? 'bg-yellow-400 text-gray-900'
                    : 'text-slate-600 hover:bg-white hover:text-gray-900'
                }`}
              >
                {'</>'}  
              </button>

              <div className="w-px h-4 bg-slate-300 mx-1" />

              <button
                type="button"
                onClick={openImageUpload}
                disabled={uploadingImage}
                title="Add Image"
                className={`px-2 py-1 rounded text-xs transition-all duration-200 ${
                  uploadingImage
                    ? 'bg-slate-200 text-slate-500 cursor-not-allowed'
                    : 'text-slate-600 hover:bg-white hover:text-gray-900'
                }`}
              >
                {uploadingImage ? '⏳...' : '🖼️'}
              </button>

              <div className="w-px h-4 bg-slate-300 mx-1" />

              <button
                type="button"
                onClick={() => handleImageAlignment('left')}
                title="Float Image Left"
                className="px-2 py-1 rounded text-xs text-slate-600 hover:bg-white hover:text-gray-900 transition-all duration-200"
              >
                ↙️ Left
              </button>

              <button
                type="button"
                onClick={() => handleImageAlignment('right')}
                title="Float Image Right"
                className="px-2 py-1 rounded text-xs text-slate-600 hover:bg-white hover:text-gray-900 transition-all duration-200"
              >
                Right ↗️
              </button>

              <button
                type="button"
                onClick={() => handleImageAlignment('center')}
                title="Reset Image Position"
                className="px-2 py-1 rounded text-xs text-slate-600 hover:bg-white hover:text-gray-900 transition-all duration-200"
              >
                🔄 Reset
              </button>
            </div>
          )}

          {/* Editor body */}
          <div className="relative bg-white p-4">
            {editor && editor.isEmpty && !content && (
              <p className="absolute px-4 pt-4 text-slate-400 text-[15px] pointer-events-none select-none">
                Start writing your memory...
              </p>
            )}
            {editor ? <EditorContent editor={editor} /> : null}
          </div>

        </div>

        {/* Crop Overlay */}
        {isCropping && selectedImageElement && selectedImageElementRef.current && (
          <div 
            className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
            onClick={(e) => {
              // Only close if clicking on the background, not the dialog
              if (e.target === e.currentTarget) {
                return
              }
            }}
          >
            <div 
              className="bg-white rounded-lg p-6 shadow-2xl max-w-3xl w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Crop Image</h3>
              <p className="text-sm text-gray-600 mb-4">Drag the yellow dots at the corners to define the crop area</p>
              
              <div 
                className="relative mb-6 mx-auto" 
                style={{ width: 'fit-content' }}
                onMouseMove={(e) => {
                  // Store image dimensions when mouse moves over container
                  const imgElement = e.currentTarget.querySelector('img')
                  if (imgElement && !e.currentTarget.dataset.width) {
                    const rect = imgElement.getBoundingClientRect()
                    e.currentTarget.dataset.width = rect.width
                    e.currentTarget.dataset.height = rect.height
                  }
                }}
              >
                <img
                  src={selectedImageElementRef.current?.src}
                  alt="Crop preview"
                  style={{
                    maxWidth: '100%',
                    maxHeight: '500px',
                    display: 'block',
                    userSelect: 'none'
                  }}
                />
                
                {/* Semi-transparent overlay for non-cropped areas */}
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: 'rgba(0, 0, 0, 0.4)',
                    pointerEvents: 'none',
                    clipPath: `inset(${cropDimensions.startY}px ${100 - cropDimensions.endX}% ${100 - cropDimensions.endY}% ${cropDimensions.startX}%)`
                  }}
                />

                {/* Crop area border */}
                <div
                  style={{
                    position: 'absolute',
                    top: `${cropDimensions.startY}%`,
                    left: `${cropDimensions.startX}%`,
                    width: `${cropDimensions.endX - cropDimensions.startX}%`,
                    height: `${cropDimensions.endY - cropDimensions.startY}%`,
                    border: '2px solid #facc15',
                    pointerEvents: 'none',
                    boxSizing: 'border-box'
                  }}
                />

                {/* Top-left corner dot */}
                <div
                  onMouseDown={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    const startX = e.clientX
                    const startY = e.clientY
                    const container = e.currentTarget.parentElement
                    const containerRect = container.getBoundingClientRect()
                    const sensitivity = 0.01 // Much lower sensitivity for slower control

                    const handleMouseMove = (moveEvent) => {
                      const deltaX = moveEvent.clientX - startX
                      const deltaY = moveEvent.clientY - startY
                      const percentX = (deltaX / containerRect.width) * 100 * sensitivity
                      const percentY = (deltaY / containerRect.height) * 100 * sensitivity

                      setCropDimensions(prev => ({
                        ...prev,
                        startX: Math.max(0, Math.min(prev.startX + percentX, prev.endX - 5)),
                        startY: Math.max(0, Math.min(prev.startY + percentY, prev.endY - 5))
                      }))
                    }

                    const handleMouseUp = () => {
                      document.removeEventListener('mousemove', handleMouseMove)
                      document.removeEventListener('mouseup', handleMouseUp)
                    }

                    document.addEventListener('mousemove', handleMouseMove)
                    document.addEventListener('mouseup', handleMouseUp)
                  }}
                  style={{
                    position: 'absolute',
                    top: `${cropDimensions.startY}%`,
                    left: `${cropDimensions.startX}%`,
                    transform: 'translate(-50%, -50%)',
                    width: '16px',
                    height: '16px',
                    backgroundColor: '#facc15',
                    cursor: 'nwse-resize',
                    borderRadius: '50%',
                    zIndex: 20,
                    border: '2px solid white',
                    boxShadow: '0 0 4px rgba(0,0,0,0.3)'
                  }}
                />

                {/* Top-right corner dot */}
                <div
                  onMouseDown={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    const startX = e.clientX
                    const startY = e.clientY
                    const container = e.currentTarget.parentElement
                    const containerRect = container.getBoundingClientRect()
                    const sensitivity = 0.01 // Much lower sensitivity for slower control

                    const handleMouseMove = (moveEvent) => {
                      const deltaX = moveEvent.clientX - startX
                      const deltaY = moveEvent.clientY - startY
                      const percentX = (deltaX / containerRect.width) * 100 * sensitivity
                      const percentY = (deltaY / containerRect.height) * 100 * sensitivity

                      setCropDimensions(prev => ({
                        ...prev,
                        endX: Math.min(100, Math.max(prev.endX + percentX, prev.startX + 5)),
                        startY: Math.max(0, Math.min(prev.startY + percentY, prev.endY - 5))
                      }))
                    }

                    const handleMouseUp = () => {
                      document.removeEventListener('mousemove', handleMouseMove)
                      document.removeEventListener('mouseup', handleMouseUp)
                    }

                    document.addEventListener('mousemove', handleMouseMove)
                    document.addEventListener('mouseup', handleMouseUp)
                  }}
                  style={{
                    position: 'absolute',
                    top: `${cropDimensions.startY}%`,
                    right: `${100 - cropDimensions.endX}%`,
                    transform: 'translate(50%, -50%)',
                    width: '16px',
                    height: '16px',
                    backgroundColor: '#facc15',
                    cursor: 'nesw-resize',
                    borderRadius: '50%',
                    zIndex: 20,
                    border: '2px solid white',
                    boxShadow: '0 0 4px rgba(0,0,0,0.3)'
                  }}
                />

                {/* Bottom-left corner dot */}
                <div
                  onMouseDown={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    const startX = e.clientX
                    const startY = e.clientY
                    const container = e.currentTarget.parentElement
                    const containerRect = container.getBoundingClientRect()
                    const sensitivity = 0.01 // Much lower sensitivity for slower control

                    const handleMouseMove = (moveEvent) => {
                      const deltaX = moveEvent.clientX - startX
                      const deltaY = moveEvent.clientY - startY
                      const percentX = (deltaX / containerRect.width) * 100 * sensitivity
                      const percentY = (deltaY / containerRect.height) * 100 * sensitivity

                      setCropDimensions(prev => ({
                        ...prev,
                        startX: Math.max(0, Math.min(prev.startX + percentX, prev.endX - 5)),
                        endY: Math.min(100, Math.max(prev.endY + percentY, prev.startY + 5))
                      }))
                    }

                    const handleMouseUp = () => {
                      document.removeEventListener('mousemove', handleMouseMove)
                      document.removeEventListener('mouseup', handleMouseUp)
                    }

                    document.addEventListener('mousemove', handleMouseMove)
                    document.addEventListener('mouseup', handleMouseUp)
                  }}
                  style={{
                    position: 'absolute',
                    bottom: `${100 - cropDimensions.endY}%`,
                    left: `${cropDimensions.startX}%`,
                    transform: 'translate(-50%, 50%)',
                    width: '16px',
                    height: '16px',
                    backgroundColor: '#facc15',
                    cursor: 'nesw-resize',
                    borderRadius: '50%',
                    zIndex: 20,
                    border: '2px solid white',
                    boxShadow: '0 0 4px rgba(0,0,0,0.3)'
                  }}
                />

                {/* Bottom-right corner dot */}
                <div
                  onMouseDown={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    const startX = e.clientX
                    const startY = e.clientY
                    const container = e.currentTarget.parentElement
                    const containerRect = container.getBoundingClientRect()
                    const sensitivity = 0.01 // Much lower sensitivity for slower control

                    const handleMouseMove = (moveEvent) => {
                      const deltaX = moveEvent.clientX - startX
                      const deltaY = moveEvent.clientY - startY
                      const percentX = (deltaX / containerRect.width) * 100 * sensitivity
                      const percentY = (deltaY / containerRect.height) * 100 * sensitivity

                      setCropDimensions(prev => ({
                        ...prev,
                        endX: Math.min(100, Math.max(prev.endX + percentX, prev.startX + 5)),
                        endY: Math.min(100, Math.max(prev.endY + percentY, prev.startY + 5))
                      }))
                    }

                    const handleMouseUp = () => {
                      document.removeEventListener('mousemove', handleMouseMove)
                      document.removeEventListener('mouseup', handleMouseUp)
                    }

                    document.addEventListener('mousemove', handleMouseMove)
                    document.addEventListener('mouseup', handleMouseUp)
                  }}
                  style={{
                    position: 'absolute',
                    bottom: `${100 - cropDimensions.endY}%`,
                    right: `${100 - cropDimensions.endX}%`,
                    transform: 'translate(50%, 50%)',
                    width: '16px',
                    height: '16px',
                    backgroundColor: '#facc15',
                    cursor: 'se-resize',
                    borderRadius: '50%',
                    zIndex: 20,
                    border: '2px solid white',
                    boxShadow: '0 0 4px rgba(0,0,0,0.3)'
                  }}
                />
              </div>

              <div className="flex gap-4">
                <button
                  onClick={handleCancelCrop}
                  className="flex-1 px-4 py-2 bg-gray-300 text-gray-900 font-medium rounded-lg hover:bg-gray-400 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleApplyCrop}
                  className="flex-1 px-4 py-2 bg-yellow-500 text-gray-900 font-medium rounded-lg hover:bg-yellow-400 transition-colors"
                >
                  Apply Crop
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Save Button */}
        <div className="mt-8 flex justify-between items-center clear-both">
          <button
            onClick={(e) => handleNavigationClick(e, () => memoryId 
              ? navigate(`/workspace/${id}/memory/${memoryId}`)
              : navigate(`/workspace/${id}`))}
            className="text-slate-600 hover:text-slate-900 font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={saveMemory}
            disabled={saving || (!content.trim() && !title.trim()) || !((memoryId ? canEdit(userRole) : canCreate(userRole)))}
            title={!((memoryId ? canEdit(userRole) : canCreate(userRole))) ? "You don't have permission to perform this action" : ""}
            className="bg-yellow-500 hover:bg-yellow-400 active:scale-95 text-gray-900 font-semibold px-6 py-2 rounded-lg shadow-sm hover:shadow-md transition-all duration-200 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-yellow-500"
          >
            {saving ? "⏳ Saving..." : "Save Memory"}
          </button>
        </div>

      </div>

      <Modal
        open={modalConfig.open}
        title={modalConfig.title}
        message={modalConfig.message}
        confirmText="OK"
        showCancel={false}
        onConfirm={() => setModalConfig({ open: false, title: "", message: "" })}
      />
    </div>

  )
}

