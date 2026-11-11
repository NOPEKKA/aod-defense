// Which palette cells (8 columns x 4 rows of the KayKit gradient texture) does each mesh use?
//   node tools/bake/scripts/uvcells.mjs art-src/kaykit/adventurers/Knight.glb
// Output: mesh name -> list of "col,row" cells with vertex counts. Use it to plan recolours.
import fs from 'node:fs';
import path from 'node:path';

const COLS = 8;
const ROWS = 4;

function load(file) {
  const buf = fs.readFileSync(file);
  if (buf.readUInt32LE(0) === 0x46546c67) {
    const jsonLen = buf.readUInt32LE(12);
    const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));
    const binStart = 20 + jsonLen + 8;
    return { json, buffers: [buf.subarray(binStart)] };
  }
  const json = JSON.parse(buf.toString('utf8'));
  const buffers = json.buffers.map((b) => fs.readFileSync(path.join(path.dirname(file), b.uri)));
  return { json, buffers };
}

for (const file of process.argv.slice(2)) {
  const { json, buffers } = load(file);
  console.log(`== ${file}`);
  const meshNode = new Map();
  json.nodes.forEach((n) => {
    if (n.mesh !== undefined) meshNode.set(n.mesh, n.name);
  });
  json.meshes.forEach((mesh, mi) => {
    const cells = new Map();
    for (const prim of mesh.primitives) {
      const accIndex = prim.attributes.TEXCOORD_0;
      if (accIndex === undefined) continue;
      const acc = json.accessors[accIndex];
      const view = json.bufferViews[acc.bufferView];
      const data = buffers[view.buffer];
      const stride = view.byteStride ?? 8;
      const base = (view.byteOffset ?? 0) + (acc.byteOffset ?? 0);
      for (let i = 0; i < acc.count; i++) {
        const u = data.readFloatLE(base + i * stride);
        const v = data.readFloatLE(base + i * stride + 4);
        const c = Math.min(COLS - 1, Math.max(0, Math.floor(u * COLS)));
        const r = Math.min(ROWS - 1, Math.max(0, Math.floor(v * ROWS)));
        const key = `${c},${r}`;
        cells.set(key, (cells.get(key) ?? 0) + 1);
      }
    }
    const list = [...cells.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}(${n})`);
    console.log(`  ${(meshNode.get(mi) ?? mesh.name).padEnd(28)} ${list.join(' ')}`);
  });
}
