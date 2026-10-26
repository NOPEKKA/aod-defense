/**
 * Touch-friendly menu widgets: Button (Container + Graphics + Text, the only
 * interactive object is the container), segmented choice, drag-scroll area,
 * confirm dialog and toast.
 */
import { inRect } from '../../core/layout';
import type { Rect } from '../../contracts';
import { addArt, fitScale } from '../art/atlas';
import { C, addText, fitText } from '../style';

export type Variant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'gold' | 'selected';

const VARIANT: Record<Variant, { fill: number; text: string }> = {
  primary: { fill: C.primaryN, text: '#fff7e6' },
  secondary: { fill: C.secondaryN, text: '#fff7e6' },
  danger: { fill: C.dangerN, text: '#fff7e6' },
  ghost: { fill: C.ghostN, text: '#e8deef' },
  gold: { fill: 0xc9921f, text: '#fff7e6' },
  selected: { fill: 0x3f9a6a, text: '#ffffff' },
};

function lighten(c: number, k: number): number {
  const r = (c >> 16) & 255;
  const g = (c >> 8) & 255;
  const b = c & 255;
  const f = (v: number) => Math.min(255, Math.round(v + (255 - v) * k));
  return (f(r) << 16) | (f(g) << 8) | f(b);
}
function darken(c: number, k: number): number {
  const r = (c >> 16) & 255;
  const g = (c >> 8) & 255;
  const b = c & 255;
  const f = (v: number) => Math.round(v * (1 - k));
  return (f(r) << 16) | (f(g) << 8) | f(b);
}

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
}

export class Button extends Phaser.GameObjects.Container {
  readonly bw: number;
  readonly bh: number;
  private bg: Phaser.GameObjects.Graphics;
  private label: Phaser.GameObjects.Text;
  private subLabel?: Phaser.GameObjects.Text;
  private icon?: Phaser.GameObjects.Image;
  private variant: Variant;
  private enabled: boolean;
  private pressed = false;
  private hovered = false;
  private readonly guard?: (p: Phaser.Input.Pointer) => boolean;
  private readonly onClick: () => void;
  private readonly fontSize: number;
  private readonly iconSize: number;

