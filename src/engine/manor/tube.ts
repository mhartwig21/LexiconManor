/**
 * The speaking tube — OWNER: A1 (Manor). Pure TS, zero React/DOM.
 *
 * ═══ ROUND 17 — DECOUPLING THE GUESS FROM THE CLIMB (REVIEW_AA §5.2) ═══════
 *
 * THE FINDING. The volume is solvable in principle on day 1 (AAA 4.18) and the
 * guess itself has always been free (`SANCTUM_GUESS_COST` is 0). What was not
 * free was ADDRESSING the door at all: `atSanctumDoor` wanted her standing on
 * (2,5) with a north-opening plan drafted there, an ascent priced at 22 bare
 * steps against a base budget of 18, across ~1.85 padlocks at 2 keys each, and
 * a landing offer that contained an opening plan on ~0.61 of draws. Measured on
 * `PROFILE_DECENT`: first door median day 19, 7–14% never inside 45 evenings.
 * A reviewer who deduced the answer on day 1 was still stranded on day 3.
 *
 * The consequence was not just pacing. The Portrait — MANOR_DESIGN §8's "the
 * mystery's heart, the person you are healing" — reacts only to a guess, so his
 * closeness variants, his two thaw beats and his arrival shades were content
 * that, for most players, did not exist. The game was rationing its own writing
 * behind a probability distribution.
 *
 * THE MECHANIC, in one sentence: **the word goes up the brass; the player goes
 * up the stairs.**
 *
 *   1. THE TUBE (engine/manor/grid.ts `SPEAKING_TUBE_CELL`, the Entrance Hall)
 *      hears one word a day, from day 1, at zero steps. It is the SAME daily
 *      guess the door hears — `hasGuessedOnDay` is untouched, so the
 *      anti-brute-force rule is unchanged and there is no second attempt to be
 *      bought by walking upstairs afterwards.
 *   2. A WRONG WORD is a full scene, downstairs: the same `sanctum-guess-wrong`
 *      event with the same closeness metadata, so `portrait.guess.*`, both thaw
 *      beats and the struck-through elimination list all play on day 2.
 *   3. A RIGHT WORD DOES NOT CLOSE THE VOLUME. He hears it, the seal answers
 *      from four floors up, and he asks her to come and say it to his face.
 *      That is `answeredFlag` below: permanent, write-once, and from the moment
 *      it is set the house stops gambling with her — the landing offer's mercy
 *      slot is armed outright and the padlocks between her and the top stand
 *      open (`doorsHeldOpen`). The ceremony still costs the climb; it no longer
 *      costs a lottery.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO, and why each is a trade rather than an
 * oversight:
 *
 *   - **It does not trivialise the padlock arc.** `doorsHeldOpen` is false for
 *     the whole of the volume up to the moment she NAMES THE WORD CORRECTLY.
 *     Every one of the ~20 evenings before that pays the padlock in keys
 *     exactly as before, and 4.10d's day-1 landing reach is untouched, because
 *     nothing here can be true on a day she has not already won the deduction.
 *   - **It does not make the climb pointless.** The climb never bought the
 *     guess's CONTENT — it bought fragments (violet supply and `decipherYield`
 *     both scale with the row), keys, tier-3 solve payouts, and the Portrait's
 *     audience, all of which are unchanged and all of which are still up there.
 *     The tube removes the one thing the climb should never have been selling:
 *     permission to speak.
 *   - **It does not move the ceremony.** The seal, the reveal, the four-beat
 *     monologue and the epilogue play at the door, on the landing, or not at
 *     all. A volume answered through the tube and never climbed to stays open.
 *   - **It does not gate on fragments.** AAA 4.18 is intact in the strongest
 *     form it has ever had: a player who deduces LACUNA on day 1 may say so on
 *     day 1, and if she can also pay the climb that day, she wins on day 1.
 *     Measured, that is a vanishingly rare evening (a bare ascent is 22 steps
 *     against a day-1 pot of 21) — but it is now HERS to attempt, which is what
 *     4.18 always claimed and round 7 quietly took away.
 */

import type { ManorState } from '../types';

/**
 * `vol.<volumeId>.answered` — the door has heard the true word, wherever it
 * was spoken from, and is waiting for her to come up and repeat it.
 *
 * Write-once, in the `vol.*` family docs/flags.md reserves for the volume
 * machine, so it needs no save-schema change and survives the day roll and a
 * force-quit exactly as `sealed-`/`legible-`/`landing-reached` do. It is set by
 * `app/slices/journal.ts guessAtSanctum` and read by the manor slice (the
 * landing arc), the blueprint (the lit stair) and the Sanctum screen.
 */
export function sanctumAnsweredFlag(volumeId: string): string {
  return `vol.${volumeId}.answered`;
}

/** Has the true word been spoken for this volume yet? */
export function sanctumAnswered(volumeId: string, flags: Iterable<string>): boolean {
  const flag = sanctumAnsweredFlag(volumeId);
  for (const f of flags) if (f === flag) return true;
  return false;
}

/**
 * Do the manor's padlocks stand open right now?
 *
 * Exactly one thing opens them, and it can only ever happen once per volume:
 * she has named the word and the house is holding its doors for the walk up.
 * Kept as a named predicate rather than an inline `flags.includes` so the three
 * surfaces that must agree about a padlock — the draft gate in
 * `app/slices/manor.ts`, the blueprint's drawn locks, and the draft modal's key
 * line — read one answer (the round-13 lesson about `atSanctumDoor`, applied
 * before the same defect can happen twice).
 */
export function doorsHeldOpen(volumeId: string, flags: Iterable<string>): boolean {
  return sanctumAnswered(volumeId, flags);
}

/**
 * Is the ceremony waiting for her at the top? True when the word is answered,
 * she is standing at the door, and the volume has not closed yet — the one
 * condition under which `SanctumView` plays the win without asking her to type
 * anything again. (Typing it a second time would spend a second daily guess for
 * a word the door has already accepted.)
 */
export function ceremonyAwaits(
  manor: ManorState | null | undefined,
  volumeId: string,
  flags: Iterable<string>,
  atDoor: boolean,
): boolean {
  return Boolean(manor) && atDoor && sanctumAnswered(volumeId, flags);
}
