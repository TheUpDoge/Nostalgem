// About the Internet Archive: the words and links behind Menu ▸ About the Archive.
// Kept in its own module so the text can be tested without a browser.

// All three were checked live and return HTTP 200. The terms page lives at /about/terms;
// the older /about/terms.php address redirects there.
export const ARCHIVE_ABOUT_URL = "https://archive.org/about/";
export const ARCHIVE_DONATE_URL = "https://archive.org/donate";
export const ARCHIVE_TERMS_URL = "https://archive.org/about/terms";

export function archiveAboutHtml() {
  return (
    "<p>The <b>Internet Archive</b> (archive.org) is a non-profit digital library working " +
    "toward universal access to all knowledge — books, films, music, radio and more, " +
    "preserved for everyone.</p>" +
    "<p>NostalGem's built-in channels play <b>public-domain Archive material only</b>, checked " +
    "before it ships. The lineup builder skips lending-library items, anything dated after 1977 " +
    "(except NASA and Creative Commons sources), and files that carry the fingerprints of ripped " +
    "commercial releases. That filtering is a good-faith effort, not a guarantee.</p>" +
    "<p>A note on this page doesn't change the copyright status of anything. If something " +
    "shouldn't be on, it gets taken off — see “About the programming” in the README.</p>" +
    "<p>Channels you add yourself — by search, or by loading a channel pack — are your choice " +
    "on your own TV. They are not part of the shipped lineup.</p>" +
    "<p>If you enjoy it, please consider donating — the Archive's bandwidth makes this work: " +
    '<a href="https://archive.org/donate" target="_blank" rel="noopener">archive.org/donate</a>. ' +
    "The Archive's terms of use: " +
    '<a href="https://archive.org/about/terms" target="_blank" rel="noopener">archive.org/about/terms</a>. ' +
    "More about the Archive: " +
    '<a href="https://archive.org/about/" target="_blank" rel="noopener">archive.org/about</a>.</p>'
  );
}
