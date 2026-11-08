// The secret arcade station: tuned by number only, never listed, link-out only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { ARCADE_CHANNEL, ARCADE_URL, isGuideVisible, isLinkChannel, isSecretChannel, openArcade } from "../web/js/arcade.js";
import { arcadeCard } from "../web/js/ui/views.js";
import { chKey } from "../web/js/util.js";

const normal = { slug: "high-noon", number: 1, name: "High Noon", items: [] };

test("the arcade station is reached by typing 777", () => {
  assert.equal(ARCADE_URL, "https://www.retrogames.cc/");
  assert.equal(ARCADE_CHANNEL.number, 777);
  assert.equal(chKey(ARCADE_CHANNEL), "777");
  assert.equal(isLinkChannel(ARCADE_CHANNEL), true);
  assert.equal(isSecretChannel(ARCADE_CHANNEL), true);
  assert.deepEqual(ARCADE_CHANNEL.items, []);
  // The tuner matches channels by key, so 7-7-7 lands here and nowhere else.
  const channels = [normal, ARCADE_CHANNEL];
  assert.equal(
    channels.filter(function (c) {
      return chKey(c) === "777";
    })[0],
    ARCADE_CHANNEL
  );
});

test("the arcade station never appears in a listing", () => {
  assert.equal(isGuideVisible(ARCADE_CHANNEL, new Set()), false);
  assert.equal(isGuideVisible(normal, new Set()), true);
  assert.equal(isGuideVisible(normal, new Set(["high-noon"])), false);
  // A hidden normal channel stays hidden; the secret stays hidden either way.
  assert.equal(isGuideVisible(ARCADE_CHANNEL, new Set(["retrogames"])), false);
});

test("the arcade card is a link-out, not an embed", () => {
  const html = arcadeCard(ARCADE_CHANNEL);
  assert.match(html, /RETROGAMES\.CC/);
  assert.match(html, /INSERT COIN/);
  assert.match(html, /https:\/\/www\.retrogames\.cc\//);
  assert.match(html, /target="_blank"/);
  assert.match(html, /rel="noopener"/);
  assert.doesNotMatch(html, /<iframe/);
  // The number is the secret: it never appears on the card.
  assert.doesNotMatch(html, /777/);
});

test("OK opens the arcade in a new tab", () => {
  const calls = [];
  function fake(url, target) {
    calls.push([url, target]);
    return null;
  }
  assert.equal(openArcade(fake), true);
  assert.deepEqual(calls, [["https://www.retrogames.cc/", "_blank"]]);
  assert.equal(
    openArcade(function () {
      throw new Error("blocked");
    }),
    false
  );
  // No opener and no window (node): nothing to open.
  assert.equal(openArcade(), false);
});
