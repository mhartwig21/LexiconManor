import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ForgottenWordPuzzle, Tier } from '../src/engine/types';

/**
 * The Study's Forgotten Word pool — fully hand-authored (AAA 3.7: the best
 * writing in the game, editorial read-aloud standard).
 *
 * ---------------------------------------------------------------------------
 * THREE TIERS, MAPPED TO MANOR ROWS (owner directive, round 4: "tier-3 =
 * riddle-tier definitions only")
 * ---------------------------------------------------------------------------
 * The Study's escalation is the REGISTER OF THE CLUE, not merely how obscure
 * the word is. engine/forgotten-word.ts already serves plain (1) → poetic (2)
 * → riddle (3) by level, and the adapter passes the room's tier straight
 * through, so a row-6 Study is riddle-only by construction. What this file
 * guarantees is that those three registers are genuinely DIFFERENT KINDS OF
 * WRITING rather than three phrasings of one gloss — build-linted below:
 *
 *   - plain  : a dictionary gloss. Third person, no riddling voice.
 *   - poetic : an image. Third person, must not reuse the plain gloss's
 *              content words (token overlap gate), never first-person.
 *   - riddle : the word SPEAKING or a question put to the player. Must carry
 *              first-person voice or end in a question mark, and must not
 *              reuse the poetic line's content words either.
 *
 * Plus the answer-leak lint (no clue may contain the answer's 4-letter stem),
 * usage blanks, ≤15-letter words, ≥20 entries, and ≥10 entries per tier so no
 * row runs out of Studies.
 *
 * ---------------------------------------------------------------------------
 * ROUND 6 — THE LINT WAS UNREACHABLE FROM CI
 * ---------------------------------------------------------------------------
 * Everything below was real and correct and *ran nowhere*: `lint()` was not
 * exported, `main()` executed at module scope (so importing this file wrote a
 * JSON artifact as a side effect), and `content:verify` never named it. The
 * register gate therefore only fired when a human happened to re-run the
 * generator by hand. Worse, the gate only ever looked at `ENTRIES` — the
 * SHIPPED pool is `generated/forgotten-word.json`, so a hand-edit collapsing
 * the three registers into one gloss, applied to the file the game actually
 * loads, was invisible to every check in the repo.
 *
 * Both holes are closed here:
 *   - `lint()`, `lintPuzzles()` and `ENTRIES` are exported; `main()` runs only
 *     when this file is the process entry point, so importing it is free of
 *     side effects.
 *   - `--check` lints the AUTHORED entries *and* re-lints the SHIPPED JSON
 *     through the same rules, then asserts the two agree, and writes nothing.
 *     Wired into `content:verify` (package.json) and re-run from
 *     `tests/forgotten-word-register.test.ts`, which also proves the gate
 *     fails on a deliberately collapsed fixture — a lint nobody has watched
 *     fail is a lint nobody knows still works.
 *
 * ROUND 5 (writing pass, AAA 3.7 "best writing in the game"): the register
 * lint above was verified live — a deliberately-glossy poetic line trips both
 * the first-person gate and the overlap gate, so the three tiers are provably
 * three kinds of sentence and not one gloss reworded. Measured worst-case
 * register overlap across the shipped pool is 0.33 against a 0.40 gate. The
 * remaining seam was tone: five poetic lines were rewritten off greeting-card
 * abstractions onto concrete nouns so the Study reads in the same hand as the
 * Volume 1 fragments (`content/authored/volumes/volume-1.json`), which is the
 * bar the Study is measured against. Pool grown 36 → 43.
 *
 * Run: npx tsx content/generate-forgotten-word.ts
 */

/** Obscurity → manor row band. The Study's pool splits three ways. */
const TIER_OF_OBSCURITY: Record<ForgottenWordPuzzle['obscurity'], Tier> = {
  common: 1, medium: 2, rare: 3, archaic: 3,
};

/** Minimum entries per tier — a row must never run dry of Studies. */
const MIN_PER_TIER = 10;

export interface Entry {
  word: string;
  obscurity: ForgottenWordPuzzle['obscurity'];
  plain: string;
  poetic: string;
  riddle: string;
  etymology: string;
  usage: string;
  acceptedAnswers?: string[];
}

