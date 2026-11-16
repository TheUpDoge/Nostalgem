// Writes a pack list (nostalgem-pack-index/1) for a folder of channel packs, so the TV can browse them:
// Menu ▸ Load a channel pack ▸ Browse the pack list. Run it wherever the packs are kept (never in this
// repo: personal packs stay out of it), then upload the folder and the list together.
//
//   node tools/build-pack-index.mjs <folder> [--title "NostalGem add-ons"] [--by "Mitchel"] > <folder>/index.json
//
// Every .json and .zip in the folder is checked with the TV's own pack checks; one that wouldn't load is
// left out and named on stderr. "programs" counts the item IDs and links a pack lists (a search's
// programs aren't known until the TV runs it). Files are listed by name, beside index.json.

import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { asPack, packFilesFromZip, parsePack, validatePack, PACK_INDEX_FORMAT } from "../web/js/packs.js";

const args = process.argv.slice(2);
const folder = args.find((a) => !a.startsWith("--") && args[args.indexOf(a) - 1] !== "--title" && args[args.indexOf(a) - 1] !== "--by");
const opt = (name) => {
  const i = args.indexOf("--" + name);
  return i >= 0 ? args[i + 1] || "" : "";
};
if (!folder) {
  console.error("Usage: node tools/build-pack-index.mjs <folder> [--title …] [--by …] > <folder>/index.json");
  process.exit(2);
}

// One pack's facts for the list: its name, channels and how many programs it lists.
function facts(pack) {
  const channels = (pack.channels || []).map((c) => ({ number: c.number, name: String(c.name).slice(0, 48) }));
  let programs = 0;
  for (const c of pack.channels || []) for (const s of c.sources || []) programs += (s.items || []).length + (s.urls || []).length;
  return { channels, programs };
}

export async function buildIndex(dir, meta) {
  const names = (await readdir(dir)).filter((n) => /\.(json|zip)$/i.test(n) && n !== "index.json").sort();
  const packs = [];
  const skipped = [];
  for (const name of names) {
    const buf = await readFile(join(dir, name));
    const found = [];
    if (/\.zip$/i.test(name)) {
      try {
        for (const f of packFilesFromZip(new Uint8Array(buf))) found.push({ text: f.text, name: f.name });
      } catch (e) {
        skipped.push(name + ": " + e.message);
        continue;
      }
    } else found.push({ text: buf.toString("utf8"), name });
    const good = [];
    for (const f of found) {
      const parsed = parsePack(f.text);
      const pack = parsed.ok ? asPack(parsed.pack, f.name) : null;
      const v = pack ? validatePack(pack) : { ok: false, errors: parsed.errors };
      if (v.ok) good.push(pack);
      else skipped.push(name + (f.name !== name ? " ▸ " + f.name : "") + ": " + v.errors[0]);
    }
    if (!good.length) continue;
    const all = good.map(facts);
    packs.push({
      name: good.length === 1 ? String(good[0].pack).slice(0, 80) : name.replace(/\.zip$/i, "") + " (" + good.length + " packs)",
      file: name,
      channels: all.flatMap((f) => f.channels),
      programs: all.reduce((t, f) => t + f.programs, 0),
      ...(good.length === 1 && good[0].about ? { about: String(good[0].about).slice(0, 300) } : {}),
      ...(meta.by ? { by: meta.by } : {}),
    });
  }
  return {
    index: { format: PACK_INDEX_FORMAT, title: meta.title || "Channel packs", updated: new Date().toISOString().slice(0, 10), packs },
    skipped,
  };
}

const { index, skipped } = await buildIndex(folder, { title: opt("title"), by: opt("by") });
for (const s of skipped) console.error("left out: " + s);
console.error(index.packs.length + " pack(s) listed");
process.stdout.write(JSON.stringify(index, null, 2) + "\n");
