// Where a YouTube program can play. The lineup builder notes each video's region restriction (an
// item's "r"); the TV works out which country it's in from its time zone (or, failing that, its
// language) and leaves the programs that can't play there out of the schedule, so a viewer abroad
// sees a clean lineup instead of program after program being skipped.
//
//   r: "+USCA"       only in these countries
//      "-DEGB"       everywhere except these
//      "*<base64>"   a long list: a bitmap of the countries it plays in, in the order of the lineup's
//                    "countries" (two letters each)

import { TZ_COUNTRY, COUNTRIES } from "./tzcountry.js";

let zones = null;
export function countryOfZone(tz) {
  if (!zones) {
    zones = {};
    TZ_COUNTRY.split(";").forEach(function (part) {
      const cc = part.slice(0, 2);
      part
        .slice(3)
        .split(",")
        .forEach(function (z) {
          zones[z] = cc;
        });
    });
  }
  return zones[tz] || "";
}

// "en-GB" → "GB", "zh-Hant-TW" → "TW"; "en", "es-419" → "".
export function countryOfLanguage(lang) {
  const m = /^[a-z]{2,3}(?:[-_][a-z]{4})?[-_]([a-z]{2})(?:$|[-_])/i.exec(String(lang || ""));
  return m ? m[1].toUpperCase() : "";
}

// This device's country, best guess: its time zone, else its languages.
export function guessCountry(tz, languages) {
  const z = countryOfZone(tz);
  if (z) return z;
  const list = languages || [];
  for (let i = 0; i < list.length; i++) {
    const c = countryOfLanguage(list[i]);
    if (c) return c;
  }
  return "";
}

function codeIndex(all, cc) {
  for (let i = 0; i < all.length; i += 2) if (all.charAt(i) === cc.charAt(0) && all.charAt(i + 1) === cc.charAt(1)) return i / 2;
  return -1;
}

// Can a program with restriction r play in country cc? Unknown country or no restriction: yes.
export function playableIn(r, cc, countries) {
  if (!r || !cc) return true;
  const kind = r.charAt(0);
  if (kind === "+" || kind === "-") {
    let listed = false;
    for (let i = 1; i < r.length; i += 2) {
      if (r.charAt(i) === cc.charAt(0) && r.charAt(i + 1) === cc.charAt(1)) {
        listed = true;
        break;
      }
    }
    return kind === "+" ? listed : !listed;
  }
  if (kind === "*") {
    const i = codeIndex(countries || COUNTRIES, cc);
    if (i < 0) return true;
    let bits = "";
    try {
      bits = atob(r.slice(1));
    } catch (e) {
      return true;
    }
    return !!(bits.charCodeAt(i >> 3) & (1 << (i & 7)));
  }
  return true;
}

// YouTube's regionRestriction ({ allowed: [...] } or { blocked: [...] }) → r, as short as it can be.
// Lists of more than 20 countries become a bitmap over `countries`.
export function packRegion(rr, countries) {
  if (!rr || (!rr.allowed && !rr.blocked)) return "";
  const allowed = !!rr.allowed;
  const codes = (rr.allowed || rr.blocked)
    .filter(function (c) {
      return /^[A-Z]{2}$/.test(c);
    })
    .sort();
  if (!allowed && !codes.length) return "";
  if (codes.length <= 20) return (allowed ? "+" : "-") + codes.join("");
  const all = countries || COUNTRIES;
  const n = all.length / 2;
  const bytes = [];
  for (let i = 0; i < n; i++) {
    const listed = codes.indexOf(all.substr(2 * i, 2)) >= 0;
    if (allowed ? listed : !listed) bytes[i >> 3] = (bytes[i >> 3] || 0) | (1 << (i & 7));
  }
  let bin = "";
  for (let i = 0; i < Math.ceil(n / 8); i++) bin += String.fromCharCode(bytes[i] || 0);
  return "*" + btoa(bin);
}
