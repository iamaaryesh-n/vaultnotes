import re

path = 'd:/Projects/VaultNotes/src/pages/Chat.jsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace(
    '} else if (latestMessage?.encrypted_content) {\n          // For encrypted messages without plaintext, show nothing\n          displayContent = ""\n        }',
    '} else if (latestMessage?.encrypted_content) {\n          // For encrypted messages without plaintext, show nothing\n          displayContent = ""\n        } else if (latestMessage?.type === "post") {\n          displayContent = "📝 Shared a post"\n        }'
)

content = content.replace(
    'if (getMessageType(nextMessage) === "image") {\n              displayContent = "📷 Photo"\n            } else if (getMessageType(nextMessage) === "file") {\n              displayContent = "📎 File"\n            } else if (decryptedContent?.trim()) {',
    'if (getMessageType(nextMessage) === "image") {\n              displayContent = "📷 Photo"\n            } else if (getMessageType(nextMessage) === "file") {\n              displayContent = "📎 File"\n            } else if (getMessageType(nextMessage) === "post") {\n              displayContent = "📝 Shared a post"\n            } else if (decryptedContent?.trim()) {'
)

content = content.replace(
    'if (getMessageType(updatedMessage) === "image") {\n                displayContent = "📷 Photo"\n              } else if (getMessageType(updatedMessage) === "file") {\n                displayContent = "📎 File"\n              } else if (decryptedContent?.trim()) {',
    'if (getMessageType(updatedMessage) === "image") {\n                displayContent = "📷 Photo"\n              } else if (getMessageType(updatedMessage) === "file") {\n                displayContent = "📎 File"\n              } else if (getMessageType(updatedMessage) === "post") {\n                displayContent = "📝 Shared a post"\n              } else if (decryptedContent?.trim()) {'
)

content = content.replace(
    'if (getMessageType(nextMessage) === "image") {\n              displayContent = "📷 Photo"\n            } else if (getMessageType(nextMessage) === "file") {\n              displayContent = "📎 File"\n            } else if (decryptedContent?.trim() && decryptedContent !== "[Message]") {',
    'if (getMessageType(nextMessage) === "image") {\n              displayContent = "📷 Photo"\n            } else if (getMessageType(nextMessage) === "file") {\n              displayContent = "📎 File"\n            } else if (getMessageType(nextMessage) === "post") {\n              displayContent = "📝 Shared a post"\n            } else if (decryptedContent?.trim() && decryptedContent !== "[Message]") {'
)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
