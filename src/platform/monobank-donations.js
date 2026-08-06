// Monobank statement synchronization is isolated from the webhook router so
// its payment-validation and time-window rules remain independently testable.
import { publicRuntimeConfig } from "./runtime-config.js";
import { fetchWithTimeout } from "./http.js";

export const MONOBANK_MIN_SYNC_INTERVAL_SECONDS = 60;
export const MONOBANK_STATEMENT_OVERLAP_SECONDS = 5 * 60;
const MONOBANK_STATEMENT_MAX_LOOKBACK_SECONDS = 2_682_000;
const MONOBANK_HRYVNIA_CURRENCY_CODE = 980;

export function isEligibleMonobankTransaction(transaction) {
    return Boolean(
        transaction?.id
        && Number.isInteger(transaction.amount)
        && transaction.amount > 0
        && transaction.currencyCode === MONOBANK_HRYVNIA_CURRENCY_CODE
    );
}

export function monobankStatementStartTime(lastSuccessfulSyncAt, nowSeconds) {
    const overlapStart = lastSuccessfulSyncAt
        ? lastSuccessfulSyncAt - MONOBANK_STATEMENT_OVERLAP_SECONDS
        : nowSeconds - MONOBANK_STATEMENT_OVERLAP_SECONDS;
    return Math.max(overlapStart, nowSeconds - MONOBANK_STATEMENT_MAX_LOOKBACK_SECONDS);
}

export function createMonobankDonationSync({ notifyPendingDonationRequests, notifyUnmatchedDonations }) {
    async function claimSync(env, nowSeconds) {
        const claimed = await env.DB
            .prepare(`
              UPDATE monobank_sync_state
              SET last_attempt_at = ?
              WHERE id = 1 AND last_attempt_at <= ?
            `)
            .bind(nowSeconds, nowSeconds - MONOBANK_MIN_SYNC_INTERVAL_SECONDS)
            .run();

        return claimed.meta.changes > 0;
    }

    async function getJarId(env) {
        const { monobankJarSendId: jarSendId } = publicRuntimeConfig(env);
        const state = await env.DB
            .prepare("SELECT jar_id, jar_send_id FROM monobank_sync_state WHERE id = 1")
            .first();

        if (state?.jar_id && state.jar_send_id === jarSendId) return state.jar_id;

        const startedAt = Date.now();
        const response = await fetchWithTimeout("https://api.monobank.ua/personal/client-info", {
            headers: { "X-Token": env.MONOBANK_API_TOKEN },
        });
        console.debug({ event: "monobank_client_info_response", status: response.status, durationMs: Date.now() - startedAt });
        if (!response.ok) throw new Error(`Monobank client info ${response.status}`);

        const clientInfo = await response.json();
        const jars = Array.isArray(clientInfo.jars) ? clientInfo.jars : [];
        const jar = jars.find((candidate) => candidate?.sendId === jarSendId);

        if (!jar?.id) {
            // Do not log jar names, balances, IDs, or payment details.
            throw new Error(`Monobank jar was not found for configured public link (visible jars: ${jars.length}).`);
        }

        await env.DB
            .prepare("UPDATE monobank_sync_state SET jar_id = ?, jar_send_id = ? WHERE id = 1")
            .bind(jar.id, jarSendId)
            .run();
        return jar.id;
    }

    async function findDonationRequestByComment(env, comment) {
        if (!comment) return null;
        return env.DB
            .prepare(`
              SELECT id FROM donation_requests
              WHERE request_source = 'support' AND status IN ('awaiting_payment', 'awaiting_review')
                AND instr(upper(?), support_code) > 0
              ORDER BY id DESC
              LIMIT 1
            `)
            .bind(comment)
            .first();
    }

    async function saveTransactions(env, transactions) {
        for (const transaction of transactions) {
            if (!isEligibleMonobankTransaction(transaction)) continue;

            const request = await findDonationRequestByComment(env, transaction.comment ?? "");
            const inserted = await env.DB
                .prepare(`
                  INSERT OR IGNORE INTO bank_transactions (
                    transaction_id, amount_kopiykas, transaction_time, comment, matched_request_id
                  ) VALUES (?, ?, ?, ?, ?)
                `)
                .bind(transaction.id, transaction.amount, transaction.time ?? 0, transaction.comment ?? "", request?.id ?? null)
                .run();

            if (inserted.meta.changes > 0 && request) {
                await env.DB
                    .prepare(`
                      UPDATE donation_requests
                      SET status = 'awaiting_review', matched_transaction_id = ?
                      WHERE id = ? AND status IN ('awaiting_payment', 'awaiting_review')
                    `)
                    .bind(transaction.id, request.id)
                    .run();
            }
        }
    }

    return async function syncMonobankDonations(env, scheduledTime) {
        if (!env.MONOBANK_API_TOKEN) return;

        const nowSeconds = Math.floor(scheduledTime / 1000);
        if (!(await claimSync(env, nowSeconds))) return;

        const jarId = await getJarId(env);
        const state = await env.DB
            .prepare("SELECT last_successful_sync_at FROM monobank_sync_state WHERE id = 1")
            .first();
        const from = monobankStatementStartTime(state?.last_successful_sync_at, nowSeconds);
        const startedAt = Date.now();
        const response = await fetchWithTimeout(
            `https://api.monobank.ua/personal/statement/${encodeURIComponent(jarId)}/${from}/${nowSeconds}`,
            { headers: { "X-Token": env.MONOBANK_API_TOKEN } }
        );
        console.debug({ event: "monobank_statement_response", status: response.status, durationMs: Date.now() - startedAt });
        if (!response.ok) throw new Error(`Monobank statement ${response.status}`);

        const transactions = await response.json();
        if (!Array.isArray(transactions)) throw new Error("Monobank statement response is invalid.");

        await saveTransactions(env, transactions);
        await env.DB
            .prepare("UPDATE monobank_sync_state SET last_successful_sync_at = ? WHERE id = 1")
            .bind(nowSeconds)
            .run();
        await notifyPendingDonationRequests(env);
        await notifyUnmatchedDonations(env);
    };
}
