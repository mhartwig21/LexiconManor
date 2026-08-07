import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRng, pick, shuffle } from '../src/engine/rng';
import { loadPhonetics } from './lib/phonetics';
import { toneOk } from './generate-gate';
import { typesetDeep } from './lib/typography';
import { tierLabel } from '../src/engine/rooms/adapters/tier-select';
import type { Tier, WordWebPuzzle } from '../src/engine/types';

/**
 * The Library's Word Web generator — the fairness pass Connections never had
 * (AAA 2.6–2.11, BENCHMARKS §"our two structural fixes").
 *
 * ---------------------------------------------------------------------------
 * THREE TIERS, MAPPED TO MANOR ROWS (owner directive, round 4: "tier-3 boards
 * use tighter red-herring budgets + subtler categories")
 * ---------------------------------------------------------------------------
 * `tier` (1|2|3 ⇢ rows 0–2 / 3–4 / 5–6) is the one authoritative field. (The
 * old `difficulty` display alias is retired — derive a word from the tier with
 * `tierLabel()` if one is ever wanted; the per-board `difficulty` in
 * authored/word-web-boards.json is authoring INTENT, a different thing.) Two
 * structural knobs, both build-enforced:
 *
 *   1. THE HERRING BUDGET TIGHTENS AS YOU CLIMB. "Tighter" is read as *the
 *      traps get tighter*, not fewer: the solver scores every planted herring,
 *      and each tier sets both a cap and a MINIMUM TIGHTNESS. Tier 1 ships at
 *      most one loose trap (a near-clean board); tier 3 must ship 2–3 traps
 *      and every one of them must score ≥ HERRING_TIGHT — a real 5th-member or
 *      cross-category pull, not a coincidence. A board that cannot meet its
 *      tier's bar is demoted, never faked.
 *   2. CATEGORIES GET SUBTLER. Tier 1 keeps its trivia gimme (≤1, always at
 *      the yellow tier, per AAA 2.9). Tier 3 forbids trivia outright and
 *      requires ≥2 SUBTLE categories — wordplay you have to hear or unscramble
 *      (rhymes, anagrams, silent letters, hidden words, heteronyms) rather than
 *      the blunt substring/compound kind ("Contains TEN", "___ FIRE") that
 *      reads straight off the tiles.
 *
 * Input:  content/authored/word-web-boards.json (the curated legacy boards).
 * Output: content/generated/word-web.json, each board enriched with:
 *   - `type` per group (semantic / trivia / wordplay) and 2.9 enforcement:
 *     ≤1 trivia category per board, ALWAYS at the easiest tier (yellow),
 *     ≥2 categories solvable purely from letters/wordplay on the tiles
 *     (excess trivia / thin semantics are swapped for bank wordplay groups);
 *   - a red-herring budget (2.7/2.8): a build-time solver enumerates
 *     unintended 4-groupings under affix / doubled-letter / rhyme /
 *     cross-board-semantic heuristics and FAILS THE BUILD on any complete
 *     unintended grouping; planted herrings (≤3, 5th-member or cross-category
 *     traps) are emitted as `ambiguousWords`;
 *   - ROUND 7 (AAA 2.10 [BEAT]): the trap is emitted WITH ITS RELATION —
 *     `herrings: [{ words, relation, detail }]`, relation ∈ rhyme /
 *     shared-affix / doubled-letter / semantic. `ambiguousWords` (the flat
 *     intruder list the layout clusters on) is derived from it and unchanged.
 *     Without the relation the room could only say "no": the acknowledged-
 *     herring line named neither the words nor the thread, so a −2-step guess
 *     bought nothing the shake had not already said. The bar's own example
 *     ("they *do* all rhyme, don't they?") is informative BECAUSE it names the
 *     relation. Every tier now also carries a floor of ≥1 trap (tier 1 used to
 *     ship `minHerrings: 0`, and 22 of 55 boards had an empty trap list — on
 *     40% of nights the one channel meant to beat Connections was dead);
 *   - an adversarial opening `layout` (2.6): herrings clustered adjacently,
 *     no gift rows (no row holds 3+ of one group);
 *   - two plausible same-tier `decoys` per group for the 2.11 act of naming.
 *
 * Run:    npx tsx content/generate-wordweb.ts
 * Author: npx tsx content/generate-wordweb.ts --report
 *
 * `--report` is the authoring loop (round 10, the 51 → 150 board expansion).
 * The build is a hard fail by design — an unintended complete grouping is not
 * a warning — but a hard fail is useless feedback when you are writing forty
 * boards at a sitting: it names the first sixteen problems and stops. Report
 * mode diagnoses EVERY authored board against its intended tier without
 * throwing (tone gate, unintended groupings, category composition, measured
 * trap tightness) so a board can be fixed where it was written.
 */

const SEED = 20260801;

// ---------------------------------------------------------------------------
// Category taxonomy (2.9). Every theme MUST be tagged; unknown themes fail.
// ---------------------------------------------------------------------------

type GroupType = 'semantic' | 'trivia' | 'wordplay';

