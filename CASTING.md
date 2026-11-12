# Casting from a phone: what to build

**Decided and built.** This began as a recommendation (work order 2026-11-08, Task 5). Mitchel picked
**Option B, Send to TV**, on 2026-11-09, and it shipped in 1.17.0: see
[What was built](#what-was-built-1170) at the end. The comparison is kept as the record of why.

## The short answer

**Build "Send to TV" on the phone remote**: the phone tells NostalGem what to play, over the link the
remote already has (direct, or through the relay). It works with every NostalGem TV and every phone,
with nothing to install, no fees and no new code from anyone else. It's also what "cast" means here:
the phone picks something and the TV plays it, inside NostalGem.

Google Cast would add the familiar Cast button, but only in Chrome, only on TVs with Cast built in (not
Fire TV, not Roku), only by loading Google's SDK on the phone and the TV (the app has no outside
dependencies today), and only after a paid developer registration. Even then a Cast session replaces
NostalGem on the TV instead of playing inside it.

## Three things "casting" can mean

1. **Mirroring the phone's screen.** The phone's own system already does this: on Android, Quick Settings
   ▸ Cast or Screen cast (to a Chromecast or Google TV); on an iPhone, Screen Mirroring (to an AirPlay TV).
   A web page can't: Android's browsers have no screen capture at all (`getDisplayMedia` isn't available
   in Chrome, Firefox or Samsung Internet on Android). **Not ours to build.** A line in the README saying
   how is enough.
2. **Sending a video to the TV**: a YouTube or archive.org link, or a show found on the phone. This is
   what people mostly mean. It can go through Google Cast (option A) or through NostalGem's own link
   (option B).
3. **Playing a file stored on the phone.** Possible over a direct WebRTC link (not through the relay), but
   it's a lot of work for little gain on a public-domain TV. **Leave it out.**

## Option A: Google Cast (Chromecast)

**What it needs**

- **On the phone:** Google's Cast sender SDK (`cast_sender.js`, loaded from Google) in the remote page.
  That's a new outside dependency in an app that has none. It only works in Chrome (Android and desktop):
  not on iPhones (Cast on iOS needs a native app), and not in Firefox.
  - A lighter variant, the browser's Remote Playback API, can send one `<video>` to a Chromecast from
    Chrome on Android without the SDK, but it plays a single media file in Google's player. It's not
    NostalGem, and browser support is limited.
- **On the TV:** one of two receivers.
  - Google's **Default Media Receiver**: no registration, but it plays one MP4, MP3 or HLS link in
    Google's player. No channels, looks, captions or remote.
  - A **Custom Web Receiver**: NostalGem rebuilt as a Cast receiver page with Google's receiver SDK. It
    must be registered in the Google Cast Developer Console: a one-time $5 developer account (up to
    48 hours to process). Each test TV is registered by serial number until the app is published.
- **TVs:** Chromecast, and Google TV and Android TV sets (Cast is built in). **Not** Fire TV (no Google
  Cast), Roku, or the webOS and Tizen browsers.

**What it can't do**

- Play inside the NostalGem TV app: a Cast session starts Google's receiver, and the TV leaves NostalGem.
- Carry the phone remote over: pairing, the Mouse page and packs don't apply in a Cast session.
- Anything for iPhone users in a browser.

**Effort:** medium to build (sender UI, a receiver page, the console setup), plus keeping up with Google's
SDK.

## Option B: Send to TV over the phone remote's link (recommended)

**What it is:** the phone tells the NostalGem TV what to play, and the TV plays it in NostalGem, with
its looks, captions and the remote, the phone included.

**What to build**

1. **Phone:** a **Send to TV** box on the remote. Paste or type a link (an archive.org item or collection,
   a YouTube video or playlist), or pick a result from the phone's Search tab. It's one new message,
   `{ t: "play", url }`, checked like the others (`link.js`).
2. **TV:** plays it right away, **on demand**, the way Video Club tapes and "watch from the start"
   already do. It's off the shared clock, so live channels are untouched. Pause and seek work from the
   phone (a seek bar on the Now card), and BACK returns to the channel you were on.
   - Archive links go through the same picker as Search the Archive: the best MP4 or MP3, subtitles,
     and the lending and adult filters.
   - YouTube links go through the existing player (embeddable videos only, as now).
3. **Android phones:** the installed remote (Add to Home Screen) shows up in the phone's **Share** menu
   (a Web Share Target). Share a video from the YouTube app or archive.org, and it goes to the TV.
   iPhones can't do this (Safari has no share targets), so there you paste the link.

