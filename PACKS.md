# Channel packs

A channel pack is a small JSON file that adds channels on your own TV, without touching
the shipped lineup. From the Menu: **Load a channel pack**, then choose a `.json` file (or a
`.zip` of them) or paste its text. Everything happens on your TV — no upload, no server.

On a TV with no file picker, send it from your phone: the phone remote's **Channels** page has
**📦 Send a pack to the TV**. The file goes straight to the TV over the remote's own link and
through the same checks and the same **Load these packs?** screen; the phone shows what the TV
found, packs left out and why included.

Pack channels land on **CH 30–49** or in the hundreds, **CH 100–199**, and are saved on that
TV only, exactly like channels you add by search (Menu ▸ Add a channel). Every built-in channel
stays under 99 (built-ins 1–29, viewer-added 30–49, YouTube sub-channels 50–90), so the
hundreds are for packs. Loading a pack never changes
[`web/data/lineup.json`](web/data/lineup.json), and re-loading the same pack skips the
channels that are already on the TV.

## The format

```json
{
  "pack": "Nostalgem example pack",
  "version": 1,
  "channels": [
    {
      "name": "High Noon (Example)",
      "number": 30,
      "kind": "video",
      "tagline": "Western features, sunup to sundown — example pack",
      "icon": "🌵",
      "color": "#ff9f1c",
      "minMinutes": 45,
      "maxMinutes": 150,
      "maxItems": 25,
      "filesPerItem": 1,
      "sources": [
        { "q": "collection:feature_films AND subject:western AND mediatype:movies", "rows": 60 }
      ]
    }
  ]
}
```

See [`packs/example-pack.json`](packs/example-pack.json) — one channel built from the same
Archive query as CH 1 High Noon (western features, public domain). Load it to see a pack
work, then delete the channel from Menu ▸ Channel lineup if you don't want it.

### Pack fields

- `pack` — the pack's name, shown while it loads. Required.
- `version` — must be `1`. Required.
- `channels` — one or more channels, at most 20 per pack. Required.

### Channel fields

- `name` — shown on the dial. Required. Over 24 characters it is trimmed (with a warning).
- `number` — the channel number, a whole number from **30 to 49** or **100 to 199**.
  Required, and each number may appear once per pack. If the number is already taken on the
  TV, the channel takes the next free number after it in the same range (then the other range)
  instead, and the TV says so. Taken includes what typing a number reaches: **111** is a secret
  station, and **152** and **172** are how CH 15-2 and CH 17-2 are typed, so a pack asking for one
  of those moves along too. A three-digit channel reads as itself on the TV: typing 1 0 1 shows
  **CH 101**.
- `kind` — `"video"` (MP4) or `"audio"` (MP3, shown as radio). Default `"video"`.
- `tagline`, `icon`, `color` — as in `web/data/channels.json`. `color` should look like `#ff9f1c`.
- `minMinutes`, `maxMinutes` — programs shorter or longer than these are left out.
  Defaults 2 (video) or 5 (audio), and 240.
- `maxItems` — at most this many programs on the channel. Default 50. Under 25, the loader
  warns that the channel will be thin.
- `filesPerItem` — how many programs one Archive item may add. Default 8. An item that holds
  many files (a whole series in one upload) needs this raised, or only its longest program
  airs.
- `exclude` — words that keep a title off this channel. Optional.
- `maxYear` — skip anything dated later. Optional; the app's default (1977) applies otherwise.

### Sources

Each channel lists at least one source. A source is either a search or an item list — never both:

```json
{ "q": "collection:prelinger AND mediatype:movies", "rows": 60, "sort": "downloads desc" }
{ "items": ["identifier-one", "identifier-two"] }
```

