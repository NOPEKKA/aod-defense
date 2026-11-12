/** Job: bake procedural effect sheets (fxsheet.ts). args.ids = list of fx ids (default: all). */
import { bakeFx, fxIds, getFx } from '../fxsheet';
import { registerJob, type OutFile } from '../studio';

registerJob('fx', async (args, log) => {
  const ids = (args.ids as string[] | undefined) ?? fxIds();
  const out: OutFile[] = [];
  for (const id of ids) {
    const t0 = performance.now();
    const { files } = bakeFx(getFx(id));
    out.push(...files);
    log(`${id}: ${((performance.now() - t0) / 1000).toFixed(1)}s`);
  }
  return out;
});

registerJob('fx-list', async (_a, log) => {
  for (const id of fxIds()) log(id);
  return [];
});
