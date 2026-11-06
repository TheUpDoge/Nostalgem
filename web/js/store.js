// Per-TV settings in localStorage. Storage can be missing or blocked (private mode, some TV browsers),
// so every call is wrapped and the app works without it.

const PREFIX = "nostalgem:";

export function load(key, fallback) {
  try {
    const v = window.localStorage.getItem(PREFIX + key);
    return v == null ? fallback : JSON.parse(v);
  } catch (e) {
    return fallback;
  }
}

export function save(key, value) {
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch (e) {
    return false;
  }
}
