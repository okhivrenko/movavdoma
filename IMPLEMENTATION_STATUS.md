# Implementation status

This file is a small, human-readable progress monitor for the active
architecture and test-hardening work. It is updated at the start and end of
each coherent delivery slice.

## Current work

- **Stage:** incremental Worker decomposition
- **State:** daily-card, feedback, and donation-request flows extracted and verified
- **Next concrete action:** extract donation review/grant operations, then route
  the remaining callbacks by feature without changing callback formats.

## Plan

- [x] Requirements test matrix and baseline Worker HTTP tests
- [x] Local test command and GitHub Actions workflow
- [x] Extract daily settings with tests
- [x] Extract vocabulary-card generation, sense selection, and persistence
- [x] Extract access-level reads and monotonic grant operations
- [x] Test and extract daily-card delivery
- [x] Extract feedback state and delivery flow
- [ ] Extract donation review and grant operations
- [ ] Route callbacks by feature
- [ ] Cover remaining admin, feedback, learned-word, and scheduled-job flows
- [ ] Final security, performance, and release review

## Latest verified result

- `npm run check`: 30 tests passed, migrations validated, Worker dry-run built
- Worker dry-run build: passed
- Last deployed Worker status: HTTP 200
