// The secret South Park station: tuned by number only, never listed, link-out only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { SOUTH_PARK_CHANNEL, SOUTH_PARK_URL, isGuideVisible, isLinkChannel, isSecretChannel, openSouthPark } from "../web/js/southpark.js";
import { southParkCard } from "../web/js/ui/views.js";
import { chKey } from "../web/js/util.js";

const normal = { slug: "high-noon", number: 1, name: "High Noon", items: [] };

test("the South Park station is reached by typing 420", () => {
  assert.equal(SOUTH_PARK_URL, "https://southpark.cc.com/");
  assert.equal(SOUTH_PARK_CHANNEL.number, 420);
  assert.equal(chKey(SOUTH_PARK_CHANNEL), "420");
  assert.equal(isLinkChannel(SOUTH_PARK_CHANNEL), true);
  assert.equal(isSecretChannel(SOUTH_PARK_CHANNEL), true);
  assert.deepEqual(SOUTH_PARK_CHANNEL.items, []);
  // The tuner matches channels by key, so 4-2-0 lands here and nowhere else.
  const channels = [normal, SOUTH_PARK_CHANNEL];
  assert.equal(
    channels.filter(function (c) {
      return chKey(c) === "420";
    })[0],
    SOUTH_PARK_CHANNEL
  );
});

test("the South Park station never appears in a listing", () => {
  assert.equal(isGuideVisible(SOUTH_PARK_CHANNEL, new Set()), false);
  assert.equal(isGuideVisible(normal, new Set()), true);
  assert.equal(isGuideVisible(normal, new Set(["high-noon"])), false);
  // A hidden normal channel stays hidden; the secret stays hidden either way.
  assert.equal(isGuideVisible(SOUTH_PARK_CHANNEL, new Set(["south-park"])), false);
});

test("the South Park card is a link-out, not an embed", () => {
  const html = southParkCard(SOUTH_PARK_CHANNEL);
  assert.match(html, /SOUTH PARK/);
  assert.match(html, /RESPECT MY AUTHORITAH/);
  assert.match(html, /https:\/\/southpark\.cc\.com\//);
  assert.match(html, /target="_blank"/);
  assert.match(html, /rel="noopener"/);
  assert.doesNotMatch(html, /<iframe/);
  // The number is the secret: it never appears on the card.
  assert.doesNotMatch(html, /420/);
});

test("OK opens South Park in a new tab", () => {
  const calls = [];
  function fake(url, target) {
    calls.push([url, target]);
    return null;
  }
  assert.equal(openSouthPark(fake), true);
  assert.deepEqual(calls, [["https://southpark.cc.com/", "_blank"]]);
  assert.equal(
    openSouthPark(function () {
      throw new Error("blocked");
    }),
    false
  );
  // No opener and no window (node): nothing to open.
  assert.equal(openSouthPark(), false);
});
