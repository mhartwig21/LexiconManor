/**
 * Shared word gate for content generators — OWNER: A5 (micro-rooms).
 *
 * NOT a runnable script despite the generate-* name (module territory rule);
 * it is imported by every generator and by the content-lint tests
 * (tests/puzzles/micro-content-lint.test.ts, tests/content-safety.test.ts) so
 * CI fails if a gated word ever reappears in shipped JSON.
 *
 * ==========================================================================
 * ROUND 9 (safety sweep): THE BLOCKLIST IS NOW A LEXICON, NOT A LIST.
 * ==========================================================================
 * The categorised, family-based, Scunthorpe-proofed rules live in
 * `content/lib/safety.ts` and are the authority. That file explains the
 * standard, the word-in-isolation/word-in-a-sentence split, and every
 * borderline call. Read it before adding anything here.
 *
 * What survives in THIS file is the residue the lexicon deliberately does not
 * model: the manor's PROPER-NOUN gate and its CORPUS-ARTIFACT gate, plus the
 * historical TONE_WORDS list, which is now a redundant belt beside the
 * lexicon's braces — kept because eight rounds of shipped-content review are
 * encoded in it and because `tests/puzzles/micro-content-lint.test.ts` pins
 * its regression anchors.
 *
 * Three exported predicates, three surfaces:
 *   `gateOk(word)`  — DISPLAY words (hive validWords, twistle targets,
 *                     crossword answers, headwords): safety + tone + names
 *                     + artifacts. The strictest.
 *   `toneOk(word)`  — DISPLAY words where a proper noun is legitimate
 *                     (word-web tiles carry authored trivia groups):
 *                     safety + tone.
 *   `proseOk(text)` — authored SENTENCES (dialogue, definitions, clues,
 *                     volume fragments): the absolute safety standard only.
 *                     GRIEF belongs in a mystery about a grieving
 *                     lexicographer; a slur never belongs anywhere.
 *
 * Historical note, kept because it is the reason this file was rebuilt: on
 * 2026-08-06 the slur RETARDED shipped live — nine times in hive.json and once
 * as a twistle TARGET WORD. An earlier round's agent found it and left it,
 * reasoning that gating it would red the lint without a regeneration it could
 * not run. A red build is the correct outcome. The gate now fails loudly and
 * `npm run content:verify` runs it over every generated pool AND every
 * authored file, so the trade that agent thought it faced cannot recur.
 *
 * Two legacy lists, two purposes (AAA COZY pillar, 4.12 string-lint spirit,
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
  // Eighth read (round 12) — the SLUR HOLE. This list already blocks 'hick'
  // as merely derogatory, and 'dyke'/'dike' as slur-adjacent, but carried no
  // entry for the words that name a disability as an insult. MIDGET shipped as
  // a Library tile (it was a member of the Hidden Insects pool, carrying
  // MIDGE) and was set in Fell caps on web-44 for months: a widely-recognised
  // slur for people with dwarfism, on a display surface, in a game built for
  // the owner's wife. The base BLOCKLIST in content/lib/dictionary.ts is
  // racial-slur focused and does not reach this family. Gate the family.
  // Kept deliberately tight to the family that has no cozy reading at all, so
  // this addition cannot quietly invalidate another room's shipped pool.
  // Kept deliberately tight to the family that has no cozy reading at all.
  //
  // ROUND 8 (verifier): the RETARD family is now gated too. Round 13's content
  // agent named it and deliberately left it — it was live in hive.json (9) and
  // twistle.json (1), and gating it there would have redded the Conservatory's
  // and Gallery's lint without a regeneration that agent could not run. The
  // verifier can run it, so the honest end of that trade is taken here: the
  // family is gated AND both pools regenerated in the same change. A slur a
  // player can spell on a cozy word board is a COZY/3.7 failure whichever
  // agent's territory the JSON happens to sit in.
  'midget', 'midgets', 'midgety',
  'spastic', 'spastics', 'imbecile', 'imbeciles', 'mongoloid', 'mongoloids',
  'retard', 'retards', 'retarded', 'retarding', 'retardate', 'retardates',
  // ------------------------------------------------------------------------
  // ROUND 14 — THE EMOTIONAL-HARSHNESS HOLE (COZY pillar).
  //
  // The gate was not lax here, it was INCONSISTENT. It already blocks 'loss',
  // 'moan', 'dread', 'grim', 'cruel', 'lament' and 'hurt' as tone offences —
  // and had no rule at all for lose/loser, hate/hatred, rage, anger, doom,
  // terror, panic, revenge, torment or spite, none of which appear in
  // ALLOWED_WITH_RATIONALE either. They were oversights, not judgments, and
  // they shipped as findable, scored, REVEALED answers: twistle.json's
  // authored target sets carried LOSER ×9, RAGE ×12, ANGER ×8, HATE ×7,
  // HATES ×5, LOSE ×11, CURSE ×6, PANIC ×4, FATAL ×3, TERROR ×2, HATRED ×2,
  // SPITE ×2, SORROW; hive.json's validWords added DOOM/DOOMED ×15,
  // TERROR ×13, RAGE ×14, REVENGE ×3, TORMENT. src/engine/twistle.ts:153
  // prints the unfound targets back on exit, so the Gallery could tell her at
  // the end of a cozy afternoon that the word she missed was LOSER.
  //
  // Families, not lemmas (the round-6 rule). Whole words, so CLOSE, CLOSER,
  // DANGER, HANGER, COURAGE, STORAGE, GARAGE, DESPITE and DOOMSDAY-free
  // compounds are all untouched.
  //
  // DELIBERATELY NOT GATED, and both are on the record in
  // `content/lib/safety.ts`'s ALLOWED_WITH_RATIONALE: DEVIL (deviled eggs; the
  // folkloric devil is furniture in a haunted manor) and KNIFE (cutlery beside
  // SPOON and LADLE). CURSE is the same call and owes the same entry — see
  // the round-14 note in the fix report.
  'lose', 'loses', 'losing', 'loser', 'losers',
  'hate', 'hates', 'hated', 'hating', 'hateful', 'hatred',
  'rage', 'rages', 'raged', 'raging',
  'anger', 'angers', 'angered', 'angering', 'angry', 'angrily',
  'doom', 'dooms', 'doomed', 'dooming',
  'terror', 'terrors', 'terrorize', 'terrorized', 'terrify', 'terrified',
  'panic', 'panics', 'panicked', 'panicking', 'panicky',
  'revenge', 'revenges', 'revenged', 'vengeance', 'vengeful',
  'torment', 'torments', 'tormented', 'tormenting', 'tormentor',
  'spite', 'spites', 'spited', 'spiteful',
  'fatal', 'fatally', 'fatality', 'fatalities',
  'sorrow', 'sorrows', 'sorrowful',
  // VILE/VILEST were on the finding's evidence list (hive ×2) though not on its
  // fix list. Gated anyway: it is the same family as CRUEL, which this list
  // already blocks, and it has no cozy reading. Whole word — EVIL, VILLAGE and
  // VIOLET are untouched.
  'vile', 'viler', 'vilest', 'vilely', 'vileness',
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
  // ROUND 9 (safety sweep). Surnames and given names of REAL LIVING OR RECENT
  // PEOPLE that enable1 admits and that the generated pools were drawing.
  // Word-web's authored trivia groups are allowed proper nouns by design
  // (AAA 2.9 permits one trivia category per board), which is why this list is
  // consulted by `gateOk` and not by `toneOk`: the Conservatory and the
  // Gallery must never hand the player a stranger's surname to spell.
  // Celebrity surnames — a specific living-or-recent PERSON, not a word.
  'aniston', 'beckham', 'deniro', 'einstein', 'hemsworth', 'lennon',
  'madonna', 'phelps', 'redford', 'shatner', 'travolta', 'tyson', 'lopez',
  'hogan', 'napoleon', 'caesar', 'caesars', 'shakespeare',
  // Given names with no everyday-noun cover.
  'rachel', 'monica', 'phoebe', 'colleen', 'sheila', 'donna', 'ursula',
  'tammy', 'tiffany', 'daphne', 'bertha', 'stella', 'regina', 'carmen',
  'abigail', 'riley', 'kerry', 'colin', 'nelly', 'chico', 'charlie', 'romeo',
  'rolf', 'snider',
  // Not a name — juvenile as a bare tile, which is the same failure mode.
  'weiner', 'wiener', 'weiners', 'wieners',
  //
  // DELIBERATELY NOT LISTED, per this list's own rule (an everyday-noun
  // reading that dominates): HARPER, PALMER, FOWLER, THATCHER, SPENCER,
  // CHAPMAN, BAILEY, MORRIS, LEWIS, SANDERS, WARNER, BURTON, DALTON, BRENT,
  // LOGAN, NELSON, HOMER, HECTOR, MADDEN, WALLACE, WATSON, LAWRENCE,
  // HAMILTON, BOWIE, JACKSON, JORDAN, WAYNE, DERRY, RIDLEY. Each is a trade,
  // a tool, a verb, a goose or a wrestling hold before it is anybody, and
  // half of them are the manor's own vocabulary (a THATCHER and a FOWLER work
  // grounds like Fern's).
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

export {
  ALLOWED_WITH_RATIONALE, offenceOf, proseOffenceOf, RULES, safetyOffenceOf,
  safetyOk, scanProse, type Category, type Rule, type Standard,
} from './lib/safety';
import { safeAndCozy, scanProse } from './lib/safety';

/** Vulgarity / violence / illness / death — lowercase. */
export const TONE_BLOCKLIST: ReadonlySet<string> = clean(TONE_WORDS);

