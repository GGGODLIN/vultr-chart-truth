# ChartTruth — review-implement Report

## Run 1
### Input
- target: `/Users/linhancheng/Desktop/projects/vultr-chart-truth`
- base_sha: `1cd11375176cf8754a37849397d948fda53abcd3`
- head_sha: `f1b222ba16bf3f1b9d1192c937576748f813a44a` (initial review target `568d68d5c4fe6af7353700a67be4d4ea4c6eb147`, updated after `Y2`/`Y3` repair commit `f1b222b`)
- spec: `/Users/linhancheng/Desktop/projects/vultr-chart-truth/.scratch/chart-truth/spec.md`
- tickets:
  - `/Users/linhancheng/Desktop/projects/vultr-chart-truth/.scratch/chart-truth/issues/01-oracle-sandbox-pbt.md`
  - `/Users/linhancheng/Desktop/projects/vultr-chart-truth/.scratch/chart-truth/issues/02-vultr-inference-self-heal-api.md`
  - `/Users/linhancheng/Desktop/projects/vultr-chart-truth/.scratch/chart-truth/issues/03-studio-ui-and-vultr-deploy.md`
- raw_session_paths:
  - `/Users/linhancheng/.claude/projects/-Users-linhancheng-Desktop-projects/d3e41a3e-d10a-4193-a28b-0ca37ca8a618.jsonl` (single active session `d3e41a3e-d10a-4193-a28b-0ca37ca8a618`, 0 external handoff edges)
- selected_axes: `all` (`scope`, `yagni`)
- selected_seats: `opus/scope`, `opus/yagni`
- logical_models: `opus`, `opus`
- resolved_models: `google/gemini-4-argon:high`, `google/gemini-4-argon:high`
- started_at: `2026-11-04T10:55:14Z`
- session_count: `1`
- total_raw_bytes: `36100637`
- elapsed_time: `855222ms`
- token_use: `482142` (`opus/scope`: `264216`, `opus/yagni`: `217926`)
### Axis status
- scope: completed
- yagni: completed
### Events
- `2026-11-04T10:55:14Z` — `start`: auto-selected `all` (`opus/scope`, `opus/yagni`) due to `ticket_count = 3 >= 3` and session compaction/resume boundary. Prior Run dispositions: `查無前輪`.
- `2026-11-04T11:05:46Z` — `seat-complete`: `opus/yagni` (`agentId: a59dabe7c794fc690`) returned 4 YAGNI findings (`Y1`–`Y4`).
- `2026-11-04T11:09:29Z` — `seat-complete`: `opus/scope` (`agentId: a2bf03c0a2a875868`) returned `0 scope findings`.
- `2026-11-04T11:13:30Z` — `repair-commit`: applied accepted obligations `Y2` and `Y3` in commit `f1b222b` (`57` net lines removed) and verified targeted recheck + full suite (`22/22` tests pass, `tsc --noEmit` 0 errors, `next build` exit 0).
### Findings
- **Scope (`opus/scope`)**: `0 scope findings` (all 26 changed files stay within top-level user decisions, `spec.md`, and Tickets `01`–`03`).
- **YAGNI (`opus/yagni`)**:
  - `Y1` (`lib/sandbox.ts:11-395`, `lib/types.ts:8,11,95`): Sandbox entrypoint aliases (`analyzeCsv`/`processCsv`/`main`/`run`), `fs.readFileSync('/work/input.csv')`, and `title`/`logs`/`shadowCsvText` fields.
  - `Y2` (`lib/studio-model.ts:61,75,274-278,289,321`): `StudioBlastRadiusCard.interceptedAttemptsCount` and `StudioViewModel.initialClefDecision` computed in `buildStudioViewModel` with 0 readers in `app/page.tsx` or `tests/`.
  - `Y3` (`app/api/chart-truth/run/route.ts:6-85`, `lib/pipeline.ts:409-469`): Duplicate HTTP 400 `ChartTruthRunResponse` object literals repeated 6 times across `route.ts` and `lib/pipeline.ts`.
  - `Y4` (`lib/oracle.ts:198-270`, `lib/presets.ts:101-130`): Multi-column header synonym regexes in `detectCsvColumns` and `buildCompliantAggregationScript`.
### Main decisions
- `Y1` → **`dispute`**: `tests/pipeline-api.test.ts:290-335` explicitly tests `extractExecutableScript` and sandbox execution with alternative function names (`analyzeCsv`) that live `glm-5.3-flash` outputs, and `fs.readFileSync('/work/input.csv')` is standard for LLM-generated scripts; removing them weakens live LLM compatibility on the Vultr VM without simplifying any public contract.
- `Y2` → **`accept`**: Verified via `command grep` that `interceptedAttemptsCount` and `initialClefDecision` had 0 readers in `app/` and `tests/`; removed both fields from `lib/studio-model.ts`.
- `Y3` → **`accept`**: Extracted `buildPipelineErrorResponse(code, message, scenarioId?)` in `lib/pipeline.ts` and reused it across `lib/pipeline.ts` and `app/api/chart-truth/run/route.ts`, eliminating 57 net lines of duplicated 400 error boilerplate while preserving all `T02-5` validation contracts.
- `Y4` → **`dispute`**: The 3 built-in presets use distinct column headers (`Region`/`Q3_Revenue_USD`, `Customer_Tier`/`ARR_Amount`, `Department`/`Monthly_Burn_USD` in `lib/presets.ts:171,215,258`) and custom CSV uploads in the Studio UI do not have fixed column names; `detectCsvColumns` is load-bearing for `Story 1`.
### Dispositions
- disposition: Y1 | yagni | main=dispute | user=n/a | 沙箱別名與虛擬 /work/input.csv 讀取為支援真實 glm-5.3-flash 產出腳本之必要相容層且為 pipeline-api.test.ts 所涵蓋
- disposition: Y2 | yagni | main=accept | user=n/a | 移除 lib/studio-model.ts 中無任何消費端讀取的 interceptedAttemptsCount 與 initialClefDecision 欄位
- disposition: Y3 | yagni | main=accept | user=n/a | 於 lib/pipeline.ts 抽取共用 buildPipelineErrorResponse 消除 route.ts 與 pipeline.ts 重複 6 次的 400 錯誤樣板
- disposition: Y4 | yagni | main=dispute | user=n/a | 3 組內建預設集與自訂 CSV 使用不同欄位標題（Region/Customer_Tier/Department 等），detectCsvColumns 為 Story 1 承重邏輯
### Repair obligations
- `Y2`: Remove `interceptedAttemptsCount` and `initialClefDecision` from `lib/studio-model.ts` while preserving `T03-1..4`.
- `Y3`: Deduplicate HTTP 400 `ChartTruthRunResponse` construction in `lib/pipeline.ts` and `app/api/chart-truth/run/route.ts` via `buildPipelineErrorResponse` while preserving `T02-5`.
### Targeted rechecks
- `Y2` (`commit f1b222b`): Verified `interceptedAttemptsCount` and `initialClefDecision` are absent from `lib/studio-model.ts` (`0` hits) and `tests/studio-ui-deploy.test.ts` passes (`pass`).
- `Y3` (`commit f1b222b`): Verified `app/api/chart-truth/run/route.ts` and `lib/pipeline.ts` share `buildPipelineErrorResponse` (`57` net lines removed) and `tests/pipeline-api.test.ts` passes (`pass`).
### Summary
- Run status: PASS
