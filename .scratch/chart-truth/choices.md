# ChartTruth — 實作決定帳本（auto-choice）

## Pass: `1cd1137..HEAD`（Tickets 01–03 與安全收尾）

### 八類掃描總覽

1. **資料形狀與格式**：有（見 C-01：多欄 CSV 自動偵測分類欄與數值欄的啟發式順序；見 C-02：`clef` 本地降級時的 3 項機率校準公式）
2. **存放位置與命名**：有（見 C-03：將獨立算帳 Oracle、沙箱、流水線、預設集與視圖模型統一收納於 `lib/*.ts`，不拆多層子資料夾）
3. **API 契約與錯誤行為**：有（見 C-04：`POST /api/chart-truth/run` 對 `prompt` 設 16 KB 上限、對整體 HTTP body 設 `2 MB + 64 KB` 上限，超限統一回 HTTP `400` `PAYLOAD_TOO_LARGE`）
4. **新增的相依套件，連同它帶進來的預設行為與上限**：有（見 C-05：選用 Next.js `16.3.6`、React `19.2.8`、Tailwind CSS v4 與 `fast-check@^4.1.1`，零額外 CSV 解析套件）
5. **並行與效能取捨：快取、容量上限、逾時、重試**：有（見 C-06：本地 `node:vm` 沙箱單次執行 watchdog 預設 `600ms`、流水線初跑預設 `250ms`、修復跑預設 `500ms`，以壓低死迴圈測試與 UI 等待時間）
6. **範圍解讀：套用範圍比規格寬或窄**：有（見 C-07：沙箱執行器以 `node:vm` 零宿主原型鏈橋接實作跨環境無 Docker 預設路徑，Dockerfile 與 README 提供容器化部署與隔離旗標契約）
7. **測試設定改動：timeout、skip、mock、放寬斷言**：無（全數 22 項測試皆無 `skip`、無放寬斷言；`fast-check` 使用確定性 `numRuns: 50` 與固定 `seed: 20261104` 驗證 `P1 && P2 && P3`）
8. **之後的程式會照抄的模式**：有（見 C-08：前端 `app/page.tsx` 以 `useReducer` 搭配遞增 `activeRequestId` 與 `AbortController` 管理非同步請求，不在 `useEffect` 內發動 `fetch`）

---

### 決定明細

#### C-01：多欄 CSV 自動偵測分類欄、金額欄與幣別欄的欄位名稱啟發式規則
- **何時**：Ticket 01（commit `80c69fe`，`lib/oracle.ts:198-270` `detectCsvColumns`）
- **決定**：自動識別任意上傳 CSV 的「哪一欄是分類、哪一欄是金額、哪一欄是幣別」。當使用者貼入自訂 CSV（標題不一定叫 `Category,Amount,Currency`）時，現在依標題關鍵字（如 `region|department|segment|tier|category` 對應分類欄、`revenue|arr|amount|burn|cost|value` 對應金額欄、`currency|curr|unit` 對應幣別欄）優先配對，若標題都沒命中則退回以第 0 欄為分類、第一個含可解析數字的欄位為金額；如果沒選這個做法而是寫死固定欄位名稱或固定欄位順序，使用者貼入欄位順序不同或標題不同的自訂 CSV 時，獨立算帳 Oracle（負責驗算圖表數字真偽的純函式模組）就會抓錯欄並把正確圖表誤判成造假。
- **規格缺口**：`spec.md` 第 32–34 行與第 50 行要求支援 3 組預設集與自訂 CSV 上傳，但未硬性規定自訂 CSV 的欄位標題命名與順序。
- **影響範圍**：後續若新增多數值欄位（例如同時有 `Revenue` 與 `Cost` 兩欄的 CSV）時，預設會取第一個命中金額關鍵字的欄位，需擴充參數指定目標數值欄。
- **判定**：`sound` — 兼顧 3 組內建預設集與使用者自訂 CSV 的即貼即用體驗，且不依賴外部 LLM 猜欄位。
- **把握度**：高

