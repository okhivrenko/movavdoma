// Ukrainian plural rules for vocabulary labels
export const PLURAL_RULES_UK = Object.freeze({
    pluralForms(count) {
        const lastTwoDigits = count % 100;
        const lastDigit = count % 10;

        let result;
        if (lastTwoDigits >= 11 && lastTwoDigits <= 14) result = "слів";
        else if (lastDigit === 1) result = "слово";
        else if (lastDigit >= 2 && lastDigit <= 4) result = "слова";
        else result = "слів";

        // Debug log (do not log secrets)
        console.debug && console.debug(`[plural-rules][uk] pluralForms count=${count} -> ${result}`);
        return result;
    }
});

export default PLURAL_RULES_UK;
