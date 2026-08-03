/** Validates public, non-secret Worker configuration from Wrangler vars. */
export function publicRuntimeConfig(env) {
    const botBrandName = String(env.BOT_BRAND_NAME ?? "").trim();
    if (!botBrandName || botBrandName.length > 64) {
        throw new Error("BOT_BRAND_NAME Worker var is invalid.");
    }

    let publicWorkerUrl;
    try {
        const url = new URL(env.PUBLIC_WORKER_URL);
        if (url.protocol !== "https:" || url.pathname !== "/" || url.search || url.hash) throw new Error();
        publicWorkerUrl = url.origin;
    } catch {
        throw new Error("PUBLIC_WORKER_URL Worker var must be an HTTPS origin.");
    }

    const monobankJarSendId = String(env.MONOBANK_JAR_SEND_ID ?? "").trim();
    if (!/^[A-Za-z0-9_-]{5,64}$/.test(monobankJarSendId)) {
        throw new Error("MONOBANK_JAR_SEND_ID Worker var is invalid.");
    }

    return { botBrandName, publicWorkerUrl, monobankJarSendId };
}
