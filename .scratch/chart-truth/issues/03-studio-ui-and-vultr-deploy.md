# 03 — Interactive ChartTruth Studio UI, Blast Radius Visualizer & Vultr VM Deployment Pack

**What to build:** The interactive Next.js ChartTruth Verification Studio web UI (featuring 1-click switching across the 3 adversarial presets + custom CSV upload/editor, a 5-stage live progress pipeline bar, side-by-side "Before: Intercepted Lie / Contained Attack" vs "After: Oracle-Verified Chart" SVG visualization, a Blast Radius = 0 containment telemetry dashboard, and `clef` probability cards) plus production `Dockerfile`, `docker-compose.yml`, and hackathon-compliant `README.md` for Vultr Cloud Compute VM deployment.

**Blocked by:** `02 — Vultr Serverless Inference (nemotron + glm-5.3-flash + clef) & Self-Healing Audit API`

**Status:** `completed`

**Needs:** None — a worker can check every item unaided

**Validation method:** Run full test suite (`node --test`), `npm run build` (`next build`), and verify UI state handling and rendering for all 3 presets, custom CSV input, and rapid preset switching.

**Evidence required:** `node --test` exit `0`, `npm run build` exit `0`, and verified rendering of the side-by-side Before/After SVG charts, Blast Radius = 0 ledger (`0 Outbound Bytes`, `0 Secrets Exposed`, `0 B Host Disk Δ`), `clef` probability cards, and `Dockerfile` / `README.md` Vultr architecture documentation.

**Tests:** `required`

**Test seam:** `POST /api/chart-truth/run` and studio view-model / component state reducer

**Regression scope:** Preserve all Ticket 01 and Ticket 02 acceptance and conditional PBT (`P1..P3`) suites while adding the interactive studio UI and deployment artifacts.

- [x] Selecting any of the 3 built-in adversarial presets or submitting a custom CSV renders the 5-stage pipeline status, the "Before (Intercepted)" vs "After (Oracle-Verified)" SVG bar/breakdown charts, the per-category Oracle reconciliation table, the `clef` probability meters, and the `Blast Radius = 0` containment telemetry card — Source: Stories 1, 4, 5, 6
- [x] Switching presets or clicking "Run Audit" again while a previous audit request is still in flight aborts or ignores the stale response so older errors or chart series never overwrite the newly selected preset — Source: Story 7 — Failure: F1
- [x] Long category labels (`> 30` chars), zero-value bars, or a clean CSV that passes on `initialRun` (requiring `0` repair retries) render cleanly without SVG text overlap or NaN coordinates — Source: Story 7 — Failure: F2
- [x] Repository includes `Dockerfile`, `docker-compose.yml`, and `README.md` documenting Vultr Cloud Compute VM + Vultr Serverless Inference (`https://api.vultrinference.com/v1`) + Docker sandbox containment architecture per hackathon submission rules — Source: Story 4

## Verification Log

- **Ticket 03 TDD, YAGNI & Build Verification**:
  - RED baseline observed before implementation: `tests 21 | pass 17 | fail 4` in `tests/studio-ui-deploy.test.ts`.
  - Applied all 6 `[ticket-yagni]` cuts (`FILE:lib/index.ts` reverted, `roundCoord` inlined, and removed `buildPreset1Receipt`, `buildPreset1Attempt`, `buildDefaultPreset1Response`, `PRESET1_EXPECTED_SERIES`).
  - GREEN verification after trim (`dispatch_base_sha = 8cebcbec571411c4a7baf0907b3d29741a123196`): `npm test` passed `21/21` tests across `6` suites; `npm run typecheck` exited `0`; `npm run build` (`next build`) exited `0`; `react-doctor` scored `100 / 100 Great`.
- **Closeout Review Findings & Fixes**:
  - `Failure-miss: F5 — Repository had .gitignore excluding .env and node_modules but lacked .dockerignore → Dockerfile COPY . . could copy local .env into builder layer` (Finding 5, LOW): Added `.dockerignore` and verified in `tests/studio-ui-deploy.test.ts`.


