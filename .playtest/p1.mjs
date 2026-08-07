import { run } from './harness.mjs';
import { attach } from './lib.mjs';

await run(async (page, h0) => {
  const h = attach(page, h0);
  await h.goto();
  await h.clickLabel(/Begin the (first )?day/, 1600);
  await h.dismissDialogue();
  await h.info('map');
  await h.shot('p1-map');
  // open a draft
  const doors = await h.find(/draft|door|Open|through/i);
  console.log('DOOR HITS:', JSON.stringify(doors, null, 1));
});
