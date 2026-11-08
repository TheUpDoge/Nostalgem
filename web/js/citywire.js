// The secret City Wire station: a link-out to ASCII City (asciicity.com), tuned by number only.
// Kept in its own module so the secret's rules can be tested without a browser.
//
// The number is the secret: it never appears in the guide, the README channel list,
// or any listing. The station is a card with a link and a QR code, like 420 and 777.

export const CITY_WIRE_URL = "https://asciicity.com/";

export const CITY_WIRE_CHANNEL = {
  slug: "city-wire",
  number: 555,
  name: "ASCII City",
  tagline: "A whole city drawn in text characters.",
  icon: "🏙️",
  color: "#39ff6a",
  kind: "link",
  secret: true,
  items: [],
};

// Open ASCII City in a new tab. opener defaults to window.open in a browser;
// tests pass a fake. Returns true when a tab was asked for.
export function openCityWire(opener) {
  var open = opener;
  if (typeof open !== "function") {
    if (typeof window === "undefined" || typeof window.open !== "function") return false;
    open = window.open;
  }
  var w = null;
  try {
    w = open(CITY_WIRE_URL, "_blank");
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
