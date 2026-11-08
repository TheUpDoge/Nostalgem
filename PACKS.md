# Channel packs

A channel pack is a small JSON file that adds channels on your own TV, without touching
the shipped lineup. From the Menu: **Load a channel pack**, then choose a `.json` file or
paste its text. Everything happens on your TV — no upload, no server.

Pack channels land on **CH 30–49** and are saved on that TV only, exactly like channels
you add by search (Menu ▸ Add a channel). Loading a pack never changes
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
- `number` — the channel number, a whole number from **30 to 49** (the viewer-added range).
  Required, and each number may appear once per pack. If the number is already taken on the
  TV, the channel takes the next free number in 30–49 instead.
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

- a number outside 30–49, a duplicate number, or a missing name;
- a source that is a link (`http://…`, `https://…`), a YouTube or other video-site address,
  or a `url` / `youtube` / `playlist` field;
- an item ID with spaces, slashes or anything that isn't an Archive identifier.

A pack is loaded or it isn't — a rejected pack adds nothing, and the TV says why.

## Shipped packs

- [`packs/1980s-sci-fi-pd.json`](packs/1980s-sci-fi-pd.json) — **1980s Sci-Fi — Public Domain**: 33 public-domain sci-fi features (1944–1965) on CH 30, from Plan 9 to The Brain That Wouldn't Die, plus 45 Shuttle-era NASA / space-age films (1980–1989) on CH 31. Every item ID was checked live against the Archive; the evidence for each film is listed in `packs/BUILD-REPORT.md`.
- [`packs/1990s-horror-pd.json`](packs/1990s-horror-pd.json) — **1990s Horror — Public Domain**: 36 public-domain horror features (1919–1968) on CH 32, including Night of the Living Dead (1968) and the 1960 Little Shop of Horrors. Same live check; evidence in `packs/BUILD-REPORT.md`.
- [`packs/library-catalog.json`](packs/library-catalog.json) — **Video Club library catalog**: 59 public-domain books and 8 Golden Age comics from the Archive, as a link-out list for the club's reading shelf (manga shelf is empty — no verifiably public-domain manga was found).

Load either pack from Menu ▸ Load a channel pack. Each film channel is all features (40 minutes or more), so it becomes a Video Club shelf on its own — any film on it can be checked out like a tape. Neither pack holds 1980s/90s features: those are still under copyright, so they can't ship in a public pack.

## Your choice, your TV

A pack is your choice on your own TV. The built-in lineup stays public-domain Archive
material, checked before it ships. Anything you load by pack is not part of the shipped
lineup, and a note in a pack file doesn't change the copyright status of what's in it.
