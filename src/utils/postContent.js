import DOMPurify from "dompurify"

const RICH_TEXT_TAG_PATTERN = /<\/?(p|br|strong|em|blockquote|span)\b/i

export function isRichPostContent(content) {
  return typeof content === "string" && RICH_TEXT_TAG_PATTERN.test(content)
}

export function sanitizePostHtml(content) {
  if (!content) return ""

  return DOMPurify.sanitize(content, {
    ALLOWED_TAGS: ["p", "br", "strong", "em", "blockquote", "span"],
    ALLOWED_ATTR: ["class", "data-font-size"],
  })
}

export function getPostPlainText(content) {
  if (!content) return ""

  if (!isRichPostContent(content)) {
    return content
  }

  const container = document.createElement("div")
  container.innerHTML = sanitizePostHtml(content)
  return container.textContent || ""
}

