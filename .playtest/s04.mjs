import { run } from './harness.mjs';

await run(async (page, h) => {
  await h.goto();
  await h.dump('resume');
  await h.shot('04-resume');
});
