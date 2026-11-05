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
> **2026-11-05 已由 C-09 取代**：使用者同意保留「build 時先跑一次 Exhibit A」，首頁不再需要先點按鈕才出結果。以下原文保留作紀錄。

- **何時**：Ticket 03 YAGNI 修剪（commit `652ee63`，`lib/studio-model.ts:346-363`、`app/page.tsx:540-615`）
- **決定**：`createInitialStudioState()` 初始化時將 `viewModel` 設為 `null`（預設選中 Preset 1 並展示其含注入的 CSV 與 Prompt），待使用者點擊任一 Preset 或「Run Containment & Oracle Audit」按鈕時才發送真實 `POST /api/chart-truth/run` 渲染五階段結果。當使用者打開網頁或執行測試時，現在所有顯示出來的圖表、攔截事件與 `clef` 機率卡 100% 來自真實流水線執行，零靜態預造資料；如果沒選這個做法而是在 `studio-model.ts` 裡硬塞一份預造的 Preset 1 初始結果，不但違反本專案「反對寫死假資料（P1）」的核心精神，也在 `ticket-yagni` 審查中被判為多餘的靜態物件。
- **規格缺口**：Ticket 03 第 21 行寫「Selecting any of the 3 built-in adversarial presets or submitting a custom CSV renders...」，未要求未點擊前先塞一份靜態假結果。
- **影響範圍**：開啟首頁後需點一下 Preset 按鈕或「Run Containment & Oracle Audit」才會顯示圖表對比面板（點擊任一 Preset 按鈕即會自動觸發稽核）。
- **判定**：`sound` — 完全符合 Ticket 03 驗收條文與 `ticket-yagni` 裁決，且真機體驗點一下 Preset 就在 0.4 秒內跑完真實沙箱稽核。
- **把握度**：高

---

## Pass: `dc78bc2..62e9e0e`（Opus 重做網頁 UI 與 README 截圖，`feat/opus-web-ui`）

### 八類掃描總覽

1. **資料形狀與格式**：有（C-10：前後兩圖共用 Y 軸並重算長條高度；C-14：重複類別與事件改用帶序號的 key、合併成 ×N；C-15：對帳表在兩種情況改寫 Finding 文字）
2. **存放位置與命名**：有（C-13：介面層的衍生計算全放 `app/_studio/audit-model.ts`，`lib/` 不動；C-19：README 截圖命名 `05`–`10-studio-*.png` 並另起一節）
3. **API 契約與錯誤行為**：有（C-09：開機審計失敗時回 `null`，首頁照常顯示並退回「點 Exhibit 才審計」；`POST /api/chart-truth/run` 契約不變）
4. **新增的相依套件，連同它帶進來的預設行為與上限**：有（C-16：用 `next/font/google` 載入三套字型，build 時要能連 Google Fonts；沒有新增 npm 套件）
5. **並行與效能取捨：快取、容量上限、逾時、重試**：有（C-09：開機審計在 build 時算一次並輸出成靜態頁，不在每次開頁時打 Vultr API；C-16：首頁預載約 280 KB 字型）
6. **範圍解讀：套用範圍比規格寬或窄**：有（C-11：爆炸半徑讀數改用兩個容器收據的實際加總，並畫出逃逸原本要去的環；C-12：介面如實標示 fallback 與 replay 來源；C-17：自訂 CSV 編輯器預設收合；C-18：介面層純函式不補單元測試）
7. **測試設定改動：timeout、skip、mock、放寬斷言**：無（`git diff dc78bc2..62e9e0e -- tests` 為空；`npm test` 維持 `tests 22 · pass 22 · fail 0`）
8. **之後的程式會照抄的模式**：有（C-09：伺服器端資料經 reducer 自己的 `RESOLVE_AUDIT` 灌進初始狀態；C-13、C-14：衍生計算放 `_studio` 模型檔、清單 key 一律用 `withKeys` 產生）

純外觀與命名另有 7 條，合併計數、不逐條判定：配色（帳冊紙＋鋼板雙材質）、字級與排版、動畫時序（長條長出、印章蓋下、紅筆刪除線）、五階段戳章文案、印章與紙紋材質、`.page` 加 `overflow-x: clip`（擋住印章入場動畫在手機上撐出橫向捲動）、改用淺色 `color-scheme`。

