/**
 * Touch-friendly menu widgets: Button (Container + NineSlice plank + Text, the only
 * interactive object is the container), the ledger page panel, drag-scroll area,
 * confirm dialog and toast.
 */
import { inRect } from '../../core/layout';
import type { Rect } from '../../contracts';
import { KIT_RES, addIcon, ironPlate, nine, page, type PageOpts } from './skin';
import { C, addText, fitText } from '../style';

export type Variant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'gold' | 'selected';

/**
 * Plank materials: primary = oxblood leather, secondary = oak, ghost = charred wood,
 * danger = blackened iron, gold = brass plate, selected = vellum. All strapped with iron.
 */
const VARIANT: Record<Variant, { frame: string; text: string; icon: number }> = {
  primary: { frame: 'btn_primary', text: '#f6e2b0', icon: 0xf6e2b0 },
  secondary: { frame: 'btn_secondary', text: '#f1e4c4', icon: 0xf1e4c4 },
  ghost: { frame: 'btn_ghost', text: '#cdbb98', icon: 0xcdbb98 },
  danger: { frame: 'btn_danger', text: '#ff8a6a', icon: 0xff8a6a },
  gold: { frame: 'btn_gold', text: '#2a1806', icon: 0x3a2408 },
  selected: { frame: 'btn_selected', text: '#24160c', icon: 0x3a2414 },
};

export interface ButtonOpts {
  w: number;
  h: number;
  variant?: Variant;
  size?: number;
  icon?: string;
  iconSize?: number;
  enabled?: boolean;
  /** return false to swallow the click (drag-scroll lists) */
  guard?: (p: Phaser.Input.Pointer) => boolean;
  sub?: string;
  /** label in the blackletter / Thai display face */
  head?: boolean;
}

/** generated UI glyphs (white) are tinted to the plank's ink; baked art keeps its colours */
const TINTED_ICON = /^ui_(play|back|gear|retry|speed|pause|cancel|export|import|up|check|globe|trash|map|shop)$/;

export class Button extends Phaser.GameObjects.Container {
  readonly bw: number;
  readonly bh: number;
  private bg: Phaser.GameObjects.NineSlice;
  private label: Phaser.GameObjects.Text;
  private subLabel?: Phaser.GameObjects.Text;
  private icon?: Phaser.GameObjects.Image;
  private iconKey = '';
  private variant: Variant;
  private enabled: boolean;
  private pressed = false;
  private hovered = false;
  private readonly guard?: (p: Phaser.Input.Pointer) => boolean;
  private readonly onClick: () => void;
  private readonly fontSize: number;
  private readonly iconSize: number;
  private readonly head: boolean;

  constructor(scene: Phaser.Scene, x: number, y: number, text: string, onClick: () => void, o: ButtonOpts) {
    super(scene, x, y);
    this.bw = o.w;
    this.bh = Math.max(o.h, 44);
    this.variant = o.variant ?? 'primary';
    this.enabled = o.enabled ?? true;
    this.guard = o.guard;
    this.onClick = onClick;
    this.fontSize = o.size ?? 22;
    this.head = o.head ?? false;
    this.iconSize = o.iconSize ?? Math.min(38, this.bh - 18);
    this.bg = nine(scene, VARIANT[this.variant].frame, -this.bw / 2, -this.bh / 2, this.bw, this.bh + 4);
    this.add(this.bg);
    if (o.icon) {
      this.iconKey = o.icon;
      this.icon = addIcon(scene, 0, 0, o.icon, o.icon, this.iconSize, this.iconSize);
      this.add(this.icon);
    }
    this.label = addText(scene, 0, 0, text, this.fontSize, { originX: 0.5, originY: 0.5, color: VARIANT[this.variant].text, font: this.head ? 'head' : 'body' });
    this.add(this.label);
    if (o.sub) {
      this.subLabel = addText(scene, 0, 0, o.sub, Math.round(this.fontSize * 0.6), { originX: 0.5, originY: 0.5, color: VARIANT[this.variant].text, bold: false });
      this.add(this.subLabel);
    }
    this.layoutContent();
    this.redraw();
    this.setSize(this.bw, this.bh);
    this.setInteractive({ useHandCursor: true });
    this.on('pointerover', () => {
      this.hovered = true;
      this.redraw();
    });
    this.on('pointerout', () => {
      this.hovered = false;
      this.pressed = false;
      this.redraw();
    });
    this.on('pointerdown', () => {
      if (!this.enabled) return;
      this.pressed = true;
      this.redraw();
    });
    this.on('pointerup', (p: Phaser.Input.Pointer) => {
      const was = this.pressed;
      this.pressed = false;
      this.redraw();
      if (!was || !this.enabled) return;
      if (this.guard && !this.guard(p)) return;
      this.onClick();
    });
    scene.add.existing(this);
  }