export const ENTRIES: Entry[] = [
  // ---- common --------------------------------------------------------------
  {
    word: 'SERENDIPITY', obscurity: 'common',
    plain: 'The luck of finding something good while you were looking for something else.',
    poetic: "Fortune's habit of leaving gifts on paths you never meant to walk.",
    riddle: 'Hunt one treasure and I slip a better one into your pocket, unasked.',
    etymology: 'Coined by Horace Walpole in 1754, after a Persian tale of three princes who kept stumbling on discoveries they had not sought.',
    usage: 'By pure ___, the missing letter turned up inside a borrowed book.',
  },
  {
    word: 'WANDERLUST', obscurity: 'common',
    plain: 'A strong longing to travel and see far places.',
    poetic: 'The itch that packs a bag before the mind has agreed to go.',
    riddle: 'I am a hunger no kitchen can feed; only a horizon quiets me, and never for long.',
    etymology: 'Borrowed whole from German — roaming joined to longing — in the first years of the twentieth century.',
    usage: 'Her ___ flared with every train whistle that crossed the valley.',
  },
  {
    word: 'NOSTALGIA', obscurity: 'common',
    plain: 'A bittersweet longing for times gone by.',
    poetic: 'The past, seen through the one window that opens only from this side.',
    riddle: 'The farther you sail from a shore, the sweeter I make it look.',
    etymology: 'Greek for the ache of the homeward road — coined in 1688 as a medical diagnosis for Swiss soldiers pining in foreign camps.',
    usage: 'The smell of woodsmoke filled him with ___ for his grandfather’s cabin.',
  },
  {
    word: 'EPIPHANY', obscurity: 'common',
    plain: 'A sudden moment of understanding that changes everything.',
    poetic: 'Lightning indoors: one flash, and the whole room of the mind is lit.',
    riddle: 'I arrive uninvited in bathtubs and on staircases, and after me nothing looks the same.',
    etymology: 'From the Greek for ‘a showing forth’, once reserved for divine appearances and a feast on the sixth of January.',
    usage: 'Halfway through washing the dishes she had an ___ about the unfinished poem.',
  },
  {
    word: 'MELANCHOLY', obscurity: 'common',
    plain: 'A gentle, lingering sadness with no single cause.',
    poetic: 'Rain that falls inside a person while the sky stays dry.',
    riddle: 'Too soft to be grief, too heavy to be rest — I am the blue hour of the heart.',
    etymology: 'From the Greek for black bile, one of the four humours once thought to govern the temper.',
    usage: 'A pleasant ___ settled on the porch as the last light left the garden.',
  },
  {
    word: 'SOLITUDE', obscurity: 'common',
    plain: 'The state of being alone, especially by choice and at peace.',
    poetic: 'Aloneness worn as a warm coat rather than a wound.',
    riddle: 'Crowds destroy me, and yet I am no enemy of the ones you love.',
    etymology: 'From the Latin for ‘alone’, the same root that gave the language ‘sole’ and ‘desolate’.',
    usage: 'He kept Sunday mornings for ___, tea, and the slow crossword.',
  },
  {
    word: 'WHIMSY', obscurity: 'common',
    plain: 'Playful, fanciful humor; a taste for odd and charming notions.',
    poetic: 'The soap-bubble logic by which a teapot might well be a house for wrens.',
    riddle: 'I turn umbrellas into rowboats and errands into expeditions, and I weigh nothing at all.',
    etymology: 'A softened form of a seventeenth-century nonsense word for a fanciful trifle, cousin to ‘flim-flam’.',
    usage: 'The garden gnomes wearing tiny scarves were pure ___ on her part.',
  },
  {
    word: 'REVERIE', obscurity: 'common',
    plain: 'A pleasant daydream; being lost in dreamy thought.',
    poetic: 'The little rowboat the mind takes out when nobody is asking it to steer.',
    riddle: 'Your eyes stay open while I carry you elsewhere; a dropped teacup calls you back.',
    etymology: 'From an old French word for wild rejoicing and rambling talk; crossing the Channel, it grew quiet and dreamy.',
    usage: 'The lecture dissolved into a ___ about lighthouses and summer storms.',
  },
  // Round 4: four more tier-1 entries so the bottom rows never run dry of
  // Studies (MIN_PER_TIER), each written to the three-register bar.
  {
    word: 'HEIRLOOM', obscurity: 'common',
    plain: 'A treasured object handed down through a family for generations.',
    poetic: 'A thing that outlives its owners and keeps the fingerprints of hands now gone.',
    riddle: 'I am worth little at auction and everything on a mantelpiece.',
    etymology: 'Middle English joined an inherited estate to ‘loom’, which then meant simply a tool — the family tool that passed on.',
    usage: 'The clock in the hall was the only ___ that survived the move.',
  },
  {
    word: 'LULLABY', obscurity: 'common',
    plain: 'A gentle song sung to send a child to sleep.',
    poetic: 'A small tune with a door in it, opening onto sleep.',
    riddle: 'Sing me badly and I work just as well; my audience is already half gone.',
    etymology: 'From the hushing sounds nurses have always made, joined to an old word for goodbye.',
    usage: 'She hummed the same ___ her grandmother had hummed to her.',
  },
  {
    word: 'WHISPER', obscurity: 'common',
    plain: 'To speak very softly, using breath instead of voice.',
    poetic: 'Words with their shoes off, crossing a quiet room.',
    riddle: 'Raise me and I stop being myself.',
    etymology: 'Old English, imitative — the word sounds like the thing it names, as its cousins in Dutch and German also do.',
    usage: 'A ___ went round the reading room, and then the hush came back.',
  },
  {
    word: 'THRESHOLD', obscurity: 'common',
    plain: 'The strip of floor beneath a doorway; the point where something begins.',
    poetic: 'The line a house draws between itself and the weather.',
    riddle: 'Cross me and you have arrived, though you have not yet gone anywhere.',
    etymology: 'Old English for the sill of a door; the second half of the word is a puzzle even to scholars.',
    usage: 'He paused on the ___ with the letter still unopened.',
  },
  // Round 5: two more tier-1 entries, written to the volume-fragment bar —
  // concrete nouns, a trade's-eye view, no sentiment the image hasn't earned.
  {
    word: 'LANTERN', obscurity: 'common',
    plain: 'A case of glass and metal that carries a flame safely from place to place.',
    poetic: 'A small tame piece of the sun, given a handle.',
    riddle: 'Carry me and the dark steps back exactly as far as I say, and not one pace further.',
    etymology: 'From an old Greek word for a torch, arriving by way of Latin and French; for centuries English misspelled it after the thin horn panes that glazed it.',
    usage: 'She hung the ___ on the gate so the late walker would find the path.',
  },
  {
    word: 'KINDLING', obscurity: 'common',
    plain: 'Small dry sticks and shavings used to start a fire.',
    poetic: 'The little sacrifice a fire requires before it will agree to be a fire.',
    riddle: 'I am the smallest thing in the woodshed, and nothing there burns without me.',
    etymology: 'From an Old Norse verb for setting alight — the same root the language uses when a feeling catches rather than a log.',
    usage: 'He split the ___ finer than it needed, because the doing of it was restful.',
  },
  // ---- medium --------------------------------------------------------------
  {
    word: 'PETRICHOR', obscurity: 'medium',
    plain: 'The earthy smell of rain falling on dry ground.',
    poetic: 'Dust’s one answer to rain, and it arrives before the thunder does.',
    riddle: 'I am born when thirsty dust drinks; you smell me before you hear the storm.',
    etymology: 'Greek: stone joined with ichor, the golden blood of the gods — coined by two Australian scientists in 1964.',
    usage: 'After the drought broke, the whole street smelled of ___.',
  },
  {
    word: 'GLOAMING', obscurity: 'medium',
    plain: 'Twilight; the fading light just after sunset.',
    poetic: 'The blue seam where day is stitched quietly into night.',
    riddle: 'Neither lamp nor dark, I am the hour when bats and porch lights wake together.',
    etymology: 'From Old English by way of Scots, kin to ‘glow’ — an hour kept alive in northern songs.',
    usage: 'Children were called in from the ___ one by one.',
  },
  {
    word: 'HALCYON', obscurity: 'medium',
    plain: 'Calm, peaceful, and golden — used of remembered happy times.',
    poetic: 'Weather borrowed from a kinder year, kept pressed between the mind’s pages.',
    riddle: 'I nest on a flat sea in midwinter and make the storms wait their turn.',
    etymology: 'From the Greek name for the kingfisher, which was said to nest on a becalmed sea.',
    usage: 'They spoke of the ___ summers before the mill closed.',
  },
  {
    word: 'MELLIFLUOUS', obscurity: 'medium',
    plain: 'Sweet and smooth to hear, like a flowing voice or melody.',
    poetic: 'Speech that pours slow and amber, coating the ear like warm honey.',
    riddle: 'I describe the voice you would follow into a third hour of the story.',
    etymology: 'From the Latin for honey and for flowing — a compliment first paid to saints’ sermons.',
    usage: 'The announcer’s ___ baritone made even the shipping news soothing.',
  },
  {
    word: 'PENUMBRA', obscurity: 'medium',
    plain: 'The soft partial shadow around the edge of a full shadow.',
    poetic: 'The gray hem where shadow frays into light, and neither side will own the border.',
    riddle: 'In an eclipse I am the almost: not the bite of darkness, only its breath.',
    etymology: 'Coined by the astronomer Kepler from the Latin for ‘almost’ and ‘shadow’.',
    usage: 'The cat slept in the ___ of the lamplight, half gold, half gray.',
  },
  {
    word: 'QUIXOTIC', obscurity: 'medium',
    plain: 'Nobly impractical; chasing ideals without regard for reality.',
    poetic: 'Armored in daydreams, riding out to rescue what never asked for saving.',
    riddle: 'I tilt at windmills and call them giants; sensible people sigh at me, and secretly cheer.',
    etymology: 'After the lean Spanish knight of a 1605 novel, who mistook windmills for giants and inns for castles.',
    usage: 'Restoring the ruined lighthouse by hand was a ___ project, and he began anyway.',
  },
  {
    word: 'SUSURRUS', obscurity: 'medium',
    plain: 'A soft whispering or rustling sound.',
    poetic: 'The hush the poplars pass along, leaf to leaf, like a secret.',
    riddle: 'I am what wind says in a library voice.',
    etymology: 'Latin, an imitative word — say it slowly and you hear the sound it names.',
    usage: 'A ___ of turning pages filled the reading room.',
  },
  {
    word: 'EPHEMERAL', obscurity: 'medium',
    plain: 'Lasting only a very short time.',
    poetic: 'Beautiful the way frost-flowers are beautiful: gone by the time the kettle sings.',
    riddle: 'Mayflies, rainbows, and perfect snowballs all swear allegiance to me.',
    etymology: 'From the Greek for ‘lasting a day’, first said of fevers, then of mayflies, then of everything dear.',
    usage: 'Chalk art is ___ by nature; the afternoon rain took the whole mural.',
  },
  {
    word: 'PALIMPSEST', obscurity: 'medium',
    plain: 'A manuscript page reused after the earlier writing was scraped away, with traces remaining.',
    poetic: 'A page that keeps its ghosts: old ink dreaming under the new.',
    riddle: 'Scrape me and rewrite me — still the first story rises through the second like a watermark.',
    etymology: 'From the Greek for ‘scraped again’: parchment was dear, so monks rubbed old ink away and wrote atop the shadow.',
    usage: 'The city is a ___, Roman stones showing through the medieval walls.',
  },
  {
    word: 'RIGMAROLE', obscurity: 'medium',
    plain: 'A long, pointless, complicated procedure or ramble of talk.',
    poetic: 'A corridor of little doors between you and the one simple thing you came for.',
    riddle: 'Fill in form nine to request form twelve: I am the dance, not the destination.',
    etymology: 'From the ‘Ragman roll’, a long medieval parchment of names and seals that came to mean any tedious catalogue.',
    usage: 'Renewing the permit was a two-hour ___ of stamps and queues.',
  },
  {
    word: 'INGLENOOK', obscurity: 'medium',
    plain: 'A recessed seat beside a hearth, set inside the chimney’s own corner.',
    poetic: 'The warmest square yard in an English house, and the hardest to leave.',
    riddle: 'Sit in me and the fire is no longer across the room. The fire is family.',
    etymology: 'A northern word for the hearth-flame joined to an old word for a snug corner; the pair have only been one word for three centuries.',
    usage: 'They took their tea in the ___ and let the weather do as it liked.',
  },
  {
    word: 'DOLDRUMS', obscurity: 'medium',
    plain: 'A spell of listlessness; a stretch of time in which nothing moves.',
    poetic: 'A becalmed week with the sails up and no wind willing to bother.',
    riddle: 'Sailors named me for a windless sea. You meet me on a Tuesday afternoon.',
    etymology: 'From an old word for a dullard, pluralized by sailors into a belt of the Atlantic where the trade winds simply give up.',
    usage: 'February found the whole house in the ___, cat included.',
  },
  // ---- rare ----------------------------------------------------------------
  {
    word: 'APRICITY', obscurity: 'rare',
    plain: 'The warmth of the sun in winter.',
    poetic: 'January’s small mercy: sunlight with its kettle just off the boil.',
    riddle: 'Find me on a freezing day, on the south wall, where the cat already sits.',
    etymology: 'From a Latin word for basking in sunshine; recorded once in 1656 and promptly mislaid by the language.',
    usage: 'They turned their chairs to the window to borrow a little ___.',
  },
  {
    word: 'BRUMOUS', obscurity: 'rare',
    plain: 'Foggy, misty, and gray, as winter weather.',
    poetic: 'Weather wearing wool: the world gone soft-edged and near-sighted.',
    riddle: 'On my kind of morning the lighthouse earns its keep and the hills go missing.',
    etymology: 'From the French for winter mist, tracing back to the Latin name for the year’s shortest day.',
    usage: 'The harbor lay ___ and still, the ferries sounding their horns blind.',
  },
  {
    word: 'CLINQUANT', obscurity: 'rare',
    plain: 'Glittering with gold or tinsel; showily sparkling.',
    poetic: 'Dressed in borrowed starlight and pleased about it.',
    riddle: 'I am the glitter of the stage crown — all flash and no jewels.',
    etymology: 'From a French verb imitating the chime of coins; English borrowed the shine in the 1590s.',
    usage: 'The theatre lobby was ___ with mirrors and gilt.',
  },
  {
    word: 'NOCTAMBULIST', obscurity: 'rare',
    plain: 'A sleepwalker; one who walks about at night.',
    poetic: 'A dreamer whose dreams put on slippers and take the stairs.',
    riddle: 'I climb stairs I never remember and wake owning cold feet.',
    etymology: 'Latin night joined to walking — the politer cousin of ‘somnambulist’.',
    usage: 'The old innkeeper, a gentle ___, was found dusting shelves at three in the morning.',
  },
  {
    word: 'SCINTILLA', obscurity: 'rare',
    plain: 'A tiny trace or spark of something.',
    poetic: 'One firefly’s worth of light — and sometimes that is enough to navigate by.',
    riddle: 'Lawyers hunt me in evidence, prospectors in gravel: the least gleam that still counts.',
    etymology: 'Latin for a spark; the courtroom borrowed it for the faintest glimmer of proof.',
    usage: 'There was not a ___ of doubt in her voice.',
  },
  {
    word: 'TARADIDDLE', obscurity: 'rare',
    plain: 'A small fib; pretentious nonsense.',
    poetic: 'A lie in its Sunday best, small enough to curtsy.',
    riddle: 'Not quite a lie, says the teller; quite a lie, says the listener. I am the size of the difference.',
    etymology: 'Origin uncertain, perhaps from an old word for dawdling — collected among eighteenth-century slang.',
    usage: 'His account of catching the pike grew a fresh ___ with every telling.',
  },
  {
    word: 'ULLAGE', obscurity: 'rare',
    plain: 'The empty space left in a barrel or bottle that is not quite full.',
    poetic: 'The breath a bottle keeps for itself, between wine and cork.',
    riddle: 'The kinder the pour, the larger I grow — I am what the cask no longer holds.',
    etymology: 'From an Old French verb meaning to fill a cask up to the eye — the word came to name what filling leaves behind.',
    usage: 'The cellar-master tapped each cask, listening for its ___.',
  },
  {
    word: 'VESPERTINE', obscurity: 'rare',
    plain: 'Of, or happening in, the evening.',
    poetic: 'Belonging to the lamp-lighting hour, when moths take the day shift’s place.',
    riddle: 'Morning glories ignore me; jasmine and owls keep my calendar.',
    etymology: 'From the Latin name for the first star of dusk, which also lent its name to sung prayers at day’s end.',
    usage: 'The café kept ___ hours, opening as the streetlights warmed.',
  },
  {
    word: 'SMEUSE', obscurity: 'rare',
    plain: 'The gap in a hedge made by the regular passage of a small animal.',
    poetic: 'A door in a wall of thorns, cut by nothing but habit.',
    riddle: 'No one made me. Something small simply went the same way often enough.',
    etymology: 'A Sussex hedger’s word, collected by dialect societies in the 1870s and then quietly allowed to fall out of the language.',
    usage: 'A hare had left a ___ low in the blackthorn.',
  },
  {
    word: 'QUIRE', obscurity: 'rare',
    plain: 'Four sheets of paper folded together to make one section of a book.',
    poetic: 'The smallest bundle a book is willing to be built from.',
    riddle: 'Fold me, nest me, sew me to my brothers, and between us we have made a spine.',
    etymology: 'From the Latin for ‘four together’, by way of Old French; a printer’s unit for centuries before it was a stationer’s.',
    usage: 'He wrote the whole preface in a single ___, then burned two leaves of it.',
  },
  // ---- archaic -------------------------------------------------------------
  {
    word: 'SELCOUTH', obscurity: 'archaic',
    plain: 'Strange and marvelous; rarely seen.',
    poetic: 'So seldom met that the eye must be taught it twice before it will keep.',
    riddle: 'I once described comets and camels to villagers who had seen neither.',
    etymology: 'Old English: ‘seldom’ joined with ‘known’ — what is met so rarely it stays wondrous.',
    usage: 'A ___ light hung above the marsh, and the whole village came out to look.',
  },
  {
    word: 'EVENTIDE', obscurity: 'archaic',
    plain: 'The close of the day; the hour when dusk gathers.',
    poetic: 'The day folding its letter and sealing it with a first star.',
    riddle: 'I am the hour the plough stops and the lamp is lit — an older tongue’s word for the closing of the light.',
    etymology: 'Old English: the day’s last hour joined with ‘tide’, back when ‘tide’ still meant time, as in Yuletide.',
    usage: 'At ___ the bells rang the fields home.',
  },
  {
    word: 'YESTREEN', obscurity: 'archaic',
    plain: 'The evening that has just gone by; the hours after dark, now past.',
    poetic: 'Last night’s dark, not yet cold in the room it left.',
    riddle: 'I am gone mere hours, yet the ballads mourn me like a lost year.',
    etymology: 'A Scots contraction of an older phrase for the night just gone — beloved of Burns and the border ballads.',
    usage: '___ the frost came early and silvered all the panes.',
  },
  {
    word: 'OVERMORROW', obscurity: 'archaic',
    plain: 'The day after tomorrow.',
    poetic: 'Tomorrow’s quieter sister, standing two steps down the road.',
    riddle: 'Skip tomorrow once and you land on me.',
    etymology: 'Middle English, joining ‘beyond’ to ‘morrow’; German still keeps its twin alive.',
    usage: 'The mended clock will be ready ___, the tinker promised.',
  },
  {
    word: 'MERRYTHOUGHT', obscurity: 'archaic',
    plain: 'The wishbone of a fowl.',
    poetic: 'The little forked bone that holds a wish until two hands set it free.',
    riddle: 'Two pull; one keeps the longer half and the promise inside it. What bone am I?',
    etymology: 'Named for the cheerful custom of two diners snapping the forked breast-bone to see whose wish would keep.',
    usage: 'The cousins dried the ___ on the sill for tomorrow’s tug.',
  },
  {
    word: 'WIDDERSHINS', obscurity: 'archaic',
    plain: 'In a direction against the sun’s course; counterclockwise.',
    poetic: 'The wrong way round the church, where folktales keep their trouble.',
    riddle: 'Walk with me thrice round the well and the stories say you’ll wake the luck you shouldn’t.',
    etymology: 'From Middle Low German, ‘against the course’ — the opposite of walking sunwise.',
    usage: 'She stirred the pot ___ and her aunt clucked at the omen.',
  },
  {
    word: 'ANTIMACASSAR', obscurity: 'archaic',
    plain: 'A cloth laid over the back of a chair to protect it from hair oil.',
    poetic: 'A small linen shield against the greasy heads of the nineteenth century.',
    riddle: 'I exist because gentlemen oiled their hair and their aunts owned good chairs.',
    etymology: 'Named for the very hair oil it defended against — a preparation sold as coming from a port in the Indies, and named for that port.',
    usage: 'The ___ on the wing-chair has been starched by three generations of housekeepers.',
  },
];

