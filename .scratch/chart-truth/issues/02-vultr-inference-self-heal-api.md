# 02 — Vultr Serverless Inference (`nemotron` + `glm-5.3-flash` + `clef`) & Self-Healing Audit API

**What to build:** The 5-stage audit and self-healing API (`POST /api/chart-truth/run` and its underlying `runChartTruthPipeline` service) that pre-scans CSVs with `nemotron-3.5-content-safety`, generates charting/aggregation scripts with `glm-5.3-flash` over `https://api.vultrinference.com/v1` (with deterministic preset/fallback support when `VULTR_API_KEY` is absent or rate-limited), executes the script and shadow probe via Ticket 01's sandbox, audits the result with `evaluateChartTruthOracle` and `clef` calibrated decision probabilities, and automatically performs 1 bounded self-healing repair pass in a fresh sandbox container when `P1` or `P2` fails or a containment event occurs.

**Blocked by:** `01 — Independent Accounting Oracle, Shadow-CSV Probe, Hardened Sandbox Runner & Conditional PBT Suite`

**Status:** `ready-for-agent`

**Needs:** None — a worker can check every item unaided

**Validation method:** Run `node --test` against `runChartTruthPipeline` and `POST /api/chart-truth/run` covering all 3 built-in adversarial presets (Preset 1 `Subtotal + Exfil Injection`, Preset 2 `Hardcoded Mock + Mixed Currency`, Preset 3 `Infinite Loop Bomb`), custom clean CSVs, and failure/fallback probes (`F3`, `F4`, `F5`, `F6`), plus Ticket 01's conditional PBT suite.

**Evidence required:** `node --test` exit code `0` confirming that each preset's `initialRun` captures the expected `P1`/`P2` violation or `ContainmentEvent` and its `repairedRun` passes `P1 && P2 && P3` in a second fresh container (`containersDestroyed >= 2`), alongside calibrated `clef` probabilities (`pDataFaithful`, `pLayoutLegible`, `pContainmentIntact`).

**Tests:** `required`

**Test seam:** `POST /api/chart-truth/run` (and `runChartTruthPipeline(request)`)

**Regression scope:** Preserve all Ticket 01 conditional PBT invariants (`P1_NO_HARDCODED_MOCK`, `P2_SUBTOTAL_AND_CURRENCY_CONSERVATION`, `P3_BLAST_RADIUS_ZERO`) and `evaluateChartTruthOracle` behavior while adding the 5-stage Vultr Serverless Inference + self-healing pipeline.

- [ ] `POST /api/chart-truth/run` executes the 5 stages (`safetyPreScan`, `codeGen`, `sandboxRun`, `oracleAndClefAudit`, `selfHeal`) and returns both `initialRun` (with caught oracle violations / containment events) and `repairedRun` (passing `P1 && P2 && P3` in a fresh container) for all 3 adversarial presets — Source: Story 5
- [ ] `clef` decision integration returns calibrated probabilities (`pDataFaithful`, `pLayoutLegible`, `pContainmentIntact`) in `0..1`, and when `VULTR_API_KEY` is unset, times out, or returns 5xx/429, the pipeline falls back cleanly to deterministic local evaluation without leaking any key or stack trace — Source: Story 6 — Failure: F4
- [ ] When `glm-5.3-flash` wraps generated code in markdown fences (`` ```javascript ... ``` ``) or prose, the extractor strips fences cleanly before sandbox execution — Source: Story 1 — Failure: F3
- [ ] Prompt-injection scanning (`nemotron-3.5-content-safety` + local heuristic scanner) inspects column headers, leaf cells, and summary/comment rows alike so an injection placed in a header or trailing memo column cannot bypass detection — Source: Story 4 — Failure: F5
- [ ] Requests with empty `csvText`, missing `prompt`, or `csvText` larger than `2 MB` return HTTP `400` with a structured error message without spawning a sandbox container — Source: Story 7 — Failure: F6
