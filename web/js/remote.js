// Turns key presses from a keyboard, a TV remote in a TV browser, or the Android TV wrapper into actions.
// TV browsers report remote buttons in different ways: some send standard key names (ChannelUp),
// some send only legacy keyCodes (webOS 461 = Back, Tizen 10009 = Return, 427/428 = channel).

const BY_KEY = {
  ArrowUp: "up", Up: "up",
  ArrowDown: "down", Down: "down",
  ArrowLeft: "left", Left: "left",
  ArrowRight: "right", Right: "right",
  Enter: "ok", Accept: "ok", Select: "ok",
  Escape: "back", Esc: "back", Backspace: "back", BrowserBack: "back", GoBack: "back", XF86Back: "back",
  PageUp: "chup", ChannelUp: "chup", "+": "chup", "=": "chup",
  PageDown: "chdown", ChannelDown: "chdown", "-": "chdown", _: "chdown",
  MediaPlayPause: "playpause", " ": "playpause", Spacebar: "playpause", k: "playpause", K: "playpause",
  MediaPlay: "play", MediaPause: "pause", MediaStop: "pause",
  MediaTrackNext: "chup", MediaTrackPrevious: "chdown", MediaFastForward: "chup", MediaRewind: "chdown",
  Info: "info", i: "info", I: "info",
  Guide: "guide", g: "guide", G: "guide",
  ContextMenu: "menu", Menu: "menu", Settings: "menu", o: "menu", O: "menu", Tab: "menu",
  ColorF0Red: "red", ColorF1Green: "green", ColorF2Yellow: "yellow", ColorF3Blue: "blue",
  f: "fav", F: "fav",
  c: "cc", C: "cc", Subtitle: "cc", ClosedCaptionToggle: "cc",
  l: "live", L: "live",
  p: "last", P: "last", LastNumberRedial: "last",
  m: "mute", M: "mute",
  v: "look", V: "look",
  "?": "help", h: "help", H: "help",
};

const BY_CODE = {
  38: "up", 40: "down", 37: "left", 39: "right", 13: "ok",
  27: "back", 8: "back", 461: "back", 10009: "back", 166: "back",
  33: "chup", 34: "chdown", 427: "chup", 428: "chdown",
  179: "playpause", 10252: "playpause", 415: "play", 19: "pause", 413: "pause",
  417: "chup", 412: "chdown",
  457: "info", 458: "guide", 18: "menu",
  403: "red", 404: "green", 405: "yellow", 406: "blue",
};

export function actionFor(e) {
  if (!e || e.ctrlKey || e.metaKey || e.altKey) return null;
  const k = e.key;
  if (k && k.length === 1 && k >= "0" && k <= "9") return { type: "digit", digit: Number(k) };
  if (k && Object.prototype.hasOwnProperty.call(BY_KEY, k)) return { type: BY_KEY[k] };
  const c = e.keyCode || e.which || 0;
  if (c >= 48 && c <= 57) return { type: "digit", digit: c - 48 };
  if (c >= 96 && c <= 105) return { type: "digit", digit: c - 96 };
  if (Object.prototype.hasOwnProperty.call(BY_CODE, c)) return { type: BY_CODE[c] };
  return null;
}

// Keys a text field needs for itself; the app only takes Escape, Enter, Up and Down from it.
export function isTypingTarget(el) {
  if (!el || !el.tagName) return false;
  const t = el.tagName.toLowerCase();
  return t === "input" || t === "textarea" || el.isContentEditable;
}

// Ask webOS/Tizen browsers to deliver the colored and media buttons instead of keeping them.
export function registerTvKeys() {
  try {
    const tizen = window.tizen;
    if (tizen && tizen.tvinputdevice) {
      ["ChannelUp", "ChannelDown", "MediaPlayPause", "MediaPlay", "MediaPause", "ColorF0Red", "ColorF1Green", "ColorF2Yellow", "ColorF3Blue", "Info", "Guide"].forEach(function (name) {
        try {
          tizen.tvinputdevice.registerKey(name);
        } catch (e) {
          /* not on this model */
        }
      });
    }
  } catch (e) {
    /* not a Tizen TV */
  }
}
