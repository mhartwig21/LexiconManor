import { run } from './harness.mjs';
import { attach } from './lib.mjs';

await run(async (page, h0) => {
  const h = attach(page, h0);
  await h.goto();
  await h.clickLabel(/Begin the (first )?day/, 1600);
  await h.dismissDialogue();
  await h.clickAt(269, 596, 1400); // ground floor door, right
  await h.info('draft-modal');
  await h.shot('p2-draft');
});
