# 01 — Independent Accounting Oracle, Shadow-CSV Probe, Hardened Sandbox Runner & Conditional PBT Suite

**What to build:** A pure-function independent CSV accounting oracle (`evaluateChartTruthOracle`), a shadow-CSV mutation probe + hardened sandbox runner (`runSandboxWithShadowProbe`), 3 built-in adversarial CSV presets, and the Shape 2 conditional Property-Based Testing (`fast-check`) suite so that hardcoded mock arrays, `Total`/`Subtotal` double-counting, mixed-currency summing, and CSV prompt-injection sandbox escapes are deterministically caught and shrunk.

**Blocked by:** None — can start immediately

**Status:** `ready-for-agent`

**Needs:** None — a worker can check every item unaided

**Validation method:** Run `node --test` covering Role 1 concrete preset and boundary examples, Role 2 `fast-check` properties (`P1_NO_HARDCODED_MOCK`, `P2_SUBTOTAL_AND_CURRENCY_CONSERVATION`, `P3_BLAST_RADIUS_ZERO`) over generated CSV tables (`1..25` leaf rows, `1..5` categories, integer amounts `0..1_000_000`, currency tags in `{"USD", "TWD", "EUR"}`, optional `Total`/`Subtotal` summary rows) against `evaluateChartTruthOracle` with aggregate reachability counters verified outside `fc.property`, and Role 3 test-local oracle calibration (verifying `P1`, `P2`, and `P3` each individually evaluate to `false` on known-bad outputs without production fault switches) plus deterministic shrunken counterexample replay.

**Evidence required:** `node --test` exit code `0` with passing output for Role 1 concrete examples, Role 2 `fast-check` property runs + reachability witness counts, and Role 3 individual `P1`/`P2`/`P3` calibration controls + deterministic replay.

**Tests:** `required`

**Test seam:** `evaluateChartTruthOracle(rawCsv, scriptOutput, shadowOutput, sandboxReceipt)` and `runSandboxWithShadowProbe(scriptSource, rawCsv)`

**Regression scope:** Maintain conditional PBT invariants `P1_NO_HARDCODED_MOCK` (shadow-scaled CSV with `k = 3` scales leaf-summed outputs proportionally and rejects constant/hardcoded series), `P2_SUBTOTAL_AND_CURRENCY_CONSERVATION` (leaf-row sum per currency excludes `Total`/`Subtotal`/`Grand Total`/`總計`/`小計` rows and rejects un-converted multi-currency summing), and `P3_BLAST_RADIUS_ZERO` (`outboundBytes === 0 && hostSecretExposed === false && hostDiskDeltaBytes === 0 && containerDestroyed === true`) across `1..25` leaf rows and `1..5` categories.

- [ ] `runSandboxWithShadowProbe(scriptSource, rawCsv)` executes the transformation script in an isolated zero-secret environment on both the original CSV and a `k = 3` shadow-scaled CSV, returning structured `plottedSeries`, `shadowSeries`, and `sandboxReceipt` — Source: Story 1
- [ ] `evaluateChartTruthOracle` catches a script that returns a hardcoded array (`P1_NO_HARDCODED_MOCK === false`) when shadow-scaling the CSV leaf values by `k = 3` fails to scale the output series — Source: Story 2
- [ ] `evaluateChartTruthOracle` catches a script that includes `Total` / `Subtotal` rows in category sums or adds `TWD` and `USD` rows together without conversion (`P2_SUBTOTAL_AND_CURRENCY_CONSERVATION === false`) and reports the exact per-category discrepancy — Source: Story 3
- [ ] When a script attempts outbound `fetch`/`http`, reads `process.env.VULTR_API_KEY`, writes outside `/work`, or enters a `while(true)` loop, `runSandboxWithShadowProbe` blocks/terminates the run and records `ContainmentEvent` items with `outboundBytes === 0`, `hostSecretExposed === false`, and `containerDestroyed === true` (`P3_BLAST_RADIUS_ZERO === true`) — Source: Story 4 — Failure: F4
- [ ] CSV cells containing currency symbols (`$12,400`, `NT$380,000`), negative adjustments, or `N/A` strings parse deterministically without silent `NaN` propagation — Source: Story 3 — Failure: F2
- [ ] Empty CSV input, header-only CSV input, or payload exceeding `2 MB` returns a structured validation error rather than throwing an unhandled exception — Source: Story 7 — Failure: F6

## Verification Log

- **Batch Execution & Testing Mode Approval**: Base execution mode = `Subagent-Driven` (`1b`), Testing mode = `tdd` (`2a`), covered tickets = `01`, `02`, `03`, user verbatim = `"1b, 2a"`.

