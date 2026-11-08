# NostalGem Video Club — pack build report

Branch: `nova/video-club-packs` · Date: 2026-11-07/08 · Built by Nova

Two tracks. **Track A** (this repo, public-domain only) is in `packs/`. **Track B**
(personal packs for the owner's own TV, copyrighted titles included) lives outside the
repo at `~/workspace/nostalgem-packs-personal/` and is never committed. A note in a
pack file does not change the copyright status of anything in it, and the library
card / checkout framing is experience flavor, not a rights mechanism.

## Track A — repo-shippable, verified public domain

### Packs

| Pack | Channels | Items | What it is |
|---|---|---|---|
| `packs/1980s-sci-fi-pd.json` | CH 30 PD Sci-Fi Features, CH 31 Shuttle-Era Space | 33 + 45 = 78 | PD sci-fi features (1944–1965) + 1980s NASA/space-age films |
| `packs/1990s-horror-pd.json` | CH 32 Drive-In Horror | 36 | PD horror features (1919–1968) |
| `packs/library-catalog.json` | — (link-out catalog) | 67 entries | 59 PD books + 8 Golden Age comics; manga shelf empty (see below) |

Every item ID was verified live against the Archive metadata API (exists, playable
video ≥40 min for features / ≥10 min for the space channel, viewable text files for
books/comics, not lending-restricted). The earlier Video Club draft packs
(`video-club-sci-fi.json`, `video-club-horror.json`, commit `4ad5889`) were folded
into these packs: all 38 of their IDs re-verified live (38/38 playable, all carrying
a PD mark), the 15 titles not already covered were merged in, and the drafts were
removed — they both used CH 30, which would have collided, and one note wrongly
pointed at a YouTube route the pack loader cannot use.

### CH 30 — PD Sci-Fi Features (33 films)

Evidence legs: (A) on Wikipedia's "List of films in the public domain in the
United States", (B) the film's Wikipedia article states it is public domain,
(C) published before 1930, (D) PD mark / PD license on the Archive item.

- Teenagers from Outer Space (1959) — A + D
- Santa Claus Conquers the Martians (1964) — A + B
- The Brain That Wouldn't Die (1962) — A + B + D
- The Phantom Planet (1961) — B + D
- The Killer Shrews (1959) — B + D
- The Wasp Woman (1960) — A + B + D
- The Giant Gila Monster (1959) — B + D
- The Hideous Sun Demon (1958) — D
- Cat Women of the Moon (1953) — D
- Killers from Space (1954) — D
- The Snow Creature (1954) — D
- Earth vs. the Spider (1958) — D
- The Monster Maker (1944) — B + D
- The Human Duplicators (1965) — D
- The Creeping Terror (1964) — D
- The Amazing Colossal Man (1957; item metadata wrongly says 1967) — D
- Plan 9 from Outer Space (1957) — A (film PD; this upload carries a CC BY-NC-ND tag)
- Attack of the Giant Leeches (1959) — A + D
- The Indestructible Man (1956; colorized 4K upload) — A
- The Alligator People (1959) — D
- The Phantom from 10,000 Leagues (1955) — B + D
- The Atomic Brain (1964) — D (PD license)
- The Last Woman on Earth (1960) — D (PD license)
- The Beast of Yucca Flats (1961) — D (PD license)
- Assignment Outer Space (1960) — D
- First Spaceship on Venus (1960) — D
- Phantom from Space (1953) — D
- Unknown World (1951) — D
- Evil Brain from Outer Space (1964) — D
- Warning from Space (1956) — D
- The Amazing Transparent Man (1960) — D
- Atom Age Vampire (1960) — D
- Bela Lugosi Meets a Brooklyn Gorilla (1952) — D

### CH 31 — Shuttle-Era Space (45 films)

1980s NASA / space-age educational films from the A/V Geeks collection (US-government
and public-domain educational material, 1980–1989): Apollo 11 gala and crew
interviews, the full "25 Years of Progress" series, "Journey Through the Solar
System", Voyager 2 Neptune/Saturn encounters, the Shuttle as a "remarkable flying
machine", Life on Mars (1983), the Gaia hypothesis, comet Halley, Jupiter Odyssey,
and more. 67 candidates were checked; 45 made the cut (min 10 minutes, no duplicate
episodes, no postflight press conferences). Evidence: A/V Geeks collection +
NASA-produced series + 1980–89 dates; these items carry no license tag on the
Archive, which is normal for the collection.

### CH 32 — Drive-In Horror (36 films)

- Night of the Living Dead (1968) — A + B + D
- Carnival of Souls (1962) — A + B + D
- The Last Man on Earth (1964; colorized 4K upload) — A
- House on Haunted Hill (1959) — D (famously PD)
- Little Shop of Horrors (1960) — B (never copyrighted)
- A Bucket of Blood (1959) — A + B + D
- The Terror (1963) — A + B + D
- The Screaming Skull (1958) — A + B + D
- The Bat (1959) — A + B + D
- White Zombie (1932) — A + D
- The Devil Bat (1940) — A + B + D
- Nosferatu (1922) — C + B + D
- The Cabinet of Dr. Caligari (1919) — C + D
- Häxan (1922) — C + D
- The Golem (1920) — C + D
- The Phantom of the Opera (1925) — C + B + D
- The Monster Walks (1932) — B (copyright lapsed) + D
- The Vampire Bat (1933) — B + D
- The Thirteenth Guest (1932) — D
- The Death Kiss (1932) — B + D
- The Ape Man (1943) — B + D
- The Corpse Vanishes (1942) — B + D
- Bowery at Midnight (1942) — A + D
- The Mad Monster (1942) — B + D
- The Black Raven (1943) — D
- The Devil's Daughter (1939) — D
- Maniac (1934) — A + B + D
- Bride of a Gorilla (1951) — B + D
- The Living Ghost (1942) — D (PD license)
- Dementia 13 (1963) — A + B
- Bloody Pit of Horror (1965) — D
- Horror Hotel / City of the Dead (1960) — D
- King of the Zombies (1941) — D
- Creature from the Haunted Sea (1961) — D
- The Ghost Train (1941) — D
- Dead Men Walk (1943) — D

### Library catalog — 67 entries

- **Books (59):** public-domain editions, 1800–1929. Frankenstein (1818), Dracula
  (1897), The Time Machine (1895), The War of the Worlds (1898), The Invisible Man,
  The Island of Doctor Moreau, Twenty Thousand Leagues Under the Seas, Journey to
  the Centre of the Earth, The Picture of Dorian Gray, Sherlock Holmes, Alice's
  Adventures in Wonderland, The Great Gatsby (1925), The Call of Cthulhu (1928),
  The Dunwich Horror (1929), The Hound of the Baskervilles, The Turn of the Screw,
  The Legend of Sleepy Hollow, The Wonderful Wizard of Oz, The Secret Garden,
  A Christmas Carol, Moby-Dick, The Scarlet Letter, Little Women (1868), Jane Eyre,
  Wuthering Heights, Pride and Prejudice, The Count of Monte-Cristo, The Three
  Musketeers, Around the World in Eighty Days, Treasure Island, Dr. Jekyll and
  Mr. Hyde, The Lost World, Winnie-the-Pooh (1926), Mrs. Dalloway (1925), The Sun
  Also Rises (1926), The Velveteen Rabbit, The Call of the Wild, White Fang, The
  Jungle Book, The First Men in the Moon, The Food of the Gods, The Hunchback of
  Notre-Dame, Les Misérables (1862, French text), The Mysterious Island, Tom Sawyer,
  Huckleberry Finn, Walden, Leaves of Grass, Grimm's Fairy Tales, The Yellow
  Wallpaper, The Raven, The Fall of the House of Usher, The Moon Pool, The Night
  Land, The King in Yellow, The Phantom of the Opera, The Man Who Was Thursday,
  The Scarlet Plague, The Iron Heel. 59/59 verified live (one transient read timeout
  on Little Women, re-verified clean).
- **Comics (8):** Golden Age comics carrying a PD mark — Daredevil Comics #1
  (Lev Gleason, 1941), Jumbo Comics #105 (Fiction House, 1947), Shadow Comics
  v1–v2 (1940), Crack Comics #40, Air Fighters v2 #2 / Airboy (1943), Silver Streak
  Comics (Lev Gleason), Comics Novel #1: Anarcho, Dictator of Death (1947),
  Adventures Inside the Atom (General Electric, 1948). 19/19 Golden Age candidates
  verified technically; the 11 without a PD mark (Planet Comics, Doc Savage, Blue
  Beetle, Science Comics, Space Adventures, Mystic, Exciting Comics, Bulletman,
  America's Greatest Comics, Special Edition Comics, Four Tenners) are in the
  personal catalog (Track B) with provenance notes, not here.
- **Manga (0):** the lane is empty, on purpose. The Archive's manga holdings are
  overwhelmingly copyrighted scanlations; the PD/CC-license searches returned only
  scanlations with self-asserted tags (Boruto, Sailor Moon Super R, Pokémon
  Adventures, Azumanga Daioh, Chiikawa) — a uploader's tag does not make a
  commercial manga public domain (same trap as the Gods Gun case). No verifiably
  PD/CC manga was found.

### What was excluded from Track A, and why

- **Famous 1980s sci-fi features** (Back to the Future, Blade Runner, Aliens, The
  Terminator, E.T., Star Wars, RoboCop, Predator, The Thing, Tron, Dune, Ghostbusters,
  Gremlins, The Fly, Flash Gordon, etc.) — under copyright; they are Track B, not
  the public repo.
- **Famous 1990s horror features** (Scream, I Know What You Did Last Summer, The
  Blair Witch Project, The Sixth Sense, Candyman, The Craft, Interview with the
  Vampire, etc.) — under copyright; Track B.
- **Studio horror of the 1930s–40s** (The Invisible Man, The Wolf Man, The Mummy's
  Hand, The Raven, The Black Room, The Face Behind the Mask, The Old Dark House,
  The Mad Ghoul, Frankenstein, The Black Cat, Murders in the Rue Morgue, The Mummy)
  — Universal/Columbia, still under copyright.
- **The Lady and the Monster (1944)** — copyright renewed in 1971; enters the US
  public domain in 2040. Caught by its Wikipedia article; the automated pass had
  flagged it as a false positive.
- **No-rights-evidence titles** — Robot Monster, The Man from Planet X, Rocketship
  X-M, The Brain from Planet Arous, The Crawling Eye / The Trollenberg Terror, Not
  of This Earth, The Wizard of Mars, The Monster of Piedras Blancas, It Conquered
  the World, The Flame Barrier, Teenage Monster, Attack of the 50 Foot Woman, The
  Astounding She-Monster, The She-Creature, The Day the World Ended, War of the
  Colossal Beast, The Undead, The Colossus of New York, The Phantom Speaks, Valley
  of the Zombies, The Vampire's Ghost, The Catman of Paris, The Flying Serpent,
  Target Earth, The Creation of the Humanoids, The Magnetic Monster, Queen of Blood
  (no clean single-film item). No license tag, not on the PD list, article silent —
  left out rather than guessed.
- **Double-feature compilations** — messy titles, usually no license (e.g. Queen of
  Blood / Battle of the Worlds, War of the Satellites / Voyage to the Prehistoric
  Planet, Terror / Dementia 13).
- **Gods Gun** — NOT verified public domain (self-asserted PD tag on a 1976
  Golan-Globus commercial film with a 2022 Kino Lorber Blu-ray). Package-only at
  most; not in any pack.
- **Manga scanlations** — see the manga note above.

### What the Video Club needs to consume the library catalog

The Video Club today only shelves films: `storeShelves` in `web/js/library.js`
builds one shelf per video channel, and loans are films (`{key, id, f, t, d, y, ch}`)
with a duration. Books/comics are text/image items with no duration and no video,
so the current loan model cannot hold them. The hook Claude (or the next builder)
needs:

1. A **reading shelf** in the club UI: `packs/library-catalog.json` is a link-out
   list (`entries[]` with `id`, `title`, `author`, `year`, `type`, `rights`, `url`).
   The simplest honest version is a shelf per type (Books / Comics / Manga) that
   opens `https://archive.org/details/<id>` in the Archive reader — no loan, no
   checkout, just a card and a link.
2. If loans are wanted for books/comics: a second loan shape without a duration
   (e.g. `{key, id, t, y, type}`), a separate `MAX_BOOKS` cap, and a "return" that
   just clears the loan — the Archive has no lending API the club can call, and
   the fine print already says the card is not an archive.org account.
3. The catalog's `gaps.manga` note should be shown on the empty manga shelf rather
   than hiding the shelf — it explains why it is empty.

No extra wiring is needed for the pack channels: pack channels (30–49) already
appear on Video Club shelves automatically, because `storeShelves` builds a shelf
per video channel and every film channel here is features-only (40+ min).

### Tests

`npm test` — **185/185 pass, 0 fail.** The suite includes a test that validates
both shipped packs clean (no errors, no warnings, exact channel/item counts) and
a test that the library catalog is well-formed. `PACKS.md` documents the shipped
packs.

## Track B — personal packs (outside the repo)

Files live at `~/workspace/nostalgem-packs-personal/` — **never committed**.
Every file carries a note that it is for the owner's own TV only, not the public
repo. Every item ID was verified live against the Archive metadata API (exists,
playable mp4 files for video, viewable files for the catalog, not
lending-restricted). A note in a pack file does not change the copyright status
of anything in it, and the library card / checkout framing is experience flavor,
not a rights mechanism. All 10 personal packs validate clean with the repo's own
validator (`parsePack`/`validatePack`): **0 errors, 0 warnings**.

Pack channels use `filesPerItem: 1` for films — the longest file of each item
airs, so extras, second halves and bundle siblings stay off the schedule. The
trade-off is bundle items (BTTF trilogy, Leprechaun franchise, Tremors
collection) air their longest file only; those are flagged below. `maxYear` is a
safety net only (the items are explicit verified lists, not queries): 1990 for
the 80s channels, 2000 for the 90s channels (covers the Lake Placid item, whose
Archive metadata year is 2000). A year-filter check was run over all 102 film
items: none has an earliest metadata year above its channel's `maxYear`, so
nothing should be silently skipped — if a channel ever comes up short, a
mis-dated item is the first thing to check.

### Film packs

| Pack | Channels | Items | What it is |
|---|---|---|---|
| `1980s-sci-fi-personal.json` | CH 33 80s Sci-Fi Features | 33 | The famous 80s sci-fi features |
| `1980s-cult-sci-fi-horror-personal.json` | CH 34 80s Cult Shelf | 18 | 80s cult sci-fi & horror |
| `1990s-horror-personal.json` | CH 35 90s Horror Features | 37 | The famous 90s horror films |
| `1990s-thrills-personal.json` | CH 36 90s Thrills | 14 | More 90s genre films + The Haunting (1963) |
| **Total** | | **102** | |

### CH 33 — 80s Sci-Fi Features (33 films)

Back to the Future (trilogy bundle — its longest file airs; Parts II and III
have their own items below), Back to the Future Part II, Back to the Future
Part III, The Terminator, E.T. (Special Edition cut), The Empire Strikes Back
(1995 VHS rip, tape extras), Return of the Jedi (4K83 fan restoration),
RoboCop, The Thing, Tron, Dune (**183-min extended TV cut**, not the 137-min
theatrical), Mad Max 2 / The Road Warrior, Ghostbusters, The Fly, Flash Gordon
(**75.9-min condensed/edited copy** vs the 111-min theatrical — verify before
relying on it), Escape from New York, The Running Man, They Live, Total Recall
(Carolco VHS), Innerspace, The Abyss, Short Circuit, \*batteries not included,
The Last Starfighter, Explorers, Spaceballs, The Philadelphia Experiment
(Svengoolie-hosted broadcast), Enemy Mine, Brazil (**director's cut**, 143 min
vs 132 theatrical), 2010: The Year We Make Contact, Cocoon, Weird Science,
Real Genius.

- **Akira (1988) — found playable but NOT in this pack.** The only playable
  copy (`akira_20230402`, Pioneer dub, 124.6 min) exists, but the film contains
  an attempted sexual assault of Kaori, a 15-year-old schoolgirl. Same
  tastefulness line as the anime packs. It is a clean-cuts candidate (see below).
- **Not on the Archive, or unplayable:** Blade Runner (clips / LaserDisc ISO
  only — no mp4), Star Wars (1977) (clips / MKV-only 4K77), Star Trek II / III /
  IV (Turner trailers + VCD items, no mp4), Aliens (trailers, novelization, game
  manuals only), Predator (poster/scans item, an Oprah promo, NES gameplay),
  Gremlins (a 0.5-min promo reel only), Honey I Shrunk the Kids (1997 TV show
  episodes + a Disney logo clip only), Starman (Turner trailers only).
- Bogus-tag warning: a few uploads carry self-asserted public-domain/CC license
  tags on plainly commercial films (e.g. The Terminator, Escape from New York,
  Total Recall). The tags are reported as found; none of them is a license.

### CH 34 — 80s Cult Shelf (18 films)

Flight of the Navigator (**Spanish dub** — the only playable copy), Repo Man,
Videodrome, Buckaroo Banzai, Night of the Comet, Cherry 2000, Leviathan,
Critters (**Joe Bob Briggs Monstervision-hosted broadcast only** — the clean
`critters-1986` item is images-only), The Hidden, The Return of the Living
Dead, Re-Animator, Fright Night, Near Dark, The Lost Boys, Hellraiser (1987),
The Monster Squad, The Gate (8 files — the longest, 86.0 min, is the film),
Poltergeist.

- **Alien (1979) — found playable but NOT in this pack.** The only playable
  copy (`alien-1979._202103`) runs 154.4 min at its longest file against a
  117-min theatrical — it looks like a compilation or multiple versions in one
  item. It needs inspection before packing.

### CH 35 — 90s Horror Features (37 films)

Scream (**unrated director's cut**, 111.4 min), I Know What You Did Last
Summer, The Blair Witch Project (clean 81-min copy, not the 103-min VHS with
the "Curse of the Blair Witch" mockumentary), The Sixth Sense (Hindi/English
dual-audio copy), Candyman, Candyman: Farewell to the Flesh (1995), The Craft,
Bram Stoker's Dracula, The Silence of the Lambs (NOT the 120-file segmented
copy), Se7en, Misery, It (1990 miniseries, 191.7-min restoration), Child's Play
2, Child's Play 3 (Australian VHS, 105.9 min vs 90-min theatrical — verify),
Bride of Chucky, Hellraiser II, Hellraiser III, A Nightmare on Elm Street 4,
A Nightmare on Elm Street 5, Friday the 13th Part VII (**USA Up All Night
hosted broadcast**, 122.6 min), Friday the 13th Part VIII, Halloween 4,
Halloween 5, Halloween 6 (**Producer's Cut**, 96.0 min), Leprechaun
(**"Leprechaun Franchise Complete" bundle** — longest file airs), The Faculty
(mislabeled year in the id; the 1998 film), Mimic (**director's cut**, 111.7
min), Bordello of Blood, From Dusk till Dawn, The People Under the Stairs
(**Joe Bob Briggs hosted broadcast**), Arachnophobia, Tremors (**multi-film
collection bundle** — longest file airs), The Blob (1988), The Serpent and the
Rainbow, In the Mouth of Madness, The Prophecy (**UPN33 TV broadcast**, 120.3
min vs the 98-min film), The Ninth Gate.

- **Not on the Archive, or unplayable:** Event Horizon (no mp4 — likely
  MKV/ISO), The Relic (mediatype=data, no mp4), The Frighteners (no mp4 —
  likely DVD ISO/MKV), Interview with the Vampire (stills only), Pet Sematary
  (Turner trailer only; Pet Sematary 2 workprint and the 2023 Bloodlines exist),
  Halloween H20 (Turner trailers only; TV-cut item has no mp4), Urban Legend
  (Turner trailer only), The Haunting (1999) (Turner trailers + promo guide
  only — the 1963 original IS playable, CH 36), Sleepy Hollow (Turner trailer
  only), The Mummy (1999) (no film copy; VHS opening, soundtrack, novelizations
  only — The Mummy Returns (2001) IS playable but out of scope), Species (TV
  spot only), Deep Rising (trailers only), The Dentist (a 21.4-min clip only;
  the other candidate is a 1947 stag film), Tales from the Crypt: Demon Knight
  (podcast episodes/reviews only), Wes Craven's New Nightmare (TV spots/trailer
  + press kit only), Fallen (an 8.5-min clip only), Stir of Echoes (Turner
  trailer only).
- Note: Hellraiser II/III (1988/1992) and Nightmare on Elm Street 4/5 and
  Friday the 13th VII/VIII are 80s films grouped here by franchise; BTTF Part
  III and Total Recall are 1990 films grouped in the 80s pack. That is a
  franchise grouping, not a dating error.

### CH 36 — 90s Thrills (14 films)

Army of Darkness (**director's cut**, 96.4 min), The Crow (**workprint only**,
122.0 min vs the 102-min theatrical), The Lawnmower Man, Night of the Living
Dead (1990 remake, **workprint only**, 87.4 min), The Matrix (**118.4 min vs
the 136-min theatrical — verify, may be truncated/edited**), The Fifth Element,
Men in Black (VHS, 108.1 min vs 98-min theatrical — verify), Gattaca, Starship
Troopers, Anaconda, Lake Placid (2000 VHS, 90.7 min vs 82-min theatrical —
verify), Galaxy Quest, eXistenZ, The Haunting (1963 original, 111.9 min).

- Night of the Living Dead (1968) and House on Haunted Hill (1959) are NOT
  duplicated here — they already ship in the Track A public pack.
- **Not on the Archive:** DeepStar Six (Turner trailer only), Wolf (1994) (TV
  spot + Turner trailer only), Mary Shelley's Frankenstein (1994) (Turner
  trailers only), Contact (1997) (no film copy), The Devil's Advocate (1997)
  (a 28.4-min clip only), Alien Resurrection (1997) (a 1.8-min clip + Turner
  trailer only).

### Anime packs — 6 packs, 53 items (Track B, personal)

Tastefulness is a hard rule for the anime packs: nothing perverted, no ecchi /
hentai, no sexualized minors, no sexual content, no sexual violence, no
exploitation. Each candidate was checked against Wikipedia / Anime News Network /
MyAnimeList descriptions plus the Archive item's own description; when in doubt
it was left out. Gore is fine — it is not what the line is about.

| Pack | Channel | Items | What it is |
|---|---|---|---|
| `anime-mech.json` | CH 37 Anime Mech | 15 | Gundam 0079, Zeta, ZZ, 0080, 0083, Char's Counterattack, I/II/III films, Wing, G Gundam, Grendizer, Casshan Robot Hunter, Tekkaman (partial — two dubbed compilation features), Patlabor: The New Files |
| `anime-scifi.json` | CH 38 Anime Sci-Fi | 10 | Cowboy Bebop, Serial Experiments Lain, Legend of the Galactic Heroes, Battle Angel Alita, Memories, Neo Tokyo, Robot Carnival, Angel's Egg, Iria, Ghost in the Shell (1995) |
| `anime-action.json` | CH 39 Anime Action | 5 | Gatchaman, Gatchaman II, Gatchaman Fighter, Escaflowne, Yu Yu Hakusho: Poltergeist Report |
| `anime-films.json` | CH 40 Anime Films | 10 | Ghibli mega-item (42 files — the loader takes up to 20; a few 2000s Ghibli films will show up alongside the 80s/90s ten), standalone Laputa / Kiki / Whisper / Mononoke, Patlabor 1 & 2, Roujin Z, Castle of Cagliostro, DBZ movies 5–13 (mixed dump — also contains Detective Conan Movie 5 and One Piece movies 3, 4, 6–9, 12) |
| `anime-kids.json` | CH 41 Anime Kids | 8 | Pokémon Indigo League, Pokémon Kanto Movie Collection, Digimon Adventure S1, Dragon Ball Z, Yu-Gi-Oh! Season 0, Candy Candy, Kinnikuman, Cardcaptor Sakura (partial — Season 2 only, 11 episodes) |
| `anime-cyberpunk.json` | CH 42 Anime Cyberpunk | 5 | Cyber City Oedo 808, M.D. Geist, Cybernetics Guardian, Black Magic M-66, Venus Wars |

Flags inside the packs: Ghost in the Shell's only playable copy is a 3D
side-by-side encode (awkward on a flat TV) and it has frequent non-sexual adult
nudity; Iria has two brief, non-sexual shower scenes; Grendizer's audio language
is not stated in its metadata (spot-check before relying on it); Tekkaman is a
partial (compilation features, not the full series); the Ghibli mega-item's
per-file year filter drops files with a post-1999 year in the name, but files
without a year in the name air regardless.

No horror pack was forced — the inventory did not support one tastefully
(Devilman 1972 TV was left out on doubt; see below).

### Anime — the cyberpunk must-includes (owner's list)

- **Cyber City Oedo 808 (1990) — INCLUDED, CH 42.** Full 3-ep OVA
  (`Cyber-City-Oedo-808-cat`). Sources agree: no nudity ("for a Yoshiaki
  Kawajiri project, there's actually no nudity"; "there is no nudity").
- **Angel Cop (1989) — NOT packed; owner's call.** Playable (full series in
  one item, `angel-cop-episode-3_202601`). Conflicting sources: one review
  claims "tons of blood and scenes of sexual violence"; a parental guide rates
  sex/mature themes 0 and nudity 1; MAL rates it R+ Mild Nudity; episode notes
  record Angel's "very visible nipples" in ep 3 and a "rape-y" psychic-domination
  scene in ep 4 (dialogue: "You must submit while I rape your mind"). No
  confirmed depicted rape. Genuinely borderline — see the clean-cuts note.
- **Genocyber (1994) — NOT packed; owner's call.** Playable
  (`genocyber-01`, full OVA 1–5). This one CROSSES the line: episode 1 has a
  teenage gang sexually molesting Elaine's friend Rat and attempting to rape
  Elaine — a young girl, mute, mentally deficient, an experiment subject
  (TV Tropes, Anime Herald, The Anime Review, Letterboxd all describe it).
  Sexual molestation / attempted rape of children. See the clean-cuts note —
  the honest read is that a skip-list cannot comfortably rescue this one.
- **"Stuff like that" — screened the same way, INCLUDED:** M.D. Geist (one
  nude scene with adult Vayia, played for titillation; extreme gore), Cybernetics
  Guardian (ultraviolence only), Black Magic M-66 (one brief non-detailed
  shower scene with adult reporter Sybil), Venus Wars (no sexual content found;
  note: one gay character is portrayed as a coward — an unpleasant piece of
  homophobia, not a sexual-content issue; do not confuse it with Venus 5, a
  1994 hentai Sailor Moon parody — different title).
- **Hades Project Zeorymer (1988–90) — NOT packed; owner's call.** Playable.
  Ambiguous: the OVA reportedly "tones down the explicit sexual content and
  deviates entirely from the manga storyline" (Wikipedia) and "does away with
  the explicit sexual content of the original manga" (ANN) — but the source
  manga ran in Lemon People (an adult/lolita magazine) and its plot turns on
  the lead forcing himself on Miku sexually; the leads are 15 and a schoolgirl.
  Could not confirm from the sources checked that the OVA is fully free of
  sexual content. Excluded on doubt; the owner can overrule.
- **Demon City Shinjuku (1988) — NOT packed; owner's call.** Playable.
  Conflicting sources: TV Tropes lists an attempted rape (Sayaka assaulted,
  rescued by Kyouya); ANN says she "gets sexually threatened at one point, she
  does not get abused"; OpRainfall says there is "no reason to be wary" on
  sexual violence. (A passage about a sexual assault of "Makie" is about Wicked
  City, not Demon City.) Excluded on doubt; see the clean-cuts note.
- **Mad Bull 34 (1990) — EXCLUDED BY NAME, per the owner ("Mad dog… it is too
  much"). No exceptions.** It is playable (`mad-bull-34-1-scandal`, episodes
  1–4) and it stays out.
- **Also excluded outright:** Goku: Midnight Eye (ep 1 — prolonged topless
  nudity of both female leads; ep 2 — two rape scenes + a sex scene), AD Police
  Files (sex-robot premise; sexual content is central, not incidental), Riding
  Bean (sexually charged abuse of a minor — Carrie, the 11-year-old's character,
  held hostage by the villainess), Sol Bianca (forced topless scenes in ep 2;
  the crew includes June Ashel, "a selfish young teen" — unclear whether the
  topless character is the teen).

### Anime — what else was excluded for tastefulness

Akira (attempted sexual assault of 15-year-old Kaori — found playable, excluded
from both the anime packs and the CH 33 film pack); Perfect Blue (depicted rape
scene); Berserk 1997 (sexual violence in the Eclipse); Ninja Scroll (sexual
assault scene); Evangelion (sexualized 14-year-old pilots); Sailor Moon
(transformation nudity of 14-year-olds); Ranma ½ (fan service with minors);
Cutie Honey 1973 (naked transformation of a 16-year-old); Project A-ko (panty
shots/bathing, minors); Gunbuster (nude/bathing scenes of a teenager); Lupin
III series/films (Fujiko sexualization — only Castle of Cagliostro excepted,
where she is a supporting, non-sexual character); Devilman OVAs; Vampire Hunter
D 1985 (sex scene; Bloodlust 2000 found playable but out of scope); The Wings of
Honneamise (sexual assault scene); Dragon Ball original (child nudity jokes);
Tenchi Muyo (harem fan service, 15-year-old protagonist); Dirty Pair (fan
service); Urusei Yatsura (Lum fan service, minor); Kimagure Orange Road (fan
service, minors); Video Girl Ai; Armitage III (sex scene); Space Adventure
Cobra (notable fan service); Bubblegum Crisis (recurring nude suit-up scenes,
Priss in panties/nude, brother peeping on sister dressing); Street Fighter II:
The Animated Movie (Chun-Li shower scene — voyeuristic nudity, character
described as teenage); Slayers (1995 film has breast-size jokes about Lina
Inverse, 13, opposite Naga in a leather bra-and-thong); Devilman 1972 TV
(tamer than the manga/OVAs, but sources note nudity/graphic material still
present "to a degree", Miki is a schoolgirl — excluded on doubt); Outlaw Star
(recurring fan service incl. nude hot-spring scenes with adult women); Rurouni
Kenshin: Trust & Betrayal (central romance/marriage between Kenshin, 15, and
adult Tomoe, brief suggestive content); City Hunter (Ryo's lecherous
womanizing is the running gag); Macross/Robotech (no clean complete playable
item; Macross II OVA has fan service + a teen-coded alien heroine; Macross 7
partial, Mylene is 14); Dominion Tank Police (only inside an 8-hour VHS block;
fan service anyway); Urotsukidoji, La Blue Girl, Wicked City, Violence Jack
(hentai / sexual violence). Fist of the North Star was found
(`hokuto_no_ken_by_wilmer29_d9qm239`, 161 files) but NOT packed — possible brief
female nudity in early episodes could not be ruled out; when in doubt, leave it
out.

### Anime — not found on the Archive (playable)

Appleseed 1988 OVA; Space Battleship Yamato (series/film); Future Boy Conan
(item claims all episodes, 0 video files); Mazinger Z full series (English-dub
item has only 1 mkv, ep 1); Getter Robo 1974 original (only single episodes of
the 1998 Armageddon OVA); Voltron (a 0.5-min clip + 1 Arabic-dubbed episode);
Trigun 1998 (only single episodes 7, 24); Saint Seiya 1986 TV (mkv-only item, 0
mp4); Speed Racer (only single episodes); Astro Boy 1963/1980 (only the 2009
movie); Kimba (only single episodes); Doraemon 1979 (only a 1993 Spanish
compilation); Ghibli films standalone (except Laputa/Kiki/Whisper/Mononoke —
the rest only in the mega-item); Ghost in the Shell clean flat copy (only the
3D side-by-side copy); Lupin III TV series. YouTube-only gaps (leads for a
future YouTube channel, not packable): Yamato, Lupin III TV, Astro Boy 1980,
Speed Racer full series, Trigun full 1998 series, Slayers TV, Saint Seiya TV,
Appleseed 1988, Doraemon 1979, Kimba full series, Future Boy Conan.

### Anime — pre-1960s, for Track A: essentially nothing safe

Only two items with real public-domain evidence: Namakura Gatana (1917,
`namakura-gatana-1917`, 2 mp4, longest 4.3 min) and Katsudō Shashin (c.1907,
`the-first-anime-katsudo-shashin-c.-1907`, 1 mp4, 0.6 min). Both are
fragments/shorts, not pack material. NOT public domain: Momotarō no Umiwashi
(1943 — director Mitsuyo Seo died 2010, Japanese life+70); Momotarô (1918) and
Sora no Momotarô (1931) — no explicit PD dedication or clear authorship /
death-date evidence. No Track A anime pack.

### Personal library catalog — 93 entries

`~/workspace/nostalgem-packs-personal/library-catalog-personal.json` — the
Track A catalog (67 entries) PLUS 26 beyond-PD entries, each with an honest
rights note. 70 books, 17 comics, 6 manga items.

- **Comics, beyond PD (9):** Planet Comics — 69 issues (Fiction House,
  1940s); Doc Savage Comics (Street & Smith, 1940–43); Science Comics #1 (Ace,
  1946); Space Adventures #1 (Charlton, 1953 — the item carries a self-asserted
  CC BY 3.0 tag; that is an uploader field, not evidence of a CC license);
  Exciting Comics #1 (1940); Bulletman #1 (Fawcett, 1941); America's Greatest
  Comics #1 (Fawcett, 1941); Special Edition Comics #1 (Fawcett, 1940); Four
  Tenners #1 (Ace, 1948). All verified live (viewable files, not restricted).
  Blue Beetle (Charlton, 1955) and Mystic (Atlas, 1951) were NOT found as clean
  Archive items in this pass — the title searches returned no matching comics.
