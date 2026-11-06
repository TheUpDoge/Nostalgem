import { test } from "node:test";
import assert from "node:assert/strict";
import { parseIsoDuration, rejectReason, cleanYtTitle, buildYouTubeChannel, filterText } from "../tools/youtube.mjs";
import { isYouTube, videoIdOf } from "../web/js/youtube.js";
import { programKey } from "../web/js/schedule.js";

test("ISO 8601 durations", () => {
  assert.equal(parseIsoDuration("PT24M10S"), 1450);
  assert.equal(parseIsoDuration("PT1H2M3S"), 3723);
  assert.equal(parseIsoDuration("PT45S"), 45);
  assert.equal(parseIsoDuration("P1DT1H"), 90000);
  assert.equal(parseIsoDuration("P0D"), 0);
  assert.equal(parseIsoDuration(""), 0);
  assert.equal(parseIsoDuration("nonsense"), 0);
});

const ok = (over) => ({
  id: "abc123def45",
  snippet: { title: "Episode 1", liveBroadcastContent: "none", description: "" },
  contentDetails: { duration: "PT24M", contentRating: {} },
  status: { privacyStatus: "public", uploadStatus: "processed", embeddable: true },
  ...over,
});

test("only videos that can air in the US get through", () => {
  const o = { minS: 240 };
  assert.equal(rejectReason(ok(), o), "");
  assert.equal(rejectReason(ok({ status: { privacyStatus: "unlisted", embeddable: true } }), o), "not public");
  assert.equal(rejectReason(ok({ status: { privacyStatus: "public", embeddable: false } }), o), "embedding off");
  assert.equal(rejectReason(ok({ contentDetails: { duration: "PT24M", contentRating: { ytRating: "ytAgeRestricted" } } }), o), "age-restricted");
  assert.equal(rejectReason(ok({ contentDetails: { duration: "PT24M", regionRestriction: { blocked: ["US", "CA"] } } }), o), "blocked in US");
  assert.equal(rejectReason(ok({ contentDetails: { duration: "PT24M", regionRestriction: { allowed: ["JP", "TW"] } } }), o), "not available in US");
  assert.equal(rejectReason(ok({ contentDetails: { duration: "PT24M", regionRestriction: { allowed: ["US"] } } }), o), "");
  assert.equal(rejectReason(ok({ contentDetails: { duration: "PT24M", regionRestriction: { allowed: ["JP"] } } }), { region: "JP" }), "");
  assert.equal(rejectReason(ok({ snippet: { title: "LIVE", liveBroadcastContent: "live" } }), o), "live or upcoming");
  assert.equal(rejectReason(ok({ contentDetails: { duration: "PT58S" } }), o), "too short", "Shorts are left out");
  assert.equal(rejectReason(ok({ contentDetails: { duration: "P0D" } }), o), "no duration");
});

test("titles lose upload clutter but keep the episode", () => {
  assert.equal(cleanYtTitle("【Official】Mobile Suit Gundam Wing Ep. 1 | Full Episode (English Dub) [HD]"), "Mobile Suit Gundam Wing Ep. 1");
  assert.equal(cleanYtTitle("Lupin the 3rd - Episode 4 [English Sub]"), "Lupin the 3rd - Episode 4");
  assert.equal(cleanYtTitle("Astro Boy (1980) Episode 2 - Full Episode"), "Astro Boy (1980) Episode 2");
  assert.equal(cleanYtTitle("Captain Harlock (Remastered)"), "Captain Harlock");
  assert.equal(cleanYtTitle("After War Gundam X -Episode1(w/subtitles)"), "After War Gundam X -Episode1");
  assert.equal(cleanYtTitle("Speed Racer (Part 2)"), "Speed Racer (Part 2)");
  assert.equal(cleanYtTitle("Junji Ito Collection Full Series Watch Party (LIMITED TIME)"), "Junji Ito Collection Full Series Watch Party");
});

test("YouTube program ids", () => {
  const p = { id: "yt:abc123def45", f: "yt", t: "x", d: 60 };
  assert.ok(isYouTube(p));
  assert.equal(videoIdOf(p), "abc123def45");
  assert.equal(programKey(p), "yt:abc123def45/yt");
  assert.ok(!isYouTube({ id: "SalomeWhereSheDanced", f: "a.mp4" }));
});

