/**
 * content/lib/safety.ts — the content SAFETY LEXICON.
 *
 * =========================================================================
 * WHY THIS FILE EXISTS
 * =========================================================================
 * Lexicon Manor is a gift for one person, played daily, cozy by design. On
 * 2026-08-06 the slur RETARDED shipped live: nine times in the Conservatory's
 * `validWords` (hive.json) and once as a Gallery TARGET WORD (twistle.json).
 * It reached the deployed site. An earlier round's agent FOUND it and left it,
 * reasoning that gating it without regenerating would turn the content lint
 * red. That reasoning was exactly backwards. **A red build is the correct
 * outcome.** A red build costs an agent an hour. A slur on the board costs the
 * person this was made for.
 *
 * The reason it survived is structural, not clerical: the old blocklists were
 * ad-hoc LEMMA lists — hand-appended a few words at a time, in eight dated
 * "reads", each catching whatever that round's sampling happened to surface.
 * A lemma list cannot be complete, because English inflects. `murder` was
 * gated and MURDERER shipped. `midget` was gated and RETARDED shipped. This
 * file replaces lemma-guessing with FAMILIES and rules, so that gating a
 * concept gates every spelling of it.
 *
 * =========================================================================
 * THE STANDARD (what gets blocked, and why)
 * =========================================================================
 * Two independent standards, because two different things are being judged.
 *
 *  A. SAFETY (`safetyOk`) — words that must never appear anywhere in shipped
 *     content, in any surface, in any context: slurs (racial, ethnic,
 *     disability, sexuality, gender), hard profanity, sexual and anatomical
 *     crudity, sexual violence, and explicit self-harm. These have no cozy
 *     reading, no mystery-fiction reading, and no "but the category label
 *     disambiguates it" reading. This standard is absolute. There is no
 *     borderline tier inside it and nothing on it is a judgment call.
 *
 *  B. TONE (`toneOk`, layered on top of safety) — words with legitimate
 *     English lives that nonetheless jar when the MANOR PRINTS THEM IN ITS OWN
 *     VOICE as a bare word on a board: graphic violence and weapons, the
 *     mechanics of death (HEARSE, GRAVEYARD, FUNERAL), named diseases,
 *     bodily waste, hard drugs. This standard is editorial (AAA 3.7, the COZY
 *     pillar, 4.12's string-lint spirit) and is where genuine judgment lives.
 *     Every judgment call is recorded in ALLOWED_WITH_RATIONALE below.
 *
 * =========================================================================
 * WORD-IN-ISOLATION vs WORD-IN-A-SENTENCE
 * =========================================================================
 * A word displayed ALONE is read at its most salient sense. TART on a tile is
 * a pastry; PRICK on a tile is not a needle. A word inside an authored
 * sentence is disambiguated by its neighbours: "too blunt to prick" is a
 * sewing image and nothing else. So the gate has two strengths:
 *
 *   - DISPLAY surfaces (hive validWords, twistle targetWords, word-web tiles,
 *     crossword answers, Forgotten Word headwords — anything set as a bare
 *     word) get safety + tone + names + artifacts: `gateOk`.
 *   - PROSE surfaces (dialogue lines, definitions, etymologies, clues, volume
 *     fragments — authored sentences a human wrote deliberately) get SAFETY
 *     ONLY, and only the unambiguous half of it: `proseOk`. GRIEF and MOURN
 *     belong in a mystery about a grieving lexicographer. A slur does not
 *     belong in one.
 *
 * =========================================================================
 * THE SCUNTHORPE PROBLEM, AND HOW THIS FILE AVOIDS IT
 * =========================================================================
 * Naive substring matching breaks on innocent carriers: ASSESS contains "ass",
 * MANUSCRIPT contains "anus", THERAPIST contains "rapist", GRAPEFRUIT contains
 * "rape", COCOON contains "coon", STURDY contains "turd", FARTHING contains
 * "fart", OXYMORON contains "moron", GOBBLEDYGOOK contains "gook". Three rules
 * keep this honest:
 *
 *  1. **Default to whole-word matching.** A `family` entry matches the stem
 *     and its mechanically-derived inflections as COMPLETE WORDS only. This is
 *     safe by construction and covers the inflection hole that shipped
 *     MURDERER after `murder` was gated.
 *  2. **Substring matching is opt-in and PROVEN, never assumed.** An
 *     `embedded` entry matches anywhere inside a word, and is only permitted
 *     where the substring's carriers in the shipped dictionary have been
 *     ENUMERATED and reviewed. Every innocent carrier is listed explicitly in
 *     that rule's `innocent` array. `tests/content-safety.test.ts` re-derives
 *     the carrier set from `content/data/enable1.txt` on every run and fails
 *     if a carrier appears that is neither a genuine family member nor listed
 *     as innocent — so adding a rule without doing the enumeration breaks the
 *     build, and a dictionary change that introduces a new innocent carrier
 *     breaks the build too.
 *  3. **When a rule is deliberately over-broad, it says so.** A handful of
 *     rules block innocent words on purpose (NIGGARD, NIGGLE, SNIGGER under
 *     the `nigg` rule; RETARDANT under `retard`). The asymmetry is the whole
 *     argument: a false positive costs one absent word out of ~9,500 and
 *     nobody ever notices; a false negative is a slur on the board of a game
 *     built for one person. Those rules carry `overBroad: true` and name their
 *     collateral, so the choice is visible rather than accidental.
 */

/* ------------------------------------------------------------------ */
/* Rule shapes                                                         */
/* ------------------------------------------------------------------ */

/** Standard a rule belongs to. SAFETY is absolute; TONE is editorial. */
export type Standard = 'safety' | 'tone';

export type Category =
  // --- safety (absolute) ---
  | 'slur-race-ethnicity'
  | 'slur-disability'
  | 'slur-sexuality-gender'
  | 'profanity'
  | 'sexual-crudity'
  | 'sexual-violence'
  | 'self-harm'
  | 'atrocity'
  // --- tone (editorial, cozy bar) ---
  | 'violence'
  | 'death'
  | 'illness'
  | 'bodily'
  | 'intoxicant'
  | 'derogatory';

export interface Rule {
  /** Lowercase stem. */
  readonly stem: string;
  readonly standard: Standard;
  readonly category: Category;
  /**
   * When true the stem is matched as a SUBSTRING of any word (compounds,
   * prefixes, suffixes). Only set this after enumerating the carriers — the
   * safety test enforces that.
   */
  readonly embedded?: true;
  /**
   * Dictionary words that contain an `embedded` stem but are NOT members of
   * the family. Listed exhaustively; the safety test re-derives the carrier
   * set and fails on anything unaccounted for.
   */
  readonly innocent?: readonly string[];
  /**
   * Set when the rule knowingly blocks innocent words. Names the collateral
   * so the trade is a recorded decision, not an oversight.
   */
  readonly overBroad?: readonly string[];
  /**
   * Extra whole-word members that the inflector cannot derive (irregulars,
   * compounds, alternative spellings).
   */
  readonly also?: readonly string[];
}

const S = (
  stem: string, category: Category, extra: Partial<Rule> = {},
): Rule => ({ stem, standard: 'safety', category, ...extra });
const T = (
  stem: string, category: Category, extra: Partial<Rule> = {},
): Rule => ({ stem, standard: 'tone', category, ...extra });

/* ------------------------------------------------------------------ */
/* A. SAFETY — absolute. Never shipped, on any surface, in any context. */
/* ------------------------------------------------------------------ */

/**
 * Slurs naming a race, ethnicity or nationality.
 *
 * Words whose innocent sense is real but whose slur sense is live enough that
 * a bare tile is a coin-flip (CHINK "a chink of light", COON "raccoon",
 * SPADE the card suit) are handled deliberately: CHINK and COON are blocked
 * as whole words because the reading a player lands on is not ours to choose;
 * SPADE is NOT blocked, because the garden tool and the card suit are the only
 * senses a manor puzzle can produce (see ALLOWED_WITH_RATIONALE).
 */
