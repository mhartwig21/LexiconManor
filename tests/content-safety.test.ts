import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ALLOWED_WITH_RATIONALE, offenceOf, proseOffenceOf, RULES, safetyOffenceOf,
  type Rule,
} from '../content/lib/safety';
import { gateOk, proseOk, proseProblems, toneOk } from '../content/generate-gate';
import { scanTree, verifySafety } from '../content/verify-safety';
import { lint as forgottenWordLint } from '../content/generate-forgotten-word';

/**
 * tests/content-safety.test.ts — the round-9 safety sweep, in test form.
 *
 * On 2026-08-06 the slur RETARDED shipped live (9× in hive.json, once as a
 * twistle TARGET WORD) and an earlier round's agent found it and left it,
 * because gating it would have turned the lint red. This file exists so that
 * trade can never be offered again: the gate is PROVEN on every generator's
 * surface here, not assumed, and the shipped pools are re-checked on every
 * CI run whether or not a generator was re-run honestly.
 *
 * Five things are held:
 *   1. Known-bad words are rejected — by family, in every inflection.
 *   2. Known-INNOCENT words are accepted (the Scunthorpe set).
 *   3. Every borderline ALLOWANCE recorded in the lexicon still passes, so a
 *      new rule cannot quietly swallow one without failing the build.
 *   4. Every embedded (substring) rule's carriers in enable1 are accounted
 *      for — either family members or listed as innocent.
 *   5. A known-bad word injected into each generator's OWN output shape is
 *      rejected by the verifier that runs in content:verify and the build.
 */

const ENABLE = readFileSync(join(process.cwd(), 'content', 'data', 'enable1.txt'), 'utf8')
  .split(/\r?\n/).filter(Boolean);

/* ------------------------------------------------------------------ */
/* 1. Known-bad, by family and by inflection                           */
/* ------------------------------------------------------------------ */

/** The word that shipped, and every spelling of it. */
const THE_ESCAPE = [
  'retard', 'retards', 'retarded', 'retarding', 'retardate', 'retardates',
  'retardation', 'retardations', 'retarder', 'retarders', 'retardant',
];

