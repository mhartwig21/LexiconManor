/**
 * THE WORD WEB DIFFICULTY LADDER — what a colour band promises, as a number.
 *
 * REVIEW_AA §5.8 filed two charges against the Library and this file answers
 * the second one: *"the difficulty colours are decorative."* They were. The
 * measurement that proved it is in `scripts/wordweb-mechanics.ts`; the spec
 * that fixes it is here, in one place, so the generator that assigns the
 * colours and the test that audits them cannot drift apart.
 *
 * Three things live here and nothing else:
 *   1. the CATEGORY TAXONOMY (template → family), because a category's
 *      difficulty is mostly a fact about which deduction it asks for;
 *   2. LATERAL DISTANCE — the 0–9 measure of how far a group sits from what
 *      its tiles appear to say;
 *   3. the LADDER itself — what each colour promises, and `chooseColours`,
 *      which is now the only code in the repository that decides a group's
 *      colour.
 *
 * Everything here is PURE and takes only a shipped board, so a test can
 * re-ask every question without re-running the generator.
 */
// ---------------------------------------------------------------------------
// The shipped shape (read structurally; this file must not depend on engine types)
// ---------------------------------------------------------------------------

export interface CensusGroup {
  theme: string;
  tier: 'yellow' | 'green' | 'blue' | 'purple';
  words: string[];
  type?: string;
  decoys?: string[];
}
export interface CensusBoard {
  id: string;
  tier: number;
  groups: CensusGroup[];
  ambiguousWords?: string[];
  herrings?: { words: string[]; relation: string }[];
  layout?: string[];
}

/** Straight-quote a theme: the typography pass sets every label in curly quotes. */
export function canonTheme(theme: string): string {
  return theme.replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
}

// ---------------------------------------------------------------------------
// TEMPLATES — the eleven label shapes the review counted, plus what is left
// ---------------------------------------------------------------------------

/**
 * A TEMPLATE is a label FORM: a sentence frame the generator can fill with a
 * token. `Contains "TEN"` and `Contains "CAR"` are one template with two fills.
 * This is the granularity the review counted at and the granularity a player
 * learns to pattern-match on ("find the rhyme group, find the letter-string
 * group, split the remainder").
 */
export const TEMPLATES = [
  'contains',
  'compound-blank',
  'rhymes',
  'silent',
  'add-a-letter',
  'hidden',
  'can-follow',
  'can-precede',
  'homophones',
  'anagrams',
  'drop-a-letter',
] as const;
export type Template = (typeof TEMPLATES)[number] | 'other';

export function templateOf(rawTheme: string): Template {
  const t = canonTheme(rawTheme);
  if (/^Contains /.test(t)) return 'contains';
  if (/^Rhymes with /.test(t)) return 'rhymes';
  if (/^Anagrams of /.test(t)) return 'anagrams';
  if (/^Hidden /.test(t)) return 'hidden';
  if (/^Homophones/.test(t)) return 'homophones';
  if (/^Silent /.test(t)) return 'silent';
  if (/^Add an? /.test(t)) return 'add-a-letter';
  if (/^Drop /.test(t)) return 'drop-a-letter';
  if (/^Can Follow /.test(t)) return 'can-follow';
  if (/^Can Precede /.test(t)) return 'can-precede';
  if (t.includes('___')) return 'compound-blank';
  return 'other';
}

// ---------------------------------------------------------------------------
// FAMILIES — the deduction performed, which is the thing that gets learned
// ---------------------------------------------------------------------------

export type CensusFamily =
  | 'rhyme'
  | 'contains'
  | 'compound'
  | 'silent'
  | 'letter-swap'
  | 'hidden'
  | 'homophone'
  | 'anagram'
  | 'letter-shape'
  | 'semantic'
  | 'trivia';

/**
 * Categories whose thread is a property of the word's SHAPE. Kept as an
 * explicit list rather than a regex because these are named, not framed —
 * there is no token to fill in.
 */