/** Franchise / proper-noun / crystallized-knowledge categories. */
const TRIVIA_THEMES = new Set([
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

/** Letters-visible / word-property categories beyond the pattern rules below. */
const WORDPLAY_THEMES = new Set([
  'Palindromes', 'Semordnilaps', 'Heteronyms', 'Contronyms',
  'Contronyms (Own Opposite)', 'Onomatopoeia', 'Portmanteau Words',
  'Contains Roman Numerals', 'Hidden Numbers (Spelled Out)',
  'Things That Can Be "Iron"',
]);

/**
 * ROUND 10 BUG FIX — the round-6 typography pass set every authored theme in
 * curly quotes, and the three theme SETS above are written with straight ones.
 * From that moment `TRIVIA_THEMES.has('TV Shows Starting with “The”')` was
 * false, so that category shipped tagged `semantic`: it dodged the 2.9 trivia
 * cap, dodged the trivia-sits-at-yellow rule (it shipped at BLUE on web-24),
 * and would have dodged tier 3's outright ban. `Things That Can Be “Iron”`
 * lost its wordplay tag the same way. This is the exact shape of the round-7
 * `Contains "X"` escape — a quotation mark silently switching off a fairness
 * rule — so membership is now asked of a canonical form rather than of the
 * bytes the typography pass happened to leave behind.
 */
function canon(theme: string): string {
  return theme.replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
}

function typeOfTheme(rawTheme: string): GroupType {
  const theme = canon(rawTheme);
  if (TRIVIA_THEMES.has(theme)) return 'trivia';
  if (WORDPLAY_THEMES.has(theme)) return 'wordplay';
  if (theme.includes('___')) return 'wordplay';
  if (/^Can (Be|Follow|Precede) /.test(theme)) return 'wordplay';
  if (/^Contains /.test(theme)) return 'wordplay';
  if (/^Hidden /.test(theme)) return 'wordplay';
  if (/^(Anagrams of|Rhymes with) /.test(theme)) return 'wordplay';
  if (/^(Silent|Starts|Two Pairs)/.test(theme)) return 'wordplay';
  // Round 10 — three more families the letters themselves prove. The 150-board
  // shelf needs roughly 150 subtle categories and the old vocabulary (five
  // families plus eight named ones) could not supply them without the same
  // eight themes becoming wallpaper.
  if (/^Homophones/.test(theme)) return 'wordplay';
  if (/^Add an? /.test(theme)) return 'wordplay';
  if (/^Drop /.test(theme)) return 'wordplay';
  return 'semantic';
}

/**
 * SUBTLE categories (the tier-3 bar): the thread is real but invisible on a
 * first read — you have to say the words aloud, unscramble them, or notice a
 * word hiding inside another. The blunt kind ("Contains TEN", "___ FIRE",
 * "Can Precede KEEPER") reads straight off the tiles and stays at tiers 1–2.
 */
const SUBTLE_THEMES = new Set([
  'Palindromes', 'Semordnilaps', 'Heteronyms', 'Contronyms',
  'Contronyms (Own Opposite)', 'Onomatopoeia', 'Portmanteau Words',
  'Contains Roman Numerals',
]);

function isSubtleTheme(rawTheme: string): boolean {
  const theme = canon(rawTheme);
  if (SUBTLE_THEMES.has(theme)) return true;
  if (/^(Anagrams of|Rhymes with) /.test(theme)) return true;
  if (/^Hidden /.test(theme)) return true;
  if (/^Silent /.test(theme)) return true;
  if (/^(Two Pairs|Starts and Ends)/.test(theme)) return true;
  // A homophone thread has to be HEARD (you cannot see that QUEUE is a "Q"),
  // and an add-a-letter / drop-a-letter thread has to be performed on the word
  // before it is visible at all. Both are subtle in exactly the sense tier 3
  // means: real, provable on the tile, invisible on a first read.
  if (/^Homophones/.test(theme)) return true;
  if (/^Add an? /.test(theme)) return true;
  if (/^Drop /.test(theme)) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Wordplay replacement bank — swapped in where a board falls short of the
// 2.9 floor (≥2 wordplay) or over the trivia cap. All verifiable on the tiles.
// ---------------------------------------------------------------------------

/**
 * ROUND 11 — A BANK GROUP IS A POOL, NOT A HAND.
 *
 * `words` used to be the four tiles the theme shipped, and `BANK_REUSE_CAP`
 * let four boards take the same four. That is exactly what the pool measured:
 * the 51 legacy boards carried 204 group instances built from only 126
 * distinct word-sets, with CALM/SALMON/WOULD/YOLK ("Silent L") on four
 * separate nights and BALLOON/COFFEE/RACCOON/SUCCESS on four more — the same
 * four tiles, four times, to a player who visits the Library daily. (The 112
 * newer boards were clean only because the bank was already exhausted by the
 * time the generator reached them, which is luck, not a rule.)
 *
 * Every group is a pool of 6–8 verified members now, and each use draws a
 * DISTINCT four from it (`bankDraws`). `usedSets` is global and seeded with
 * every authored set, so no 4-word set can ship twice from any source; the
 * validator fails the build if one does.
 */
interface BankGroup { theme: string; words: string[] }

const WORDPLAY_BANK: BankGroup[] = [
  { theme: 'Contains "TEN"', words: ['OFTEN', 'KITTEN', 'TENDER', 'EXTEND', 'LISTEN', 'INTEND', 'MITTEN', 'TENSION'] },
  { theme: 'Contains "CAR"', words: ['SCARF', 'SCARCE', 'CARGO', 'CARTON', 'CARPET', 'CARNIVAL', 'POSTCARD', 'SCARLET'] },
  { theme: 'Contains "PEA"', words: ['SPEAK', 'PEACH', 'REPEAT', 'APPEAR', 'PEANUT', 'PEASANT', 'PEACEFUL', 'SPEARMINT'] },
  { theme: 'Contains "WIN"', words: ['WINDOW', 'TWINE', 'WINTER', 'WINCE', 'WINDMILL', 'REWIND', 'TWINKLE', 'WINGSPAN'] },
  { theme: 'Contains "APE"', words: ['GRAPE', 'PAPER', 'ESCAPE', 'SHAPE', 'LANDSCAPE', 'DRAPERY', 'TAPESTRY', 'CAPER'] },
  { theme: 'Contains "RAT"', words: ['PIRATE', 'CRATER', 'SCRATCH', 'OPERATE', 'GRATEFUL', 'STRATEGY', 'DECORATE', 'SEPARATE'] },
  { theme: 'Silent First Letters', words: ['KNIGHT', 'WRIST', 'GNOME', 'PSALM', 'KNUCKLE', 'GNARL', 'HONEST', 'HOUR'] },
  { theme: 'Anagrams of "LISTEN"', words: ['SILENT', 'ENLIST', 'TINSEL', 'INLETS'] },
  { theme: 'Rhymes with "SNOW"', words: ['THOUGH', 'PLATEAU', 'BESTOW', 'AGLOW', 'ALTHOUGH', 'THROW', 'GLOW', 'ESCROW'] },
  { theme: 'Rhymes with "BLUE"', words: ['THROUGH', 'CANOE', 'ADIEU', 'DEBUT', 'SHAMPOO', 'BAMBOO', 'RENEW', 'PURSUE'] },
  { theme: '___ FIRE', words: ['CAMP', 'CROSS', 'CEASE', 'WILD', 'BACK', 'BUSH', 'SPIT', 'MIS'] },
  { theme: '___ FALL', words: ['WATER', 'NIGHT', 'RAIN', 'FOOT', 'WIND', 'SNOW', 'PIT', 'DOWN'] },
  { theme: 'Can Precede "KEEPER"', words: ['BEE', 'BOOK', 'GATE', 'GOAL', 'HOUSE', 'SHOP', 'PEACE', 'SCORE'] },
  { theme: 'Can Follow "EYE"', words: ['BALL', 'BROW', 'LASH', 'SHADOW', 'SIGHT', 'WITNESS', 'PIECE', 'GLASS'] },
  { theme: 'Can Precede "STICK"', words: ['CANDLE', 'CHOP', 'YARD', 'LIP', 'DRUM', 'MATCH', 'BROOM', 'JOY'] },
  { theme: 'Can Follow "RAIN"', words: ['BOW', 'COAT', 'DROP', 'FOREST', 'FALL', 'WATER', 'STORM', 'CHECK'] },
  { theme: '___ PROOF', words: ['BULLET', 'WEATHER', 'FOOL', 'CHILD', 'WATER', 'SOUND', 'FIRE', 'RUST'] },
  { theme: 'Two Pairs of Double Letters', words: ['BALLOON', 'COFFEE', 'SUCCESS', 'RACCOON', 'ADDRESS', 'MATTRESS', 'HAPPINESS', 'BOOKKEEPER'] },
  { theme: 'Starts and Ends with the Same Letter', words: ['EDGE', 'TREAT', 'NYLON', 'KIOSK', 'TROUT', 'SALADS', 'MUSEUM', 'TWILIGHT'] },
  { theme: 'Hidden Body Parts', words: ['CHARMING', 'SHIPMENT', 'FEARLESS', 'RIBBON', 'SHINGLE', 'SCALPEL', 'PALMISTRY', 'FLIPPER'] },
  { theme: 'Hidden Animals', words: ['SCOWL', 'SPIGOT', 'CATALOG', 'DOGMA', 'CROWD', 'BEETLE', 'HENCE', 'GOATEE'] },
  { theme: '___ SMITH', words: ['BLACK', 'LOCK', 'GOLD', 'WORD', 'TIN', 'SILVER', 'ARROW', 'TUNE'] },
  { theme: 'Can Follow "HAND"', words: ['SHAKE', 'BOOK', 'WRITING', 'CUFF', 'BAG', 'MADE', 'RAIL', 'SOME'] },
  { theme: 'Can Precede "LIGHT"', words: ['DAY', 'MOON', 'CANDLE', 'LAMP', 'SUN', 'STAR', 'FLASH', 'HIGH'] },
  { theme: 'Rhymes with "MOON"', words: ['TUNE', 'DUNE', 'PRUNE', 'STREWN', 'LAGOON', 'BALLOON', 'CARTOON', 'MONSOON'] },
  { theme: 'Rhymes with "EIGHT"', words: ['WEIGHT', 'FREIGHT', 'STRAIGHT', 'AWAIT', 'DEBATE', 'ESTATE', 'ORNATE', 'SKATE'] },
  { theme: 'Rhymes with "CHAIR"', words: ['THEIR', 'WHERE', 'FLAIR', 'BEWARE', 'AFFAIR', 'DECLARE', 'PREPARE', 'SOLITAIRE'] },
  { theme: 'Anagrams of "TRACE"', words: ['CRATE', 'REACT', 'CATER', 'CARET'] },
  { theme: 'Anagrams of "PALEST"', words: ['PLATES', 'STAPLE', 'PETALS', 'PLEATS', 'PASTEL'] },
  { theme: 'Anagrams of "SPARE"', words: ['PEARS', 'REAPS', 'PARSE', 'SPEAR', 'PARES'] },
  { theme: 'Silent "B"', words: ['CLIMB', 'THUMB', 'SUBTLE', 'DOUBT', 'LAMB', 'COMB', 'CRUMB', 'PLUMBER'] },
  { theme: 'Silent "L"', words: ['CALM', 'WOULD', 'SALMON', 'YOLK', 'PALM', 'HALF', 'CHALK', 'FOLK'] },
  { theme: 'Silent "W"', words: ['WRENCH', 'ANSWER', 'WRINKLE', 'AWRY', 'WRIST', 'WRAP', 'SWORD', 'WREATH'] },
  { theme: 'Silent Letters at the End', words: ['COMB', 'LAMB', 'HYMN', 'COLUMN', 'AUTUMN', 'THUMB', 'CRUMB', 'SOLEMN'] },
  { theme: 'Hidden Numbers', words: ['CANINE', 'OFTEN', 'HONEST', 'STONEWARE', 'ATONE', 'KITTEN', 'FEMININE', 'MONEY'] },
  { theme: 'Rhymes with "TREE"', words: ['KEY', 'QUAY', 'DEBRIS', 'FLEA', 'AGREE', 'DEGREE', 'MARQUEE', 'DECREE'] },
  { theme: 'Silent "H"', words: ['GHOST', 'RHYME', 'WHISTLE', 'SCHEME', 'HONEST', 'HOUR', 'RHUBARB', 'GHERKIN'] },
  { theme: 'Anagrams of "NOTES"', words: ['STONE', 'TONES', 'ONSET', 'STENO'] },
  { theme: 'Contains "ONE"', words: ['ATONE', 'PHONE', 'ZONE', 'CLONE', 'HONEY', 'MONEY', 'STONE', 'THRONE'] },
  { theme: 'Contains "ART"', words: ['PARTY', 'CHART', 'SMART', 'DEPART', 'QUARTER', 'ARTIST', 'CARTOON', 'PARTNER'] },
  { theme: 'Contains "AGE"', words: ['MANAGE', 'VILLAGE', 'PACKAGE', 'VOYAGE', 'LUGGAGE', 'COTTAGE', 'MESSAGE', 'GARAGE'] },
  { theme: 'Contains "EAR"', words: ['HEART', 'SEARCH', 'PEARL', 'YEARN', 'LEARNED', 'CLEARING', 'RESEARCH', 'APPEAR'] },
  { theme: 'Contains "ICE"', words: ['SLICE', 'PRICE', 'NOTICE', 'SPICE', 'JUICE', 'SERVICE', 'PRACTICE', 'OFFICER'] },
  { theme: 'Contains "AIR"', words: ['CHAIR', 'STAIR', 'REPAIR', 'AFFAIR', 'FAIRY', 'PRAIRIE', 'DAIRY', 'ECLAIR'] },
  { theme: '___ HOUSE', words: ['LIGHT', 'GREEN', 'FARM', 'TREE', 'WARE', 'BOAT', 'DOLL', 'HEN'] },
  { theme: '___ BOARD', words: ['KEYS', 'CARD', 'SURF', 'DASH', 'CHALK', 'SKATE', 'BILL', 'SIGN'] },
  { theme: '___ STORM', words: ['BRAIN', 'SAND', 'SNOW', 'THUNDER', 'HAIL', 'RAIN', 'DUST', 'FIRE'] },
  { theme: 'Can Precede "BERRY"', words: ['BLUE', 'STRAW', 'RASP', 'ELDER', 'BLACK', 'GOOSE', 'HACK', 'DEW'] },
  { theme: 'Can Follow "SUN"', words: ['FLOWER', 'SHINE', 'RISE', 'BEAM', 'SET', 'DIAL', 'LIGHT', 'BURST'] },
  { theme: 'Can Precede "WORK"', words: ['HOME', 'NET', 'FRAME', 'CLOCK', 'PATCH', 'TEAM', 'HAND', 'FIRE'] },
  { theme: 'Contains "OWN"', words: ['BROWN', 'CROWN', 'DOWNY', 'FROWN', 'TOWNS', 'GOWNS', 'CLOWN', 'KNOWN'] },
  { theme: 'Contains "AND"', words: ['GARLAND', 'ISLAND', 'SANDAL', 'MEANDER', 'CANDLE', 'HANDLE', 'BANDAGE', 'GRANDEUR'] },
  { theme: 'Contains "OLD"', words: ['GOLDEN', 'BOLDER', 'HOLDER', 'SOLDER', 'COLDEST', 'FOLDER', 'SCOLDED', 'MOLDING'] },
  { theme: 'Contains "TEA"', words: ['STEAM', 'INSTEAD', 'TEAPOT', 'STEADY', 'TEACHER', 'STEALTH', 'PLATEAU', 'TEASPOON'] },
  { theme: 'Contains "ROW"', words: ['ARROW', 'BURROW', 'SPARROW', 'THROW', 'BROWSE', 'CROWD', 'GROWTH', 'NARROW'] },
  { theme: 'Contains "AME"', words: ['FLAME', 'BLAME', 'SESAME', 'CARAMEL', 'GAMES', 'NAMELESS', 'FRAMEWORK', 'CAMEL'] },
  { theme: 'Contains "ARM"', words: ['HARMONY', 'CHARMED', 'GARMENT', 'ALARM', 'FARMER', 'WARMTH', 'MARMALADE', 'CHARMING'] },
  { theme: 'Contains "ILL"', words: ['WILLOW', 'MILLER', 'THRILL', 'CHILLY', 'VILLAGE', 'PILLOW', 'BRILLIANT', 'VANILLA'] },
  { theme: '___ WOOD', words: ['DRIFT', 'PLY', 'ROSE', 'TEAK', 'FIRE', 'HARD', 'SANDAL', 'BASS'] },
  { theme: '___ MARK', words: ['LAND', 'BENCH', 'TRADE', 'CHECK', 'BOOK', 'POST', 'EAR', 'HALL'] },
  { theme: 'Palindromes', words: ['LEVEL', 'RADAR', 'KAYAK', 'ROTOR', 'CIVIC', 'REFER', 'MADAM', 'TENET'] },
  { theme: 'Semordnilaps', words: ['DRAWER', 'STOPS', 'DIAPER', 'DEVIL', 'SLEEK', 'STRAW', 'DESSERTS', 'KNITS'] },
  { theme: 'Onomatopoeia', words: ['SIZZLE', 'RUSTLE', 'CLATTER', 'MURMUR', 'WHISPER', 'CRACKLE', 'JINGLE', 'PATTER'] },
  { theme: 'Portmanteau Words', words: ['BRUNCH', 'SMOG', 'MOTEL', 'MOPED', 'CHORTLE', 'SITCOM', 'TELETHON', 'CAMCORDER'] },
  { theme: 'Heteronyms', words: ['MINUTE', 'DESERT', 'WIND', 'REFUSE', 'PRESENT', 'CONTENT', 'OBJECT', 'SEPARATE'] },
  { theme: 'Contronyms (Own Opposite)', words: ['DUST', 'CLEAVE', 'SANCTION', 'OVERSIGHT', 'SCREEN', 'TRIM', 'BOLT', 'WEATHER'] },
  { theme: 'Silent "K"', words: ['KNEE', 'KNOT', 'KNACK', 'KNUCKLE', 'KNEAD', 'KNOWLEDGE', 'KNITTING', 'KNAPSACK'] },
  { theme: 'Silent "G"', words: ['SIGN', 'DESIGN', 'CAMPAIGN', 'FOREIGN', 'REIGN', 'ASSIGN', 'CHAMPAGNE', 'GNOME'] },
  { theme: 'Silent "T"', words: ['CASTLE', 'LISTEN', 'FASTEN', 'WHISTLE', 'BUSTLE', 'THISTLE', 'GLISTEN', 'RUSTLE'] },
  { theme: 'Silent "P"', words: ['RECEIPT', 'CUPBOARD', 'RASPBERRY', 'CORPS', 'PSALM', 'PNEUMATIC', 'PTARMIGAN', 'PSEUDONYM'] },
  { theme: 'Silent "D"', words: ['HANDKERCHIEF', 'HANDSOME', 'SANDWICH', 'HEDGEHOG', 'BADGER', 'LODGER', 'GRUDGE', 'PLEDGE'] },
  { theme: 'Silent "C"', words: ['SCISSORS', 'SCENE', 'MUSCLE', 'SCENT', 'SCEPTRE', 'ASCEND', 'DESCEND', 'SCYTHE'] },
  { theme: 'Silent "U"', words: ['GUARD', 'GUEST', 'BUILD', 'TONGUE', 'GUITAR', 'GUILTY', 'BISCUIT', 'COLLEAGUE'] },
  { theme: 'Homophones of Numbers', words: ['WON', 'ATE', 'TOO', 'FORE'] },
  { theme: 'Homophones of Animals', words: ['BARE', 'HAIR', 'FLEE', 'DEAR', 'MOOSE', 'EWE', 'DOE', 'LYNX'] },
  { theme: 'Homophones of Trees', words: ['FUR', 'BEACH', 'PAIR', 'YEW', 'PINE', 'ELM', 'ASH', 'BIRCH'] },
  { theme: 'Homophones of Musical Notes', words: ['DOUGH', 'RAY', 'SEW', 'TEA', 'FAR', 'ME', 'DOE'] },
  { theme: 'Add an "S" for a New Word', words: ['CARE', 'TONE', 'PARK', 'HOP', 'TAKE', 'PIN', 'MILE', 'COLD'] },
  { theme: 'Add a "T" for a New Word', words: ['RAIN', 'HERE', 'RUST', 'RIP', 'READ', 'ROUT', 'ROLL', 'HEIR'] },
  { theme: 'Add a "B" for a New Word', words: ['RIGHT', 'LAND', 'READ', 'LUSH', 'RUSH', 'LAZE', 'RIDGE', 'LOOM'] },
  { theme: 'Add a "C" for a New Word', words: ['HARM', 'RUST', 'LOVER', 'RATE', 'LAMP', 'RAFT', 'OVER', 'HEST'] },
  { theme: 'Add a "W" for a New Word', words: ['HEAT', 'RING', 'RITE', 'HALE', 'RECK', 'RAP', 'ITCH', 'AGES'] },
  { theme: 'Add a "P" for a New Word', words: ['LANE', 'RIDE', 'LUMP', 'EACH', 'LATE', 'RIME', 'ANTS', 'LOUGH'] },
  { theme: 'Drop the First Letter for a New Word', words: ['BRAIN', 'CHAIR', 'STONE', 'PLACE', 'SPARK', 'CLOVE', 'TRAIL', 'BREED'] },
  { theme: 'Drop the Last Letter for a New Word', words: ['HEARTH', 'PLANET', 'STARE', 'CLOVER', 'CARTON', 'BRANDY', 'SHEEP', 'GRAPES'] },
  /**
   * ROUND 12 — "HIDDEN X" MEANS HIDDEN (AAA 2.9 [BEAT], and the tone gate).
   *
   * Two defects lived in these six pools and both shipped.
   *
   *   1. MIDGET carried MIDGE here, and web-44 set it in Fell caps on a tile.
   *      It is a slur for people with dwarfism; it passed only because
   *      TONE_WORDS had no entry for it. Gated now (content/generate-gate.ts),
   *      and `assertBankIsClean()` below lints the POOLS at build time so the
   *      next one cannot enter the same way — until round 12 the gate ran on
   *      composed boards only, so a pool member the composer never happened to
   *      draw was never read by anything.
   *   2. Half of three shipped boards falsified their own category: web-28's
   *      "Hidden Vegetables" printed LEEKS and PEASE, web-46's "Hidden Musical
   *      Instruments" printed LUTES and TUBAS, web-43's "Hidden Birds" printed
   *      CRANES. Those are the noun with a plural on it — the vegetable is not
   *      hidden inside anything, it IS the tile. A board that teaches "the bird
   *      is concealed" in one half and "the bird is printed" in the other is
   *      the exact fairness complaint Connections gets and this generator
   *      exists to fix. Every bare inflection is gone (YAMS, LEEKS, PEASE,
   *      OKRAS, LUTES, PIANOS, TUBAS, MELONS, CRANES, SWALLOWED, DATED), and
   *      `assertBankIsClean()` fails the build on the next one.
   *
   * The same pass caught two members that hid NOTHING — CHERISH (no fruit in
   * it; the author meant CHERRY, which it does not contain) and THREAD (no
   * THREE) — because the lint now requires a carrier to actually contain its
   * token. Carriers are chosen so a drawn hand names four DIFFERENT things.
   */
  { theme: 'Hidden Insects', words: ['ANTLER', 'BEETROOT', 'MOTHER', 'PLANTAIN', 'CANTALOUPE', 'TICKET', 'WASPISH', 'STAGNATE'] },
  { theme: 'Hidden Trees', words: ['PINEAPPLE', 'ASHAMED', 'FIRST', 'HELMET', 'PALMISTRY', 'OAKUM', 'STEAK', 'SPINELESS'] },
  { theme: 'Hidden Birds', words: ['CROWD', 'LANTERN', 'HENCE', 'GULLIBLE', 'ROOKIE', 'BOWLING', 'WRENCH', 'HAWKER'] },
  { theme: 'Hidden Fruits', words: ['PLUMBER', 'FIGURE', 'MANDATE', 'PEARL', 'LIMEADE', 'GRAPEVINE', 'LEMONADE', 'IMPEACH'] },
  { theme: 'Hidden Vegetables', words: ['PEASANT', 'CORNER', 'BEETLE', 'KALEIDOSCOPE', 'SLEEK', 'ORCHARD', 'CARIBBEAN', 'ARCHIVE'] },
  { theme: 'Hidden Musical Instruments', words: ['ORGANIC', 'HARPOON', 'VIOLATED', 'CELLOPHANE', 'CONUNDRUM', 'ABSOLUTE', 'EMBASSY', 'THORNY'] },
  { theme: 'Rhymes with "LIGHT"', words: ['WRITE', 'HEIGHT', 'POLITE', 'TONIGHT', 'DELIGHT', 'INVITE', 'IGNITE', 'RECITE'] },
  { theme: 'Rhymes with "DAY"', words: ['BOUQUET', 'CROCHET', 'BALLET', 'CABARET', 'CHALET', 'OBEY', 'BETRAY', 'DISPLAY'] },
  { theme: 'Rhymes with "MOOD"', words: ['BREWED', 'SHREWD', 'PRUDE', 'CHEWED', 'INCLUDE', 'PURSUED', 'RENEWED', 'CRUDE'] },
  { theme: 'Rhymes with "TIME"', words: ['CLIMB', 'MIME', 'CHIME', 'SUBLIME', 'GRIME', 'PRIME', 'SLIME', 'RHYME'] },
  { theme: 'Rhymes with "STAR"', words: ['BIZARRE', 'GUITAR', 'AJAR', 'CIGAR', 'BAZAAR', 'AFAR', 'SITAR', 'SPAR'] },
  { theme: 'Rhymes with "SPEAK"', words: ['ANTIQUE', 'UNIQUE', 'CRITIQUE', 'BOUTIQUE', 'OBLIQUE', 'MYSTIQUE', 'PHYSIQUE', 'TECHNIQUE'] },
  { theme: 'Rhymes with "BREAD"', words: ['THREAD', 'SAID', 'INSTEAD', 'AHEAD', 'SPREAD', 'TREAD', 'MISLED', 'WIDESPREAD'] },
  { theme: 'Rhymes with "LAUGH"', words: ['GIRAFFE', 'GRAPH', 'CARAFE', 'STAFF', 'CALF', 'HALF', 'BEHALF', 'CHAFF'] },
  { theme: 'Rhymes with "ROSE"', words: ['DOZE', 'THOSE', 'GLOWS', 'PROSE', 'SUPPOSE', 'COMPOSE', 'OPPOSE', 'TOES'] },
  { theme: '___ CAKE', words: ['PAN', 'CUP', 'CHEESE', 'SHORT', 'OAT', 'FRUIT', 'SPONGE', 'CARROT'] },
  { theme: '___ BOX', words: ['MAIL', 'SAND', 'TOOL', 'JUKE', 'MATCH', 'SHOE', 'ICE', 'WINDOW'] },
  { theme: '___ CASE', words: ['BRIEF', 'SUIT', 'STAIR', 'BOOK', 'SHOW', 'PILLOW', 'PENCIL', 'NUT'] },
  { theme: '___ HORSE', words: ['SEA', 'RACE', 'CART', 'HOBBY', 'WORK', 'CLOTHES', 'ROCKING', 'PACK'] },
  { theme: '___ PAPER', words: ['NEWS', 'WALL', 'SAND', 'WRAPPING', 'NOTE', 'FLY', 'TISSUE', 'GRAPH'] },
  { theme: '___ POT', words: ['TEA', 'JACK', 'FLOWER', 'CROCK', 'STOCK', 'HOT', 'MELTING', 'CHIMNEY'] },
  { theme: '___ ROOM', words: ['BATH', 'MUSH', 'CLASS', 'BALL', 'REST', 'COURT', 'STORE', 'SHOW'] },
  { theme: '___ STONE', words: ['LIME', 'CORNER', 'KEY', 'MILE', 'BRIM', 'CURB', 'GRAVEL', 'FLAG'] },
  { theme: '___ WATER', words: ['RAIN', 'SALT', 'FRESH', 'UNDER', 'BREAK', 'DISH', 'TIDE', 'SEA'] },
  { theme: '___ BOAT', words: ['SAIL', 'ROW', 'GRAVY', 'LIFE', 'STEAM', 'HOUSE', 'FERRY', 'TUG'] },
  { theme: '___ BREAD', words: ['CORN', 'GINGER', 'SHORT', 'FLAT', 'SODA', 'SWEET', 'SPICE', 'WHEAT'] },
  { theme: '___ MILL', words: ['WIND', 'TREAD', 'SAW', 'PEPPER', 'WATER', 'RUN', 'GRIST', 'TEXTILE'] },
  { theme: '___ PIPE', words: ['BAG', 'DRAIN', 'WIND', 'TAIL', 'STOVE', 'PAN', 'STAND', 'BLOW'] },
  { theme: 'Can Follow "BOOK"', words: ['CASE', 'SHELF', 'MARK', 'WORM', 'KEEPER', 'BINDING', 'STORE', 'LET'] },
  { theme: 'Can Follow "SNOW"', words: ['FLAKE', 'DRIFT', 'BALL', 'MAN', 'STORM', 'SHOE', 'PLOUGH', 'FALL'] },
  { theme: 'Can Follow "FIRE"', words: ['PLACE', 'WOOD', 'FLY', 'WORKS', 'SIDE', 'LIGHT', 'GUARD', 'STORM'] },
  { theme: 'Can Follow "MOON"', words: ['LIGHT', 'BEAM', 'STONE', 'WALK', 'LIT', 'RISE', 'SHINE', 'FLOWER'] },
  { theme: 'Can Follow "TEA"', words: ['POT', 'SPOON', 'CUP', 'BAG', 'ROOM', 'TIME', 'HOUSE', 'CAKE'] },
  { theme: 'Can Precede "MAKER"', words: ['WATCH', 'HAT', 'MATCH', 'PEACE', 'SHOE', 'HOME', 'DRESS', 'TROUBLE'] },
  { theme: 'Can Precede "PRINT"', words: ['FOOT', 'FINGER', 'BLUE', 'NEWS', 'THUMB', 'IMPRINT', 'RE', 'PAW'] },

  /**
   * ROUND 12 — THIRTY MORE POOLS, BECAUSE THE CAP NEEDS SOMEWHERE TO GO.
   *
   * Making `BANK_REUSE_CAP` bind authored themes (see its docstring) turns
   * ~30 authored group instances into forced replacements, and the shelf owes
   * two wordplay categories per board and two SUBTLE ones at tier 3 on top of
   * that. With the round-11 bank the arithmetic did not close: the first run
   * under the cap dropped 22 boards — the whole newest batch, which is exactly
   * where the over-used themes were concentrated — not because those boards
   * were unfair but because nothing was left to give them. Deleting a round's
   * growth is not a fix for a round's padding.
   *
   * Two thirds of what follows is SUBTLE (rhyme / anagram / silent-letter /
   * hidden-word / add-a-letter), because that is the narrow shelf and the one
   * tier 3 draws on. Every member is verified against its own claim: the
   * rhymes rhyme, the anagrams are exact, the silent letters are silent, and
   * the hidden words are hidden rather than printed (`assertBankIsClean`).
   */
  { theme: 'Rhymes with "CHEESE"', words: ['FREEZE', 'SEIZE', 'TEASE', 'BREEZE', 'PLEASE', 'SQUEEZE', 'APPEASE', 'TRAPEZE'] },
  { theme: 'Rhymes with "GREEN"', words: ['SCENE', 'MACHINE', 'ROUTINE', 'SERENE', 'MARINE', 'CUISINE', 'CANTEEN', 'BETWEEN'] },
  { theme: 'Rhymes with "SMILE"', words: ['AISLE', 'PROFILE', 'EXILE', 'WHILE', 'TRIAL', 'DENIAL', 'STYLE', 'AWHILE'] },
  { theme: 'Rhymes with "CLOUD"', words: ['PROUD', 'ALOUD', 'CROWD', 'VOWED', 'PLOUGHED', 'ENDOWED', 'ALLOWED', 'BOWED'] },
  { theme: 'Rhymes with "FLOWER"', words: ['HOUR', 'SHOWER', 'POWER', 'TOWER', 'DEVOUR', 'SCOUR', 'GLOWER', 'COWER'] },
  { theme: 'Rhymes with "PURSE"', words: ['VERSE', 'WORSE', 'NURSE', 'REHEARSE', 'DIVERSE', 'TERSE', 'COERCE', 'IMMERSE'] },
  { theme: 'Rhymes with "MOUSE"', words: ['HOUSE', 'BLOUSE', 'GROUSE', 'SPOUSE', 'DOUSE', 'ROUSE', 'ESPOUSE'] },
  { theme: 'Rhymes with "BRUSH"', words: ['HUSH', 'CRUSH', 'LUSH', 'PLUSH', 'THRUSH', 'BLUSH', 'GUSH', 'SLUSH'] },
  { theme: 'Rhymes with "SHOWN"', words: ['ALONE', 'CYCLONE', 'POSTPONE', 'CHAPERONE', 'CONDONE', 'BACKBONE', 'MILESTONE', 'OZONE'] },
  { theme: 'Rhymes with "FRIEND"', words: ['ATTEND', 'EXTEND', 'DEPEND', 'SUSPEND', 'AMEND', 'ASCEND', 'COMMEND', 'TRANSCEND'] },
  { theme: 'Rhymes with "TABLE"', words: ['CABLE', 'STABLE', 'LABEL', 'FABLE', 'GABLE', 'ENABLE', 'UNSTABLE', 'SABLE'] },
  { theme: 'Silent "N"', words: ['AUTUMN', 'COLUMN', 'SOLEMN', 'HYMN', 'CONDEMN', 'LIMN'] },
  { theme: 'Silent "S"', words: ['ISLAND', 'AISLE', 'ISLE', 'DEBRIS', 'VISCOUNT', 'CHASSIS', 'RENDEZVOUS', 'BOURGEOIS'] },
  { theme: 'Anagrams of "STEAM"', words: ['MEATS', 'TEAMS', 'TAMES', 'MATES'] },
  { theme: 'Anagrams of "LEAST"', words: ['STEAL', 'SLATE', 'STALE', 'TALES', 'TEALS'] },
  { theme: 'Anagrams of "STARE"', words: ['RATES', 'TEARS', 'ASTER', 'TARES', 'RESAT'] },
  { theme: 'Anagrams of "PARTIES"', words: ['PIRATES', 'PASTIER', 'TRAIPSE', 'PIASTER'] },
  { theme: 'Add an "E" for a New Word', words: ['HUG', 'CUT', 'MAT', 'PIN', 'TAP', 'CAP', 'MAN', 'RAT'] },
  { theme: 'Add an "R" for a New Word', words: ['BEAD', 'BUSH', 'CASH', 'FEE', 'GOWN', 'PAY', 'TICK', 'BAND'] },
  { theme: 'Add an "L" for a New Word', words: ['BACK', 'FIGHT', 'PANT', 'CAPE', 'SIGHT', 'COVE', 'BEAK', 'PACE'] },
  { theme: 'Homophones of Weather Words', words: ['REIGN', 'REIN', 'HALE', 'MISSED', 'DUE'] },
  { theme: 'Hidden Colors', words: ['TANGERINE', 'REDUNDANT', 'MOROSE', 'PLUMMET', 'CRUSTY', 'CHAMBER', 'MARIGOLD', 'GREYHOUND'] },
  { theme: 'Hidden Weather', words: ['TRAINER', 'MISTAKE', 'REGALE', 'WINDOW', 'SUNDRY', 'FOGGY', 'SLICE', 'DEWY'] },
  { theme: '___ SHIP', words: ['FRIEND', 'HARD', 'LEADER', 'PART', 'MEMBER', 'SPACE', 'TOWN', 'CHAMPION'] },
  { theme: '___ LINE', words: ['OUT', 'HEAD', 'TIME', 'COAST', 'PIPE', 'LIFE', 'GUIDE', 'SIDE'] },
  { theme: '___ BALL', words: ['FOOT', 'BASE', 'SNOW', 'EYE', 'MEAT', 'ODD', 'HAND', 'HAIR'] },
  { theme: '___ YARD', words: ['COURT', 'BACK', 'SHIP', 'DOCK', 'JUNK', 'FARM', 'VINE', 'BARN'] },
  { theme: '___ CLOTH', words: ['TABLE', 'WASH', 'LOIN', 'BROAD', 'DISH', 'SACK', 'OIL', 'CHEESE'] },
  { theme: '___ WORM', words: ['EARTH', 'BOOK', 'SILK', 'GLOW', 'TAPE', 'WOOD', 'RING', 'INCH'] },
  { theme: '___ CHAIR', words: ['ARM', 'HIGH', 'WHEEL', 'DECK', 'EASY', 'PUSH', 'LAWN', 'SEDAN'] },
  { theme: '___ POST', words: ['SIGN', 'LAMP', 'GATE', 'GOAL', 'MILE', 'BED', 'OUT', 'FENCE'] },
  { theme: '___ GLASS', words: ['HOUR', 'SPY', 'EYE', 'LOOKING', 'SUN', 'PLEXI', 'FIBRE', 'WINE'] },
  { theme: '___ CARD', words: ['POST', 'WILD', 'PLACE', 'FLASH', 'SCORE', 'CREDIT', 'BIRTHDAY', 'REPORT'] },
  { theme: 'Can Follow "TABLE"', words: ['CLOTH', 'SPOON', 'TOP', 'WARE', 'LAND', 'MAT', 'TALK', 'LEG'] },
  { theme: 'Can Follow "STAR"', words: ['FISH', 'LIGHT', 'GAZER', 'DUST', 'BOARD', 'LET', 'BURST', 'STRUCK'] },
  { theme: 'Can Precede "FLOWER"', words: ['SUN', 'WALL', 'MAY', 'WILD', 'BELL', 'CORN', 'ELDER', 'PASSION'] },
];
/**
 * How many boards may share one THEME before it feels like wallpaper.
 *
 * ROUND 12 — THIS IS NO LONGER A BANK RULE. It was named `BANK_REUSE_CAP`,
 * documented as the anti-wallpaper rule, and enforced through `bankUse`, which
 * was incremented ONLY on bank draws (the two `bankUse.set` calls). Authored
 * themes never touched the counter, so the rule did not apply to the source
 * the shelf actually grew from: "Two Pairs of Double Letters" was authored onto
 * 16 of 167 boards — 7 of the 12 boards in the newest batch — and shipped on
 * 17, and 'Silent "T"', Heteronyms, Palindromes, Semordnilaps, 'Silent "GH"',
 * Onomatopoeia and 'Silent "K"' were all over the cap too. A player who visits
 * the Library nightly met the same brown-paper category one night in ten.
 *
 * `themeUse` now counts EVERY shipped use, from either source: an authored
 * group whose theme is already at the cap is a forced replacement victim in
 * `replaceGroups` (see `overCapGroups`), and `validate` hard-fails — not
 * warns — if anything gets past it.
 */
const BANK_REUSE_CAP = 3;

/**
 * ROUND 12 — WHAT EACH "HIDDEN X" CATEGORY IS ALLOWED TO HIDE.
 *
 * The pools were never linted at authoring time: the tone gate and the
 * fairness solver both run on *composed boards*, so a pool member the composer
 * happened not to draw was read by nothing at all, and a member that hid
 * nothing (CHERISH has no CHERRY in it; THREAD has no THREE) or that simply
 * printed the answer with an S on it (LEEKS, TUBAS, CRANES) shipped unread.
 * These lists turn "Hidden X" into a checkable claim.
 */
const HIDDEN_TOKENS: Record<string, readonly string[]> = {
  'Hidden Numbers': ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE', 'TEN', 'ELEVEN', 'TWELVE'],
  'Hidden Numbers (Spelled Out)': ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE', 'TEN', 'ELEVEN', 'TWELVE'],
  'Hidden Colors': ['RED', 'BLUE', 'GREEN', 'TAN', 'ROSE', 'PLUM', 'JADE', 'GREY', 'PINK', 'GOLD', 'RUST', 'TEAL', 'AMBER', 'CORAL', 'OLIVE', 'INDIGO'],
  'Hidden Instruments': ['HARP', 'ORGAN', 'LUTE', 'VIOLA', 'CELLO', 'DRUM', 'HORN', 'BASS', 'OBOE', 'PIANO', 'TUBA', 'FIFE', 'BANJO', 'LYRE', 'SITAR', 'FLUTE'],
  'Hidden Musical Instruments': ['HARP', 'ORGAN', 'LUTE', 'VIOLA', 'CELLO', 'DRUM', 'HORN', 'BASS', 'OBOE', 'PIANO', 'TUBA', 'FIFE', 'BANJO', 'LYRE', 'SITAR', 'FLUTE'],
  'Hidden Body Parts': ['ARM', 'HIP', 'EAR', 'RIB', 'SHIN', 'SCALP', 'PALM', 'LIP', 'CHIN', 'HEEL', 'CALF', 'EYE', 'JAW', 'GUM', 'HAND', 'FOOT', 'SKIN', 'LUNG', 'LIVER', 'BROW', 'NOSE', 'NECK', 'KNEE', 'SHOULDER'],
  'Hidden Animals': ['COW', 'PIG', 'CAT', 'DOG', 'CROW', 'BEE', 'HEN', 'GOAT', 'APE', 'RAT', 'OWL', 'FOX', 'BAT', 'ANT', 'EWE', 'SOW'],
  'Hidden Birds': ['CROW', 'OWL', 'HEN', 'GULL', 'SWALLOW', 'ROOK', 'WREN', 'HAWK', 'DOVE', 'LARK', 'EMU', 'TERN', 'IBIS'],
  'Hidden Trees': ['PINE', 'ASH', 'FIR', 'ELM', 'PALM', 'OAK', 'BEECH', 'TEAK', 'YEW', 'MAPLE', 'CEDAR', 'BIRCH', 'LARCH', 'ASPEN'],
  'Hidden Fruits': ['PLUM', 'FIG', 'DATE', 'PEAR', 'LIME', 'GRAPE', 'LEMON', 'PEACH', 'APPLE', 'MELON', 'MANGO', 'CHERRY', 'OLIVE'],
  'Hidden Vegetables': ['PEA', 'CORN', 'BEET', 'KALE', 'LEEK', 'CHARD', 'BEAN', 'CHIVE', 'YAM', 'OKRA', 'ONION', 'TURNIP', 'CRESS'],
  'Hidden Insects': ['ANT', 'BEE', 'MOTH', 'WASP', 'GNAT', 'TICK', 'MIDGE', 'FLEA', 'APHID'],
  'Hidden Weather': ['RAIN', 'SNOW', 'HAIL', 'MIST', 'FOG', 'GALE', 'SUN', 'ICE', 'DEW', 'WIND', 'STORM', 'SLEET', 'FROST'],
};

/**
 * The suffixes that turn the noun into itself. A "Hidden X" member may not be
 * its own token, nor the token wearing one of these — that is the noun printed
 * on the tile, which is the opposite of the category's claim (AAA 2.9).
 * Derivational endings are deliberately NOT here: MOTHER is not a moth and
 * HAWKER is not a hawk, and both are honest carriers.
 */
const INFLECTIONS = ['S', 'ES', 'ED', 'ING', 'IES'] as const;

/**
 * True when `word` is `token` wearing nothing but an inflection — the noun
 * printed on the tile. The bare `D` case is admitted only for an E-final token
 * (DATE → DATED), because CROW → CROWD is a different word and an honest
 * carrier, and a rule that cannot tell those apart would purge the good ones.
 */
function isInflectionOf(token: string, word: string): boolean {
  if (word === token) return true;
  if (INFLECTIONS.some((sfx) => word === token + sfx)) return true;
  return token.endsWith('E') && word === `${token}D`;
}

/** The hidden token this member honestly carries, or null if it carries none. */
function hiddenTokenOf(theme: string, word: string): string | null {
  const tokens = HIDDEN_TOKENS[canon(theme)];
  if (!tokens) return null;
  for (const t of tokens) {
    if (!word.includes(t)) continue;
    if (isInflectionOf(t, word)) continue;
    return t;
  }
  return null;
}

/**
 * Every "Hidden X" group — from the bank OR from the authored file — must hide
 * what it says it hides. Reasons a member fails, in the order they bit us:
 * it is the bare noun with a plural/participle on it (LEEKS, TUBAS, CRANES,
 * SWALLOWED, DATED); or it contains no member of the category at all
 * (CHERISH, THREAD, CALIBER).
 */
function hiddenGroupProblems(theme: string, words: readonly string[]): string[] {
  if (!(canon(theme) in HIDDEN_TOKENS)) {
    return /^Hidden /.test(canon(theme)) ? [`"${theme}" has no token list — add one to HIDDEN_TOKENS`] : [];
  }
  const out: string[] = [];
  for (const w of words) {
    if (hiddenTokenOf(theme, w)) continue;
    const tokens = HIDDEN_TOKENS[canon(theme)]!;
    const bare = tokens.find((t) => isInflectionOf(t, w));
    out.push(bare
      ? `"${theme}": ${w} prints ${bare}, it does not hide it`
      : `"${theme}": ${w} hides nothing on the list`);
  }
  return out;
}

/**
 * ROUND 12 — the pools themselves are linted, once, before anything is
 * composed. Until now the cozy tone gate ran on the sixteen words of a
 * COMPOSED board, so MIDGET sat in `WORDPLAY_BANK` for as long as it took the
 * composer to draw the hand that carried it — and once drawn it went straight
 * past the gate anyway, because TONE_WORDS had no entry for it. A pool is
 * shipped content the moment it is written down; it is read here.
 */
function assertBankIsClean(): void {
  const problems: string[] = [];
  for (const g of WORDPLAY_BANK) {
    for (const w of g.words) {
      if (!toneOk(w.toLowerCase())) problems.push(`bank "${g.theme}": ${w} fails the tone gate`);
      if (!/^[A-Z]+$/.test(w)) problems.push(`bank "${g.theme}": ${w} is not plain caps`);
    }
    if (new Set(g.words).size !== g.words.length) problems.push(`bank "${g.theme}" repeats a word`);
    problems.push(...hiddenGroupProblems(g.theme, g.words).map((p) => `bank ${p}`));
  }
  const themes = WORDPLAY_BANK.map((g) => canon(g.theme));
  if (new Set(themes).size !== themes.length) problems.push('bank has a duplicate theme');
  if (problems.length > 0) {
    console.error(problems.join('\n'));
    throw new Error(`the wordplay bank is not shippable: ${problems.length} problem(s)`);
  }
}

/** Bank groups whose thread is subtle (the tier-3 supply). */
const SUBTLE_BANK = WORDPLAY_BANK.filter((b) => isSubtleTheme(b.theme));

/** Canonical key for a 4-word set — order-independent, the unit of repetition. */
function setKey(words: readonly string[]): string {
  return [...words].sort().join('|');
}

/**
 * Every 4-word set already spoken for, from ANY source (authored group or a
 * previous bank draw). Seeded below, once the authored boards are loaded.
 */
const usedSets = new Set<string>();

/**
 * The distinct four-word hands a pool can deal, in a fixed order. Deliberately
 * spread across the pool (0-3, 4-7, evens, odds, …) so consecutive uses of one
 * theme share as few tiles as possible rather than sliding a window by one.
 */
const DRAW_PATTERNS: readonly (readonly number[])[] = [
  [0, 1, 2, 3], [4, 5, 6, 7], [0, 2, 4, 6], [1, 3, 5, 7],
  [0, 1, 6, 7], [2, 3, 4, 5], [0, 3, 5, 6], [1, 2, 4, 7],
];

function bankDraws(group: BankGroup): BankGroup[] {
  const out: BankGroup[] = [];
  const seen = new Set<string>();
  for (const pattern of DRAW_PATTERNS) {
    if (pattern.some((i) => i >= group.words.length)) continue;
    const words = pattern.map((i) => group.words[i]!);
    const key = setKey(words);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ theme: group.theme, words });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Load the authored boards
// ---------------------------------------------------------------------------

interface RawGroup { theme: string; tier: 'yellow' | 'green' | 'blue' | 'purple'; words: string[] }
/**
 * Per-BOARD authoring tag in content/authored/word-web-boards.json: the tier
 * the author was aiming at. It is authoring INTENT (INTENDED_TIER below turns
 * it into a starting tier, and pass 2 demotes boards that don't earn it), not
 * the retired puzzle-level `difficulty` alias — shipped boards carry `tier`
 * and nothing else.
 */
type AuthoredDifficulty = 'easy' | 'medium' | 'hard' | 'expert';

interface RawBoard { id: string; difficulty: AuthoredDifficulty; groups: RawGroup[] }

interface OutGroup extends RawGroup { type: GroupType; decoys: string[] }

/**
 * AAA 2.10 [BEAT] — the acknowledged herring, with the thread it pretends to
 * be. `words` is the WHOLE set that shares the relation (the group it imitates
 * plus its intruders), so the room can match a selection against it: ≥3 of her
 * four tiles inside the set means she really was chasing this trap.
 */
/**
 * ROUND 11 adds `hidden-string`, and it is a correction as much as an
 * addition. A `Contains "HAM"` group's trap is HAMMER — a word with the
 * group's string buried in the middle of it — and that was being emitted as
 * `shared-affix`, the same label as four words that all end in -GHT. They are
 * not the same deduction and they do not deserve the same sentence: one is
 * "these share an edge", the other is "this one is hiding your group inside
 * it". The mislabel is also most of why the pool measured 68% shared-affix.
 */
type HerringRelation = 'rhyme' | 'shared-affix' | 'doubled-letter' | 'semantic' | 'hidden-string';
interface OutHerring {
  words: string[];
  relation: HerringRelation;
  /** The shared letters, when the relation is one you can point at. */
  detail?: string;
}

interface OutBoard extends WordWebPuzzle {
  /** Manor row band — authoritative (rows 0–2 / 3–4 / 5–6). */
  tier: Tier;
  groups: OutGroup[];
  ambiguousWords: string[];
  herrings: OutHerring[];
  layout: string[];
}

// ---------------------------------------------------------------------------
// The three manor tiers
// ---------------------------------------------------------------------------

/**
 * The authored difficulty is the *intent*; measured structure confirms it.
 *
 * ROUND 10: `medium` used to aim at tier 1, which meant NOTHING in the corpus
 * aimed at tier 2 — every tier-2 board in the shelf was a demoted tier-3 board
 * or a tier-3 board spilled by the cap. That was survivable at 51 boards and
 * absurd at 150: the middle of the house was furnished entirely with failures.
 * The four authored words now map onto the three shelves directly, and pass 2
 * still demotes anything that does not measure up.
 */
const INTENDED_TIER: Record<string, Tier> = {
  easy: 1, medium: 2, hard: 3, expert: 3,
};

interface RoomTierSpec {
  /** Trivia gimmes: allowed at the bottom of the house, banned at the top. */
  maxTrivia: number;
  minWordplay: number;
  /** Categories you must hear/unscramble rather than read off the tiles. */
  minSubtle: number;
  /**
   * ROUND 10 — the floor the bank may not compose away. `replaceGroups` was
   * free to swap EVERY authored category for a bank wordplay group, and on 29
   * of 152 shipped boards it had: four letter-puzzles in a row, no plain
   * English anywhere. That is not a Connections board, it is a cryptic
   * crossword with the clues removed, and it is exactly the "boring board"
   * the owner said to cut rather than pad the count with. Tier 1 — the row
   * the player stands on most nights — keeps two.
   *
   * PLAIN means "not a letter puzzle": semantic OR trivia. Counting only
   * `semantic` made the trivia gimme structurally impossible at tier 1 (two
   * semantics + a gimme leaves one slot, and the tier owes two wordplay), so
   * the composer ate every gimme in the pool to satisfy a floor that was
   * measuring the wrong thing. A trivia category is a category you read in
   * English; it belongs on this side of the line.
   */
  minPlain: number;
  /** The herring budget: how many planted traps, and how tight each must pull. */
  minHerrings: number;
  maxHerrings: number;
  minHerringScore: number;
}

/** Solver score at which a trap counts as a real pull, not a coincidence. */
const HERRING_TIGHT = 2;

const TIER_SPECS: Record<Tier, RoomTierSpec> = {
  // Round 7: tier 1's floor was 0, so 22 of 55 shipped boards carried an empty
  // trap list and the AAA 2.10 acknowledged-herring channel could never fire on
  // them. A tier-1 board still ships at most ONE loose trap — the near-clean
  // board is the point — but it must ship that one, and pass 2 drops any board
  // the planter cannot supply rather than shipping a room that can only say no.
  1: { maxTrivia: 1, minWordplay: 2, minSubtle: 0, minPlain: 2, minHerrings: 1, maxHerrings: 1, minHerringScore: 1 },
  2: { maxTrivia: 1, minWordplay: 2, minSubtle: 1, minPlain: 1, minHerrings: 1, maxHerrings: 2, minHerringScore: HERRING_TIGHT },
  3: { maxTrivia: 0, minWordplay: 2, minSubtle: 2, minPlain: 1, minHerrings: 2, maxHerrings: 3, minHerringScore: HERRING_TIGHT },
};

const here = dirname(fileURLToPath(import.meta.url));
const boards = JSON.parse(
  readFileSync(join(here, 'authored', 'word-web-boards.json'), 'utf8'),
) as RawBoard[];

// Every authored set is spoken for before the bank deals a single hand.
for (const b of boards) for (const g of b.groups) usedSets.add(setKey(g.words));

// ---------------------------------------------------------------------------
// 2.9 — trivia cap + wordplay floor via bank replacement, trivia → yellow
// ---------------------------------------------------------------------------

const TIER_ORDER = ['yellow', 'green', 'blue', 'purple'] as const;
const bankUse = new Map<string, number>();

/**
 * Compose `board` to satisfy `tier`'s category floors, then plant that tier's
 * traps. Returns null when the bank cannot supply what the tier needs (the
 * caller then tries the tier below) — a board is never shipped pretending to
 * a tier it does not structurally meet.
 */
function replaceGroups(
  board: RawBoard,
  tier: Tier,
  rng: () => number,
  /**
   * ROUND 11 (AAA 2.7 / 2.12) — WHICH COLOUR SLOT GIVES WAY.
   *
   * The victim order was hard-coded to TIER_ORDER, so the composer always ate
   * green first, then blue, then purple, and the shipped pool came out as one
   * template: 86 of 163 boards were yellow-semantic / green-semantic /
   * blue-wordplay / purple-wordplay, and every board was therefore solvable by
   * the same shortcut regardless of its words. The order is a parameter now
   * and `main` picks, per board, whichever admissible preference lands on the
   * least-represented composition — variety that costs the board nothing,
   * because every candidate has already passed the same fairness gates.
   */
  slotPref: readonly RawGroup['tier'][] = TIER_ORDER,
): RawBoard | null {
  const spec = TIER_SPECS[tier];
  let groups = board.groups.map((g) => ({ ...g, words: [...g.words] }));

  const typed = () => groups.map((g) => ({ g, type: typeOfTheme(g.theme) }));
  const count = (t: GroupType) => typed().filter((x) => x.type === t).length;
  const subtleCount = () => groups.filter((g) => isSubtleTheme(g.theme)).length;

  // Groups eligible for replacement, worst-first: trivia beyond this tier's
  // allowance, then blunt wordplay, then green/blue/purple semantics. At tier 1
  // the yellow semantic anchor stays; at tier 3 nothing is sacred but the
  // subtle groups we have already installed.
  const replacementOrder = (needWordplay = false): RawGroup[] => {
    const t = typed();
    const extraTrivia = t.filter((x) => x.type === 'trivia').slice(spec.maxTrivia).map((x) => x.g);
    const bluntWordplay = t
      .filter((x) => x.type === 'wordplay' && !isSubtleTheme(x.g.theme))
      .map((x) => x.g);
    // The semantic floor is spent before anything else is: once a board is
    // down to its last plain-English categories they stop being replaceable,
    // and the composer either finds a blunt-wordplay victim or gives up on
    // this tier (the caller then tries the tier below).
    const spare = count('semantic') + count('trivia') - spec.minPlain;
    const semantics = spare <= 0 ? [] : t
      .filter((x) => x.type === 'semantic' && (tier === 3 || x.g.tier !== 'yellow'))
      .sort((a, b) => slotPref.indexOf(a.g.tier) - slotPref.indexOf(b.g.tier))
      .map((x) => x.g)
      .slice(0, spare);
    // Last resort: a trivia category that is WITHIN the cap. Once the semantic
    // floor is real, a board of two semantics + one trivia + one wordplay has
    // no other way to reach the 2-wordplay floor, and the gimme is the least
    // valuable thing on it (2.9 caps trivia at one; it never requires one).
    const spareTrivia = t.filter((x) => x.type === 'trivia').slice(0, spec.maxTrivia).map((x) => x.g);
    // When the board is short of WORDPLAY, replacing one wordplay group with
    // another cannot help — offering blunt wordplay as a victim just spins the
    // loop until its guard trips and the whole board is refused. Ask only for
    // victims whose replacement actually moves the count.
    if (needWordplay) return [...extraTrivia, ...semantics, ...spareTrivia];
    return [...extraTrivia, ...semantics, ...bluntWordplay, ...spareTrivia];
  };

  const boardWords = () => new Set(groups.flatMap((g) => g.words));
  const boardThemes = () => new Set(groups.map((g) => g.theme));

  /**
   * A bank group may only land if the resulting board still has ZERO
   * unintended complete groupings (2.7). Without this the subtle bank happily
   * manufactures them — "Rhymes with EIGHT" next to an existing KNIGHT gives
   * four words sharing suffix GHT, which is exactly the failure the solver
   * refuses to ship.
   */
  const pickBankGroup = (from: BankGroup[], victim: RawGroup): BankGroup | null => {
    const words = boardWords();
    const themes = boardThemes();
    // Each candidate is a specific HAND out of a pool, and a hand that has
    // already shipped anywhere is not a candidate at all (round 11).
    const usable = from.flatMap(bankDraws).filter(
      (b) =>
        (bankUse.get(canon(b.theme)) ?? 0) < BANK_REUSE_CAP &&
        !themes.has(b.theme) &&
        !usedSets.has(setKey(b.words)) &&
        b.words.every((w) => !words.has(w)) &&
        boardFailures(
          groups.map((g) => (g === victim ? { theme: b.theme, tier: g.tier, words: b.words } : g)),
        ).length === 0,
    );
    if (usable.length === 0) return null;
    return pick(createRngFrom(rng), usable);
  };

  /** Themes this attempt drew from the bank (already counted by `swapIn`). */
  const fromBank = new Set<string>();

  const swapIn = (victim: RawGroup, bank: BankGroup) => {
    bankUse.set(canon(bank.theme), (bankUse.get(canon(bank.theme)) ?? 0) + 1);
    fromBank.add(canon(bank.theme));
    usedSets.add(setKey(bank.words));
    groups = groups.map((g) =>
      g === victim ? { theme: bank.theme, tier: g.tier, words: [...bank.words] } : g,
    );
  };

  /**
   * ROUND 12 (AAA 2.6 / volume-quality) — THE CAP BINDS THE AUTHORED FILE TOO.
   *
   * `bankUse` counted bank draws only, so the anti-wallpaper rule the file
   * documents never applied to the source the shelf actually grew from: "Two
   * Pairs of Double Letters" was authored onto 16 of 167 boards (7 of the 12
   * in the newest batch, whose word sets were near-clones of each other — the
   * pool is ~20 words wide and cannot supply 16 honest hands), and seven more
   * themes sat over budget. An authored group whose theme has already been
   * spent is a FORCED victim here, before any composition work, and it gives
   * way to a like-for-like replacement so the tier's floors are untouched:
   * subtle for subtle, wordplay for wordplay, and a plain category only when
   * the board can spare it.
   */
  // The spent set is fixed on entry. Reading `bankUse` live inside the loop
  // churns forever: the replacement's own count reaches the cap the moment it
  // is taken, so the next pass evicts the group it just installed.
  const spentThemes = new Set(
    groups.map((g) => canon(g.theme))
      .filter((t) => (bankUse.get(t) ?? 0) >= BANK_REUSE_CAP),
  );
  let capGuard = 0;
  for (;;) {
    const victim = groups.find((g) => spentThemes.has(canon(g.theme)));
    if (!victim) break;
    if (capGuard++ >= 4) return null;
    const plainSpare = count('semantic') + count('trivia') - spec.minPlain;
    const subtleSpare = subtleCount() - spec.minSubtle;
    const wordplayOk = typeOfTheme(victim.theme) === 'wordplay' || plainSpare > 0;
    // Like for like first — a subtle victim should leave a subtle category
    // behind it. But the subtle shelf is the narrow one, and refusing the
    // board outright when it happens to be empty deleted 22 boards (the whole
    // newest batch, which is where the over-used themes were concentrated) for
    // a floor the board still met. The blunt bank is allowed second, and only
    // while the tier's own subtle floor survives the swap.
    const bank = (isSubtleTheme(victim.theme) ? pickBankGroup(SUBTLE_BANK, victim) : null)
      ?? (wordplayOk && (!isSubtleTheme(victim.theme) || subtleSpare > 0)
        ? pickBankGroup(WORDPLAY_BANK, victim)
        : null);
    if (!bank) return null;
    swapIn(victim, bank);
  }

  // Enforce this tier's composition: trivia cap, wordplay floor, subtle floor.
  // A tier that still owes a SUBTLE category may only take a subtle group —
  // taking a blunt one instead is how a tier-3 board used to quietly ship with
  // tier-1 categories.
  let guard = 0;
  for (;;) {
    const trivia = count('trivia');
    const wordplay = count('wordplay');
    const subtle = subtleCount();
    const plain = count('semantic') + trivia;
    if (trivia <= spec.maxTrivia && wordplay >= spec.minWordplay
      && subtle >= spec.minSubtle && plain >= spec.minPlain) break;
    if (guard++ >= 6) return null;

    const victim = replacementOrder(wordplay < spec.minWordplay)
      .find((g) => !isSubtleTheme(g.theme));
    if (!victim) return null;
    const bank = subtle < spec.minSubtle
      ? pickBankGroup(SUBTLE_BANK, victim)
      : pickBankGroup(WORDPLAY_BANK, victim);
    if (!bank) return null;
    swapIn(victim, bank);
  }

  // --- plant the tier's traps -----------------------------------------------
  // Detection alone leaves the authored boards nearly trap-free, so the
  // generator PLANTS: it swaps a replaceable group for the bank group that
  // maximises tight traps (5th members and letter-rule intruders), never at
  // the cost of a complete unintended grouping or this tier's composition.
  const compositionOk = (gs: RawGroup[]): boolean => {
    const types = gs.map((g) => typeOfTheme(g.theme));
    return types.filter((t) => t === 'trivia').length <= spec.maxTrivia
      && types.filter((t) => t === 'wordplay').length >= spec.minWordplay
      && types.filter((t) => t !== 'wordplay').length >= spec.minPlain
      && gs.filter((g) => isSubtleTheme(g.theme)).length >= spec.minSubtle;
  };

  /**
   * ROUND 11 — the RELATION plant. 65 of 166 boards could only ever offer a
   * `hidden-string` trap, so no amount of choosing between what a board
   * already has could get the pool's dominant thread under budget: the supply
   * itself was monotone. Once a board's trap floor is met, the planter is
   * allowed ONE further swap whose only purpose is to give the room a second
   * kind of sentence to say — and only if it keeps every trap the board
   * already had, its composition, and its zero unintended groupings.
   */
  const RELATION_PRESSURE = BASE_RELATION_LOAD['doubled-letter'];
  let plants = 0;
  for (;;) {
    const have = tightTrapCount(groups, spec.minHerringScore);
    const needTraps = have < spec.minHerrings;
    const needRelation = !needTraps && plants === 0
      && relationCost(groups, spec.minHerringScore) > RELATION_PRESSURE;
    if ((!needTraps && !needRelation) || plants++ >= 4) break;
    const words = boardWords();
    const themes = boardThemes();
    let best: { victim: RawGroup; bank: BankGroup; traps: number; slot: number; rel: number } | null = null;
    for (const victim of groups) {
      for (const bank of WORDPLAY_BANK.flatMap(bankDraws)) {
        if ((bankUse.get(canon(bank.theme)) ?? 0) >= BANK_REUSE_CAP) continue;
        if (themes.has(bank.theme)) continue;
        if (usedSets.has(setKey(bank.words))) continue;
        if (bank.words.some((w) => words.has(w) && !victim.words.includes(w))) continue;
        const next = groups.map((g) =>
          g === victim ? { theme: bank.theme, tier: g.tier, words: [...bank.words] } : g);
        if (!compositionOk(next)) continue;
        if (boardFailures(next).length > 0) continue;
        const traps = tightTrapCount(next, spec.minHerringScore);
        // Round 11: among plants that buy the same number of traps, prefer the
        // one that lands on the slot this board's preference order names first
        // — the planter used to be a second, invisible source of the ssww
        // monoculture (it always swapped whichever group it met first) — and,
        // before that, the one whose traps can be NAMED with an under-used
        // relation. The planter reached for `Contains "X"` almost every time
        // (it scores 3, the highest there is), and `Contains "X"` is always a
        // shared-affix trap, which is most of why 68% of the shelf's
        // acknowledged herrings said the same thing.
        const slot = slotPref.indexOf(victim.tier);
        const rel = relationCost(next, spec.minHerringScore);
        // Traps BEYOND the tier's floor buy nothing (the budget caps what
        // ships), so the comparison saturates there and relation variety wins
        // from that point on. Without the saturation the planter always chose
        // the `Contains "X"` group — it scores 3, the highest there is — and
        // the whole shelf ended up saying the same sentence on a wrong guess.
        const reach = Math.min(traps, spec.minHerrings);
        const bestReach = Math.min(best?.traps ?? -1, spec.minHerrings);
        if (!best || reach > bestReach
          || (reach === bestReach && rel < best.rel - 1e-9)
          || (reach === bestReach && Math.abs(rel - best.rel) <= 1e-9 && traps > best.traps)
          || (reach === bestReach && Math.abs(rel - best.rel) <= 1e-9 && traps === best.traps
              && slot < best.slot)
          || (reach === bestReach && Math.abs(rel - best.rel) <= 1e-9 && traps === best.traps
              && slot === best.slot && bank.theme < best.bank.theme)) {
          best = { victim, bank, traps, slot, rel };
        }
      }
    }
    if (!best) break;
    if (needTraps && best.traps <= have) break;
    // A relation plant must not cost the board a trap, and must actually buy
    // the thread it was run for.
    if (needRelation && (best.traps < have
      || best.rel >= relationCost(groups, spec.minHerringScore) - 1e-9)) break;
    swapIn(best.victim, best.bank);
  }

  // Trivia always sits at the easiest tier: swap tiers with the yellow group.
  const trivia = groups.find((g) => typeOfTheme(g.theme) === 'trivia');
  if (trivia && trivia.tier !== 'yellow') {
    const yellow = groups.find((g) => g.tier === 'yellow')!;
    yellow.tier = trivia.tier;
    trivia.tier = 'yellow';
  }

  // Round 12: every SURVIVING authored theme is spent against the same cap the
  // bank pays (the bank's own draws were counted in `swapIn`). Without this
  // half the ledger was blank and the rule only bound half the corpus.
  for (const g of groups) {
    const k = canon(g.theme);
    if (!fromBank.has(k)) bankUse.set(k, (bankUse.get(k) ?? 0) + 1);
  }

  return { ...board, groups };
}

/** Deterministic sub-rng: fold the parent stream into a fresh seed. */
function createRngFrom(rng: () => number): () => number {
  return createRng(Math.floor(rng() * 0x7fffffff));
}

// ---------------------------------------------------------------------------
// 2.7 / 2.8 — the red-herring solver
// ---------------------------------------------------------------------------

const phonetics = loadPhonetics();

/**
 * All pattern-derived word sets on a board. Each carries the RELATION it is
 * built from (and, where you can point at it, the shared letters) so the trap
 * the solver finds can be named out loud in the room (AAA 2.10).
 */
interface PatternSet {
  key: string;
  relation: HerringRelation;
  detail?: string;
  words: Set<string>;
}

function patternSets(words: string[]): PatternSet[] {
  const sets = new Map<string, PatternSet>();
  const add = (key: string, relation: HerringRelation, detail: string | undefined, w: string) => {
    let s = sets.get(key);
    if (!s) sets.set(key, (s = { key, relation, detail, words: new Set() }));
    s.words.add(w);
  };
  for (const w of words) {
    if (w.length >= 5) add(`suffix:${w.slice(-3)}`, 'shared-affix', w.slice(-3), w);
    if (w.length >= 5) add(`prefix:${w.slice(0, 3)}`, 'shared-affix', w.slice(0, 3), w);
    /**
     * ROUND 12 (AAA 2.10 [BEAT] / 2.7) — THE DOUBLED LETTER MUST BE THE SAME
     * DOUBLED LETTER.
     *
     * This was one bucket: any word containing any doubled letter joined
     * `doubled-letter`, so the "thread" the room bought a wrong guess with was
     * "these words each contain some repeated character" — a property roughly
     * a third of English has, and a grouping no Connections player has ever
     * chased. 52 of the 55 shipped doubled-letter traps had NO doubled letter
     * in common (web-2's was CHILLY/GIRAFFE/MILLER/STAFF/THRILL/WILLOW;
     * web-4's ran DD, FF, OO, KK, EE, LL, CC, SS across six words), and the
     * room charged −2 steps to say "CURRENT, FURROW, KEEP double a letter."
     * The bar's model line ("they *do* all rhyme, don't they?") is informative
     * BECAUSE the relation is real; billing noise as a bought insight is the
     * round-6 misinformation defect in a tighter gate.
     *
     * One bucket per letter, and the letter travels as `detail`, so the room
     * can say "CURRENT, FURROW, SCURRY all double an R" — a thread the player
     * can check on the tiles and could genuinely have been following. Traps
     * that cannot meet it now simply do not exist, which is the demotion the
     * finding asked for: a board with one honest trap beats one with a fake.
     *
     * It also makes `patternFailures` honest in the other direction. The old
     * bucket failed a build when any four words on a board happened to contain
     * any doubled letters — an "unintended complete grouping" nobody could
     * have seen — while four words that genuinely all double an L slid past
     * inside the noise.
     */
    for (const m of new Set((w.match(/([A-Z])\1/g) ?? []).map((p) => p[0]!))) {
      add(`doubled:${m}${m}`, 'doubled-letter', `${m}${m}`, w);
    }
    for (const key of phonetics.rhymeKeysOf(w.toLowerCase())) add(`rhyme:${key}`, 'rhyme', undefined, w);
  }
  return [...sets.values()];
}

/**
 * Cross-board semantic heuristic: another board's intended group acts as a
 * semantic cluster; if ≥4 of its words appear on THIS board, that's a
 * complete unintended semantic grouping.
 */
function crossBoardClusters(board: RawBoard, all: RawBoard[]): { name: string; words: string[] }[] {
  const here = new Set(board.groups.flatMap((g) => g.words));
  const found: { name: string; words: string[] }[] = [];
  for (const other of all) {
    if (other.id === board.id) continue;
    for (const g of other.groups) {
      const overlap = g.words.filter((w) => here.has(w));
      if (overlap.length >= 4) found.push({ name: `${other.id}:"${g.theme}"`, words: overlap });
    }
  }
  return found;
}

/**
 * Semantic 5th-member traps, verified by the corpus rather than guessed at:
 * when three of this board's words sit together inside ANOTHER authored
 * board's category, and two of them belong to one group here while the third
 * belongs elsewhere, that third word genuinely reads as a fifth member. Worth
 * the same as a letter-pattern 5th member (HERRING_TIGHT) — it is the one
 * semantic pull we can prove.
 */
function crossBoardTrapSets(board: RawBoard, all: RawBoard[]): Trap[] {
  const groupOf = new Map<string, RawGroup>();
  for (const g of board.groups) for (const w of g.words) groupOf.set(w, g);
  const traps: Trap[] = [];
  for (const other of all) {
    if (other.id === board.id) continue;
    for (const g of other.groups) {
      const overlap = g.words.filter((w) => groupOf.has(w));
      if (overlap.length !== 3) continue;
      const byGroup = new Map<RawGroup, string[]>();
      for (const w of overlap) {
        const own = groupOf.get(w)!;
        byGroup.set(own, [...(byGroup.get(own) ?? []), w]);
      }
      if (byGroup.size !== 2) continue;
      const minority = [...byGroup.values()].find((ws) => ws.length === 1);
      if (minority) {
        traps.push({
          key: `semantic:${other.id}:${g.theme}`,
          words: overlap,
          intruders: [minority[0]!],
          relation: 'semantic',
          score: HERRING_TIGHT,
        });
      }
    }
  }
  return traps;
}

function sameMembers(a: Iterable<string>, b: string[]): boolean {
  const s = new Set(a);
  return b.length === s.size && b.every((w) => s.has(w));
}

/**
 * Intra-board half of the 2.7 solver: complete unintended groupings formed by
 * a shared letter/sound pattern. Used both by solveBoard and, at composition
 * time, to veto a bank swap that would create one.
 */
/**
 * ROUND 12 — THE COMPOSER MUST SEE THE CLUSTER VETO TOO.
 *
 * `pickBankGroup` and the planter vetoed a swap that would create an
 * unintended complete grouping *by pattern*, but not one created by SEMANTICS
 * — four words that are somebody else's whole category. That check only ran in
 * pass 2, where it is a hard build failure, so every widening of the bank
 * turned into a game of whack-a-mole: install a rhyme pool, watch an unrelated
 * board fail because its new hand happened to complete another board's
 * `Contains "ICE"`. Every composed group is either an authored group or a bank
 * hand, so the union of those two IS the universe of categories a board can
 * accidentally complete, and it can be indexed by word once and asked in
 * sixteen lookups.
 */
const CORPUS_SETS: string[][] = [];
const CORPUS_INDEX = new Map<string, number[]>();
function indexCorpusSets(sets: readonly (readonly string[])[]): void {
  for (const words of sets) {
    const i = CORPUS_SETS.push([...words]) - 1;
    for (const w of words) CORPUS_INDEX.set(w, [...(CORPUS_INDEX.get(w) ?? []), i]);
  }
}

/** Somebody else's whole category, complete on this board. */
function clusterFailures(groups: readonly RawGroup[]): string[] {
  const here = new Set(groups.flatMap((g) => g.words));
  const hits = new Map<number, number>();
  for (const w of here) {
    for (const i of CORPUS_INDEX.get(w) ?? []) hits.set(i, (hits.get(i) ?? 0) + 1);
  }
  const out: string[] = [];
  for (const [i, n] of hits) {
    if (n < 4) continue;
    const overlap = CORPUS_SETS[i]!.filter((w) => here.has(w));
    if (groups.some((g) => sameMembers(overlap, g.words))) continue;
    out.push(`semantic cluster: ${overlap.join(', ')}`);
  }
  return out;
}

/** Every unintended complete grouping a board can carry, pattern or semantic. */
function boardFailures(groups: readonly RawGroup[]): string[] {
  return [...patternFailures(groups), ...clusterFailures(groups)];
}

function patternFailures(groups: readonly RawGroup[]): string[] {
  const words = groups.flatMap((g) => g.words);
  const intended = groups.map((g) => g.words);
  const failures: string[] = [];
  for (const ps of patternSets(words)) {
    if (ps.words.size === 4 && !intended.some((g) => sameMembers(ps.words, g))) {
      failures.push(`pattern ${ps.key}: ${[...ps.words].join(', ')}`);
    }
  }
  return failures;
}

/**
 * Returns build-failing unintended complete groupings and every scored trap
 * the solver found, tightest first. The tier gate decides how many of them
 * actually ship (`minHerringScore` / `maxHerrings`).
 */
interface ScoredHerring { word: string; score: number }

/**
 * A discovered trap: the whole set of words that share a relation, which of
 * them are the intruders (the words the set makes look like they belong when
 * they do not), and what the relation IS. Round 7: this used to return only a
 * word→score map, which is why the room could charge for a wrong guess and
 * then say nothing but "no" — the relation existed at build time and was
 * thrown away before it reached the player (AAA 2.10 [BEAT]).
 */
interface Trap {
  key: string;
  words: string[];
  intruders: string[];
  relation: HerringRelation;
  detail?: string;
  score: number;
}

/**
 * Trap discovery, extracted so composition can *plant* traps rather than only
 * discover them (round 4: tier 3 must ship 2–3 tight ones). Score ≥ 2 means a
 * real pull — a 5th member of a complete group, or a word that literally
 * satisfies another group's stated letter rule.
 */
function findTraps(groups: readonly RawGroup[]): Trap[] {
  const words = groups.flatMap((g) => g.words);
  const groupOf = new Map<string, RawGroup>();
  for (const g of groups) for (const w of g.words) groupOf.set(w, g);
  const traps: Trap[] = [];

  for (const ps of patternSets(words)) {
    const set = [...ps.words];
    if (set.length === 5 || set.length === 6) {
      // A full group + 1–2 extras sharing its pattern: 5th-member traps.
      const byGroup = new Map<RawGroup, string[]>();
      for (const w of set) {
        const g = groupOf.get(w)!;
        byGroup.set(g, [...(byGroup.get(g) ?? []), w]);
      }
      const dominant = [...byGroup.entries()].find(([, ws]) => ws.length === 4);
      if (dominant) {
        traps.push({
          key: ps.key,
          words: set,
          intruders: set.filter((w) => groupOf.get(w) !== dominant[0]),
          relation: ps.relation,
          detail: ps.detail,
          score: 2,
        });
      }
    }
    if (set.length === 3) {
      // Three words sharing a visible pattern across two groups: the minority
      // word(s) read as belonging with the pair — soft cross-category traps.
      const counts = new Map<RawGroup, number>();
      for (const w of set) counts.set(groupOf.get(w)!, (counts.get(groupOf.get(w)!) ?? 0) + 1);
      if (counts.size === 2) {
        const minority = [...counts.entries()].find(([, n]) => n === 1);
        if (minority) {
          traps.push({
            key: ps.key,
            words: set,
            intruders: set.filter((w) => groupOf.get(w) === minority[0]),
            relation: ps.relation,
            detail: ps.detail,
            score: 1,
          });
        }
      }
    }
  }

  // "Contains X" themes are letter-verifiable: an outside word containing X is
  // a cross-category trap for that group.
  //
  // ROUND 7 BUG FIX: this pattern used to require STRAIGHT U+0022 quotes. The
  // round-6 typography pass set every authored theme in curly quotes, so from
  // that moment the tightest, most nameable trap class on the board — "OUT",
  // "EAR", "OVER", "IGHT" and eleven more — scored ZERO on every authored
  // group, and only survived on the straight-quoted bank groups. Four boards
  // shipped trap-free purely because of a quotation mark. Both handednesses
  // are accepted, and `typeset()` is idempotent, so this holds whichever way
  // the authored file is set.
  for (const g of groups) {
    const m = g.theme.match(/^Contains [“"]([A-Z]+)[”"]$/);
    if (!m) continue;
    const outside = words.filter((w) => groupOf.get(w) !== g && w.includes(m[1]!));
    if (outside.length === 0) continue;
    traps.push({
      key: `contains:${m[1]!}`,
      words: [...g.words, ...outside],
      intruders: outside,
      relation: 'hidden-string',
      detail: m[1]!,
      score: 3,
    });
  }

  return traps;
}

/** The per-word herring score the tier gates read, folded out of the traps. */
function scoresOf(traps: readonly Trap[]): ScoredHerring[] {
  const herringScore = new Map<string, number>();
  for (const t of traps) {
    for (const w of t.intruders) herringScore.set(w, (herringScore.get(w) ?? 0) + t.score);
  }
  return [...herringScore.entries()]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .map(([word, score]) => ({ word, score }));
}

const EMPTY: ReadonlySet<string> = new Set();

/**
 * ROUND 12 (AAA 2.7 [BEAT]) — A TIER'S TRAP FLOOR COUNTS THREADS, NOT WORDS.
 *
 * `TIER_SPECS[3]` says `minHerrings: 2` and the file docstring says "tier 3
 * must ship 2–3 traps". What was measured was `ambiguousWords.length` — the
 * flat INTRUDER-WORD list — and what shipped was `herrings.length`, the named
 * threads, which `herringSets` dedupes by pattern key. Two intruder words
 * caught by the same `suffix:GHT` are one trap and one sentence; they counted
 * as two. Result: 25 of the 52 shipped tier-3 boards carried exactly ONE
 * named trap while passing a 2-trap check, so the row the player pays the most
 * steps to reach ran at tier-1 trap density on 48% of its boards and no test
 * could see it.
 *
 * Selection is therefore done in threads from here on. Each chosen trap must
 * contribute a NEW pattern key AND a NEW intruder word, which makes
 * `herrings.length === ambiguousWords.length` an invariant rather than a
 * coincidence, and makes the tier floor mean what it says. Eligibility is
 * unchanged: a word is a candidate intruder when its aggregate herring score
 * clears the tier's `minHerringScore`.
 */
function chooseTraps(
  traps: readonly Trap[],
  eligible: readonly ScoredHerring[],
  max: number,
  cost: (trap: Trap, intruder: string) => number,
): { trap: Trap; intruder: string }[] {
  const score = new Map(eligible.map((h) => [h.word, h.score] as const));
  // A set of fewer than 3 words can never satisfy the room's ≥3-of-4 match
  // rule, so it would be a trap the player can never actually trip.
  const usable = traps.filter(
    (t) => t.words.length >= 3 && t.intruders.some((w) => score.has(w)),
  );
  const bestIntruder = (t: Trap, taken: ReadonlySet<string>): string | null =>
    t.intruders
      .filter((w) => score.has(w) && !taken.has(w))
      .sort((a, b) => score.get(b)! - score.get(a)! || (a < b ? -1 : 1))[0] ?? null;

  const none = EMPTY;
  const ranked = [...usable].sort((a, b) =>
    cost(a, bestIntruder(a, none)!) - cost(b, bestIntruder(b, none)!)
    || b.score - a.score || (a.key < b.key ? -1 : 1));

  const out: { trap: Trap; intruder: string }[] = [];
  const keys = new Set<string>();
  const taken = new Set<string>();
  for (const t of ranked) {
    if (out.length >= max) break;
    if (keys.has(t.key)) continue;
    // Prefer a word no other shipped thread has claimed — the intruder list
    // is what the opening layout clusters on and what the priced intruder hint
    // draws from, so spreading it is worth something. But two threads MAY name
    // the same word: HAMMER caught by `contains:HAM` and by `suffix:MER` is two
    // different sentences about two different sets, and refusing the second one
    // cost the top shelf fifteen boards for no gain the player can feel.
    const intruder = bestIntruder(t, taken) ?? bestIntruder(t, EMPTY);
    if (!intruder) continue;
    keys.add(t.key);
    taken.add(intruder);
    out.push({ trap: t, intruder });
  }
  return out;
}

/** How many DISTINCT threads this trap list can acknowledge at `minScore`. */
function trapCapacity(traps: readonly Trap[], minScore: number): number {
  const eligible = scoresOf(traps).filter((h) => h.score >= minScore);
  return chooseTraps(traps, eligible, Number.POSITIVE_INFINITY, () => 0).length;
}

/** The same measurement, for a board the composer is still assembling. */
function tightTrapCount(groups: readonly RawGroup[], minScore: number): number {
  return trapCapacity(findTraps(groups), minScore);
}

/**
 * ROUND 11 — how tired the relations this board's tight traps can be named
 * with already are, as a pool-wide share (0 = a thread nothing has used yet).
 * Read by the planter so it stops reaching for `Contains "X"` every time.
 */
function relationCost(groups: readonly RawGroup[], minScore: number): number {
  const total = Math.max(1, [...relTally.values()].reduce((a, b) => a + b, 0));
  const relations = new Set(
    findTraps(groups).filter((t) => t.score >= minScore).map((t) => t.relation),
  );
  if (relations.size === 0) return 1;
  return Math.min(...[...relations].map(
    (r) => (relTally.get(r) ?? 0) / total + BASE_RELATION_LOAD[r],
  ));
}

/**
 * Composition (pass 1) runs to completion BEFORE a single herring is assigned
 * (pass 2), so the live `relTally` is empty while the planter is choosing and
 * cannot steer it. This is the standing prior it uses instead: how oversupplied
 * each thread is in the corpus as written. `hidden-string` is the glut — every
 * `Contains "X"` group generates one and the trap scores 3, the highest there
 * is — and `semantic` is the scarcity. Small enough (≤0.06) that a live tally
 * still outvotes it once pass 2 is running.
 */
const BASE_RELATION_LOAD: Record<HerringRelation, number> = {
  'hidden-string': 0.06,
  'shared-affix': 0.04,
  'doubled-letter': 0.02,
  rhyme: 0.02,
  semantic: 0,
};

function solveBoard(
  board: RawBoard,
  all: RawBoard[],
): { failures: string[]; herrings: ScoredHerring[]; traps: Trap[] } {
  const failures = patternFailures(board.groups);
  const intended = board.groups.map((g) => g.words);

  // Cross-board semantic clusters.
  for (const cluster of crossBoardClusters(board, all)) {
    if (!intended.some((g) => sameMembers(cluster.words, g))) {
      failures.push(`semantic cluster ${cluster.name}: ${cluster.words.join(', ')}`);
    }
  }

  // Letter/sound traps plus the corpus-verified semantic ones.
  const traps = [...findTraps(board.groups), ...crossBoardTrapSets(board, all)];
  return { failures, herrings: scoresOf(traps), traps };
}

// ---------------------------------------------------------------------------
// 2.6 — adversarial opening layout
// ---------------------------------------------------------------------------

function rowOf(i: number): number {
  return Math.floor(i / 4);
}

/** No row may hold 3+ words of one intended group (gift rows). */
function hasGiftRow(order: string[], groupIndex: Map<string, number>): boolean {
  for (let r = 0; r < 4; r++) {
    const counts = new Map<number, number>();
    for (let c = 0; c < 4; c++) {
      const gi = groupIndex.get(order[r * 4 + c]!)!;
      counts.set(gi, (counts.get(gi) ?? 0) + 1);
      if (counts.get(gi)! >= 3) return true;
    }
  }
  return false;
}

/** Needs only an id and the composed groups — asks for exactly that. */
function buildLayout(
  board: { id: string; groups: readonly RawGroup[] },
  herrings: string[],
  seed: number,
): string[] {
  const words = board.groups.flatMap((g) => g.words);
  const groupIndex = new Map<string, number>();
  board.groups.forEach((g, i) => g.words.forEach((w) => groupIndex.set(w, i)));

  for (let attempt = 0; attempt < 400; attempt++) {
    const rng = createRng(seed + attempt * 7919);
    const rest = shuffle(rng, words.filter((w) => !herrings.includes(w)));
    // Cluster the herrings adjacently, at a spot that varies per board.
    const cluster = shuffle(rng, [...herrings]);
    const insertAt = herrings.length > 0 ? Math.floor(rng() * (rest.length + 1)) : 0;
    const order = [...rest.slice(0, insertAt), ...cluster, ...rest.slice(insertAt)];
    if (!hasGiftRow(order, groupIndex)) return order;
  }
  // Constraint could not be met (should not happen with 4x4 groups).
  throw new Error(`${board.id}: could not build an adversarial layout`);
}

// ---------------------------------------------------------------------------
// 2.11 — decoy labels for the act of naming
// ---------------------------------------------------------------------------

/** Needs only an id and the composed groups — asks for exactly that. */
function assignDecoys(finals: { id: string; groups: OutGroup[] }[]): void {
  for (const board of finals) {
    const rng = createRng([...board.id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, SEED));
    const own = new Set(board.groups.map((g) => g.theme));
    for (const g of board.groups) {
      const pool = finals
        .filter((b) => b.id !== board.id)
        .flatMap((b) => b.groups.filter((x) => x.tier === g.tier).map((x) => x.theme))
        .filter((t) => !own.has(t));
      const decoys: string[] = [];
      let guard = 0;
      while (decoys.length < 2 && guard++ < 200 && pool.length > 0) {
        const t = pick(rng, pool);
        if (!decoys.includes(t)) decoys.push(t);
      }
      g.decoys = decoys;
    }
  }
}

// ---------------------------------------------------------------------------
// Build + validate
// ---------------------------------------------------------------------------

/** Does this composed board satisfy `tier`'s category + herring gates? */
function meetsTier(board: RawBoard, traps: readonly Trap[], tier: Tier): boolean {
  const spec = TIER_SPECS[tier];
  const types = board.groups.map((g) => typeOfTheme(g.theme));
  if (types.filter((t) => t === 'trivia').length > spec.maxTrivia) return false;
  if (types.filter((t) => t === 'wordplay').length < spec.minWordplay) return false;
  if (types.filter((t) => t !== 'wordplay').length < spec.minPlain) return false;
  if (board.groups.filter((g) => isSubtleTheme(g.theme)).length < spec.minSubtle) return false;
  // Round 12: THREADS, not intruder words — see `chooseTraps`. A board that
  // cannot reach its tier's floor in distinct traps demotes to the tier below
  // rather than shipping at tier-1 trap density with a tier-3 label.
  return trapCapacity(traps, spec.minHerringScore) >= spec.minHerrings;
}

// ---------------------------------------------------------------------------
// ROUND 11 — THE ARCHITECTURE BUDGET (AAA 2.7 / 2.12)
//
// The herring budget was met board by board and violated pool-wide. Measured
// on the round-10 shelf: 86 of 163 boards carried the identical group-type
// signature (yellow semantic / green semantic / blue wordplay / purple
// wordplay); the planted herring's home group sat in the same colour slot on
// 111 of 161 traps; and 119 of 175 named traps were `shared-affix`. So every
// board was solvable by one learned shortcut — find the substring group, find
// the fifth word containing that substring, hand it to a semantic group —
// whatever its words were. The individual traps are good; 163 boards of one
// architecture is volume, not variety, and Connections varies its architecture
// day to day precisely so the meta cannot be learned.
//
// These four tallies are the pool-wide budget. Nothing here can make a board
// unfair: every candidate the steering chooses between has already passed the
// same per-board gates (2.7's zero unintended groupings, 2.8's uniqueness,
// 2.9's composition floors, the tier's trap tightness). The budget only
// decides WHICH of several equally legal boards ships.
// ---------------------------------------------------------------------------

type Slot = RawGroup['tier'];

/** How often each group-type signature (by colour slot) has shipped. */
const sigTally = new Map<string, number>();
/** How often a shipped trap's home group sat in each colour slot. */
const homeTally = new Map<Slot, number>();
/** How often each relation has been the named thread of a shipped trap. */
const relTally = new Map<HerringRelation, number>();

/** yellow/green/blue/purple → 's' | 't' | 'w'. The board's architecture. */
function signatureOf(groups: readonly RawGroup[]): string {
  return TIER_ORDER
    .map((slot) => groups.find((g) => g.tier === slot))
    .map((g) => (g ? typeOfTheme(g.theme)[0]! : '?'))
    .join('');
}

/** The four admissible victim orders `main` chooses between. */
const SLOT_PREFS: readonly (readonly Slot[])[] = [
  ['green', 'blue', 'purple', 'yellow'],
  ['purple', 'blue', 'green', 'yellow'],
  ['blue', 'green', 'purple', 'yellow'],
  ['purple', 'green', 'blue', 'yellow'],
];

/**
 * The other half of the signature spread, and the half that reaches the boards
 * the composer never touches. Two thirds of the shelf needs no bank help at
 * all — it is authored to the floors already — so victim order alone cannot
 * move it: those boards ship the shape they were written in, and they were all
 * written in the same shape (plain English at the top of the difficulty
 * ladder, letter puzzles at the bottom of it).
 *
 * Swapping which COLOUR two groups wear is the one lever that is free here.
 * It is not a new kind of move — the generator already reassigns colours to
 * keep the trivia gimme at yellow — and it is a claim about difficulty
 * ORDERING, not about fairness: nothing else on the board changes. YELLOW IS
 * NEVER TOUCHED (it is the gimme, and 2.9 pins the trivia category to it), so
 * the easiest group stays the easiest group and 2.12's tester rule is
 * unaffected; the swaps only reorder the three graded slots beneath it.
 */
const SLOT_SWAPS: readonly (readonly [Slot, Slot] | null)[] = [
  null,
  ['green', 'blue'], ['green', 'purple'], ['blue', 'purple'],
  // Yellow moves ONLY on a board with no trivia category (2.9 pins the gimme
  // there). Without these three the spread has a hard floor: a board composed
  // of one plain category and three letter-puzzles has exactly one arrangement
  // if yellow is frozen, and 38% of the shelf is that composition.
  ['yellow', 'green'], ['yellow', 'blue'], ['yellow', 'purple'],
];

function withSlotSwap(board: RawBoard, swap: readonly [Slot, Slot] | null): RawBoard {
  if (!swap) return board;
  const [a, b] = swap;
  return {
    ...board,
    groups: board.groups.map((g) => ({
      ...g,
      tier: g.tier === a ? b : g.tier === b ? a : g.tier,
    })),
  };
}

/**
 * The traps this tier actually ships: tight enough, capped by the budget, and
 * — round 11 — chosen so the pool spreads its traps across the four colour
 * slots and the four relations instead of piling them all on one of each.
 * Score still decides between equals; the tallies only break the ties that
 * `slice(0, maxHerrings)` used to break by alphabet.
 */
function shippedHerrings(
  board: RawBoard,
  herrings: ScoredHerring[],
  traps: readonly Trap[],
  tier: Tier,
): { ship: string[]; named: OutHerring[] } {
  const spec = TIER_SPECS[tier];
  const eligible = herrings.filter((h) => h.score >= spec.minHerringScore);
  const slotOf = new Map<string, Slot>();
  for (const g of board.groups) for (const w of g.words) slotOf.set(w, g.tier);

  // Shares, not raw counts: there are four colour slots and five relations but
  // they fill at wildly different rates, and summing the raw tallies let the
  // bigger number decide every tie on its own.
  const homeTotal = Math.max(1, [...homeTally.values()].reduce((a, b) => a + b, 0));
  const relTotal = Math.max(1, [...relTally.values()].reduce((a, b) => a + b, 0));
  const cost = (trap: Trap, word: string): number => {
    const home = (homeTally.get(slotOf.get(word)!) ?? 0) / homeTotal;
    const rel = (relTally.get(trap.relation) ?? 0) / relTotal;
    // The relation is weighted heavier because it is the thing the room SAYS
    // out loud on a wrong guess (AAA 2.10); a shelf whose every acknowledged
    // herring says "they do all share those letters" is one learnable trap.
    return home + rel * 4;
  };

  // ROUND 12: one pick per THREAD (see `chooseTraps`) — a distinct pattern key
  // each — so the tier's floor and the room's stock of sentences are the same
  // number. Round 11 chose intruder WORDS and then named whatever trap each
  // happened to fall in, which is how two words inside one `suffix:GHT` shipped
  // as "two traps" and spoke once. `ambiguousWords` is derived from the picks
  // and deduped; it is the layout's clustering list, not the budget.
  const picks = chooseTraps(traps, eligible, spec.maxHerrings, cost);

  const ship: string[] = [];
  const named: OutHerring[] = [];
  for (const { trap, intruder } of picks) {
    if (!ship.includes(intruder)) ship.push(intruder);
    homeTally.set(slotOf.get(intruder)!, (homeTally.get(slotOf.get(intruder)!) ?? 0) + 1);
    relTally.set(trap.relation, (relTally.get(trap.relation) ?? 0) + 1);
    named.push({
      words: [...trap.words].sort(),
      relation: trap.relation,
      ...(trap.detail ? { detail: trap.detail } : {}),
    });
  }
  return { ship, named };
}

/**
 * The authoring loop (round 10). Diagnoses every authored board AS WRITTEN —
 * before any bank substitution — against the tier its `difficulty` claims, and
 * never throws. Composition shortfalls the bank can cover are reported as
 * `wants` (the generator will patch them, at the cost of a bank slot); the two
 * things the bank cannot cover — an unintended complete grouping and a gated
 * word — are reported as `BROKEN` and must be fixed in the JSON.
 */
function report(): void {
  let broken = 0;
  let short = 0;
  for (const b of boards) {
    const tier = INTENDED_TIER[b.difficulty] ?? 1;
    const spec = TIER_SPECS[tier];
    const words = b.groups.flatMap((g) => g.words);
    const hard: string[] = [];
    const soft: string[] = [];

    if (new Set(words).size !== 16) hard.push(`${new Set(words).size} unique words`);
    if (new Set(b.groups.map((g) => g.tier)).size !== 4) hard.push('group tiers not distinct');
    for (const w of words) if (!toneOk(w.toLowerCase())) hard.push(`tone gate: ${w}`);
    hard.push(...patternFailures(b.groups));
    for (const c of crossBoardClusters(b, boards)) {
      if (!b.groups.some((g) => sameMembers(c.words, g.words))) {
        hard.push(`semantic cluster ${c.name}: ${c.words.join(', ')}`);
      }
    }

    const types = b.groups.map((g) => typeOfTheme(g.theme));
    const trivia = types.filter((t) => t === 'trivia').length;
    const wordplay = types.filter((t) => t === 'wordplay').length;
    const subtle = b.groups.filter((g) => isSubtleTheme(g.theme)).length;
    if (trivia > spec.maxTrivia) soft.push(`trivia ${trivia} > ${spec.maxTrivia}`);
    if (wordplay < spec.minWordplay) soft.push(`wordplay ${wordplay} < ${spec.minWordplay}`);
    if (subtle < spec.minSubtle) soft.push(`subtle ${subtle} < ${spec.minSubtle}`);
    const tight = tightTrapCount(b.groups, spec.minHerringScore);
    if (tight < spec.minHerrings) soft.push(`traps ${tight} < ${spec.minHerrings} @score≥${spec.minHerringScore}`);

    if (hard.length > 0) {
      broken++;
      console.log(`BROKEN ${b.id} (t${tier}) — ${hard.join(' ; ')}`);
    } else if (soft.length > 0) {
      short++;
      console.log(`wants  ${b.id} (t${tier}) — ${soft.join(' ; ')}`);
    }
  }
  const byTier = ([1, 2, 3] as Tier[])
    .map((t) => `t${t}: ${boards.filter((b) => (INTENDED_TIER[b.difficulty] ?? 1) === t).length}`)
    .join(', ');
  console.log(`\n${boards.length} authored boards (${byTier}) — ${broken} broken, ${short} needing bank help.`);
}

function main() {
  const rng = createRng(SEED);

  // Pass 1: compose each board for its INTENDED tier (trivia cap, wordplay
  // floor, subtlety floor). The authored difficulty is the intent; pass 2
  // decides whether the board's measured traps earn it.
  const intent = new Map<string, Tier>(
    boards.map((b) => [b.id, INTENDED_TIER[b.difficulty] ?? 1]),
  );
  const composedTier = new Map<string, Tier>();
  // The composer mutates two globals (which bank themes and which 4-word sets
  // are spoken for), so a speculative attempt has to be undoable.
  const snap = () => ({ bank: new Map(bankUse), sets: new Set(usedSets) });
  const restore = (s: { bank: Map<string, number>; sets: Set<string> }) => {
    bankUse.clear();
    for (const [k, v] of s.bank) bankUse.set(k, v);
    usedSets.clear();
    for (const k of s.sets) usedSets.add(k);
  };

  /**
   * ROUND 12 — a board whose categories are all already spent LEAVES.
   *
   * This used to throw. That was right while the only thing that could
   * exhaust was the bank (an exhausted bank is a generator bug), and wrong the
   * moment the anti-wallpaper cap started binding authored themes: a board
   * written entirely out of categories three other boards already used has
   * nothing of its own to say, and the honest outcome is the one the rest of
   * the file already takes — it leaves rather than lowering the floor for
   * everyone else. The pool-size floors (tests/content.test.ts ≥150 total,
   * tests/puzzles/anchors.test.ts ≥45 per tier) are what police the total.
   */
  const unbuildable: string[] = [];
  const composed: RawBoard[] = boards.flatMap((b): RawBoard[] => {
    for (let t = intent.get(b.id)!; t >= 1; t--) {
      const before = snap();
      /**
       * ROUND 11 (the architecture budget) — try every admissible victim
       * order and keep whichever produces the LEAST-shipped composition. All
       * of them have passed the same tier gates by the time they are compared,
       * so this buys variety at no cost to fairness; the tally is what stops
       * the pool converging on one template again.
       */
      let best: { board: RawBoard; state: ReturnType<typeof snap>; seen: number } | null = null;
      for (const pref of SLOT_PREFS) {
        restore(before);
        const attempt = replaceGroups(b, t as Tier, rng, pref);
        if (!attempt) continue;
        const state = snap();
        for (const swap of SLOT_SWAPS) {
          const variant = withSlotSwap(attempt, swap);
          // The trivia gimme is pinned to yellow (2.9) and yellow is never
          // swapped, so a variant can never move it; assert the invariant
          // rather than trust it.
          if (variant.groups.some((g) => typeOfTheme(g.theme) === 'trivia' && g.tier !== 'yellow')) continue;
          // Novelty decides, but a board that KEEPS its authored trivia gimme
          // gets a head start: the composer is allowed to eat a within-cap
          // trivia category as a last resort to reach the wordplay floor, and
          // with a full bank it started doing that often enough to strip the
          // gimme off the bottom of the house entirely (AAA 2.9 caps trivia at
          // one and pins it to yellow; it never asked for zero).
          const gimme = variant.groups.some((g) => typeOfTheme(g.theme) === 'trivia');
          const seen = (sigTally.get(signatureOf(variant.groups)) ?? 0) - (gimme ? 3 : 0);
          if (!best || seen < best.seen) best = { board: variant, state, seen };
        }
        if (best?.seen === 0) break;   // nothing beats a shape nobody has shipped
      }
      if (best) {
        restore(best.state);
        const sig = signatureOf(best.board.groups);
        sigTally.set(sig, (sigTally.get(sig) ?? 0) + 1);
        composedTier.set(b.id, t as Tier);
        return [best.board];
      }
      restore(before);
    }
    unbuildable.push(b.id);
    return [];
  });

  // Pass 2: herring solver → tier confirmation (demote, never fake) → layout.
  const allFailures: string[] = [];
  const solved = composed.map((b) => ({ board: b, ...solveBoard(b, composed) }));
  for (const s of solved) for (const f of s.failures) allFailures.push(`${s.board.id}: ${f}`);
  if (allFailures.length > 0) {
    console.error(allFailures.join('\n'));
    throw new Error(`word-web solver found ${allFailures.length} unintended complete grouping(s) — fix the authored boards`);
  }

  let demoted = 0;
  const built: OutBoard[] = solved.map(({ board: b, herrings, traps }) => {
    const wanted = composedTier.get(b.id)!;
    let tier = wanted;
    while (tier > 1 && !meetsTier(b, traps, tier)) tier = (tier - 1) as Tier;
    if (tier !== wanted) demoted++;
    const { ship, named } = shippedHerrings(b, herrings, traps, tier);
    const layout = buildLayout(b, ship, SEED + [...b.id].reduce((h, c) => h + c.charCodeAt(0), 0));
    return {
      id: b.id,
      tier,
      groups: b.groups.map((g) => ({ ...g, type: typeOfTheme(g.theme), decoys: [] as string[] })),
      ambiguousWords: ship,
      herrings: named,
      layout,
    };
  });

  // Round 7: a board with no trap is a board on which AAA 2.10's acknowledged
  // herring can never fire — the wrong guess buys nothing but "no". Drop it
  // rather than ship a night where the Library is Connections with our prices.
  //
  // ROUND 10 adds the second half of that sentence. Demotion lands a board on
  // a tier it was not composed for, and tier 1 asks for something tier 2 does
  // not — two plain-English categories. A board that arrives at the bottom of
  // the house one category short is not "nearly right", it is a board the
  // composer never built; it leaves rather than lowering the floor for
  // everyone else.
  const shipsHere = (b: OutBoard): boolean => {
    const spec = TIER_SPECS[b.tier];
    const types = b.groups.map((g) => g.type);
    // Round 12: the floor is NAMED THREADS — the number of different sentences
    // the room can say on a wrong guess — not the length of the intruder list.
    return b.herrings.length >= spec.minHerrings
      && b.ambiguousWords.length >= 1
      && types.filter((t) => t !== 'wordplay').length >= spec.minPlain
      && types.filter((t) => t === 'wordplay').length >= spec.minWordplay
      && types.filter((t) => t === 'trivia').length <= spec.maxTrivia
      && b.groups.filter((g) => isSubtleTheme(g.theme)).length >= spec.minSubtle;
  };
  const kept = built.filter(shipsHere);
  const dropped = built.length - kept.length;

  /**
   * ROUND 11 (AAA 2.8 / content quality) — NO 4-WORD SET SHIPS TWICE.
   *
   * The bank can no longer deal the same hand (every draw is checked against
   * `usedSets`), which leaves exactly one source of repetition: the authored
   * file itself, where three sets are written on two boards each
   * (BROCCOLI/CARROT/CELERY/SPINACH on web-11 and web-31, DAISY/LILY/ROSE/TULIP
   * on web-14 and web-54, CRAYON/MARKER/PEN/PENCIL on web-15 and web-50). The
   * later board leaves rather than printing four tiles the player has already
   * met — and `validate` hard-fails if anything slips past this, so a future
   * generator change cannot quietly reintroduce the shelf of near-copies.
   */
  const shippedSets = new Set<string>();
  const out: OutBoard[] = [];
  const deduped: string[] = [];
  for (const b of kept) {
    const keys = b.groups.map((g) => setKey(g.words));
    if (keys.some((k) => shippedSets.has(k))) { deduped.push(b.id); continue; }
    for (const k of keys) shippedSets.add(k);
    out.push(b);
  }

  // Pass 2b: balance. Every board that CAN be tier 3 does not have to BE tier
  // 3 — the bottom rows are visited far more often than the top, so the tier-3
  // shelf keeps only the trappiest TIER3_CAP boards and the rest settle into
  // tier 2 (whose gates they already clear).
  // ROUND 10: 18 was the whole tier-3 shelf when the pool was 51 boards. At 150
  // it would have pinned the top of the house at twelve percent of the content
  // while the middle bulged to eighty boards — the opposite of the ~50/50/50
  // the shelf is meant to hold. The cap still does its original job (a board
  // that CAN be tier 3 need not BE tier 3, and the trappiest ones win the
  // shelf); it is simply sized to the pool it is now sorting.
  const TIER3_CAP = 52;
  const top = out.filter((b) => b.tier === 3)
    .sort((a, b) => b.ambiguousWords.length - a.ambiguousWords.length || (a.id < b.id ? -1 : 1));
  for (const b of top.slice(TIER3_CAP)) {
    b.tier = 2;
    // Round 12: the TRAP list is what the budget counts, so it is what gets
    // trimmed; the intruder list is re-derived from what survives (a word whose
    // only thread was dropped is no longer a planted herring) and the opening
    // layout is rebuilt, because 2.6 asks the survivors to sit adjacent and a
    // subset of an adjacent run need not be one.
    b.herrings = b.herrings.slice(0, TIER_SPECS[2].maxHerrings);
    b.ambiguousWords = b.ambiguousWords.filter(
      (w) => b.herrings.some((h) => h.words.includes(w)),
    );
    b.layout = buildLayout(
      b, b.ambiguousWords, SEED + [...b.id].reduce((h, c) => h + c.charCodeAt(0), 0),
    );
  }

  // Pass 3: decoys for the naming act.
  assignDecoys(out);

  validate(out);

  /**
   * ROUND 12 — the generator sets its own type. Bank themes are written with
   * straight quotes (`Contains "TEN"`) and the shipped corpus must carry curly
   * ones, so every regeneration used to leave the pool failing
   * `content:lint-typography` until somebody remembered to run it with
   * `--fix` — which means `npm run content:all` red on a clean checkout, and a
   * half-typeset word-web.json is exactly the defect round 11 spent a pass on.
   * `typesetDeep` is idempotent, so this is a no-op on anything already set.
   */
  writeFileSync(join(here, 'generated', 'word-web.json'), JSON.stringify(typesetDeep(out)));
  const perTier = ([1, 2, 3] as Tier[]).map((t) => {
    const arr = out.filter((b) => b.tier === t);
    const avgHerrings = arr.reduce((a, b) => a + b.herrings.length, 0) / Math.max(1, arr.length);
    const subtle = arr.reduce((a, b) => a + b.groups.filter((g) => isSubtleTheme(g.theme)).length, 0) / Math.max(1, arr.length);
    return `t${t} (${tierLabel(t)}): ${arr.length} boards (~${avgHerrings.toFixed(1)} traps, ~${subtle.toFixed(1)} subtle cats)`;
  }).join(', ');
  const trivia = out.filter((b) => b.groups.some((g) => g.type === 'trivia')).length;
  const byRelation = new Map<string, number>();
  for (const b of out) for (const h of b.herrings) byRelation.set(h.relation, (byRelation.get(h.relation) ?? 0) + 1);
  const sigs = architectureCensus(out);
  console.log(
    `word-web.json: ${out.length} boards — ${perTier}; ${demoted} demoted for want of tight traps, ` +
    `${dropped} dropped for having none at all, ${unbuildable.length} dropped for having no category left to itself`
    + `${unbuildable.length ? ` (${unbuildable.join(', ')})` : ''}, ${deduped.length} dropped for repeating a shipped 4-word set` +
    `${deduped.length ? ` (${deduped.join(', ')})` : ''}, ` +
    `${trivia} with a (yellow-tier) trivia category, bank hands dealt: ${[...bankUse.values()].reduce((a, b) => a + b, 0)}; ` +
    `named herrings by relation: ${[...byRelation].map(([r, n]) => `${r} ${n}`).join(', ')}\n` +
    `  architecture: signatures ${sigs.signatures.map(([s, n]) => `${s} ${n}`).join(', ')}` +
    ` (top ${(sigs.topShare * 100).toFixed(0)}%); trap home slot ${sigs.home.map(([s, n]) => `${s} ${n}`).join(', ')};` +
    ` relations ${sigs.relations.map(([r, n]) => `${r} ${n}`).join(", ")} (top ${(sigs.topRelationShare * 100).toFixed(0)}%)`,
  );
}

/**
 * ROUND 11 — the pool-wide architecture census. Board-level fairness is
 * necessary and was never the problem; this is the measurement that catches a
 * shelf of 163 boards with one learnable shape.
 */
function architectureCensus(puzzles: readonly OutBoard[]) {
  const sig = new Map<string, number>();
  for (const p of puzzles) {
    const s = signatureOf(p.groups);
    sig.set(s, (sig.get(s) ?? 0) + 1);
  }
  const signatures = [...sig].sort((a, b) => b[1] - a[1]);
  const home = new Map<Slot, number>();
  let herrings = 0;
  let affix = 0;
  for (const p of puzzles) {
    for (const w of p.ambiguousWords) {
      const g = p.groups.find((x) => x.words.includes(w));
      if (g) home.set(g.tier, (home.get(g.tier) ?? 0) + 1);
    }
    for (const h of p.herrings) {
      herrings += 1;
      if (h.relation === 'shared-affix') affix += 1;
    }
  }
  const homeTotal = [...home.values()].reduce((a, b) => a + b, 0);
  const byRelation = new Map<HerringRelation, number>();
  for (const p of puzzles) {
    for (const h of p.herrings) byRelation.set(h.relation, (byRelation.get(h.relation) ?? 0) + 1);
  }
  const relations = [...byRelation].sort((a, b) => b[1] - a[1]);
  return {
    signatures,
    topShare: puzzles.length === 0 ? 0 : (signatures[0]?.[1] ?? 0) / puzzles.length,
    home: TIER_ORDER.map((s) => [s, home.get(s) ?? 0] as const),
    homeShares: TIER_ORDER.map((s) => (homeTotal === 0 ? 0 : (home.get(s) ?? 0) / homeTotal)),
    relations,
    topRelation: relations[0]?.[0] ?? null,
    topRelationShare: herrings === 0 ? 0 : (relations[0]?.[1] ?? 0) / herrings,
    affixShare: herrings === 0 ? 0 : affix / herrings,
  };
}

/**
 * The architecture budget, as enforceable numbers (AAA 2.7 / 2.12). Set to
 * what the shipped corpus can actually hold with its fairness gates intact —
 * see the round-11 note above `sigTally` for what each one is answering, and
 * the generator's own census line for where the pool currently sits.
 */
const ARCHITECTURE_BUDGET = {
  /** No single group-type signature may own more than this share of the pool. */
  maxSignatureShare: 0.35,
  /** Every colour slot must host at least this share of the planted traps. */
  minHomeSlotShare: 0.12,
  /** …and no single relation may be the named thread of more than this many. */
  maxRelationShare: 0.40,
} as const;

/** The 2.7–2.9 validator — the build fails on any violating board. */
function validate(puzzles: OutBoard[]): void {
  const problems: string[] = [];

  // ROUND 11 (AAA 2.8) — no 4-word set ships twice, from any source.
  const seenSets = new Map<string, string>();
  for (const p of puzzles) {
    for (const g of p.groups) {
      const k = setKey(g.words);
      const owner = seenSets.get(k);
      if (owner) problems.push(`${p.id}: "${g.theme}" repeats ${owner}'s tiles (${g.words.join('/')})`);
      else seenSets.set(k, p.id);
    }
  }

  /**
   * ROUND 12 (AAA 2.6 / volume-quality) — THE ANTI-WALLPAPER CAP APPLIES TO
   * EVERY THEME, WHATEVER WROTE IT.
   *
   * `BANK_REUSE_CAP` was documented as the rule against a category becoming
   * wallpaper and enforced only where the bank dealt, so it did not apply to
   * the source the shelf grew from. Shipped before this check: "Two Pairs of
   * Double Letters" ×17, Heteronyms ×7, 'Silent "T"' ×7, 'Silent "G"' ×6,
   * "Drop the First Letter" ×6, Palindromes ×5, "Homophones of Animals" ×5,
   * 'Silent "GH"' ×5, and ten more over budget. This is a hard fail, not a
   * soft warning: a soft warning is what the last three rounds had.
   */
  const themeTally = new Map<string, string[]>();
  for (const p of puzzles) {
    for (const g of p.groups) {
      const k = canon(g.theme);
      themeTally.set(k, [...(themeTally.get(k) ?? []), p.id]);
    }
  }
  for (const [theme, ids] of [...themeTally].sort()) {
    if (ids.length > BANK_REUSE_CAP) {
      problems.push(
        `pool: "${theme}" is the category on ${ids.length} boards (cap ${BANK_REUSE_CAP}) — ${ids.join(', ')}`,
      );
    }
  }

  // ROUND 11 (AAA 2.7 / 2.12) — the pool-wide architecture budget.
  const census = architectureCensus(puzzles);
  if (census.topShare > ARCHITECTURE_BUDGET.maxSignatureShare) {
    problems.push(
      `pool: "${census.signatures[0]![0]}" is ${(census.topShare * 100).toFixed(0)}% of the shelf ` +
      `(budget ${(ARCHITECTURE_BUDGET.maxSignatureShare * 100).toFixed(0)}%) — one learnable shape`,
    );
  }
  census.homeShares.forEach((share, i) => {
    if (share < ARCHITECTURE_BUDGET.minHomeSlotShare) {
      problems.push(
        `pool: only ${(share * 100).toFixed(0)}% of planted traps live in the ${TIER_ORDER[i]} group ` +
        `(floor ${(ARCHITECTURE_BUDGET.minHomeSlotShare * 100).toFixed(0)}%) — the trap always sits in the same slot`,
      );
    }
  });
  if (census.topRelationShare > ARCHITECTURE_BUDGET.maxRelationShare) {
    problems.push(
      `pool: ${(census.topRelationShare * 100).toFixed(0)}% of named traps are ${census.topRelation} ` +
      `(budget ${(ARCHITECTURE_BUDGET.maxRelationShare * 100).toFixed(0)}%) — one learnable trap`,
    );
  }

  for (const p of puzzles) {
    if (p.groups.length !== 4) problems.push(`${p.id}: ${p.groups.length} groups`);
    const words = p.groups.flatMap((g) => g.words);
    if (new Set(words).size !== 16 || words.length !== 16) problems.push(`${p.id}: needs 16 unique words`);
    // The cozy tone gate: every tile is set in the manor's own type (task 2).
    for (const w of words) {
      if (!toneOk(w.toLowerCase())) problems.push(`${p.id}: "${w}" fails the tone gate`);
    }
    if (new Set(p.groups.map((g) => g.tier)).size !== 4) problems.push(`${p.id}: tiers not distinct`);
    // ROUND 12 (AAA 2.9 [BEAT]) — a "Hidden X" board may not print X.
    for (const g of p.groups) {
      problems.push(...hiddenGroupProblems(g.theme, g.words).map((x) => `${p.id}: ${x}`));
    }

    // 2.9 + the round-4 tier gates
    const spec = TIER_SPECS[p.tier];
    const trivia = p.groups.filter((g) => g.type === 'trivia');
    if (trivia.length > spec.maxTrivia) {
      problems.push(`${p.id}: ${trivia.length} trivia categories (tier ${p.tier} allows ${spec.maxTrivia})`);
    }
    if (trivia.some((g) => g.tier !== 'yellow')) problems.push(`${p.id}: trivia not at the easiest tier`);
    if (p.groups.filter((g) => g.type === 'wordplay').length < spec.minWordplay) {
      problems.push(`${p.id}: fewer than ${spec.minWordplay} wordplay categories`);
    }
    // Round 10 — the plain-English floor. A board of four letter-puzzles has
    // no way in for a player who does not already see the trick.
    const plain = p.groups.filter((g) => g.type !== 'wordplay').length;
    if (plain < spec.minPlain) {
      problems.push(`${p.id}: ${plain} plain categories (tier ${p.tier} needs ${spec.minPlain})`);
    }
    const subtle = p.groups.filter((g) => isSubtleTheme(g.theme)).length;
    if (subtle < spec.minSubtle) {
      problems.push(`${p.id}: ${subtle} subtle categories (tier ${p.tier} needs ${spec.minSubtle})`);
    }

    /**
     * 2.7 — the tier's herring budget (cap AND floor; AAA's ≤3 still holds).
     *
     * ROUND 12: this block asserted `ambiguousWords.length` — the flat
     * INTRUDER-WORD list — against a spec whose field is named `minHerrings`
     * and whose docstring says "tier 3 must ship 2–3 traps". Two words caught
     * by one `suffix:GHT` are one trap and one sentence, and they satisfied a
     * two-trap check, so half the top shelf shipped at tier-1 trap density
     * with a tier-3 label and nothing could see it. The TRAP budget is asserted
     * against `herrings` (the named threads); the intruder list keeps its own,
     * differently-named assertion below.
     */
    if (p.herrings.length > Math.min(3, spec.maxHerrings)) {
      problems.push(`${p.id}: ${p.herrings.length} named traps (tier ${p.tier} budget ${spec.maxHerrings})`);
    }
    if (p.herrings.length < spec.minHerrings) {
      problems.push(`${p.id}: ${p.herrings.length} named traps (tier ${p.tier} needs ${spec.minHerrings})`);
    }
    // The intruder list is DERIVED from the traps (one word per thread, deduped
    // where two threads name the same word), so it is never longer than the
    // budget and never empty on a board that has a trap. Deliberately a
    // separate, differently-named assertion: conflating the two is the defect
    // this block was rewritten for.
    if (p.ambiguousWords.length > p.herrings.length) {
      problems.push(`${p.id}: ${p.ambiguousWords.length} intruders against ${p.herrings.length} named traps`);
    }
    if (new Set(p.ambiguousWords).size !== p.ambiguousWords.length) {
      problems.push(`${p.id}: the intruder list repeats a word`);
    }
    if (p.herrings.length > 0 && p.ambiguousWords.length === 0) {
      problems.push(`${p.id}: named traps with no intruder to cluster on`);
    }
    if (p.ambiguousWords.some((w) => !words.includes(w))) problems.push(`${p.id}: herring not on board`);

    // 2.10 — every shipped trap is NAMED. A herring the room cannot describe
    // is a −2-step guess that buys nothing, which is the criterion's whole
    // complaint; and a set of fewer than 3 words can never be matched by the
    // ≥3-of-4 rule the room uses, so it would be dead copy.
    const RELATIONS = ['rhyme', 'shared-affix', 'doubled-letter', 'semantic', 'hidden-string'];
    if (p.herrings.length === 0 && p.ambiguousWords.length > 0) {
      problems.push(`${p.id}: ${p.ambiguousWords.length} herrings but none named`);
    }
    for (const h of p.herrings) {
      if (!RELATIONS.includes(h.relation)) problems.push(`${p.id}: unknown herring relation "${h.relation}"`);
      if (h.words.length < 3) problems.push(`${p.id}: herring set of ${h.words.length} can never be matched`);
      if (new Set(h.words).size !== h.words.length) problems.push(`${p.id}: herring set repeats a word`);
      for (const w of h.words) if (!words.includes(w)) problems.push(`${p.id}: herring word "${w}" not on board`);
      if ((h.relation === 'shared-affix' || h.relation === 'hidden-string') && !h.detail) {
        problems.push(`${p.id}: shared-affix herring with no letters to point at`);
      }
      /**
       * ROUND 12 (AAA 2.10) — a doubled-letter trap must name the SAME doubled
       * letter, and every member must actually carry it. "These words each
       * contain some repeated character" is a property ~30% of English shares
       * and a grouping nobody chases; 52 of 55 shipped doubled-letter traps
       * had no doubled letter in common, so the −2-step guess bought noise
       * dressed as an insight.
       */
      if (h.relation === 'doubled-letter') {
        if (!h.detail || !/^([A-Z])\1$/.test(h.detail)) {
          problems.push(`${p.id}: doubled-letter herring with no shared pair to name`);
        } else if (h.words.some((w) => !w.includes(h.detail!))) {
          problems.push(`${p.id}: doubled-letter herring "${h.detail}" not carried by every member`);
        }
      }
    }
    // Every shipped intruder is described by at least one named set.
    for (const w of p.ambiguousWords) {
      if (!p.herrings.some((h) => h.words.includes(w))) {
        problems.push(`${p.id}: herring "${w}" has no named relation`);
      }
    }

    // 2.6
    if (p.layout.length !== 16 || new Set(p.layout).size !== 16 || p.layout.some((w) => !words.includes(w))) {
      problems.push(`${p.id}: layout is not a permutation of the 16 words`);
    }

    // 2.11
    for (const g of p.groups) {
      if (g.decoys.length !== 2 || g.decoys.includes(g.theme)) problems.push(`${p.id}: "${g.theme}" needs 2 decoys`);
    }
  }
  if (problems.length > 0) {
    console.error(problems.join('\n'));
    throw new Error(`word-web validation failed with ${problems.length} problem(s)`);
  }
}

assertBankIsClean();
indexCorpusSets([
  ...boards.flatMap((b) => b.groups.map((g) => g.words)),
  ...WORDPLAY_BANK.flatMap(bankDraws).map((b) => b.words),
]);
if (process.argv.includes('--report')) report();
else main();
