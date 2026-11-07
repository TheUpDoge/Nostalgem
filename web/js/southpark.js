// The secret South Park station: a link-out to the official South Park site, tuned by number only.
// Kept in its own module so the secret's rules can be tested without a browser.
//
// The number is the secret: it never appears in the guide, the README channel list,
// or any listing. The channel itself carries no episodes, no files and no iframe —
// southpark.cc.com only allows framing from its own origin, so the station is a card with a link.

export const SOUTH_PARK_URL = "https://southpark.cc.com/";

export const SOUTH_PARK_CHANNEL = {
  slug: "south-park",
  number: 420,
  name: "South Park",
  tagline: "Full episodes, clips and more from the official site.",
  icon: "📺",
  color: "#fffb96",
  kind: "link",
  secret: true,
  items: [],
};

export function isLinkChannel(ch) {
  return !!ch && ch.kind === "link";
}

export function isSecretChannel(ch) {
  return !!ch && !!ch.secret;
}

// The guide, the surf list and the phone remote all list visible channels only.
export function isGuideVisible(ch, hidden) {
  if (!ch || ch.secret) return false;
  return !(hidden && hidden.has(ch.slug));
}

// Open South Park in a new tab. opener defaults to window.open in a browser;
// tests pass a fake. Returns true when a tab was asked for.
export function openSouthPark(opener) {
  var open = opener;
  if (typeof open !== "function") {
    if (typeof window === "undefined" || typeof window.open !== "function") return false;
    open = window.open;
  }
  var w = null;
  try {
    w = open(SOUTH_PARK_URL, "_blank");
  } catch (e) {
    return false;
  }
  if (w) {
    try {
      w.opener = null;
    } catch (e) {
      /* an old browser that keeps the opener: the link still opens */
    }
  }
  return true;
}