function fakeApi(channels) {
  const calls = [];
  const videos = {};
  for (const ch of Object.values(channels)) for (const v of ch.videos) videos[v.id] = v;
  const yt = async (path, params) => {
    calls.push(path);
    if (path === "channels") {
      const ch = channels[params.forHandle];
      return { items: ch ? [{ contentDetails: { relatedPlaylists: { uploads: "UU" + params.forHandle } } }] : [] };
    }
    if (path === "playlistItems") {
      const ch = channels[params.playlistId.slice(2)];
      const start = Number(params.pageToken || 0);
      const page = ch.videos.slice(start, start + 50);
      return { items: page.map((v) => ({ contentDetails: { videoId: v.id } })), nextPageToken: start + 50 < ch.videos.length ? String(start + 50) : undefined };
    }
    if (path === "videos") return { items: params.id.split(",").map((id) => videos[id]) };
    throw new Error(path);
  };
  return { yt, calls };
}

test("a channel from two official sources: checked, in order, taking turns", async () => {
  const mk = (id, title, extra) => ok({ id, snippet: { title, liveBroadcastContent: "none", description: "About " + title }, ...extra });
  // Uploads are newest first.
  const mecha = [mk("m3", "Mecha Ep. 3"), mk("m2", "Mecha Ep. 2"), mk("mt", "Mecha Trailer"), mk("m1", "Mecha Ep. 1")];
  const magic = [mk("g2", "Magic Ep. 2", { status: { privacyStatus: "public", embeddable: false } }), mk("g1", "Magic Ep. 1"), mk("gs", "Magic Ep. 0", { contentDetails: { duration: "PT40S" } })];
  const many = Array.from({ length: 120 }, (_, i) => mk("z" + i, "Zed Ep. " + (120 - i)));
  const { yt, calls } = fakeApi({ "@mecha": { videos: mecha }, "@magic": { videos: magic }, "@zed": { videos: many } });
  const def = {
    slug: "anime",
    minMinutes: 4,
    youtube: [
      { handle: "@mecha", exclude: "trailer", order: "oldest" },
      { handle: "mecha" }, // the same channel again: no repeats
      { handle: "@magic", match: "ep\\.", order: "oldest" },
    ],
  };
  const res = await buildYouTubeChannel(def, { yt, exclude: ["hentai"] });
  assert.deepEqual(
    res.items.map((p) => p.t),
    ["Mecha Ep. 1", "Magic Ep. 1", "Mecha Ep. 2", "Mecha Ep. 3"]
  );
  assert.equal(res.items[0].id, "yt:m1");
  assert.equal(res.items[0].d, 1440);
  assert.equal(res.about["yt:m1"], "About Mecha Ep. 1");
  assert.deepEqual(res.rejected, { excluded: 1, "embedding off": 1, "too short": 1 });

  const big = await buildYouTubeChannel({ slug: "z", maxItems: 100, youtube: [{ handle: "@zed", order: "oldest", maxScan: 110 }] }, { yt });
  assert.equal(big.items.length, 100);
  assert.equal(big.items[0].t, "Zed Ep. 11", "oldest of the 110 scanned");
  assert.ok(calls.filter((c) => c === "videos").length >= 3, "videos are looked up 50 at a time");
});

test("a missing channel is skipped, a bad key stops the build", async () => {
  const { yt } = fakeApi({});
  const res = await buildYouTubeChannel({ slug: "x", youtube: [{ handle: "@nobody" }] }, { yt });
  assert.equal(res.items.length, 0);
  const denied = async () => {
    throw Object.assign(new Error("YouTube API 403: API key not valid. Please pass a valid API key."), { fatal: true });
  };
  await assert.rejects(buildYouTubeChannel({ slug: "x", youtube: [{ handle: "@a" }] }, { yt: denied }), /API key/);
});

