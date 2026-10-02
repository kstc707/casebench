# Placeholder data

The original datasets (users.csv: 351 rows, sessions.csv: 3780 rows with real
duplicate mobile events, content.csv: 41 rows, subscriptions.csv: 351 rows,
experiments.csv: 351 rows) were lost along with the rest of the prior
session's scaffold before being committed to git.

The CSVs in this folder are small, clearly-fake placeholders just to make the
loader and SQL-sandbox code paths runnable end-to-end. They are NOT
data-consistent with the truth model in simulation.json — regenerating real,
internally-consistent datasets (including the duplicate-event bug and the
segment-correlated decline) is required before this simulation is usable for
an actual evaluation.
