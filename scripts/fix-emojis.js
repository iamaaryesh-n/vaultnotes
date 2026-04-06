const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'pages', 'Chat.jsx');
let content = fs.readFileSync(filePath, 'utf8');

// Replace corrupted emojis
content = content.replace(/ðŸ"· Photo/g, '📷 Photo');
content = content.replace(/ðŸ"Ž File/g, '📄 File');
content = content.replace(/â†©ï¸/g, '<Reply className="h-4 w-4" />');
content = content.replace(/ðŸ™‚/g, '<SmilePlus className="h-4 w-4" />');
content = content.replace(/â​¯/g, '<MoreHorizontal className="h-4 w-4" />');
content = content.replace(/â†'/g, '<ChevronUp className="h-4 w-4" />');
content = content.replace(/â†"/g, '<ChevronDown className="h-4 w-4" />');

// Update className for buttons
content = content.replace(
  /className="px-1 text-xs text-slate-500 transition hover:text-slate-700"\s+title="Reply"/g,
  'className="p-1 text-slate-500 transition hover:text-slate-700 disabled:opacity-50" title="Reply"'
);

content = content.replace(
  /className="px-1 text-xs text-slate-500 transition hover:text-slate-700"\s+title="React"/g,
  'className="p-1 text-slate-500 transition hover:text-slate-700 disabled:opacity-50" title="React"'
);

fs.writeFileSync(filePath, content, 'utf8');
console.log('✓ Fixed all corrupted emojis in Chat.jsx');
