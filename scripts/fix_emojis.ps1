$filePath = 'D:\Projects\VaultNotes\src\pages\Chat.jsx'
$content = Get-Content -Path $filePath -Raw

# Replace reply emoji
$content = $content -replace [regex]::Escape('â†©ï¸'), '<Reply className="h-4 w-4" />'

# Replace smile/react emoji
$content = $content -replace [regex]::Escape('ðŸ™‚'), '<SmilePlus className="h-4 w-4" />'

# Replace menu emoji
$content = $content -replace [regex]::Escape('â‹¯'), '<MoreHorizontal className="h-4 w-4" />'

# Replace up arrow
$content = $content -replace [regex]::Escape('â†''), '<ChevronUp className="h-4 w-4" />'

# Replace down arrow
$content = $content -replace [regex]::Escape('â†"'), '<ChevronDown className="h-4 w-4" />'

# Update className for reply button
$content = $content -replace 'className="px-1 text-xs text-slate-500 transition hover:text-slate-700"\s+title="Reply"', 'className="p-1 text-slate-500 transition hover:text-slate-700 disabled:opacity-50" title="Reply"'

# Update className for react button
$content = $content -replace 'className="px-1 text-xs text-slate-500 transition hover:text-slate-700"\s+title="React"', 'className="p-1 text-slate-500 transition hover:text-slate-700 disabled:opacity-50" title="React"'

# Update className for menu button (if it has specific styles)
$content = $content -replace 'className="px-1 text-xs text-slate-500 transition hover:text-slate-700"\s+title="More actions"', 'className="p-1 text-slate-500 transition hover:text-slate-700" title="More actions"'

Set-Content -Path $filePath -Value $content
Write-Host "Fixed emojis in Chat.jsx"
