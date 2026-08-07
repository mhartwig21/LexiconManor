/**
 * ROUND 16 — INDEPENDENT CONTENT-SAFETY AUDIT.
 *
 * Written WITHOUT reading content/lib/safety.ts. The term list below was
 * composed from scratch by the verifier so that a hole in the shipped gate's
 * lexicon cannot also be a hole in the audit of it. Two passes:
 *
 *   WHOLE  — the term is a token of a player-visible string (a board word, a
 *            clue answer, a hive find, a headword, a theme label…).
 *   INSIDE — the term appears as a substring of a longer token. Noisy by
 *            design (COCOON contains COON); every hit is printed so a human
 *            reads it rather than a regex deciding.
 *
 * Surfaces: everything under content/generated + content/authored, plus the
 * player-visible string literals in src/ (room lines, UI copy, fallbacks).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();

/* ------------------------------------------------------------------ */
/* The list. Composed independently; grouped only for the report.      */
/* ------------------------------------------------------------------ */
const TERMS = {
  'slur-race': `nigger nigga niggers coon coons spic spics wetback chink chinks gook gooks jap japs
    kike kikes hebe yid yids paki pakis raghead towelhead wop wops dago dagos mick micks kraut krauts
    jigaboo darkie darky negro negress mulatto quadroon octoroon redskin injun squaw squaws abo
    beaner greaser honky honkey gringo zipperhead pickaninny sambo tarbaby wigger hymie shylock
    shiksa kaffir kafir coolie hottentot mammy golliwog gollywog halfbreed`,
  'slur-sexuality-gender': `faggot faggots fag fags dyke dykes queer queers homo homos tranny trannies
    shemale ladyboy poof poofter nancy catamite sodomite invert inverts fruitcake`,
  'slur-disability': `retard retards retarded tard mongoloid spastic spaz spazz cripple crippled cripples
    gimp gimps midget midgets imbecile imbeciles cretin cretins moron morons idiot idiots idiotic
    lunatic lunatics psycho psychos schizo nutcase nutjob deafmute subnormal feebleminded`,
  'sexual-anatomy': `penis penises phallus vagina vaginal vulva labia clitoris clit cervix cervical
    uterus uterine uteri ovary ovaries ovarian prostate anus anal anally rectum rectal rectums
    scrotum testicle testicles testis testes ballsack nipple nipples areola boob boobs titty titties
    busty buttock buttocks arse arsehole asshole assholes genital genitals genitalia groin loin loins
    perineum perineal foreskin urethra urethral`,
  'sexual-act': `sperm semen ejaculate ejaculation orgasm orgasms orgasmic erection erections erectile
    libido arousal masturbate masturbation wank wanking handjob blowjob fellatio cunnilingus coitus
    copulate copulation fornicate fornication sodomy sodomise sodomize buggery bestial bestiality
    zoophilia orgy orgies threesome dildo dildos vibrator condom condoms contraceptive fetish fetishes
    bdsm sadism sadist masochism masochist bondage dominatrix nympho nymphomaniac aphrodisiac
    brothel bordello whorehouse prostitute prostitutes prostitution hooker hookers harlot harlots
    courtesan whore whores slut sluts hussy strumpet trollop floozy pimp pimps gigolo stripper
    striptease porn porno pornography erotica erotic lewd lascivious lecher lecherous salacious smut
    obscene nudist nudism nude nudes topless lingerie negligee thong`,
  'sexual-violence': `rape raped rapes rapist rapists molest molested molester molestation pedophile
    pedophiles paedophile paedophiles pedophilia paedophilia pederast incest incestuous statutory`,
  profanity: `fuck fucks fucking fucker fuckers shit shits shitting shitty bullshit crap crappy piss
    pissing pissed bastard bastards bitch bitches bitching cunt cunts twat twats prick pricks cock cocks
    dick dicks wanker bollocks bugger buggers goddamn`,
  'self-harm': `suicide suicidal selfharm overdose overdosed anorexia anorexic bulimia bulimic`,
  atrocity: `nazi nazis nazism hitler holocaust genocide genocidal lynch lynched lynching slave slaves
    slavery enslave enslaved klan apartheid pogrom gulag gestapo auschwitz racism racist racists bigot
    bigotry bigoted supremacist segregation terrorist terrorists terrorism jihad internment`,
  violence: `kill kills killed killer killers murder murders murdered murderer murderous homicide
    manslaughter assassin assassins assassinate assassination slaughter massacre stab stabbed stabbing
    shoot shooting shooter gunman gunmen gun guns rifle rifles pistol pistols revolver revolvers
    shotgun carbine bullet bullets ammo ammunition bomb bombs bomber bombers bombed bombing bombard
    bombarded grenade grenades missile missiles torpedo torpedoes shrapnel sniper snipers warhead
    napalm landmine landmines explosive explosives dynamite dagger daggers stiletto machete cleaver
    guillotine gallows noose nooses torture tortured torturer mutilate mutilated mutilation dismember
    decapitate behead beheaded strangle strangled throttle suffocate smother drown drowned poison
    poisoned poisonous arsenic cyanide strychnine abuse abused abuser abusive assault assaulted
    brutal brutality bloodshed carnage gore gory maim maimed hostage hostages kidnap kidnapped
    kidnapping abduct abducted abduction ransom cutthroat thug thugs gangster mobster warlord
    mercenary outgunned`,
  death: `corpse corpses cadaver carcass morgue mortuary hearse hearses coffin coffins casket funeral
    funerals burial exhume graveyard cemetery crypt mausoleum undertaker embalm embalmed autopsy
    widow widowed widower deceased fatality fatalities fatal lethal deadly perish perished necropsy`,
  illness: `cancer cancers carcinoma tumor tumour tumours leukemia leukaemia aids hiv syphilis
    gonorrhea herpes chlamydia plague cholera malaria typhoid tuberculosis leprosy leper lepers ebola
    smallpox anemia anaemia anemic dementia alzheimer epilepsy epileptic seizure coma comatose
    paralysis paralysed paralyzed amputate amputation gangrene sepsis septic abscess ulcer ulcers
    lesion lesions pustule senile senility incontinence incontinent obese obesity alopecia amnesia
    nausea nauseous vomit vomiting diarrhea diarrhoea dysentery asphyxia`,
  bodily: `urine urinate urinating peeing pee feces faeces fecal faecal excrement dung manure poop
    turd snot phlegm mucus pus puke vomit fart farts flatulence`,
  intoxicant: `heroin cocaine meth methamphetamine opium morphine marijuana cannabis hashish narcotic
    narcotics addict addicts addicted addiction junkie overdose drunk drunkard drunken alcoholic
    booze boozer stoned stoner doping dope nicotine cigarette cigarettes rehab detox opiate opiates`,
  derogatory: `stupid stupidity dumb dumber dumbest ugly uglier ugliest loser losers hate hated hatred
    hateful scum scumbag wretch wretched filthy vermin ghetto ghettos redneck rednecks hillbilly hick
    savage savages barbarian heathen heathens infidel infidels papist despise despised contempt
    loathe loathed loathing`,
};

