import { Node } from '@tiptap/core'

export const ImageWrapper = Node.create({
  name: 'imageWrapper',

  group: 'block',
  content: 'inline*',
  draggable: true,

  parseHTML() {
    return [{ tag: 'div.image-wrapper' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', { class: 'image-wrapper' }, 0]
  },
})
