// Local preview of the extra station-card looks (not on the dial, not loaded by the TV).
//   npm start
//   http://localhost:8080/theme-preview.html
//   http://localhost:8080/theme-preview.html?theme=neonrain&card=loading
// card is loading, ad, or upnext. shot=1 hides the link bar, for a clean picture.
// The numbers on the cards (91, 92…) are labels so the eyebrow has a channel line. They are not in the dial.

import { FAMILIES, cardClass, loadCards } from "./js/cards.js";
import { loadingCard, gapCard, adBreakCard } from "./js/ui/views.js";

const SHIPPED = {
  western: 1,
  serial: 1,
  noir: 1,
  horror: 1,
  scifi: 1,
  space: 1,
  toon: 1,
  anime: 1,
  comedy: 1,
  music: 1,
  silent: 1,
  reel: 1,
  tech: 1,
  gameshow: 1,
  desk: 1,
  radio: 1,
  retro: 1,
};

const SAMPLES = {
  neonrain: { title: "Paper Lanterns", y: 1982, d: 4920, number: 91 },
  hardchrome: { title: "Static Mercy", y: 2019, d: 5400, number: 92 },
  polygon: { title: "Room Twelve", y: 1992, d: 4680, number: 93 },
  glowcircuit: { title: "First Light", y: 1982, d: 5100, number: 94 },
  crystalsignal: { title: "Cut Glass", y: 1984, d: 5040, number: 95 },
};

const SCREENS = ["loading", "ad", "upnext"];
const SCREEN_LABEL = { loading: "LOADING", ad: "AD", upnext: "UP NEXT" };

function extras() {
  return FAMILIES.filter(function (f) {
    return !SHIPPED[f.id];
  });
}

function sample(id) {
  return SAMPLES[id] || { title: "Next Picture", y: 1977, d: 4800, number: 90 };
}

function channel(f) {
  const s = sample(f.id);
  return { slug: "preview-" + f.id, name: f.name, number: s.number, kind: "video", tagline: f.name, color: "#ffffff", icon: "" };
}

function render(f, which, cards) {
  const ch = channel(f);
  const s = sample(f.id);
  if (which === "loading") return loadingCard(ch, cards, 1700000000000);
  if (which === "ad") {
    const quips = (cards[f.id] && cards[f.id].ad) || [];
    return adBreakCard(quips[0] || "an ad.", ch);
  }
  return gapCard(
    ch,
    { item: { t: "Now Playing", d: 3600 }, next: { t: s.title, d: s.d, y: s.y }, startMs: 1700000000000, slotEndMs: Date.now() + 7000 },
    false,
    [],
    cards
  );
}

function kindClass(which) {
  if (which === "ad") return "adbreak";
  if (which === "upnext") return "gap";
  return "tuning";
}

const params = new URLSearchParams(location.search);
const only = params.get("theme");
const which = params.get("card") || "loading";
const shot = params.get("shot") === "1";

loadCards("data/cards.json").then(function (cards) {
  const list = extras();
  const root = document.getElementById("root");
  if (only) {
    let f = null;
    for (let i = 0; i < list.length; i++) if (list[i].id === only) f = list[i];
    if (!f) {
      root.textContent = "No extra theme named " + only + ".";
      return;
    }
    document.body.className = shot ? "shot" : "";
    const stage = document.createElement("div");
    stage.id = "stage";
    stage.style.cssText = "position:fixed;top:0;left:0;right:0;bottom:0;";
    const card = document.createElement("div");
    card.className = "card card-" + kindClass(which) + " " + cardClass(channel(f));
    card.innerHTML = render(f, which, cards);
    stage.appendChild(card);
    root.appendChild(stage);
    if (!shot) {
      const nav = document.createElement("div");
      nav.className = "nav";
      let html = "";
      list.forEach(function (t) {
        SCREENS.forEach(function (sc) {
          html += '<a href="?theme=' + t.id + "&card=" + sc + '">' + t.name + " · " + SCREEN_LABEL[sc] + "</a>";
        });
      });
      html += '<a href="theme-preview.html">all of them</a>';
      nav.innerHTML = html;
      document.body.appendChild(nav);
    }
    return;
  }
  document.body.className = "sheet";
  let head = '<div class="sheet-head">NOSTALGEM · EXTRA CHANNEL LOOKS</div>';
  head += '<div class="sheet-note">Not on the dial. Same cards the app draws: loading, the muted ad, and up next. The channel numbers are labels for the eyebrow, not assignments. One at a time: add ?theme=neonrain&amp;card=loading (card is loading, ad, or upnext).</div>';
  head += "<div class=\"grid\"><div></div>";
  SCREENS.forEach(function (sc) {
    head += '<div class="colhead">' + SCREEN_LABEL[sc] + "</div>";
  });
  list.forEach(function (t) {
    head += '<div class="rowhead">' + t.name.toUpperCase() + "</div>";
    SCREENS.forEach(function (sc) {
      const src = "theme-preview.html?theme=" + t.id + "&card=" + sc + "&shot=1";
      head += '<div class="cell"><iframe src="' + src + '" title="' + t.name + " " + sc + '" width="640" height="360"></iframe></div>';
    });
  });
  head += "</div>";
  if (!list.length) head += '<div class="sheet-note">No extra themes are registered.</div>';
  root.innerHTML = head;
});
