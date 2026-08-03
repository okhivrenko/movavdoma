/** Preserves callback formats for pending admin donation-review cards. */
export function adminDonationKeyboard(requestId, suggestedAccessLevel) {
    const suggestedButton = suggestedAccessLevel
        ? [{ text: `Рекомендований рівень ${suggestedAccessLevel}`, callback_data: `bonus:level:${suggestedAccessLevel}:${requestId}` }]
        : [];
    return { inline_keyboard: [
        suggestedButton,
        [
            { text: "Рівень 1", callback_data: `bonus:level:1:${requestId}` },
            { text: "Рівень 2", callback_data: `bonus:level:2:${requestId}` },
            { text: "Рівень 3", callback_data: `bonus:level:3:${requestId}` },
        ],
        [{ text: "Відхилити", callback_data: `bonus:reject:${requestId}` }],
    ].filter((row) => row.length > 0) };
}
