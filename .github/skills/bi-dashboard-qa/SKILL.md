---
name: bi-dashboard-qa
description: 'Use when: QA/QC the bi-dashboard, verify KPI formulas against raw ListBooking data, reconcile web numbers with the Power BI model, run a regression before deploying, investigate "why are these numbers different", check a page for broken interactions or mobile/overflow issues, or write a QC round report. Triggers include QA, QC, ตรวจสูตร, เช็กตัวเลข, ตัวเลขไม่ตรง, สูตรถูกไหม, regression, ก่อน deploy, ทดสอบหน้า, ทำไมเรียงแบบนี้.'
argument-hint: 'What should be verified? e.g. "QA the Summary page for 2026-11 against PBI"'
---

# BI Dashboard QA / QC

Verify the `bi-dashboard/` clone of the Power BI "Report Sale Order" and prove every claim with numbers.
Run it whenever the user challenges a number, and before your own commit/push of a bi-dashboard fix.

## When to Use

- "QA / QC หน้านี้", "ตรวจสูตร", "เช็กตัวเลข", "สูตรถูกไหม", "ผิดมั้ย"
- "ตัวเลขไม่ตรงกับ PBI", "ทำไม Unit มากกว่าอยู่ล่าง", mobile/desktop layout breakage
- Regression pass before a push, or after deleting/renaming a page or handler

Not for: building the feature itself, Apps Script API tests (`tools/qa-full.js` covers that), or static sites outside `bi-dashboard/`.

## Non-negotiables

1. **No "ผ่าน" without numbers.** Every pass line is `ค่าบนจอ | ค่าที่คำนวณเอง | ต่าง | ผล`.
2. **Recompute independently.** Never call the app's own helper to prove the app — read `bi-dashboard/data-snapshot.js` or the source xlsx and aggregate it yourself.
3. **Answer first, evidence second.** Start with "ไม่ผิด" / "ผิด" / "ผิดที่การเรียง ไม่ใช่ตัวเลข" in one line.
4. **Classify every difference** before calling it a bug: wrong formula vs newer snapshot vs different definition vs wrong sort key.
5. **Never imply coverage.** Untested → write "ยังไม่ได้ตรวจ" and why.
6. **Preserve Thai labels exactly** as they appear in PBI (e.g. `เครื่องซักผ้า LG Stack 13/17 Kg & ซัก/อบ เดี่ยว 13/17 Kg`). No retranslation.
7. **Never rewrite Thai files with PowerShell** `Set-Content` / `-replace` — BOM + mojibake. Use editor edit tools.

## Procedure

### Step 0 — Scope (do not skip)

Collect before touching code:

| Item | Example |
|---|---|
| Page / tab | `Summary`, `2.Pending`, `P3.Consult`, `End of Mth` |
| Month | `2026-11` (`yyyy-mm`) |
| Data source | `data-snapshot.js` `?v=1140a`, or `<timestamp>_ListBooking.xlsx` |
| User's claim | "Unit เยอะกว่าต้องอยู่บนสุด" |

If the claim is about ordering, **identify the table's sort key first** (`Top 15 ตามยอดขาย` sorts by Revenue, not Unit). A correct number under a different sort is not a bug — but the column header/legend must make that obvious.

### Step 1 — Static and structural

```
node --check bi-dashboard/<file>.js
node tools/qa-static.js     # syntax, asset refs, single ?v token, team numbering
node tools/qa-deep.js       # duplicate function names, dead $('id'), snapshot shape
```

Pass criteria: 0 syntax errors · every `src`/`href` resolves · exactly **one** `?v=` value across `index.html` and `data-snapshot.js` · no duplicate function names · no dead element ids.

`qa-static` prints a JSON report, not a verdict — read `syntax`, `refs`, `tokens`, and the `labels.un` section (labels with no team number) yourself. `labels.dupes` legitimately lists team × product-group family variants; it is only a problem when a **distinct** team shares a number.

**Re-run after deleting or renaming a page.** Orphaned handlers are the top regression here — a deleted test page once took the "ตามแล้ว" button's handler with it.

### Step 2 — Recompute KPIs from raw data

| Metric family | Tool |
|---|---|
| Aggregates per month | `node tools/qa-aggregate.js [yyyy-mm]` |
| Derived KPIs | `node tools/qa-derived.js [yyyy-mm]` |
| SLA / TAT | `node tools/qa-sla.js [yyyy-mm]` |
| Aging 21 วัน | `node tools/qa-aging21.js [yyyy-mm]`, `qa-aging21b.js` |
| Product group / vendor scope | `qa-groups.js`, `qa-vending.js`, `qa-lookups.js` |
| Status conflicts | `qa-status-conflict.js` |
| Excel formula parity (300-row sample) | `qa-formula-sample.js [yyyy-mm]` |
| Single record drill-down | `qa-row.js SO…`, `qa-col.js SO…`, `qa-memo.js SO…`, `qa-check-so.js`, `qa-so-date.js` |

Scope rule: keep every group matching `หยอดเหรียญ`, **including** `เครื่องชงกาแฟหยอดเหรียญ`. Exclude `สารกรอง`, `เครื่องกรองน้ำ`, `Water mate`, `ตู้กดน้ำร้อน-น้ำเย็น`.

If no tool covers the metric, write a throwaway script against the snapshot — never eyeball a chart.

### Step 3 — Internal identities

Every one of these must hold for the selected month (full list + worked examples in [invariants](./references/invariants.md)):