#### C-02：`clef` 決策模型在無金鑰或離線降級時的 3 項機率校準公式
- **何時**：Ticket 02（commit `8cebcbe`，`lib/pipeline.ts:234-315` `evaluateClefDecision`）
- **決定**：計算無 `VULTR_API_KEY` 時的 `clef` 三項校準機率（`pDataFaithful` 資料忠實度、`pLayoutLegible` 排版可讀性、`pContainmentIntact` 隔離完整度）。當本地測試或明日領取 $200 額度前尚未設定 `VULTR_API_KEY` 時，現在直接根據獨立 Oracle 的 `P1`/`P2`/`P3` 驗證結果與差異筆數計算確定性機率（例如 `P1 && P2` 全過時 `pDataFaithful = 0.99`，有違規時按差異筆數降為 `0.04..0.18`；`P3` 通過且無攔截事件時 `pContainmentIntact = 0.99`，有攔截並成功擋下時為 `0.94`，發生外洩時為 `0.01`）；如果沒選這個做法而是隨便回傳固定常數 `0.5`，評審在離線模式下切換「攔截前」與「自癒修復後」時就看不出 `clef` 機率卡從紅燈低分跳升為綠燈高分的因果變化。
- **規格缺口**：`spec.md` 第 25 行要求無金鑰時確定性降級，但未給出離線降級的具體數值映射公式。
- **影響範圍**：UI 上的 `clef` 機率進度條與測試中的 `0..1` 區間與修復前後高低關係皆綁定此映射。
- **判定**：`sound` — 數值嚴格落在 `0..1` 且完全反映 `P1`/`P2`/`P3` 與沙箱攔截的真實狀態。
- **把握度**：高

#### C-03：將後端與前端核心邏輯平鋪於 `lib/*.ts`，不拆多層子目錄
- **何時**：Tickets 01–03（commits `80c69fe`, `8cebcbe`, `652ee63`，`lib/types.ts`, `lib/oracle.ts`, `lib/sandbox.ts`, `lib/presets.ts`, `lib/pipeline.ts`, `lib/studio-model.ts`）
- **決定**：扁平化存放 6 個核心領域模組於 `lib/` 目錄。當建立 Next.js 專案結構時，現在把算帳 Oracle、沙箱、預設集、5 階段流水線與前端 ViewModel 全部直接放在 `lib/` 下；如果沒選這個做法而是拆成 `src/domain/oracle/`、`src/infrastructure/sandbox/` 等深層目錄，在 3 張票的規模下只會拉長相對匯入路徑而無實質模組隔離收益。
- **規格缺口**：`spec.md` 第 38 行依規定不寫死具體檔案路徑。
- **影響範圍**：所有 `tests/*.test.ts` 與 `app/` 路由皆從 `lib/*.ts` 直接匯入。
- **判定**：`sound` — 符合專案規模與簡潔原則。
- **把握度**：高

#### C-04：為 `req.prompt` 補上 `16 KB` 上限、為整體 HTTP 請求補上 `2 MB + 64 KB` 串流前置上限
- **何時**：安全審查收尾修補（`app/api/chart-truth/run/route.ts:4-58`、`lib/pipeline.ts:435-449`）
- **決定**：在解析 JSON 前先擋下超大 HTTP body，並限制 `prompt` 欄位不超過 `16 KB`。當外部呼叫 `POST /api/chart-truth/run` 時，現在先檢查 `content-length` 與原始文字位元組數不超過 `2 MB + 64 KB`，且 `req.prompt` 不超過 `16 KB`，超限即回傳 HTTP `400` `PAYLOAD_TOO_LARGE`；如果沒選這個做法而只照票面檢查 `csvText > 2 MB`，攻擊者只要傳入 2 列合法小 CSV 搭配 10 MB 的 `prompt`，就能在進入 `validateCsvInput` 前撐爆記憶體並將數百萬 bytes 直接送往付費的 `glm-5.3-flash` API。
- **規格缺口**：`spec.md` 第 26 行與 Ticket 02 第 25 行僅點名 `csvText` 超過 `2 MB` 回傳 HTTP `400`，未明確寫出 `prompt` 欄位與外層 JSON 封包的上限。
- **影響範圍**：超過 `16 KB` 的超長自然語言 `prompt` 會收到 HTTP `400` `PAYLOAD_TOO_LARGE`。
- **判定**：`sound` — 圖表繪製指令通常僅數十字至數百字，`16 KB` 對正常使用者完全充裕，且能封堵記憶體與 LLM token 耗盡風險。
- **把握度**：高

