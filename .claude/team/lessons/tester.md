# Tester lessons

- **Look at the screenshots.** A passing script once hid "1791530399.8 s" and an error box that said
  "check the error above" when it was below. (Practice mode)
- **Playwright strict mode:** scope selectors (e.g. `getByRole("dialog").getByRole("button", …)`), since the
  page and the dialog both have a "Create profile" button. Wait for the URL after a navigation click.
- **Don't `pkill -f` a pattern that also appears in your own command line.** It kills your shell. List the
  PIDs first.
- **`next build` overwrites the dev server's `.next`.** Restart the dev server after building.
- **Always try:** broken input (a syntax error), no profile, phone width (390 px), and check the database
  rows the feature writes.