- `SO = Done + Pending + Cancel` and status % sums to 100
- `Unit = Σ product-group units`
- `SO = Σ area (GBKK + UPC)`
- `Revenue by status = Revenue total`
- `Backlog = Σ aging buckets`; `>21 วัน` is a subset
- `อัตราปิดงาน = Done ÷ (SO − Cancel)`
- `Forecast = per-day average × days in month`
- `Pack สด/ผ่อน` sums to SO; `Performance/TAT closed = Done + Cancel`
- Every table's visible rows reconcile to its Total, **or** the table says "แสดง X จาก Y แถว"

### Step 4 — Cross-page reconciliation

Same metric on two pages must match for the same month/filters: SO/Unit/Revenue vs `Daily Admin`, pending vs `2.Pending`, cancel vs `3.Cancel`, aging total vs pending, `P3.Consult` "ต้องตามวันนี้" vs `2.Pending`.

Legitimate mismatches must be **labelled on screen**, not only in the report: system-wide backlog vs monthly, truncated tables showing grand totals, Top-5 rounding to 99%.

### Step 5 — External model reconciliation

```
node tools/qa-recon.js [yyyy-mm]   # vs C:\Users\pongtap.p\system-backup\pbix-data\Data saleOrder.csv
```

Tolerance when the snapshot is newer: ±1–5 rows / ≈±฿0.5M. **Prove** it is new data by showing the delta distributed across dimensions (e.g. `+3 = UPC +3, ตู้กดน้ำ +3, GBKK 0`). If the delta does **not** decompose cleanly, or concentrates in one status, keep digging — treat it as a formula bug.

### Step 6 — Data-hygiene traps

| Trap | Check |
|---|---|
| Test rows | `isTestCustomer` filters e.g. `ทดสอบ ไอที`; exclude from every count |
| Status regex too narrow | `จัดส่ง` must count as shipped, not only `จัดส่งแล้ว` / `ได้รับแล้ว` |
| Negation | `test('เรียบร้อย') && !test('ไม่')` for deposit status |
| Blank status | count separately; blank ≠ cancel |
| Revenue blanks | `Rev.Total` excludes blank revenue |
| Fractional SLA | Excel stores 0.938 → app rounds; expected, document it |
| Per-row rounding | Top-N team shares may total 99% |
| `สถานะใบงาน3` | ~94% vs PBI is a known source-timing limit, not a formula error |

### Step 7 — Render and interaction matrix (required when UI/CSS/layout changed)

Trigger the **full matrix** whenever the change touches `*.css`, `index.html`, chart markup, page structure, or a deleted/renamed page: every tab **plus** the ☰ extras, at 1600 / 1024 / 900 / 480 / 390 / 360 px.

For a data/formula-only change (`*.js` aggregation, snapshot rebuild), one desktop viewport is enough — but still assert 0 console errors, 0 `NaN`/`undefined`, and 0 horizontal overflow on the affected page.

Check per viewport: 0 console errors · 0 `NaN`/`undefined`/`null`/`Infinity`/`#DIV/0` · 0 horizontal overflow · 0 clipped text (`scrollWidth > clientWidth`) · card title/hint not overlapping · first column sticky in `table.pbi` · mobile hides Import/Export/Save.

Then **interact**, don't just render: month picker (1↔3 month mode keeps scroll), team filter + clear, save + reload, acknowledge buttons, collapsible definitions, retry on snapshot failure.

### Step 8 — Fix, ship, verify

1. Patch with editor tools (Thai text safe).
2. `node tools/bump-token.js "?v=NNNNx"` — one token for `index.html` **and** `data-snapshot.js`.
3. `node tools/build-html.js`; `node tools/lint-inline.js` → `problems = 0`.
4. Commit + push `pi main` yourself — this skill ships the fix. Use the preflight/tagging rules in `.github/agents/release-deploy.agent.md` when a tag or Apps Script deploy is involved.
5. Wait ≈85 s for Pages, reload with `?v=Date.now()`, verify the fixed behaviour live.

### Step 9 — Report

Append `# QC Round N — <date> (<topic>)` to `bi-dashboard/QA-QC.md`: files touched · checks table · formulas table with real numbers · bugs (`ระดับ / อาการ / สาเหตุ / แก้`) · regression · limitations · verdict.

Chat answer order: **verdict (1 line)** → bugs found and fixed → evidence table → remaining limitations. Do not write "27/27 ผ่าน" or "0 error" unless you actually enumerated them.

## Decision Table

| Symptom | Likely cause | Action |
|---|---|---|
| Number off by 1–5 rows | Snapshot newer than PBI | `qa-recon.js`; show delta by dimension |
| One status wrong, total right | Status regex / negation | Inspect raw rows with `qa-row.js` |
| Total ≠ visible rows | Truncated table | Add "แสดง X จาก Y แถว" note |
| User disputes ordering | Sorted by another column | Check sort key; add sortable headers |
| Button dead after refactor | Handler removed with old page | `qa-deep.js` dead ids + manual click |
| Blank/NaN on mobile only | Snapshot load race | Retry + `waitSnapshot()` + reload button |
| Charts look stretched | SVG text scaling | Use HTML/CSS chart primitives |
| Thai text corrupted | PowerShell write | `git checkout -- <file>`, redo via editor |

## Assets

- [scripts/run-qa.ps1](./scripts/run-qa.ps1) — static + structural + optional PBI reconciliation in one run
- [references/invariants.md](./references/invariants.md) — identity checklist, worked Nov-2026 values, known-legitimate differences

## Related

- `.github/agents/release-deploy.agent.md` — build → lint → cache-bust → deploy → verify → tag
- `bi-dashboard/QA-QC.md` — the historical QC ledger this skill keeps extending
