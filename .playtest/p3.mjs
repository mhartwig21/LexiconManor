import { run } from './harness.mjs';
import { attach } from './lib.mjs';

await run(async (page, h0) => {
  const h = attach(page, h0);
  await h.goto();
  await h.clickLabel(/Begin the (first )?day/, 1600);
  await h.dismissDialogue();
  await h.clickAt(269, 596, 1400);
  await h.clickLabel(/The Library/, 2200);
  await h.info('after-draft');
  await h.shot('p3-drafted');
  await h.dismissDialogue();
  await h.clickLabel(/Enter this room/, 2000);
  await h.info('library-puzzle');
  await h.shot('p3-library');
});
