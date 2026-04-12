import imageCompression from "browser-image-compression"

export const MAX_IMAGE_UPLOAD_BYTES = 5 * 1024 * 1024
export const IMAGE_TOO_LARGE_MESSAGE = "Image too large. Max size is 5 MB."

const COMPRESSION_OPTIONS = {
  maxWidthOrHeight: 1080,
  maxSizeMB: 0.8,
  useWebWorker: true,
}

export class ImageCompressionError extends Error {
  constructor(message, code) {
    super(message)
    this.name = "ImageCompressionError"
    this.code = code
  }
}

export function isImageFile(file) {
  return Boolean(file?.type?.startsWith("image/"))
}

export function isImageTooLarge(file) {
  return Boolean(file && file.size > MAX_IMAGE_UPLOAD_BYTES)
}

export async function prepareImageForUpload(file) {
  if (!file) {
    return null
  }

  if (!isImageFile(file)) {
    throw new ImageCompressionError("Please select an image file.", "INVALID_IMAGE_TYPE")
  }

  if (isImageTooLarge(file)) {
    throw new ImageCompressionError(IMAGE_TOO_LARGE_MESSAGE, "IMAGE_TOO_LARGE")
  }

  try {
    const compressed = await imageCompression(file, COMPRESSION_OPTIONS)
    return compressed || file
  } catch {
    throw new ImageCompressionError("Failed to process image.", "COMPRESSION_FAILED")
  }
}
