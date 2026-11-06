import { test } from "node:test";
import assert from "node:assert/strict";
import { countryOfZone, countryOfLanguage, guessCountry, playableIn, packRegion } from "../web/js/regions.js";
import { COUNTRIES } from "../web/js/tzcountry.js";

test("a TV's country from its time zone, then its language", () => {
  assert.equal(countryOfZone("America/New_York"), "US");
  assert.equal(countryOfZone("America/Toronto"), "CA");
  assert.equal(countryOfZone("Europe/London"), "GB");
  assert.equal(countryOfZone("Asia/Calcutta"), "IN", "old names browsers still report");
  assert.equal(countryOfZone("Asia/Kolkata"), "IN");
  assert.equal(countryOfZone("US/Pacific"), "US");
  assert.equal(countryOfZone("Australia/Sydney"), "AU");
  assert.equal(countryOfZone("UTC"), "");
  assert.equal(countryOfLanguage("en-GB"), "GB");
  assert.equal(countryOfLanguage("zh-Hant-TW"), "TW");
  assert.equal(countryOfLanguage("es-419"), "");
  assert.equal(countryOfLanguage("en"), "");
  assert.equal(guessCountry("Europe/Berlin", ["en-US"]), "DE", "the time zone wins over an English-US language setting");
  assert.equal(guessCountry("UTC", ["fr", "fr-CA"]), "CA");
  assert.equal(guessCountry("", []), "");
});

test("region restrictions, short and long, round trip", () => {
  assert.equal(packRegion(null), "");
  assert.equal(packRegion({ allowed: ["US", "CA"] }), "+CAUS");
  assert.equal(packRegion({ blocked: ["GB", "DE"] }), "-DEGB");
  assert.equal(packRegion({ blocked: [] }), "");
  const r1 = "+CAUS";
  assert.ok(playableIn(r1, "US") && playableIn(r1, "CA") && !playableIn(r1, "GB"));
  const r2 = "-DEGB";
  assert.ok(playableIn(r2, "US") && !playableIn(r2, "DE") && !playableIn(r2, "GB"));
  assert.ok(playableIn(r2, ""), "unknown country: try it");
  assert.ok(playableIn("", "GB"), "no restriction");
  // A long allowed list becomes a bitmap of 249 countries, under 50 characters.
  const all = [];
  for (let i = 0; i < COUNTRIES.length; i += 2) all.push(COUNTRIES.substr(i, 2));
  const many = all.filter((c, i) => i % 3 !== 0);
  const big = packRegion({ allowed: many });
  assert.equal(big.charAt(0), "*");
  assert.ok(big.length < 50, big.length + " characters");
  for (const c of all) assert.equal(playableIn(big, c), many.indexOf(c) >= 0, c);
  // …and a long blocked list too.
  const blockedMost = packRegion({ blocked: many });
  for (const c of all) assert.equal(playableIn(blockedMost, c), many.indexOf(c) < 0, c);
  assert.ok(playableIn(big, "ZZ"), "a country the lineup doesn't know: try it");
});