const SHAPE_THEMES = new Set([
  'Palindromes',
  'Semordnilaps',
  'Heteronyms',
  'Contronyms',
  'Contronyms (Own Opposite)',
  'Onomatopoeia',
  'Portmanteau Words',
  'Contains Roman Numerals',
  'Two Pairs of Double Letters',
  'Starts and Ends with the Same Letter',
  // ROUND 13 (REVIEW_AA §5.8) — six mechanics that are not one of the eleven
  // templates at all. The shelf's variety problem was partly a supply problem:
  // `letter-shape` was the trick on 12.9% of boards because there were only
  // eight of these to draw on, so the composer reached for a rhyme or a
  // substring instead. Every one is provable on the tile and none of them is a
  // sentence frame with a token dropped into it.
  'Words with All Five Vowels',
  'Letters in Alphabetical Order',
  'Spelled Without a Vowel',
  'Three Vowels in a Row',
  'The Same Letter Three Times',
  'Made of a Repeated Syllable',
]);

/**
 * Crystallized-knowledge categories. Kept in sync with the generator's list by
 * `tests/puzzles/wordweb-mechanics.test.ts`, which fails if the generator gains
 * a trivia theme this file has never heard of.
 */
export const CENSUS_TRIVIA = new Set([
  'Beatles Songs', 'Board Games', 'Broadway Musicals', 'Clue Board Game Weapons',
  'DC Comics Heroes', 'Disney Princess Names', 'Disney Villains',
  'Famous Chrises', 'Famous Davids', 'Famous Jennifers', 'Famous Johns',
  'Famous Michaels', 'Famous Roberts', 'Famous Toms', 'Famous Williams',
  'Friends Characters', 'Genericized Trademarks', 'Greek Gods',
  'Harry Potter Houses', 'Indiana Jones Films', 'James Bond Films',
  'Marvel Avengers', 'Monopoly Properties', 'One-Word Band Names',
  'One-Word Movie Titles', 'One-Word Oscar Winners', 'Pixar Movie Titles',
  'Shakespeare Plays', 'Star Wars Names', 'TV Shows Starting with "The"',
  'Taylor Swift Albums',
]);

export function familyOfTheme(rawTheme: string): CensusFamily {
  const t = canonTheme(rawTheme);
  if (CENSUS_TRIVIA.has(t)) return 'trivia';
  if (SHAPE_THEMES.has(t)) return 'letter-shape';
  switch (templateOf(t)) {
    case 'rhymes': return 'rhyme';
    case 'anagrams': return 'anagram';
    case 'hidden': return 'hidden';
    case 'homophones': return 'homophone';
    case 'silent': return 'silent';
    case 'add-a-letter':
    case 'drop-a-letter': return 'letter-swap';
    case 'contains': return 'contains';
    case 'compound-blank':
    case 'can-follow':
    case 'can-precede': return 'compound';
    default:
      // `Can Be "RUNNING"` (JOKE / WATER / MATE / ORDER) is `RUNNING ___`
      // wearing a different label, and the generator's own `normaliseTheme`
      // already makes that ruling for the `Things That Can Be X` form. It is
      // deliberately NOT one of `TEMPLATES`: the eleven there are the eleven
      // REVIEW_AA counted, and the before/after figures are only comparable
      // if that list does not grow.
      if (/^Can Be /.test(t)) return 'compound';
      return 'semantic';
  }
}

/** The families the anti-wallpaper budget polices. Semantics are the point. */
export const POLICED_FAMILIES: readonly CensusFamily[] = [
  'rhyme', 'contains', 'compound', 'silent', 'letter-swap',
  'hidden', 'homophone', 'anagram', 'letter-shape',
];

