# Vision anchor

**Owner: Sai. Agents read this file; only the owner changes it.** When feedback or a new idea pulls in a
different direction, check it against this page first. If the vision should change, the owner rewrites it
here and the reason goes in `decisions.md`.

## What Casebench is (from the owner's notes)

> **CaseBench: an AI work simulation platform.** Taking coding simulations to the next phase, where AI
> agents mimic real colleagues and teams.

- **Keep simulations to the standardized first few tasks in a new job role**, so they are really helpful
  and realistic. *"Don't want to scare anyone with a complex simulation."*
- **The person solving the problem should have access to AI that can assist them**, as part of simulating
  real work.
- **Grading:** deliverables are graded simply by whether the task was completed, *"such as LeetCode"*.
  **The logs of how they solved it should also be graded** in some way (not finalized), e.g. token
  optimization, or how close their log is to others'.
- **Logs can be shared:** *"if a recruiter or a professor uses it, I want them to see the log to be able
  to score or judge a candidate."*
- **The UI should be interactive and step by step.** Inspirations: LeetCode and Chegg.
- **For starters:** people can create a simulation, post it, and track how it's doing, the same way they
  can see the problems they solved.
- **Build it so more agents, or more uses of agents, can be added.** Keep the architecture cheap in space
  and cost.
- **Open questions from the notes:** how to add tools to the environment (like LeetCode's interpreters,
  or even a Figma environment), and whether every task needs its own agent.
- **Workflow: Research → Plan → Implement.**

## Where the thinking has gone since (October 2026)

- **Feedback from a data chief:** it must be differentiable, because a data-analyst example alone looks
  like Kaggle. Are the agents a gimmick? Test: *if you delete the agents and the task still works, they're
  a gimmick.*
- **Direction:** real work from **open source**, with an AI team around the learner. Practice first, on
  bugs that were already fixed and are checked by the project's own tests. Live contributions later, and
  only for people who earned it, so maintainers aren't flooded.
- **Python only for now; get one section fully working before adding more.**
- **Concern raised by the owner (Oct 10):** *"I don't think anyone in the future would really code,
  because everyone will have access to AI."* Proposed response, **not yet confirmed by the owner**:
  learners direct an AI that writes the code, and are graded on the result, plus how well they directed,
  reviewed and verified the AI's work.

## Who it's for

People getting ready for their first tasks in a new role (students, job seekers, career changers), and the
people who judge them (recruiters, professors).
