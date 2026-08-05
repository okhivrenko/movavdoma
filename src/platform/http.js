export const EXTERNAL_REQUEST_TIMEOUT_MS = 12_000;

export async function fetchWithTimeout(url, init, timeoutMs = EXTERNAL_REQUEST_TIMEOUT_MS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, { ...init, signal: controller.signal });
    } finally {
        clearTimeout(timer);
    }
}
