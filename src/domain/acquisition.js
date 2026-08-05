const START_SOURCE_PATTERN = /^\/start(?:\s+([a-z0-9_-]{1,32}))?$/i;

/** Keeps campaign attribution bounded and free from arbitrary deep-link data. */
export const ACQUISITION_SOURCES = Object.freeze([
    "ig_bio",
    "ig_story",
    "tg_ads",
    "tg_post",
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
