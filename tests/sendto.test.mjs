import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseSent, sentUrl, sentLabel, sharedLink, linkSeconds, isAdult, archivePlan, whyNot, ADULT_TITLE, ADULT_DESCRIPTION, QUEUE_MAX, SENT_MAX } from "../web/js/sendto.js";
import { checkMessage } from "../web/js/link.js";
import { Player } from "../web/js/player.js";
import { bannerHtml, programMeta } from "../web/js/ui/views.js";

const channels = JSON.parse(await readFile(new URL("../web/data/channels.json", import.meta.url), "utf8"));

test("YouTube links: a video however it's written, and where to start", () => {
  const id = "dQw4w9WgXcQ";
  for (const link of ["https://www.youtube.com/watch?v=" + id, "http://youtube.com/watch?v=" + id + "&feature=share", "https://m.youtube.com/watch?v=" + id, "https://music.youtube.com/watch?v=" + id, "youtu.be/" + id, "https://youtu.be/" + id + "?si=AbCd", "https://www.youtube.com/shorts/" + id, "https://www.youtube.com/live/" + id, "https://www.youtube.com/embed/" + id, "https://www.youtube-nocookie.com/embed/" + id]) {
    assert.deepEqual(parseSent(link), { kind: "youtube", id: id }, link);
  }
  assert.deepEqual(parseSent("https://youtu.be/" + id + "?t=90"), { kind: "youtube", id: id, at: 90 });
  assert.deepEqual(parseSent("https://www.youtube.com/watch?v=" + id + "&t=1m30s"), { kind: "youtube", id: id, at: 90 });
  assert.deepEqual(parseSent("https://www.youtube.com/embed/" + id + "?start=42"), { kind: "youtube", id: id, at: 42 });
  assert.equal(linkSeconds("1h2m3s"), 3723);
  assert.equal(linkSeconds("75"), 75);
  assert.equal(linkSeconds("soon"), 0);
  assert.equal(linkSeconds(""), 0);
  assert.equal(sentUrl(parseSent("youtu.be/" + id + "?t=1m30s")), "https://www.youtube.com/watch?v=" + id + "&t=90s");
});

test("YouTube playlists: the ones a player can be handed", () => {
  const list = "PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf";
  assert.deepEqual(parseSent("https://www.youtube.com/playlist?list=" + list), { kind: "ytlist", list: list });
  assert.deepEqual(parseSent("https://www.youtube.com/embed/videoseries?list=" + list), { kind: "ytlist", list: list });
  assert.deepEqual(parseSent("https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=" + list + "&index=3"), { kind: "youtube", id: "dQw4w9WgXcQ", list: list });
  assert.equal(sentUrl(parseSent("https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=" + list + "&index=3")), "https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=" + list);
  // A mix is made up for whoever is signed in, and Watch later is private: the video alone, or nothing.
  assert.deepEqual(parseSent("https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=RDdQw4w9WgXcQ&start_radio=1"), { kind: "youtube", id: "dQw4w9WgXcQ" });
  assert.equal(parseSent("https://www.youtube.com/playlist?list=WL"), null);
  assert.equal(parseSent("https://www.youtube.com/playlist?list=LL"), null);
  assert.match(sentLabel(parseSent("https://www.youtube.com/playlist?list=" + list)), /playlist/);
});