const SLUR_RACE: readonly Rule[] = [
  S('nigg', 'slur-race-ethnicity', {
    embedded: true,
    overBroad: ['niggard', 'niggardly', 'niggle', 'niggling', 'snigger', 'sniggle', 'renig'],
  }),
  S('kike', 'slur-race-ethnicity', { embedded: true }),
  S('chink', 'slur-race-ethnicity', {
    embedded: true,
    innocent: ['chinkapin', 'chinkapins', 'pachinko', 'pachinkos'],
    overBroad: ['chink (a gap)', 'chinked', 'chinking'],
  }),
  S('gook', 'slur-race-ethnicity', {
    embedded: true,
    innocent: ['gobbledegook', 'gobbledegooks', 'gobbledygook', 'gobbledygooks'],
  }),
  S('dago', 'slur-race-ethnicity', {
    embedded: true,
    innocent: [
      'dagoba', 'dagobas', 'pedagog', 'pedagogic', 'pedagogical', 'pedagogically',
      'pedagogics', 'pedagogies', 'pedagogs', 'pedagogue', 'pedagogues', 'pedagogy',
      'solidago', 'solidagos',
    ],
  }),
  S('wop', 'slur-race-ethnicity'),
  S('honky', 'slur-race-ethnicity', { also: ['honkie', 'honkies', 'honkeys'] }),
  S('wetback', 'slur-race-ethnicity', { embedded: true }),
  S('darkie', 'slur-race-ethnicity', { embedded: true, also: ['darky', 'darkies'] }),
  S('pickaninny', 'slur-race-ethnicity', { embedded: true, also: ['pickaninnies'] }),
  S('mulatto', 'slur-race-ethnicity', { embedded: true }),
  S('octoroon', 'slur-race-ethnicity', { embedded: true }),
  S('quadroon', 'slur-race-ethnicity', { embedded: true }),
  S('sambo', 'slur-race-ethnicity', { embedded: true }),
  S('jigaboo', 'slur-race-ethnicity', { embedded: true }),
  S('shylock', 'slur-race-ethnicity', { embedded: true }),
  S('shiksa', 'slur-race-ethnicity', { embedded: true, also: ['shikse', 'shikses'] }),
  S('coolie', 'slur-race-ethnicity', { embedded: true }),
  S('redskin', 'slur-race-ethnicity', { embedded: true }),
  S('squaw', 'slur-race-ethnicity'),          // whole word: SQUAWK, SQUAWFISH are innocent
  S('injun', 'slur-race-ethnicity'),          // whole word: INJUNCTION is innocent
  S('gringo', 'slur-race-ethnicity'),         // whole word: DEGRINGOLADE is innocent
  S('coon', 'slur-race-ethnicity', {          // whole word: RACCOON, COCOON innocent
    also: ['coons', 'coonskin', 'coonskins', 'coonhound', 'coonhounds'],
    overBroad: ['coon (the raccoon shortening)'],
  }),
  S('heeb', 'slur-race-ethnicity', { also: ['hebe', 'hebes', 'heebs'] }),
  S('spic', 'slur-race-ethnicity', {          // whole word: SPICE, SUSPICION innocent
    also: ['spics', 'spick', 'spicks'],
    innocent: ['spiced', 'spicer', 'spicers', 'spicing', 'spicy', 'spicier', 'spiciest'],
  }),
  S('polack', 'slur-race-ethnicity', { embedded: true }),
  S('gyp', 'slur-race-ethnicity', {           // whole word: GYPSUM, EGYPT innocent
    also: ['gyps', 'gypped', 'gypping', 'gypper', 'gyppers'],
  }),
  /*
   * ROUND 25 — FOUR THAT ENABLE1 ADMITS AND THIS LEXICON DID NOT CATCH.
   *
   * Found by search, not by reading: a crossword fill experiment over
   * `enable1 ∩ gateOk` offered ABO as a three-letter answer, and the gate
   * said yes. Probing the rest of the family found JAP, WOG and PAKI passing
   * too, while COON, GYP, SPIC, KIKE, DAGO and GOOK were already blocked.
   * Nothing shipped carries any of them (all seven generated pools and every
   * authored file were scanned: zero hits), so this is a latent hole, not a
   * live one — which is the only reason it can be closed without a
   * regeneration. It is the RETARDED shape exactly: a short, high-frequency
   * fill word that a generator reaches for and a lemma list never listed.
   *
   * All four are WHOLE-WORD. Every one of them is a live prefix of innocent
   * English — ABOUT/ABOVE/ABODE/ABOARD, JAPE/JAPAN, WOGGLE, PAKISTANI — so
   * `embedded` here would gate a dozen ordinary words and red the build for
   * the wrong reason.
   */
  S('abo', 'slur-race-ethnicity', {           // whole word: ABOUT, ABOVE, ABODE, ABOARD innocent
    also: ['abos'],
  }),
  S('jap', 'slur-race-ethnicity', {           // whole word: JAPE, JAPAN, JAPANNED innocent
    also: ['japs'],
    // The inflector derives `japed` from this stem, and JAPED is an ordinary
    // English past tense (to jape, to joke). Measured before it was written:
    // `gateOk('japed')` was true at HEAD and false with the rule alone. The
    // whole JAPE/JAPAN family is named so the slur costs no innocent word.
    innocent: ['jape', 'japed', 'japes', 'japing', 'japer', 'japers', 'japery',
      'japan', 'japans', 'japanned', 'japanning', 'japanner', 'japanners'],
  }),
  S('wog', 'slur-race-ethnicity', {           // whole word: WOGGLE innocent
    also: ['wogs'],
  }),
  S('paki', 'slur-race-ethnicity', {          // whole word: PAKISTANI is a demonym, not this
    also: ['pakis'],
  }),
];

/**
 * Slurs that name a disability or a mind as an insult.
 *
 * This is the family that shipped. RETARD is `embedded` so that RETARDED,
 * RETARDATION, RETARDATE and any compound are caught by construction rather
 * than by somebody remembering to type them. RETARDANT (flame retardant) is
 * knowingly collateral: it is a fire-safety term, it has never once been
 * wanted by a cozy word game, and it spells the slur.
 */
const SLUR_DISABILITY: readonly Rule[] = [
  S('retard', 'slur-disability', { embedded: true, overBroad: ['retardant', 'retardants'] }),
  S('tard', 'slur-disability', {              // whole word: MUSTARD, LEOTARD, BASTARD handled elsewhere
    innocent: ['tardy', 'tardier', 'tardiest', 'tardily', 'tardiness', 'tardo'],
  }),
  S('spastic', 'slur-disability', {
    embedded: true,
    overBroad: ['bronchospastic', 'vasospastic'],
  }),
  S('spaz', 'slur-disability', { embedded: true, also: ['spazzes', 'spazz'] }),
  S('midget', 'slur-disability', { embedded: true }),
  S('mongoloid', 'slur-disability', { embedded: true }),
  S('imbecile', 'slur-disability', { embedded: true, also: ['imbecilic', 'imbecility', 'imbecilities'] }),
  S('cretin', 'slur-disability', { also: ['cretins', 'cretinism', 'cretinisms', 'cretinous'] }),
  S('moron', 'slur-disability', {             // whole word: OXYMORON innocent
    also: ['morons', 'moronic', 'moronically', 'moronism', 'moronisms', 'moronity', 'moronities'],
  }),
  S('cripple', 'slur-disability', { embedded: true }),
  S('gimp', 'slur-disability', { embedded: true, overBroad: ['gimp (upholstery braid)'] }),
  S('lunatic', 'slur-disability', { embedded: true }),
  S('loony', 'slur-disability', { also: ['looney', 'loonies', 'loon bin'] }),
  S('feebleminded', 'slur-disability', { embedded: true }),
  S('psycho', 'slur-disability', {            // whole word: PSYCHOLOGY etc innocent
    also: ['psychos'],
  }),
  S('psychopath', 'slur-disability', { embedded: true }),
  S('schizo', 'slur-disability', {            // whole word: SCHIZOCARP, SCHIZOGONY innocent
    also: ['schizos', 'schizoid', 'schizoids'],
  }),
  S('dumb', 'slur-disability', {              // "dumb" = mute; whole word only
    also: ['dumber', 'dumbest', 'dumbly', 'dumbness', 'dumbnesses', 'dumbhead', 'dumbheads', 'dumbass', 'dumbasses'],
    overBroad: ['dumb (colloquial "silly")'],
  }),
];

/** Slurs naming sexuality or gender identity. */
const SLUR_SEXUALITY: readonly Rule[] = [
  S('faggot', 'slur-sexuality-gender', { embedded: true, overBroad: ['faggot (a bundle of sticks)'] }),
  S('fagot', 'slur-sexuality-gender', { embedded: true, overBroad: ['fagoting (embroidery)'] }),
  S('fag', 'slur-sexuality-gender', {         // whole word: LEAFAGE, WHARFAGE innocent
    also: ['fags', 'fagged', 'fagging', 'faggy'],
  }),
  S('dyke', 'slur-sexuality-gender', {
    embedded: true,
    overBroad: ['vandyke', 'vandykes'],
  }),
  S('dike', 'slur-sexuality-gender', {        // homograph of the sea wall; whole word
    also: ['dikes', 'diked', 'diking'],
    innocent: ['diker', 'dikers'],
    overBroad: ['dike (an embankment)'],
  }),
  S('tranny', 'slur-sexuality-gender', { embedded: true, also: ['trannies'] }),
  S('shemale', 'slur-sexuality-gender', { embedded: true }),
  S('poofter', 'slur-sexuality-gender', { embedded: true, also: ['poof', 'poofs', 'poofy'] }),
  S('lesbo', 'slur-sexuality-gender', { also: ['lesbos'] }),  // whole word: BLESBOK innocent
  S('queer', 'slur-sexuality-gender', {
    also: ['queers', 'queerer', 'queerest', 'queerly', 'queerness'],
    overBroad: ['queer (the archaic "odd")', 'queer (reclaimed usage)'],
  }),
  S('catamite', 'slur-sexuality-gender', { embedded: true }),
];

