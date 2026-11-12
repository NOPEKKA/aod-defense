# ARCHITECTURE

สัญญากลางอยู่ที่ [`src/contracts.ts`](../src/contracts.ts) ส่วนไฟล์นี้อธิบายว่าแต่ละส่วนต่อกันอย่างไร ใครเป็นเจ้าของอะไร และกติกาที่ทุกโฟลเดอร์ต้องทำตาม
SPEC อยู่ที่ [`docs/SPEC.md`](SPEC.md)

## 1. ภาพรวมการไหลของข้อมูล

```
 keyboard / mouse / touch
          │
   controls/ (InputSource) ──poll() ทุก tick──► InputFrame { move, commands[] }
          │                                        │
          │ AimState (ตอนกำลังเล็ง)                   ▼
          │                         core/SimRunner  (fixed 60 Hz, ×2 = 2 tick ต่อ dt)
          │                           │  copy prevX/prevY ของทุก entity
          │                           │  เรียก SimSystem.tick() ตามลำดับ order
          │                           ▼
          │       systems/ + gameplay/ แก้ WorldState  ──emit──► EventBus (typed)
          │                           │                              │
          ▼                           ▼                              ▼
   render/ (BattleRenderer.frame(view, alpha))  อ่าน WorldState + interpolate     render/ ฟัง event ไปทำ FX
```