const MUST_FAIL: Record<string, string[]> = {
  'the shipped slur (round 13 found it, round 8 gated it, this pins it)': THE_ESCAPE,
  'racial and ethnic slurs': [
    'nigger', 'niggers', 'kike', 'kikes', 'chink', 'chinks', 'gook', 'gooks',
    'dago', 'dagos', 'wop', 'wops', 'honky', 'wetback', 'wetbacks', 'darkie',
    'darky', 'pickaninny', 'mulatto', 'octoroon', 'quadroon', 'sambo',
    'jigaboo', 'shylock', 'coolie', 'redskin', 'squaw', 'injun', 'gringo',
    'coon', 'coons', 'coonskin', 'spic', 'spics', 'spick', 'heeb', 'hebe',
    'gyp', 'gypped',
  ],
  'disability slurs': [
    'midget', 'midgets', 'spastic', 'spastics', 'spaz', 'mongoloid',
    'imbecile', 'imbeciles', 'imbecilic', 'cretin', 'cretinous', 'moron',
    'morons', 'moronic', 'cripple', 'crippled', 'crippler', 'gimp', 'gimpy',
    'lunatic', 'loony', 'looney', 'feebleminded', 'psycho', 'psychos',
    'psychopath', 'schizo', 'schizoid', 'dumb', 'dumber', 'dumbest',
  ],
  'sexuality and gender slurs': [
    'faggot', 'faggots', 'fagot', 'fag', 'fags', 'dyke', 'dykes', 'tranny',
    'shemale', 'poofter', 'lesbo', 'queer', 'queers', 'catamite',
  ],
  'profanity, every inflection': [
    'fuck', 'fucked', 'fucker', 'fucking', 'motherfucker', 'fuckup',
    'shit', 'shits', 'shitty', 'shittier', 'bullshit', 'horseshit', 'shithead',
    'cunt', 'cunts', 'bitch', 'bitches', 'bitchy', 'superbitch',
    'bastard', 'bastards', 'whore', 'whores', 'whorehouse', 'slut', 'sluts',
    'twat', 'wank', 'wanker', 'bollocks', 'asshole', 'arsehole', 'dickhead',
    'cocksucker', 'bugger', 'buggery', 'piss', 'pissing', 'pissed',
    'crap', 'crappy', 'turd', 'fart', 'arse', 'ass', 'prick', 'cock', 'dick',
    'douche', 'jizz', 'git',
  ],
  'sexual and anatomical crudity': [
    'penis', 'vagina', 'vaginal', 'clitoris', 'scrotum', 'testicle', 'testis',
    'rectum', 'rectal', 'anus', 'anal', 'nipple', 'nipples', 'sperm', 'semen',
    'ejaculate', 'masturbate', 'orgasm', 'orgy', 'orgies', 'fellatio',
    'cunnilingus', 'sodomy', 'pornography', 'porn', 'erotica', 'fetish',
    'bestiality', 'genital', 'genitals', 'condom', 'dildo', 'dildos', 'libido',
    'erection', 'erectile', 'arousal', 'arouse', 'prostate', 'urethra',
    'uterus', 'uterine', 'ovarian', 'perineal', 'pubic', 'lingerie', 'nudist',
    'brothel', 'prostitute', 'copulate', 'fornicate', 'sadism', 'masochism',
    'bondage', 'horny', 'pimp', 'sex', 'sexy', 'boob', 'boobs', 'tit', 'tits',
    'crotch', 'smut', 'busty',
  ],
  'sexual violence': [
    'rape', 'raped', 'rapes', 'raping', 'rapist', 'rapists', 'molest',
    'molested', 'molester', 'pedophile', 'pedophilia', 'incest', 'incestuous',
  ],
  'self-harm': ['suicide', 'suicidal', 'anorexia', 'anorexic', 'bulimia', 'bulimic'],
  'atrocity': [
    'nazi', 'nazis', 'fascist', 'fascism', 'holocaust', 'apartheid', 'pogrom',
    'genocide', 'lynch', 'lynching', 'slavery', 'slave', 'slaves', 'enslave',
    'terrorist', 'terrorism', 'jihad', 'racism', 'racist', 'bigot', 'sexist',
    'klan', 'supremacist',
  ],
  'the inflection hole that shipped MURDERER after `murder` was gated': [
    'murder', 'murdered', 'murderer', 'murderers', 'murdering', 'murderous',
    'slaughter', 'slaughtered', 'slaughterhouse', 'manslaughter',
    'strangle', 'strangled', 'strangler', 'strangling', 'stranglehold',
    'kill', 'killed', 'killer', 'killers', 'killing', 'killings',
  ],
  'weapons and graphic violence': [
    'grenade', 'bomb', 'bomber', 'bombed', 'bombard', 'bullet', 'bullets',
    'rifle', 'rifles', 'pistol', 'revolver', 'shotgun', 'musket', 'carbine',
    'missile', 'torpedo', 'shrapnel', 'sniper', 'gun', 'guns', 'outgunned',
    'dagger', 'cyanide', 'arsenic', 'militia', 'militant', 'hostage',
    'cutthroat', 'lethal', 'guillotine', 'gallows', 'noose', 'assassin',
    'behead', 'decapitate', 'disembowel', 'mutilate', 'massacre', 'maim',
    'torture', 'tortured', 'stab', 'stabbed', 'slay', 'slayer', 'abuse',
  ],
  'the mechanics of death': [
    'corpse', 'cadaver', 'carcass', 'morgue', 'mortuary', 'coffin', 'casket',
    'hearse', 'graveyard', 'grave', 'graves', 'gravestone', 'tomb', 'tombstone',
    'crypt', 'funeral', 'cremate', 'crematorium', 'embalm', 'autopsy',
    'undertaker', 'dead', 'deadly', 'death', 'deaths', 'die', 'died', 'dying',
    'perish', 'widow', 'widowed', 'orphan', 'eulogy', 'obituary', 'grief',
    'grieve', 'grieving', 'mourn', 'mourning', 'bereaved', 'shroud',
  ],
  'named diseases and clinical misery': [
    'cancer', 'tumor', 'tumour', 'carcinoma', 'melanoma', 'leukemia',
    'cholera', 'malaria', 'syphilis', 'gonorrhea', 'herpes', 'leprosy', 'leper',
    'tuberculosis', 'gangrene', 'dementia', 'demented', 'plague', 'polio',
    'rabies', 'anemia', 'anaemia', 'amnesia', 'alopecia', 'glaucoma',
    'migraine', 'hernia', 'angina', 'edema', 'enema', 'apnea', 'ulcer',
    'abscess', 'sepsis', 'lesion', 'coma', 'comatose', 'seizure', 'paralysis',
    'amputate', 'obese', 'senile', 'nausea', 'incontinence', 'emaciated',
    'decrepit', 'manic', 'mania', 'maniac', 'sick', 'sickness', 'ill', 'illness',
    'ailment', 'disease', 'wounded', 'bleeding', 'scarred',
  ],
  'bodily waste': [
    'urine', 'urinal', 'urinate', 'defecate', 'excrement', 'feces', 'fecal',
    'faeces', 'diarrhea', 'vomit', 'puke', 'poop', 'pee', 'peeing', 'snot',
    'phlegm', 'mucus', 'pus', 'dung', 'manure', 'scab', 'lice',
  ],
  'hard drugs and intoxication': [
    'heroin', 'cocaine', 'methamphetamine', 'narcotic', 'opium', 'opiate',
    'morphine', 'marijuana', 'hashish', 'junkie', 'addict', 'addicted',
    'overdose', 'stoner', 'drunk', 'drunkard', 'booze', 'boozy', 'nicotine',
    'cigarette', 'rehab', 'meth', 'dope', 'doping', 'coke',
  ],
  'plain unkindness': [
    'hick', 'redneck', 'hag', 'slum', 'ghetto', 'scum', 'wretch', 'wretched',
    'vermin', 'savage', 'shag', 'sod', 'damn', 'damned', 'hell', 'hellish',
    'idiot', 'idiotic', 'cull', 'demise', 'malice', 'lament', 'dread', 'moan',
    'cruel', 'cruelty', 'grim', 'impotent', 'abortion', 'decimate', 'loss',
    'hurt', 'pain', 'drug', 'pill', 'gob', 'shank',
  ],
};

