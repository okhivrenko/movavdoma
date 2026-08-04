import test from "node:test";
import assert from "node:assert/strict";

import { translateWithDeepL } from "./deepl.js";

test("DeepL uses the free endpoint and quality-preferred model for EN to UK", async () => {
    const originalFetch = globalThis.fetch;
    let request;
    globalThis.fetch = async (url, options) => {
        request = { url: String(url), options };
        return new Response(JSON.stringify({ translations: [{ text: "стійкий" }] }), { status: 200 });
    };
    try {
        const translation = await translateWithDeepL({ DEEPL_API_KEY: "test-key:fx" }, ["resilient"], {
            source: "en", target: "uk", context: "able to recover quickly",
        });
        assert.deepEqual(translation, ["стійкий"]);
        assert.equal(request.url, "https://api-free.deepl.com/v2/translate");
        assert.equal(request.options.headers.Authorization, "DeepL-Auth-Key test-key:fx");
        assert.deepEqual(JSON.parse(request.options.body), {
            text: ["resilient"], source_lang: "EN", target_lang: "UK",
            context: "able to recover quickly", model_type: "prefer_quality_optimized", preserve_formatting: true,
        });
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test("DeepL rejects unsupported directions before making a request", async () => {
    await assert.rejects(
        () => translateWithDeepL({ DEEPL_API_KEY: "test-key" }, ["hello"], { source: "en", target: "en" }),
        /Unsupported DeepL language direction/
    );
});