// ---------------------------------------------------------------------------
// The answer-leak lint + structural validation (build fails on any problem).
// ---------------------------------------------------------------------------

/** Content words of a line, for the register-overlap gate. */
const STOPWORDS = new Set([
  'a', 'an', 'and', 'as', 'at', 'be', 'but', 'by', 'for', 'from', 'in', 'is',
  'it', 'its', 'of', 'on', 'or', 'that', 'the', 'to', 'up', 'was', 'what',
  'when', 'which', 'who', 'with', 'you', 'your', 'i', 'me', 'my', 'am', 'are',
  'no', 'not', 'so', 'than', 'then', 'there', 'they', 'this', 'too', 'very',
]);

function contentWords(text: string): Set<string> {
  return new Set(
    text.toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/)
      .filter((w) => w.length > 2 && !STOPWORDS.has(w)),
  );
}

function overlap(a: string, b: string): number {
  const A = contentWords(a), B = contentWords(b);
  if (A.size === 0 || B.size === 0) return 0;
  let shared = 0;
  for (const w of A) if (B.has(w)) shared++;
  return shared / Math.min(A.size, B.size);
}

/** First-person voice — the riddle's register, forbidden to plain and poetic. */
const FIRST_PERSON = /\b(I|I'm|I've|me|my|mine)\b/;