/**
 * THE LETTER MECHANICS — the policed families minus `compound`, and the
 * distinction the review's headline number does not make.
 *
 * REVIEW_AA counted `___ X` among its eleven templates, and by the letter of
 * "is this a sentence frame the generator fills with a token" it is one. But
 * the deduction is not the same shape and the difference is the difference
 * between a checklist and a puzzle. Solving `Contains "TEN"` is one skill
 * applied identically every time: scan sixteen tiles for a shared substring.
 * You get better at it once and then you are done, and that is precisely
 * Koster's complaint — *no learnable method, no mastery loop* — arriving from
 * the other direction. Solving `___ BAR` is not a skill you apply, it is a
 * search of English: CANDY, SALAD, SPACE, CROW, and the reason CROW is the
 * trap is that CROWBAR is a real object. The frame recurs; the SEARCH is new
 * every time, because the phrase-space behind each fill is different.
 *
 * This is also the ruling the bar already made — `qualityOf` marks the compound
 * family PROTECTED and AAA 2.9's round-16 ruling says a compound "is read, not
 * decoded" and counts toward the way-in floor. So the census reports both
 * numbers and the budgets police them separately: the eleven-template share
 * (the review's figure, kept honest) and the letter-mechanic share (the one
 * that predicts whether the shelf feels like a checklist).
 */
export const LETTER_MECHANIC_FAMILIES: readonly CensusFamily[] = [
  'rhyme', 'contains', 'silent', 'letter-swap',
  'hidden', 'homophone', 'anagram', 'letter-shape',
];

export function isLetterMechanic(theme: string): boolean {
  return LETTER_MECHANIC_FAMILIES.includes(familyOfTheme(theme));
}

/**
 * The board's ARCHITECTURE: which four deductions it asks for, as a set.
 *
 * The old signature was the four group TYPES read off in colour order
 * (`sswwq`), which stops meaning anything once the colours are assigned from
 * measured difficulty — "plain English first, transformation last" is the
 * promise the ladder now makes, so of course every board says it. What should
 * still vary night to night is WHICH FOUR TRICKS she meets, and that is this.
 */
export function familySignature(groups: readonly { theme: string }[]): string {
  return groups.map((g) => familyOfTheme(g.theme)).sort().join('+');
}

// ---------------------------------------------------------------------------
// LATERAL DISTANCE — what a difficulty colour is supposed to promise
// ---------------------------------------------------------------------------

/**
 * REVIEW_AA §5.8: *"the difficulty colours are decorative."* They were, because
 * nothing measured them. Connections' yellow→purple ladder is a promise about
 * how much LATERAL THINKING a group demands, and lateral distance is the gap
 * between what the tiles look like they say and what the category actually
 * asks. So measure that gap on four independent axes and sum them.
 *
 *   1. READING DISTANCE — do you solve this by reading the words, by looking
 *      at their letters, by saying them aloud, or by transforming them?
 *   2. SURFACE DISTANCE — is the thread in the same place in every word (a
 *      sort), somewhere in every word (a hunt), or nowhere visible (a hearing)?
 *   3. MEANING DISTANCE — do the four tiles mean the same kind of thing on
 *      their face (a taxonomy) or does the category redefine them (`___ BAR`
 *      turns CROW into a phrase)?
 *   4. TRAP LOAD — how many of the group's own words are planted herrings,
 *      i.e. how much the group is actively pulling against another one.
 *
 * The total runs 0–9 and is the only number the colour ladder is allowed to
 * key on. `lateralOf` is pure and takes only the shipped board, so a test can
 * assert the colours against it without re-running the generator.
 */
export interface LateralParts {
  reading: number;
  surface: number;
  meaning: number;
  trap: number;
  total: number;
}

/** The widest total `lateralOf` can return: 3 + 1 + 2 + 2. */
export const LATERAL_MAX = 8;

/** 0 = read it; 1 = look at it; 2 = hear it; 3 = perform an operation on it. */
function readingDistance(theme: string, family: CensusFamily): number {
  switch (family) {
    case 'trivia':
      return 0;
    case 'semantic':
      return 0;
    case 'compound':
      return 1;
    case 'contains':
      return 1;
    case 'letter-shape':
      return canonTheme(theme) === 'Contains Roman Numerals' ? 2 : 2;
    case 'hidden':
      return 2;
    case 'silent':
      return 2;
    case 'rhyme':
      return 2;
    case 'homophone':
      return 3;
    case 'anagram':
      return 3;
    case 'letter-swap':
      return 3;
  }
}

/**
 * 0 = the token sits at the same index in all four (an eye finds it instantly);
 * 1 = the token is present but moves around; 2 = there is no token to find.
 *
 * This is the generator's `visibilityOf` inverted, generalised past `Contains`,
 * and measured from the shipped WORDS rather than from the label — which is the
 * point: a label cannot lie to it.
 */