  private layoutContent(): void {
    const pad = 30; // clear of the iron end straps
    const iconW = this.icon ? this.iconSize + 8 : 0;
    const maxLabel = this.bw - pad * 2 - iconW;
    fitText(this.label, maxLabel, 11);
    if (this.subLabel) fitText(this.subLabel, maxLabel, 9);
    const textW = Math.max(this.label.width, this.subLabel?.width ?? 0);
    const total = iconW + (this.label.text ? textW : -8);
    const left = -total / 2;
    if (this.icon) this.icon.setPosition(left + this.iconSize / 2, 0);
    const tx = this.icon ? left + iconW + textW / 2 : 0;
    this.label.setX(tx);
    this.subLabel?.setX(tx);
  }

  private redraw(): void {
    const v = VARIANT[this.variant];
    const dy = this.pressed ? 2 : 0;
    const face = !this.enabled ? 0x7a746e : this.pressed ? 0xb8b0a8 : this.hovered ? 0xffffff : 0xe4ded6;
    this.bg.setTint(face).setY(-this.bh / 2 + dy);
    const ty = (this.subLabel ? -this.bh * 0.15 : -2) + dy;
    this.label.setY(ty).setAlpha(this.enabled ? 1 : 0.5);
    if (this.subLabel) this.subLabel.setY(this.bh * 0.2 + dy).setAlpha(this.enabled ? 0.85 : 0.45);
    if (this.icon) {
      this.icon.setY(dy - 2).setAlpha(this.enabled ? 1 : 0.45);
      if (TINTED_ICON.test(this.iconKey)) this.icon.setTint(v.icon);
    }
  }

  setEnabled(on: boolean): this {
    this.enabled = on;
    this.redraw();
    return this;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  setVariant(v: Variant): this {
    this.variant = v;
    this.bg.setFrame(VARIANT[v].frame);
    this.bg.setSize(this.bw * KIT_RES, (this.bh + 4) * KIT_RES);
    this.label.setColor(VARIANT[v].text);
    this.subLabel?.setColor(VARIANT[v].text);
    this.redraw();
    return this;
  }

  setLabel(text: string, sub?: string): this {
    this.label.setText(text);
    this.label.setFontSize(this.fontSize);
    if (this.subLabel && sub !== undefined) {
      this.subLabel.setText(sub);
      this.subLabel.setFontSize(Math.round(this.fontSize * 0.6));
    }
    this.layoutContent();
    this.redraw();
    return this;
  }
}

/**
 * A vellum page in a leather binding (menus are pages of the castle's war ledger).
 * The legacy fill / alpha / edge args are ignored; `opts` picks an unbound sheet or a tint.
 */
export function panel(scene: Phaser.Scene, x: number, y: number, w: number, h: number, _fill?: number, _alpha?: number, _edge?: number, opts: PageOpts = {}): Phaser.GameObjects.Container {
  return page(scene, x, y, w, h, opts);
}

// ---------------------------------------------------------------------------

/**
 * Vertical drag-scroll viewport (touch drag + mouse wheel). Children go into
 * `content`; buttons inside should pass `guard: area.guard` so a drag never
 * triggers a click and clipped rows can't be pressed.
 */
export class ScrollArea {
  readonly content: Phaser.GameObjects.Container;
  private maskG: Phaser.GameObjects.Graphics;
  private scrollY = 0;
  private contentH = 0;
  private dragging = false;
  private moved = false;
  private startY = 0;
  private startScroll = 0;
  private bar: Phaser.GameObjects.Graphics;
  private vel = 0;
  private lastY = 0;
  private lastT = 0;

  constructor(private readonly scene: Phaser.Scene, readonly rect: Rect) {
    this.content = scene.add.container(rect.x, rect.y);
    this.maskG = scene.make.graphics({}, false);
    this.maskG.fillStyle(0xffffff, 1);
    this.maskG.fillRect(rect.x, rect.y, rect.w, rect.h);
    this.content.setMask(this.maskG.createGeometryMask());
    this.bar = scene.add.graphics();
    const inp = scene.input;
    const down = (p: Phaser.Input.Pointer) => {
      if (!inRect(rect, p.worldX, p.worldY)) return;
      this.dragging = true;
      this.moved = false;
      this.vel = 0;
      this.startY = p.worldY;
      this.lastY = p.worldY;
      this.lastT = p.event?.timeStamp ?? performance.now();
      this.startScroll = this.scrollY;
    };
    const move = (p: Phaser.Input.Pointer) => {
      if (!this.dragging || !p.isDown) return;
      const dy = p.worldY - this.startY;
      if (Math.abs(dy) > 8) this.moved = true;
      if (this.moved) this.setScroll(this.startScroll - dy);
      const now = p.event?.timeStamp ?? performance.now();
      const dt = Math.max(1, now - this.lastT);
      this.vel = ((this.lastY - p.worldY) / dt) * 16;
      this.lastY = p.worldY;
      this.lastT = now;
    };
    const up = () => {
      this.dragging = false;
      // `moved` is read by button pointerup handlers, which run before this scene-level event
      this.scene.time.delayedCall(0, () => (this.moved = false));
    };
    const wheel = (p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
      if (inRect(rect, p.worldX, p.worldY)) this.setScroll(this.scrollY + dy * 0.6);
    };
    inp.on('pointerdown', down);
    inp.on('pointermove', move);
    inp.on('pointerup', up);
    inp.on('wheel', wheel);
    const onUpdate = () => {
      if (!this.dragging && Math.abs(this.vel) > 0.2) {
        this.setScroll(this.scrollY + this.vel);
        this.vel *= 0.9;
      }
    };
    scene.events.on('update', onUpdate);
    scene.events.once('shutdown', () => {
      inp.off('pointerdown', down);
      inp.off('pointermove', move);
      inp.off('pointerup', up);
      inp.off('wheel', wheel);
      scene.events.off('update', onUpdate);
      this.maskG.destroy();
    });
  }