/** Hard profanity. Families, so every inflection and compound is covered. */
const PROFANITY: readonly Rule[] = [
  S('fuck', 'profanity', { embedded: true }),
  S('shit', 'profanity', {
    embedded: true,
    innocent: [
      'mishit', 'mishits', 'mishitting',
      'shitake', 'shitakes',
      'shittah', 'shittahs', 'shittim', 'shittims', 'shittimwood', 'shittimwoods',
    ],
  }),
  S('cunt', 'profanity', { embedded: true }),
  S('bitch', 'profanity', { embedded: true, overBroad: ['bitch (a female dog)'] }),
  S('bastard', 'profanity', { embedded: true, overBroad: ['bastardize', 'bastardization'] }),
  S('whore', 'profanity', { embedded: true }),
  S('slut', 'profanity', { embedded: true }),
  S('twat', 'profanity'),                     // whole word: SALTWATER, WRISTWATCH innocent
  S('wank', 'profanity', {                    // whole word: SWANK innocent
    also: ['wanks', 'wanked', 'wanking', 'wanker', 'wankers'],
  }),
  S('bollock', 'profanity', { embedded: true }),
  S('asshole', 'profanity', { embedded: true, also: ['arsehole', 'arseholes'] }),
  S('dickhead', 'profanity', { embedded: true }),
  S('cocksucker', 'profanity', { embedded: true }),
  S('bugger', 'profanity', {                  // whole word: DEBUGGER, HUMBUGGERY innocent
    also: ['buggers', 'buggered', 'buggering', 'buggery', 'buggeries'],
  }),
  S('piss', 'profanity', {                    // whole word: INSPISSATE innocent
    also: ['pisses', 'pissed', 'pisser', 'pissers', 'pissing', 'pissant', 'pissants', 'pissoir', 'pissoirs'],
  }),
  S('crap', 'profanity', {                    // whole word: SCRAPE, CRAPE innocent
    also: ['craps', 'crapped', 'crapping', 'crapper', 'crappers', 'crappy', 'crappier', 'crappiest',
      'crapshoot', 'crapshoots', 'crapshooter', 'crapshooters', 'crapola'],
    innocent: ['craped', 'craping', 'craper', 'crape', 'crapes'],   // CRAPE, the crepe fabric
  }),
  S('turd', 'profanity', { also: ['turds'], innocent: ['turdine'] }),   // STURDY, TURDINE innocent
  S('fart', 'profanity', { also: ['farts', 'farted', 'farting', 'farter', 'farters'] }), // FARTHING innocent
  S('arse', 'profanity', { also: ['arses', 'arsed'] }),     // whole word: COARSE, SPARSE innocent
  S('ass', 'profanity', {                     // whole word: ASSESS, CLASS, PASSAGE innocent
    also: ['asses', 'jackass', 'jackasses', 'smartass', 'smartasses', 'badass', 'badasses'],
    innocent: ['assist', 'assists'],
    overBroad: ['ass (the donkey)'],
  }),
  S('prick', 'profanity', {                   // whole word: PRICKLE, PRICKLY, PINPRICK innocent
    also: ['pricks', 'pricked', 'pricker', 'prickers', 'pricking', 'pricky'],
    innocent: ['prickly', 'prickle', 'prickles', 'prickled', 'prickling', 'prickier', 'prickiest'],
    overBroad: ['prick (to pierce)'],
  }),
  S('cock', 'profanity', {                    // whole word: COCKATOO, PEACOCK, COCKLE innocent
    also: ['cocks', 'cocked', 'cocky'],
    innocent: ['cocker', 'cockers', 'cocking', 'cockish'],   // COCKER, the spaniel
    overBroad: ['cock (the rooster)'],
  }),
  S('dick', 'profanity', {
    also: ['dicks', 'dicky', 'dickier', 'dickiest'],
    innocent: ['dicker', 'dickers'],            // DICKER, to haggle
  }),
  S('douche', 'profanity', { embedded: true }),
  S('jizz', 'profanity', { embedded: true }),
  S('git', 'profanity', { also: ['gits'] }),  // whole word: DIGIT, LEGITIMATE innocent
];

/** Sexual and anatomical crudity. */
const SEXUAL: readonly Rule[] = [
  S('penis', 'sexual-crudity', { embedded: true }),
  S('vagina', 'sexual-crudity', {
    embedded: true,
    overBroad: ['invaginate', 'evagination'],
  }),
  S('clitor', 'sexual-crudity', { embedded: true }),
  S('scrotum', 'sexual-crudity', { embedded: true, also: ['scrotal'] }),
  S('testicl', 'sexual-crudity', { embedded: true, also: ['testis', 'testes'] }),
  S('rectum', 'sexual-crudity', { embedded: true }),
  S('rectal', 'sexual-crudity', { embedded: true, overBroad: ['colorectal'] }),
  S('anus', 'sexual-crudity'),                // whole word: MANUSCRIPT innocent
  S('anal', 'sexual-crudity', { also: ['anally'] }),  // whole word: ANALOG, ANALYSIS innocent
  S('nipple', 'sexual-crudity', { embedded: true }),
  S('sperm', 'sexual-crudity', {              // whole word: ANGIOSPERM, GYMNOSPERM innocent
    also: ['sperms', 'spermatic', 'spermatozoa', 'spermatozoon', 'spermicide', 'spermicides'],
  }),
  S('semen', 'sexual-crudity', { also: ['semens'] }),  // whole word: BASEMENT, CASEMENT innocent
  S('ejacul', 'sexual-crudity', { embedded: true }),
  S('masturbat', 'sexual-crudity', { embedded: true }),
  S('orgasm', 'sexual-crudity', { embedded: true }),
  S('orgy', 'sexual-crudity', { also: ['orgies', 'orgiastic'] }),
  S('fellati', 'sexual-crudity', { embedded: true }),
  S('cunnilingus', 'sexual-crudity', { embedded: true }),
  S('sodom', 'sexual-crudity', { embedded: true }),
  S('pornograph', 'sexual-crudity', { embedded: true, also: ['porn', 'porns', 'porno', 'pornos'] }),
  S('erotic', 'sexual-crudity', {             // whole word: SCLEROTIC innocent
    also: ['erotica', 'erotical', 'erotically', 'erotics', 'eroticism', 'eroticisms',
      'eroticist', 'eroticists', 'eroticize', 'eroticized', 'eroticizes', 'eroticizing',
      'autoerotic', 'homoerotic', 'homoeroticism'],
  }),
  S('fetish', 'sexual-crudity', { embedded: true }),
  S('bestial', 'sexual-crudity', { embedded: true }),
  S('genital', 'sexual-crudity', { embedded: true, overBroad: ['congenital', 'congenitally'] }),
  S('condom', 'sexual-crudity', {
    embedded: true,
    innocent: ['condominium', 'condominiums'],
  }),
  S('dildo', 'sexual-crudity', { embedded: true }),
  S('libido', 'sexual-crudity', { embedded: true, also: ['libidinal', 'libidinous'] }),
  S('erection', 'sexual-crudity', { embedded: true, also: ['erectile'] }),
  S('arousal', 'sexual-crudity', {            // whole word: CAROUSAL innocent
    also: ['arousals', 'arouse', 'aroused', 'arouses', 'arousing'],
  }),
  S('prostat', 'sexual-crudity', { embedded: true }),
  S('urethra', 'sexual-crudity', { embedded: true }),
  S('uterus', 'sexual-crudity', { embedded: true, also: ['uterine', 'uteri'] }),
  S('ovarian', 'sexual-crudity'),             // whole word: COVARIANCE innocent
  S('perineal', 'sexual-crudity', { embedded: true, also: ['perineum'] }),
  S('pubic', 'sexual-crudity', { embedded: true, also: ['pubes'] }),
  S('lingerie', 'sexual-crudity', { embedded: true }),
  S('nudist', 'sexual-crudity', { embedded: true, also: ['nude', 'nudes', 'nudism', 'nudity'] }),
  S('brothel', 'sexual-crudity', { embedded: true }),
  S('prostitut', 'sexual-crudity', { embedded: true }),
  S('copulat', 'sexual-crudity', { embedded: true }),
  S('fornicat', 'sexual-crudity', { embedded: true }),
  S('sadism', 'sexual-crudity', { embedded: true, also: ['sadist', 'sadists', 'sadistic'] }),
  S('masochis', 'sexual-crudity', { embedded: true }),
  S('bondage', 'sexual-crudity', {
    embedded: true,
    innocent: ['vagabondage', 'vagabondages'],
  }),
  S('horny', 'sexual-crudity', { overBroad: ['horny (made of horn)'] }),  // THORNY innocent
  S('pimp', 'sexual-crudity', {
    also: ['pimps', 'pimped', 'pimping'],
    innocent: ['pimply', 'pimplier', 'pimpliest'],
  }),
  S('sex', 'sexual-crudity', {                // whole word: SEXTANT, SUSSEX, ESSEX innocent
    also: ['sexes', 'sexed', 'sexy', 'sexier', 'sexiest', 'sexual', 'sexually',
      'sexuality', 'bisexual', 'transsexual', 'sexting'],
  }),
  S('boob', 'sexual-crudity', { also: ['boobs', 'booby', 'boobies'] }),
  S('tit', 'sexual-crudity', {                // whole word: TITLE, APPETITE, PETITE innocent
    also: ['tits', 'titty', 'titties'],
    innocent: ['titer', 'titers', 'titre', 'titres', 'titter', 'titters', 'tittered', 'tittering'],
    overBroad: ['tit (the bird)'],
  }),
  S('crotch', 'sexual-crudity', {
    embedded: true,
    innocent: ['crotchet', 'crotchets', 'crotchety', 'crotchetiness', 'crotchetinesses'],
  }),
  S('smut', 'sexual-crudity', { also: ['smuts', 'smutty', 'smuttier', 'smuttiest'] }),
];

