# สูตรจริงของรายงาน Sale Order (ยืนยันจากต้นฉบับ)

ที่มา:
- **ไฟล์ Excel** `D:\Report\Report Sale Order.xlsx` → ชีต `Data saleOrder` (อ่านด้วย `tools/xlsx-formulas.js`, อ่านอย่างเดียว)
- **โมเดล Power BI** `D:\Report\Report Sale Order.pbix` → TMDL (`pbi-tools extract`)

ทุกสูตรด้านล่างคือสูตรที่อยู่ในไฟล์จริง ไม่ใช่การคาดเดา

---

## 1. คอลัมน์ที่คำนวณใน Excel (สูตรจริง)

| คอลัมน์ | ชื่อ | สูตรจริงในไฟล์ | สถานะในเว็บ |
|---|---|---|---|
| DW | `revenue` | `IF([ราคาเงินสด]="",[ราคาขาย],[ราคาเงินสด]) - [ส่วนลด]/1.07` | ✅ ตรง |
| DB | `สถานะใบงาน3` | `IF([สัญญา]<>"","1.Done", IF([Check SV. Cancel]="", VLOOKUP($CY3,'Master Stutus'!D:F,3,0), "3.Cancel"))` | ✅ ตรง |
| DZ | `Check SV. Cancel` | `IF([สัญญา]<>"","", IF(OR(ISNUMBER(SEARCH("ยกเลิก",[หมายเหตุปิดใบงาน])), AND(LEFT([หมายเหตุปิดใบงาน],1)="C",ISNUMBER(--MID([หมายเหตุปิดใบงาน],2,2)))), "Cancel",""))` | ✅ ตรง (ย้อนกลับเป็น OR) |
| CY | `MapStutus` | `CONCATENATE([ผู้รับผิดชอบ],[สถานะ ALL],[สถานะใบงาน])` | ✅ ตรง |
| DD | `จำนวนเครื่องซักผ้า` | `=[จำนวน Set]` | ✅ ตรง |
| DH | `SLA Admin` | `MAX([Date Admin]-[Date SO],0)` | ✅ ตรง |
| DG | `Date Admin` | `IF([สถานะ Admin]="ไม่ผ่าน",[วันที่ Admin], IF([วันที่ Admin]="",TODAY(), IF([สถานะใบงาน3]="3.Cancel",[วันที่ปิดงาน],[วันที่ Admin])))` | ✅ ตรง |
| DE | `วันที่ปิดงาน` | `IF([วันที่ทำสัญญา]="",[ช่างปิดงาน2],[วันที่ทำสัญญา])` | ✅ ตรง |
| CP | `Grp ทีมขาย` | `VLOOKUP([MEMO ทีม],'แปลง Name'!M:N,2,FALSE)` | ✅ ตรง |
| CT | `Grp Pack` | `IF([Package]=1,"เงินสด","ผ่อน")` | ⚠️ เว็บใช้ `จำนวนงวด = 1` (คอลัมน์ต่างกัน แต่ผลใกล้กัน) |
| DA | `PIC ผู้รับผิดชอบ` | `IFERROR(VLOOKUP($CY3,'Master Stutus'!D:F,2,0),"Data Error")` | ❌ ยังไม่มี |
| DC | `(เช็คเครื่องซักผ้า)` | VLOOKUP(`แพ็คเกจ` → `แปลง Name'!BH:BI`) หรือ VLOOKUP(`สินค้า` → `'แปลง Name'!BE:BF`) | ❌ ยังไม่มี |

## 2. Measures ใน Power BI (DAX จาก TMDL)

| Measure | DAX | สถานะ |
|---|---|---|
| `Rev.Done` | `CALCULATE(SUM(revenue), [สถานะใบงาน3] IN {"1.Done"})` | ✅ |
| `Total Unit` | `CALCULATE(SUM(จำนวนเครื่องซักผ้า), [สถานะใบงาน3] IN {"1.Done","2.Pending","3.Cancel"})` | ✅ |
| `Rev.Total` | `CALCULATE(SUM(revenue), [สถานะใบงาน3] IN {"1.Done","2.Pending","3.Cancel"})` | ✅ (ไม่นับแถวสถานะว่าง) |

## 3. คอลัมน์ group ที่เป็น DAX (calculated column)

| คอลัมน์ | DAX |
|---|---|
| `สถานะ Admin (groups)` | SWITCH: blank→"(Blank)", "ผ่าน"→"1.ผ่าน", {"รอตรวจสอบ","ระหว่างแก้ไข","ระหว่างตรวจสอบหลังแก้ไข"}→"2.Pening", "ไม่ผ่าน"→"3.ไม่ผ่าน" |
| `จังหวัด (groups)` | SWITCH: blank→"(Blank)", 6 จังหวัดmetro→"GBKK", อีก ~70 จังหวัด→"UPC", อื่น ๆ→ค่าจังหวัด |
| `สถานะใบงาน3 (groups)` | blank→"(Blank)", "1.Done"→"Admin ผ่าน", {"2.Pending","3.Cancel"}→"Pending" |
| `PIC ผู้รับผิดชอบ (groups)` | blank→"(Blank)", {"Data Error","Unknow"}→"Other" |

## 4. ข้อจำกัดที่ทราบ (เขียนไว้กันลืม)

- Power BI อ่าน `สถานะใบงาน3` / `revenue` เป็น **ค่าที่ Excel คำนวณไว้แล้ว** (paste เป็นค่า)
  ส่วนเว็บคำนวณสูตรสดจาก 90 คอลัมน์ของ ListBooking → แถวที่ค่าในไฟล์ไม่ตรงกับสูตรปัจจุบันจะต่างกัน (~1%)
- `MapStutus` ใช้คอลัมน์ `สถานะใบงาน` (Excel CU) ซึ่งไม่มีใน ListBooking 90 คอลัมน์
  เว็บจึงคำนวณ `สถานะงาน` เอง (ผลตรงกันเกือบทั้งหมด)
- `Master Stutus` (D:F) ถูกถอดจากข้อมูลจริงในโมเดล → `master-status.js` (194 คีย์)
