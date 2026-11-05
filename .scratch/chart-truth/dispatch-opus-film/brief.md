# Worker brief：opus-chart-truth-film / vultr-chart-truth

你是 `/Users/linhancheng/Desktop/projects/vultr-chart-truth` 裡的完整 Claude Code session（模型：`opus[1m]`，effort：`max`，使用 `team-p` 流量），這個 repo 與全域 `~/.claude` 的 hook、skill 與 settings 對你生效。派工的是另一個 session（main）；使用者本人也可能直接在這個視窗打字。

## 任務

使用全域 `onetake` skill（`/Users/linhancheng/.claude/skills/onetake/SKILL.md`），為 **Vultr: Agent Rush Hackathon**（`Challenge 01: Blast Radius Zero`）參賽作品 **`ChartTruth` — Zero-Secret Ephemeral Sandbox, `k×3` Shadow-CSV Probe & Independent Accounting Oracle for AI Data Charts** 重新設計並渲染一支高美感、電影感十足的 **40–45 秒 1080p30 產品演示短片**，工作目錄放在 `/Users/linhancheng/Desktop/projects/onetake-trial/films/vultr-chart-truth-opus/`，最終成品輸出並覆寫至 `/Users/linhancheng/Desktop/projects/vultr-chart-truth/docs/media/chart-truth-demo.mp4`，同時產出 `stills.png` 與 4 張 1920×1080 產品精選截圖覆寫至 `/Users/linhancheng/Desktop/projects/vultr-chart-truth/docs/media/`（`01-deceptive-bar-hook.png`、`02-blast-radius-zero-containment.png`、`03-shadow-csv-probe-and-slice.png`、`04-before-after-self-healed-studio.png`）。

## 互動規則

- 直接動手設計、合成 Kokoro 英文配音＋中英雙語字幕與音效、自我視覺審查並完成渲染與 `verify_promo.py` 8 項驗收，不需中途停下問選擇題。若遇到只有使用者能決定的重大範圍分歧，才把問題原文印出來、停下等答案。
- **重要提醒**：當你啟動 `render.py` 時，請以**前景（foreground，設定較長 timeout 如 600000ms）**執行，不要用 `run_in_background: true` 結束當前 turn——否則外部 watcher 會在你剛啟動背景渲染時誤以為你的 turn 已結束。
- 以 `[main]` 開頭的訊息是 main 轉達的；其中標「以下為使用者原話」的段落才是使用者裁決，其餘是 main 的判讀。沒有前綴的訊息是使用者本人打的。
- 任務全部做完並通過視覺自檢與 `verify_promo.py` 後再回報一次。回報要含：
  1. 你的核心視覺概念與關鍵設計決策（配色、大留白比例、字體層級、運鏡 Carry 銜接、Kokoro 旁白與音效平衡）
  2. `stills.png` 逐格視覺檢查結果與檔案路徑
  3. `verify_promo.py` 完整 8 項指標輸出（必須是 `VERDICT: PASS`）
  4. 最終影片 `/Users/linhancheng/Desktop/projects/vultr-chart-truth/docs/media/chart-truth-demo.mp4` 與 4 張截圖的 `ffprobe` / `ls -lh` 實測數據
  5. 沒做的部分（若無則明寫無）

## 邊界

- 不 commit、不 push、不開 PR、不 rebase、不 amend（Git 提交與推送由 main 收工對帳後統一執行）。
- **嚴禁跑 `pkill -f chrom`、`killall Google Chrome` 等廣域殺程序指令**（會殺死使用者正在使用的日常 Chrome 與另一個正在改 UI 的 worker）；只准清自己啟動的 PID。
- 驗證收據放 `/Users/linhancheng/Desktop/projects/vultr-chart-truth/.scratch/chart-truth/dispatch-opus-film/receipts/`，影片合成資產放 `/Users/linhancheng/Desktop/projects/onetake-trial/films/vultr-chart-truth-opus/`。

## 脈絡

- 產品規格與實作檔案（請務必使用產品 `lib/presets.ts` 與 `runChartTruthPipeline` 的真實數據）：
  - `/Users/linhancheng/Desktop/projects/vultr-chart-truth/.scratch/chart-truth/spec.md`
  - `/Users/linhancheng/Desktop/projects/vultr-chart-truth/README.md`
  - `/Users/linhancheng/Desktop/projects/vultr-chart-truth/lib/presets.ts`
  - `/Users/linhancheng/Desktop/projects/vultr-chart-truth/lib/oracle.ts`
  - `/Users/linhancheng/Desktop/projects/vultr-chart-truth/lib/sandbox.ts`
  - `/Users/linhancheng/Desktop/projects/vultr-chart-truth/lib/pipeline.ts`
- 前三隻 Opus 5.5 Max worker 做完、獲使用者高度肯定的滿分範本（請參考其 70%+ 大留白、精準字體排印、Kokoro 旁白＋雙語字幕與運鏡 Carry 手法，但**絕對不要沿用上一支 `qnx-vss-warden-opus` 的碳黑紫示波器外觀**——請為 `ChartTruth` 打造獨特的「暖紙財報精算帳冊 × 雙層防爆玻璃艙」視覺語言）：
  - `/Users/linhancheng/Desktop/projects/onetake-trial/films/qnx-vss-warden-opus/comp.html`
  - `/Users/linhancheng/Desktop/projects/onetake-trial/films/qnx-vss-warden-opus/score.py`
  - `/Users/linhancheng/Desktop/projects/onetake-trial/films/kiroween-signal-box-opus/comp.html`
  - `/Users/linhancheng/Desktop/projects/onetake-trial/films/credit-roll-live-opus/comp.html`
- 以下為使用者原話（逐字）：
  - `影片又是你自己做？我不是有叫你用opus max做嗎`
  - `這場有網頁嗎？網頁也要用opus做，總之我不信任argon的美感`
  - `1a`（拍板派 `Opus 5.5 Max` 重做 `ChartTruth` 的網頁 UI 與影片）
- main 的判讀（不是裁決）：
  - **這支片要讓人看懂的一句話**：AI 寫圖表腳本時常把 `Total` 小計列重複加總（讓營收虛胖 2 倍）、遇到髒資料就偷塞寫死假陣列、甚至夾帶惡意指令偷讀 `VULTR_API_KEY`；`ChartTruth` 在 Vultr 零秘密沙箱（`--network=none`）裡擋下外洩，再用 `k×3` 影子 CSV 縮放探針與小計守恆律抓出假圖表，並在全新第 2 顆沙箱自癒畫出精準圖表。
  - 請確認畫面上的每一個數字都與 `lib/presets.ts` 的真實輸出對齊（例如 Preset 1：North America `$180,000`、EMEA `$140,000`、APAC `$100,000`，真實總和 `$420,000`，但缺陷腳本把 `Total,420000` 也畫成一根柱子導致圖表總和變 `$840,000`；同時拦截 `process.env.VULTR_API_KEY` 與 `https://leak.example/collect` 的 `0 Outbound Bytes · 0 Secrets · 0 B Disk Delta`）。
