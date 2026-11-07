// About the Archive: the links are the ones that were checked live, and the text
// says plainly what a disclaimer can and can't do.
import { test } from "node:test";
import assert from "node:assert/strict";
import { ARCHIVE_ABOUT_URL, ARCHIVE_DONATE_URL, ARCHIVE_TERMS_URL, archiveAboutHtml } from "../web/js/about.js";

test("the Archive links are the checked addresses", () => {
  assert.equal(ARCHIVE_ABOUT_URL, "https://archive.org/about/");
  assert.equal(ARCHIVE_DONATE_URL, "https://archive.org/donate");
  assert.equal(ARCHIVE_TERMS_URL, "https://archive.org/about/terms");
});

test("the disclaimer says what the app is, that it hosts nothing, and how to get something taken off", () => {
  const html = archiveAboutHtml();
  assert.match(html, /non-profit digital library/);
  assert.match(html, /universal access to all knowledge/);
  assert.match(html, /non-commercial/);
  assert.match(html, /not sold/);
  assert.match(html, /hosts no video/);
  assert.match(html, /want it off/);
  assert.ok(html.indexOf('href="https://github.com/TheUpDoge/Nostalgem/issues"') >= 0, "takedown link");
  assert.match(html, /doesn't change the copyright status/);
  assert.match(html, /your choice/);
  assert.match(html, /archive\.org\/donate/);
  assert.match(html, /archive\.org\/about\/terms/);
  assert.match(html, /archive\.org\/about/);
  assert.doesNotMatch(html, /terms\.php/);
  for (const url of [ARCHIVE_ABOUT_URL, ARCHIVE_DONATE_URL, ARCHIVE_TERMS_URL]) {
    assert.ok(html.indexOf('href="' + url + '"') >= 0, url + " linked");
  }
});
