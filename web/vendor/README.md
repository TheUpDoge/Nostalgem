# Vendored libraries

Copied in from npm so the web app and the Android TV app need no CDN. Both are MIT licensed.

| File | Package | Notes |
| --- | --- | --- |
| `peerjs.min.js` | [peerjs](https://github.com/peers/peerjs) 1.5.5 (`dist/peerjs.min.js`) | Re-minified to ES2018 for older TV browsers: `npx esbuild@0.24.2 peerjs.min.js --target=es2018 --minify`. License: `LICENSE-peerjs.txt`. |
| `qrcode.js` | [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) 1.4.4 (`qrcode.js`) | Unchanged; the license is in its header. |

Both load only when needed: the TV loads them when the phone remote is on, the phone page loads PeerJS.
The phone remote uses the free public PeerJS broker (0.peerjs.com) only to introduce the phone and the
TV. Button presses then go over a direct WebRTC data channel.
