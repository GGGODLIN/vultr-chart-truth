# Worker brief：opus-chart-truth-ui / vultr-chart-truth

你是 `/Users/linhancheng/Desktop/projects/vultr-chart-truth/.claude/worktrees/opus-web-ui` 裡的完整 Claude Code session（模型：`opus[1m]`，effort：`max`，使用 `team-p` 流量），這個 repo 與全域 `~/.claude` 的 hook、skill 與 settings 對你生效。派工的是另一個 session（main）；使用者本人也可能直接在這個視窗打字。

## 任務

為 **Vultr: Agent Rush Hackathon**（`Challenge 01: Blast Radius Zero`）參賽作品 **`ChartTruth` — Zero-Secret Ephemeral Sandbox, `k×3` Shadow-CSV Probe & Independent Accounting Oracle for AI Data Charts** 重新設計並實作整套前端網頁 UI（`app/page.tsx`、`app/globals.css`、`app/layout.tsx` 及你拆出的 `app/_studio/*` 子元件），徹底取代原本由 Argon 寫出的暗色公版圓角卡片頁面，打造出具有**財務審計防爆實驗室／High-Precision Financial Forensics & Blast-Radius Containment Bench** 質感的頂級視覺介面，並確保既有測試套件（`npm test` 22/22 全綠）、型別檢查（`npm run typecheck`）、正式建置（`npm run build`）與 `npx -y react-doctor@latest . --offline --verbose` 全部通過，最後在本 worktree 提交一顆乾淨的 Conventional Commit。

## 互動規則

- 直接動手閱讀現有檔案、重新設計並實作 `app/page.tsx`、`app/globals.css`、`app/layout.tsx`（可拆 `app/_studio/*`），跑完整驗證並啟動短暫的本機 production server（`npm run build && npx next start -p 3457`）用 Playwright 截圖自檢視覺效果（拍下首頁與 3 個 Preset 的高解析度畫面存於 `/Users/linhancheng/Desktop/projects/vultr-chart-truth/.scratch/chart-truth/dispatch-opus-ui/receipts/`，確認完立即關掉自啟的 server 與 Chromium），不需中途停下問選擇題。
- 以 `[main]` 開頭的訊息是 main 轉達的；其中標「以下為使用者原話」的段落才是使用者裁決，其餘是 main 的判讀。沒有前綴的訊息是使用者本人打的。
- 任務全部做完、通過驗證並在 `feat/opus-web-ui` 提交 commit 後再回報一次。回報要含：
  1. 你的視覺設計方向與美學升級重點（字體搭配、財務取證帳冊與防爆隔離艙的視覺對比、Before/After 圖表與 `k×3` Shadow-CSV 對帳視覺、Blast Radius = 0 攔截儀表）
  2. Playwright 實拍截圖路徑與自我視覺審查結論
  3. `npm test`（22/22）、`npm run typecheck`、`npm run build` 與 `npx -y react-doctor@latest . --offline --verbose` 的實測輸出
  4. 本 worktree 的 commit SHA 與變更檔案清單
  5. 沒做的部分（若無則明寫無）

## 邊界

- 只在本 worktree（`feat/opus-web-ui`）內 commit；不 push、不開 PR、不 rebase、不 amend。
- **嚴禁跑 `pkill -f chrom`、`killall Google Chrome` 等廣域殺程序指令**（會殺死使用者正在使用的日常 Chrome 與另一個正在算圖的 worker）；只准清自己啟動的 PID。
- **必須 100% 保留 `tests/*.test.ts`（特別是 `tests/studio-ui-deploy.test.ts`）檢查的公開函式與型別契約**：
  1. 不要破壞 `lib/studio-model.ts` 匯出的 `createInitialStudioState`、`reduceStudioState`、`buildStudioViewModel`、`buildSvgChartBars` 及其回傳欄位（`tests/studio-ui-deploy.test.ts` 直接測試它們）。
  2. 不要破壞 `lib/index.ts`、`lib/oracle.ts`、`lib/sandbox.ts`、`lib/pipeline.ts`、`lib/presets.ts`、`app/api/chart-truth/run/route.ts` 的公開行為。
  3. 遵守 `~/.claude/rules/typescript/react.md` 的 React 規範（Hook 順序固定、不以 array index 當 key、無 hydration mismatch、SVG 座標不超過 3 位小數、無 `console.log`）。

## 脈絡

- 現有檔案：
  - `/Users/linhancheng/Desktop/projects/vultr-chart-truth/.claude/worktrees/opus-web-ui/app/page.tsx`
  - `/Users/linhancheng/Desktop/projects/vultr-chart-truth/.claude/worktrees/opus-web-ui/app/globals.css`
  - `/Users/linhancheng/Desktop/projects/vultr-chart-truth/.claude/worktrees/opus-web-ui/app/layout.tsx`
  - `/Users/linhancheng/Desktop/projects/vultr-chart-truth/.claude/worktrees/opus-web-ui/lib/studio-model.ts`
  - `/Users/linhancheng/Desktop/projects/vultr-chart-truth/.claude/worktrees/opus-web-ui/lib/presets.ts`
  - `/Users/linhancheng/Desktop/projects/vultr-chart-truth/.claude/worktrees/opus-web-ui/tests/studio-ui-deploy.test.ts`
- 先前獲使用者讚賞的 Opus 5.5 Max 網頁 UI 作品可參考（請打造與 `VssWarden` 截然不同、專屬於「財務會計取證帳冊 × 零外洩防爆隔離艙」的獨特美學，例如暖白精算帳冊紙張 `Financial Ledger Paper` 或高對比雙材質設計，避免跟 `VssWarden` 的深色車載示波器撞衫）：
  - `/Users/linhancheng/Desktop/projects/qnx-vss-warden/app/page.tsx`
  - `/Users/linhancheng/Desktop/projects/qnx-vss-warden/app/_studio/bench.tsx`
  - `/Users/linhancheng/Desktop/projects/kiroween-signal-box/src/app/page.tsx`
- 以下為使用者原話（逐字）：
  - `這場有網頁嗎？網頁也要用opus做，總之我不信任argon的美感`
  - `1a`（拍板派 `Opus 5.5 Max` 重做 `ChartTruth` 的網頁 UI 與影片）
- main 的判讀（不是裁決）：
  - 首頁可改為 Server Component，開機時直接在伺服器端跑一次 `runChartTruthPipeline`（Preset 1），讓使用者一打開頁面不用點按鈕就看到完整的真實對帳與攔截數據，同時保留完整互動切換（Preset 1/2/3 與自訂 CSV 即時送審）。
  - 視覺母題建議走 **Forensic Accounting Ledger × Zero-Trust Containment Vault**（例如：精算師傳票／《金融時報》暖紙色或極致利落的財報實驗室風格，`Instrument Serif` / `Fraunces` 搭配 `JetBrains Mono`，清楚呈現左欄「Container #1 被攔截的雙倍加總與偷讀 `VULTR_API_KEY` 企圖」vs 右欄「Container #2 經 `k×3` 影子 CSV 探針與守恆律自癒後的真實圖表」）。