/** Highest tolerated content-word overlap between two registers. */
const MAX_REGISTER_OVERLAP = 0.4;

/**
 * The register lint (round 4). Three tiers are only "real" if the three
 * definitions are three different kinds of sentence — this is what proves it.
 */
function registerProblems(id: string, e: Entry): string[] {
  const problems: string[] = [];
  if (FIRST_PERSON.test(e.plain)) problems.push(`${id}: plain uses the riddle's first-person voice`);
  if (FIRST_PERSON.test(e.poetic)) problems.push(`${id}: poetic uses the riddle's first-person voice`);
  if (!FIRST_PERSON.test(e.riddle) && !e.riddle.trim().endsWith('?')) {
    problems.push(`${id}: riddle neither speaks in first person nor asks a question`);
  }
  if (e.plain.length > 120) problems.push(`${id}: plain is ${e.plain.length} chars — a gloss, not an essay`);
  for (const [a, b, an, bn] of [
    [e.plain, e.poetic, 'plain', 'poetic'],
    [e.poetic, e.riddle, 'poetic', 'riddle'],
    [e.plain, e.riddle, 'plain', 'riddle'],
  ] as [string, string, string, string][]) {
    const o = overlap(a, b);
    if (o > MAX_REGISTER_OVERLAP) {
      problems.push(`${id}: ${an}/${bn} share ${(o * 100).toFixed(0)}% of their content words — rewrite one`);
    }
  }
  return problems;
}