- **Manga (6 items, 5 titles):** Boruto vols 1–19; Sailor Moon Super R
  (self-asserted CC0 public-domain mark — uploader field, not evidence);
  Pokémon Adventures Collector's Edition Vol. 1 (self-asserted public-domain
  mark — same); Azumanga Daioh Vol. 1 Ch. 3 and Ch. 4 (per-chapter items — the
  manga is scattered across per-chapter items, no complete-volume copy found);
  Chiikawa: Something Small and Cute No. 1 (self-asserted CC BY-NC-SA 4.0 tag
  — same). All are copyrighted scanlations; the catalog says so per entry.
- **Books, beyond PD (11):** Neuromancer (1984), Snow Crash (1992), Jurassic
  Park (1990), Ender's Game (1985), The Hitchhiker's Guide to the Galaxy
  (1979), Fight Club (1996), The Silence of the Lambs (1988), It (1986), The
  Stand (1978), Misery (1987), Dune (1965). All verified live — open, viewable
  (EPUB/PDF), no lending lock. They are open uploads of copyrighted books:
  personal use only, not licensed copies.

## Clean cuts — playback-time skipping (proposal for Claude)

The owner's idea: for classic titles that are 99% great but have a few
unair-able scenes, do NOT re-edit the files. Instead the player jumps over
listed timestamp ranges while the file itself stays untouched (no altered copy,
nothing re-uploaded). This is a **report item + format proposal only** — no pack
was changed for it, and the player support is Claude's build.

