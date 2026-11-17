# STATE — AoD Defense remake

## งานค้างล่าสุด (2026-11-17) อ่านส่วนนี้ก่อน

**คำสั่งของผู้ใช้ที่ยังมีผล:** เกมต้องเหมือนต้นฉบับและดีกว่าทั้งกราฟิกกับเกมเพลย์ ทำต่อเนื่องโดยไม่ต้องรอ "ไปต่อ" ส่งผลเป็น Artifact ทุกครั้ง (URL เดิม https://claude.ai/artifact/K86jxnFE5XaLTxdzXEi6fG สร้างจาก `output/artifact/`) และ**พักงานทุกครั้งที่ลิมิตรอบ 5 ชั่วโมงถึง 50%**

**ฐานล่าสุด:** `main` commit `bcfbe44` เทส Playwright 28/28 ผ่าน typecheck ผ่าน production build เปิดเกมและเล่นคลื่น 3 และ 10 ได้ไม่มี error

**merge แล้วครบทุกทีม:** systems+controls v2, audio, art items/allies/enemies/env/bosses (สไปรต์ 69, ฉาก 5, ไอคอน 5 ชุด), render v2, gameplay v2 (ฮีโร่ใหม่ 4, เวทใหม่ 6, เรลิก 5, บอส 6 ทุกท่ามีเตือน, ดู `docs/BOSSES.md`) คลื่น 10/20/30/40 เป็นด่านบอสแล้ว เพิ่มคำแปลชื่อของใหม่แล้ว

**ขั้นถัดไป (เรียงตามลำดับ)**
1. ทีม QA/บาลานซ์: บอท 3 กลยุทธ์เล่นครบ 50 คลื่น วัดเฟรมไทม์ 60/120 ปรับเลข โดยเฉพาะ HP และจังหวะบอส (ตอนนี้เป็นค่าเดา)
2. คำแปลระดับเวท `spell.<id>.t1/.t2/.t3a/.t3b` ยังไม่มี (ร้านค้าจะโชว์คีย์ดิบถ้าใช้)
3. ภาพที่ยังขาด: กับดักเหล็ก `bear_trap`, กระสุน `holy_light`, `lance`, โลง/หัวฟักทอง/ขวดพิษ (ตอนนี้ยืมภาพอื่น)
4. ขัดเกลา: สีฉากบทไฟไหม้และพระจันทร์เลือดยังจัด, รูปหน้า Arthur/Morwen ถูกตัด, ท่าเตือนของ Mire/Hollow ดูยาก, โหลดแผ่น fx ทั้ง 19 ทุกด่าน (ควร lazy-load)
5. contract ที่ทีมขอ: hit-stop ฝั่ง sim, `EntityState.hidden` สำหรับบอสมุดดิน (render ต้องซ่อนตัวตอน `telegraph:burrow`)
6. รอบ improve-game แล้วอัปเดต Artifact

---|---|---|---|
| art-allies (Ash, ทหาร, ฮีโร่, ช่างตีเหล็ก) | `agent-a876223e6889c0a00` | Sonnet | bake 8091 |
| art-enemies (ศัตรู 11 ชนิด, เศษกระดูก, หิน, ลูกไฟ) | `agent-a7eed5dd4a65cc78b` | Sonnet | bake 8092 |
| art-bosses (บอส 6 ตัว) | worktree ใหม่ ฐาน `3714d47` | Sonnet | bake 8093 |
| art-env (ลานปราสาท 5 บท) | `agent-ab98fd14fab1deac3` | Sonnet | bake 8094 |
| render v2 | `agent-a4398ae33ad22b617` | Fable | dev 8111 |
| gameplay v2 + เนื้อหาใหม่ | `agent-a201340187889d9de` | Fable | dev 8112 |

merge แล้ว: systems+controls v2, audio, art-items

**ขั้นถัดไปของหัวหน้า (เรียงตามลำดับ)**
1. รอทีมย่อยรายงาน ถ้าทีมไหนหยุดเพราะชนลิมิต ให้ส่งข้อความสั่งทำต่อ (งานใน worktree ไม่หาย)
2. merge ทีละทีมเข้า `main`: ภาพก่อน (ไฟล์ไม่ชนกัน ยกเว้น `public/assets/manifest.json` ให้รัน `node tools/bake/manifest.mjs` ใหม่) แล้ว systems+controls, gameplay, render, audio
3. หลัง merge gameplay: เปลี่ยนด่าน 10/20/30/40 ใน `data/levels.json` เป็น `kind: "boss"` พร้อม `bossId` (`gravewright`, `mother_mire`, `sir_hollow`, `malachar`)
4. รันเทสทั้งหมด ดูภาพหน้าจอเกมจริงเทียบกับภาพต้นฉบับ แก้จุดที่ยังไม่เข้ากัน
5. ส่งทีม QA/บาลานซ์: บอท 3 กลยุทธ์เล่นครบ 50 ด่าน, วัดเฟรมไทม์ที่ 60 และ 120, ปรับตัวเลข
6. รอบ improve-game สุดท้าย
7. build แล้วส่ง Artifact (หน้ารายงานภาษาไทย + เกมที่เล่นได้), อัปเดตไฟล์นี้, commit

---

## อัปเดตล่าสุด
2026-10-26 โดย Claude (หัวหน้าทีม)

## เฟสปัจจุบัน
เฟส 2 เสร็จแล้ว (โครงสร้างและสัญญากลาง) **รอผู้ใช้พิมพ์ "ไปต่อ"** เพื่อเริ่มเฟส 3 (subagent 4 ตัวทำงานขนานกัน)

## ทำแล้ว (เฟส 2)
- **scaffold** ด้วยเทมเพลตทางการ `phaserjs/template-vite-ts` 1.4.0:
  - เทมเพลตตอนนี้ใช้ Phaser 4 จึงปักกลับเป็น **Phaser 3.90.0**
  - ลบ `log.js` ที่ส่งข้อมูลการใช้งานไปเซิร์ฟเวอร์ภายนอก
  - เพิ่ม zod และ Playwright
- **`src/contracts.ts`** มี:
  - schema ของ data ทุกไฟล์
  - ProfileState, WorldState, InputFrame, HudLayout
  - typed events
  - interface ของ 4 โฟลเดอร์
  - scene keys และ QA hooks
- **`src/core/`**:
  - SimRunner fixed 60 Hz + interpolation + ×2 + pause + `advanceTime`
  - EventBus
  - seeded RNG
  - ตัวโหลดและตรวจ data (schema + id ที่อ้างถึง + id ที่ต้องลงทะเบียน)
  - วัดอัตรารีเฟรชจอแล้วตั้ง fps target ตามนั้น และฟังก์ชันจำกัด 60fps ขณะเล่น
  - ความกว้างจอตรรกะ 1280–1600 ตามสัดส่วนจอ
  - กล้องคูณ renderScale
  - HUD layout รวมศูนย์ + safe-area
  - QA hooks
- **scene** Boot, Preloader, Battle (หัวหน้าเป็นเจ้าของ)
- **stub ของ 4 โฟลเดอร์** (systems, controls, render, gameplay) ทำงานพอให้บูตได้:
  - Ash เดินได้
  - ศัตรูคลื่น 1 เกิดและเดินมาที่ปราสาท
  - ภาพเป็นกล่องสี placeholder
  - HUD ภาษาไทย
- **`data/`** ใส่เนื้อหาต้นฉบับตาม SPEC:
  - ทหาร 11 แบบ (รวมฮีโร่), ศัตรู 11 ชนิด, บอสต้นฉบับ 2 ตัว, เวท 7 อัน
  - อัปเกรด 32 รายการ
  - ด่าน 50 ด่าน (ด่าน 1–3 ตั้งค่าเอง ที่เหลือใช้สูตร)
  - ข้อความไทย/อังกฤษ 77 คีย์
- **เอกสาร**: `docs/ARCHITECTURE.md`, `AGENTS.md`, `CLAUDE.md`, อัปเดต `docs/tech.md`, ปิดคำถามค้างใน SPEC §10 (ใช้ค่าที่เสนอทุกข้อ)
- **ทดสอบ**:
  - Playwright 5/5 ผ่าน: บูตไม่มี console error, 2 วินาที = 120 tick พอดี, Ash เดิน 200–240 px ใน 1 วินาที, คลื่น 1 มีโครงกระดูกเกิด, เก็บ frame time ได้
  - typecheck และ build ผ่าน
  - ภาพหน้าจอที่ `output/qa/smoke-battle.png`

## ทำแล้ว (เฟส 1)
- `docs/SPEC.md`, `docs/gameplan.md`, `docs/tech.md`, ADR-0001

## ทำแล้ว (เฟส 0)
- ติดตั้ง skill game-creator, ค้นข้อมูลต้นฉบับลง `reference/NOTES.md`, สร้างโปรเจกต์ที่ `D:\CLAUDEONLY\aod-defense` พร้อม git repo แยก

## คำตอบเฟส 0 (ล็อกแล้ว)
| เรื่อง | คำตอบ |
|---|---|
| แหล่งข้อมูลต้นฉบับ | ค้นจากเว็บ, ติดป้าย "เดา" เมื่อไม่แน่ใจ, ไม่ใช้ asset ต้นฉบับ |
| โฟลเดอร์ | `D:\CLAUDEONLY\aod-defense`, git repo ของตัวเอง |
| สไตล์ภาพ | การ์ตูน 2D สีสด ตัวหัวโต เส้นขอบหนา วาดเป็นเวกเตอร์ด้วยโค้ดแล้วรวมเป็น texture atlas ไม่ต้องใช้ API key |
| ภาษา UI | ไทยเป็นหลัก สลับอังกฤษได้ |
| Sheila / Evil Ash | ศัตรู/บอสก่อน แล้วปลดล็อกเป็นฮีโร่ในเฟส 5 |
| ทรัพยากร | ทอง + เหล็ก + มานา |
| ของใหม่ | ฮีโร่ใหม่ 2 ตัว, เวทใหม่ 6 อัน (อันละ 3 ระดับ), บอสใหม่ 4 ตัว (10/20/30/40) + Evil Ash แบบ 3 เฟส (50) |
| ด่านเฟส 4 | ครบ 50 ด่านจากสูตร ตั้งค่าเองเฉพาะด่าน 1–10, 45, 50 |
| คำถามค้าง SPEC §10 | ใช้ค่าที่เสนอทุกข้อ |

## เหลือ
- **เฟส 3**: สั่ง subagent 4 ตัว (systems, controls, render, gameplay) ทำพร้อมกัน แต่ละตัวแก้เฉพาะโฟลเดอร์ตัวเอง ใช้รายการ stub ใน ARCHITECTURE §10 เป็นจุดเริ่ม จากนั้นหัวหน้ารวมโค้ด แล้วส่ง QA subagent เล่นด่าน 1–3 ตรวจว่า:
  - ควบคุมได้
  - ศัตรูเดินและโจมตี
  - ปราสาทพังแล้วแพ้
  - ชนะแล้วไปด่านต่อ
  - เซฟได้
- เฟส 4–7 ตามบรีฟ

## ปัญหา / ข้อสังเกต
- **ยังไม่ได้วัดเฟรมไทม์บนมือถือหรือจอ 120 Hz จริง** headless Chrome วาดได้ ~165 fps เพราะไม่มี vsync เฟส 7 ต้องวัดบนเครื่องจริงผ่าน `npm run dev:lan`
- **ตัวจำกัด 60fps** ใช้ฟิลด์ภายในของ Phaser TimeStep (`_limitRate`) ถ้าวันหน้าอัป Phaser ต้องเช็กส่วนนี้ใหม่
- **ไม่ได้ทำ texture atlas จริงในเฟสนี้** placeholder ใช้ DynamicTexture แยกเป็นใบๆ ส่วน atlas จะทำในเฟส 6 ตอนวาดภาพจริง
- **Vite** ยังเป็น 6.x ตามเทมเพลต (ล่าสุด 8.x) ยังไม่อัปเพราะไม่มีความจำเป็น
- **skill ไม่ตามมาตอนย้ายโฟลเดอร์** ถ้าหาย ให้ติดตั้งใหม่ด้วย `npx skills add OpusGameLabs/game-creator -a claude-code`
- **คำแนะนำของ skill phaser ที่ไม่ใช้กับโปรเจกต์นี้**: "Play.fun safe zone", "ไม่มีหน้าเมนู", "ไม่มี HUD คะแนน" เป็นค่าเริ่มต้นของ skill สำหรับเกมแบบอื่น แต่บรีฟของเราต้องการเมนูและ HUD

## ขั้นถัดไป
รอผู้ใช้พิมพ์ "ไปต่อ" จากนั้นเริ่มเฟส 3: โหลด skill phaser, game-architecture, game-qa แล้วเปิด subagent 4 ตัวพร้อมกัน แต่ละตัวได้ brief ตามหัวข้อของโฟลเดอร์นั้นใน ARCHITECTURE.md
