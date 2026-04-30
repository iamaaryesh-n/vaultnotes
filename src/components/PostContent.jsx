import { useMemo } from "react"
import { isRichPostContent, sanitizePostHtml } from "../utils/postContent"

function escapePlainText(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
}

export default function PostContent({ content, className = "", onClick }) {
  const html = useMemo(() => {
    if (!content) return ""

    if (isRichPostContent(content)) {
      return sanitizePostHtml(content)
    }

    return escapePlainText(content).replace(/\n/g, "<br>")
  }, [content])

  if (!content) return null

  return (
    <div
      onClick={onClick}
      className={`post-rich-content ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

