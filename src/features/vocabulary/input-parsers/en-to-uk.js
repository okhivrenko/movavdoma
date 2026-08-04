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

        // Operational logging (no secrets) for debugging parsing behavior
        console.debug && console.debug(`[input-parser][en->uk] parseInput input="${String(input)}" separatorIndex=${separatorIndex}`);

        if (!Number.isFinite(separatorIndex)) {
            const res = { word: input.trim(), explicitContext: "" };
            console.debug && console.debug(`[input-parser][en->uk] result= ${JSON.stringify(res)}`);
            return res;
        }

        const res = {
            word: input.slice(0, separatorIndex).trim(),
            explicitContext: input.slice(separatorIndex + 1).trim(),
        };
        console.debug && console.debug(`[input-parser][en->uk] result= ${JSON.stringify(res)}`);
        return res;
    }
});

export default EN_TO_UK_INPUT_PARSER;