---

### 決定明細

#### C-09：首頁改成 Server Component，在 build 時先跑一次 Exhibit A（取代 C-08）
- **何時**：commit `6c5f64f`，`app/page.tsx:8-22`（`runBootAudit`）、`app/_studio/audit-desk.tsx:63`（`seedState`）
- **決定**：首頁打開就要看到完整審計結果。觸發點是使用者不信任舊介面的美感、要求重做，main 的派工判讀建議「開機時在伺服器端先跑一次 Preset 1」。現在 `page.tsx` 在 build 時呼叫 `runChartTruthPipeline` 跑 Exhibit A，Next 把首頁輸出成靜態頁（build 結果 `○ /`）；結果經 reducer 自己的 `RESOLVE_AUDIT`（請求編號 0）灌進初始狀態，和每次即時審計走同一條路。開機審計失敗時回 `null`，首頁照常顯示並退回「點 Exhibit 才審計」。沒選的做法：(a) 維持 C-08，評審打開首頁只看到空白提示；(b) 每次開頁都跑一次，部署機有 `VULTR_API_KEY` 時每次瀏覽都會打 3 次 Vultr API（nemotron 1 次、clef 2 次），每次最多等 4 秒逾時，首屏最慢約 12 秒。
- **規格缺口**：Ticket 03 第 21 行只寫「選 Preset 或送出自訂 CSV 後要顯示…」，沒規定首次載入要不要先有結果；C-08 是先前實作者自己定的。
- **影響範圍**：開機結果在 build 當下凍結，部署後要重新 build 才會更新；Docker build 階段沒有 `VULTR_API_KEY`，所以開機那份永遠是本機後備模式，頁面已如實標示（見 C-12）。之後若改成每次請求動態渲染，要先處理 API 成本與延遲。
- **判定**：`sound` — 使用者 2026-11-05 在 worker 視窗回覆「可以啊，弄好之後我再看」，同意保留；資料仍是真實流程輸出，沒有違反 C-08「不放寫死假資料」的初衷。
- **把握度**：高

#### C-10：Container #1 與 #2 兩張圖共用同一條 Y 軸
- **何時**：commit `6c5f64f`，`app/_studio/audit-model.ts:195`（`CHART_FRAME`）、`:211`（`niceAxis`）、`:286`（`plotBars`）、`:322`（`splitAxis`）
- **決定**：前後兩張圖並排時刻度要一致。`buildSvgChartBars` 原本讓每張圖各自以自己的最大值縮放；Exhibit A 左圖多一根 $420,000 的 Total，結果左圖的 $180,000 比右圖的 $180,000 矮，正好是這個產品要揭穿的視覺扭曲。現在沿用 `buildSvgChartBars` 算好的 x 座標、寬度與 30 字標籤截斷，只用「兩圖數值與帳本值」的共同最大值重算高度，刻度取 1、2、2.5、5 倍的整齊間距；標籤依每格寬度再折成最多兩行，金額依格寬切換完整、縮寫或不顯示。沒選的做法：直接用 view model 的 `y`、`height`，同一金額在兩張圖會畫成不同高度。
- **規格缺口**：Spec 第 61 行只說圖表用結構化資料以 SVG 決定性繪製，Ticket 03 沒規定兩張圖是否共用刻度。
- **影響範圍**：`CHART_FRAME` 抄了 `lib/studio-model.ts` 的繪圖框常數（基線 196、繪圖高 148）；之後改 `buildSvgChartBars` 的框，這裡要一起改，否則長條會畫出框外。
- **判定**：`sound` — 共用刻度是誠實比較的必要條件，且重用了已受測的 x 座標與截斷邏輯。
- **把握度**：中