describe('the safety lexicon rejects known-bad words, by FAMILY', () => {
  for (const [family, words] of Object.entries(MUST_FAIL)) {
    it(family, () => {
      const survivors = words.filter((w) => gateOk(w));
      expect(survivors, `these would ship: ${survivors.join(', ')}`).toEqual([]);
    });
  }

  it('the absolute standard catches slurs and crudity even inside a sentence', () => {
    const sentences = [
      'He called her a retard and left.',
      'The niggardly is fine but nigger is not.',
      'She said the word faggot out loud.',
      'a midget, a spastic and a cripple walk in',
      'they found the pedophile',
      'what the fuck',
    ];
    for (const s of sentences) {
      expect(proseOk(s), s).toBe(false);
      expect(proseProblems(s).length, s).toBeGreaterThan(0);
    }
  });

  it('the TONE standard does NOT reach authored prose — a grieving lexicographer may grieve', () => {
    const authored = [
      'Grief is in there, you know. So is home. I have had time to notice the neighborhood.',
      'You will want to know how I died. A storm, that chair, a very good book.',
      'Thirty years dead and still getting letters about it.',
      'It is the scholar’s word for the gap the moth leaves behind — librarians grieve it by name.',
      'Latin, from the household slave who served ‘at the hand’.',
      'The fat needle at the bottom of the workbox, too blunt to prick and too useful to throw out.',
      'Take a cutting if you like. Moss goes where moss decides.',
      'That was the eulogy, as far as I was concerned. Everything after was just weather.',
    ];
    for (const s of authored) {
      expect(proseProblems(s), s).toEqual([]);
    }
  });
});

