import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const analyticsSource = readFileSync(
    new URL("../../../public/assets/landing/analytics-consent-v2.js", import.meta.url),
    "utf8"
);

function analyticsBrowser({ initialConsent = null, initialCookie = "", storageUnavailable = false } = {}) {
    const handlers = {};
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
        dataLayer: [],
        location: { hostname: "movayakvdoma.com" },
        localStorage: {
            getItem(key) {
                if (storageUnavailable) throw new Error("storage unavailable");
                return values.get(key) ?? null;
            },
            setItem(key, value) {
                if (storageUnavailable) throw new Error("storage unavailable");
                values.set(key, value);
            },
        },
    };
    window.gtag = function gtag() { window.dataLayer.push(arguments); };

    vm.runInNewContext(analyticsSource, { document, window, Date });
    return { banner, expiredCookies, handlers, values, window };
}

test("analytics starts without full events and grants storage after acceptance", () => {
    const browser = analyticsBrowser();

    assert.equal(browser.banner.hidden, false);
    assert.equal(browser.window.dataLayer.length, 0);

    browser.handlers["accept:click"]();
    assert.equal(browser.values.get("movayakvdoma_analytics_consent"), "granted");
    assert.ok(browser.window.dataLayer.some(
        (entry) => entry[0] === "consent" && entry[1] === "update" && entry[2].analytics_storage === "granted"
    ));
});

test("persisted denial suppresses custom events until the user later opts in", () => {
    const browser = analyticsBrowser({ initialConsent: "denied" });

    assert.equal(browser.banner.hidden, true);
    browser.handlers["link:click"]();
    assert.equal(browser.window.dataLayer.length, 0);

    browser.handlers["settings:click"]();
    assert.equal(browser.banner.hidden, false);
    browser.handlers["accept:click"]();
    assert.ok(browser.window.dataLayer.some((entry) => entry[2]?.analytics_storage === "granted"));
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
    assert.ok(browser.expiredCookies.some(
        (cookie) => cookie.startsWith("_ga=") && cookie.includes("Domain=movayakvdoma.com")
    ));
    assert.ok(browser.expiredCookies.some(
        (cookie) => cookie.startsWith("_ga_TEST=") && cookie.includes("Domain=movayakvdoma.com")
    ));
    assert.ok(browser.window.dataLayer.some(
        (entry) => entry[0] === "consent" && entry[1] === "update" && entry[2].analytics_storage === "denied"
    ));

    browser.handlers["accept:click"]();
    assert.ok(browser.window.dataLayer.some(
        (entry) => entry[0] === "consent" && entry[1] === "update" && entry[2].analytics_storage === "granted"
    ));
});

test("in-page consent still enables CTA events when localStorage is unavailable", () => {
    const browser = analyticsBrowser({ storageUnavailable: true });
    browser.handlers["accept:click"]();
    browser.handlers["link:click"]();

    assert.ok(browser.window.dataLayer.some(
        (entry) => entry[0] === "event" && entry[1] === "telegram_cta_click"
    ));
});