/** Sexual violence. */
const SEXUAL_VIOLENCE: readonly Rule[] = [
  S('rape', 'sexual-violence', {              // whole word: GRAPE, DRAPE, SCRAPE, TRAPEZE innocent
    also: ['rapes', 'raped', 'raping', 'raper', 'rapers'],
  }),
  S('rapist', 'sexual-violence', { also: ['rapists'] }),   // whole word: THERAPIST innocent
  S('molest', 'sexual-violence', { embedded: true }),
  S('pedophil', 'sexual-violence', { embedded: true, also: ['paedophil', 'paedophile', 'paedophiles', 'paedophilia'] }),
  S('incest', 'sexual-violence', { embedded: true }),
];

/** Self-harm and suicide. */
const SELF_HARM: readonly Rule[] = [
  S('suicid', 'self-harm', { embedded: true }),
  S('anorexi', 'self-harm', { embedded: true, also: ['anorectic', 'anorexic', 'anorexics'] }),
  S('bulimi', 'self-harm', { embedded: true, also: ['bulimic', 'bulimics'] }),
  S('selfharm', 'self-harm', { embedded: true }),
];

/**
 * Named atrocities and hate movements. These are safety, not tone: the manor's
 * board is not a place a player meets the word HOLOCAUST, however historically
 * literate the surrounding puzzle is.
 */
const ATROCITY: readonly Rule[] = [
  S('nazi', 'atrocity', {
    embedded: true,
    innocent: [
      'fluphenazine', 'fluphenazines', 'monazite', 'monazites',
      'perphenazine', 'perphenazines', 'phenazin', 'phenazins', 'phenazine', 'phenazines',
    ],
  }),
  S('fascis', 'atrocity', { embedded: true }),
  S('holocaust', 'atrocity', { embedded: true }),
  S('apartheid', 'atrocity', { embedded: true }),
  S('pogrom', 'atrocity', { embedded: true }),
  S('genocid', 'atrocity', { embedded: true }),
  S('lynch', 'atrocity', { embedded: true, overBroad: ['lynchpin', 'lynchpins'] }),
  S('slavery', 'atrocity', { embedded: true, also: ['slave', 'slaves', 'enslave', 'enslaved', 'enslaves', 'enslavement'] }),
  S('terroris', 'atrocity', { embedded: true, also: ['terrorize', 'terrorized', 'terrorizes', 'terrorizing'] }),
  S('jihad', 'atrocity', { embedded: true }),
  S('racism', 'atrocity', {                   // whole word: OSTRACISM innocent
    also: ['racisms', 'racist', 'racists', 'antiracism', 'antiracist'],
  }),
  S('bigot', 'atrocity', { embedded: true }),
  S('sexist', 'atrocity', { also: ['sexists', 'sexism', 'sexisms'] }),
  S('klan', 'atrocity', { also: ['klans', 'kkk'] }),   // whole word: PARKLAND, DOCKLAND innocent
  S('supremacist', 'atrocity', { embedded: true }),
];

/* ------------------------------------------------------------------ */
/* B. TONE — the cozy editorial bar. Judgment lives here.              */
/* ------------------------------------------------------------------ */

/**
 * Graphic violence and the instruments of killing.
 *
 * The line: a KNIFE in a Kitchen Utensils group is a utensil and stays; a
 * bare GRENADE on a hive found-list is a weapon and goes. Everything below has
 * no non-lethal reading, so it is gated at word level and the contextual cases
 * are handled by the authored-board review rather than by weakening the rule.
 */
const VIOLENCE: readonly Rule[] = [
  T('kill', 'violence', { also: ['kills', 'killed', 'killer', 'killers', 'killing', 'killings', 'roadkill', 'overkill'] }),
  T('murder', 'violence', { embedded: true }),
  T('slaughter', 'violence', { embedded: true }),
  T('strangl', 'violence', { embedded: true }),
  T('torture', 'violence', { embedded: true, also: ['torturous'] }),
  T('decapitat', 'violence', { embedded: true }),
  T('behead', 'violence', { embedded: true }),
  T('disembowel', 'violence', { embedded: true }),
  T('mutilat', 'violence', { embedded: true }),
  T('massacre', 'violence', { embedded: true }),
  T('maim', 'violence', { embedded: true }),
  T('impale', 'violence', { embedded: true, also: ['impaler', 'impalers'] }),
  T('homicid', 'violence', { embedded: true }),
  T('fratricid', 'violence', { embedded: true }),
  T('patricid', 'violence', { embedded: true }),
  T('matricid', 'violence', { embedded: true }),
  T('infanticid', 'violence', { embedded: true }),
  T('assassin', 'violence', { embedded: true }),
  T('guillotine', 'violence', { embedded: true }),
  T('gallows', 'violence', { embedded: true }),
  T('noose', 'violence', { embedded: true }),
  T('stab', 'violence', { also: ['stabs', 'stabbed', 'stabbing', 'stabbings', 'stabber', 'stabbers'] }),
  T('slay', 'violence', { also: ['slays', 'slain', 'slew', 'slayer', 'slayers', 'slaying'] }),
  T('choke', 'violence', {
    also: ['chokes', 'choked', 'choking', 'choker', 'chokers'],
    innocent: ['choky'],
  }),
  T('gore', 'violence', { also: ['gored', 'gores', 'gory', 'gorier', 'goriest'] }),
  T('grenade', 'violence', { embedded: true }),
  T('bomb', 'violence', { also: ['bombs', 'bombed', 'bomber', 'bombers', 'bombing', 'bombings', 'bombard', 'bombarded', 'bombarding', 'bombardment', 'firebomb', 'carbomb'] }),
  T('bullet', 'violence', { also: ['bullets'], overBroad: ['bulletin (kept: see ALLOWED_WITH_RATIONALE)'] }),
  T('rifle', 'violence', { also: ['rifles', 'rifled', 'rifleman', 'riflemen'], overBroad: ['rifle (to rummage)'] }),
  T('pistol', 'violence', { embedded: true }),
  T('revolver', 'violence', { embedded: true }),
  T('shotgun', 'violence', { embedded: true }),
  T('musket', 'violence', { embedded: true }),
  T('carbine', 'violence', { embedded: true }),
  T('missile', 'violence', { embedded: true }),
  T('torpedo', 'violence', { embedded: true }),
  T('shrapnel', 'violence', { embedded: true }),
  T('sniper', 'violence', { embedded: true }),
  T('gun', 'violence', {                      // whole word: BEGUN, LAGUNA innocent
    also: ['guns', 'gunned', 'gunner', 'gunners', 'gunning', 'gunshot', 'gunfire', 'gunpoint',
      'gunman', 'gunmen', 'shotgun', 'outgun', 'outgunned', 'outgunning', 'handgun', 'handguns'],
  }),
  T('dagger', 'violence', { embedded: true }),
  T('cyanide', 'violence', { embedded: true }),
  T('arsenic', 'violence', { embedded: true, overBroad: ['arsenic (the element)'] }),
  T('militia', 'violence', { embedded: true }),
  T('militant', 'violence', { embedded: true }),
  T('hostage', 'violence', { embedded: true }),
  T('cutthroat', 'violence', { embedded: true }),
  T('lethal', 'violence', { embedded: true, also: ['nonlethal'] }),
  T('abuse', 'violence', { also: ['abuses', 'abused', 'abusing', 'abuser', 'abusers', 'abusive', 'abusively'] }),
  T('war', 'violence', {                      // whole word: WARM, WARD, AWARD, WARBLE innocent
    also: ['wars', 'warred', 'warring', 'warfare', 'warlord', 'warlords', 'warhead', 'warheads',
      'warmonger', 'warpath', 'warship', 'warships', 'prewar', 'postwar'],
    innocent: ['wary', 'warier', 'wariest', 'warily', 'wariness'],
  }),

  /* ── ROUND 16, found by an INDEPENDENT re-audit of the shipped pools ──────
   * The round-15 sweep rebuilt this file and then verified the pools with it,
   * which can only ever prove the pools match the list. A verifier composed a
   * fresh term list without reading this file and screened all 16 shipped
   * files again; six display words came back that no rule above reaches.
   * Every one of them is a stem this lexicon simply never had — not an
   * inflection hole, a coverage hole — which is the failure mode a
   * self-check cannot see. They shipped as scored, revealed answers:
   * CARNAGE and AMMO in hive validWords, ARSENAL / DROWNED / AMMO in twistle
   * targets. Whole-word where a carrier exists (AMMONITE, AMMONIA, HAMMOCK,
   * MAMMOTH all contain "ammo"); embedded only where the dictionary has none.
   */
  T('carnage', 'violence', { embedded: true }),
  T('arsenal', 'violence', { also: ['arsenals'] }),      // whole word; no enable1 carrier
  T('ammo', 'violence', {                                 // WHOLE WORD — see the carriers below
    also: ['ammunition'],
    innocent: ['ammonite', 'ammonites', 'ammonia', 'ammoniac', 'ammonium', 'hammock', 'hammocks',
      'mammoth', 'mammoths', 'gammon', 'gammons', 'shammos'],
  }),
  T('drown', 'violence', {                                // whole word; no carrier
    also: ['drowns', 'drowned', 'drowning', 'drownings'],
    overBroad: ['drown (as in "drowned in butter") — cooking prose is unaffected, proseOk ignores tone'],
  }),
];

