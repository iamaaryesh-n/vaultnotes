const fs = require('fs');
let c = fs.readFileSync('src/App.jsx', 'utf8');

// Find the exact line we want to insert after
const ANCHOR = '  useEffect(() => initializeTheme(), [])';
const INSERT = [
  '',
  '  // Signal the HTML splash screen to dismiss once auth has resolved',
  '  const splashDismissedRef = useRef(false)',
  '  useEffect(() => {',
  '    if (authLoading) return',
  '    if (splashDismissedRef.current) return',
  '    splashDismissedRef.current = true',
  '    window.dispatchEvent(new Event("splash:ready"))',
  '  }, [authLoading])',
].join('\r\n');

if (c.includes(ANCHOR)) {
  c = c.replace(ANCHOR, ANCHOR + INSERT);
  fs.writeFileSync('src/App.jsx', c);
  console.log('Done — splash:ready dispatch added');
} else {
  console.log('ANCHOR NOT FOUND');
  const idx = c.indexOf('initializeTheme()');
  console.log('Context:', JSON.stringify(c.slice(Math.max(0, idx - 30), idx + 80)));
}