function surfaceDistance(theme: string, words: readonly string[]): number {
  const t = canonTheme(theme);
  const tok =
    t.match(/^Contains "([A-Z]+)"$/)?.[1] ??
    t.match(/^Hidden .*"([A-Z]+)"$/)?.[1] ??
    null;
  // NO TOKEN AT ALL — `Breakfast Items`, `Rhymes with "SNOW"`, `___ BAR`.
  // This axis measures how hard the thread is to SPOT once you know to look
  // for it, and where there is nothing printed to spot, the axis has nothing
  // to say; it must not become a second charge for difficulty the other two
  // axes have already counted. Scoring it 2 was doing exactly that, and the
  // symptom was specific and repeated: a plain taxonomy came out at 2, a
  // taxonomy with one planted intruder came out at 3, and a PROPERTY category
  // with one intruder came out at 4 — outside yellow's band, on eight boards
  // whose easiest group was `Things That Float`. Neutral is 1.
  if (!tok) return 1;
  const at = words.map((w) => w.indexOf(tok));
  if (at.some((i) => i < 0)) return 1;
  if (words.every((w) => w.startsWith(tok))) return 0;
  if (words.every((w) => w.endsWith(tok))) return 0;
  if (new Set(at).size === 1) return 0;
  return 1;
}

/**
 * 0 = the four words already mean the same kind of thing (`Breakfast Items`);
 * 1 = the category tests them against a property (`Things That Roll`);
 * 2 = the category REDEFINES them — the tile's plain meaning is a decoy
 *     (`___ BAR` makes CROW a crowbar; `Rhymes with "SNOW"` makes THOUGH a
 *     sound). Redefinition is the lateral move Connections' purple lives on.
 *
 * THE POP-OUT EXCEPTION, and it is the whole of AAA 2.12 expressed as a
 * measurement rather than as a special-case rule. Redefinition only costs
 * something if you have to notice it. ELEPHANT / PLEASANT / DISTANT / MERCHANT
 * under `Contains "ANT"` redefines nothing in practice, because you never read
 * those words at all — four tiles ending in the same three letters are a
 * VISUAL event on a 16-tile grid and the eye finds them before the mind
 * arrives. That is exactly why the round-14 shelf had to be policed by a
 * separate `visibilityOf` rule keeping such groups out of purple: the model
 * of the day scored them as lateral when they are the least lateral thing a
 * board can hold. A same-index token pays no meaning cost.
 */
function meaningDistance(theme: string, family: CensusFamily, surface: number): number {
  const t = canonTheme(theme);
  if (family === 'trivia') return 0;
  if (family === 'semantic') return /^Things (That|You) /.test(t) ? 1 : 0;
  if (family === 'compound') return 2;
  // …but the floor is a plain taxonomy, not below it. A pop-out sort is as
  // easy as `Breakfast Items` (both score 2); it is not EASIER than knowing
  // what a waffle is, and scoring it at 1 pushed honest semantic categories
  // out of yellow on boards that carried one.
  if (family === 'contains' && surface === 0) return 1;
  // Every remaining family is a letters-or-sound thread, which by construction
  // ignores what the word means. That IS a redefinition of the tile.
  return 2;
}

/** 0–2: how many of this group's four words the board planted as herrings. */
function trapLoad(words: readonly string[], ambiguous: ReadonlySet<string>): number {
  const n = words.filter((w) => ambiguous.has(w)).length;
  return Math.min(2, n);
}

export function lateralOf(
  group: Pick<CensusGroup, 'theme' | 'words'>,
  ambiguous: ReadonlySet<string>,
): LateralParts {
  const family = familyOfTheme(group.theme);
  const reading = readingDistance(group.theme, family);
  const surface = surfaceDistance(group.theme, group.words);
  const meaning = meaningDistance(group.theme, family, surface);
  const trap = trapLoad(group.words, ambiguous);
  return { reading, surface, meaning, trap, total: reading + surface + meaning + trap };
}

