# 13 — Redesign: from "generic AI dashboard" to a real workplace

## Goal

> "The UI is too minimal and AI-generated."

The old look (dark cards, rounded pills, emoji labels, one purple accent) is what every
AI-generated app looks like. The chosen direction: **look like the tools people actually use at work.**

## What changed

| Surface | Before | Now: modelled on |
|---|---|---|
| Overall | Dark-only, pills and cards | **Light by default, dark when the OS asks**; system fonts (what Slack, GitHub and Linear use); quiet borders; 4–6 px radii |
| Frame | Each page had its own header | One **app frame**: left nav (Problems, Create, Your work, Author agent for admins), breadcrumb top bar, you at the bottom |
| Home | A stack of cards | An **issue tracker**: keys (CASE-1), team labels, a priority-style complexity signal, estimate, solvers, tabs (Trending / Newest / Top rated / Hardest), a filter and a team selector |
| Problem page | A centred column | A **ticket**: description from the manager, what you'll practise, activity (difficulty, ratings, discussion); a right rail with "Join {company}'s workspace", details and the team |
| Workspace | Dark Slack-ish | A **faithful Slack-style workspace**: plum sidebar, top bar with elapsed vs expected time, "Today" divider, composer with a hint bar, pinned brief, file attachments with type icons, notification toasts |
| SQL app | Dark panel | A **query tool**: table browser, editor, a results grid with sticky headers |
| Write-up | A form | A **document** ("Your write-up", lead-with-the-answer prompt) |
| Profiles | A list | A **GitHub-style profile**: big avatar, name, handle, counts, Solved and Created lists |
| Avatars | Emoji | Square initials avatars, colour stable per person; "You" uses your profile's initials |

All existing class names were kept, so features didn't change, only how they look. The design
tokens live in `:root` in `apps/web/app/globals.css`, redefined for dark mode.

## Files

| Piece | File |
|---|---|
| Design tokens, light + dark, every component style | `apps/web/app/globals.css` |
| App frame (nav, breadcrumbs, profile) | `apps/web/components/Shell.tsx` |
| Issue-tracker list, team labels, priority signal | `apps/web/components/Discover.tsx` |
| Ticket page | `StartScreen` in `apps/web/components/Workspace.tsx` |
| Workspace chrome, chat, brief, write-up | `Workspace.tsx`, `ChatView.tsx`, `BriefChannel.tsx`, `WriteUp.tsx` |
| Profile page | `apps/web/app/u/[handle]/page.tsx` |
| Initials avatars | `Face` in `apps/web/components/Profile.tsx`, `YouAvatar` in `Avatar.tsx` |

## How it was verified

- Screenshots of every page in light and dark mode, plus phone width (no horizontal scroll).
- Fixes found in review: the logo disappeared in dark mode (it used the sidebar colour); "You" showed
  "Y" instead of your initials; "1 tables"; skill tags crowding phone rows.
- All browser suites still pass (profiles with three people, community, the full workday, Studio),
  updated for the new labels ("Join … workspace", the team selector).
