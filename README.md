# NostalGem

Retro cable TV from the public domain. 23 channels that run 24/7, with Westerns at the top of the dial,
plus serials, noir, creature features, cartoons, sitcoms, game shows, newsreels, Apollo films,
*The Computer Chronicles* and old-time radio. Everything streams from the
[Internet Archive](https://archive.org).

Like real broadcast TV, every channel follows a schedule set by the clock. Tune in and you join
whatever's already on, mid-scene, at the same moment as every other TV tuned to that channel.
Flip channels with the static and hiss. Check the guide. Fall asleep to *Gunsmoke*.

It's an original app in the spirit of channel-surfing sites like spelunkr.tv. It doesn't share their
code, branding or look.

## The lineup

| CH | Channel | What's on |
|---:|---|---|
| 1 | 🌵 **High Noon** | Western features, about 100 hours before a repeat |
| 2 | 🎸 **Singing Cowboys** | Roy Rogers, Gene Autry, Tex Ritter |
| 3 | 🐎 **Trail TV** | *The Lone Ranger*, *Bonanza*, *Annie Oakley*, *26 Men*, *Kit Carson* |
| 4 | 🔥 **Campfire Radio** | *Gunsmoke*, *The Six Shooter*, *Fort Laramie*, *Frontier Gentleman* |
| 5 | 💥 Cliffhangers | Saturday-matinee serials, a chapter at a time |
| 6 | 🕵️ Midnight Noir | Film noir |
| 7 | 🦇 Creature Feature | B-movie monsters and saucer men |
| 8 | 📺 Saturday Morning | Popeye, Betty Boop, Superman, Flip the Frog |
| 9 | 🎞️ Silent Era | Chaplin, Keaton and the first movie stars |
| 10 | 😂 Laugh Track | Stooges, screwball, slapstick |
| 11 | 🛋️ Rerun City | 1950s–60s sitcoms |
| 12 | 🎲 Game Night | *What's My Line*, *You Bet Your Life*, *Beat the Clock* |
| 13 | 🎤 Hit Parade | Variety hours, crooners, big bands |
| 14 | 💰 Commercial Break | Nothing but vintage ads |
| 15 | 🧪 Ephemera | Classroom, industrial and duck-and-cover films |
| 16 | 🗞️ Newsreel | Universal newsreels, 1929–1967 |
| 17 | 🚀 Mission Control | Mercury, Gemini, Apollo, Skylab, the Shuttle |
| 18 | 💾 Byte Size | *The Computer Chronicles* |
| 19 | 🌈 Pixel Dreams | Open-source animated shorts in HD |
| 20 | 🔎 Mystery Radio | *Yours Truly, Johnny Dollar*, *Dragnet* and more |
| 21 | 👽 Radio From Space | *X Minus One*, *Dimension X* |
| 22 | 📻 Comedy Radio | Jack Benny, *Our Miss Brooks*, Gildersleeve |
| 23 | 💬 Subtítulos | Classic films with Spanish subtitles. ¡A practicar! |

There are about 2,400 programs and 1,270 hours in all. From **Menu ▶ Add a channel** you can add more
with one button (*Bonanza*, *The Lone Ranger*, Duke Westerns, Hopalong Cassidy, Swashbucklers,
*Gunsmoke* radio, Popeye, Chaplin & Keaton, Méliès, Jack Benny, *Dragnet*, *X Minus One*), or type
any search and get a channel of it: *the shadow*, *kung fu*, *jazz*, *collection:prelinger*.

## What it does

- **Live, synchronized schedule.** Every TV agrees on what's on, with no server involved: the schedule
  is worked out from the clock. Programs have an 8-second station break between them with an "up next" card.
- **Channel surfing**: ▲▼, CH+/CH−, or type a number. There's TV snow and a hiss between channels
  (or just snow, or neither), and holding ▲ flips fast.
- **TV guide**: channels down the side and time across the top, with what's on later and a
  description of each program. OK tunes in.
- **Info banner**: title, year, episode, progress, time left, what's up next and the clock.
- **Pause and back to live.** Pausing time-shifts the program, "Start this program over" rewinds,
  and L (or the menu) rejoins live.
- **Radio channels** show an animated *ON THE AIR* card over the sunset.
- **Subtitles**: human-made subtitles first (English, Español or any language), then the Archive's
  auto-captions. The Subtítulos channel turns Spanish subtitles on by itself.
- **Favorites**: ★ a channel and set ▲▼ to surf only your favorites. You can also hide channels.
- **Sleep timer** (15–120 min) with a "this concludes our broadcast day" sign-off.
- **"Are you still watching?"** after four quiet hours, to save the Archive's bandwidth.
- **CRT effect** (off, light or heavy scanlines), **picture** (fit, fill or stretch), clock (12 or 24 hour),
  and a corner channel logo you can switch off.
- **It keeps going** when the Archive doesn't. A program that won't play is skipped on that TV for a
  day. If several fail in a row, it shows colour bars and *PLEASE STAND BY* and retries by itself.
- Sized for a TV across the room, inside overscan margins. It also works with a mouse, a keyboard,
  or a phone (swipe up/down to change channel).

## Put it on your TCL TV

First check which kind of TCL you have (look at the remote, or Settings ▸ About):

| You see | Your TV runs | What to do |
|---|---|---|
| A Google Assistant / mic button, Google TV home screen | **Google TV** (or Android TV) | Install the app (below) |
| An Alexa button, Fire TV home screen | **Fire TV** | Install the app (below); it's the same app |
| A Roku logo, purple Roku home screen | **Roku TV** | See [Roku](#roku-tv) |

### Google TV, Android TV and Fire TV: install the app

The app is a real TV app with its own tile on the home screen, and it works with the remote's
channel, play/pause, info, guide and coloured buttons.

1. **Make the APK once:** on GitHub, open **Actions ▸ Android TV app ▸ Run workflow** (leave
   *Publish a release* ticked). A few minutes later the repo has a release with `nostalgem.apk`.
2. **On the TV, turn on developer mode:** Settings ▸ System ▸ About ▸ click **Android TV OS build**
   seven times. (Fire TV: Settings ▸ My Fire TV ▸ About ▸ click the device name seven times.)
3. **Install Downloader** (by AFTVnews) from the TV's app store, then allow it to install apps:
   Settings ▸ Apps ▸ Security & restrictions ▸ Unknown sources ▸ Downloader (Fire TV: My Fire TV ▸
   Developer options ▸ Install unknown apps).
4. **In Downloader, enter:**
   `https://github.com/<you>/<repo>/releases/latest/download/nostalgem.apk`
   then choose **Install**. NostalGem appears in your apps. Move it to your favorites row.

To update, run the workflow again and reinstall with the same link. Your favorites and settings are kept.

> The APK is signed with a key kept in this repo (`android-tv/keystore/`), so new builds install over
> old ones. That's fine for your own TV. Publishing to the Play Store would need a private key instead.

### Any TV with a web browser, and phones, tablets and computers

Turn on GitHub Pages (Settings ▸ Pages ▸ Source: **GitHub Actions**) and the site is published at
`https://<you>.github.io/<repo>/` on every push to `main`. Open it in any browser and press OK or
click to turn the TV on. On a phone, "Add to Home Screen" opens it full screen like an app.

Google TV also has **Chromecast built in**: in desktop Chrome, open the site, then ⋮ ▸ Cast ▸ your TV.

### Roku TV

Roku can't run web pages or Android apps, so the app above won't install there. For now you can
mirror a phone or Windows PC to it (Roku supports screen mirroring). A native Roku channel would need
rewriting in Roku's own language (BrightScript), which would be a separate project. Ask if you'd like that next.

## Remote buttons

| Remote | Keyboard | Does |
|---|---|---|
| ▲ ▼ · CH+ CH− | ↑ ↓ · PgUp PgDn | Change channel |
| 0–9 | 0–9 | Go to a channel number |
| OK | Enter | Show / hide what's on |
| ◀ · Guide · Blue | ← · G | TV guide |
| ▶ · Menu | → · O | Menu |
| ▶❚❚ | Space · K | Pause / resume |
| | L | Back to live |
| Back | Esc | Close / back up. On the Android app, press twice to exit |
| Red | F | ★ Favorite this channel |
| Green · CC | C | Subtitles |
| Yellow | P | Previous channel |
| | M | Sound on / off |
| | H | Help |

### 📱 Phone remote

Typing a search with a TV remote is no fun, so your phone can be the remote instead. On the TV, open
**Menu ▸ 📱 Phone remote** and scan the QR code with your phone's camera (or open
`theupdoge.github.io/Nostalgem/remote` and type the six-character code). You get a D-pad, CH ▲▼, a
number pad, pause / live / mute, what's on now with a progress bar, a channel list you can tap, and a
real keyboard for **Search the Archive**.

- Nothing to install. To keep it handy, use your browser's **Add to Home Screen**; it opens like an app.
- It works with the Android TV app, a TV's web browser, or a computer plugged into or casting to the TV.
  Phone and TV don't need to be on the same Wi-Fi.
- The TV keeps its code, so a paired phone reconnects by itself after the TV restarts. **New code** in
  the same dialog disconnects every phone paired before; **Turn off** stops listening.
- The QR code points at the GitHub Pages copy, so turn on Pages first: Settings ▸ Pages ▸ Source: **GitHub Actions**.

## Make it yours

### Add or change channels

Channels are defined in [`web/data/channels.json`](web/data/channels.json). Each one is an
Internet Archive [advanced search](https://archive.org/advancedsearch.php) plus a few limits:

```json
{
  "number": 24, "slug": "spaghetti", "name": "Dollars Trilogy", "tagline": "A few films more",
  "icon": "🎺", "color": "#e07a5f", "kind": "video",
  "minMinutes": 60, "maxMinutes": 180, "maxItems": 40, "filesPerItem": 1,
  "sources": [{ "q": "collection:feature_films AND subject:\"spaghetti western\"", "rows": 60 }]
}
```

- `kind`: `video` (MP4) or `audio` (MP3, shown as radio).
- `filesPerItem`: how many episodes one Archive item (a whole series, or a collection) may add.
- `maxYear`: skip anything dated later. The default is 1977, because public-domain films are mostly
  from before 1978. Set `null` for sources that are free regardless of age (NASA, Creative Commons).
- `exclude`: words that keep a title off this channel. The global `exclude`, `excludeDescription`
  and `excludeFiles` lists keep adult titles, ripped commercial releases and a few hateful
  cartoons and films off every channel.

Then rebuild the lineup (Node 18+, needs internet):

```sh
npm run lineup                          # every channel, about 3 minutes
npm run lineup -- --only high-noon      # just one
npm run lineup -- --seed spring-2027    # same programs, new running order
```

That writes `web/data/lineup.json`, which is what the TV loads. Commit it and both the site and the
app pick it up.

### YouTube channels

A channel can also air full episodes from **official** YouTube channels (the studio's or distributor's own
uploads), played through YouTube's own embedded player. In `web/data/channels.json`, give it `youtube`
sources instead of Archive `sources`:

```json
"youtube": [
  { "handle": "@SomeOfficialChannel", "match": "episode|ep\\.? ?\\d", "exclude": "trailer|teaser", "order": "oldest" },
  { "playlist": "PLxxxxxxxx", "order": "playlist" }
]
```

Channels can share a number as **sub-channels**, like digital TV: give them the same `number` and a
`sub` (1, 2, …) and they show as 50-1, 50-2. On the remote, 5 0 1 tunes 50-1; 5 0 on its own goes to
the first one after a moment.

Only public, embeddable videos that aren't age-restricted, live, Shorts or blocked in the US go on the
air. Building them needs a YouTube Data API key: add it as the repository secret `YOUTUBE_API_KEY`
(Settings ▸ Secrets and variables ▸ Actions) and run **Actions ▸ Rebuild lineup**. That also runs every
Monday to pick up new uploads and drop removed ones. Locally: `YOUTUBE_API_KEY=… npm run lineup -- --youtube-only`.

### Run it locally

```sh
npm install
npm start                 # http://localhost:8080
npm test                  # schedule, remote, Archive parsing, subtitles, lineup checks, TV-browser syntax
npm i --no-save playwright@1.63.0 && npx playwright install chromium
npm run test:browser      # drives the app in Chromium with remote keys; SHOTS=1 saves screenshots
```

The browser test needs no network. Small local clips stand in for the Archive, and it checks
tuning, joining in progress, the guide, the menu, radio, pause and live, building a channel from a
search, the outage card, and phone and 960×540 TV layouts.

## How it works

```
web/
  index.html, css/app.css      the set: one <video>, overlays, the sunset scene
  js/schedule.js               the broadcast clock: program + offset for any moment, the same on every TV
  js/player.js                 the tuner: joins in progress, skips dead files, stands by during outages
  js/archive.js                Internet Archive client: search, pick the best MP4/MP3, subtitles, filters
  js/remote.js                 keys from keyboards, TV browsers (webOS/Tizen codes) and the Android app
  js/link.js                   phone remote pairing and messages (TV and phone side)
  remote.html, js/phone.js     the phone remote page (an installable PWA)
  vendor/                      PeerJS and a QR code generator, both MIT (see vendor/README.md)
  js/ui/                       banner, guide, menu, dialogs
  js/main.js                   wires it all together
  data/channels.json           channel definitions
  data/lineup.json             built programs (from tools/build-lineup.mjs)
android-tv/                    Kotlin WebView app for Google TV / Android TV / Fire TV
tools/build-lineup.mjs         builds the lineup from the Archive
tests/                         node:test unit tests + a Playwright smoke test
```

- **The schedule.** A channel is a loop of programs, each followed by a short break. The position in
  the loop is `(now − epoch + channel offset) mod loop length`, so the schedule needs nothing but a clock.
- **Playing.** Videos load with a `#t=` media fragment so they start near the live point, then seek to
  it exactly. The player corrects drift after buffering, waits out programs that run short, and reports
  files that won't play so they drop out of that channel for a day.
- **The Android app** bundles `web/` into the APK and serves it from a private https origin through
  `WebViewAssetLoader`, so it behaves exactly like the website. It adds the home-screen banner, keeps
  the screen on, and passes remote buttons the page can't see (CH±, media keys, Guide, Info,
  coloured keys, Back) to `window.NP`.
- **The phone remote.** The TV registers with the free PeerJS broker as `nostalgem-<code>`; the phone
  finds it there, and from then on the two talk directly over a WebRTC data channel (relayed through
  PeerJS's TURN server when a network won't allow a direct link). The phone sends the same actions a
  key press makes; the TV sends back what's on. Only whitelisted actions are accepted.
- **Older TVs.** The app sticks to ES2018 (a test enforces it), ships its own fonts, and uses no frameworks.

## About the programming

Everything plays straight from the Internet Archive. This project hosts no video. Most of it is in the
public domain or openly licensed, and the lineup builder tries hard to keep it that way. It skips
lending-library items, anything dated after 1977 (except NASA and Creative Commons sources), and
items whose files carry the fingerprints of ripped commercial releases. It also keeps adult titles
and a short list of notoriously hateful cartoons and films off the air. That filtering is a good-faith
effort, not a guarantee. If something shouldn't be on, add it to `exclude` in `channels.json` and
rebuild.

Some of these films are a century old and show the attitudes of their time.

If you enjoy it, please consider [donating to the Internet Archive](https://archive.org/donate).
Their bandwidth makes this work.

Fonts: [Orbitron](https://github.com/theleagueof/orbitron) and [VT323](https://fonts.google.com/specimen/VT323),
both under the SIL Open Font License (`web/fonts/OFL-*.txt`).