**What it needs:** nothing new: the same pairing, direct or through the encrypted relay. No SDK, no fees,
no registration.

**What it can't do**

- Mirror the phone's screen (meaning 1 above).
- Play files stored on the phone (meaning 3 above).
- Appear under other apps' Cast buttons: the YouTube app's Cast button only lists Cast devices.
- Play YouTube videos that refuse to be embedded, or Archive items that are lending-library only.

**Effort:** small to medium. It reuses `link.js`, `phone.js` and `main.js`, the on-demand player
Video Club tapes use, and the tests' stand-ins (fake PeerJS, the local relay broker).

## Side by side

| | A. Google Cast | B. Send to TV (the remote's link) |
|---|---|---|
| TVs | Chromecast, Google TV and Android TV | Every NostalGem TV: the TV app (Google TV, Android TV, Fire TV), TV browsers, computers |
| Phones | Chrome on Android | Any phone browser: Android and iPhone |
| Plays inside NostalGem | No: Google's receiver, or a separate receiver page we'd build | Yes |
| New dependencies | Google's Cast SDK, phone and TV | None |
| Setup | $5 Cast developer account, a registered receiver, registered test TVs | None |
| Phone and TV on different networks | No (same network) | Yes (the relay) |
| From other apps | Their Cast button | Android: the Share menu (installed remote). iPhone: paste the link |

## Recommendation

Build **B** in two steps:

1. **Send to TV:** a link pasted or typed on the phone, played on demand on the TV, with pause and seek
   from the phone and BACK to the channel.
2. **Share to NostalGem** on Android (share target), and **Send to TV** on the phone's Search results.

Come back to **A** only if the Cast button on Chromecasts is wanted for its own sake. It would bring
Google's SDK into a zero-dependency app, it needs the $5 registration, and Fire TV and iPhone users would
still need B.

## What was built (1.17.0)

Option B, both steps. How to use it is in the README under **📲 Send to TV**.

1. **Send to TV.** The phone remote's Search page has a Send to TV box. A link goes to the TV as
   `{ t: "play", url }`, the TV plays it on demand on the channel it was on, and the phone that sent it
   hears how it went (`{ t: "sent", state, text }`). The phone's Now card gets a bar to drag
   (`{ t: "seek", to }`), ⏪ ⏩ (`{ t: "seek", by }`) and ⏮ ⏭ for parts (`{ t: "queue", go }`). BACK
   on any remote goes back to the channel.
2. **Share and search.** The remote's manifest is a share target, so on Android the installed remote
   is in the Share menu. 🌐 Search the Archive on the phone lists films and recordings, and a tap sends one.

Where it differs from the plan above:

- **A collection or a search link isn't played.** It's a channel's worth, so the phone offers
  📡 New TV channel, which already builds one from a link.
- **A shared link waits for one tap.** It lands in the box and never plays by itself. Otherwise any page
  could link to the remote with a video in the address and start it on a paired TV.
- **The seek bar works for everything on demand**, Video Club tapes and "watch from the start" included.
  It does nothing on a live channel: the shared clock isn't the phone's to move.
- **An item in parts, or a playlist, plays one after the other** (up to 60). One that won't play is
  skipped for the next.
- **Only two filters apply to a sent link:** members-only items (they can't play), and adult material
  (the sexual words of the lineup's leave-out lists). The year cap and the trailer and rip words that
  channel builds use don't apply to a link somebody chose to send.
- **A YouTube playlist is read with YouTube's own player**, with no key and no sign-in, so only playlists
  anyone may watch. Mixes, Watch later and Liked can't be sent; the video itself still can.

The code: `web/js/sendto.js` (which links count, and what an Archive item becomes), `web/js/main.js`
(the "Send to TV" section), `web/js/phone.js`, `web/js/player.js` (on-demand programs of unknown length,
seeking, the next in line), `web/js/youtube.js` (a video's title, a playlist's videos). Tests:
`tests/sendto.test.mjs` and `tests/sendto.browser.mjs`.

## Sources

- Google Cast, registration: <https://developers.google.com/cast/docs/registration>
- Google Cast developer fee: <https://support.google.com/cast-developer/answer/4512496>
- Remote Playback API (MDN): <https://developer.mozilla.org/en-US/docs/Web/API/Remote_Playback_API>
- Screen sharing from Android browsers (no `getDisplayMedia`): <https://www.forasoft.com/blog/article/android-webrtc-screen-sharing>
- Web Share Target (Chrome): <https://developer.chrome.com/docs/capabilities/web-apis/web-share-target>
- Web Share Target in Safari (open since 2019): <https://bugs.webkit.org/show_bug.cgi?id=194593>
