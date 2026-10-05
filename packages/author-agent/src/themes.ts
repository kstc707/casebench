/**
 * What the agent writes about when nobody gives it a topic: real kinds of
 * work problems, across roles. It rotates through them (one per day), and the
 * planner steers away from simulations that already exist.
 */
export const THEMES: Array<{ role: string; theme: string }> = [
  { role: "data-analyst", theme: "a key metric dropped, but part of the drop is a tracking or logging bug" },
  { role: "data-analyst", theme: "an A/B test winner that reverses when you segment the users (Simpson's paradox)" },
  { role: "product-manager", theme: "a new feature launched to fanfare but adoption stalled after the first week" },
  { role: "ux-designer", theme: "mobile checkout or sign-up abandonment rose after a redesign" },
  { role: "software-engineer", theme: "API latency regressed after a deploy; the cause is not the obvious suspect" },
  { role: "cybersecurity", theme: "a burst of suspicious logins that turns out to be credential stuffing" },
  { role: "operations", theme: "late deliveries spiked after a change of carrier or warehouse process" },
  { role: "marketing", theme: "a campaign looks like a huge success because conversions are double-counted" },
  { role: "finance", theme: "refunds jumped and revenue doesn't reconcile with the payment provider" },
  { role: "customer-support", theme: "the support ticket backlog exploded after a product release" },
  { role: "data-scientist", theme: "a churn model's accuracy collapsed because the input data changed" },
  { role: "product-manager", theme: "a price increase: did it hurt retention, or did something else?" },
];

/** Today's theme: a stable rotation, so a daily run doesn't repeat itself. */
export function themeForDay(date = new Date()): { role: string; theme: string } {
  const day = Math.floor(date.getTime() / 86_400_000);
  return THEMES[day % THEMES.length];
}
