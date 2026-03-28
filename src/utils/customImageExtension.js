import Image from '@tiptap/extension-image'

export const CustomImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      float: {
        default: null,
        parseHTML: element => {
          if (element.classList.contains('image-left')) return 'left'
          if (element.classList.contains('image-right')) return 'right'
          if (element.classList.contains('image-center')) return 'center'
          return null
        },
        renderHTML: attributes => {
          if (!attributes.float) return {}

          return {
            class: `image-${attributes.float}`,
          }
        },
      },
    }
  },

  addCommands() {
    return {
      setImageFloat:
        float =>
        ({ commands }) => {
          return commands.updateAttributes('image', { float })
        },

      removeImageFloat:
        () =>
        ({ commands }) => {
          return commands.updateAttributes('image', { float: null })
        },
    }
  },
})
