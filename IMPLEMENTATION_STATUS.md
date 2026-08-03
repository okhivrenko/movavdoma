# Implementation status

This file is a small, human-readable progress monitor for the active
architecture and test-hardening work. It is updated at the start and end of
each coherent delivery slice.

## Current work

- **Stage:** incremental Worker decomposition
- **State:** vocabulary callbacks, daily-card, feedback, donation request/grant,
  and learned-word cleanup flows extracted and verified
- **Next concrete action:** extract scheduled daily-word delivery with focused
  D1 contracts, then route the remaining callbacks by feature.

## Plan

- [x] Requirements test matrix and baseline Worker HTTP tests
- [x] Local test command and GitHub Actions workflow
- [x] Extract daily settings with tests
- [x] Extract vocabulary-card generation, sense selection, and persistence
- [x] Extract access-level reads and monotonic grant operations
- [x] Test and extract daily-card delivery
- [x] Extract feedback state and delivery flow
- [x] Extract donation grant operation
- [ ] Extract donation notifications and review operations
- [ ] Route callbacks by feature
- [ ] Cover remaining admin, feedback, learned-word, and scheduled-job flows
- [ ] Final security, performance, and release review

## Latest verified result

- `npm run check`: 35 tests passed, migrations validated, Worker dry-run built
- Worker dry-run build: passed
- Last deployed Worker status: HTTP 200
