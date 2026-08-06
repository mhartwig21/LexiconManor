// One-shot authoring patch (A6): deepen Ellery's single-line conversations
// into exchanges and add the repeatable gift-thanks + new general topics.
import { readFileSync, writeFileSync } from 'node:fs';
const p = new URL('./ellery.json', import.meta.url);
const j = JSON.parse(readFileSync(p, 'utf8'));
const L = (portrait, text) => ({ speaker: 'ellery', portrait, text });
const N = (text) => ({ speaker: 'ellery', narration: true, text });
const add = {
  'ellery.meet.1': [
    L('wistful', "Thirty-one years on the living payroll, and — let's call it a generous tenure since. The manor keeps excellent staff. It simply forgets to let them go."),
  ],
  'ellery.meet.1a': [
    L('curious', "Tell me — do you dog-ear? Be honest. I can't evict you for it, but I can reshelve your opinion of yourself."),
    L('warm', "I'm teasing. Mostly. Come in properly; the reading chairs are friendlier than the dust suggests."),
  ],
  'ellery.meet.1b': [
    L('neutral', "The paperwork of it was refreshingly light. One moment a librarian, the next a librarian with better reach and no lunch breaks."),
    L('warm', "You needn't be delicate about it, dear. The dead make very calm colleagues. We've read all the endings already."),
  ],
  'ellery.meet.2': [
    L('neutral', "And mind the ladder in the north corner. It wheels itself about at night looking for someone to be useful to. Terribly keen. Frightens the atlases."),
  ],
  'ellery.react.fragment-1': [
    L('curious', "Hold it flat a moment — yes. See how the ink pales at the end of the line? He wrote that one late, and quickly, before he could talk himself out of it."),
    L('warm', "You're gentler with his pages than he was, at the end. I find I like watching that."),
  ],
  'ellery.react.fragment-2': [
    L('neutral', "I used to reshelve around the gaps he left. A library learns to hold its breath. It's exhaling now, one scrap at a time."),
    L('warm', "Keep going, dear. Half-gathered is the loneliest state a scattered thing can be in."),
  ],
  'ellery.react.interpreted': [
    L('curious', "I've thought more about that line since. There's a second reading under the first, the way damp shows through wallpaper. We'll get to it."),
    L('warm', "He'd have liked being read this way. Slowly. Twice. It's the skim he couldn't bear."),
  ],
  'ellery.react.web-perfect': [
    L('warm', "I reshelved nothing after you left. Nothing. Do you know when that last happened? Neither do I, and I keep meticulous records."),
    L('neutral', "The shelves have asked me to be unbearable about it on their behalf. Consider me unbearable."),
  ],
  'ellery.react.web': [
    L('curious', "One case fought you, didn't it — the one that looked obvious. It's always the obvious shelf that's lying. He taught me that. The hard way, twice."),
    L('warm', "Still: sorted is sorted. The room sleeps better tonight, and so, I suspect, will you."),
  ],
  'ellery.react.web-left': [
    L('neutral', "I've dusted around the unsorted case and told it nothing. Suspense is good for shelves. Builds character in the fiction section especially."),
    L('warm', "Come back to it fresh. Sorting tired is how atlases end up in Biography."),
  ],
  'ellery.react.guess': [
    L('neutral', "The books nearest the stairs leaned toward the sound. I had to straighten a full case of essays. Essays, mind — they lean toward nothing as a rule."),
    L('warm', "Whatever you said, it was worth the straightening. Say another when you're ready. I'll bring the trolley."),
  ],
  'ellery.react.guess-repeat': [
    L('neutral', "No shame in it. I once requested the same interlibrary loan three times out of pure hope. But the catalogue is trying to tell you something, dear: look elsewhere on the shelf."),
    L('curious', "Cross it out in your journal, nice and firm. An elimination is a fact, and facts are the only furniture that doesn't move in this house."),
  ],
  'ellery.react.pangram': [
    L('curious', "A word using every letter it was given — there's a term for the feeling that produces in a librarian, and I am too dignified to demonstrate it."),
    L('warm', "I demonstrated it. Briefly. The moth saw nothing."),
  ],
  'ellery.react.many-rooms': [
    L('neutral', "The card notes 'handles books with respect; argues with shelving logic; correct oftener than is polite.' High praise, in my hand."),
    L('warm', "There's space left on the card, dear. Do keep earning entries. Catalogues abhor a blank line."),
  ],
  'ellery.react.letter': [
    L('curious', "She strings, she stamps, she holds each envelope to the light like a suspect. The post arrives immaculate and slightly interrogated."),
    L('warm', "Answer your letters, dear. In this house, correspondence is load-bearing."),
  ],
  'ellery.react.victory': [
    L('warm', "Come by the Library tonight, if you like. Not to sort. Just to sit. It reads differently now — the whole room does. You did that."),
  ],
  'ellery.arc.chair': [
    L('neutral', "You needn't look stricken, dear. As last chapters go, it was a fine one. I checked."),
  ],
  'ellery.arc.chair-a': [
    L('wistful', "Staying was the easy part, if I'm honest. The hard part is watching people carry sadness up my stairs on my account. Don't you start."),
  ],
  'ellery.arc.chair-b': [
    L('warm', "F through H, dear. Fathom to Hearth, with a good long pause at Grief and a better one at Home. As I say: never once regretted it."),
  ],
  'ellery.arc.ink-1': [
    L('wistful', "The sound changed. That's what I remember. A pen writing hopes for a living makes one sound; a pen unwriting them makes another. The Library learned to dread the second."),
    L('neutral', "I said nothing at the time. Note that down as the catalogue's one misfile — patience mistaken for kindness."),
  ],
  'ellery.arc.ink-2': [
    L('wistful', "I've had thirty years to draft what I should have said. It's short. 'Put the pen down, old friend, and tell me about her.' Eleven words. I file them under 'late.'"),
    L('warm', "You're my amendment, you understand. Every page you carry to the lamp un-inks him a little. Librarians don't intervene — but we may, it turns out, assist."),
  ],
  'ellery.arc.interpret-offer': [
    L('curious', "There — see how the meaning sits up when two people look at it? Reading was never meant to be done alone. Even he knew that, once."),
    L('warm', "Bring me the others as you find them. The lamp and I keep long hours, and the moth doesn't count as company. Don't tell him."),
  ],
  'ellery.service.interpret': [
    L('curious', "Mm — and there's the slant, right on schedule. Well caught, both of us. Same lamp tomorrow, if the house permits."),
  ],
  'ellery.quest1.ask': [
    L('wistful', "I'd look myself, but the shelves and I have an old agreement: I keep their order, they keep my secrets. Neither of us breaks a contract. It's why we've lasted."),
  ],
  'ellery.quest1.done': [
    L('warm', "Well. I shall be quite insufferable about having a bookplate, you understand. The moth has already been informed twice."),
  ],
  'ellery.arc.locked': [
    L('wistful', "I stood outside that carrel every evening for a year after. Never opened it. Some doors want a living hand, I told myself. Convenient, how often the truth is also an excuse."),
  ],
  'ellery.arc.keepsake': [
    L('neutral', "The card catalogue objected to the informality. The card catalogue may take it up with management, who is me, who has ruled in your favor."),
  ],
  'ellery.gen.marginalia': [
    L('curious', "The master wrote his in three inks. Black for facts, blue for doubts. The brown ink he never explained, and those are the notes I reread."),
    L('warm', "Leave your own, dear — pencil, light hand. A book no one argues with dies of politeness."),
  ],
  'ellery.gen.moth': [
    L('neutral', "We've renegotiated once. He wanted the prefaces as well; I held firm. A librarian who can't face down a moth has no business with the dictionary case."),
    L('amused', "He's currently three chapters into a very bad review of a very good book. I let him. Roughage."),
  ],
  'ellery.gen.weather': [
    L('curious', "Petrichor, Posy calls it — the smell of rain arriving. I'm told the word came home to her recently. Words do that here, given enough patience and the right guest."),
    L('warm', "Stand in the next shower twice as long, would you. Once for you, once for the ghost with the excellent memory."),
  ],
  'ellery.gen.catalogue': [
    L('neutral', "My leading theory is that the house shelves by sentiment. The atlases went to Biography the week I missed the sea. I have decided not to test the theory further. It knows things."),
    L('amused', "If you find the poetry in with the account books, leave it. Somebody in this house's history needed numbers to rhyme, and I respect that."),
  ],
  'ellery.gen.tea': [
    L('wistful', "Steam through a ghost is the nearest thing we get to warmth, if you're wondering. I hover over the cup like a woman warming her hands at a very small hearth."),
    L('warm', "Four o'clock, dear. If you're passing, pass slowly. The company improves the steam."),
  ],
  'ellery.gen.dewey': [
    L('neutral', "He audits me weekly. Walks the stacks, tail up, stopping at anything misfiled. His error rate is zero. Mine is a matter I decline to discuss with a cat."),
    L('amused', "I have seen him move a bookmark with his paw to a more significant page. I no longer say 'it's only a cat' about anything in this house."),
  ],
  'ellery.gen.sanctum': [
    L('neutral', "The door doesn't punish wrong answers, whatever the Portrait's eyebrows imply. It simply files them. Doors and librarians, dear — we keep everything and hold nothing against you."),
    L('warm', "And when you do go up — walk, don't creep. You're a reader arriving at the last chapter, not a trespasser. There is an enormous difference in the posture."),
  ],
  'ellery.idle.valve-1': [
    L('neutral', "Closing time is a fiction I maintain for the books' morale. Still — respect the fiction. Fiction runs this establishment."),
  ],
  'ellery.idle.valve-2': [
    L('warm', "Come back tomorrow, dear. I shall have thought of something else worth saying by then. Eternity is marvelous for preparation."),
  ],
  'ellery.idle.shelving': [
    N('Now and then she pauses at a gap, resting her hand where a book should be, the way one rests a hand on a shoulder.'),
  ],
  'ellery.idle.reading': [
    N('Without looking up, the pages pause — as though the book, or its reader, has noticed you and decided you can wait one more sentence.'),
  ],
  'ellery.idle.warm': [
    L('amused', 'That was the books, mind. I merely pass along the consensus of the collection.'),
  ],
};
let added = 0;
for (const n of j.nodes) {
  const extra = add[n.id];
  if (extra && extra.length) { n.lines.push(...extra); added += extra.length; }
}
// New nodes.
const idleAt = j.nodes.findIndex((n) => n.id === 'ellery.idle.valve-1');
j.nodes.splice(idleAt, 0,
  {
    id: 'ellery.react.gift-thanks',
    trigger: 'idle',
    priority: 800,
    once: false,
    cooldownDays: 0,
    conditions: [
      { kind: 'event', event: 'gift-given', withinDays: 0, where: { character: 'ellery' } },
    ],
    lines: [
      L('warm', "Another bookmark? You do understand these are addictive to my kind. It goes in today's book — which, since you ask, deserves it."),
      L('amused', "The moth is beside himself with envy. Good. Envy keeps him off the prefaces."),
    ],
  },
  {
    id: 'ellery.gen.first-editions',
    trigger: 'parlor',
    priority: 100,
    once: true,
    lines: [
      L('neutral', "The first editions live behind the glass, and the glass lives behind my reputation. Both are sturdier than they look."),
      L('curious', "Though between us: the books worth guarding are rarely the valuable ones. The master's old school primer is in that case. Sixpence, water-stained, irreplaceable."),
      L('warm', "That's the whole secret of collections, dear. The price tag and the worth are shelved in different rooms."),
    ],
  },
  {
    id: 'ellery.gen.dictionary-row',
    trigger: 'parlor',
    priority: 100,
    once: true,
    lines: [
      L('curious', "The dictionaries have a shelf to themselves, facing the window. His request. He said definitions deserve daylight — they spend their lives being taken at midnight, in a hurry."),
      L('wistful', "Volume three sits a little proud of the row, no matter how I square it. My old friend F-through-H. We allow each other our habits."),
      L('warm', "Look a word up the slow way while you're here, sometime. The walk to the shelf is part of the meaning. He believed that. So, inconveniently, do I."),
    ],
  },
  {
    id: 'ellery.gen.returns',
    trigger: 'parlor',
    priority: 100,
    once: true,
    lines: [
      L('amused', "A book came back through the returns slot this morning. We have no returns slot. I've decided to be flattered rather than alarmed — the house is imitating me."),
      L('neutral', "It was overdue by forty years, if the stamp is honest. I've waived the fine. Grandly. To no one."),
      L('warm', "Everything comes back eventually in this house, dear. Books, words, nerve. The trick is keeping the shelf ready."),
    ],
  },
);
writeFileSync(p, JSON.stringify(j, null, 2) + '\n');
console.log('added', added, '; totals:', j.nodes.length, 'nodes',
  j.nodes.reduce((a, x) => a + x.lines.length, 0), 'lines');
