import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const publicAsset = (name) => readFileSync(
    new URL(`../../../public/${name}`, import.meta.url),
    "utf8"
);

test("crawl assets expose the canonical landing without indexing utility pages", () => {
    const robots = publicAsset("robots.txt");
    const sitemap = publicAsset("sitemap.xml");

    assert.match(robots, /User-agent: \*/);
    assert.match(robots, /Sitemap: https:\/\/movayakvdoma\.com\/sitemap\.xml/);
    assert.match(sitemap, /<loc>https:\/\/movayakvdoma\.com\/<\/loc>/);
    assert.doesNotMatch(sitemap, /\/privacy/);
});