/**
 * The pool gate. EXPORTED (round 6) so `content:verify` and vitest can both
 * run it — an unexported build-time lint is a lint that does not exist.
 */
export function lint(entries: Entry[]): string[] {
  const problems: string[] = [];
  if (entries.length < 20) problems.push(`pool too small: ${entries.length} < 20`);
  const perTier: Record<Tier, number> = { 1: 0, 2: 0, 3: 0 };
  for (const e of entries) perTier[TIER_OF_OBSCURITY[e.obscurity]]++;
  for (const tier of [1, 2, 3] as Tier[]) {
    if (perTier[tier] < MIN_PER_TIER) {
      problems.push(`tier ${tier} has only ${perTier[tier]} entries (min ${MIN_PER_TIER})`);
    }
  }
  const seen = new Set<string>();
  for (const e of entries) {
    const id = `fw-${e.word.toLowerCase()}`;
    if (seen.has(e.word)) problems.push(`${id}: duplicate word`);
    seen.add(e.word);
    if (e.word.length > 15) problems.push(`${id}: longer than 15 letters`);
    if (!/^[A-Z]+$/.test(e.word)) problems.push(`${id}: word must be uppercase A–Z`);
    if (!e.usage.includes('___')) problems.push(`${id}: usage has no blank`);

    // Three genuinely distinct registers (AAA 3.7 clarity scaling).
    if (e.plain === e.poetic || e.poetic === e.riddle || e.plain === e.riddle) {
      problems.push(`${id}: definition registers are not distinct`);
    }
    problems.push(...registerProblems(id, e));

    // No clue may contain the answer's stem (first 4 letters ⇒ catches every
    // prefix of 4+). A paid clue containing the answer is a refund with a bow.
    const stem = e.word.slice(0, 4).toLowerCase();
    const clues: [string, string][] = [
      ['plain', e.plain], ['poetic', e.poetic], ['riddle', e.riddle],
      ['etymology', e.etymology], ['usage', e.usage],
    ];
    for (const [name, text] of clues) {
      if (text.toLowerCase().includes(stem)) {
        problems.push(`${id}: ${name} leaks the answer stem "${stem}": ${text}`);
      }
    }
  }
  return problems;
}

