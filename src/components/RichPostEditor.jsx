import { useEffect, useMemo } from "react"
import { EditorContent, useEditor } from "@tiptap/react"
import { BubbleMenu } from "@tiptap/react/menus"
import StarterKit from "@tiptap/starter-kit"
import { Mark } from "@tiptap/core"
import PostContent from "./PostContent"

const FONT_SIZES = [
  { label: "S", value: "small" },
  { label: "N", value: "normal" },
  { label: "L", value: "large" },
]

const FontSize = Mark.create({
  name: "fontSize",

  addAttributes() {
    return {
      size: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-font-size"),
        renderHTML: (attributes) => {
          if (!attributes.size || attributes.size === "normal") {
            return {}
          }

          return {
            "data-font-size": attributes.size,
            class: `vn-font-${attributes.size}`,
          }
        },
      },
    }
  },

  parseHTML() {
    return [{ tag: "span[data-font-size]" }]
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", HTMLAttributes, 0]
  },

  addCommands() {
    return {
      setFontSize:
        (size) =>
        ({ chain }) => {
          if (size === "normal") {
            return chain().unsetMark(this.name).run()
          }

          return chain().setMark(this.name, { size }).run()
        },
    }
  },
})

export default function RichPostEditor({ value, onChange, placeholder = "Write your shayari..." }) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
        code: false,
        codeBlock: false,
        horizontalRule: false,
      }),
      FontSize,
    ],
    content: value || "",
    autofocus: "end",
    editorProps: {
      attributes: {
        class:
          "min-h-[150px] w-full rounded-[12px] border border-[var(--overlay-border)] bg-[var(--overlay-elev)] px-4 py-3 text-[15px] leading-7 text-[var(--overlay-text)] outline-none transition focus:border-[#F4B400] focus:shadow-[0_0_0_2px_rgba(244,180,0,0.18)]",
        "data-placeholder": placeholder,
      },
      handleKeyDown(view, event) {
        if (event.key === "Enter" && !event.shiftKey) {
          const { state, dispatch } = view
          dispatch(state.tr.replaceSelectionWith(state.schema.nodes.hardBreak.create()).scrollIntoView())
          return true
        }

        return false
      },
    },
    onUpdate({ editor: activeEditor }) {
      onChange?.({
        html: activeEditor.getHTML(),
        text: activeEditor.getText("\n"),
      })
    },
  })

  useEffect(() => {
    if (!editor) return
    if (!value && !editor.isEmpty) {
      editor.commands.clearContent()
    }
  }, [editor, value])

  const currentHtml = useMemo(() => editor?.getHTML() || value || "", [editor, value])

  if (!editor) return null

  const toolbarButtonClass = (active) =>
    `flex h-8 min-w-8 items-center justify-center rounded-[8px] px-2 text-xs font-bold transition ${
      active
        ? "bg-[#F4B400] text-[#1a1612]"
        : "text-[var(--overlay-text-subtle)] hover:bg-[var(--overlay-elev)] hover:text-[var(--overlay-text)]"
    }`

  return (
    <div className="space-y-3">
      <div className="relative">
        <BubbleMenu
          editor={editor}
          shouldShow={({ editor: activeEditor, state }) => !state.selection.empty && activeEditor.isEditable}
          options={{
            placement: "top",
            offset: 8,
            flip: true,
            shift: { padding: 12 },
          }}
        >
          <div className="flex max-w-[calc(100vw-24px)] items-center gap-1 rounded-[12px] border border-[var(--overlay-border-strong)] bg-[var(--overlay-surface)] p-1 shadow-[0_12px_32px_rgba(0,0,0,0.22)] backdrop-blur-md animate-in fade-in zoom-in-95 duration-150">
            <button
              type="button"
              onClick={() => editor.chain().focus().toggleBold().run()}
              className={toolbarButtonClass(editor.isActive("bold"))}
              title="Bold"
            >
              B
            </button>
            <button
              type="button"
              onClick={() => editor.chain().focus().toggleItalic().run()}
              className={toolbarButtonClass(editor.isActive("italic"))}
              title="Italic"
            >
              I
            </button>
            <button
              type="button"
              onClick={() => editor.chain().focus().toggleBlockquote().run()}
              className={toolbarButtonClass(editor.isActive("blockquote"))}
              title="Quote"
            >
              "
            </button>
            <div className="mx-1 h-5 w-px bg-[var(--overlay-border)]" />
            {FONT_SIZES.map((size) => (
              <button
                key={size.value}
                type="button"
                onClick={() => editor.chain().focus().setFontSize(size.value).run()}
                className={toolbarButtonClass(
                  size.value === "normal"
                    ? !editor.isActive("fontSize")
                    : editor.isActive("fontSize", { size: size.value })
                )}
                title={`${size.value} text`}
              >
                {size.label}
              </button>
            ))}
          </div>
        </BubbleMenu>

        <EditorContent editor={editor} className="rich-post-editor" />
      </div>

      <div className="rounded-[12px] border border-[var(--overlay-border)] bg-[var(--overlay-elev)] px-4 py-3">
        <div className="mb-2 flex items-center justify-between gap-3">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--overlay-text-muted)]">Preview</span>
          <span className="text-[11px] text-[var(--overlay-text-muted)]">{editor.storage.characterCount?.characters?.() || editor.getText().length} chars</span>
        </div>
        {editor.isEmpty ? (
          <p className="text-sm text-[var(--overlay-text-muted)]">Your formatted post will appear here.</p>
        ) : (
          <PostContent content={currentHtml} className="text-[15px] leading-7 text-[var(--overlay-text)]" />
        )}
      </div>
    </div>
  )
}
