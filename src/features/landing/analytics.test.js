import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const analyticsSource = readFileSync(
    new URL("../../../public/assets/landing/analytics.js", import.meta.url),
    "utf8"
);

function analyticsBrowser({ initialConsent = null, initialCookie = "" } = {}) {
    const handlers = {};
    const scripts = [];
    const values = new Map();
    const expiredCookies = [];
    if (initialConsent) values.set("movayakvdoma_analytics_consent", initialConsent);
    const banner = { hidden: true };
    const acceptButton = {
        addEventListener(event, handler) { handlers[`accept:${event}`] = handler; },
        focus() {},
    };
    const rejectButton = {
        addEventListener(event, handler) { handlers[`reject:${event}`] = handler; },
    };
    const settingsButton = {
        addEventListener(event, handler) { handlers[`settings:${event}`] = handler; },
        focus() {},
    };
    const analyticsLink = {
        dataset: { analyticsEvent: "telegram_cta_click", analyticsLocation: "test" },
        addEventListener(event, handler) { handlers[`link:${event}`] = handler; },
    };
    const document = {
        head: { append(script) { scripts.push(script); } },
        createElement() { return {}; },
        querySelector(selector) {
            return {
                "[data-consent-banner]": banner,
                "[data-consent-accept]": acceptButton,
                "[data-consent-reject]": rejectButton,
            }[selector];
        },
        querySelectorAll(selector) {
            if (selector === "[data-consent-settings]") return [settingsButton];
            if (selector === "[data-analytics-event]") return [analyticsLink];
            return [];
        },
    };
    Object.defineProperty(document, "cookie", {
        get() { return initialCookie; },
        set(value) { expiredCookies.push(value); },
    });
    const window = {
        localStorage: {
            getItem(key) { return values.get(key) ?? null; },
            setItem(key, value) { values.set(key, value); },
        },
    };

    vm.runInNewContext(analyticsSource, { document, window, Date });
    return { banner, expiredCookies, handlers, scripts, values, window };
}

test("analytics does not contact Google before consent and loads once after acceptance", () => {
    const browser = analyticsBrowser();

    assert.equal(browser.banner.hidden, false);
    assert.equal(browser.scripts.length, 0);

    browser.handlers["accept:click"]();
    assert.equal(browser.values.get("movayakvdoma_analytics_consent"), "granted");
    assert.equal(browser.scripts.length, 1);
    assert.equal(browser.scripts[0].src, "https://www.googletagmanager.com/gtag/js?id=G-7S3RWCWPV3");

    browser.handlers["accept:click"]();
    assert.equal(browser.scripts.length, 1);
    assert.equal(typeof browser.window.gtag, "function");
});

test("persisted denial blocks Google until the user later opts in", () => {
    const browser = analyticsBrowser({ initialConsent: "denied" });

    assert.equal(browser.banner.hidden, true);
    assert.equal(browser.scripts.length, 0);
    browser.handlers["link:click"]();
    assert.equal(browser.window.dataLayer, undefined);

    browser.handlers["settings:click"]();
    assert.equal(browser.banner.hidden, false);
    browser.handlers["accept:click"]();
    assert.equal(browser.scripts.length, 1);
});

test("revoking consent stops CTA events, clears GA cookies, and can be reversed", () => {
    const browser = analyticsBrowser({ initialCookie: "_ga=one; _ga_TEST=two; session=three" });
    browser.handlers["accept:click"]();
    browser.handlers["link:click"]();

    const eventsBeforeRevocation = browser.window.dataLayer.filter(
        (entry) => entry[0] === "event" && entry[1] === "telegram_cta_click"
    ).length;
    assert.equal(eventsBeforeRevocation, 1);

    browser.handlers["reject:click"]();
    browser.handlers["link:click"]();
    const eventsAfterRevocation = browser.window.dataLayer.filter((entry) => entry[0] === "event").length;
    assert.equal(eventsAfterRevocation, 1);
    assert.ok(browser.expiredCookies.some((cookie) => cookie.startsWith("_ga=")));
    assert.ok(browser.expiredCookies.some((cookie) => cookie.startsWith("_ga_TEST=")));
    assert.ok(browser.window.dataLayer.some(
        (entry) => entry[0] === "consent" && entry[1] === "update" && entry[2].analytics_storage === "denied"
    ));

    browser.handlers["accept:click"]();
    assert.equal(browser.scripts.length, 1);
    assert.ok(browser.window.dataLayer.some(
        (entry) => entry[0] === "consent" && entry[1] === "update" && entry[2].analytics_storage === "granted"
    ));
});