/**
 * Death and its mechanics. The TONE line, stated once:
 *
 * A cozy game may be ABOUT death — Lexicon Manor is a mystery in a house full
 * of the friendly dead, and Ellery says "thirty years dead" in her own voice.
 * What it may not do is hand the player CORPSE or HEARSE as a word to SPELL
 * and then print it back to her as a trophy. So this family gates DISPLAY
 * words and does not touch authored prose (`proseOk` ignores tone entirely).
 */
const DEATH: readonly Rule[] = [
  T('corpse', 'death', { embedded: true }),
  T('cadaver', 'death', { embedded: true }),
  T('carcass', 'death', { embedded: true, also: ['carcase', 'carcases'] }),
  T('morgue', 'death', { embedded: true }),
  T('mortuary', 'death', { embedded: true, also: ['mortuaries'] }),
  T('coffin', 'death', { embedded: true, innocent: ['coffing', 'scoffing'] }),
  T('casket', 'death', { embedded: true }),
  T('hearse', 'death', { overBroad: ['rehearse is INNOCENT and is not blocked'] }),   // whole word
  T('graveyard', 'death', { embedded: true }),
  T('grave', 'death', {                       // whole word: ENGRAVE, GRAVEL, GRAVELY innocent
    also: ['graves', 'gravestone', 'gravestones', 'gravedigger', 'gravediggers'],
    innocent: ['gravy', 'gravies', 'graver', 'gravers', 'gravest', 'graving', 'graved', 'gravid'],
  }),
  T('tomb', 'death', { also: ['tombs', 'tombstone', 'tombstones', 'entomb', 'entombed'] }), // TOMBOLA innocent
  T('crypt', 'death', { also: ['crypts'] }),  // whole word: CRYPTIC, ENCRYPT innocent
  T('funeral', 'death', { embedded: true }),
  T('cremat', 'death', { embedded: true }),
  T('embalm', 'death', { embedded: true }),
  T('autopsy', 'death', { embedded: true, also: ['autopsies'] }),
  T('undertaker', 'death', { embedded: true }),
  T('dead', 'death', {                        // whole word: DEADLINE, DEADBOLT innocent (see rationale)
    also: ['deadly', 'deadlier', 'deadliest', 'deadness', 'undead', 'deadbeat'],
  }),
  T('death', 'death', { also: ['deaths', 'deathly', 'deathbed', 'deathbeds', 'deathtrap'] }),
  T('die', 'death', {                         // whole word: DIET, DIESEL, LADIES innocent
    also: ['dies', 'died', 'dying', 'diedst'],
    overBroad: ['die (the cube / the stamping tool)'],
  }),
  T('perish', 'death', { also: ['perishes', 'perished', 'perishing'] }),  // IMPERISHABLE innocent
  T('widow', 'death', { also: ['widows', 'widowed', 'widower', 'widowers', 'widowhood'] }),
  T('orphan', 'death', { also: ['orphans', 'orphaned', 'orphanage', 'orphanages'] }),
  T('eulogy', 'death', { embedded: true, also: ['eulogies', 'eulogize'] }),
  T('obituary', 'death', { embedded: true, also: ['obituaries'] }),
  T('grief', 'death', { embedded: true }),
  T('griev', 'death', { embedded: true, overBroad: ['grievance', 'grievances'] }),
  T('mourn', 'death', { embedded: true }),
  T('bereave', 'death', { embedded: true, also: ['bereft'] }),
  T('shroud', 'death', { embedded: true }),
  T('sever', 'death', {                       // SEVERAL, SEVERE innocent
    also: ['severs', 'severed', 'severing'],
    innocent: ['severer', 'severest'],
  }),
];

