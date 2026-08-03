# Implementation status

This file is a small, human-readable progress monitor for the active
architecture and test-hardening work. It is updated at the start and end of
each coherent delivery slice.

## Current work

- **Stage:** incremental Worker decomposition
- **State:** all callback namespaces, donation lifecycle, daily settings and
  delivery, word-list actions, quotas, and admin commands are feature modules;
  `worker.js` is the authenticated HTTP/webhook composition root.
- **Next concrete action:** make a dedicated, test-backed extraction only when
  changing one of the remaining text-command domains (menu, word ingestion,
  archive/restore, or feedback), rather than risk a broad router rewrite.

## Plan

- [x] Requirements test matrix and baseline Worker HTTP tests
- [x] Local test command and GitHub Actions workflow
- [x] Extract daily settings with tests
- [x] Extract vocabulary-card generation, sense selection, and persistence
- [x] Extract access-level reads and monotonic grant operations
- [x] Test and extract daily-card delivery
- [x] Extract feedback state and delivery flow
- [x] Extract donation grant operation
- [x] Extract donation notifications and review operations
- [x] Cover remaining admin, feedback, learned-word, and scheduled-job flows
- [x] Extract daily-addition quota operations
- [x] Route callbacks and stable admin commands by feature
- [x] Final decomposition security and reliability review
- [ ] Follow-up: extract one remaining text-command domain at a time when it is
  changed for product work; add a direct Worker test for that domain first.

## Latest verified result

- `npm run check`: 45 tests passed, migrations validated, Worker dry-run built
- Worker dry-run build: passed
- Last deployed Worker status: HTTP 200
