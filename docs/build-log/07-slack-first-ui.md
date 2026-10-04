# 07 — A Slack-first, dark workspace

## Goal

Make the workday feel like a real job: the main screen is a Slack-like workspace, not a
dashboard with a chat box. Coworkers are the centre; tools open as "apps" next to the
conversation.

## What we built

| File | What |
|---|---|
| `apps/web/components/Workspace.tsx` | App shell: sidebar (channel, DMs, apps), main view, chat dock, toasts, start screen |
| `apps/web/components/useChat.ts` | One hook for all Slack state: polling, unread counts, sending, toasts |
| `apps/web/components/ChatView.tsx` | A DM conversation: grouped messages, typing indicator, composer (Enter sends) |
| `apps/web/components/BriefChannel.tsx` | `#watch-time-drop`: the manager's pinned brief, resources as attachments |
| `apps/web/components/SqlConsole.tsx` | Now a "SQL workbench" app with its own schema browser |
| `apps/web/components/Avatar.tsx` | Shared avatars |
| `apps/web/app/globals.css` | Dark theme tokens and all layout styles |

### How the screen works

- **Sidebar:** `# watch-time-drop` (the brief), **Direct messages** with Priya and Sam (presence
  dot, unread badge), **Apps**: SQL workbench, Write-up, and Feedback once you're graded.
- **DM view:** the conversation fills the screen.
- **App view:** the tool fills the middle, and the **current DM is docked on the right**, so you
  can query and talk at the same time. Switch the docked person from its header.
- **Toasts:** when a coworker messages you in a conversation you can't see, a notification pops up
  top-right; click it to jump there.
- On narrow screens everything stacks vertically (checked at 390 px wide, no horizontal scroll).

## Decisions and why

| Decision | Why | Rejected alternative |
|---|---|---|
| Chat-first layout | The agents are the product; a real analyst's day runs through Slack | Three fixed panes with chat as a side widget (previous UI) |
| Docked chat while an app is open | Real multitasking: ask Sam about a row while looking at it | Switching screens to reply |
| One `useChat` hook | Sidebar badges, the docked chat, the DM view and toasts all agree on one state | Each component polling separately (it was one panel before) |
| "Seen" = whatever is on screen | Matches Slack: an open conversation is read | Explicit "mark as read" |
| SQL app stays mounted when hidden | Loaded tables and results survive navigation | Remounting (re-downloads the data) |
| Dark theme by default | The owner's choice; reads as a professional work tool | Following the OS setting |

## Problems found along the way

- After submitting, the screen stayed on the write-up, so the grade was invisible until you
  clicked Feedback. It now jumps to Feedback automatically. The browser test caught this.
- Toasts covered the docked chat's input; moved to the top-right.
- Priya's kickoff said "the brief is on the left"; updated to point at the channel.

## How it was verified

Headless browser at 1440×900 and 390×844: start screen → Priya's DM with the kickoff → channel
with pinned brief and a resource opened → SQL workbench with schema → a query on `sessions`
triggers Sam: toast appears, the dock shows an unread badge → clicking the toast docks Sam's
conversation → message and reply in the dock → write-up → submit → Feedback opens with the score
→ no horizontal overflow on mobile.

## Explain it in an interview

> "The UI is modelled on Slack because the product is about working with people, even simulated
> ones. Tools open as apps with the conversation docked beside them, and a single chat hook owns
> polling, unread counts and notifications so every part of the screen stays consistent."

## Try it yourself

1. In `useChat.ts`, change `POLL_MS` to 10000. What gets worse, and what does the server do less?
2. Add a third "app" (e.g. a notes scratchpad) to the sidebar. Which three places in
   `Workspace.tsx` need to change?
