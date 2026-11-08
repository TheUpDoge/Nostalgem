// The secret City Wire station: 555 goes to ASCII City; tuned by number only, never listed, link-out only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { CITY_WIRE_CHANNEL, CITY_WIRE_URL, openCityWire } from "../web/js/citywire.js";
import { LINK_CHANNELS, isGuideVisible, isLinkChannel, linkUrl, linkCardName } from "../web/js/linkout.js";
import { cityWireCard, linkCard } from "../web/js/ui/views.js";
import { chKey } from "../web/js/util.js";

test("555 is ASCII City, a hidden link-out station", () => {
  assert.equal(CITY_WIRE_URL, "https://asciicity.com/");
  assert.equal(chKey(CITY_WIRE_CHANNEL), "555");
  assert.equal(isLinkChannel(CITY_WIRE_CHANNEL), true);
  assert.equal(isGuideVisible(CITY_WIRE_CHANNEL, new Set()), false);
  assert.ok(LINK_CHANNELS.includes(CITY_WIRE_CHANNEL));
  assert.equal(linkUrl(CITY_WIRE_CHANNEL), CITY_WIRE_URL);
  assert.equal(linkCardName(CITY_WIRE_CHANNEL), "citywire");
  // Every link-out station has its own number.
  const keys = LINK_CHANNELS.map(chKey);
  assert.equal(new Set(keys).size, keys.length);
});

test("its card links out with a QR code, no embed", () => {
  const html = linkCard(CITY_WIRE_CHANNEL, false);
  assert.equal(html, cityWireCard(CITY_WIRE_CHANNEL, false));
  assert.match(html, /ASCII CITY/);
  assert.match(html, /href="https:\/\/asciicity\.com\/"/);
  assert.match(html, /data-url="https:\/\/asciicity\.com\/"/);
  assert.doesNotMatch(html, /<iframe/);
  assert.match(cityWireCard(CITY_WIRE_CHANNEL, true), /Scan the code/);
});

test("OK opens it in a new tab without handing over this page", () => {
  const calls = [];
  const tab = { opener: "us" };
  assert.equal(
    openCityWire(function (url, target) {
      calls.push([url, target]);
      return tab;
    }),
    true
  );
  assert.deepEqual(calls, [[CITY_WIRE_URL, "_blank"]]);
  assert.equal(tab.opener, null);
});