// ---------------------------------------------------------------------------
// The SHIPPED pool — what the game actually loads.
// ---------------------------------------------------------------------------

/** Where the built pool lives (the file `src/content/pools.ts` serves). */
export const POOL_PATH = join(
  dirname(fileURLToPath(import.meta.url)), 'generated', 'forgotten-word.json',
);

type ShippedPuzzle = ForgottenWordPuzzle & { tier: Tier };

export function buildPuzzles(entries: Entry[] = ENTRIES): ShippedPuzzle[] {
  return entries.map((e) => ({
    id: `fw-${e.word.toLowerCase()}`,
    word: e.word,
    obscurity: e.obscurity,
    tier: TIER_OF_OBSCURITY[e.obscurity],
    definitions: { plain: e.plain, poetic: e.poetic, riddle: e.riddle },
    etymology: e.etymology,
    usage: e.usage,
    ...(e.acceptedAnswers ? { acceptedAnswers: e.acceptedAnswers } : {}),
  }));
}

/** A shipped puzzle read back into the shape the register lint speaks. */
export function entryOfPuzzle(p: ShippedPuzzle): Entry {
  return {
    word: p.word,
    obscurity: p.obscurity,
    plain: p.definitions.plain,
    poetic: p.definitions.poetic,
    riddle: p.definitions.riddle,
    etymology: p.etymology,
    usage: p.usage,
    ...(p.acceptedAnswers ? { acceptedAnswers: [...p.acceptedAnswers] } : {}),
  };
}

