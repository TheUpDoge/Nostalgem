// The secret arcade station: a link-out to RetroGames.cc, tuned by number only.
// Kept in its own module so the secret's rules can be tested without a browser.
//
// The number is the secret: it never appears in the guide, the README channel list,
// or any listing. The channel itself carries no game files and no iframe —
// the station is a card with a link.

export const ARCADE_URL = "https://www.retrogames.cc/";

export const ARCADE_CHANNEL = {
  slug: "retrogames",
  number: 777,
  name: "RetroGames.cc",
  tagline: "Retro console and arcade games, playable in your browser.",
  icon: "🕹️",
  color: "#ff2a6d",
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

// Open the arcade in a new tab. opener defaults to window.open in a browser;
// tests pass a fake. Returns true when a tab was asked for.
export function openArcade(opener) {
  var open = opener;
  if (typeof open !== "function") {
    if (typeof window === "undefined" || typeof window.open !== "function") return false;
    open = window.open;
  }
  var w = null;
  try {
    w = open(ARCADE_URL, "_blank");
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
