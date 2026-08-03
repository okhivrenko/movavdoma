import test from "node:test";
import assert from "node:assert/strict";

import { publicRuntimeConfig } from "./runtime-config.js";

test("public Worker vars are validated and the public URL is normalized", () => {
    assert.deepEqual(publicRuntimeConfig({
        BOT_BRAND_NAME: "MovaYakVDoma",
        PUBLIC_WORKER_URL: "https://example.workers.dev/",
        MONOBANK_JAR_SEND_ID: "public_jar-1",
    }), {
        botBrandName: "MovaYakVDoma",
        publicWorkerUrl: "https://example.workers.dev",
        monobankJarSendId: "public_jar-1",
    });
});

test("invalid public Worker vars fail with the variable name", () => {
    assert.throws(() => publicRuntimeConfig({}), /BOT_BRAND_NAME/);
    assert.throws(() => publicRuntimeConfig({
        BOT_BRAND_NAME: "Bot",
        PUBLIC_WORKER_URL: "http://example.test",
        MONOBANK_JAR_SEND_ID: "public-jar",
    }), /PUBLIC_WORKER_URL/);
});
