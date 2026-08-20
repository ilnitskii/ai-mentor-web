# Progress projection v1

`progress-v1` is a deterministic, rebuildable projection over append-only
`progress_events`. The browser implementation lives in
`apps/web/src/domain/progressProjection.ts`; the Python mentor aggregate uses
the same mastery weights and the shared synthetic fixture
`fixtures/progress-projection.v1.json`.

## Mastery evidence

Base weights are 0.2 for a completed lesson, 0.6 for a card review, 1.0 for a
task submission and 0.8 for a corrected mistake. A used hint halves the weight;
viewing a reference solution halves it again. Evidence from the last 7 days has
full weight, evidence aged 8–30 days has multiplier 0.85, and older evidence has
multiplier 0.7. Repeating the same item in one projection has multiplier 0.25
after its first occurrence.

Mastery is the rounded weighted accuracy in the range 0–100. A topic supported
only by lesson-completion evidence is capped at 40. Pending free-text review is
evidence but has no correct/incorrect outcome until a review event exists.
Events more than five minutes ahead of projection time are ignored as clock
skew. Duplicate `event_id` values are applied once.

## Review schedule

Each `card_reviewed` event updates stability and difficulty. `again` halves
stability and schedules at least 0.25 days; `hard`, `good`, and `easy` multiply
stability by 1.2, 2, and 3 respectively. A known incorrect answer is always
treated as `again`, regardless of the self-rating. All due timestamps are UTC.

## XP, streak and shields

Lessons grant 5 XP, ordinary card reviews 2 XP, easy reviews 1 XP with a 10 XP
daily cap, correct tasks 12 XP, other task submissions 6 XP, and corrected
mistakes 8 XP. A learning day completes only at 10 XP plus one answer with a
deterministic outcome. Dates are calculated in the event timezone, including DST
boundaries. Three completed streak days grant one shield, with a maximum of two;
one missed calendar day can be bridged once as a soft return, after which a
shield is consumed when available.

`mastery_snapshots` and `card_states` are convenience projections protected by
RLS. They are never the source of truth and may be discarded and rebuilt from
events with the same algorithm version and `as_of` timestamp.
