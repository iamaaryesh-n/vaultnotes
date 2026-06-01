const fs = require('fs');
let c = fs.readFileSync('index.html', 'utf8');

const OLD = '<script type="module" src="/src/main.jsx"></script>\r\n  </body>';

const dismissScript = [
  '    <script>',
  '      /* Dismiss the splash when React signals ready, or after 1.2 s max */',
  '      (function () {',
  '        var MIN_MS = 1000;',
  '        var MAX_MS = 1200;',
  '        var start = Date.now();',
  '        var dismissed = false;',
  '        function dismiss() {',
  '          if (dismissed) return;',
  '          dismissed = true;',
  '          var splash = document.getElementById("vn-splash");',
  '          if (!splash) return;',
  '          var elapsed = Date.now() - start;',
  '          var delay = Math.max(0, MIN_MS - elapsed);',
  '          setTimeout(function () {',
  '            splash.classList.add("vn-splash--hidden");',
  '            setTimeout(function () { splash.remove(); }, 370);',
  '          }, delay);',
  '        }',
  '        window.addEventListener("splash:ready", dismiss);',
  '        setTimeout(dismiss, MAX_MS);',
  '      })();',
  '    </script>',
].join('\r\n');

const NEW = '<script type="module" src="/src/main.jsx"></script>\r\n' + dismissScript + '\r\n  </body>';

if (c.includes(OLD)) {
  fs.writeFileSync('index.html', c.replace(OLD, NEW));
  console.log('Done');
} else {
  console.log('NOT FOUND — dumping end of file:');
  console.log(JSON.stringify(c.slice(-300)));
}
