import test from "node:test";
import assert from "node:assert/strict";

import { landingPage } from "./landing-page.js";

const content = {
    title: "MovaYakVDoma («Мова як вдома») — Telegram-бот для вивчення англійської",
    description: "MovaYakVDoma — Telegram-бот для вивчення англійської мови.",
    botUrl: "https://t.me/MovaVDomaBot",
};

test("landing has a canonical URL, official bot CTA, and privacy link", () => {
    const page = landingPage({
        brandName: "MovaYakVDoma",
        publicWorkerUrl: "https://example.workers.dev",
        content,
        scriptNonce: "test-nonce",
    });

    assert.match(page, /<html lang="uk">/);
    assert.match(page, /rel="canonical" href="https:\/\/example\.workers\.dev\/"/);
    assert.equal([...page.matchAll(/href="https:\/\/t\.me\/MovaVDomaBot\?start=website"/g)].length, 4);
    assert.match(page, /href="\/privacy"/);
    assert.match(page, /rel="icon" href="\/favicon\.png"/);
    assert.match(page, /\/assets\/vendor\/pico\.min\.css/);
    assert.doesNotMatch(page, /cdn\.jsdelivr\.net/);
    assert.match(page, /\/assets\/landing\/book_house\.svg/);
    assert.match(page, /<h3>Додай слово<\/h3>/);
    assert.match(page, /charge \/ payment for a service/);
    assert.match(page, /Вивчай англійські слова легко та <em>щодня<\/em>/);
    assert.match(page, /Мова як вдома/);
    assert.match(page, /Мова вдома/);
    assert.match(page, /вивчаєш англійську мову/);
    assert.match(page, /OpenAI допомагає підібрати значення/);
    assert.match(page, /DeepL/);
    assert.match(page, /\/assets\/landing\/field_waves\.svg/);
    assert.match(page, /\/assets\/landing\/hero_wheat\.svg/);
    assert.match(page, /\/assets\/landing\/landing\.css/);
    assert.match(page, /\/assets\/landing\/analytics-consent-v2\.js/);
    assert.match(page, /https:\/\/www\.googletagmanager\.com\/gtag\/js\?id=G-7S3RWCWPV3/);
    const consentDefault = page.indexOf('gtag("consent","default"');
    const persistedConsentUpdate = page.indexOf('gtag("consent","update",{analytics_storage:"granted"}');
    const analyticsConfig = page.indexOf('gtag("config","G-7S3RWCWPV3"');
    const tagLoader = page.indexOf("https://www.googletagmanager.com/gtag/js?id=G-7S3RWCWPV3");

    assert.match(page, /gtag\("consent","default",\{ad_storage:"denied",ad_user_data:"denied",ad_personalization:"denied",analytics_storage:"denied"\}\)/);
    assert.ok(consentDefault < persistedConsentUpdate);
    assert.ok(persistedConsentUpdate < analyticsConfig);
    assert.ok(analyticsConfig < tagLoader);
    assert.match(page, /data-consent-banner/);
    assert.match(page, /data-consent-settings/);
    assert.doesNotMatch(page, /QR|qr-code/i);
});

test("landing publishes valid app schema and complete search metadata", () => {
    const page = landingPage({
        brandName: "MovaYakVDoma",
        publicWorkerUrl: "https://movayakvdoma.com",
        content,
        scriptNonce: "schema-nonce",
    });

    const schemaMatch = page.match(/<script type="application\/ld\+json" nonce="schema-nonce">(.+)<\/script>/);
    assert.ok(schemaMatch);
    const schema = JSON.parse(schemaMatch[1]);
    const app = schema["@graph"].find((entry) => entry["@type"] === "SoftwareApplication");
    assert.equal(app.applicationCategory, "EducationalApplication");
    assert.equal(app.installUrl, "https://t.me/MovaVDomaBot");
    assert.deepEqual(app.offers, { "@type": "Offer", price: "0", priceCurrency: "UAH" });
    assert.match(page, /property="og:image" content="https:\/\/movayakvdoma\.com\/assets\/movayakvdoma-logo\.png"/);
    assert.match(page, /name="twitter:card" content="summary"/);
    assert.match(page, /hreflang="uk"/);
});

test("landing passes a validated campaign source to every Telegram CTA", () => {
    const page = landingPage({
        brandName: "MovaYakVDoma",
        publicWorkerUrl: "https://movayakvdoma.com",
        content,
        scriptNonce: "campaign-nonce",
        acquisitionSource: "tiktok_ads",
    });

    assert.equal([...page.matchAll(/href="https:\/\/t\.me\/MovaVDomaBot\?start=tiktok_ads"/g)].length, 4);
});

test("landing escapes configured text before inserting it into HTML", () => {
    const page = landingPage({
        brandName: '<script>alert("x")</script>',
        publicWorkerUrl: "https://example.workers.dev",
        content: { ...content, description: 'safe "description"' },
        scriptNonce: "escape-nonce",
    });

    assert.doesNotMatch(page, /<script>alert/);
    assert.match(page, /&lt;script&gt;alert/);
    assert.match(page, /safe &quot;description&quot;/);
});
