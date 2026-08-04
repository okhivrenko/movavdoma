// Ukrainian plural rules for vocabulary labels
export const PLURAL_RULES_UK = Object.freeze({
    pluralForms(count) {
        const lastTwoDigits = count % 100;
        const lastDigit = count % 10;

        if (lastTwoDigits >= 11 && lastTwoDigits <= 14) return "слів";
        if (lastDigit === 1) return "слово";
        if (lastDigit >= 2 && lastDigit <= 4) return "слова";
        return "слів";
    }
});

export default PLURAL_RULES_UK;