#### C-11：爆炸半徑讀數用兩個容器收據的實際加總，地圖畫出逃逸原本要去的環
- **何時**：commit `6c5f64f`，`app/_studio/audit-model.ts:669`（`blastTotals`）、`:718`（`SPOKE_TARGET`）、`:738`（`blastSpokes`）、`app/_studio/containers.tsx:282`（`clearanceEntries`）
- **決定**：「Blast Radius = 0」要是算出來的，不是寫死的字。view model 的 `outboundBytesLabel` 等三個標籤是固定字串（永遠寫 `0 Outbound Bytes`），顯示固定字串等於另一種寫死假資料。現在外流位元組、主機磁碟變化與外洩次數都從 Container #1、#2 的收據加總；地圖上每次逃逸嘗試畫成撞牆停下的紅色箭頭，牆外虛線指向它原本要碰的環：網路類指向 NETWORK，讀環境變數、寫檔與 CPU／記憶體類指向 HOST。帳冊側另加四項 Clearance log（放行檢查），和鋼板側的扣押紀錄對照。沒選的做法：沿用固定標籤，萬一沙箱真的外洩，畫面仍會顯示 0。
- **規格缺口**：Ticket 03 第 3 行只要求「Blast Radius = 0 遙測看板」，沒說數字從哪來，也沒規定逃逸嘗試怎麼畫。
- **影響範圍**：`SPOKE_TARGET` 把事件類型對到環，是介面層對攻擊目標的詮釋；之後新增 `ContainmentEventType` 時要補這張表，否則型別檢查會擋。
- **判定**：`sound` — 數字來自收據本身，任何外洩都會反映在畫面上。
- **把握度**：高

#### C-12：介面如實標示 fallback 與 replay 來源
- **何時**：commit `6c5f64f`，`app/_studio/audit-model.ts:611`（`scriptSource`）、`:627`（`stageProvenance`）、`app/_studio/masthead.tsx:64`（`BOOT_NOTE`）、`app/page.tsx:24`（`bootModeOf`）
- **決定**：評審看到的每個 AI 環節都要說清楚是誰算的。三個 Exhibit 的程式碼是固定重播的瑕疵腳本；沒有 `VULTR_API_KEY` 時，nemotron 與 clef 走本機後備。現在五階段每格都附來源小字（如 `exhibit script · deterministic replay`、`clef fallback`），首屏寫明開機審計是 `deterministic local fallback (no API key at render)`，clef 卡片也依 `usedFallback` 換說明。沒選的做法：只秀模型名稱，會讓人以為每次都即時呼叫了 Vultr。
- **規格缺口**：Spec 第 25 行要求無金鑰時確定性降級、第 36 行允許 Preset 用確定性腳本，但都沒規定介面要不要揭露當下用的是哪一種。
- **影響範圍**：部署機若在執行時有金鑰，點 Exhibit 後的即時審計會顯示 `live`，只有開機那份固定顯示 fallback（見 C-09）。
- **判定**：`needs-user` — 揭露程度屬於產品對外說法，寫得太明顯，評審可能覺得 Vultr 用得少。暫定做法：維持現在的小字揭露。撤回方式：刪掉 `stageProvenance` 的模式字串與 `BOOT_NOTE`，只留模型名稱。
- **把握度**：中

#### C-13：介面層的衍生計算全放 `app/_studio/audit-model.ts`，`lib/` 不動
- **何時**：commit `6c5f64f`，`app/_studio/audit-model.ts:349`（`buildTally`）、`:389`（`buildLedgerSheet`）、`:425`（`probeRows`）；`git diff dc78bc2..6c5f64f -- lib` 為空
- **決定**：新視覺需要的數字（Σ 宣稱、帳本與認證金額、×3 影子倍率、爆炸半徑加總、對帳表合計）要有地方算。派工 brief 要求不得破壞 `lib/studio-model.ts` 的匯出與回傳欄位，而 Ticket 03 的 YAGNI 修剪才剛刪過 view model 的多餘欄位。現在這些純函式都放在 `app/_studio/audit-model.ts`，直接吃 API 回應與 view model，`lib/` 一行沒改。沒選的做法：把新欄位加進 `buildStudioViewModel`，會擴大受測契約，也和剛做完的修剪方向相反。
- **規格缺口**：Ticket 03 第 17 行的測試接縫只到 view model，沒規定介面專用的衍生值放哪。
- **影響範圍**：之後新增視覺元件時，衍生計算照這個位置放；但這些函式沒有測試（見 C-18）。
- **判定**：`sound` — 保住受測契約，計算仍是無副作用的純函式。
- **把握度**：高

