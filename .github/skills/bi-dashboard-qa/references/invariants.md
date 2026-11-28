# BI Dashboard — invariants and known-legitimate differences

Reference values use **2026-11** (Nov 2026), coin-op scope including coffee machines.

## 1) Internal identities (all must hold)

| # | Identity | Nov-2026 value | Tolerance |
|---|---|---|---|
| 1 | `SO = Done + Pending + Cancel` | 193 + 180 + 44 = **417** | 0 |
| 2 | status % sums to 100 | 46 + 43 + 11 | ±1 (rounding) |
| 3 | `Unit = Σ product-group units` | 343 + 46 + 28 + 17 + 2 = **436** | 0 |
| 4 | product-group % sums to 100 | 79 + 11 + 6 + 4 + 0 | ±1 |
| 5 | `SO = Σ area` | 246 (GBKK) + 171 (UPC) = **417** | 0 |
| 6 | `Revenue by status = Revenue total` | 9.7 + 15.4 + 2.8 ≈ **฿27.9M** | ±0.05M |
| 7 | `Backlog = Σ aging buckets` | 35 + 38 + 48 + 29 + 722 = **872** | 0 |
| 8 | `>21 วัน` is a subset of backlog | 722 of 872 (83%) | 0 |
| 9 | `อัตราปิดงาน = Done ÷ (SO − Cancel)` | 193 ÷ 373 = **52%** | ±1pp |
| 10 | `Cancel ÷ SO` | 44 ÷ 417 = **11%** | ±1pp |
| 11 | `Forecast SO = avg/day × days` | 15.4 × 30 = **463** | ±2 |
| 12 | `Forecast revenue = monthly × days/elapsed` | 27.9 × 30/27 = **฿31.0M** | ±0.2M |
| 13 | `Pack สด/ผ่อน` sums to SO | 245 + 172 = **417**; Done 114 + 79 = 193 | 0 |
| 14 | `Performance/TAT closed = Done + Cancel` | 193 + 44 = **237** | 0 |
| 15 | Every table: Σ visible rows = Total **or** truncation is labelled | — | 0 |
| 16 | MoM deltas recomputable from the two months' own values | — | ±0.1 |

If any identity fails: drill to rows (`node tools/qa-row.js SO…`) before assuming the formula is wrong — the snapshot itself may contain the outlier.

## 2) Known-legitimate differences (do not "fix")

| Difference | Why it is correct | Requirement |
|---|---|---|
| ±1–5 SO / ±฿0.5M vs PBI model | Snapshot newer than the PBI export | Show delta decomposed by UPC/GBKK/group |
| Backlog 872 vs pending 180 | Backlog is system-wide, pending is month-scoped | Both places must say so |
| Table total ≠ visible rows | Table truncated to Top-N | Show "แสดง X จาก Y แถว" |
| Top-5 team share = 99% | Per-row rounding | Fine, or show 1 decimal |
| `สถานะใบงาน3` ≈94% match | Different snapshot time in Excel vs PBI | State it as a source-timing limit |
| SLA 7.5 vs 8 | Excel stores fractional days, app rounds | Keep rounding consistent |
| Unit high but revenue low | Multi-unit low-price orders | Sort/legend must name the key |
| Revenue excludes blanks | Matches PBI `Rev.Total` semantics | Blanks reported separately |

## 3) Scope rules

- Include **all** groups matching `หยอดเหรียญ`, including `เครื่องชงกาแฟหยอดเหรียญ` (coffee is in scope — excluding it broke PBI parity once).
- Exclude `สารกรอง`, `เครื่องกรองน้ำ`, `Water mate`, `ตู้กดน้ำร้อน-น้ำเย็น`.
- Test customers (`ทดสอบ`, QA fixtures) never count.

## 4) Reporting skeleton

```
# QC Round N — YYYY-MM-DD (<topic>)

## Files touched
bi-dashboard/<files> · data-snapshot.js ?v=<token>

## Checks
| การตรวจ | ผล |
| node --check (6 files) | ผ่าน 6/6 |
| index.html refs | ครบ ไม่มี missing |
| cache-bust token | ค่าเดียว ?v=NNNNx |
| console error (N pages × M viewports) | 0 |

## Formulas
| ตัวชี้วัด | ค่าบนจอ | คำนวณจากข้อมูลดิบ | ต่าง | ผล |

## Bugs found & closed
| ระดับ | อาการ | สาเหตุ | การแก้ |

## Regression / interaction
| เคส | ผล |

## Remaining limitations
(ข้อมูล ≠ โค้ด — ระบุชัด)

## Verdict
```

## 5) Anti-patterns (these caused rework before)

- Claiming a table "passed" after reading only the rendered DOM.
- Calling a correct value "ผิด" because the sort key was misunderstood.
- Fixing a handler and testing only page render, not the click.
- Letting `data-snapshot.js` keep an older `?v=` than `index.html`.
- Reporting "0 error" without listing pages × viewports actually visited.
