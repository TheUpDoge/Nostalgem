// About, disclaimer and donate: the words and links behind Menu ▸ Disclaimer & donate, and the
// stand-alone about.html page. Kept in its own module so the text can be tested without a browser.

// All three were checked live and return HTTP 200. The terms page lives at /about/terms;
// the older /about/terms.php address redirects there.
export const ARCHIVE_ABOUT_URL = "https://archive.org/about/";
export const ARCHIVE_DONATE_URL = "https://archive.org/donate";
export const ARCHIVE_TERMS_URL = "https://archive.org/about/terms";
export const ISSUES_URL = "https://github.com/TheUpDoge/Nostalgem/issues";

function link(url, text) {
  return '<a href="' + url + '" target="_blank" rel="noopener">' + text + "</a>";
}

export function archiveAboutHtml() {
  return (
    "<p><b>NostalGem is free, non-commercial and personal.</b> It's made for private, personal use: " +
    "a way into public library collections, a tool for learning, and something to enjoy. It is not sold, " +
    "it carries no ads, it has no accounts, and nobody pays for anything.</p>" +
    "<p><b>It hosts no video.</b> The Archive channels stream straight from the <b>Internet Archive</b> " +
    "(archive.org), a non-profit digital library working toward universal access to all knowledge. " +
    "The YouTube channels play through YouTube's own player. Every program belongs to its rights " +
    "holders; NostalGem claims no ownership of any of it.</p>" +
    "<p>The lineup is picked from the Archive's public collections by a builder that skips " +
    "lending-library items and files that look like ripped releases. That's a good-faith effort, not a " +
    "guarantee, and a note like this one doesn't change the copyright status of anything. " +
    "<b>If you hold the rights to something here and want it off, say so at " +
    link(ISSUES_URL, "github.com/TheUpDoge/Nostalgem/issues") +
    " and it comes off.</b> Channels you add yourself (by search or a channel pack) are your choice on " +
    "your own TV.</p>" +
    "<p><b>Please support the Internet Archive.</b> Its bandwidth makes every Archive channel work. " +
    "Donate: " +
    link(ARCHIVE_DONATE_URL, "archive.org/donate") +
    " · Terms of use: " +
    link(ARCHIVE_TERMS_URL, "archive.org/about/terms") +
    " · More: " +
    link(ARCHIVE_ABOUT_URL, "archive.org/about") +
    "</p>"
  );
}