  /** click guard for buttons inside the area */
  readonly guard = (p: Phaser.Input.Pointer): boolean => !this.moved && inRect(this.rect, p.worldX, p.worldY);

  setContentHeight(h: number): void {
    this.contentH = h;
    this.setScroll(this.scrollY);
  }

  getScroll(): number {
    return this.scrollY;
  }

  setScroll(y: number): void {
    const max = Math.max(0, this.contentH - this.rect.h);
    this.scrollY = Math.max(0, Math.min(max, y));
    this.content.y = this.rect.y - this.scrollY;
    this.bar.clear();
    if (max > 0) {
      const h = Math.max(40, (this.rect.h * this.rect.h) / this.contentH);
      const y0 = this.rect.y + ((this.rect.h - h) * this.scrollY) / max;
      this.bar.fillStyle(C.inkN, 0.12);
      this.bar.fillRoundedRect(this.rect.x + this.rect.w + 7, this.rect.y, 4, this.rect.h, 2);
      this.bar.fillStyle(C.rubricN, 0.8);
      this.bar.fillRoundedRect(this.rect.x + this.rect.w + 6, y0, 6, h, 3);
    }
  }

  setDepth(d: number): void {
    this.content.setDepth(d);
    this.bar.setDepth(d);
  }
}


// ---------------------------------------------------------------------------

export interface DialogOpts {
  title: string;
  message: string;
  yes: string;
  no: string;
  danger?: boolean;
  onYes: () => void;
  onNo?: () => void;
  scrollFactor?: number;
}

/** Modal confirm dialog on a ledger page. Returns a close function. */
export function confirmDialog(scene: Phaser.Scene, vw: number, vh: number, o: DialogOpts): () => void {
  const objs: Phaser.GameObjects.GameObject[] = [];
  const depth = 9000;
  const sf = o.scrollFactor ?? 1;
  const dim = scene.add.rectangle(0, 0, vw, vh, 0x070302, 0.74).setOrigin(0, 0).setDepth(depth).setScrollFactor(sf);
  dim.setSize(vw, vh);
  dim.setInteractive(); // swallow clicks
  objs.push(dim);
  const w = Math.min(640, vw - 80);
  const msg = addText(scene, vw / 2, 0, o.message, 22, { originX: 0.5, align: 'center', wrap: w - 100, bold: false, color: C.ink });
  const h = Math.max(270, msg.height + 220);
  const x = (vw - w) / 2;
  const y = (vh - h) / 2;
  objs.push(panel(scene, x, y, w, h).setDepth(depth + 1).setScrollFactor(sf, sf, true));
  const title = addText(scene, vw / 2, y + 34, o.title, 34, { originX: 0.5, color: o.danger ? C.rubric : C.ink, font: 'head' });
  objs.push(title.setDepth(depth + 2).setScrollFactor(sf));
  msg.setY(y + 94).setDepth(depth + 2).setScrollFactor(sf);
  objs.push(msg);
  const close = () => {
    for (const ob of objs) ob.destroy();
  };
  const bw = Math.min(240, (w - 100) / 2);
  const by = y + h - 64;
  const no = new Button(scene, vw / 2 - bw / 2 - 12, by, o.no, () => {
    close();
    o.onNo?.();
  }, { w: bw, h: 64, variant: 'secondary', size: 22 });
  const yes = new Button(scene, vw / 2 + bw / 2 + 12, by, o.yes, () => {
    close();
    o.onYes();
  }, { w: bw, h: 64, variant: o.danger ? 'danger' : 'primary', size: 22 });
  for (const b of [no, yes]) {
    b.setDepth(depth + 3).setScrollFactor(sf, sf, true);
    objs.push(b);
  }
  return close;
}

/** Short message near the bottom of the screen, on an iron plaque. */
export function toast(scene: Phaser.Scene, vw: number, text: string, color: string = C.text, sf = 1): void {
  const t = addText(scene, vw / 2, 640, text, 22, { originX: 0.5, originY: 0.5, color, align: 'center', wrap: vw - 160 });
  const w = t.width + 64;
  const h = t.height + 28;
  const bg = ironPlate(scene, { x: vw / 2 - w / 2, y: 640 - h / 2, w, h });
  bg.setDepth(9500).setScrollFactor(sf);
  t.setDepth(9501).setScrollFactor(sf);
  scene.tweens.add({
    targets: [t, bg],
    alpha: 0,
    delay: 2200,
    duration: 500,
    onComplete: () => {
      t.destroy();
      bg.destroy();
    },
  });
}
