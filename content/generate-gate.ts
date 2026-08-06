/**
 * Shared word gate for content generators — OWNER: A5 (micro-rooms).
 *
 * NOT a runnable script despite the generate-* name (module territory rule);
 * it is imported by generate-rhyme.ts / generate-ladder.ts and by the
 * content-lint test (tests/puzzles/micro-content-lint.test.ts) so CI fails
 * if a gated word ever reappears in shipped JSON.
 *
 * Two lists, two purposes (AAA COZY pillar, 4.12 string-lint spirit,
 * 3.7 editorial bar, wife-test 0.1.6):
 *
 *  - TONE_BLOCKLIST — vulgarity, violence, illness, death, crude bodily
 *    words. A cozy manor never sets "rhymes with DICK" in gilt display type
 *    and never sells TITS as the next stone. Applied to everything the game
 *    PRINTS as its own voice: rhyme prompts, accepted/decoy/near sets,
 *    ladder endpoints and every solution rung, and (for ladder) the probe
 *    lexicon too, so the bought-stone BFS can never route through one.
 *
 *  - NAME_BLOCKLIST — words whose predominant reading is a proper noun
 *    (CORY, BENNY, MAYS, SHAW…). enable1 admits them via obscure
 *    common-noun senses (a "benny", a "shaw"), but as display prompts or
 *    hint-sold rungs they read as names, and the room looks broken.
 *    Deliberately NOT listing name-words whose everyday-noun reading
 *    dominates (ROSE, FRANK, MARK, GRACE, BILL…).
 *
 * The slur list lives separately in content/lib/dictionary.ts (BLOCKLIST)
 * and is already stripped from the base dictionary; this gate layers the
 * cozy/editorial standard on top.
 */

const TONE_WORDS = [
  // vulgarity / crude bodily
  'dick', 'dicks', 'dicky', 'tit', 'tits', 'titty', 'titties', 'boob', 'boobs',
  'arse', 'arses', 'ass', 'asses', 'crap', 'craps', 'crappy', 'shite',
  'piss', 'pissed', 'pisses', 'pee', 'peed', 'pees', 'poop', 'poops', 'pooped',
  'fart', 'farts', 'farted', 'turd', 'turds', 'snot', 'snots', 'snotty',
  'puke', 'puked', 'pukes', 'vomit', 'vomits', 'butts',
  'cock', 'cocks', 'prick', 'pricks', 'wank', 'wanks', 'wanker', 'boner', 'boners',
  'bitch', 'bitchy', 'bitches', 'bastard', 'bastards', 'sod', 'sods',
  'sex', 'sexes', 'sexed', 'sexy', 'nude', 'nudes', 'porn', 'porno', 'smut', 'smutty',
  'rape', 'penis', 'anus', 'semen', 'pubes', 'dildo', 'horny', 'orgy',
  'hell', 'hells', 'damn', 'damns', 'damned', 'hades',
  // violence
  'kill', 'kills', 'killed', 'killer', 'killers', 'killing',
  'slay', 'slays', 'slain', 'slew', 'stab', 'stabs', 'stabbed',
  'murder', 'murders', 'gore', 'gory', 'maim', 'maims', 'maimed',
  'bomb', 'bombs', 'strangle', 'choke', 'chokes', 'choked', 'suicide',
  // illness / death / bleakness
  'dead', 'death', 'deaths', 'die', 'died', 'dies', 'dying',
  'corpse', 'corpses', 'morgue', 'coffin', 'coffins', 'grim', 'cruel',
  'loss', 'losses', 'grief', 'hurt', 'hurts', 'pain', 'pains',
  'ill', 'ills', 'sick', 'sicker', 'sickly', 'ail', 'ails', 'ailed',
  'pill', 'pills', 'drug', 'drugs', 'heroin', 'meth', 'opium',
  'tumor', 'tumors', 'tumour', 'cancer', 'cancers', 'plague', 'plagues',
  'leper', 'lepers', 'wound', 'wounds', 'wounded', 'bleed', 'bleeds', 'bled',
];

const NAME_WORDS = [
  // Given names with only obscure common-noun cover in enable1.
  // (Common-noun-first homographs stay OFF this list: DON, PEG, LENS, ZED,
  //  ROSE, FRANK, MARK, GRACE, BILL, DEAN, FORD, BURR…)
  'cory', 'benny', 'bennies', 'jill', 'jills', 'rex', 'rexes',
  'dirk', 'dirks', 'hank', 'hanks', 'jean', 'gary', 'jerry', 'jerries',
  'barry', 'larry', 'terry', 'perry', 'ted', 'teds', 'ned', 'neds',
  'nell', 'nells', 'sal', 'sals', 'hal', 'cal', 'val', 'vals',
  'billy', 'bobby', 'timmy', 'tommy', 'danny', 'jenny', 'jennies',
  'kay', 'kays', 'fay', 'fays', 'gil', 'gils', 'wes', 'les', 'stu', 'lou',
  'ron', 'rons', 'meg', 'megs', 'ben', 'bens', 'ken', 'kens', 'len', 'jed',
  'ian', 'liam', 'noah', 'ethan', 'mason', 'lucas', 'oliver', 'elijah',
  'ava', 'mia', 'isla', 'ella', 'elsa', 'emma', 'anna', 'annas', 'hannah',
  'sarah', 'sara', 'laura', 'linda', 'karen', 'karens', 'susan', 'nancy',
  'betty', 'ruth', 'ruths', 'edna', 'ethel', 'mabel', 'agnes',
  'kurt', 'kent', 'kents', 'hans', 'fritz', 'boris', 'ivan', 'igor',
  'pedro', 'juan', 'jose', 'luis', 'carl', 'carls', 'karl', 'eric', 'erik',
  'evan', 'evans', 'owen', 'owens', 'seth', 'saul', 'sauls', 'abe', 'abes',
  'ada', 'adas', 'ida', 'idas', 'ira',
  // surnames that surface as 4-letter ladder rungs
  'howe', 'howes', 'shaw', 'shaws', 'mays', 'mads', 'hays', 'hayes',
  'ames', 'amos', 'otis', 'ross', 'penn', 'penns',
];

function clean(list: string[]): Set<string> {
  return new Set(list.filter((w) => /^[a-z']+$/.test(w)));
}

/** Vulgarity / violence / illness / death — lowercase. */
export const TONE_BLOCKLIST: ReadonlySet<string> = clean(TONE_WORDS);

/** Predominantly-a-name words — lowercase. */
export const NAME_BLOCKLIST: ReadonlySet<string> = clean(NAME_WORDS);

/** True when a word passes both tone and proper-noun gates. */
export function gateOk(word: string): boolean {
  const w = word.toLowerCase();
  return !TONE_BLOCKLIST.has(w) && !NAME_BLOCKLIST.has(w);
}

/** True when a word passes the tone gate alone (names allowed). */
export function toneOk(word: string): boolean {
  return !TONE_BLOCKLIST.has(word.toLowerCase());
}
