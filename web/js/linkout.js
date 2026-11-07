// Link-out stations: hidden channels that show a card with a link instead of a schedule — 420 (South Park)
// and 777 (RetroGames.cc). Each station lives in its own module (southpark.js, arcade.js); this is the
// one place main.js asks about them, so adding a third is one more line here.

import { ARCADE_CHANNEL, ARCADE_URL, openArcade, isLinkChannel, isGuideVisible } from "./arcade.js";
import { SOUTH_PARK_CHANNEL, SOUTH_PARK_URL, openSouthPark } from "./southpark.js";

export { isLinkChannel, isGuideVisible };

export const LINK_CHANNELS = [SOUTH_PARK_CHANNEL, ARCADE_CHANNEL];

const STATIONS = {};
STATIONS[SOUTH_PARK_CHANNEL.slug] = { url: SOUTH_PARK_URL, open: openSouthPark, card: "southpark" };
STATIONS[ARCADE_CHANNEL.slug] = { url: ARCADE_URL, open: openArcade, card: "arcade" };

function station(ch) {
  return (ch && STATIONS[ch.slug]) || null;
}

// The address a link-out station points at ("" for any other channel).
export function linkUrl(ch) {
  const st = station(ch);
  return st ? st.url : "";
}

// Which full-screen card shows it (the CSS class is card-<name>).
export function linkCardName(ch) {
  const st = station(ch);
  return st ? st.card : "link";
}

// OK on a link-out station: open its site in a new tab. Returns true when a tab was asked for.
export function openLinkChannel(ch, opener) {
  const st = station(ch);
  return st ? st.open(opener) : false;
}
