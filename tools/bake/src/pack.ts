/** Shelf packer: trimmed frames -> atlas pages + Phaser "multiatlas" JSON. */

export interface PackItem {
  name: string;
  canvas: HTMLCanvasElement;
  /** offset of the trimmed rect inside the source frame */
  trimX: number;
  trimY: number;
  sourceW: number;
  sourceH: number;
}

export interface PackedPage {
  canvas: HTMLCanvasElement;
  frames: Array<{ item: PackItem; x: number; y: number }>;
}

export function pack(items: PackItem[], maxSize = 2048, pad = 2): PackedPage[] {
  const sorted = [...items].sort((a, b) => b.canvas.height - a.canvas.height || b.canvas.width - a.canvas.width);
  const pages: PackedPage[] = [];
  let rest = sorted;
  while (rest.length > 0) {
    const area = rest.reduce((s, it) => s + (it.canvas.width + pad) * (it.canvas.height + pad), 0);
    const widest = rest.reduce((m, it) => Math.max(m, it.canvas.width + pad * 2), 0);
    const width = Math.min(maxSize, Math.max(widest, Math.ceil(Math.sqrt(area * 1.12))));
    const placed: PackedPage['frames'] = [];
    const left: PackItem[] = [];
    let x = pad;
    let y = pad;
    let shelfH = 0;
    let full = false;
    for (const it of rest) {
      const w = it.canvas.width;
      const h = it.canvas.height;
      if (full) {
        left.push(it);
        continue;
      }
      if (x + w + pad > width) {
        x = pad;
        y += shelfH + pad;
        shelfH = 0;
      }
      if (y + h + pad > maxSize) {
        full = true;
        left.push(it);
        continue;
      }
      placed.push({ item: it, x, y });
      x += w + pad;
      shelfH = Math.max(shelfH, h);
    }
    if (placed.length === 0) throw new Error(`frame ${rest[0].name} (${rest[0].canvas.width}x${rest[0].canvas.height}) does not fit in ${maxSize}px`);
    const height = placed.reduce((m, p) => Math.max(m, p.y + p.item.canvas.height + pad), 0);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const g = canvas.getContext('2d')!;
    for (const p of placed) g.drawImage(p.item.canvas, p.x, p.y);
    pages.push({ canvas, frames: placed });
    rest = left;
  }
  return pages;
}

/** Phaser 3 multiatlas (TexturePacker "multi-pack") JSON */
export function multiatlasJson(pages: PackedPage[], imageName: (page: number) => string): unknown {
  return {
    textures: pages.map((p, i) => ({
      image: imageName(i),
      format: 'RGBA8888',
      size: { w: p.canvas.width, h: p.canvas.height },
      scale: 1,
      frames: p.frames.map((f) => ({
        filename: f.item.name,
        rotated: false,
        trimmed: true,
        sourceSize: { w: f.item.sourceW, h: f.item.sourceH },
        spriteSourceSize: { x: f.item.trimX, y: f.item.trimY, w: f.item.canvas.width, h: f.item.canvas.height },
        frame: { x: f.x, y: f.y, w: f.item.canvas.width, h: f.item.canvas.height },
      })),
    })),
    meta: { app: 'aod-defense art bake', version: '1' },
  };
}