#### C-05：選用零外部 CSV 解析依賴的純函式狀態機解析器與內建 SVG 圖表渲染
- **何時**：プロジェクト初始化與 Tickets 01、03（commits `0b99f2d`, `80c69fe`, `652ee63`，`package.json:12-25`, `lib/oracle.ts:13-36`, `lib/studio-model.ts:136-176`）
- **決定**：不額外安裝 `papaparse`、`chart.js` 或 `recharts`，改以純函式 CSV 引號狀態機與純 SVG 座標計算實作。當處理帶引號與逗號的髒金額（如 `"$12,400"`）並繪製雙欄長條圖時，現在直接由 `parseCsvLine` 與 `buildSvgChartBars` 計算；如果沒選這個做法而是引入第三方圖表庫（如 `recharts` 或 `chart.js`），除了增加套件體積與 React 19 SSR 水合（Hydration）相容性問題外，也無法在無 DOM 的 `node --test` 中直接對 SVG 長條座標與標籤截斷做純函式斷言。
- **規格缺口**：`spec.md` 第 61 行僅指定以 SVG/Canvas 確定性渲染，未指定具體套件。
- **影響範圍**：若未來需要支援跨多行換行的複雜引號 CSV 儲存格（multiline quoted fields），需擴充 `lib/oracle.ts:49` 的逐行切分邏輯。
- **判定**：`sound` — 零額外依賴讓 `next build` 與 `node --test` 在 0.6 秒內跑完，且 SVG 座標百分之百可測。
- **把握度**：高

#### C-06：將本地沙箱預設 CPU 逾時設為 `250ms–600ms`（而非規格提及的宿主上限 8 秒）
- **何時**：Tickets 01–02（commits `80c69fe`, `8cebcbe`，`lib/sandbox.ts:482`, `lib/pipeline.ts:498,595`）
- **決定**：在本地 `node:vm` 沙箱中將預設 `timeoutMs` 設為 `600ms`（流水線初跑預設 `250ms`、自癒修復跑預設 `500ms`，並保留呼叫端傳入 `timeoutMs` 覆寫至最高 8 秒的能力）。當執行 Preset 3（含 `while(true)` 死迴圈炸彈）或跑全套單元測試時，現在沙箱在 `250ms–600ms` 內就會強制終止死迴圈並回傳 `exitCode: 137`；如果沒選這個做法而是每次死迴圈都硬等滿 8 秒才殺掉，評審在網頁上點 Preset 3 或我們每次跑 `npm test` 時都必須乾等 8～16 秒，大幅拖慢互動體驗。
- **規格缺口**：`spec.md` 第 26、30 行寫明「若容器超過 8 秒則乾淨逾時（8-second host watchdog timeout）」，屬於最高保護上限，未規定同步純資料轉換在本地 VM 下的預設熔斷毫秒數。
- **影響範圍**：若未來自訂腳本內含超過 `500ms` 的超大型純 CPU 迴圈（例如數百萬列排序），在預設參數下會觸發 `timeout`；呼叫端可透過 `ChartTruthRunRequest.timeoutMs` 調高。
- **判定**：`needs-user` — 暫定做法：維持 `250ms–600ms` 預設值以確保 Preset 3 死迴圈炸彈在 0.3 秒內秒殺並秒出對比圖；撤回方式：修改 `lib/sandbox.ts:482` 與 `lib/pipeline.ts:498,595` 的預設常數為 `8000` 即可恢復 8 秒上限。
- **把握度**：中