/** Named diseases, conditions and clinical misery. */
const ILLNESS: readonly Rule[] = [
  T('cancer', 'illness', { embedded: true }),
  T('tumor', 'illness', { embedded: true, also: ['tumour', 'tumours', 'tumorous'] }),
  T('carcinoma', 'illness', { embedded: true }),
  T('melanoma', 'illness', { embedded: true }),
  T('leukemia', 'illness', { embedded: true, also: ['leukaemia', 'leukaemias'] }),
  T('cholera', 'illness', { embedded: true }),
  T('malaria', 'illness', { embedded: true }),
  T('syphilis', 'illness', { embedded: true, also: ['syphilitic'] }),
  T('gonorrhea', 'illness', { embedded: true, also: ['gonorrhoea'] }),
  T('herpes', 'illness', { embedded: true }),
  T('leprosy', 'illness', { embedded: true, also: ['leper', 'lepers', 'leprous'] }),
  T('tuberculo', 'illness', { embedded: true }),
  T('gangrene', 'illness', { embedded: true, also: ['gangrenous'] }),
  T('dementia', 'illness', { embedded: true, also: ['demented'] }),
  T('alzheimer', 'illness', { embedded: true }),
  T('plague', 'illness', { embedded: true }),
  T('polio', 'illness', { also: ['polios', 'poliomyelitis'] }),
  T('rabies', 'illness', { embedded: true, also: ['rabid'], innocent: ['kohlrabies'] }),
  T('ebola', 'illness', { embedded: true }),
  T('anemia', 'illness', { embedded: true, also: ['anaemia', 'anaemias', 'anaemic', 'anemic'] }),
  T('amnesia', 'illness', { embedded: true, also: ['amnesiac'] }),
  T('alopecia', 'illness', { embedded: true }),
  T('glaucoma', 'illness', { embedded: true }),
  T('migraine', 'illness', { embedded: true }),
  T('hernia', 'illness', { embedded: true }),
  T('angina', 'illness', { embedded: true }),
  T('edema', 'illness', {
    embedded: true, also: ['oedema', 'oedemas'],
    innocent: ['bedeman', 'redemand', 'redemanded', 'redemanding', 'redemands'],
  }),
  T('enema', 'illness', { embedded: true }),
  T('apnea', 'illness', { embedded: true, also: ['apnoea'] }),
  T('ulcer', 'illness', { embedded: true }),
  T('abscess', 'illness', { embedded: true }),
  T('sepsis', 'illness', {
    embedded: true, also: ['septic', 'septicemia'],
    innocent: ['antisepsis', 'asepsis'],
  }),
  T('lesion', 'illness', { embedded: true }),
  T('coma', 'illness', {                      // whole word: COMATOSE kept out too; COMB innocent
    also: ['comas', 'comatose'],
  }),
  T('seizure', 'illness', { embedded: true }),
  T('paralys', 'illness', { embedded: true, also: ['paralyze', 'paralyzed', 'paralytic', 'paralyse', 'paralysed'] }),
  T('amputat', 'illness', { embedded: true, also: ['amputee', 'amputees'] }),
  T('obese', 'illness', { embedded: true, also: ['obesity', 'obesities'] }),
  T('senile', 'illness', { embedded: true, also: ['senility'] }),
  T('nausea', 'illness', { embedded: true }),
  T('incontinence', 'illness', { embedded: true, also: ['incontinent'] }),
  T('emaciat', 'illness', { embedded: true }),
  T('decrepit', 'illness', { embedded: true }),
  T('manic', 'illness', {                     // whole word: MECHANIC, GERMANIC, TALISMANIC innocent
    also: ['mania', 'manias', 'maniac', 'maniacs', 'maniacal'],
  }),
  T('sick', 'illness', { also: ['sicker', 'sickest', 'sickly', 'sickness', 'sicknesses', 'sickbed', 'airsick', 'seasick'] }),
  T('ill', 'illness', {                       // whole word: STILL, HILL innocent
    also: ['ills', 'illness', 'illnesses'],
    innocent: ['illation', 'illations', 'illy'],
  }),
  T('ail', 'illness', { also: ['ails', 'ailed', 'ailing', 'ailment', 'ailments'] }),
  T('disease', 'illness', { embedded: true }),
  T('wound', 'illness', {                     // whole word: only the injury sense inflects here
    also: ['wounds', 'wounded', 'wounding'],
    overBroad: ['wound (past tense of wind)'],
  }),
  T('bleed', 'illness', { also: ['bleeds', 'bleeding', 'bled', 'bloodbath', 'bloodshed'] }),
  T('scar', 'illness', {                      // SCARE, SCARCE, SCARF innocent
    also: ['scars', 'scarred', 'scarring'],
    innocent: ['scared', 'scarer', 'scarers', 'scaring', 'scary', 'scarier', 'scariest', 'scarry', 'scarest'],
  }),
];

/** Bodily waste and crude bodily function. */
const BODILY: readonly Rule[] = [
  T('urine', 'bodily', {
    embedded: true, also: ['urinal', 'urinals'],
    innocent: [
      'aventurine', 'aventurines', 'dourine', 'dourines', 'figurine', 'figurines',
      'lemurine', 'mercaptopurine', 'mercaptopurines', 'murine', 'murines',
      'neurine', 'neurines', 'purine', 'purines', 'sciurine', 'sciurines',
      'tambourine', 'tambourines', 'taurine', 'taurines', 'vulturine',
    ],
  }),
  T('urinat', 'bodily', { embedded: true }),
  T('defecat', 'bodily', { embedded: true }),
  T('excrement', 'bodily', { embedded: true, also: ['excreta'] }),
  T('feces', 'bodily', { embedded: true, also: ['faeces', 'fecal', 'faecal'] }),
  T('diarrhea', 'bodily', { embedded: true, also: ['diarrhoea'] }),
  T('vomit', 'bodily', { embedded: true }),
  T('puke', 'bodily', { also: ['pukes', 'puked', 'puking'] }),
  T('poop', 'bodily', { also: ['poops', 'pooped', 'pooping'] }),
  T('pee', 'bodily', {                        // PEEL, PEEK, PEER innocent
    also: ['pees', 'peed', 'peeing'],
    innocent: ['peer', 'peers'],
  }),
  T('snot', 'bodily', { also: ['snots', 'snotty', 'snottier'] }),
  T('phlegm', 'bodily', { embedded: true, overBroad: ['phlegmatic'] }),
  T('mucus', 'bodily', { embedded: true }),
  T('pus', 'bodily', { also: ['puses'] }),    // whole word: CAMPUS, OCTOPUS, PUSH innocent
  T('dung', 'bodily', { also: ['dungs', 'dunghill'] }),  // DUNGEON, DUNGAREE innocent
  T('manure', 'bodily', { embedded: true }),
  // NOT gated: WART / WARTS / WARTY. Unlovely, not unkind, and squarely
  // fairy-tale furniture ("warts and all", a witch's wart, a toad's). The
  // Library's Semordnilaps board needs WARTS because it reverses to STRAW.
  T('scab', 'bodily', { also: ['scabs', 'scabby'] }),
  T('lice', 'bodily', { overBroad: ['lice (the insect)'] }),  // POLICE, SLICE innocent
  T('busty', 'bodily', { embedded: true }),
];

/** Hard drugs and intoxication. Wine and beer are cozy; addiction is not. */
const INTOXICANT: readonly Rule[] = [
  T('heroin', 'intoxicant', {                 // whole word: HEROINE is innocent and kept
    also: ['heroins', 'heroinism'],
    innocent: ['heroine', 'heroines', 'antiheroine', 'antiheroines', 'superheroine', 'superheroines'],
  }),
  T('cocaine', 'intoxicant', { embedded: true }),
  T('methamphet', 'intoxicant', { embedded: true }),
  T('narcotic', 'intoxicant', { embedded: true }),
  T('opium', 'intoxicant', {
    embedded: true, also: ['opiate', 'opiates'],
    innocent: ['europium', 'europiums'],
  }),
  T('morphine', 'intoxicant', { embedded: true }),
  T('marijuana', 'intoxicant', { embedded: true }),
  T('hashish', 'intoxicant', { embedded: true }),
  T('junkie', 'intoxicant', {                 // JUNKIER/JUNKIEST from JUNKY are innocent
    also: ['junkies'],
    innocent: ['junkier', 'junkiest'],
  }),
  T('addict', 'intoxicant', { embedded: true }),
  T('overdos', 'intoxicant', { embedded: true }),
  T('stoner', 'intoxicant', { also: ['stoners'] }),
  T('drunk', 'intoxicant', { also: ['drunks', 'drunken', 'drunkard', 'drunkards', 'drunkenness'] }),
  T('booze', 'intoxicant', { also: ['boozes', 'boozed', 'boozy', 'boozer', 'boozers'] }),
  T('nicotine', 'intoxicant', { embedded: true }),
  T('cigarette', 'intoxicant', { embedded: true, also: ['cigaret', 'cigarets'] }),
  T('rehab', 'intoxicant', { also: ['rehabs'] }),
  T('meth', 'intoxicant', { also: ['meths'] }),  // whole word: METHOD, METHYL innocent
  T('dope', 'intoxicant', { also: ['dopes', 'doped', 'doping'] }),
  T('coke', 'intoxicant', { also: ['cokes'] }),
];