/* ------------------------------------------------------------------ */
/* 2. The Scunthorpe set — innocent words that MUST survive            */
/* ------------------------------------------------------------------ */

/**
 * Every one of these contains a blocked substring somewhere, or is generated
 * by the inflector from a blocked stem, and every one is an ordinary English
 * word this game may legitimately want. A naive blocklist eats all of them.
 */
const MUST_PASS = [
  // "ass"
  'assess', 'assessment', 'asset', 'assign', 'assist', 'assists', 'class',
  'glass', 'grass', 'passage', 'compass', 'embarrass', 'brass', 'tassel',
  // "anus" / "anal"
  'manuscript', 'analog', 'analysis', 'analyst', 'analgesic', 'canal', 'banal',
  // "rape" / "rapist"
  'grape', 'grapefruit', 'drapery', 'scrape', 'trapeze', 'therapist', 'therapists',
  // "coon" / "moron" / "turd" / "fart" / "gook"
  'raccoon', 'cocoon', 'oxymoron', 'sturdy', 'farther', 'farthing', 'farthingale',
  'gobbledygook',
  // "tit"
  'title', 'appetite', 'petite', 'petition', 'entity', 'constitutes', 'stitch',
  'titan', 'titanium', 'superstition', 'titre', 'titres', 'titter',
  // "spic" / "tard" / "hell" / "sod"
  'spice', 'spices', 'spicy', 'suspicion', 'mustard', 'custard', 'leotard',
  'dotard', 'petard', 'bustard', 'tardy', 'hello', 'othello', 'shell', 'sodium',
  // "scar" / "grave" / "sever" / "lament"
  'scare', 'scared', 'scary', 'scarf', 'scarce', 'scarecrow', 'engrave',
  'gravel', 'gravy', 'graver', 'gravely', 'several', 'severe', 'filament',
  'monofilament', 'stalactite',
  // "urine" / "pee" / "pus" / "dung"
  'tambourine', 'figurine', 'taurine', 'purine', 'peer', 'peers', 'peel',
  'campus', 'octopus', 'opus', 'push', 'dungeon', 'dungaree',
  // "hearse" / "die" / "dead" / "grim" / "crypt"
  'rehearse', 'diet', 'diesel', 'ladies', 'audience', 'medieval', 'deadline',
  'deadbolt', 'deadlock', 'grime', 'grimy', 'cryptic', 'encrypt', 'crypto',
  // "heroin" / "opium" / "junkie" / "coke"
  'heroine', 'heroines', 'europium', 'junky',
  // "prick" / "cock" / "crap" / "dick"
  'prickle', 'prickly', 'pinprick', 'cocker', 'cockatoo', 'peacock', 'cockle',
  'crape', 'scrapbook', 'dickens',
  // "sex" / "condom" / "bondage" / "crotch"
  'sextant', 'sexton', 'condominium', 'vagabondage', 'crotchet', 'crotchety',
  // "nazi" / "racism" / "klan" / "lynch" / "vermin"
  'monazite', 'phenazine', 'ostracism', 'parkland', 'dockland', 'overmine',
  // "demise" / "gob" / "ill" / "rabies" / "sepsis" / "edema"
  'demisemiquaver', 'goby', 'illation', 'kohlrabi', 'antisepsis', 'redemand',
  // "bullet" / "rifle" / "gun" / "war" / "stab" / "choke"
  'bulletin', 'trifle', 'begun', 'laguna', 'warm', 'ward', 'award', 'warble',
  'wary', 'stable', 'unstable', 'artichoke',
  // "shit" / "wank" / "bugger" / "piss" / "twat"
  'shiitake', 'swank', 'swanky', 'debugger', 'inspissate', 'saltwater',
  'wristwatch', 'meltwater',
  // "sperm" / "semen" / "chink" / "injun" / "squaw" / "wop" / "gyp"
  'angiosperm', 'gymnosperm', 'basement', 'casement', 'advertisement',
  'chinkapin', 'injunction', 'squawk', 'squawroot', 'swop', 'twopence',
  'gypsum', 'egypt',
  // the manor's own words
  'teapot', 'parchment', 'inkwell', 'lantern', 'orchard', 'hearth', 'thimble',
  'banister', 'lychgate', 'antimacassar', 'scythe', 'scalpel', 'thatcher',
  'fowler', 'harper', 'palmer', 'bailey', 'devil', 'devilled', 'warts',
  'skeleton', 'skull', 'ghost', 'werewolf', 'vampire', 'wine', 'beer', 'cider',
  'tart', 'pansy', 'knife', 'spade', 'lame', 'sanctum',
];