#### C-14：重複的類別、事件與掃描旗標改用帶序號的 key，並合併成 ×N
- **何時**：commit `6c5f64f`，`app/_studio/audit-model.ts:29`（`withKeys`）、`:485`（`countFindings`）、`:508`（`countEvents`）、`:525`（`splitDetail`）
- **決定**：不可信腳本可能回傳同名類別兩次，同一份 CSV 也可能觸發兩次相同的掃描規則。舊頁面直接用類別名稱或「位置＋規則」當 React key，遇到重複就會 key 衝突、畫面錯位。現在第二次出現的同名項目 key 加上 `~1`、`~2` 序號；相同的掃描旗標與攔截事件合併成一列並標 ×N；事件說明尾端括號裡的 docker 旗標拆成不斷行的小標籤。沒選的做法：改用陣列索引當 key，違反 React 規範，react-doctor 也會報。
- **規格缺口**：Spec 與 Ticket 03 都沒談重複類別或重複事件該怎麼呈現。
- **影響範圍**：之後渲染任何來自不可信輸出的清單，都該沿用 `withKeys`。
- **判定**：`sound` — key 由資料本身產生，順序變動也穩定。
- **把握度**：高

#### C-15：對帳表在兩種情況改寫 Finding 文字，✓ 移到認證欄
- **何時**：commit `6c5f64f`，`app/_studio/schedules.tsx:289-291`、`:317`
- **決定**：對帳表的 Finding 欄不能誤導人。view model 對每個類別只取第一筆差異原因；Exhibit C 的容器被殺、一根長條都沒畫，第一筆原因卻是 `hardcoded_unscaled`（「寫死、沒跟著 ×3」），讀起來像腳本作弊。現在 Container #1 完全沒有輸出時一律寫 `No output — container killed`；不在帳本裡的總計列寫 `Summary row plotted as a category`；修復後的 ✓ 移到認證欄，不再貼在問題描述旁。沒選的做法：照 view model 原樣顯示，Exhibit C 會給出錯誤的指控。
- **規格缺口**：Ticket 03 第 21 行只要求「逐類別對帳表」，沒規定原因文字怎麼選。
- **影響範圍**：只影響顯示；`reconciliationRows` 的資料與測試不變。
- **判定**：`sound` — 文字和實際收據一致。
- **把握度**：中

#### C-16：字型用 `next/font/google` 載入 Fraunces、Archivo、JetBrains Mono
- **何時**：commit `6c5f64f`，`app/layout.tsx:6`、`:15`、`:22`
- **決定**：財務帳冊的質感要靠字型撐。現在標題與大金額用 Fraunces（只開光學尺寸與 WONK 軸；拿掉 SOFT 軸後，預載量從 400,888 降到 279,844 bytes，兩次 build 的 `.next/static/media/*.p.*` 加總），內文用 Archivo（開寬度軸做窄體欄位標頭），數字與程式碼用 JetBrains Mono。`next/font` 在 build 時下載字型並隨站提供，執行時不連 Google。沒選的做法：(a) 用系統字型，質感回到公版；(b) 把字型檔 commit 進 repo，多一筆授權與檔案管理。
- **規格缺口**：Spec 與 Ticket 03 沒談字型；派工 brief 只建議 Instrument Serif 或 Fraunces 配 JetBrains Mono。
- **影響範圍**：`npm run build` 與 Docker build 都要能連到 Google Fonts，斷網時 build 會失敗。
- **判定**：`sound` — Next 內建做法，執行時零外部請求；部署用的 Docker build 本來就要連網安裝套件。
- **把握度**：中