/** Plain unkindness — words whose only job is to demean. */
const DEROGATORY: readonly Rule[] = [
  T('hick', 'derogatory', { also: ['hicks'] }),      // CHICK, THICKET innocent
  T('redneck', 'derogatory', { embedded: true }),
  T('hag', 'derogatory', { also: ['hags', 'haggish'] }),  // SHAG, HAGGIS innocent
  T('slum', 'derogatory', { also: ['slums', 'slummy'] }),
  T('ghetto', 'derogatory', { embedded: true }),
  T('scum', 'derogatory', { also: ['scums', 'scummy'] }),
  T('wretch', 'derogatory', { embedded: true }),
  T('vermin', 'derogatory', {
    embedded: true,
    innocent: ['overmine', 'overmined', 'overmines', 'overmining'],
  }),
  T('savage', 'derogatory', { embedded: true, overBroad: ['savage (the adjective)'] }),
  T('shag', 'derogatory', { also: ['shags', 'shagged', 'shagging'], overBroad: ['shag (the carpet / the bird)'] }),
  T('sod', 'derogatory', { also: ['sods', 'sodding'], overBroad: ['sod (turf)'] }),
  T('damn', 'derogatory', { also: ['damns', 'damned', 'damning', 'damnation', 'goddamn'] }),
  T('hell', 'derogatory', { also: ['hells', 'hellish'] }),  // SHELL, HELLO, OTHELLO innocent
  T('hades', 'derogatory'),
  T('idiot', 'derogatory', { embedded: true }),
  T('cull', 'derogatory', { also: ['culls', 'culled', 'culling'] }),
  T('demise', 'derogatory', {
    embedded: true,
    innocent: ['demisemiquaver', 'demisemiquavers', 'hemidemisemiquaver', 'hemidemisemiquavers'],
  }),
  T('malice', 'derogatory', { embedded: true, also: ['malicious'] }),
  T('lament', 'derogatory', {                 // whole word: FILAMENT, MONOFILAMENT innocent
    also: ['laments', 'lamented', 'lamenting', 'lamentable', 'lamentably', 'lamentation', 'lamentations'],
  }),
  T('dread', 'derogatory', { also: ['dreads', 'dreaded', 'dreadful'] }),
  T('moan', 'derogatory', { also: ['moans', 'moaned', 'moaning'] }),
  T('cruel', 'derogatory', { also: ['cruelly', 'cruelty', 'cruelties', 'crueler', 'cruelest'] }),
  T('grim', 'derogatory', {                   // GRIME, GRIN innocent
    also: ['grimly', 'grimmer', 'grimmest', 'grimness'],
    innocent: ['grimed', 'griming', 'grimy', 'grimier', 'grimiest'],
  }),
  T('impotent', 'derogatory', { embedded: true, also: ['impotence'] }),
  T('abort', 'derogatory', { embedded: true }),
  T('decimate', 'derogatory', { embedded: true }),
  T('loss', 'derogatory', { also: ['losses'] }),   // GLOSS, FLOSS innocent
  T('hurt', 'derogatory', { also: ['hurts', 'hurting', 'hurtful'] }),
  T('pain', 'derogatory', { also: ['pains', 'pained', 'painful'], overBroad: ['pain (as in painstaking)'] }),
  T('drug', 'derogatory', { also: ['drugs', 'drugged', 'drugging'] }),
  T('pill', 'derogatory', { also: ['pills'], overBroad: ['pill (the medicine)'] }),
  T('gob', 'derogatory', { also: ['gobs'], innocent: ['goby', 'gobies'] }),
  T('shank', 'derogatory', { also: ['shanks', 'shanked'] }),

  /* ── ROUND 16, same independent re-audit (see the VIOLENCE tail) ─────────
   * HATE was gated in round 15, but in `content/generate-gate.ts`'s legacy
   * lemma list rather than here — so HATERS shipped twice as a twistle
   * target, which is exactly the inflection hole this file was built to
   * close, reproduced one file over. The family belongs in the lexicon.
   * CONTEMPT is the same register as CRUEL and MALICE, which are already
   * here, and shipped once as a twistle target.
   */
  T('hate', 'derogatory', {                    // whole word: WHATEVER, CHATEAU innocent
    also: ['hates', 'hated', 'hating', 'hateful', 'hatefully', 'hater', 'haters', 'hatred'],
  }),
  T('contempt', 'derogatory', {                // whole word; no enable1 carrier
    also: ['contempts', 'contemptuous', 'contemptuously', 'contemptible', 'contemptibly'],
  }),
];

export const RULES: readonly Rule[] = [
  ...SLUR_RACE, ...SLUR_DISABILITY, ...SLUR_SEXUALITY,
  ...PROFANITY, ...SEXUAL, ...SEXUAL_VIOLENCE, ...SELF_HARM, ...ATROCITY,
  ...VIOLENCE, ...DEATH, ...ILLNESS, ...BODILY, ...INTOXICANT, ...DEROGATORY,
];

/* ------------------------------------------------------------------ */
/* Deliberate allowances — the borderline calls, on the record          */
/* ------------------------------------------------------------------ */

/**
 * Words that LOOK like they belong on a list above and are deliberately NOT
 * blocked. Recorded here because an unexplained allowance is indistinguishable
 * from an oversight, and the round-13 escape ("found it, left it") is what this
 * whole file exists to prevent. Every entry is a judgment the owner can reverse
 * by moving one line.
 *
 * `tests/content-safety.test.ts` asserts each of these still passes the gate,
 * so a future rule that quietly swallows one of them fails the build and
 * forces the conversation.
 */
export const ALLOWED_WITH_RATIONALE: readonly { word: string; why: string }[] = [
  { word: 'grief', why: 'Blocked as a DISPLAY word, allowed in authored PROSE. Volume 1 is a mystery about a lexicographer who erased a word out of grief; Ellery, Fern, Posy and the Portrait each name it. Prose is disambiguated by its sentence; a bare tile is not.' },
  { word: 'mourn', why: 'Same split as GRIEF. The Study\'s Forgotten Word poems are the best writing in the game (AAA 3.7) and elegiac register is part of that. Never a spelling target.' },
  { word: 'spade', why: 'NOT blocked at all. In a manor with a garden and a card room, the tool and the suit are the only senses the content can produce; the slur sense requires a context this game never supplies. Blocking it would cost the Potting Shed its most obvious noun.' },
  { word: 'tart', why: 'NOT blocked. Twenty appearances, and the Gallery/Conservatory context is a bakery case. The pejorative sense is archaic British slang and is not what a player reads beside ECLAIR and MACARON.' },
  { word: 'pansy', why: 'NOT blocked. Ships inside "Garden Flowers" beside PEONY, DAHLIA and MARIGOLD, which is as unambiguous as context gets. The slur sense exists; the theme forecloses it.' },
  { word: 'knife', why: 'NOT blocked. Ships inside "Kitchen Utensils" beside SPOON, FORK and LADLE. Weapons are gated; cutlery is not.' },
  { word: 'scythe', why: 'NOT blocked, with SCALPEL. Both are tools — a hay scythe on grounds Fern keeps, a surgical blade — and neither is an instrument of killing the way GRENADE and REVOLVER are. They ship inside the Silent-"C" and Hidden-Body-Parts wordplay groups.' },
  { word: 'lychgate', why: 'NOT blocked. It is a Forgotten Word HEADWORD — the roofed gate of a churchyard — and exactly the archaic, tender register the Study exists for. The death family gates HEARSE and MORGUE; it does not get to eat the vocabulary the Study is built on.' },
  { word: 'devil', why: 'NOT blocked, with DEVILLED and DEVILISH. Deviled eggs and devilled kidneys are cozy nouns and the folkloric devil is furniture in a haunted manor, not cruelty.' },
  /* ROUND 16 — the judgment calls the independent re-audit surfaced and did
   * NOT act on. Each is a whole-word hit against a freshly composed offensive
   * term list, kept because the innocent reading is the only one this content
   * can produce. Recorded so the next audit finds an argument rather than a
   * silence. */
  { word: 'aids', why: 'NOT blocked. The plural of AID — a hearing aid, a first aid, "it aids the digestion". The disease is an acronym and is never lower-cased in the sense that matters; every word game of any size ships this. Six twistle boards. Reversing it costs the pools an ordinary four-letter word and buys nothing a player would notice. Flagged for the owner as the one I am least sure of.' },
  { word: 'shoot', why: 'NOT blocked, with SHOOTS. In a house with a potting shed and a gardener the dominant reading is a green shoot; the firearm family (GUN, RIFLE, PISTOL, BULLET, AMMO) is gated stem by stem, which is where the violence actually lives.' },
  { word: 'stripper', why: 'NOT blocked. A paint stripper and a wallpaper stripper are manor tools and the word ships once, as a twistle target beside ordinary vocabulary. The sexual family gates the words that carry the other sense unambiguously.' },
  { word: 'thong', why: 'NOT blocked. A leather thong is a strap and a sandal, both older and both more likely in this vocabulary than the garment; LINGERIE and NEGLIGEE are gated, which is where the register actually changes.' },
  { word: 'ugly', why: 'NOT blocked, with UGLIER and UGLIEST. Plain descriptive English and the Study uses it well ("usually ugly, always small" — the KEEPSAKE riddle). The derogatory family gates words aimed AT somebody; this one is aimed at a button.' },
  { word: 'curse', why: 'NOT blocked, with CURSED and CURSES. Judgment call, recorded because an unexplained allowance is indistinguishable from an oversight. A haunted manor is a place where things are cursed; the word is folkloric furniture in the same register as DEVIL and GHOST, not an insult aimed at anybody, and the profanity family gates the words a curse is actually made of. Ships x6 as a twistle target. One line in TONE_WORDS reverses it.' },
  { word: 'hang', why: 'NOT blocked, with HANGER, HANGING and OVERHANG. In a manor the dominant reading is a picture on a wall — the Gallery hangs its own sheets — and the execution sense needs a context this content never supplies. Gating the stem would take the whole family with it.' },
  { word: 'warts', why: 'NOT blocked. Unlovely, not unkind, and fairy-tale furniture; the Semordnilaps board needs it because it reverses to STRAW.' },
  { word: 'lame', why: 'NOT blocked. Judgment call, flagged for the owner. The ableism-adjacent slang sense is real, but the dominant readings (a lame horse, LAME DUCK as a political idiom, lame the fabric) are ordinary English and the word appears across the pools. If the owner wants it gone it is one line in DEROGATORY.' },
  { word: 'wine', why: 'NOT blocked, with BEER, CIDER and BOURBON. A manor has a cellar; Bramble pours. Intoxication words (DRUNK, BOOZE, STONER, ADDICT) are gated; the drinks themselves are cozy furniture.' },
  { word: 'heroine', why: 'NOT blocked. HEROIN is gated as a whole word precisely so HEROINE, ANTIHEROINE and SUPERHEROINE survive — a library full of novels needs them.' },
  { word: 'rehearse', why: 'NOT blocked. HEARSE is gated as a whole word only, for exactly this reason.' },
  { word: 'deadline', why: 'NOT blocked, with DEADBOLT and DEADLOCK. DEAD is gated as a whole word; the compounds are ordinary and carry none of the sense.' },
  { word: 'grievance', why: 'Collateral of the GRIEV family and knowingly accepted for display surfaces. Fern files one against Dewey in authored prose, which proseOk permits.' },
  { word: 'skeleton', why: 'NOT blocked, with SKULL, GHOST, WEREWOLF and VAMPIRE. Cozy-gothic furniture in a haunted manor whose librarian is herself a ghost; none of them is a death MECHANIC the way HEARSE and MORGUE are.' },
  { word: 'sanctum', why: 'NOT blocked. The name of the room the whole volume climbs toward, and a word the manor prints in its own chrome — nothing in the illness or death families may ever reach it.' },
  { word: 'bulletin', why: 'NOT blocked. BULLET is gated as a whole word; the noticeboard survives.' },
  { word: 'prickle', why: 'NOT blocked, with PRICKLY and PINPRICK. PRICK is gated as a whole word; the holly bush is not.' },
  { word: 'thatcher', why: 'NOT blocked, with FOWLER, HARPER, PALMER, BAILEY, MORRIS, NELSON, HOMER and HECTOR. the NAME_BLOCKLIST rule is that a dominant everyday-noun reading keeps a word off it, and each of these is a trade, a tool, a verb, a goose or a wrestling hold before it is anybody — half belong to the manor already.' },
];

