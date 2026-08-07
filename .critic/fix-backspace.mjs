import { readFileSync, writeFileSync } from 'node:fs';
const p = process.argv[2];
let s = readFileSync(p, 'utf8');
const bs = String.fromCharCode(8);
const n = s.split(bs).length - 1;
s = s.split(bs).join('\\b');
writeFileSync(p, s);
console.log('replaced', n, 'backspace char(s) with \\b in', p);
