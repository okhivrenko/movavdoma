const MAX_DEEPL_ATTEMPTS = 3;

const DEEPL_LANGUAGE = Object.freeze({ en: "EN", uk: "UK" });

function wait(milliseconds) { return new Promise((resolve) => setTimeout(resolve, milliseconds)); }
function isRetryableStatus(status) { return status === 429 || status >= 500; }

function deeplEndpoint(apiKey) {
    return apiKey.endsWith(":fx") ? "https://api-free.deepl.com/v2/translate" : "https://api.deepl.com/v2/translate";
}

/** Translates one or more texts through DeepL's quality-preferred text API. */
export async function translateWithDeepL(env, texts, { source, target, context } = {}) {
    if (!env.DEEPL_API_KEY) throw new Error("DeepL API key is unavailable.");
    if (!Array.isArray(texts) || texts.length === 0 || texts.some((text) => typeof text !== "string" || !text.trim())) {
        throw new Error("DeepL requires non-empty text.");
    }
    const sourceLang = DEEPL_LANGUAGE[source];
    const targetLang = DEEPL_LANGUAGE[target];
    if (!sourceLang || !targetLang || sourceLang === targetLang) throw new Error("Unsupported DeepL language direction.");

    for (let attempt = 0; attempt < MAX_DEEPL_ATTEMPTS; attempt += 1) {
        let response;
        try {
            response = await fetch(deeplEndpoint(env.DEEPL_API_KEY), {
                method: "POST",
                headers: {
                    Authorization: `DeepL-Auth-Key ${env.DEEPL_API_KEY}`,
                    "content-type": "application/json",
                },
                body: JSON.stringify({
                    text: texts,
                    source_lang: sourceLang,
                    target_lang: targetLang,
                    ...(context ? { context } : {}),
                    model_type: "prefer_quality_optimized",
                    preserve_formatting: true,
                }),
            });
        } catch (error) {
            if (attempt === MAX_DEEPL_ATTEMPTS - 1) throw error;
            console.warn({ event: "deepl_retry", attempt: attempt + 1, reason: "network_error" });
            await wait(250 * 2 ** attempt);
            continue;
        }
        if (!response.ok) {
            if (!isRetryableStatus(response.status) || attempt === MAX_DEEPL_ATTEMPTS - 1) throw new Error(`DeepL ${response.status}`);
            console.warn({ event: "deepl_retry", attempt: attempt + 1, status: response.status });
            await wait(250 * 2 ** attempt);
            continue;
        }
        const translations = (await response.json()).translations;
        if (!Array.isArray(translations) || translations.length !== texts.length || translations.some((item) => typeof item?.text !== "string" || !item.text.trim())) {
            throw new Error("DeepL returned an invalid translation response.");
        }
        return translations.map((item) => item.text.trim());
    }
    throw new Error("DeepL retry attempts exhausted.");
}
