const fs = require('fs');

const path = 'd:/Projects/VaultNotes/src/pages/Chat.jsx';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(
  "const isDeleted = message.is_deleted\n                    const isImage = message.type === 'image'",
  "const isDeleted = message.is_deleted\n                    const isImage = message.type === 'image'\n                    const isPost = message.type === 'post'"
);

content = content.replace(
  "const canReplyMessage = !isDeleted\n                    const canReactMessage = !isDeleted\n                    const canForwardMessage = !isDeleted\n                    const canCopyMessage = !isDeleted && Boolean(message.content || message.storage_path)",
  "const canReplyMessage = !isDeleted && !isPost\n                    const canReactMessage = !isDeleted\n                    const canForwardMessage = !isDeleted && !isPost\n                    const canCopyMessage = !isDeleted && !isPost && Boolean(message.content || message.storage_path)"
);

content = content.replace(
  "{isDeleted ? (\n                              <div className=\"rounded-lg px-3 py-2 text-sm text-[var(--chat-text-muted)] italic\">\n                                This message was deleted\n                              </div>\n                            ) : isImage && message.storage_path ? (",
  "{isDeleted ? (\n                              <div className=\"rounded-lg px-3 py-2 text-sm text-[var(--chat-text-muted)] italic\">\n                                This message was deleted\n                              </div>\n                            ) : isPost ? (\n                              <PostPreview postId={message.post_id} isMine={isOwn} />\n                            ) : isImage && message.storage_path ? ("
);

// We need to support \r\n as well
content = content.replace(
  "const isDeleted = message.is_deleted\r\n                    const isImage = message.type === 'image'",
  "const isDeleted = message.is_deleted\r\n                    const isImage = message.type === 'image'\r\n                    const isPost = message.type === 'post'"
);

content = content.replace(
  "const canReplyMessage = !isDeleted\r\n                    const canReactMessage = !isDeleted\r\n                    const canForwardMessage = !isDeleted\r\n                    const canCopyMessage = !isDeleted && Boolean(message.content || message.storage_path)",
  "const canReplyMessage = !isDeleted && !isPost\r\n                    const canReactMessage = !isDeleted\r\n                    const canForwardMessage = !isDeleted && !isPost\r\n                    const canCopyMessage = !isDeleted && !isPost && Boolean(message.content || message.storage_path)"
);

content = content.replace(
  "{isDeleted ? (\r\n                              <div className=\"rounded-lg px-3 py-2 text-sm text-[var(--chat-text-muted)] italic\">\r\n                                This message was deleted\r\n                              </div>\r\n                            ) : isImage && message.storage_path ? (",
  "{isDeleted ? (\r\n                              <div className=\"rounded-lg px-3 py-2 text-sm text-[var(--chat-text-muted)] italic\">\r\n                                This message was deleted\r\n                              </div>\r\n                            ) : isPost ? (\r\n                              <PostPreview postId={message.post_id} isMine={isOwn} />\r\n                            ) : isImage && message.storage_path ? ("
);

fs.writeFileSync(path, content, 'utf8');
console.log('Chat.jsx patched!');