**Scope, as the owner clarified it: skip-lists target SEXUAL/PERVERTED content
only ("the naughty stuff"). KEEP ALL GORE. Gore scenes stay, all of them —
violence is not what gets skipped.** His reasoning: the sexual/perverted
material is what holds these titles back from modern platforms and public
availability. The tastefulness line for the packs is unchanged: nothing sexual
or perverted in the packs at all; gore is fine.

**Where it fits:** Video Club tapes ONLY (on-demand, your own pace). NOT the
live scheduled channels — skipping would throw the shared clock off and desync
the guide.

### Draft data format (for Claude)

A skip-list file, e.g. `packs/skip-lists.json` (or a `skipLists` section in a
pack file):

```json
{
  "format": "nostalgem-skip-lists/1",
  "note": "Playback-time skip lists. Sexual/perverted content ONLY — gore is never skipped. Timestamps come from a real viewing pass; never guess them.",
  "lists": [
    {
      "item": "<archive item id>",
      "file": "<filename, optional — when an item holds several files>",
      "title": "<title, for humans>",
      "skips": [
        { "start": 1234.5, "end": 1267.0, "reason": "sexual-assault-scene", "note": "one-sentence description for the owner" }
      ],
      "enabled": true
    }
  ]
}
```

- `start` / `end` are seconds into the file. `reason` values are
  sexual-content-only: `sexual-assault`, `attempted-sexual-assault`,
  `sexual-violence`, `sexualized-minor`, `nudity-sexualized`, `sex-scene`,
  `sexual-content`. There are no gore reasons — gore is never listed.
