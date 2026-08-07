import fs from 'node:fs';
const f = fs.readdirSync('C:/Users/hartw/lexicon-loop-v2/dist/assets').find((x) => x.startsWith('content-'));
const src = fs.readFileSync('C:/Users/hartw/lexicon-loop-v2/dist/assets/' + f, 'utf8');
const pools = [];
let i = 0;
while (true) {
  const k = src.indexOf("JSON.parse('", i);
  if (k < 0) break;
  let j = k + 12, out = '';
  while (j < src.length) {
    const c = src[j];
    if (c === '\\') { out += c + src[j + 1]; j += 2; continue; }
    if (c === "'") break;
    out += c; j++;
  }
  try {
    // eslint-disable-next-line no-eval
    const jsStr = eval("'" + out + "'");
    pools.push(JSON.parse(jsStr));
  } catch (e) { pools.push({ __err: e.message.slice(0, 80) }); }
  i = j + 1;
}
console.log('found', pools.length, 'pools');
pools.forEach((p, n) => {
  const arr = Array.isArray(p) ? p : Object.values(p);
  const first = arr[0];
  console.log(n, Array.isArray(p) ? 'array' : 'obj', arr.length, JSON.stringify(first).slice(0, 120));
});
fs.writeFileSync('C:/Users/hartw/lexicon-loop-v2/.playtest/pools.json', JSON.stringify(pools));