/* ------------------------------------------------------------------ */
/* Matcher                                                             */
/* ------------------------------------------------------------------ */

/**
 * Mechanically derived inflections of a stem.
 *
 * Deliberately generous and deliberately dumb: it over-generates non-words
 * (KILLEST, GRIMING), which costs nothing — a blocklist entry that matches no
 * English word is inert — and it under-generates nothing that matters, because
 * irregulars go in `also`. This is the fix for the inflection hole that let
 * MURDERER ship after `murder` was already gated.
 */
function inflect(stem: string): string[] {
  const out = new Set<string>([stem]);
  const last = stem.at(-1) ?? '';
  const sibilant = /(s|x|z|ch|sh)$/.test(stem);
  out.add(stem + (sibilant ? 'es' : 's'));
  if (last === 'y') {
    const base = stem.slice(0, -1);
    out.add(base + 'ies'); out.add(base + 'ied'); out.add(base + 'ier'); out.add(base + 'iest');
    out.add(base + 'ily'); out.add(base + 'iness');
  }
  if (last === 'e') {
    const base = stem.slice(0, -1);
    for (const s of ['ed', 'es', 'ing', 'er', 'ers', 'est', 'y', 'ish', 'ist', 'ists', 'ism']) out.add(base + s);
  } else {
    for (const s of ['ed', 'ing', 'er', 'ers', 'est', 'y', 'ly', 'ness', 'ish', 'ist', 'ists', 'ism', 'ation', 'ations']) {
      out.add(stem + s);
    }
    // Consonant doubling (STAB -> STABBED), skipped after a vowel pair or a 'w'/'x'/'y'.
    if (/[^aeiou][aeiou][bdgklmnprtvz]$/.test(stem)) {
      for (const s of ['ed', 'ing', 'er', 'ers', 'y', 'est']) out.add(stem + last + s);
    }
  }
  return [...out];
}

interface Compiled {
  readonly exact: Map<string, Rule>;
  readonly embedded: readonly Rule[];
}

function compile(rules: readonly Rule[]): Compiled {
  const exact = new Map<string, Rule>();
  const embedded: Rule[] = [];
  for (const rule of rules) {
    if (rule.embedded) embedded.push(rule);
    else for (const w of inflect(rule.stem)) if (!exact.has(w)) exact.set(w, rule);
    for (const w of rule.also ?? []) {
      if (/^[a-z]+$/.test(w) && !exact.has(w)) exact.set(w, rule);
    }
  }
  // Innocent carriers win over their own rule and over any exact entry.
  const innocent = new Set<string>();
  for (const rule of rules) for (const w of rule.innocent ?? []) innocent.add(w);
  for (const w of innocent) exact.delete(w);
  return { exact, embedded };
}

const SAFETY_RULES = RULES.filter((r) => r.standard === 'safety');
const ALL = compile(RULES);
const SAFETY_ONLY = compile(SAFETY_RULES);
const INNOCENT = new Set<string>(RULES.flatMap((r) => [...(r.innocent ?? [])]));

/**
 * Safety categories whose members are unambiguous in ANY context, including
 * inside an authored sentence. Excludes the homograph-bearing profanity and
 * anatomy rules (PRICK, COCK, TIT, ASS, SEX, RAPE, ARSE), which are gated on
 * display surfaces but must not red-flag "too blunt to prick" in a Forgotten
 * Word poem. A slur has no such carve-out and is on this list unconditionally.
 */
const PROSE_UNSAFE = compile(SAFETY_RULES.filter((r) => {
  if (r.category === 'slur-race-ethnicity') return r.stem !== 'chink' && r.stem !== 'coon' && r.stem !== 'gyp';
  if (r.category === 'slur-disability') return r.stem !== 'dumb' && r.stem !== 'psycho';
  if (r.category === 'slur-sexuality-gender') return r.stem !== 'fag' && r.stem !== 'dike' && r.stem !== 'queer';
  if (r.category === 'sexual-violence') return r.stem !== 'rape';
  // Historical prose may name an atrocity factually — the Study's etymology for
  // AMANUENSIS is literally "the household slave who served at the hand". The
  // display gate still keeps SLAVE off every board.
  if (r.category === 'atrocity') return !['slavery', 'racism', 'sexist'].includes(r.stem);
  if (r.category === 'profanity') {
    return !['prick', 'cock', 'ass', 'arse', 'git', 'bitch', 'bastard', 'crap'].includes(r.stem);
  }
  if (r.category === 'sexual-crudity') {
    return !['tit', 'sex', 'anal', 'anus', 'horny', 'arousal', 'nudist', 'erotic'].includes(r.stem);
  }
  return true;
}));

function hit(word: string, table: Compiled): Rule | null {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return null;
  if (INNOCENT.has(w)) return null;
  const exact = table.exact.get(w);
  if (exact) return exact;
  for (const rule of table.embedded) {
    if (w.includes(rule.stem) && !(rule.innocent ?? []).includes(w)) return rule;
  }
  return null;
}

/** The rule a word trips, or null. Full standard (safety + tone). */
export function offenceOf(word: string): Rule | null {
  return hit(word, ALL);
}

/** The SAFETY rule a word trips, or null. Absolute standard, no tone. */
export function safetyOffenceOf(word: string): Rule | null {
  return hit(word, SAFETY_ONLY);
}

/** The rule a word trips when it appears INSIDE an authored sentence. */
export function proseOffenceOf(word: string): Rule | null {
  return hit(word, PROSE_UNSAFE);
}

/** True when a word may never ship anywhere. */
export function safetyOk(word: string): boolean {
  return safetyOffenceOf(word) === null;
}

/** True when a word may be printed as the manor's own voice (display surface). */
export function safeAndCozy(word: string): boolean {
  return offenceOf(word) === null;
}

/**
 * Scan a run of authored PROSE. Returns every offending token with its rule.
 * Applies the absolute standard only — tone words are the author's to use.
 */
export function scanProse(text: string): { word: string; rule: Rule }[] {
  const out: { word: string; rule: Rule }[] = [];
  for (const token of text.match(/[A-Za-z][A-Za-z']*/g) ?? []) {
    const rule = proseOffenceOf(token);
    if (rule) out.push({ word: token, rule });
  }
  return out;
}

/** Every stem in the lexicon, for tests and tooling. */
export function allStems(): readonly Rule[] {
  return RULES;
}