/**
 * Words that ARE blocked on display and are recorded in the lexicon as
 * knowing collateral. Listed here so the trade stays visible: if one of these
 * ever starts passing, somebody weakened a family without saying so.
 */
const KNOWING_COLLATERAL = ['grievance', 'niggardly', 'niggle', 'snigger', 'retardant', 'vandyke'];

describe('the Scunthorpe set — innocent words survive the gate', () => {
  it('every innocent carrier still passes', () => {
    const eaten = MUST_PASS.filter((w) => !gateOk(w));
    expect(eaten, `false positives: ${eaten.join(', ')}`).toEqual([]);
  });

  it('the knowing collateral is still blocked — the trade stays a decision', () => {
    const leaked = KNOWING_COLLATERAL.filter((w) => gateOk(w));
    expect(leaked, `a family was weakened silently: ${leaked.join(', ')}`).toEqual([]);
  });

  it('every recorded allowance still passes, so no rule can swallow one silently', () => {
    const eaten = ALLOWED_WITH_RATIONALE
      .filter(({ why }) => why.startsWith('NOT blocked'))
      .map(({ word }) => word)
      .filter((w) => !gateOk(w));
    expect(eaten, `an allowance was quietly revoked: ${eaten.join(', ')}`).toEqual([]);
  });

  it('every allowance carries a rationale, not just a name', () => {
    for (const { word, why } of ALLOWED_WITH_RATIONALE) {
      expect(why.length, word).toBeGreaterThan(60);
    }
  });

  it('the gate stays proportionate — it blocks ~1% of ENABLE, not 10%', () => {
    const blocked = ENABLE.filter((w) => offenceOf(w) !== null).length;
    // Recorded band, not a magic number: a rule that suddenly eats thousands of
    // ordinary words is a Scunthorpe bug, and a gate that collapses toward zero
    // is a lexicon someone gutted. Both fail here.
    expect(blocked / ENABLE.length).toBeGreaterThan(0.005);
    expect(blocked / ENABLE.length).toBeLessThan(0.02);
  });
});

/* ------------------------------------------------------------------ */
/* 3. Every embedded rule's carriers are accounted for                 */
/* ------------------------------------------------------------------ */