- **Player behavior (Claude's build):** a toggle, "Play TV-safe cut", on the
  tape. When on, the player seeks from `start` to `end` for each listed range;
  an on-screen note shows "TV-safe cut: N scenes skipped" (ideally with a brief
  "skipped a scene" flash at each jump, so the viewer knows the film didn't
  glitch). When off, the file plays untouched. The file is never altered.
- **Timestamps: none are invented here.** Exact start/end values need a real
  viewing pass of each title — pause at each scene, note the times. A skip-list
  with guessed timestamps is worse than none: it would cut the wrong seconds.
  The per-title notes below describe the problem scenes in general terms only,
  from parental guides and content descriptions.

### Per-title rescue notes (sexual content only; gore stays)

**Plausibly rescuable — the problem material is a few discrete scenes:**

- **Angel Cop** (owner call): brief nipple nudity in ep 3 (a few shots) + one
  "rape-y" psychic-domination scene in ep 4 (dialogue: "You must submit while I
  rape your mind"). A skip-list could cover both and leave a coherent violent
  cyberpunk OVA. Owner's call.
- **Demon City Shinjuku** (owner call): one attempted-rape scene (Sayaka
  assaulted, rescued by Kyouya). A single scene — skipping it leaves the film
  intact. Owner's call.
- **Akira**: one attempted sexual assault of Kaori, a 15-year-old schoolgirl.
  A single sequence — technically skippable, and the rest is violence/gore
  which stays. But the victim is a minor, so this is the owner's call, not
  mine.
- **Ninja Scroll**: one sexual assault scene. Single scene, plausibly
  skippable; the rest is gore.
- **Vampire Hunter D (1985)**: one sex scene. Single scene, plausibly
  skippable.
- **Armitage III**: one sex scene. Single scene, plausibly skippable.
- **Street Fighter II: The Animated Movie**: one Chun-Li shower scene
  (voyeuristic nudity; the character is described as teenage in some sources).
  Single scene, plausibly skippable — the age question makes it the owner's
  call.
- **Sol Bianca**: topless scenes in episode 2, a few discrete scenes.
  Plausibly skippable. (The teen-crew question in the screening note stands.)
- **Iria: Zeiram the Animation** (already in CH 38 with a flag): two brief,
  non-sexual shower scenes. A skip-list could cover them if the owner wants it
  cleaner.
- **M.D. Geist** (already in CH 42 with a note): one nude scene with adult
  Vayia, played for titillation. One scene — skippable if the owner wants it
  cleaner.
- **Black Magic M-66** (already in CH 42 with a note): one brief non-detailed
  shower scene with adult Sybil. One scene — skippable if the owner wants it
  cleaner.
- **The Wings of Honneamise**: one sexual assault scene — but it is a turning
  point for the protagonist, so skipping it changes the character arc.
  Technically skippable, narratively costly. Owner's call.
- **Hades Project Zeorymer** (owner call): the OVA reportedly tones down /
  removes the manga's explicit sexual content, but that is unconfirmed. A
  viewing pass is needed first — if any sexual content remains and it is
  scene-specific, a skip-list could cover it.

**Not rescuable — the problem material is pervasive, plot-central, or
involves minors in a way a skip-list cannot fix:**

- **Genocyber** (owner call): episode 1's sexual molestation / attempted rape
  of children (Elaine and her friend Rat) is graphic and woven into the
  episode's core setup. The scenes could technically be skipped, but they
  involve minors and the title stays notorious — a skip-list does not make this
  one comfortable. The honest read: this one does not come back. Owner's call.
- **Goku: Midnight Eye**: episode 2's two rape scenes + sex scene are discrete
  and skippable in principle, but episode 1's prolonged topless nudity of both
  female leads is woven through the whole episode — not a few scenes. Not
  rescuable as a whole.
- **AD Police Files**: sexual content is the premise (sex-robots, a serial
  killer who targets prostitutes, fetish-gear scenes). Not a few scenes — the
  show. Not rescuable.
- **Riding Bean**: sexually charged abuse of a minor (Carrie, the 11-year-old's
  character, held hostage by the villainess) is plot-central. Not rescuable.
- **Perfect Blue**: the depicted rape scene is a major plot beat in a film
  about sexual exploitation in the idol industry. Skipping it breaks the plot's
  logic. Not recommended as rescuable.
- **Rurouni Kenshin: Trust & Betrayal**: the central romance/marriage is
  between 15-year-old Kenshin and adult Tomoe, with brief suggestive content.
  The romance IS the story. Not rescuable.
- **Evangelion, Sailor Moon, Ranma ½, Tenchi Muyo, Dirty Pair, Urusei Yatsura,
  Kimagure Orange Road, Video Girl Ai, Space Adventure Cobra, Dragon Ball
  (original)**: sexualization / fan service is pervasive across episodes, or
  the sexual content is central to the premise. Not rescuable.
- **Bubblegum Crisis**: recurring nude suit-up scenes + a peeping gag
  (brother peeping on sister dressing) recur across episodes. Not cleanly
  rescuable.
- **Outlaw Star**: recurring hot-spring fan service. Not cleanly rescuable.
- **Slayers (1995 film)**: breast-size jokes about 13-year-old Lina opposite
  Naga in a leather bra-and-thong are dialogue jokes woven through the film —
  they are jokes, not scenes, so a skip-list cannot cover them cleanly.
- **Ghost in the Shell (1995)** (already in CH 38 with a flag): frequent
  non-sexual adult nudity is woven through the film; a skip-list for nudity
  would gut it. Included as-is with the note instead.

**Needs a viewing pass before any skip-list could be drawn:**

- **Devilman (1972 TV)**: sources note nudity/graphic material "to a degree"
  but no scene-level detail was found. Excluded on doubt; a viewing pass would
  be needed.
- **Fist of the North Star**: possible brief female nudity in early episodes,
  unconfirmed. If confirmed and brief, a skip-list could cover it.
- **Macross II OVA**: fan service + a teen-coded alien heroine, but no clean
  complete playable item exists anyway.

### Tests

`npm test` — **185/185 pass, 0 fail** (Track A, on the branch). The 10 Track B
personal packs are NOT in the repo test suite (they live outside the repo), but
all 10 were validated with the repo's own validator: **0 errors, 0 warnings**
across all of them. `PACKS.md` documents the shipped Track A packs.

