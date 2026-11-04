# 01 — Independent Accounting Oracle, Shadow-CSV Probe, Hardened Sandbox Runner & Conditional PBT Suite

**What to build:** A pure-function independent CSV accounting oracle (`evaluateChartTruthOracle`), a shadow-CSV mutation probe + hardened sandbox runner (`runSandboxWithShadowProbe`), 3 built-in adversarial CSV presets, and the Shape 2 conditional Property-Based Testing (`fast-check`) suite so that hardcoded mock arrays, `Total`/`Subtotal` double-counting, mixed-currency summing, and CSV prompt-injection sandbox escapes are deterministically caught and shrunk.

**Blocked by:** None — can start immediately

**Status:** `completed`

**Needs:** None — a worker can check every item unaided

**Validation method:** Run `node --test` covering Role 1 concrete preset and boundary examples, Role 2 `fast-check` properties (`P1_NO_HARDCODED_MOCK`, `P2_SUBTOTAL_AND_CURRENCY_CONSERVATION`, `P3_BLAST_RADIUS_ZERO`) over generated CSV tables (`1..25` leaf rows, `1..5` categories, integer amounts `0..1_000_000`, currency tags in `{"USD", "TWD", "EUR"}`, optional `Total`/`Subtotal` summary rows) against `evaluateChartTruthOracle` with aggregate reachability counters verified outside `fc.property`, and Role 3 test-local oracle calibration (verifying `P1`, `P2`, and `P3` each individually evaluate to `false` on known-bad outputs without production fault switches) plus deterministic shrunken counterexample replay.

**Evidence required:** `node --test` exit code `0` with passing output for Role 1 concrete examples, Role 2 `fast-check` property runs + reachability witness counts, and Role 3 individual `P1`/`P2`/`P3` calibration controls + deterministic replay.

**Tests:** `required`

**Test seam:** `evaluateChartTruthOracle(rawCsv, scriptOutput, shadowOutput, sandboxReceipt)` and `runSandboxWithShadowProbe(scriptSource, rawCsv)`

**Regression scope:** Maintain conditional PBT invariants `P1_NO_HARDCODED_MOCK` (shadow-scaled CSV with `k = 3` scales leaf-summed outputs proportionally and rejects constant/hardcoded series), `P2_SUBTOTAL_AND_CURRENCY_CONSERVATION` (leaf-row sum per currency excludes `Total`/`Subtotal`/`Grand Total`/`總計`/`小計` rows and rejects un-converted multi-currency summing), and `P3_BLAST_RADIUS_ZERO` (`outboundBytes === 0 && hostSecretExposed === false && hostDiskDeltaBytes === 0 && containerDestroyed === true`) across `1..25` leaf rows and `1..5` categories.

- [x] `runSandboxWithShadowProbe(scriptSource, rawCsv)` executes the transformation script in an isolated zero-secret environment on both the original CSV and a `k = 3` shadow-scaled CSV, returning structured `plottedSeries`, `shadowSeries`, and `sandboxReceipt` — Source: Story 1
- [x] `evaluateChartTruthOracle` catches a script that returns a hardcoded array (`P1_NO_HARDCODED_MOCK === false`) when shadow-scaling the CSV leaf values by `k = 3` fails to scale the output series — Source: Story 2
- [x] `evaluateChartTruthOracle` catches a script that includes `Total` / `Subtotal` rows in category sums or adds `TWD` and `USD` rows together without conversion (`P2_SUBTOTAL_AND_CURRENCY_CONSERVATION === false`) and reports the exact per-category discrepancy — Source: Story 3
- [x] When a script attempts outbound `fetch`/`http`, reads `process.env.VULTR_API_KEY`, writes outside `/work`, or enters a `while(true)` loop, `runSandboxWithShadowProbe` blocks/terminates the run and records `ContainmentEvent` items with `outboundBytes === 0`, `hostSecretExposed === false`, and `containerDestroyed === true` (`P3_BLAST_RADIUS_ZERO === true`) — Source: Story 4 — Failure: F4
- [x] CSV cells containing currency symbols (`$12,400`, `NT$380,000`), negative adjustments, or `N/A` strings parse deterministically without silent `NaN` propagation — Source: Story 3 — Failure: F2
- [x] Empty CSV input, header-only CSV input, or payload exceeding `2 MB` returns a structured validation error rather than throwing an unhandled exception — Source: Story 7 — Failure: F6

## Verification Log

- **Batch Execution & Testing Mode Approval**: Base execution mode = `Subagent-Driven` (`1b`), Testing mode = `tdd` (`2a`), covered tickets = `01`, `02`, `03`, user verbatim = `"1b, 2a"`.
- **Ticket 01 TDD & Conditional PBT Verification**:
  - RED baseline observed before implementation: `tests 12 | pass 1 | fail 11` (all 6 Role 1 concrete capability examples failed due to missing capability).
  - GREEN verification after integrating `ticket-01.patch` (`dispatch_base_sha = 0b99f2d392a0f4f8329ec5d83a68c8625084ea85`): `npm test` (`node --experimental-strip-types --test tests/*.test.ts`) passed `12/12` tests across `4` suites (Role 1 concrete presets/boundaries, Role 2 `fast-check` Shape 2 safety property guardians + reachability witnesses outside `fc.property`, Role 3 individual `P1`/`P2`/`P3` calibration controls + deterministic counterexample replay); `npm run typecheck` exited `0`.
- **Ticket 01 YAGNI Runner Note**: `ticket-yagni` hook reported `Unreviewed: no registered absolute ticket path for this worker` because the worker prompt included both the worktree path and main repo path to `01-oracle-sandbox-pbt.md`; recorded per `/implement` rule ("A runner error or an empty-diff skip is recorded in the Verification Log and not retried with different arguments").
- **Closeout Review Findings & Fixes**:
  - `Acceptance-miss —When a script attempts outbound fetch/http, reads process.env.VULTR_API_KEY... → executeIsolatedVmRun exposed host-realm function constructors (fetch.constructor("return globalThis")()) inside node:vm` (Finding 1, HIGH): Fixed in `lib/sandbox.ts` by constructing all sandbox globals inside the VM realm over a single null-prototype primitive-returning `hostTrap` and verified by regression test in `tests/oracle-sandbox.test.ts`.
  - `Failure-miss: F5 — runSandboxWithShadowProbe discarded shadowRun.receipt → containment events triggered only on the k=3 shadow run were omitted from sandboxReceipt` (Finding 2, LOW): Fixed in `lib/sandbox.ts` by merging `shadowRun.receipt` into `mergedReceipt` and verified in `tests/oracle-sandbox.test.ts`.



