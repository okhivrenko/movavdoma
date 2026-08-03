const MAX_OPENAI_ATTEMPTS = 3;

function wait(milliseconds) { return new Promise((resolve) => setTimeout(resolve, milliseconds)); }
function isRetryableOpenAIStatus(status) { return status === 429 || status >= 500; }
function openAIRetryDelay(response, attempt) {
    const retryAfterSeconds = Number(response.headers.get("retry-after"));
    return Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
        ? Math.min(retryAfterSeconds * 1000, 2_000)
        : 250 * 2 ** attempt;
}

/** Calls OpenAI with strict JSON output and retries transient failures only. */
export async function openAIJson(env, name, schema, instructions, input, options = {}) {
    for (let attempt = 0; attempt < MAX_OPENAI_ATTEMPTS; attempt += 1) {
        let response;
        try {
            response = await fetch("https://api.openai.com/v1/chat/completions", {
                method: "POST",
                headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, "content-type": "application/json" },
                body: JSON.stringify({
                    model: "gpt-5.4-nano", reasoning_effort: "none", max_completion_tokens: options.maxCompletionTokens ?? 400,
                    response_format: { type: "json_schema", json_schema: { name, strict: true, schema } },
                    messages: [{ role: "developer", content: instructions }, { role: "user", content: input }],
                }),
            });
        } catch (error) {
            if (attempt === MAX_OPENAI_ATTEMPTS - 1) throw error;
            console.warn({ event: "openai_retry", attempt: attempt + 1, reason: "network_error" });
            await wait(250 * 2 ** attempt);
            continue;
        }
        if (!response.ok) {
            if (!isRetryableOpenAIStatus(response.status) || attempt === MAX_OPENAI_ATTEMPTS - 1) throw new Error(`OpenAI ${response.status}`);
            console.warn({ event: "openai_retry", attempt: attempt + 1, status: response.status });
            await wait(openAIRetryDelay(response, attempt));
            continue;
        }
        const content = (await response.json()).choices?.[0]?.message?.content;
        if (!content) throw new Error("OpenAI returned an empty response.");
        return JSON.parse(content);
    }
    throw new Error("OpenAI retry attempts exhausted.");
}
