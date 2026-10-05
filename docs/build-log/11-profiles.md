# 11 — Profiles: who created it, who solved it, how many

## Goal

Until now every browser was an anonymous id. The app could count attempts, but it couldn't say
**who** made a simulation, **who** solved it, or show anyone's history, and clearing cookies made you
a new person. This step adds profiles.

## The decision: a name, not a login

My first plan was "Sign in with GitHub / Google". I changed course after this feedback:

> "It's a demo, don't ask for real Gmail. Just tell them to create a profile with some name."

So a profile is **just a name**:

| Step | What happens |
|---|---|
| Pick a name | e.g. "Sai Teja" → you become **@sai-teja** (unique: `sam`, `sam-2`, …) |
| This browser | stays signed in (a signed cookie, valid for a year) |
| Profile key | shown **once**, e.g. `k7m2-q9xa-4rtp`; it signs you in on another device; only its hash is stored |
| Your guest history | comes with you: the profile reuses this browser's guest id, so nothing is lost |

| Option | Why not (for now) |
|---|---|
| Google / GitHub login | Real setup (OAuth apps, secrets) and asks testers for real accounts. Overkill for a demo |
| Email + password | Password storage, resets, email delivery: lots of work, little value at this stage |
| Name only, no key | Anyone could "be" anyone on a new device |

## When you're asked for a name

Playing stays open. The name is asked for at the moment something gets **recorded under you**:
starting a simulation, creating one in the Studio, liking, rating, or commenting. The dialog then
continues what you were doing.

## What's recorded and shown

| Where | What |
|---|---|
| Simulation page | "Created by {name}", **"Solved by N people"** (distinct people) with the most recent solvers |
| Comments | written as your profile; the name links to your profile; "✓ solved it" badge |
| Cards on the home page | "by {creator's current name}" |
| **Profile page** `/u/{handle}` | what you've **solved** (date, number of attempts) and **created** |
| Scores | your best score per simulation is visible **only to you** |

## How it works

| Piece | File |
|---|---|
| `users` table (id, handle, display name, key hash); published runs may now change owner only | `packages/database/migrations/0005_accounts.sql` |
| Create profile, verify key, merge a guest into a profile, solved/created lists, recent solvers | `packages/database/src/accounts.ts` (+ tests) |
| "Who is asking": signed session cookie or guest cookie; `requireProfile()` (→ 401) | `apps/web/lib/session.ts` |
| API: `GET/POST/PATCH /api/profile`, `POST /api/profile/signin`, `POST /api/profile/signout` | `apps/web/app/api/profile/**` |
| The "Pick a name" dialog, header chip, `requireProfile()` on the client | `apps/web/components/Profile.tsx` |
| Profile page | `apps/web/app/u/[handle]/page.tsx` |
| "Solved by N people" counts distinct people, not finished attempts | `solvers` in `packages/database/src/social.ts` |

### Key design points

- **One id for everything.** Runs, scenarios, likes, ratings and comments were already keyed by the
  guest id. A profile **takes over** that id, so there's no data migration at sign-up. Signing in on a
  second device **merges** that device's guest rows into the profile, in one transaction; if both had
  liked the same simulation, it stays one like.
- **Signed session cookie** (`userId.expiry.HMAC`). User ids aren't secret (they appear in API
  responses), so the cookie must be signed, or anyone could become anyone. The signing key is
  `AUTH_SECRET`, or derived from `DATABASE_URL` if that isn't set: one less thing to configure.
- **Profile key** is 12 random characters from an unambiguous alphabet (~60 bits). Because it's
  random, not user-chosen, a SHA-256 hash is enough (no bcrypt-style stretching needed), compared in
  constant time.
- **Published runs stay frozen**, except that the database trigger now allows changing the
  owner, which is what a merge needs. Any other change is still rejected (tested).

## Bugs found while building it

1. **"Solved by 11 people"** counted finished *attempts*, not people. Added a distinct-people count
   (`solvers`) and a test that finishing twice is still one solver.
2. My browser test clicked the header's "Create profile" chip instead of the dialog's button:
   two buttons with the same label. Scoped the test to the dialog.

## How it was verified

- 86 unit and database tests (profiles, unique handles, key check, guest merge incl. published runs,
  likes de-duplicated on merge, distinct solvers, published runs still immutable).
- Browser test with three people:
  1. A likes a simulation → "Pick a name" → profile created, key shown → the like goes through.
  2. A starts, submits, rates and comments; the comment links to A's profile; "Solved by" lists A.
  3. A's profile shows the solve **with** the score; a stranger sees it **without** the score.
  4. A signs in on a second device: wrong key rejected, right key works, and the start continues.
  5. C creates a Studio simulation → asked for a name → the editor shows C as author.
- The earlier workday, community and Studio suites still pass.

## Explain it in an interview

> "Every action was already keyed by one id: an anonymous browser id. To add profiles I made the
> profile take over that id, so nothing needed migrating, and signing in on another device merges
> that device's history in one transaction. Since it's a demo, I didn't add OAuth: a profile is a
> name plus a one-time random key, stored only as a hash. The session cookie is HMAC-signed, because
> user ids aren't secret. And 'solved by' counts distinct people: my first version counted attempts."

## Try it yourself

1. Add a "Top solvers" page: people ranked by number of simulations solved (one SQL query on `runs`).
2. Let people regenerate their profile key from their profile page.
3. Show a solver's best score publicly if they opt in.
