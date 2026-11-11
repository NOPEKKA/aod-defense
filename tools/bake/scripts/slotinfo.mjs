// Print hand-slot facts for a rig: local bounding boxes of the built-in hand items and the
// direction of each slot axis (in model space: +Z forward, +Y up, +X the character's left) for some poses.
//   node tools/bake/run.mjs --script tools/bake/scripts/slotinfo.mjs /kaykit/adventurers/Rogue.glb Idle:0 1H_Ranged_Shoot:0.4
export default async ({ page, args }) => {
  const url = args[0] ?? '/kaykit/adventurers/Knight.glb';
  const poses = (args.length > 1 ? args.slice(1) : ['Idle:0']).map((s) => {
    const [clip, t] = s.split(':');
    return { clip, t: Number(t ?? 0) };
  });
  const out = await page.evaluate(
    async ([url, poses]) => {
      const { THREE, assets } = window.__bake.lib;
      const { instantiate, pose, byName } = assets;
      const inst = await instantiate(url);
      const lines = [];
      const f = (v) => v.toArray().map((n) => n.toFixed(2)).join(', ');
      for (const slot of ['handslot.l', 'handslot.r']) {
        const s = byName(inst.root, slot);
        lines.push(`${slot}: children ${s.children.map((c) => c.name).join(', ') || '(none)'}`);
        for (const c of s.children) {
          if (!c.isMesh) continue;
          c.geometry.computeBoundingBox();
          const b = c.geometry.boundingBox;
          lines.push(`   ${c.name}: local min(${f(b.min)}) max(${f(b.max)})  pos(${f(c.position)}) rotDeg(${[c.rotation.x, c.rotation.y, c.rotation.z].map((r) => ((r * 180) / Math.PI).toFixed(0)).join(', ')})`);
        }
      }
      for (const p of poses) {
        pose(inst, p.clip, p.t);
        lines.push(`pose ${p.clip} @${p.t}s`);
        for (const slot of ['handslot.l', 'handslot.r', 'head', 'chest']) {
          const s = byName(inst.root, slot);
          const m = new THREE.Matrix4().extractRotation(s.matrixWorld);
          const pos = new THREE.Vector3().setFromMatrixPosition(s.matrixWorld);
          const ax = ['X', 'Y', 'Z'].map((n, i) => `${n}->(${f(new THREE.Vector3(i === 0 ? 1 : 0, i === 1 ? 1 : 0, i === 2 ? 1 : 0).applyMatrix4(m))})`);
          lines.push(`   ${slot.padEnd(11)} at (${f(pos)})  ${ax.join('  ')}`);
        }
      }
      return lines;
    },
    [url, poses],
  );
  console.log(out.join('\n'));
};
