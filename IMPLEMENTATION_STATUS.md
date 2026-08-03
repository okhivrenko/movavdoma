# Implementation status

This file is a small, human-readable progress monitor for the active
architecture and test-hardening work. It is updated at the start and end of
each coherent delivery slice.

## Current work

- **Stage:** daily-card flow — test contracts and module extraction
- **State:** in progress
- **Next concrete action:** add isolated D1/Telegram tests for pending cards,
  `know`/`learn`, and independent daily limits before moving code from
  `worker.js` to `daily-words.js`.

## Plan

- [x] Requirements test matrix and baseline Worker HTTP tests
- [x] Local test command and GitHub Actions workflow
- [x] Extract daily settings with tests
- [ ] Test and extract daily-card delivery
- [ ] Test and extract donation / Monobank service
- [ ] Route callbacks by feature
- [ ] Cover remaining admin, feedback, learned-word, and scheduled-job flows
- [ ] Final security, performance, and release review

## Latest verified result

- `npm run test:local`: 18 tests passed
- Worker dry-run build: passed
- Last deployed Worker status: HTTP 200