#### C-17：自訂 CSV 編輯器預設收合
- **何時**：commit `6c5f64f`，`app/_studio/audit-desk.tsx:83`（`useState(false)`）、`app/_studio/exhibits.tsx`（`SourceLedger`、`CustomCard`）
- **決定**：首屏要留給 Container #1 與 #2 的對照。舊頁面把 CSV 與 prompt 編輯器常駐在最上方，主畫面被擠出首屏。現在編輯器收在「Source ledger」抽屜裡，點 Exhibit D 卡片或「Edit CSV & prompt」才展開；收合時仍顯示目前 CSV 的表頭、列數與大小。沒選的做法：常駐展開，評審第一眼看到的是編輯框，不是審計結果。
- **規格缺口**：Spec 第 37 行要求支援自訂 CSV，沒規定編輯器要不要常駐。
- **影響範圍**：想試自訂 CSV 的人要多點一下。
- **判定**：`needs-user` — 屬於版面取捨。暫定做法：維持收合，由 Exhibit D 卡片引導。撤回方式：`audit-desk.tsx` 把 `useState(false)` 改成 `true`。
- **把握度**：中

#### C-18：介面層純函式不補單元測試，只用截圖與實際操作驗證
- **何時**：commit `6c5f64f`；`git diff dc78bc2..6c5f64f -- tests` 為空，`npm test` 維持 `tests 22 · pass 22`
- **決定**：`audit-model.ts` 裡有真正的邏輯（整齊刻度、標籤換行、×3 倍率、爆炸圖幾何、對帳合計），但派工 brief 把驗收寫成「`npm test` 22/22 全綠」。現在的驗證方式是 4 輪 Playwright 實拍（3 個 Exhibit、自訂乾淨 CSV、空 CSV、手機版），加上 react-doctor 100/100。沒選的做法：新增 `tests/studio-*.test.ts`，測試數會變成 23 個以上，和 brief 的驗收字面不一致，也會擴大這次範圍。
- **規格缺口**：Spec 第 44 行說測試不耦合介面樣式，但沒說介面層的衍生計算要不要測。
- **影響範圍**：之後改 `audit-model.ts`，只能靠截圖發現回歸；例如 `wrapLabel` 或 `niceAxis` 出錯，`npm test` 不會紅。
- **判定**：`needs-user` — 測試範圍與維護成本要由使用者決定。暫定做法：不補，靠截圖驗證。撤回方式：補一支 `tests/studio-render-model.test.ts`，涵蓋 `niceAxis`、`plotBars`（NaN、零值、超長標籤）、`probeRows`、`blastTotals`。
- **把握度**：低

#### C-19：README 另起「Web Studio」一節放 6 張截圖，收據資料夾加進 `.gitignore`
- **何時**：commit `62e9e0e`，`README.md:26`、`.gitignore:6`
- **決定**：使用者 2026-11-05 同意 README 換上新介面截圖。照 qnx-vss-warden 的做法（commit `829294b`）：截圖編號接在影片截圖之後（`05`–`10-studio-*.png`），派工收據資料夾加進 `.gitignore`。這次沒像它一樣放成「Visual Walkthrough」底下的小節，而是在分隔線後另起一個 `##` 章節：影片 worker 正在重做影片，很可能改寫影片截圖清單，分開放可以讓兩邊的修改合併時不互相衝突。舊的 01–04 影片截圖與清單一行沒動。沒選的做法：直接替換 01–04，會和影片 worker 的成果衝突，也會讓截圖和片子對不上。
- **規格缺口**：Ticket 03 第 24 行只要求 README 記載架構；截圖怎麼放、和影片截圖怎麼共存都沒規定。
- **影響範圍**：6 張 2 倍解析度 PNG 共 5,625,797 bytes 進了 `docs/media/`；影片 worker 交件後，README 可能要重排兩節的先後。
- **判定**：`sound` — 使用者已同意換截圖，位置選擇以減少合併衝突為準。
- **把握度**：中

### 段尾建議

C-10、C-11、C-15 都在決定「審計結果怎麼畫才不誤導」：共用刻度、讀數來源、原因文字。這代表 spec 在視覺呈現這一塊留白。介面如果還會再改，建議回 spec 補一小節，寫明「紅＝退件、綠＝認證、薄荷綠刻度＝帳本值、兩圖共用刻度、讀數一律從收據加總」，之後就不必每次重新判斷。
