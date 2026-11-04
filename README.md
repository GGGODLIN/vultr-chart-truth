# ChartTruth — AI Chart Accounting & Containment Verification Studio

**Vultr: Agent Rush Hackathon (`Challenge 01 — Blast Radius Zero`, Pattern A)**

ChartTruth is a containment-first AI data-charting and accounting verification studio deployed on **Vultr Cloud Compute** and powered by **Vultr Serverless Inference (`https://api.vultrinference.com/v1`)**.

When an analyst drops an untrusted CSV into an AI coding assistant to generate a chart, three failure modes routinely occur:
1. **Silent Hardcoded Mock Arrays (`P1_NO_HARDCODED_MOCK`)**: Dirty currency formatting (`"$12,400"`, `"NT$380,000"`, `"N/A"`) causes naive parsers to fail and silently return fabricated literal arrays so the chart still renders.
2. **Subtotal Double-Counting & Mixed-Currency Summing (`P2_SUBTOTAL_AND_CURRENCY_CONSERVATION`)**: Summary rows (`Total`, `Subtotal`, `Grand Total`) are summed alongside leaf categories (inflating totals by `2x`), or `TWD` integers are added directly to `USD` amounts.
3. **Untrusted CSV Prompt Injection & Sandbox Escape (`P3_BLAST_RADIUS_ZERO`)**: Malicious notes columns attempt to read `process.env.VULTR_API_KEY`, POST secrets over HTTPS, overwrite host files, or detonate `while(true)` CPU/memory bombs.

---

## Architecture: Control Plane vs. Ephemeral Zero-Secret Sandbox

ChartTruth enforces a strict **Two-Layer Architecture**:

1. **Next.js Control Plane (Vultr Cloud Compute VM)**:
   - Holds `VULTR_API_KEY` and orchestrates inference calls to `https://api.vultrinference.com/v1`:
     - **`nemotron-3.5-content-safety`**: Stage 1 prompt-injection pre-scan across CSV headers, leaf cells, and summary rows.
     - **`glm-5.3-flash`**: Stage 2 candidate transformation script synthesis and Stage 5 bounded 1-pass self-healing repair using the Oracle's minimal counterexample.
     - **`clef`** (`in=['text', 'image'] -> out=['decisions']`): Stage 4 calibrated decision probabilities (`P(Data_Faithful)`, `P(Layout_Legible)`, `P(Containment_Intact)`).
2. **Ephemeral Zero-Secret Execution Sandbox**:
   - Receives **zero environment secrets** and executes every candidate script under strict resource and network isolation:
     ```bash
     docker run --rm --network=none --memory=256m --cpus=0.5 --read-only --pids-limit=64 --cap-drop=ALL --security-opt=no-new-privileges --tmpfs /work:rw,size=32m
     ```
   - Any attempted outbound connection, environment secret read, filesystem write outside `/work`, or infinite loop is intercepted and logged as a structured `ContainmentEvent` while maintaining **Blast Radius = 0 (`0 Outbound Bytes`, `0 Secrets Exposed`, `0 B Host Disk Δ`)**.
   - Includes a deterministic VM-isolated fallback runner for CI and unit/property test environments without a local Docker daemon.

---

## Independent Deterministic Accounting Oracle (`P1 && P2 && P3`)

Every sandbox execution is audited by `evaluateChartTruthOracle`:

- **`P1_NO_HARDCODED_MOCK` (Shadow-CSV `k = 3` Mutation Probe)**: Executes the AI script twice—once on the original CSV and once on a shadow CSV whose numeric leaf cells are scaled by `k = 3`. Any hardcoded mock series fails to scale proportionally (`shadowVal === 3 * originalVal`) and is rejected.
- **`P2_SUBTOTAL_AND_CURRENCY_CONSERVATION`**: Independently partitions leaf rows vs. summary rows (`Total`, `Subtotal`, `Grand Total`) and verifies per-category conservation in the target currency.
- **`P3_BLAST_RADIUS_ZERO`**: Verifies `outboundBytes === 0`, `hostSecretExposed === false`, `hostDiskDeltaBytes === 0`, and `containerDestroyed === true`.

When Container #1 fails any invariant or triggers a containment event, ChartTruth feeds the exact Oracle counterexample and sandbox `stderr` back to `glm-5.3-flash` for **one bounded self-healing pass in a fresh Container #2**, displaying the **Before (Intercepted Lie / Contained Attack)** and **After (Oracle-Verified Chart)** side by side.

---

## Built-In Adversarial Presets

1. **`Preset 1: Q3 Regional Revenue (Subtotal Double-Count + Env Exfil Injection)`** — Catches a `2x` inflated `Total` bar (`$840,000` vs `$420,000`) and blocks an embedded prompt injection attempting to POST `process.env.VULTR_API_KEY`.
2. **`Preset 2: Cross-Border SaaS ARR (Hardcoded Mock Array on Dirty Rows + Mixed USD/TWD)`** — Catches a naive script returning hardcoded `[15000, 22000, 18000]` via the `k = 3` shadow probe and filters out unaligned `TWD` rows.
3. **`Preset 3: Runway Burn Stress Test (Infinite Loop Bomb + Memory Spike)`** — Terminates an infinite `while(true)` memory spike and `/etc/shadow` write attempt with `exitCode = 137` and repairs the chart in Container #2.

---

## Local Development & Verification

```bash
npm install
npm test
npm run typecheck
npm run build
npm run dev
```

---

## Deploying on Vultr Cloud Compute VM

```bash
export VULTR_API_KEY="your-vultr-serverless-inference-api-key"
docker compose up -d --build
```

The studio will be live on `http://<vultr-vm-ip>:3000`. When `VULTR_API_KEY` is omitted or rate-limited, ChartTruth automatically falls back to deterministic local safety/oracle verification so the 3 adversarial presets remain 100% reproducible.