/* Terms whose FAMILY should also be caught as an INSIDE hit. Everything is
 * checked whole-word; these are additionally checked as substrings, because
 * they are the ones an inflection or a compound can hide. */
const INSIDE_STEMS = Object.values(TERMS).join(' ').split(/\s+/).filter(Boolean)
  .filter((t) => t.length >= 4);

const LOOKUP = new Map();
for (const [cat, blob] of Object.entries(TERMS)) {
  for (const t of blob.split(/\s+/).filter(Boolean)) if (!LOOKUP.has(t)) LOOKUP.set(t, cat);
}

/* ------------------------------------------------------------------ */
/* Harvest every player-visible string                                 */
/* ------------------------------------------------------------------ */
/** JSON keys whose values are engine bookkeeping, not English shown to her. */
const NON_COPY_KEYS = new Set([
  'id', 'kind', 'type', 'dir', 'flag', 'character', 'slot', 'trigger', 'mount',
  'expression', 'volumeId', 'roomId', 'givens', 'solution', 'techniques',
  'ciphertext', 'tags', 'tag', 'op', 'key', 'ref', 'next', 'sets', 'requires',
]);

const strings = []; // { file, path, text }
function walkJson(node, file, path) {
  if (typeof node === 'string') { strings.push({ file, path, text: node }); return; }
  if (Array.isArray(node)) { node.forEach((v, i) => walkJson(v, file, `${path}[${i}]`)); return; }
  if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      if (NON_COPY_KEYS.has(k) && typeof v !== 'object') continue;
      walkJson(v, file, path ? `${path}.${k}` : k);
    }
  }
}
function jsonFiles(dir) {
  const out = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...jsonFiles(p));
    else if (e.endsWith('.json')) out.push(p);
  }
  return out;
}
const files = [...jsonFiles(join(ROOT, 'content', 'generated')), ...jsonFiles(join(ROOT, 'content', 'authored'))];
for (const f of files) walkJson(JSON.parse(readFileSync(f, 'utf8')), relative(ROOT, f), '');