  constructor(scene: Phaser.Scene, x: number, y: number, text: string, onClick: () => void, o: ButtonOpts) {
    super(scene, x, y);
    this.bw = o.w;
    this.bh = Math.max(o.h, 44);
    this.variant = o.variant ?? 'primary';
    this.enabled = o.enabled ?? true;
    this.guard = o.guard;
    this.onClick = onClick;
    this.fontSize = o.size ?? 22;
    this.iconSize = o.iconSize ?? Math.min(40, this.bh - 16);
    this.bg = scene.add.graphics();
    this.add(this.bg);
    if (o.icon) {
      this.icon = addArt(scene, 0, 0, o.icon, fitScale(o.icon, this.iconSize, this.iconSize, 2));
      this.add(this.icon);
    }
    this.label = addText(scene, 0, 0, text, this.fontSize, { originX: 0.5, originY: 0.5, color: VARIANT[this.variant].text });
    this.add(this.label);
    if (o.sub) {
      this.subLabel = addText(scene, 0, 0, o.sub, Math.round(this.fontSize * 0.62), { originX: 0.5, originY: 0.5, color: VARIANT[this.variant].text, bold: false });
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
    const pad = 14;
    const iconW = this.icon ? this.iconSize + 8 : 0;
    const maxLabel = this.bw - pad * 2 - iconW;
    fitText(this.label, maxLabel, 11);
    if (this.subLabel) fitText(this.subLabel, maxLabel, 9);
    const textW = Math.max(this.label.width, this.subLabel?.width ?? 0);
    const total = iconW + (this.label.text ? textW : -8);
    const left = -total / 2;
    if (this.icon) this.icon.setPosition(left + this.iconSize / 2, 0);
    const tx = this.icon ? left + iconW + textW / 2 : 0;
    if (this.subLabel) {
      this.label.setPosition(tx, -this.bh * 0.14);
      this.subLabel.setPosition(tx, this.bh * 0.24);
    } else {
      this.label.setPosition(tx, 0);
    }
  }

  private redraw(): void {
    const g = this.bg;
    const w = this.bw;
    const h = this.bh;
    const r = Math.min(16, h / 3);
    const base = this.enabled ? VARIANT[this.variant].fill : C.disabledN;
    const fill = this.pressed ? darken(base, 0.15) : this.hovered && this.enabled ? lighten(base, 0.12) : base;
    const dy = this.pressed ? 3 : 0;
    g.clear();
    if (!this.pressed) {
      g.fillStyle(0x0b0810, 0.55);
      g.fillRoundedRect(-w / 2, -h / 2 + 5, w, h, r);
    }
    g.fillStyle(fill, 1);
    g.fillRoundedRect(-w / 2, -h / 2 + dy, w, h, r);
    g.fillStyle(0xffffff, this.enabled ? 0.14 : 0.05);
    g.fillRoundedRect(-w / 2 + 4, -h / 2 + dy + 3, w - 8, h * 0.4, { tl: r - 3, tr: r - 3, bl: 4, br: 4 });
    g.lineStyle(3, C.inkN, 1);
    g.strokeRoundedRect(-w / 2, -h / 2 + dy, w, h, r);
    this.label.setY((this.subLabel ? -this.bh * 0.14 : 0) + dy);
    this.label.setAlpha(this.enabled ? 1 : 0.55);
    if (this.subLabel) {
      this.subLabel.setY(this.bh * 0.24 + dy);
      this.subLabel.setAlpha(this.enabled ? 0.9 : 0.5);
    }
    if (this.icon) {
      this.icon.setY(dy);
      this.icon.setAlpha(this.enabled ? 1 : 0.5);
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
    this.label.setColor(VARIANT[v].text);
    this.redraw();
    return this;
  }

  setLabel(text: string, sub?: string): this {
    this.label.setText(text);
    this.label.setFontSize(this.fontSize);
    if (this.subLabel && sub !== undefined) {
      this.subLabel.setText(sub);
      this.subLabel.setFontSize(Math.round(this.fontSize * 0.62));
    }
    this.layoutContent();
    this.redraw();
    return this;
  }
}

/** Rounded panel. */
export function panel(scene: Phaser.Scene, x: number, y: number, w: number, h: number, fill: number = C.panelN, alpha = 0.92, edge: number = C.panelEdgeN): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  g.fillStyle(0x0b0810, 0.45);
  g.fillRoundedRect(x, y + 6, w, h, 18);
  g.fillStyle(fill, alpha);
  g.fillRoundedRect(x, y, w, h, 18);
  g.lineStyle(3, C.inkN, 1);
  g.strokeRoundedRect(x, y, w, h, 18);
  g.lineStyle(2, edge, 0.9);
  g.strokeRoundedRect(x + 4, y + 4, w - 8, h - 8, 14);
  return g;
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
      this.bar.fillStyle(0xffffff, 0.35);
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

/** Modal confirm dialog. Returns a close function. */
export function confirmDialog(scene: Phaser.Scene, vw: number, vh: number, o: DialogOpts): () => void {
  const objs: Phaser.GameObjects.GameObject[] = [];
  const depth = 9000;
  const sf = o.scrollFactor ?? 1;
  const dim = scene.add.rectangle(0, 0, vw, vh, 0x07040b, 0.72).setOrigin(0, 0).setDepth(depth).setScrollFactor(sf);
  dim.setSize(vw, vh);
  dim.setInteractive(); // swallow clicks
  objs.push(dim);
  const w = Math.min(640, vw - 80);
  const msg = addText(scene, vw / 2, 0, o.message, 22, { originX: 0.5, align: 'center', wrap: w - 60, bold: false });
  const h = Math.max(260, msg.height + 210);
  const x = (vw - w) / 2;
  const y = (vh - h) / 2;
  objs.push(panel(scene, x, y, w, h).setDepth(depth + 1).setScrollFactor(sf));
  const title = addText(scene, vw / 2, y + 26, o.title, 30, { originX: 0.5, color: o.danger ? '#ff8a7a' : C.gold });
  objs.push(title.setDepth(depth + 2).setScrollFactor(sf));
  msg.setY(y + 82).setDepth(depth + 2).setScrollFactor(sf);
  objs.push(msg);
  const close = () => {
    for (const ob of objs) ob.destroy();
  };
  const bw = Math.min(240, (w - 80) / 2);
  const by = y + h - 56;
  const no = new Button(scene, vw / 2 - bw / 2 - 12, by, o.no, () => {
    close();
    o.onNo?.();
  }, { w: bw, h: 64, variant: 'ghost', size: 22 });
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

/** Short message near the bottom of the screen. */
export function toast(scene: Phaser.Scene, vw: number, text: string, color: string = C.text, sf = 1): void {
  const t = addText(scene, vw / 2, 640, text, 22, { originX: 0.5, originY: 0.5, color, align: 'center', wrap: vw - 160 });
  const bg = scene.add.graphics();
  bg.fillStyle(0x0b0810, 0.85);
  bg.fillRoundedRect(vw / 2 - t.width / 2 - 20, 640 - t.height / 2 - 10, t.width + 40, t.height + 20, 14);
  bg.lineStyle(2, 0x5c4a73, 1);
  bg.strokeRoundedRect(vw / 2 - t.width / 2 - 20, 640 - t.height / 2 - 10, t.width + 40, t.height + 20, 14);
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