/**
 * The category's own difficulty, before the board plants anything in it.
 *
 * Two callers need this rather than the full total. The COMPOSER needs it while
 * it is still choosing categories — the traps do not exist yet — to know
 * whether the board it is assembling has a way in and a real finish. And the
 * WAY-IN FLOOR is a claim about the category, not about the board's trap
 * budget: a semantic taxonomy is a way in whether or not one of its four words
 * happens to be the night's intruder.
 */
export function intrinsicLateral(group: Pick<CensusGroup, 'theme' | 'words'>): number {
  const family = familyOfTheme(group.theme);
  const surface = surfaceDistance(group.theme, group.words);
  return readingDistance(group.theme, family)
    + surface
    + meaningDistance(group.theme, family, surface);
}

/** A category a player can enter the board through: plain to read, no operation. */
export const WAY_IN_MAX = 3;
/** A category that demands a real transformation — the board's honest finish. */
export const FINISH_MIN = 5;

export function isWayIn(group: Pick<CensusGroup, 'theme' | 'words'>): boolean {
  return intrinsicLateral(group) <= WAY_IN_MAX;
}

// ---------------------------------------------------------------------------
// THE COLOUR LADDER — what each band promises, in lateral distance
// ---------------------------------------------------------------------------

export const SLOTS = ['yellow', 'green', 'blue', 'purple'] as const;
export type Slot = (typeof SLOTS)[number];

/**
 * The promise each colour makes, stated so a player could feel it and a test
 * can check it. Bands are inclusive ranges over `lateralOf().total` (0–8).
 *
 *   YELLOW  "You already know this."  0–3
 *     Read the four tiles and the thread is the thing they plainly are, or a
 *     phrase you have said out loud this month. No operation on the letters.
 *   GREEN   "Look again."             2–5
 *     The thread is visible on the tiles but you have to hunt for it, or it is
 *     a property you test the words against rather than a list they are on.
 *   BLUE    "Say it out loud."        4–7
 *     The thread is not on the page. You hear it, or you notice a word hiding
 *     inside a word. The tiles' plain meanings are now actively misleading.
 *   PURPLE  "Change the word."        5–9
 *     You must perform an operation — add, drop, anagram, re-hear, or re-read
 *     a tile as half of a phrase — before the thread exists at all. And the
 *     board is pulling against you while you do it.
 *
 * The bands OVERLAP by design, and the two middle ones overlap a lot. A hard
 * ladder (0–1/2–3/4–5/6+) would force the generator to fabricate difficulty it
 * does not have and would fail honest boards; what the colours must never do is
 * LIE, and a lie is an inversion — a yellow harder than the board's blue. So
 * the enforceable rule is three-part:
 *
 *   (a) every group sits inside its own colour's band. The two that carry real
 *       weight are the ends: YELLOW ≤ 3 makes the promise that there is a way
 *       into this board without decoding anything, and PURPLE ≥ 5 makes the
 *       promise that the last group is a transformation rather than the
 *       leftovers. Green and blue are deliberately wide, because the model can
 *       honestly tell "plain" from "operation" and cannot honestly tell the
 *       third-hardest category from the second-hardest.
 *   (b) the four totals are non-decreasing yellow → green → blue → purple.
 *   (c) the board climbs: purple − yellow ≥ MIN_LADDER_RISE.
 *
 * (b) and (c) are what the player actually feels. (a) is what stops the ladder
 * from being four flavours of easy stacked in the right order.
 *
 * Round 13 measured the pre-fix shelf against this and the verdict was total:
 * yellow's mean lateral distance was 4.38 and green's was 4.15 — the second
 * band was EASIER than the first — with a purple-minus-yellow spread of 0.33
 * across 156 boards. The colours were not merely uninformative; on average
 * they ran backwards.
 */
export const LATERAL_BANDS: Record<Slot, readonly [number, number]> = {
  yellow: [0, 3],
  green: [1, 5],
  blue: [3, 6],
  purple: [5, 8],
};

/** The minimum climb from the yellow group to the purple one. */
export const MIN_LADDER_RISE = 3;