test("Archive links: an item, one file of it, a search; nothing else", () => {
  assert.deepEqual(parseSent("https://archive.org/details/night_of_the_living_dead"), { kind: "archive", id: "night_of_the_living_dead" });
  assert.deepEqual(parseSent("archive.org/details/night_of_the_living_dead?tab=about"), { kind: "archive", id: "night_of_the_living_dead" });
  assert.deepEqual(parseSent("https://www.archive.org/embed/Popeye_forPresident?start=42"), { kind: "archive", id: "Popeye_forPresident", at: 42 });
  const file = parseSent("https://archive.org/download/some_serial/Chapter%2003%20The%20End.mp4");
  assert.deepEqual(file, { kind: "archive", id: "some_serial", file: "Chapter 03 The End.mp4" });
  assert.equal(sentUrl(file), "https://archive.org/download/some_serial/Chapter%2003%20The%20End.mp4");
  assert.deepEqual(parseSent(sentUrl(file)), file, "the tidy form reads back the same");
  assert.deepEqual(parseSent("https://archive.org/search?query=lone+ranger"), { kind: "search", query: "lone ranger" });
  assert.equal(sentUrl({ kind: "search", query: "lone ranger" }), "https://archive.org/search?query=lone%20ranger");
  // Not the Wayback Machine, not a file server, not a bare word, not somewhere else.
  assert.equal(parseSent("https://web.archive.org/web/2020/https://youtube.com/watch?v=dQw4w9WgXcQ"), null);
  assert.equal(parseSent("https://ia800300.us.archive.org/12/items/x/x.mp4"), null);
  assert.equal(parseSent("https://archive.org/about/"), null);
  assert.equal(parseSent("https://example.com/watch?v=dQw4w9WgXcQ"), null);
  assert.equal(parseSent("https://notyoutube.com/watch?v=dQw4w9WgXcQ"), null);
  assert.equal(parseSent("https://archive.org.evil.example/details/x"), null);
  assert.equal(parseSent("https://evil.example/?u=youtu.be"), null);
  assert.equal(parseSent("javascript:alert(1)//youtu.be/dQw4w9WgXcQ").kind, "youtube", "only the link in it is read");
  assert.equal(sentUrl(parseSent("javascript:alert(1)//youtu.be/dQw4w9WgXcQ")), "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  assert.equal(parseSent("lone ranger"), null);
  assert.equal(parseSent(""), null);
  assert.equal(parseSent(null), null);
  assert.equal(parseSent("https://archive.org/details/../../etc"), null);
});

test("text around the link, as a phone's Share sheet sends it", () => {
  assert.deepEqual(parseSent("Night of the Living Dead (1968) https://youtu.be/dQw4w9WgXcQ?si=x. Enjoy!"), { kind: "youtube", id: "dQw4w9WgXcQ" });
  assert.deepEqual(parseSent("See (https://archive.org/details/PhantomExpress)."), { kind: "archive", id: "PhantomExpress" });
  assert.deepEqual(sharedLink("?title=A%20Video&text=Watch%20https%3A%2F%2Fyoutu.be%2FdQw4w9WgXcQ"), { kind: "youtube", id: "dQw4w9WgXcQ" });
  assert.deepEqual(sharedLink("?url=https%3A%2F%2Farchive.org%2Fdetails%2FPhantomExpress&title=x"), { kind: "archive", id: "PhantomExpress" });
  assert.equal(sharedLink("?title=nothing&text=to%20see"), null);
  assert.equal(sharedLink(""), null);
});

test("what a phone may send is checked on the TV, and tidied", () => {
  assert.deepEqual(checkMessage({ t: "play", url: "look: youtu.be/dQw4w9WgXcQ?t=90&si=x" }), { t: "play", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=90s" });
  assert.deepEqual(checkMessage({ t: "play", url: "https://archive.org/details/PhantomExpress" }), { t: "play", url: "https://archive.org/details/PhantomExpress" });
  assert.equal(checkMessage({ t: "play", url: "https://example.com/video.mp4" }), null, "only YouTube and the Archive");
  assert.equal(checkMessage({ t: "play", url: "file:///etc/passwd" }), null);
  assert.equal(checkMessage({ t: "play", url: 12 }), null);
  assert.equal(checkMessage({ t: "play" }), null);
  assert.equal(checkMessage({ t: "play", url: "https://youtu.be/dQw4w9WgXcQ " + "x".repeat(SENT_MAX) }), null, "too long to be a link");
  assert.deepEqual(checkMessage({ t: "seek", to: 61.4 }), { t: "seek", to: 61 });
  assert.deepEqual(checkMessage({ t: "seek", by: -15 }), { t: "seek", by: -15 });
  assert.equal(checkMessage({ t: "seek", to: -1 }), null);
  assert.equal(checkMessage({ t: "seek", to: 1e9 }), null);
  assert.equal(checkMessage({ t: "seek", to: "5" }), null);
  assert.equal(checkMessage({ t: "seek", by: 0 }), null);
  assert.equal(checkMessage({ t: "seek", by: 99999 }), null);
  assert.equal(checkMessage({ t: "seek", by: NaN }), null);
  assert.equal(checkMessage({ t: "seek" }), null);
  assert.deepEqual(checkMessage({ t: "queue", go: 1 }), { t: "queue", go: 1 });
  assert.deepEqual(checkMessage({ t: "queue", go: -1 }), { t: "queue", go: -1 });
  assert.equal(checkMessage({ t: "queue", go: 5 }), null);
});

test("the adult filter is the sexual words of the lineup's own leave-out lists", () => {
  const titleWords = channels.exclude.map((w) => w.toLowerCase());
  const descWords = channels.excludeDescription.map((w) => w.toLowerCase());
  for (const w of ADULT_TITLE) assert.ok(titleWords.includes(w), `"${w}" is on channels.json's exclude list`);
  for (const w of ADULT_DESCRIPTION) assert.ok(descWords.includes(w), `"${w}" is on channels.json's excludeDescription list`);
  assert.deepEqual(ADULT_DESCRIPTION.slice().sort(), descWords.slice().sort(), "all of the description list");
  // The lists' other words aren't about that, and don't hold a sent link back.
  for (const w of ["trailer", "commentary", "bluray", "complete series", "blackface", "fan film", "exploitation"]) assert.ok(titleWords.includes(w) && !ADULT_TITLE.includes(w), w);
  assert.equal(isAdult("Nude on the Moon", ""), true);
  assert.equal(isAdult("A Burlesque Revue 1948", ""), true);
  assert.equal(isAdult("Night of the Living Dead trailer", "Zombies. Gore. Regardless of age or sex."), false, "a trailer, gore, and the word in passing are fine");
  assert.equal(isAdult("Essex County Newsreel", ""), false, "whole words only");
  assert.equal(isAdult("Home Movie", "contains full frontal nudity"), true);
});

const film = (over) => ({ metadata: Object.assign({ identifier: "a_film", title: "A Film", year: "1950", mediatype: "movies", description: "<p>A film about a dog.</p><br>In color, see https://example.com/more" }, over), files: [{ name: "a_film.mp4", format: "h.264", source: "original", length: "3600" }] });

test("an Archive item that was sent: what plays, or why not", () => {
  const plan = archivePlan(film());
  assert.equal(plan.why, undefined);
  assert.equal(plan.kind, "video");
  assert.deepEqual(plan.programs, [{ id: "a_film", f: "a_film.mp4", t: "A Film", d: 3600, y: 1950 }]);
  assert.equal(plan.start, 0);
  assert.equal(plan.about, "A film about a dog. In color, see", "the description, cleaned of markup and links, for the banner");
  // The year cap, trailers and rips are for channels, not for a link somebody chose.
  assert.equal(archivePlan(film({ year: "2019", title: "A New Film trailer (BluRay)" })).why, undefined);
  assert.equal(archivePlan(film({ mediatype: "collection" })).why, "collection");
  assert.equal(archivePlan(film({ "access-restricted-item": "true" })).why, "lending");
  assert.equal(archivePlan(film({ title: "Sexy Nights" })).why, "adult");
  assert.equal(archivePlan(film({ subject: ["erotica", "drama"] })).why, "adult");
  assert.equal(archivePlan(film({ description: "Softcore, from 1972." })).why, "adult");
  assert.equal(archivePlan({ metadata: { identifier: "papers", mediatype: "texts" }, files: [{ name: "a.pdf", format: "Text PDF" }] }).why, "nofile");
  assert.equal(archivePlan({}).why, "notfound");
  assert.equal(archivePlan(null).why, "notfound");
  for (const why of ["notfound", "collection", "search", "lending", "adult", "nofile", "playlist", "nochannel", ""]) assert.ok(whyNot(why).length > 10, why);
});

test("a recording plays as radio, an item in parts in order, from the file the link named", () => {
  const radio = archivePlan({ metadata: { identifier: "a_show", title: "A Show", mediatype: "audio" }, files: [{ name: "ep2.mp3", format: "VBR MP3", source: "original", length: "1800" }, { name: "ep1.mp3", format: "VBR MP3", source: "original", length: "1700" }, { name: "ep10.mp3", format: "VBR MP3", source: "original", length: "1600" }] });
  assert.equal(radio.kind, "audio");
  assert.deepEqual(radio.programs.map((p) => p.f), ["ep1.mp3", "ep2.mp3", "ep10.mp3"], "natural order");
  // A film item whose only playable file is sound still plays (and the other way about).
  const odd = archivePlan({ metadata: { identifier: "odd", title: "Odd", mediatype: "movies" }, files: [{ name: "talk.mp3", format: "VBR MP3", source: "original", length: "600" }] });
  assert.equal(odd.kind, "audio");
  const serial = { metadata: { identifier: "serial", title: "The Serial", mediatype: "movies" }, files: [] };
  for (let i = 1; i <= 12; i++) {
    serial.files.push({ name: "chapter" + i + ".avi", format: "Cinepack", source: "original", length: "1000" });
    serial.files.push({ name: "chapter" + i + ".mp4", format: "h.264", source: "derivative", original: "chapter" + i + ".avi", length: "1000" });
  }
  assert.equal(archivePlan(serial).programs.length, 12);
  assert.equal(archivePlan(serial, "chapter3.mp4").start, 2);
  assert.equal(archivePlan(serial, "chapter3.avi").start, 2, "the original's name finds the copy a TV plays");
  assert.equal(archivePlan(serial, "nothing.mp4").start, 0);
  // More parts than the queue holds: a window that still starts where the link pointed.
  const long = { metadata: { identifier: "long", title: "Long", mediatype: "audio" }, files: [] };
  for (let i = 1; i <= 150; i++) long.files.push({ name: "part" + String(i).padStart(3, "0") + ".mp3", format: "VBR MP3", source: "original", length: "300" });
  assert.equal(archivePlan(long).programs.length, QUEUE_MAX);
  const from100 = archivePlan(long, "part100.mp3");
  assert.equal(from100.programs.length, QUEUE_MAX);
  assert.equal(from100.programs[from100.start].f, "part100.mp3");
});

// The player with a stand-in <video>: on-demand programs of unknown length, the queue hook, and seeking.
function fakeVideo() {
  const h = {};
  return {
    h: h,
    currentTime: 0,
    duration: NaN,
    paused: true,
    muted: false,
    volume: 1,
    readyState: 0,
    textTracks: [],
    src: "",
    addEventListener(t, f) {
      (h[t] = h[t] || []).push(f);
    },
    fire(t) {
      (h[t] || []).forEach((f) => f({ type: t }));
    },
    getAttribute(n) {
      return n === "src" && this.src ? this.src : null;
    },
    removeAttribute(n) {
      if (n === "src") this.src = "";
    },
    hasAttribute() {
      return false;
    },
    load() {},
    pause() {
      this.paused = true;
    },
    play() {
      this.paused = false;
      return Promise.resolve();
    },
    querySelectorAll() {
      return [];
    },
    appendChild() {},
  };
}

test("the player: something sent plays as made, learns its length, lines up the next, and seeks only on demand", () => {
  const v = fakeVideo();
  const modes = [];
  let ended = null;
  let learned = 0;
  const next = { id: "b", f: "b.mp4", t: "Second", d: 100 };
  const p = new Player(v, {
    state: (m) => modes.push(m),
    demandEnded: (item) => {
      ended = item;
      return item.id === "a" ? p.playFromStart(next, 0, { rate: 1 }) : false;
    },
    learned: () => learned++,
  });
  const live = { id: "live", f: "live.mp4", t: "Live Film", d: 5000 };
  const tl = { channel: { slug: "slow", sound: "church" }, items: [live], rate: 0.5, total: 5008, starts: [0], gap: 8, epoch: 0 };
  p.tl = tl;
  // Nothing on demand yet: the schedule isn't for seeking.
  p.slot = { item: live, startMs: Date.now() - 1000, endMs: Date.now() + 9e6, slotEndMs: Date.now() + 9e6, rate: 0.5 };
  p.mode = "playing";
  assert.equal(p.seekTo(100), -1, "a live program can't be moved through");
  assert.equal(p.seekBy(30), -1);

  // A program of unknown length needs to be asked for that way.
  const sent = { id: "a", f: "a.mp4", t: "First", d: 0, sent: "video" };
  assert.equal(p.playFromStart(sent, 30), false);
  assert.equal(p.playFromStart(sent, 30, { rate: 1, anyLength: true }), true);
  assert.equal(p.slot.onDemand, true);
  assert.equal(p.slot.into, 30, "where the link said to start");
  assert.equal(p.rate(), 1, "at its own speed, whatever the channel's");
  assert.equal(p.wantsChurch(sent), false, "and without the channel's echo");
  assert.match(v.src, /a\.mp4#t=30$/);
  assert.equal(p.position().d, 0);
  // It plays: the length is the file's.
  v.duration = 240.4;
  v.currentTime = 31;
  v.readyState = 4;
  v.fire("playing");
  assert.equal(p.mode, "playing");
  assert.equal(sent.d, 240);
  assert.equal(learned, 1);
  assert.deepEqual(p.position(), { at: 31, d: 240, rate: 1 });
  // Seeking, on demand: to a place, by some seconds, and never past the ends.
  assert.equal(p.seekTo(100), 100);
  assert.equal(v.currentTime, 100);
  assert.equal(p.seekBy(-15), 85);
  assert.equal(p.seekBy(-500), 0);
  assert.equal(p.seekTo(9999), 238);
  // It ends: the app's next one plays instead of the schedule.
  v.fire("ended");
  assert.equal(ended, sent);
  assert.equal(p.slot.item, next);
  assert.equal(p.slot.onDemand, true);
  assert.match(v.src, /b\.mp4$/);
});

test("the player tells the app when it has given up after one failure after another", () => {
  // Six in a row that won't play: the app is told to stop (the third word), not to line up yet another.
  const v = fakeVideo();
  const heard = [];
  const p = new Player(v, { bad: (item, info, stop) => heard.push([item.id, info.kind, stop]) });
  p.emit("bad", { id: "x" }, { kind: "item" }, true);
  p.emit("bad", { id: "y" }, { kind: "item" });
  assert.deepEqual(heard, [["x", "item", true], ["y", "item", undefined]]);
});

test("the banner and the listing cope with a length that isn't known yet", () => {
  assert.equal(programMeta({ t: "YouTube video", d: 0 }), "");
  assert.equal(programMeta({ t: "A Film", d: 3600, y: 1950 }), "1950 · 1 hr ");
  const html = bannerHtml({ ch: { number: 1, name: "High Noon", color: "#f00", icon: "🌵", kind: "video" }, slot: { item: { t: "YouTube video", d: 0, sent: "video" }, onDemand: true }, pos: { at: 12, d: 0, rate: 1 }, mode: "playing", shifted: true, hints: [] });
  assert.match(html, /FROM YOUR PHONE/);
  assert.match(html, /ON DEMAND/);
  assert.match(html, /width:0\.0%/);
  assert.doesNotMatch(html, /NaN|Infinity/);
  assert.match(html, /<span>0:12<\/span><span><\/span>/, "the time so far, and no time left to give");
});