test("live streams: only what is on the air now, as schedule blocks", async () => {
  const live = (id, title, extra) => ({
    id,
    snippet: { title, liveBroadcastContent: "live", description: "" },
    contentDetails: { duration: "P0D" },
    status: { privacyStatus: "public", uploadStatus: "uploaded", embeddable: true },
    ...extra,
  });
  assert.equal(rejectReason(live("a", "Bear Cam"), { live: true }), "");
  assert.equal(rejectReason(live("a", "Bear Cam", { snippet: { liveBroadcastContent: "none" } }), { live: true }), "not live now");
  assert.equal(rejectReason(live("a", "Bear Cam", { status: { privacyStatus: "public", embeddable: false } }), { live: true }), "embedding off");
  assert.notEqual(rejectReason(live("a", "Bear Cam"), {}), "", "a live stream is not a normal program");
  const videos = { bears12345a: live("bears12345a", "🔴 LIVE: Brown Bear Cam | Katmai"), off1234567b: live("off1234567b", "Ended", { snippet: { liveBroadcastContent: "none" } }) };
  const yt = async (path, params) => {
    if (path === "channels") return { items: [{ id: "UCcams" }] };
    if (path === "search") {
      assert.equal(params.eventType, "live");
      assert.equal(params.channelId, "UCcams");
      return { items: [{ id: { videoId: "bears12345a" } }, { id: { videoId: "off1234567b" } }] };
    }
    if (path === "videos") return { items: params.id.split(",").map((id) => videos[id]) };
    throw new Error(path);
  };
  const res = await buildYouTubeChannel({ slug: "cams", blockMinutes: 15, youtube: [{ handle: "@cams", live: true }] }, { yt });
  assert.equal(res.items.length, 1);
  assert.equal(res.items[0].live, 1);
  assert.equal(res.items[0].d, 900);
  assert.equal(res.items[0].t, "Brown Bear Cam | Katmai");
});

test("every: live news between documentaries, repeating", async () => {
  const vod = (id) => ({ id, snippet: { title: "Doc " + id, liveBroadcastContent: "none", description: "" }, contentDetails: { duration: "PT40M" }, status: { privacyStatus: "public", uploadStatus: "processed", embeddable: true } });
  const live = (id) => ({ id, snippet: { title: "News " + id, liveBroadcastContent: "live", description: "" }, contentDetails: { duration: "P0D" }, status: { privacyStatus: "public", embeddable: true } });
  const videos = {};
  ["d1", "d2", "d3", "d4", "d5", "d6", "d7"].forEach((id) => (videos[id] = vod(id)));
  videos.n1 = live("n1");
  videos.n2 = live("n2");
  const yt = async (path, params) => {
    if (path === "channels") return { items: [{ id: "UC" + params.forHandle, contentDetails: { relatedPlaylists: { uploads: "UU" + params.forHandle } } }] };
    if (path === "playlistItems") return { items: ["d1", "d2", "d3", "d4", "d5", "d6", "d7"].map((v) => ({ contentDetails: { videoId: v } })) };
    if (path === "search") return { items: [{ id: { videoId: params.channelId === "UC@a" ? "n1" : "n2" } }] };
    if (path === "videos") return { items: params.id.split(",").map((id) => videos[id]) };
    throw new Error(path);
  };
  const def = { slug: "es", blockMinutes: 30, youtube: [{ handle: "@docs", order: "oldest" }, { handle: "@a", live: true, every: 3 }, { handle: "@b", live: true, every: 3 }] };
  const res = await buildYouTubeChannel(def, { yt });
  // Uploads come newest first, so "oldest" reverses them: d7 … d1.
  assert.deepEqual(res.items.map((p) => p.t), ["Doc d7", "Doc d6", "Doc d5", "News n1", "Doc d4", "Doc d3", "Doc d2", "News n2", "Doc d1"]);
  const onlyLive = await buildYouTubeChannel({ slug: "x", youtube: [{ handle: "@a", live: true, every: 2 }] }, { yt });
  assert.deepEqual(onlyLive.items.map((p) => p.t), ["News n1"], "a channel of only spread sources still airs them");
});

test("allow: an official 'Full Series' watch party gets past the piracy words, nothing else does", async () => {
  const mk = (id, title, description) => ok({ id, snippet: { title, liveBroadcastContent: "none", description } });
  const videos = [
    mk("w1", "Full Series | Junji Ito Collection Full Series Watch Party (LIMITED TIME)", "Watch the full series free"),
    mk("w2", "Junji Ito Collection Full Series", "nsfw cut"),
    mk("w3", "Junji Ito Collection Ep. 1", "Uploaded from a Full Series torrent"),
  ];
  const { yt } = fakeApi({ "@cr": { videos } });
  const words = ["full series", "torrent", "nsfw"];
  const strict = await buildYouTubeChannel({ slug: "a", youtube: [{ handle: "@cr" }] }, { yt, exclude: words });
  assert.equal(strict.items.length, 0, "without allow, the word filter keeps all three off");
  const res = await buildYouTubeChannel({ slug: "a", youtube: [{ handle: "@cr", allow: "full series" }] }, { yt, exclude: words });
  assert.deepEqual(res.items.map((p) => p.id), ["yt:w1"], "the other words still count");
  assert.equal(filterText(videos[0], /full series/gi).toLowerCase().indexOf("full series"), -1);
});