/**
 * ASSIGN THE FOUR COLOURS FROM THE MEASUREMENT. This is the whole fix for
 * "the difficulty colours are decorative", and it is one function.
 *
 * Before round 13 a board's colours came out of the authored JSON and were then
 * shuffled by three separate heuristics — a `SLOT_SWAPS` table that traded two
 * colours for novelty, a `repairLoudSlots` pass that moved bare prefix sorts
 * out of purple, and a rule pinning trivia to yellow. Each was right about a
 * symptom and none of them measured anything, which is why the shipped ladder
 * ran backwards on average. All three are subsumed here: a trivia category
 * scores 2 and lands at yellow because it IS the easiest thing on the board; a
 * bare prefix sort scores 3 and lands at yellow or green for the same reason.
 *
 * Ties are broken toward the reading a player would make, then deterministically
 * by label so the pool is reproducible from the seed.
 */
export function chooseColours<G extends Pick<CensusGroup, 'theme' | 'words'>>(
  groups: readonly G[],
  ambiguous: ReadonlySet<string>,
): Slot[] {
  const ranked = groups
    .map((g, i) => ({
      i,
      total: lateralOf(g, ambiguous).total,
      intrinsic: intrinsicLateral(g),
      trivia: familyOfTheme(g.theme) === 'trivia' ? 0 : 1,
      theme: canonTheme(g.theme),
    }))
    .sort(
      (a, b) =>
        // AAA 2.9 pins the trivia gimme to the easiest tier UNCONDITIONALLY,
        // and this is now the only line in the repository that does it. It
        // sorts ahead of the measurement rather than inside it because a
        // knowledge category is a gimme for a reason the model does not see:
        // you either know Disney villains or you do not, and if you do it is
        // free whatever the board plants in it. (Left as a tie-break it lost
        // yellow on three boards the moment a trap landed in the gimme.)
        a.trivia - b.trivia
        || a.total - b.total
        // A trapped taxonomy and an untrapped compound can both score 4; the
        // taxonomy is still the one she reads first.
        || a.intrinsic - b.intrinsic
        || (a.theme < b.theme ? -1 : a.theme > b.theme ? 1 : 0),
    );
  const out: Slot[] = new Array(groups.length).fill('yellow');
  ranked.forEach((r, k) => { out[r.i] = SLOTS[Math.min(k, SLOTS.length - 1)]!; });
  return out;
}

export interface LadderProblem {
  boardId: string;
  kind: 'band' | 'inversion' | 'flat';
  detail: string;
}

/** Every way this board's colours fail to describe its own difficulty. */
export function ladderProblems(board: CensusBoard): LadderProblem[] {
  const out: LadderProblem[] = [];
  const ambiguous = new Set(board.ambiguousWords ?? []);
  const bySlot = new Map<Slot, LateralParts>();
  for (const g of board.groups) bySlot.set(g.tier, lateralOf(g, ambiguous));

  for (const g of board.groups) {
    const parts = bySlot.get(g.tier)!;
    const [lo, hi] = LATERAL_BANDS[g.tier];
    if (parts.total < lo || parts.total > hi) {
      out.push({
        boardId: board.id,
        kind: 'band',
        detail: `${g.tier} "${g.theme}" scores ${parts.total}, band is ${lo}–${hi}`,
      });
    }
  }

  const seq: (number | null)[] = SLOTS.map((s) => bySlot.get(s)?.total ?? null);
  for (let i = 1; i < seq.length; i += 1) {
    const prev = seq[i - 1];
    const cur = seq[i];
    if (prev === null || cur === null || prev === undefined || cur === undefined) continue;
    if (cur < prev) {
      out.push({
        boardId: board.id,
        kind: 'inversion',
        detail: `${SLOTS[i]} (${cur}) is easier than ${SLOTS[i - 1]} (${prev})`,
      });
    }
  }

  const y = seq[0];
  const p = seq[3];
  if (y != null && p != null && p - y < MIN_LADDER_RISE) {
    out.push({
      boardId: board.id,
      kind: 'flat',
      detail: `purple (${p}) − yellow (${y}) = ${p - y}, needs ≥ ${MIN_LADDER_RISE}`,
    });
  }
  return out;
}