- `q` — an [Internet Archive advanced search](https://archive.org/advancedsearch.php).
  `rows` (1–100) caps how many items the search returns; under 25, the loader warns the
  channel may come out thin. A search with no `collection:`, `identifier:` or `mediatype:`
  also warns — it still works, but results may vary.
- `items` — explicit Archive item IDs (at most 50 per source). The channel is built straight
  from those items' files.

### What packs may not do

Packs point at the Internet Archive and nothing else. The loader rejects a pack that has:

- a number outside 30–49 and 100–199, a duplicate number, or a missing name;
- a source that is a link (`http://…`, `https://…`), a YouTube or other video-site address,
  or a `url` / `youtube` / `playlist` field;
- an item ID with spaces, slashes or anything that isn't an Archive identifier.

A pack is loaded or it isn't — a rejected pack adds nothing, and the TV says why.

## Several packs in a .zip

Packs can travel together: zip them up and choose the `.zip`. Every `.json` file in it is read, in
folders or not, as a pack or as a skip-list file (`nostalgem-skip-lists/1`, below), and they all show
on one "Load these packs?" screen. A file that doesn't check out is listed there with what's wrong and
left out; the rest load together, one channel after another (a number one pack took moves the next
one's channel along). Other files (a README, pictures) and macOS's `__MACOSX` copies are ignored.

Any zip tool's usual settings work: files stored or deflated. Not read: password-protected zips, ZIP64,
and zips split into parts. A zip may hold up to 200 `.json` files and unpack to 8 MB in all.

## Clean cuts in a pack

A pack can also carry **clean cuts**: scenes in its films that the player keeps off the screen without
touching the file. Add a `skipLists` section, either a list of lists or the whole skip-list file:

```json
"skipLists": {
  "format": "nostalgem-skip-lists/1",
  "mode": "card",
  "lists": [
    {
      "item": "<archive item id>",
      "file": "<file name, optional: when the item holds several>",
      "title": "<for people>",
      "mode": "skip",
      "enabled": true,
      "skips": [{ "start": 1234.5, "end": 1267, "reason": "sex-scene", "note": "<one sentence>" }]
    }
  ]
}
```

- **Sexual content only.** `reason` is one of `sexual-assault`, `attempted-sexual-assault`,
  `sexual-violence`, `sexualized-minor`, `nudity-sexualized`, `sex-scene`, `sexual-content`. Gore and
  violence are never cut: a list with any other reason is refused, and so is the pack.
- `start` and `end` are seconds into **that file**. Take them from a real viewing pass of the Archive's
  copy — the same scene sits at different times in different cuts — and never guess them.
- `mode`: `"card"` covers the scene with a full-screen card (`cardText`, default *EXTREMELY GRAPHIC
  SCENE IS PLAYING*) and cuts the sound while the film plays on; it works everywhere, live channels
  included. `"skip"` jumps over the scene, on Video Club tapes only, when the viewer has turned the tape's
  *TV-safe cut* on (a tape plays as it is until then);
  live, the card is used instead, so the clock never slips.
- A pack can be only clean cuts, with no `channels`. Lists are kept on this TV; a newer list for the same
  film replaces the older one. The app's own lists are `web/data/skip-lists.json` (none yet).

## Shipped packs

- [`packs/1980s-sci-fi-pd.json`](packs/1980s-sci-fi-pd.json) — **1980s Sci-Fi — Public Domain**: 33 public-domain sci-fi features (1944–1965) on CH 30, from Plan 9 to The Brain That Wouldn't Die, plus 45 Shuttle-era NASA / space-age films (1980–1989) on CH 31. Every item ID was checked live against the Archive; the evidence for each film is listed in `packs/BUILD-REPORT.md`.
- [`packs/1990s-horror-pd.json`](packs/1990s-horror-pd.json) — **1990s Horror — Public Domain**: 36 public-domain horror features (1919–1968) on CH 32, including Night of the Living Dead (1968) and the 1960 Little Shop of Horrors. Same live check; evidence in `packs/BUILD-REPORT.md`.
- [`web/data/library-catalog.json`](web/data/library-catalog.json) — **the club's library catalog**: 59 public-domain books and 8 Golden Age comics from the Archive. The app reads it: they're the Reading Room's catalog shelves, read in its own reader (the manga shelf is empty and says why — no verifiably public-domain manga was found).

Load either pack from Menu ▸ Load a channel pack. Each film channel is all features (40 minutes or more), so it becomes a Video Club shelf on its own — any film on it can be checked out like a tape. Neither pack holds 1980s/90s features: those are still under copyright, so they can't ship in a public pack.

## Your choice, your TV

A pack is your choice on your own TV. The built-in lineup stays public-domain Archive
material, checked before it ships. Anything you load by pack is not part of the shipped
lineup, and a note in a pack file doesn't change the copyright status of what's in it.
