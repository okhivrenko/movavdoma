// Default input parser configuration for English → Ukrainian vocabulary input
export const EN_TO_UK_INPUT_PARSER = Object.freeze({
    contextSeparators: ["/", "|", "\\"],
    parseInput(input) {
        const separatorIndex = Math.min(
            ...this.contextSeparators.map((sep) => {
                const idx = input.indexOf(sep);
                return idx === -1 ? Infinity : idx;
            })
        );

        if (!Number.isFinite(separatorIndex)) {
            return { word: input.trim(), explicitContext: "" };
        }

        return {
            word: input.slice(0, separatorIndex).trim(),
            explicitContext: input.slice(separatorIndex + 1).trim(),
        };
    }
});

export default EN_TO_UK_INPUT_PARSER;
