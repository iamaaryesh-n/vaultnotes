#!/usr/bin/env python3
import re

file_path = r'D:\Projects\VaultNotes\src\pages\Chat.jsx'

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Replace corrupted emojis using different quote styles
content = content.replace('ðŸ"· Photo', '📷 Photo')
content = content.replace('ðŸ"Ž File', '📄 File')
content = content.replace('â†©ï¸', '<Reply className="h-4 w-4" />')
content = content.replace('ðŸ™‚', '<SmilePlus className="h-4 w-4" />')
content = content.replace('â​¯', '<MoreHorizontal className="h-4 w-4" />')
content = content.replace('â†'', '<ChevronUp className="h-4 w-4" />')
content = content.replace('â†"', '<ChevronDown className="h-4 w-4" />')

# Update className for reply button
content = re.sub(
    r'className="px-1 text-xs text-slate-500 transition hover:text-slate-700"\s+title="Reply"',
    'className="p-1 text-slate-500 transition hover:text-slate-700 disabled:opacity-50" title="Reply"',
    content
)

# Update className for react button
content = re.sub(
    r'className="px-1 text-xs text-slate-500 transition hover:text-slate-700"\s+title="React"',
    'className="p-1 text-slate-500 transition hover:text-slate-700 disabled:opacity-50" title="React"',
    content
)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print('Fixed all corrupted emojis in Chat.jsx')