/**
 * Lint the SHIPPED pool through the very same rules as the authored entries.
 *
 * This is the half that was missing: `ENTRIES` is the manuscript, but
 * `generated/forgotten-word.json` is the book, and the Study reads the book.
 * A hand-edit that collapses a word's three registers into one gloss lands in
 * the JSON, where nothing looked.
 */
export function lintPuzzles(puzzles: ShippedPuzzle[]): string[] {
  return lint(puzzles.map(entryOfPuzzle));
}

/** Reads the shipped pool from disk (throws if it is missing or malformed). */
export function readShippedPool(path: string = POOL_PATH): ShippedPuzzle[] {
  return JSON.parse(readFileSync(path, 'utf-8')) as ShippedPuzzle[];
}

/**
 * The whole gate, in one call: the manuscript lints, the book lints, and the
 * book is the manuscript. Returns [] when the Study is honest.
 */
export function verifyPool(path: string = POOL_PATH): string[] {
  const problems = lint(ENTRIES);
  let shipped: ShippedPuzzle[];
  try {
    shipped = readShippedPool(path);
  } catch (err) {
    return [...problems, `shipped pool unreadable at ${path}: ${(err as Error).message}`];
  }
  problems.push(...lintPuzzles(shipped).map((p) => `[shipped] ${p}`));
  const expected = JSON.stringify(buildPuzzles());
  if (JSON.stringify(shipped) !== expected) {
    problems.push(
      '[shipped] generated/forgotten-word.json is out of sync with ENTRIES — ' +
      'run `npm run content:forgotten-word` (never hand-edit the pool)',
    );
  }
  return problems;
}

function main() {
  const check = process.argv.includes('--check');
  const problems = check ? verifyPool() : lint(ENTRIES);
  if (problems.length > 0) {
    console.error(problems.join('\n'));
    throw new Error(`forgotten-word lint failed with ${problems.length} problem(s)`);
  }

  if (check) {
    console.log(
      `forgotten-word: register lint clean over ${ENTRIES.length} authored entries ` +
      'and the shipped pool',
    );
    return;
  }

  const puzzles = buildPuzzles();
  writeFileSync(POOL_PATH, JSON.stringify(puzzles));
  const counts = puzzles.reduce<Record<string, number>>((m, p) => {
    m[`t${p.tier}`] = (m[`t${p.tier}`] ?? 0) + 1;
    return m;
  }, {});
  console.log(`forgotten-word.json: ${puzzles.length} entries (${Object.entries(counts).sort().map(([k, v]) => `${k}: ${v}`).join(', ')})`);
}

/**
 * Run only as the process entry point (round 6). `main()` used to execute at
 * module scope, so this file could not be imported by a test or by another
 * script without writing a build artifact as a side effect — which is exactly
 * why the lint never reached CI.
 */
const invokedDirectly = process.argv[1] !== undefined &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) main();
