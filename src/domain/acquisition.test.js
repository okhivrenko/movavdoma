import test from "node:test";
import assert from "node:assert/strict";

import { acquisitionAttributionFromStartCommand, acquisitionSourceFromLandingParam, acquisitionSourceFromStartCommand, isTelegramStartCommand } from "./acquisition.js";

test("Telegram start commands accept one safe payload while keeping unknown sources untracked", () => {
    assert.equal(isTelegramStartCommand("/start"), true);
    assert.equal(isTelegramStartCommand("/start ig_bio"), true);
    assert.equal(isTelegramStartCommand("/start ig_bio extra"), false);
    assert.equal(isTelegramStartCommand("/start <script>"), false);
    assert.equal(acquisitionSourceFromStartCommand("/start ig_bio"), "ig_bio");
    assert.equal(acquisitionSourceFromStartCommand("/start TG_ADS"), "tg_ads");
    assert.equal(acquisitionSourceFromStartCommand("/start tiktok_ads"), "tiktok_ads");
    assert.equal(acquisitionSourceFromStartCommand("/start referral"), null);
    assert.equal(acquisitionSourceFromStartCommand("/start"), null);
});

test("TikTok attribution stays bounded from landing link through first-touch storage", () => {
    assert.equal(acquisitionSourceFromLandingParam("tiktok_ads"), "tiktok_ads");
    assert.equal(acquisitionSourceFromLandingParam("unknown_campaign"), null);
    assert.deepEqual(acquisitionAttributionFromStartCommand("/start tiktok_ads"), {
        source: "website",
        campaign: "tiktok_ads",
        reportSource: "tiktok_ads",
    });
});
