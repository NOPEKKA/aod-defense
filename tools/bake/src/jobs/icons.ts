/** Job: bake one icon group (portraits, spell icons, item icons). */
import { bakeIconGroup, iconGroups } from '../icon';
import { engine, pngFile, registerJob, type OutFile } from '../studio';

registerJob('icons', async (args, log) => {
  const group = args.group as string;
  const t0 = performance.now();
  const bake = await bakeIconGroup(engine, group, { passes: args.passes as number | undefined });
  log(`icons ${group}: ${bake.files.length} files ${((performance.now() - t0) / 1000).toFixed(1)}s`);
  const files: OutFile[] = bake.files.map((f) => ({ path: f.path, base64: f.dataUrl.split(',')[1] }));
  files.push(pngFile(`output/bake/preview/icons_${group}.png`, bake.preview));
  return files;
});

registerJob('icon-groups', async (_args, log) => {
  for (const g of iconGroups()) log(g);
  return [];
});
