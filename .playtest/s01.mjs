import { run } from './harness.mjs';

await run(async (page, h) => {
  await h.goto();
  await h.shot('01-boot');
  await h.dump('boot');
});
