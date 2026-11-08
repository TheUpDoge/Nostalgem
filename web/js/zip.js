// Reading .zip files, for channel packs that travel together (packs.js). Enough of the format for that:
// files stored or deflated, in folders or not; no passwords, no ZIP64, no split archives. Limits keep a
// small zip from unpacking into something huge. No library: the deflate decoder below follows RFC 1951
// (the same way as zlib's "puff"), and every file is checked against its CRC-32.

const MAX_FILES = 200; // files read from one zip
const MAX_TOTAL = 8 * 1024 * 1024; // bytes unpacked from one zip, in all

function fail(text) {
  const e = new Error(text);
  e.zip = true;
  return e;
}

// ---------- CRC-32 ----------
let crcTable = null;
export function crc32(bytes) {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = crcTable[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// ---------- inflate (RFC 1951) ----------
const LBASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
const LEXT = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
const DBASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
const DEXT = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
const ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

// A canonical Huffman code from its code lengths: how many codes of each length, and the symbols in order.
function huffman(lengths, n) {
  const count = new Uint16Array(16);
  const symbol = new Uint16Array(n);
  for (let s = 0; s < n; s++) count[lengths[s]]++;
  if (count[0] === n) return { count: count, symbol: symbol, empty: true };
  let left = 1;
  for (let len = 1; len < 16; len++) {
    left = left * 2 - count[len];
    if (left < 0) throw fail("This zip is damaged (a bad code table).");
  }
  const offs = new Uint16Array(16);
  for (let len = 1; len < 15; len++) offs[len + 1] = offs[len] + count[len];
  for (let s = 0; s < n; s++) if (lengths[s]) symbol[offs[lengths[s]]++] = s;
  return { count: count, symbol: symbol, empty: false };
}

let fixedLit = null;
let fixedDist = null;
function fixedTables() {
  if (!fixedLit) {
    const l = new Uint8Array(288);
    for (let i = 0; i < 288; i++) l[i] = i < 144 ? 8 : i < 256 ? 9 : i < 280 ? 7 : 8;
    fixedLit = huffman(l, 288);
    const d = new Uint8Array(30).fill(5);
    fixedDist = huffman(d, 30);
  }
}

// Raw deflate data -> its bytes. size: what it should unpack to (a zip says); more is an error.
export function inflateRaw(src, size) {
  const out = new Uint8Array(size);
  let o = 0;
  let pos = 0;
  let buf = 0;
  let cnt = 0;
  const bits = function (n) {
    while (cnt < n) {
      if (pos >= src.length) throw fail("This zip is damaged (a file ends too soon).");
      buf |= src[pos++] << cnt;
      cnt += 8;
    }
    const v = buf & ((1 << n) - 1);
    buf >>>= n;
    cnt -= n;
    return v;
  };
  const decode = function (h) {
    let code = 0;
    let first = 0;
    let index = 0;
    for (let len = 1; len < 16; len++) {
      code |= bits(1);
      const count = h.count[len];
      if (code - count < first) return h.symbol[index + (code - first)];
      index += count;
      first += count;
      first <<= 1;
      code <<= 1;
    }
    throw fail("This zip is damaged (a bad code).");
  };
  const put = function (b) {
    if (o >= size) throw fail("This zip is damaged (a file is bigger than it says).");
    out[o++] = b;
  };
  let last = 0;
  do {
    last = bits(1);
    const type = bits(2);
    if (type === 0) {
      buf = 0;
      cnt = 0;
      if (pos + 4 > src.length) throw fail("This zip is damaged (a file ends too soon).");
      const len = src[pos] | (src[pos + 1] << 8);
      const nlen = src[pos + 2] | (src[pos + 3] << 8);
      pos += 4;
      if (len !== (~nlen & 0xffff)) throw fail("This zip is damaged (a bad stored block).");
      if (pos + len > src.length) throw fail("This zip is damaged (a file ends too soon).");
      for (let i = 0; i < len; i++) put(src[pos++]);
      continue;
    }
    let lit;
    let dist;
    if (type === 1) {
      fixedTables();
      lit = fixedLit;
      dist = fixedDist;
    } else if (type === 2) {
      const nlit = bits(5) + 257;
      const ndist = bits(5) + 1;
      const ncode = bits(4) + 4;
      if (nlit > 286 || ndist > 30) throw fail("This zip is damaged (a bad block header).");
      const lengths = new Uint8Array(320);
      for (let i = 0; i < ncode; i++) lengths[ORDER[i]] = bits(3);
      for (let i = ncode; i < 19; i++) lengths[ORDER[i]] = 0;
      const lencode = huffman(lengths, 19);
      const all = new Uint8Array(nlit + ndist);
      let i = 0;
      while (i < nlit + ndist) {
        const sym = decode(lencode);
        if (sym < 16) {
          all[i++] = sym;
          continue;
        }
        let rep = 0;
        let val = 0;
        if (sym === 16) {
          if (!i) throw fail("This zip is damaged (a repeat with nothing before it).");
          val = all[i - 1];
          rep = 3 + bits(2);
        } else if (sym === 17) rep = 3 + bits(3);
        else rep = 11 + bits(7);
        if (i + rep > nlit + ndist) throw fail("This zip is damaged (too many code lengths).");
        while (rep--) all[i++] = val;
      }
      if (!all[256]) throw fail("This zip is damaged (no end-of-block code).");
      lit = huffman(all.subarray(0, nlit), nlit);
      dist = huffman(all.subarray(nlit), ndist);
    } else {
      throw fail("This zip is damaged (an unknown block type).");
    }
    for (;;) {
      let sym = decode(lit);
      if (sym < 256) {
        put(sym);
        continue;
      }
      if (sym === 256) break;
      sym -= 257;
      if (sym >= 29) throw fail("This zip is damaged (a bad length).");
      const len = LBASE[sym] + bits(LEXT[sym]);
      if (dist.empty) throw fail("This zip is damaged (no distance codes).");
      const ds = decode(dist);
      if (ds >= 30) throw fail("This zip is damaged (a bad distance).");
      const back = DBASE[ds] + bits(DEXT[ds]);
      if (back > o) throw fail("This zip is damaged (a distance too far back).");
      for (let k = 0; k < len; k++) put(out[o - back]);
    }
  } while (!last);
  if (o !== size) throw fail("This zip is damaged (a file is shorter than it says).");
  return out;
}

// ---------- the zip itself ----------
const utf8 = typeof TextDecoder === "function" ? new TextDecoder("utf-8") : null;
function text(bytes) {
  if (utf8) return utf8.decode(bytes);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return s;
}

// A zip (ArrayBuffer or Uint8Array) -> [{ name, data: Uint8Array }] for the files want(name) picks, in the
// order they're stored. Throws an Error with a sentence for people when it can't.
export function readZip(input, want) {
  const u8 = input instanceof Uint8Array ? input : new Uint8Array(input);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const n = u8.length;
  let eocd = -1;
  for (let i = n - 22; i >= Math.max(0, n - 22 - 65535); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw fail("That isn't a zip file (or it's cut short).");
  if (dv.getUint16(eocd + 4, true) !== 0 || dv.getUint16(eocd + 6, true) !== 0) throw fail("A zip split over several files can't be read here.");
  const entries = dv.getUint16(eocd + 10, true);
  const cdOffset = dv.getUint32(eocd + 16, true);
  if (entries === 0xffff || cdOffset === 0xffffffff) throw fail("This zip is in the ZIP64 format, which can't be read here. Zip it again without ZIP64.");
  const out = [];
  let total = 0;
  let p = cdOffset;
  for (let e = 0; e < entries; e++) {
    if (p + 46 > n || dv.getUint32(p, true) !== 0x02014b50) throw fail("This zip is damaged (its list of files).");
    const flags = dv.getUint16(p + 8, true);
    const method = dv.getUint16(p + 10, true);
    const crc = dv.getUint32(p + 16, true);
    const csize = dv.getUint32(p + 20, true);
    const usize = dv.getUint32(p + 24, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    const name = text(u8.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (/\/$/.test(name) || !(want ? want(name) : true)) continue;
    if (out.length >= MAX_FILES) throw fail("This zip has more than " + MAX_FILES + " files to read.");
    if (flags & 1) throw fail(name + " is password-protected.");
    if (method !== 0 && method !== 8) throw fail(name + " is packed a way this can't read (method " + method + "). Zip it again with the usual settings.");
    total += usize;
    if (total > MAX_TOTAL) throw fail("This zip unpacks to more than " + Math.round(MAX_TOTAL / 1048576) + " MB.");
    if (local + 30 > n || dv.getUint32(local, true) !== 0x04034b50) throw fail("This zip is damaged (" + name + ").");
    const start = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
    if (start + csize > n) throw fail("This zip is damaged (" + name + " is cut short).");
    const raw = u8.subarray(start, start + csize);
    const data = method === 0 ? raw.slice() : inflateRaw(raw, usize);
    if (data.length !== usize || crc32(data) !== crc) throw fail("This zip is damaged (" + name + " doesn't check out).");
    out.push({ name: name, data: data });
  }
  return out;
}

// Bytes -> text (UTF-8, without a byte-order mark).
export function utf8Text(bytes) {
  return text(bytes).replace(/^﻿/, "");
}
