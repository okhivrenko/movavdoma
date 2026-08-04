CREATE TABLE shared_word_senses (
  normalized_word TEXT PRIMARY KEY,
  senses_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE shared_vocabulary_cards (
  normalized_word TEXT NOT NULL,
  normalized_context TEXT NOT NULL,
  translation_uk TEXT NOT NULL,
  examples_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (normalized_word, normalized_context)
);
