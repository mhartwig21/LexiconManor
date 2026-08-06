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
  'manic', 'mania', 'manias',              // illness (mania) — not cozy display
  'dike', 'dikes', 'dyke', 'dykes',        // slur-adjacent homograph — never in gilt type
  // second 3.7 read of the regenerated draw (2026-08-06)
  'dong', 'dongs', 'butt', 'suck', 'sucks', 'sucked', 'sucker', 'suckers',
  'gob', 'gobs', 'hag', 'hags',
  'gun', 'guns', 'gunned', 'gunner', 'gunners',
  'scar', 'scars', 'scarred', 'shank', 'shanks', 'shanked',
  'sever', 'severs', 'severed', 'shroud', 'shrouds', 'shrouded',
  // third 3.7 read (2026-08-06)
  'tomb', 'tombs', 'crypt', 'crypts',
  // NOT gated: 'tramp' — the walking verb is cozy (authored "ways to walk"
  // member); the unkind-noun reading doesn't dominate.
  'ich', 'ichs',                            // aquarium disease
  // fourth 3.7 read (2026-08-06)
  'shitty', 'shittier', 'shittiest', 'bullshit',   // base BLOCKLIST only has shit/shits
  'noose', 'nooses', 'grave', 'graves',
  'war', 'wars', 'warred', 'warring',
  'drunk', 'drunks', 'drunken', 'booze', 'boozy', 'bender', 'benders',
  'slum', 'slums', 'grieve', 'grieves', 'grieved', 'grieving',
  'dread', 'dreads', 'dreaded', 'moan', 'moans', 'moaned', 'moaning',
  'hick', 'hicks',                          // derogatory
  // fifth 3.7 read (2026-08-06) — the base BLOCKLIST is slur-focused and
  // omits core profanity families; cover them fully here.
  'fuck', 'fucks', 'fucked', 'fucker', 'fuckers', 'fucking',
  'motherfucker', 'motherfuckers', 'shag', 'shags', 'shagged',
  'bollocks', 'bugger', 'buggers', 'buggered', 'douche', 'douches',
  'jizz', 'cum', 'cums',
  'abuse', 'abuses', 'abused', 'abusive', 'abuser', 'abusers',
  'demise', 'demises', 'cull', 'culls', 'culled', 'culling',
  'coke', 'cokes', 'dope', 'dopes', 'doped', 'molly', 'mollies',
  'stoner', 'stoners', 'git', 'gits',
  // sixth 3.7 read (2026-08-06, round 5) — surfaced by the Conservatory's
  // pangram lane, which reaches rank ~120k and so lands well past the bands
  // the earlier reads sampled. Struck locally in generate-hive.ts first;
  // promoted here so every generator inherits them.
  'diarrhea', 'erotica',
  'urinate', 'urinated', 'urinates', 'urinating',
  'impotent', 'impotence', 'glaucoma', 'migraine', 'migraines',
  'hernia', 'hernias', 'angina', 'edema', 'enema', 'enemas', 'apnea', 'polio',
  'moron', 'morons', 'moronic', 'crotch', 'crotches', 'dung', 'lice',
  'emaciate', 'emaciated', 'decrepit', 'decimate', 'decimated',
  'impale', 'impaler', 'impaled', 'impales',
  'nonlethal', 'deadlift', 'gunpoint', 'militiaman', 'militiamen', 'undead',
  'abort', 'aborted', 'aborts', 'malice', 'lament', 'lamented', 'laments',
  // seventh read (round 6) — the INFLECTION HOLE. The violence block above
  // gates 'murder'/'murders' and 'strangle'/'choke', but not the agent and
  // participle forms, and the Conservatory's pangram lane (rank ~120k) printed
  // MURDERED and MURDERER back to the player as her trophy on the Every Petal
  // screen. Struck locally in generate-hive.ts first; promoted here because
  // every other generator was equally exposed and the shared gate is their
  // honest home. Gate word FAMILIES, never lemmas.
  'murdered', 'murderer', 'murderers', 'murdering', 'murderous',
  'slaughter', 'slaughters', 'slaughtered', 'slaughtering', 'manslaughter',
  'strangled', 'strangler', 'stranglers', 'strangles', 'strangling',
  'choking', 'stabbing', 'stabbings', 'killings',
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
  // caught by the 3.7 editorial read of shipped prompts/rungs (2026-08-06)
  'billie', 'berlin', 'berlins', 'sally', 'sallies', 'harry', 'harries',
  'tory', 'tories', 'bates', 'lex', 'jane', 'janes', 'marc', 'marcs',
  'tony', 'tonies', 'hong', 'sharif', 'sharifs',
  'brazil', 'brazils', 'shawn', 'chitty', 'chitties', 'parr', 'parrs',
  'tom', 'toms', 'marge', 'marges', 'sabine', 'sabines',
  'matt', 'matts', 'carr', 'carrs', 'spence', 'spences', 'lutz', 'lutzes',
  'greek', 'greeks',
];

/**
 * Corpus artifacts: abbreviation-shaped or slangy strings that ride high in
 * web-frequency lists (EXEC, SIM, HIST, PARA, LITE, DIS, RAH) without being
 * words a manor would set in gilt or sell as a stone. Blocked from DISPLAY
 * surfaces via gateOk; toneOk still admits them, so typed probes of real
 * enable1 words stay generously accepted.
 */
const ARTIFACT_WORDS = [
  'dis', 'sim', 'sims', 'exec', 'execs', 'rah', 'rahs',
  'hist', 'para', 'paras', 'lite',
  'hoy', 'hoys', 'pix', 'vig', 'vigs', 'ess', 'esses',
  'nam', 'jun', 'mag', 'mags', 'ids', 'trans',
  'mora', 'moras', 'morae', 'reif', 'reifs', 'trois',
  'til', 'tils', 'sis', 'mach', 'machs', 'gast', 'gasts', 'raff', 'raffs',
  'hast', 'cos', 'coss', 'hons', 'ins', 'sept', 'septs', 'licht',
  'sarge', 'sarges',
];

function clean(list: string[]): Set<string> {
  return new Set(list.filter((w) => /^[a-z']+$/.test(w)));
}

/** Vulgarity / violence / illness / death — lowercase. */
export const TONE_BLOCKLIST: ReadonlySet<string> = clean(TONE_WORDS);

/** Predominantly-a-name words — lowercase. */
export const NAME_BLOCKLIST: ReadonlySet<string> = clean(NAME_WORDS);

/** Abbreviation/slang corpus artifacts — lowercase, display surfaces only. */
export const ARTIFACT_BLOCKLIST: ReadonlySet<string> = clean(ARTIFACT_WORDS);

/** True when a word passes the tone, proper-noun, and artifact gates. */
export function gateOk(word: string): boolean {
  const w = word.toLowerCase();
  return !TONE_BLOCKLIST.has(w) && !NAME_BLOCKLIST.has(w) && !ARTIFACT_BLOCKLIST.has(w);
}

/** True when a word passes the tone gate alone (names allowed). */
export function toneOk(word: string): boolean {
  return !TONE_BLOCKLIST.has(word.toLowerCase());
}
