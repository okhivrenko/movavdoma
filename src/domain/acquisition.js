const START_SOURCE_PATTERN = /^\/start(?:\s+([a-z0-9_-]{1,32}))?$/i;

/** Keeps campaign attribution bounded and free from arbitrary deep-link data. */
export const ACQUISITION_SOURCES = Object.freeze([
    "ig_bio",
    "ig_story",
    "tg_ads",
    "tg_post",
    "tiktok_ads",
    "website",
]);

const acquisitionSourceSet = new Set(ACQUISITION_SOURCES);

export function isTelegramStartCommand(text) {
    return START_SOURCE_PATTERN.test(String(text).trim());
}

/** Returns a supported first-touch source, or null for direct/unknown starts. */
export function acquisitionSourceFromStartCommand(text) {
    const match = START_SOURCE_PATTERN.exec(String(text).trim());
    if (!match?.[1]) return null;

    const source = match[1].toLowerCase();
    return acquisitionSourceSet.has(source) ? source : null;
}

/** Accepts only a known landing source before it is copied into a bot CTA. */
export function acquisitionSourceFromLandingParam(value) {
    const source = String(value ?? "").trim().toLowerCase();
    return acquisitionSourceSet.has(source) ? source : null;
}

/** Separates a campaign label from the compatible first-touch source column. */
export function acquisitionAttributionFromStartCommand(text) {
    const source = acquisitionSourceFromStartCommand(text);
    if (!source) return null;
    if (source === "tiktok_ads") return { source: "website", campaign: source, reportSource: source };
    return { source, campaign: null, reportSource: source };
}
