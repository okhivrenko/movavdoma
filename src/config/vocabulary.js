// Centralized vocabulary configuration. Readable/overridable via Worker env bindings.
export function getVocabularyConfig(env = {}) {
    return {
        MAX_SENSES: Number(env.VOCAB_MAX_SENSES) || 9,
        WORD_MODEL: env.OPENAI_WORD_MODEL ?? "gpt-5.4-mini",
    };
}

export default getVocabularyConfig;