/* Player-visible copy in source: quoted string literals in the UI + room
 * lines. Crude on purpose — it over-collects identifiers, which only makes
 * the audit noisier, never blinder. */
function srcFiles(dir) {
  const out = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...srcFiles(p));
    else if (/\.(ts|tsx)$/.test(e)) out.push(p);
  }
  return out;
}
const SRC = srcFiles(join(ROOT, 'src'));
for (const f of SRC) {
  const body = readFileSync(f, 'utf8');
  for (const m of body.matchAll(/(['"`])((?:\\.|(?!\1)[^\\]){4,})\1/g)) {
    strings.push({ file: relative(ROOT, f), path: 'literal', text: m[2] });
  }
}

/* ------------------------------------------------------------------ */
/* Screen                                                              */
/* ------------------------------------------------------------------ */
const tokens = new Map(); // token -> Set of "file :: path"
for (const s of strings) {
  for (const raw of s.text.split(/[^A-Za-z]+/)) {
    if (raw.length < 2) continue;
    const t = raw.toLowerCase();
    if (!tokens.has(t)) tokens.set(t, new Set());
    const where = tokens.get(t);
    if (where.size < 6) where.add(`${s.file} :: ${s.path}`);
  }
}

const whole = [];
const inside = [];
for (const [tok, where] of tokens) {
  if (LOOKUP.has(tok)) { whole.push({ tok, cat: LOOKUP.get(tok), where: [...where] }); continue; }
  for (const stem of INSIDE_STEMS) {
    if (tok.length > stem.length && tok.includes(stem)) {
      inside.push({ tok, stem, cat: LOOKUP.get(stem), where: [...where] });
      break;
    }
  }
}

const isSource = (w) => w.startsWith('src\\') || w.startsWith('src/');
const contentOnly = (h) => h.where.some((w) => !isSource(w));

console.log(`AUDIT — ${files.length} content files + ${SRC.length} source files`);
console.log(`        ${strings.length} strings, ${tokens.size} distinct tokens screened`);
console.log(`        ${LOOKUP.size} terms in the independent list, ${INSIDE_STEMS.length} of them also as substrings\n`);

console.log(`== WHOLE-WORD HITS: ${whole.length} ==`);
for (const h of whole.sort((a, b) => a.cat.localeCompare(b.cat) || a.tok.localeCompare(b.tok))) {
  console.log(`  [${h.cat}] ${h.tok.toUpperCase()}  ${contentOnly(h) ? '<<< SHIPPED CONTENT' : '(source only)'}`);
  for (const w of h.where) console.log(`      ${w}`);
}

console.log(`\n== SUBSTRING HITS: ${inside.length} (each needs a human) ==`);
const byStem = new Map();
for (const h of inside) {
  if (!byStem.has(h.stem)) byStem.set(h.stem, []);
  byStem.get(h.stem).push(h);
}
for (const [stem, hits] of [...byStem].sort()) {
  const words = [...new Set(hits.map((h) => h.tok.toUpperCase()))].sort();
  console.log(`  ${stem} (${LOOKUP.get(stem)}) → ${words.join(', ')}`);
}
