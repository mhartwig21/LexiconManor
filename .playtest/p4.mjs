import { run } from './harness.mjs';
import { attach } from './lib.mjs';

await run(async (page, h0) => {
  const h = attach(page, h0);
  await h.goto();
  await h.clickLabel(/Begin the (first )?day/, 1600);
  await h.dismissDialogue();
  await h.clickAt(269, 596, 1400);
  await h.clickLabel(/The Library/, 2400);
  await h.dismissDialogue();

  const pick = async (words) => {
    for (const w of words) {
      const ok = await h.clickLabel(new RegExp('^' + w + '$'), 350);
      if (!ok) console.log('MISSING TILE', w);
    }
    await h.clickLabel(/^Weave$/, 2200);
  };

  // deliberate near-miss: the -ATER trap
  await pick(['GRATER', 'WAITER', 'EQUATOR', 'CRATER']);
  await h.info('after-mistake');
  await h.shot('p4-mistake');

  // deliberate second wrong: totally off
  await h.clickLabel(/^Clear$/, 400);
  await pick(['CUP', 'BAG', 'HAND', 'ARMS']);
  await h.info('after-mistake2');
  await h.shot('p4-mistake2');
});