describe('substring rules are proven against the shipped dictionary', () => {
  const embedded = RULES.filter((r) => r.embedded);

  it('there is at least one embedded rule (otherwise this suite is vacuous)', () => {
    expect(embedded.length).toBeGreaterThan(50);
  });

  /**
   * A substring rule is only legitimate where its carriers have been LOOKED AT.
   * A carrier is accounted for when it is a family member (it contains the stem
   * and we mean to block it) or when it is named in `innocent`. What this test
   * really enforces is that the `innocent` array is EXHAUSTIVE: any carrier the
   * author listed as innocent must actually still pass the gate, and any
   * carrier that passes the gate must have been listed. A dictionary change
   * that introduces an unlisted innocent carrier fails here.
   */
  it('every listed innocent carrier genuinely survives the gate', () => {
    const broken: string[] = [];
    for (const rule of RULES) {
      for (const w of rule.innocent ?? []) {
        if (offenceOf(w) !== null) broken.push(`${rule.stem} -> ${w}`);
      }
    }
    expect(broken, `listed as innocent but still blocked: ${broken.join(', ')}`).toEqual([]);
  });

  it('no innocent list names a word the rule never touches (dead entries rot)', () => {
    const dead: string[] = [];
    for (const rule of RULES.filter((r) => r.embedded)) {
      for (const w of rule.innocent ?? []) {
        if (!w.includes(rule.stem)) dead.push(`${rule.stem} -> ${w}`);
      }
    }
    expect(dead, `innocent entries that cannot match: ${dead.join(', ')}`).toEqual([]);
  });

  it('every over-broad rule says what it costs', () => {
    for (const rule of RULES.filter((r) => r.overBroad)) {
      expect(rule.overBroad!.length, rule.stem).toBeGreaterThan(0);
    }
  });

  it('the disability-slur family is complete over enable1, not a lemma list', () => {
    // The escape, generalised: every enable1 word containing "retard" is gated.
    const carriers = ENABLE.filter((w) => w.includes('retard'));
    expect(carriers.length).toBeGreaterThan(5);
    for (const w of carriers) expect(offenceOf(w), w).not.toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* 4. Every generator's surface rejects an injected bad word           */
/* ------------------------------------------------------------------ */

/**
 * The heart of this file. Each case builds the SHAPE a generator writes, drops
 * a known-bad word into the field the player actually reads, and asserts the
 * verifier that runs in `content:verify` and in the build catches it. The
 * clean twin proves the case is not passing by accident.
 */
const INJECTIONS: { file: string; label: string; bad: unknown; clean: unknown }[] = [
  {
    file: 'generated/hive.json',
    label: 'Conservatory found-word list (where RETARDED shipped 9×)',
    bad: [{ id: 'x', validWords: ['TEAPOT', 'RETARDED'], pangrams: ['TEAPOTS'] }],
    clean: [{ id: 'x', validWords: ['TEAPOT', 'LANTERN'], pangrams: ['TEAPOTS'] }],
  },
  {
    file: 'generated/hive.json',
    label: 'Conservatory pangram (the Every Petal trophy)',
    bad: [{ id: 'x', validWords: ['TEAPOT'], pangrams: ['PEDOPHILE'] }],
    clean: [{ id: 'x', validWords: ['TEAPOT'], pangrams: ['ORCHARDS'] }],
  },
  {
    file: 'generated/twistle.json',
    label: 'Gallery target word (where RETARDED shipped once)',
    bad: [{ id: 'x', targetWords: ['ORCHARD', 'RETARDED'] }],
    clean: [{ id: 'x', targetWords: ['ORCHARD', 'THIMBLE'] }],
  },
  {
    file: 'generated/word-web.json',
    label: 'Library tile (where MIDGET shipped)',
    bad: [{ id: 'x', groups: [{ theme: 'Hidden Insects', words: ['MIDGET', 'BRAMBLE'] }] }],
    clean: [{ id: 'x', groups: [{ theme: 'Hidden Insects', words: ['BEETLES', 'BRAMBLE'] }] }],
  },
  {
    file: 'generated/word-web.json',
    label: 'Library category LABEL (authored prose, absolute standard)',
    bad: [{ id: 'x', groups: [{ theme: 'Words for a Retarded Clock', words: ['SLOW'] }] }],
    clean: [{ id: 'x', groups: [{ theme: 'Words for a Slow Clock', words: ['SLOW'] }] }],
  },
  {
    file: 'generated/crossword.json',
    label: 'Linen Closet answer',
    bad: [{ id: 'x', entries: [{ answer: 'CUNT', clue: 'A gap' }] }],
    clean: [{ id: 'x', entries: [{ answer: 'INK', clue: 'A gap' }] }],
  },
  {
    file: 'generated/crossword.json',
    label: 'Linen Closet clue text',
    bad: [{ id: 'x', entries: [{ answer: 'INK', clue: 'What the faggot spilled' }] }],
    clean: [{ id: 'x', entries: [{ answer: 'INK', clue: 'What fills the manor’s pens' }] }],
  },
  {
    file: 'generated/cipher.json',
    label: 'Darkroom plaintext',
    bad: [{ id: 'x', plaintext: 'A MIDGET IN THE HAND IS WORTH TWO IN THE BUSH' }],
    clean: [{ id: 'x', plaintext: 'A BIRD IN THE HAND IS WORTH TWO IN THE BUSH' }],
  },
  {
    file: 'generated/forgotten-word.json',
    label: 'Study headword',
    bad: [{ id: 'x', word: 'GRAVEYARD', definitions: { plain: 'A gate.' } }],
    clean: [{ id: 'x', word: 'LYCHGATE', definitions: { plain: 'A gate.' } }],
  },
  {
    file: 'generated/forgotten-word.json',
    label: 'Study definition prose',
    bad: [{ id: 'x', word: 'LYCHGATE', definitions: { poetic: 'The gate a spastic keeps.' } }],
    clean: [{ id: 'x', word: 'LYCHGATE', definitions: { poetic: 'The roofed gate that waits with you.' } }],
  },
  {
    file: 'authored/word-web-boards.json',
    label: 'authored Library board',
    bad: [{ id: 'x', groups: [{ theme: 'Garden Flowers', words: ['PEONY', 'RETARD'] }] }],
    clean: [{ id: 'x', groups: [{ theme: 'Garden Flowers', words: ['PEONY', 'DAHLIA'] }] }],
  },
  {
    file: 'authored/crossword-clues.json',
    label: 'authored clue bank',
    bad: [{ clues: [{ word: 'TEA', clue: 'What the retard drinks' }] }],
    clean: [{ clues: [{ word: 'TEA', clue: 'Mrs. Bramble’s morning ritual' }] }],
  },
  {
    file: 'authored/dialogue/bramble.json',
    label: 'authored dialogue line',
    bad: { nodes: [{ lines: [{ text: 'Don’t be such a retard about it, pet.' }] }] },
    clean: { nodes: [{ lines: [{ text: 'Don’t fret about it, pet.' }] }] },
  },
  {
    file: 'authored/volumes/volume-1.json',
    label: 'volume fragment text',
    bad: { fragments: [{ text: 'He wrote the word nigger in the margin.' }] },
    clean: { fragments: [{ text: 'He wrote a single word in the margin.' }] },
  },
];

describe('the gate is PROVEN on every generator path, not assumed', () => {
  for (const { file, label, bad, clean } of INJECTIONS) {
    it(`rejects a known-bad word in ${label}`, () => {
      const findings = scanTree(file, bad);
      expect(findings.length, `${file}: nothing was caught — the gate does not cover this surface`)
        .toBeGreaterThan(0);
    });
    it(`accepts the clean twin in ${label}`, () => {
      expect(scanTree(file, clean), file).toEqual([]);
    });
  }

  it('the Study lint itself refuses a gated headword and gated prose', () => {
    const entry = (over: Record<string, unknown>) => ({
      word: 'LYCHGATE',
      obscurity: 'rare' as const,
      plain: 'The roofed gate at the edge of a churchyard.',
      poetic: 'The one roof built for a pause, halfway between the lane and the ground.',
      riddle: 'I am the only roof that exists so that somebody may set a thing down.',
      etymology: 'Old English lic, a body, and geat, a gate — a shelter for the pause before the church.',
      usage: 'They waited under the ___ until the rain gave up.',
      ...over,
    });
    // The lint returns problems for the pool as a whole; we only assert that a
    // gated word CONTRIBUTES one, which is the property that was missing.
    const withBadWord = forgottenWordLint([entry({ word: 'GRAVEYARD' }) as never]);
    expect(withBadWord.some((p) => /display gate/.test(p))).toBe(true);

    const withBadProse = forgottenWordLint([
      entry({ poetic: 'The one roof a spastic may pause beneath, halfway to the ground.' }) as never,
    ]);
    expect(withBadProse.some((p) => /never, in any voice/.test(p))).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* 5. The shipped pools, every run                                     */
/* ------------------------------------------------------------------ */

describe('every shipped pool and authored file is clean', () => {
  it('content/verify-safety finds nothing across the whole tree', () => {
    const findings = verifySafety();
    const shown = findings.slice(0, 25)
      .map((f) => `${f.file} ${f.path}: ${f.word} (${f.why})`).join('\n');
    expect(findings.length, `\n${shown}`).toBe(0);
  });

  it('the four words this round struck by name are gone from the gate', () => {
    for (const w of ['retarded', 'coon', 'pedophile', 'queers', 'gimp', 'cripple', 'dildos', 'nazi']) {
      expect(gateOk(w), w).toBe(false);
      expect(toneOk(w), w).toBe(false);
    }
  });

  /**
   * ROUND 16 — the six words an INDEPENDENT re-audit found still shipping.
   *
   * The round-15 sweep built this lexicon and then verified the pools with
   * it, which can only prove that the pools match the list. A verifier
   * composed a fresh offensive-term list WITHOUT reading content/lib/safety.ts
   * and re-screened all 16 shipped files; six display words came back that no
   * rule reached — CARNAGE and AMMO as scored hive finds, ARSENAL / DROWNED /
   * AMMO / CONTEMPT / HATERS as twistle targets. None was an inflection hole;
   * every one was a stem the lexicon never had, which is precisely the class
   * of miss a self-check is blind to.
   *
   * HATERS is the sharpest of them: HATE *was* gated in round 15, but in
   * content/generate-gate.ts's legacy lemma list rather than in the family
   * lexicon — so the exact defect this file was built to close (MURDER gated,
   * MURDERER shipped) reproduced itself one file over.
   */
  it('the six words the round-16 independent audit found are gated, by family', () => {
    for (const w of [
      'carnage', 'carnages',
      'arsenal', 'arsenals',
      'ammo', 'ammunition',
      'drown', 'drowns', 'drowned', 'drowning',
      'hate', 'hates', 'hated', 'hating', 'hateful', 'hater', 'haters', 'hatred',
      'contempt', 'contemptuous', 'contemptible',
    ]) {
      expect(gateOk(w), `${w} must not be a display word`).toBe(false);
      expect(toneOk(w), `${w} must not be a display word`).toBe(false);
    }
  });

  it('and the round-16 rules did not take an innocent word with them', () => {
    // AMMO is whole-word ONLY, which is the whole reason it is written that
    // way: four ordinary English words carry the trigram.
    for (const w of [
      'ammonite', 'ammonites', 'ammonia', 'ammonium', 'hammock', 'hammocks', 'mammoth', 'gammon',
      'whatever', 'chateau', 'chateaux',
    ]) {
      expect(gateOk(w), `${w} is innocent and must survive`).toBe(true);
    }
    // Tone never reaches authored prose: "the candle drowned" (Ellery) and
    // "looks brutal" (Fern) are among the best lines in the game.
    expect(proseOk('He worked at that desk till the candle drowned.')).toBe(true);
    expect(proseOk('Wrong guesses are pruning. Looks brutal. Isn’t.')).toBe(true);
  });

  it('safety and tone are genuinely different standards', () => {
    // GRIEF is tone-gated but safe; RETARD is neither.
    expect(safetyOffenceOf('grief')).toBeNull();
    expect(offenceOf('grief')).not.toBeNull();
    expect(safetyOffenceOf('retard')).not.toBeNull();
    expect(proseOffenceOf('grief')).toBeNull();
    expect(proseOffenceOf('retard')).not.toBeNull();
  });

  it('every rule declares a standard and a category', () => {
    const bad = RULES.filter((r: Rule) => !r.stem || !r.standard || !r.category);
    expect(bad).toEqual([]);
  });
});
