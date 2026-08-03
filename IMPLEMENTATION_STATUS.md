# Implementation status

This file is a small, human-readable progress monitor for completed delivery
slices and genuine blockers. It is not a stream of intentions.

## Current work

- **Stage:** feature-first modular architecture
- **State:** production code is organized into `src/domain`, `src/platform`,
  and feature folders. `worker.js` is the authenticated HTTP/webhook
  composition root. The multilingual catalog is prepared, while the active
  vocabulary direction remains English → Ukrainian.
- **Next concrete action:** deliver the first selected multilingual direction
  only as a complete data, UX, prompt, rendering, and test slice; see
  `docs/DEVELOPER_GUIDE_UA.md` and `docs/ARCHITECTURE.md`.

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
- [x] Move production modules into feature-first folders
- [x] Document the dependency boundaries, manual development workflow, and
  deliberate scaling path
- [ ] Follow-up: release the first multilingual direction as a complete
  direction-neutral data-contract change.

## Latest verified result

- `npm run check`: 46 tests passed, migrations validated, Worker dry-run built
- Worker dry-run build: passed
- Last deployed Worker status: HTTP 200
