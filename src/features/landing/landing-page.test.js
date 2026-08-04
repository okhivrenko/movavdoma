import test from "node:test";
import assert from "node:assert/strict";

import { landingPage } from "./landing-page.js";

const content = {
    title: "MovaYakVDoma — англійські слова щодня у Telegram",
    description: "Вивчай слова у Telegram.",
    botUrl: "https://t.me/movayakvdoma_bot",
};

test("landing has a canonical URL, official bot CTA, and privacy link", () => {
    const page = landingPage({
        brandName: "MovaYakVDoma",
        publicWorkerUrl: "https://example.workers.dev",
        content,
    });

    assert.match(page, /<html lang="uk">/);
    assert.match(page, /rel="canonical" href="https:\/\/example\.workers\.dev\/"/);
    assert.match(page, /href="https:\/\/t\.me\/movayakvdoma_bot"/);
    assert.match(page, /href="\/privacy"/);
    assert.match(page, /rel="icon" href="\/favicon\.png"/);
    assert.match(page, /\/assets\/vendor\/pico\.min\.css/);
    assert.doesNotMatch(page, /cdn\.jsdelivr\.net/);
    assert.match(page, /\/assets\/landing\/book_house\.svg/);
    assert.match(page, /<h3>Додай слово<\/h3>/);
    assert.match(page, /charge \/ payment for a service/);
    assert.match(page, /Вивчай англійські слова легко та <em>щодня<\/em>/);
    assert.match(page, /\/assets\/landing\/field_waves\.svg/);
    assert.match(page, /\/assets\/landing\/hero_wheat\.svg/);
    assert.match(page, /\/assets\/landing\/landing\.css/);
    assert.doesNotMatch(page, /QR|qr-code/i);
});

test("landing escapes configured text before inserting it into HTML", () => {
    const page = landingPage({
        brandName: '<script>alert("x")</script>',
        publicWorkerUrl: "https://example.workers.dev",
        content: { ...content, description: 'safe "description"' },
    });

    assert.doesNotMatch(page, /<script>alert/);
    assert.match(page, /&lt;script&gt;alert/);
    assert.match(page, /safe &quot;description&quot;/);
});