- **Simulation** (systems + gameplay) เป็น TypeScript ล้วน **ห้ามแตะ Phaser** ทุก tick ใช้ dt = 1/60 วินาทีเสมอ
- **Render** อ่านอย่างเดียว ห้ามแก้ WorldState
- **Controls** ส่งได้แค่ InputFrame กับ event ประเภท `ui:*` เท่านั้น
- **core/** (หัวหน้าเป็นเจ้าของ) ทำหน้าที่ผูกทุกส่วนเข้าด้วยกัน ได้แก่ scene Boot/Preloader/Battle, SimRunner, การโหลด data, กล้อง, layout และ QA hooks

## 2. เจ้าของโฟลเดอร์

| โฟลเดอร์ | เจ้าของ | ต้อง export | หน้าที่ |
|---|---|---|---|
| `src/contracts.ts` | หัวหน้า | — | type, schema, event, interface ทั้งหมด **ถ้าจะแก้ต้องขอผ่านหัวหน้า** |
| `src/core/`, `src/scenes/`, `src/main.ts` | หัวหน้า | — | runner, loader, layout, กล้อง, QA hooks, scene Boot/Preloader/Battle |
| `src/systems/` | systems | `systems: SystemsModule` | เศรษฐกิจ (ทอง/เหล็ก/มานา), wave director, ตรวจแพ้ชนะ, เลเวล/ปลดล็อก, อัปเกรด, modifier, เซฟ |
| `src/controls/` | controls | `controls: ControlsModule` | คีย์บอร์ด/เมาส์/สัมผัส, ปุ่มยูนิต, ปุ่มเวท, การเล็ง (AimState), หลบ, หยุด, ×2 |
| `src/render/` | render | `render: RenderModule` | texture, sprite, animation, FX เวท, พาร์ติเคิล, ตัวเลขดาเมจ, HUD, **scene เมนูทั้งหมด** (Title/Map/Shop/PreWave/Result/Settings) |
| `src/gameplay/` | gameplay | `gameplay: GameplayModule` | Ash, ทหาร, ฮีโร่, ศัตรู, บอส, เวท, ป้อมปราสาท, AI และ registry ของ behavior/effect/attack |
| `qa/` | qa | — | Playwright tests และบอท |
| `data/` | ดูตาราง "เจ้าของไฟล์ใน data/" ด้านล่าง | — | เนื้อหาเกม |

**เจ้าของไฟล์ใน data/**

| ไฟล์ | เจ้าของ |
|---|---|
| `units`, `enemies`, `bosses`, `spells`, `relics` | gameplay |
| `upgrades`, `levels`, `wave_formula` | systems |
| `i18n/*` | render (โฟลเดอร์อื่นใช้คีย์ที่มีอยู่แล้ว ถ้าต้องการคีย์ใหม่ ให้ระบุในรายงาน) |
| `balance.json` | แบ่งตามส่วน: `ash`, `castle`, `drops`, `combat` เป็นของ **gameplay**; `world`, `book`, `economy`, `loadout`, `limits`, `stars`, `campaignWaves` เป็นของ **systems** |

แก้ไฟล์ที่ใช้ร่วมกันด้วย Edit เท่านั้น ห้าม Write ทับทั้งไฟล์

**กติกาการ import**
- import ได้จาก `src/contracts.ts` และ helper แบบ pure ใน `src/core/` เท่านั้น ได้แก่ `layout.ts` (inRect, computeHudLayout), `rng.ts`, `world.ts` (findEntity), `camera.ts`, `app.ts` (getApp สำหรับ scene เมนูของ render)
- **ห้าม import ข้ามโฟลเดอร์กัน** (systems ↔ gameplay ↔ controls ↔ render) ถ้าต้องคุยกัน ใช้ services ใน `SimContext` หรือ EventBus
- ไฟล์อื่นในโฟลเดอร์เป็นเรื่องภายในของเจ้าของ ภายใต้ `index.ts` จะจัดโครงสร้างอย่างไรก็ได้

## 3. Fixed timestep และ 120 Hz

- `SIM_HZ = 60`, `SIM_DT = 1/60`, ไล่ tick ได้สูงสุด 5 tick ต่อเฟรม (×2 = 10) ถ้า backlog เกินกว่านั้นจะทิ้งไป
- `Battle.update(time, delta)` ส่ง delta เข้า `SimRunner.frame()` ซึ่งคืนค่า `alpha` ให้ render วาดที่ตำแหน่ง `lerp(prev, current, alpha)`
- **ห้ามมีค่าไหนผูกกับจำนวนเฟรม** ทั้งความเร็ว คูลดาวน์ เวลา animation ที่มีผลกับเกม การเกิดศัตรู และการผลิตทรัพยากร ทั้งหมดต้องอยู่ใน `SimSystem.tick` และใช้ `SIM_DT`
- เวลาที่ใช้แค่กับภาพ เช่นพาร์ติเคิลหรือ tween ใช้ `frameDtMs` ใน `BattleRenderer.frame` ได้
- **อัตรารีเฟรช**:
  - `main.ts` วัด rAF ก่อนสร้างเกม (`measureRefreshHz`) แล้วตั้ง `fps.target` ตามค่าที่วัดได้
  - Phaser วาดทุก rAF จึงลื่นที่ 120 Hz บนจอ 120 Hz
- **จำกัด 60fps** (Settings):
  - `core/display.applyFpsCap()` สลับฟิลด์ TimeStep แล้วรีสตาร์ท raf loop
  - เผื่อ slack 2 ms เพื่อให้จอ 120 Hz วาดทุกเฟรมที่ 2 พอดี
  - ตรรกะยังเดินที่ 60 tick ต่อวินาทีเหมือนเดิม
- **หยุดเกม**: `ui:pause` ทำให้ runner หยุด tick ส่วน render ยังวาดต่อด้วย alpha เดิม
- **QA**: `advanceTime(ms)` เดิน tick แบบ synchronous ได้แม้ตอนหยุดเกม ผลลัพธ์กำหนดได้ (seed + input เดิม = ผลเดิม)
- **ห้ามใช้ `Math.random()` ใน sim** ให้ใช้ `ctx.rng` ส่วน render จะสุ่มเอฟเฟกต์เองได้

## 4. พิกัดและการวาด

- **พิกัดตรรกะ**: จอสูง 720 กว้าง 1280–1600 ตามสัดส่วนจอ (`computeViewWidth`) ทำให้มือถือจอยาวเห็นสนามมากขึ้นโดยไม่มีแถบดำ
- **ความละเอียด**: canvas ใหญ่กว่าพิกัดตรรกะ `renderScale` เท่า (min(DPR, 2)) และทุก scene เรียก `setupCamera(scene, R)` ซึ่ง zoom R เท่าโดยยึดมุมซ้ายบน ทำให้โค้ดทั้งหมดคิดเป็นพิกัดตรรกะได้
- **Texture**: วาดที่ขนาด ×R แล้วแสดงด้วย `setScale(1/R)` ภาพจะได้คมบนจอความละเอียดสูง ส่วน Text ใช้ `setResolution(R)`
- **โลก**: กว้าง `balance.world.width` (2560) และ Battle เลื่อนกล้องตาม Ash (`RenderView.cameraX`)
- **HUD**: อยู่ใน Battle scene เดียวกันและใช้ `setScrollFactor(0)`
- **ตำแหน่งปุ่มทั้งหมด** มาจาก `core/layout.computeHudLayout()`:
  - render วาดตามสี่เหลี่ยมพวกนี้ ส่วน controls ใช้ตรวจว่าแตะโดนปุ่มไหน
  - ห้ามฮาร์ดโค้ดตำแหน่งปุ่ม
  - ตอน resize, Battle จะส่ง `relayout()` ไปหาทุกส่วน
- **แปลงพิกัด pointer**: `CoordHelpers.toView(pointer)` แปลงเป็นพิกัดตรรกะบนจอ แล้ว `toWorldX(viewX)` แปลงเป็นพิกัดโลก

## 5. ลำดับ SimSystem (`order`)

| order | ใคร | งาน |
|---|---|---|
| 100 | gameplay | อ่าน input: Ash เดิน หลบ เรียกทหาร (`economy.spend`) ร่ายเวท (ใช้มานา) |
| 200 | systems | wave director เรียก `spawn.spawnEnemy/spawnBoss` ตามตาราง |
| 300 | gameplay | AI เลือกเป้า เคลื่อนที่ จัดแถว |
| 400 | gameplay | การโจมตี กระสุน ดาเมจ สถานะ (ไฟลุก/ช้า/สตัน) |
| 500 | gameplay | ผลของเวท บอส (telegraph → hit) ป้อมปราสาท หลุม |
| 550 | gameplay | ดรอปเมื่อศัตรูตาย (เหรียญ/มานา/อาหาร เป็น entity `kind:'pickup'`), Ash เก็บของในระยะ → `economy.collectGold` / `economy.gain('mana')` / ฮีล |
| 600 | systems | ฟื้นเหล็ก/มานา |
| 800 | systems | ตรวจแพ้ชนะ → ตั้ง `world.outcome` + emit `wave:ended` (นับทองที่ยังไม่ได้เก็บจาก pickup ที่ยังอยู่บนสนาม) |
| 900 | gameplay | เก็บกวาด: ศพที่ค้างครบ `combat.corpseTime` → `alive=false` |

- entity ทั้งหมดเป็นแบบ pool ห้ามเก็บ reference ไว้ข้าม tick ให้เก็บ `id` แทน แล้วหาด้วย `findEntity`
- เมื่อ HP หมด ตัวนั้นจะยังเป็น `alive=true` + `anim='die'` ไปอีก `corpseTime` วินาที เพื่อให้ render เล่นท่าตายได้ การตรวจว่า "เป็นเป้าที่ยังมีชีวิต" จึงต้องเช็ก `alive && hp > 0` เสมอ
- ศัตรูที่เดินถึงหนังสือ (`x <= bookX + ระยะตี`) จะตี `world.book.hp` ตรงๆ แล้ว emit `book:damaged` (gameplay เป็นคนทำ)

## 6. Data

- **โหลดและตรวจ**: `core/data.ts` อ่าน `data/*.json` ผ่าน `import.meta.glob` ตรวจด้วย zod schema ใน contracts แล้วตรวจว่าทุก id ที่อ้างถึงมีอยู่จริง
- **ถ้าผิด**: เกมจะไม่บูต และแสดงรายการปัญหาบนจอ
- **id ที่ต้องลงทะเบียน**: behavior / spell effect / boss attack ทุกตัวที่ data อ้างถึง ต้องอยู่ใน `gameplay.registeredIds()` และ `gameplay.validateData()` ใช้ตรวจ params ของแต่ละตัว
- **เพิ่มของใหม่โดยไม่แก้โค้ด**:
  - เพิ่ม entry ใน JSON + คีย์ข้อความใน `data/i18n/*.json` + sprite key (ถ้ายังไม่มีภาพ จะได้ placeholder อัตโนมัติ)
  - ต้องเขียนโค้ดเฉพาะตอนที่ต้องการ behavior / effect / attack **ชนิดใหม่จริงๆ**
- **Stat key และ modifier** (ดูคอมเมนต์ `StatKeySchema`):
  - ค่าจริง = `(base + add) * (1 + mul)`
  - upgrades.json และ relics สร้าง modifier
  - `ctx.services.mods.apply(base, 'unit.archer.damage')`
  - `unit.*.hp` มีผลกับทุกยูนิต
- **ปลดล็อก**: ยูนิตหรือเวทใช้ได้เมื่อ `highestWave + 1 >= unlockWave` ส่วน `unlockRule` ใช้กับของใหม่ในเฟส 5

## 7. Scene และ flow

| scene | เจ้าของ | หมายเหตุ |
|---|---|---|
| Boot | core | โหลด data, สร้าง AppContext, ติดตั้ง QA hooks ถ้า data ผิดจะแสดง error |
| Preloader | core | เรียก `render.buildTextures` → ไป Title (ถ้ามี) ไม่งั้นเข้า Battle คลื่น 1 |
| Battle | core | runner + controls + renderers จบคลื่นแล้วจะ `applyOutcome` + เซฟ → Result |
| Title, Map, Shop, PreWave, Result, Settings | render | ใช้ `getApp()` เพื่อเรียก services (upgrades, progression, save) และเริ่ม Battle ด้วย `makeWaveParams` |

## 8. QA hooks

ติดตั้งบน `window` (`core/qa.ts`):

| hook | ใช้ทำอะไร |
|---|---|
| `render_game_to_text()` | JSON สรุปสถานะ: scene, tick, Ash, หนังสือ, ทรัพยากร, ศัตรู 12 ตัวแรก, boss, ช่องยูนิต/เวท, outcome |
| `advanceTime(ms)` | เดินเวลาแบบกำหนดผลได้ |
| `__aodd.startWave(n)` | เริ่มคลื่น n ทันที |
| `__aodd.setProfile(p)` | ใส่เซฟที่ต้องการ |
| `__aodd.input({move, commands}, ticks)` | ฉีด input ข้ามอุปกรณ์จริง |
| `__aodd.frameTimes()` | ระยะห่างระหว่างเฟรมที่วาด (ms) ใช้วัด 60/120 |

ตัวรันเทส: `npm test` (Playwright ใช้ Chrome ที่ติดตั้งในเครื่อง + SwiftShader)

## 9. งบประสิทธิภาพ (SPEC §8)

| รายการ | งบ |
|---|---|
| ศัตรูพร้อมกัน | ≤ 60 |
| ยูนิตฝั่งเรา | ≤ 40 |
| พาร์ติเคิล | ≤ 300 (สูง) / 120 (ต่ำ) |
| ตัวเลขดาเมจ | ≤ 40 |
| texture atlas | ≤ 3 |
| draw call | < 40 |

ใน `tick`/`frame` ห้ามสร้าง object/array ใหม่ทุกเฟรม ให้ใช้ pool กับ buffer ที่ใช้ซ้ำ

## 10. สถานะ stub หลังเฟส 2 (ต้องแทนที่ในเฟส 3)

- `systems/index.ts`:
  - เซฟยังไม่มี backup/migrate
  - wave director รองรับเฉพาะด่านที่ตั้งค่ามือ ยังไม่มีสูตร
  - ยังไม่มีการตรวจแพ้ชนะ, ทองตอนจบคลื่น, ดาว, tree ของเวท
- `gameplay/index.ts`:
  - Ash เดินได้อย่างเดียว ยังไม่โจมตี
  - ศัตรูเดินไปหยุดหน้าปราสาท
  - id ทุกตัวใน REGISTERED ยังไม่ได้ implement
- `controls/index.ts`: ทำได้แค่เดิน
- `render/`: placeholder แค่กล่องสีกับ HUD ตัวหนังสือ ยังไม่มีเมนู

## 11. v2 (2026-11-11): ภาพเรนเดอร์ 3D, เสียง และสัญญาที่เพิ่ม

### 11.1 เจ้าของเพิ่มเติม

| ที่ | เจ้าของ | หน้าที่ |
|---|---|---|
| `tools/bake/src/{engine,sprite,character,props,icon,pack,studio,assets,main}.ts`, `tools/bake/run.mjs`, `manifest.mjs`, `scripts/bake.mjs` | หัวหน้า | แกนเครื่องมืออบภาพ ถ้าต้องการแก้ให้เพิ่มโมดูลใหม่ข้างๆ แล้วแจ้ง |
| `tools/bake/src/defs/allies.ts` (+ ไฟล์ `props_allies*.ts`) และผลลัพธ์ของมันใน `public/assets/` | allies (ทีมภาพ) | Ash ทหาร ฮีโร่ ของประกอบฝั่งเรา รูปหน้า |
| `tools/bake/src/defs/enemies.ts`, `defs/bosses.ts` (+ `props_enemies*.ts`) และผลลัพธ์ | enemies (ทีมภาพ) | ศัตรู บอส เศษกระดูก |
| `tools/bake/src/scene.ts`, `scenes/*.ts`, `jobs/scene.ts`, `public/assets/bg/**` | env (ทีมภาพ) | ฉากหลัง 5 บท |
| `src/audio/**` | audio | เพลงและเสียงเอฟเฟกต์ (Web Audio) |
| `art-src/**` | หัวหน้า | โมเดล CC0 ต้นทาง ห้ามแก้ |
| `public/assets/manifest.json` | สร้างอัตโนมัติ | ถ้า merge ชนกัน ให้รัน `node tools/bake/manifest.mjs` ใหม่ |

### 11.2 ภาพเข้ามาในเกมอย่างไร

```
art-src/ (โมเดล)  →  tools/bake (headless Chrome + GPU)  →  public/assets/
                                                             ├─ manifest.json        ← Preloader โหลดก่อน (render.preloadBoot)
                                                             ├─ sprites/{hd,sd}/<key>-N.webp + <key>.json (multiatlas)
                                                             ├─ sprites/meta/<key>.json
                                                             ├─ bg/{hd,sd}/<id>-<layer>-<i>.webp, bg/meta/<id>.json
                                                             └─ ui/{hd,sd}/icons_<group>-N.webp + json, ui/meta/
Battle.preload()  →  render.preloadBattle(scene, params)  →  โหลดเฉพาะ atlas ที่คลื่นนั้นใช้
```

- คุณภาพ `hd` (1.5 เท่า) หรือ `sd` (1 เท่า) เลือกจาก `settings.texQuality` (`auto` ดูจากเครื่อง)
- ชื่อเฟรม `<anim>/<index>`, เฟรมเงา `shadow`
- เกมเลือกเฟรมจาก `animTime` ของ sim (ไม่ใช้ AnimationManager ของ Phaser): วนตามเวลา, `walk` ตามระยะทางที่เดิน (`stride`), `attack` ยืดหดให้ `hitAt` ตรงกับ `attack.windup`
- สไปรต์ที่ยังไม่ได้อบ ต้องมีภาพสำรอง ห้ามทำให้เกมล้ม

### 11.3 สัญญาที่เพิ่มใน `contracts.ts`

| เรื่อง | รายละเอียด |
|---|---|
| ตำแหน่ง | `y` = จุดบนพื้น (เส้นพื้น + แถวลึก), `alt` = ความสูงเหนือพื้น, `prevAlt` |
| ท่าย่อย | `EntityState.action` ('' ถ้าไม่มี): Ash `shoot`/`melee`, id ท่าบอส, id เวท |
| การโจมตี | `AttackSchema.windup`, `projectileSpeed` |
| บอส | `BossDefSchema.speed` |
| โลก | `balance.world.laneRows`, `flyingAlt`, `holdAheadOfStairs` (เลิก `laneJitterY`, `flyingY`) |
| เศรษฐกิจ | `balance.economy.smith.levels[]`, `balance.economy.combo` |
| ค่าปรับแต่ง | `balance.tuning: Record<string, number>` ที่เก็บตัวเลขย่อยโดยไม่ต้องแก้สัญญา |
| สถานะโลก | `world.smith`, `world.rally`, `world.combo`, `world.castle`, `world.wave.chapter`, `world.wave.markers` |
| คำสั่ง | `{type:'smith'}` (systems จัดการ), `{type:'rally'}` (gameplay จัดการ) |
| event | `smith:upgraded`, `smith:denied`, `rally:changed`, `combo:changed`, `combo:ended`, `ui:button` เพิ่ม `smith`/`rally` |
| HUD | `HudLayout.ashPortrait`, `rallyButton`; `ironPanel` คือปุ่มอัปเกรดช่าง |
| render | `preloadBoot?(scene)`, `preloadBattle?(scene, params)` |
| audio | `AudioModule.init(app, game)` |
| ตั้งค่า | `Settings.texQuality` |
| anim | เพิ่ม `leap`, `cheer` |

### 11.4 ลำดับ SimSystem ที่เพิ่ม

| order | ใคร | งาน |
|---|---|---|
| 100 | gameplay | คำสั่ง `rally` สลับ `world.rally` |
| 150 | systems | คำสั่ง `smith`: จ่ายเหล็ก เลื่อนระดับ อัปเดต `world.smith` |
| 600 | systems | เหล็กตามระดับช่าง + `world.smith.progress`, คอมโบ (นับจาก `entity:died`) |

### 11.5 เทส
- `npm test` (Playwright + Chrome ในเครื่อง) ต้องผ่านก่อน commit ทุกครั้ง
- เครื่องนี้มี RTX 4080: ใช้ `--use-angle=d3d11 --enable-gpu` ได้ถ้าต้องการวัดเฟรมไทม์จริง (ค่าเริ่มต้นของ `playwright.config.ts` ยังเป็น SwiftShader)
