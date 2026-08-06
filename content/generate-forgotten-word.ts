import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ForgottenWordPuzzle } from '../src/engine/types';

/**
 * The Study's Forgotten Word pool — fully hand-authored (AAA 3.7: the best
 * writing in the game, editorial read-aloud standard).
 *
 * Rules enforced at build time (the answer-leak lint):
 *  - no clue string (definitions, etymology, usage) may contain the first
 *    four letters of the answer — a paid clue must never contain the answer
 *    or its stem (the fw-serendipity lesson);
 *  - the three definition registers are genuinely distinct strings: plain
 *    (tier 1) → poetic (tier 2) → riddle (tier 3), implementing the clarity
 *    scaling the adapter documents;
 *  - usage carries a ___ blank; words ≤15 letters; pool ≥30 entries.
 *
 * Run: npx tsx content/generate-forgotten-word.ts
 */

interface Entry {
  word: string;
  obscurity: ForgottenWordPuzzle['obscurity'];
  plain: string;
  poetic: string;
  riddle: string;
  etymology: string;
  usage: string;
  acceptedAnswers?: string[];
}

const ENTRIES: Entry[] = [
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
    poetic: 'Yesterday, lit gold by the lamp of missing it.',
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
  // ---- medium --------------------------------------------------------------
  {
    word: 'PETRICHOR', obscurity: 'medium',
    plain: 'The earthy smell of rain falling on dry ground.',
    poetic: 'The ground’s held breath, released at the first kind touch of rain.',
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
    poetic: 'The gray hem on night’s coat, where light and dark trade whispers.',
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
  // ---- archaic -------------------------------------------------------------
  {
    word: 'SELCOUTH', obscurity: 'archaic',
    plain: 'Strange and marvelous; rarely seen.',
    poetic: 'So unfamiliar the eye must learn it twice.',
    riddle: 'I once described comets and camels to villagers who had seen neither.',
    etymology: 'Old English: ‘seldom’ joined with ‘known’ — what is met so rarely it stays wondrous.',
    usage: 'A ___ light hung above the marsh, and the whole village came out to look.',
  },
  {
    word: 'EVENTIDE', obscurity: 'archaic',
    plain: 'The close of the day; the hour when dusk gathers.',
    poetic: 'The day folding its letter and sealing it with a first star.',
    riddle: 'I am the hour the plough stops and the lamp is lit; my name is the old way of saying dusk.',
    etymology: 'Old English: the day’s last hour joined with ‘tide’, back when ‘tide’ still meant time, as in Yuletide.',
    usage: 'At ___ the bells rang the fields home.',
  },
  {
    word: 'YESTREEN', obscurity: 'archaic',
    plain: 'Last night.',
    poetic: 'The night just past, still warm on the pillow of memory.',
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
];

// ---------------------------------------------------------------------------
// The answer-leak lint + structural validation (build fails on any problem).
// ---------------------------------------------------------------------------

function lint(entries: Entry[]): string[] {
  const problems: string[] = [];
  if (entries.length < 30) problems.push(`pool too small: ${entries.length} < 30`);
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

function main() {
  const problems = lint(ENTRIES);
  if (problems.length > 0) {
    console.error(problems.join('\n'));
    throw new Error(`forgotten-word lint failed with ${problems.length} problem(s)`);
  }

  const puzzles: ForgottenWordPuzzle[] = ENTRIES.map((e) => ({
    id: `fw-${e.word.toLowerCase()}`,
    word: e.word,
    obscurity: e.obscurity,
    definitions: { plain: e.plain, poetic: e.poetic, riddle: e.riddle },
    etymology: e.etymology,
    usage: e.usage,
    ...(e.acceptedAnswers ? { acceptedAnswers: e.acceptedAnswers } : {}),
  }));

  const outPath = join(dirname(fileURLToPath(import.meta.url)), 'generated', 'forgotten-word.json');
  writeFileSync(outPath, JSON.stringify(puzzles));
  const counts = puzzles.reduce<Record<string, number>>((m, p) => {
    m[p.obscurity] = (m[p.obscurity] ?? 0) + 1;
    return m;
  }, {});
  console.log(`forgotten-word.json: ${puzzles.length} entries (${Object.entries(counts).map(([k, v]) => `${k}: ${v}`).join(', ')})`);
}

main();
