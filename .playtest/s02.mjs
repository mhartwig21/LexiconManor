import { run } from './harness.mjs';

await run(async (page, h) => {
  await h.goto();
  await h.clickText('Chronicles', 900);
  await h.shot('02-chronicles');
  await h.dump('chronicles');
});
