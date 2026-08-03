# Implementation status

This file is a small, human-readable progress monitor for the active
architecture and test-hardening work. It is updated at the start and end of
each coherent delivery slice.

## Current work

- **Stage:** incremental Worker decomposition
- **State:** vocabulary-card and access-level boundaries extracted and verified
- **Next concrete action:** add missing D1/Telegram contracts for the daily-card
  flow, then extract its callback routing without changing callback formats.

## Plan

- [x] Requirements test matrix and baseline Worker HTTP tests
- [x] Local test command and GitHub Actions workflow
- [x] Extract daily settings with tests
- [x] Extract vocabulary-card generation, sense selection, and persistence
- [x] Extract access-level reads and monotonic grant operations
- [ ] Test and extract daily-card delivery
- [ ] Test and extract donation / Monobank service
- [ ] Route callbacks by feature
- [ ] Cover remaining admin, feedback, learned-word, and scheduled-job flows
- [ ] Final security, performance, and release review

## Latest verified result

- `npm run check:syntax && npm test`: 25 tests passed
- Worker dry-run build: passed
- Last deployed Worker status: HTTP 200