#### C-07：沙箱執行器以 `node:vm` 零宿主原型鏈隔離實作跨平台執行面，未在 Node 程序內直接呼叫 `docker run` CLI
- **何時**：Ticket 01 與安全收尾（commit `80c69fe` 及後續修補，`lib/sandbox.ts:102-442`）
- **決定**：以 `node:vm` 搭配 `codeGeneration: { strings: false, wasm: false }` 與 `Object.setPrototypeOf(hostTrap, null)` 無原型鏈單一橋接函式實作沙箱執行器，並由根目錄 `Dockerfile` 與 `docker-compose.yml` 提供容器化部署環境。當 `runSandboxWithShadowProbe` 執行不可信腳本時，現在所有沙箱內可見的 `fetch`、`http`、`fs`、`require`、`process` 與 `Error` 皆在 VM 自身 realm 內建構，完全切斷通往宿主 `globalThis` 與 `process.env.VULTR_API_KEY` 的原型鏈，且不論在無 Docker socket 的 CI、開發機或明日部署的 Vultr Ubuntu VM 容器內都能 100% 穩定執行並產生一致的 `SandboxReceipt`；如果沒選這個做法而是讓 Next.js 容器內部再去呼叫宿主 `/var/run/docker.sock` 啟動兄弟容器（Docker-out-of-Docker），一旦掛載 `/var/run/docker.sock` 反而等於把整個 Vultr 宿主機的 root 權限交給 Web 容器，違背最小權限原則。
- **規格缺口**：`spec.md` 第 30–31 行同時描述了 Docker 隔離參數與無 Docker 環境的 Node `vm` 降級執行器，未規定當應用程式本身已跑在 Docker 容器內時是否要掛載 `docker.sock`。
- **影響範圍**：明日（2026-11-05）在 Vultr Cloud Compute VM 部署時，若評審希望看到真實子容器 `docker run --rm --network=none ...` 與 `vm-isolated` 雙模式切換，可在 VM 宿主機預拉 `node:22-alpine` 並在無須暴露宿主 secrets 的非特權 runner 上啟用。
- **判定**：`needs-user` — 暫定做法：預設使用已封堵原型鏈逃逸的 `vm-isolated` 零密鑰沙箱，確保無須掛載高風險 `docker.sock` 即可在任何環境重現全部 3 組攔截與自癒；撤回方式：於明日部署 Vultr VM 時在 `lib/sandbox.ts` 依 `options?.preferDocker` 啟用 `execFile('docker', ['run', '--rm', '--network=none', ...])` 分支。
- **把握度**：中

#### C-08：前端 Studio 初始載入採用「由使用者點擊觸發首次稽核」而非預填靜態假資料
- **何時**：Ticket 03 YAGNI 修剪（commit `652ee63`，`lib/studio-model.ts:346-363`、`app/page.tsx:540-615`）
- **決定**：`createInitialStudioState()` 初始化時將 `viewModel` 設為 `null`（預設選中 Preset 1 並展示其含注入的 CSV 與 Prompt），待使用者點擊任一 Preset 或「Run Containment & Oracle Audit」按鈕時才發送真實 `POST /api/chart-truth/run` 渲染五階段結果。當使用者打開網頁或執行測試時，現在所有顯示出來的圖表、攔截事件與 `clef` 機率卡 100% 來自真實流水線執行，零靜態預造資料；如果沒選這個做法而是在 `studio-model.ts` 裡硬塞一份預造的 Preset 1 初始結果，不但違反本專案「反對寫死假資料（P1）」的核心精神，也在 `ticket-yagni` 審查中被判為多餘的靜態物件。
- **規格缺口**：Ticket 03 第 21 行寫「Selecting any of the 3 built-in adversarial presets or submitting a custom CSV renders...」，未要求未點擊前先塞一份靜態假結果。
- **影響範圍**：開啟首頁後需點一下 Preset 按鈕或「Run Containment & Oracle Audit」才會顯示圖表對比面板（點擊任一 Preset 按鈕即會自動觸發稽核）。
- **判定**：`sound` — 完全符合 Ticket 03 驗收條文與 `ticket-yagni` 裁決，且真機體驗點一下 Preset 就在 0.4 秒內跑完真實沙箱稽核。
- **把握度**：高