/** Predominantly-a-name words — lowercase. */
export const NAME_BLOCKLIST: ReadonlySet<string> = clean(NAME_WORDS);

/** Abbreviation/slang corpus artifacts — lowercase, display surfaces only. */
export const ARTIFACT_BLOCKLIST: ReadonlySet<string> = clean(ARTIFACT_WORDS);

/**
 * True when a word passes the safety lexicon, the tone gate, the proper-noun
 * gate and the artifact gate — i.e. may be printed as a bare word in the
 * manor's own voice.
 */
export function gateOk(word: string): boolean {
  const w = word.toLowerCase();
  if (!safeAndCozy(w)) return false;
  return !TONE_BLOCKLIST.has(w) && !NAME_BLOCKLIST.has(w) && !ARTIFACT_BLOCKLIST.has(w);
}

/**
 * True when a word passes the safety lexicon and the tone gate. Proper nouns
 * are allowed: word-web's authored trivia groups are proper nouns by design.
 */
export function toneOk(word: string): boolean {
  const w = word.toLowerCase();
  return safeAndCozy(w) && !TONE_BLOCKLIST.has(w);
}

/**
 * Authored PROSE gate — the absolute safety standard only.
 *
 * Returns the offending tokens (empty when clean). Tone words are the author's
 * to use: a mystery about a grieving lexicographer needs GRIEF, and Ellery
 * says "thirty years dead" in her own voice. What no sentence anywhere may
 * carry is a slur, hard profanity, or sexual crudity.
 */
export function proseProblems(text: string): { word: string; why: string }[] {
  return scanProse(text).map(({ word, rule }) => ({ word, why: rule.category }));
}

/** True when an authored passage carries nothing on the absolute standard. */
export function proseOk(text: string): boolean {
  return scanProse(text).length === 0;
}
