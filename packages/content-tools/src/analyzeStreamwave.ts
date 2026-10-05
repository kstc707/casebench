import { FIX_DATE, WEEKS, WINDOW_START } from "./streamwave";

/**
 * Independent analysis of the StreamWave CSVs — it only reads the published
 * files, never the generator's internals. If the story in the truth model
 * isn't actually visible in the data, this is where we find out.
 *
 * The same numbers are written into the simulation's truth model, so the AI
 * evaluator grades against facts measured from the exact data the user sees.
 */

type Rec = Record<string, string>;

const DAY_MS = 86_400_000;
const windowStartMs = Date.parse(`${WINDOW_START}T00:00:00Z`);
const fixMs = Date.parse(`${FIX_DATE}T00:00:00Z`);
const weekOf = (iso: string) => Math.floor((Date.parse(iso) - windowStartMs) / (7 * DAY_MS));

/**
 * Drop re-sent events: same user + content + device within 120 seconds of
 * the previous event *seen* (kept or not) for that key. This is the correct
 * dedupe rule; comparing against the last *kept* event misses chains.
 */
export function dedupeSessions(sessions: Rec[]): Rec[] {
  const lastSeen = new Map<string, number>();
  const kept: Rec[] = [];
  const sorted = [...sessions].sort((a, b) => a.started_at.localeCompare(b.started_at));
  for (const s of sorted) {
    const key = `${s.user_id}|${s.content_id}|${s.device}`;
    const t = Date.parse(s.started_at);
    const prev = lastSeen.get(key);
    lastSeen.set(key, t);
    if (prev !== undefined && t - prev <= 120_000) continue;
    kept.push(s);
  }
  return kept;
}

export interface WeekStat {
  week: number; // 1-based
  activeUsers: number;
  minutes: number;
  minutesPerActiveUser: number;
}

export function weeklyStats(sessions: Rec[], userFilter?: (userId: string) => boolean): WeekStat[] {
  const stats = Array.from({ length: WEEKS }, (_, i) => ({
    week: i + 1,
    users: new Set<string>(),
    minutes: 0,
  }));
  for (const s of sessions) {
    if (userFilter && !userFilter(s.user_id)) continue;
    const w = weekOf(s.started_at);
    if (w < 0 || w >= WEEKS) continue;
    stats[w].users.add(s.user_id);
    stats[w].minutes += Number(s.minutes_watched);
  }
  return stats.map((s) => ({
    week: s.week,
    activeUsers: s.users.size,
    minutes: s.minutes,
    minutesPerActiveUser: s.users.size ? round(s.minutes / s.users.size, 1) : 0,
  }));
}

/** % change from the average of weeks 1–4 to the average of weeks 5–8. */
export function periodChange(stats: WeekStat[]): number {
  const avg = (xs: WeekStat[]) => xs.reduce((s, x) => s + x.minutesPerActiveUser, 0) / xs.length;
  const before = avg(stats.slice(0, 4));
  const after = avg(stats.slice(4, 8));
  return round(((after - before) / before) * 100, 1);
}

export function analyzeStreamwave(tables: {
  users: Rec[];
  sessions: Rec[];
  experiments: Rec[];
}) {
  const { users, sessions, experiments } = tables;
  const deduped = dedupeSessions(sessions);
  const duplicateRows = sessions.length - deduped.length;

  const keptIds = new Set(deduped.map((s) => s.session_id));
  const dupRows = sessions.filter((s) => !keptIds.has(s.session_id));
  const dupAfterFix = dupRows.filter((s) => Date.parse(s.started_at) >= fixMs).length;
  const dupNonMobile = dupRows.filter((s) => s.device !== "mobile").length;
  const mobileBefore = deduped.filter((s) => s.device === "mobile" && Date.parse(s.started_at) < fixMs).length;

  const byId = new Map(users.map((u) => [u.user_id, u]));
  const isExisting = (id: string) => (byId.get(id)?.signup_date ?? "") < WINDOW_START;
  const isCampaign = (id: string) => byId.get(id)?.acquisition_channel === "paid_social";

  const arm = new Map(
    experiments.filter((e) => e.experiment === "autoplay_next_v2").map((e) => [e.user_id, e.arm])
  );

  const raw = weeklyStats(sessions);
  const clean = weeklyStats(deduped);
  const existing = weeklyStats(deduped, isExisting);
  const existingControl = weeklyStats(deduped, (id) => arm.get(id) === "control");
  const existingTreatment = weeklyStats(deduped, (id) => arm.get(id) === "treatment");
  const campaign = weeklyStats(deduped, isCampaign);

  const lateWeeks = clean.slice(4);
  const campaignShareOfActives = round(
    (100 * campaign.slice(4).reduce((s, w) => s + w.activeUsers, 0)) /
      lateWeeks.reduce((s, w) => s + w.activeUsers, 0),
    1
  );
  const avgPerActive = (xs: WeekStat[]) =>
    round(xs.reduce((s, w) => s + w.minutesPerActiveUser, 0) / xs.length, 1);

  // TV minutes per session, existing users, after the experiment started.
  const tvMinutes = (a: string) => {
    const xs = deduped.filter(
      (s) => s.device === "tv" && arm.get(s.user_id) === a && Date.parse(s.started_at) >= fixMs
    );
    return round(xs.reduce((sum, s) => sum + Number(s.minutes_watched), 0) / xs.length, 1);
  };

  return {
    rows: { sessions: sessions.length, dedupedSessions: deduped.length, users: users.length },
    duplicates: {
      duplicateRows,
      afterFixDate: dupAfterFix,
      nonMobile: dupNonMobile,
      shareOfMobileSessionsBeforeFix: round((100 * duplicateRows) / mobileBefore, 1),
    },
    weekly: { raw, deduped: clean },
    changePct: {
      rawAllUsers: periodChange(raw),
      dedupedAllUsers: periodChange(clean),
      dedupedExistingUsers: periodChange(existing),
      dedupedExistingControl: periodChange(existingControl),
      dedupedExistingTreatment: periodChange(existingTreatment),
    },
    campaign: {
      shareOfActiveUsersWeeks5to8Pct: campaignShareOfActives,
      minutesPerActiveUserWeeks5to8: avgPerActive(campaign.slice(4)),
      existingUsersMinutesPerActiveUserWeeks5to8: avgPerActive(existing.slice(4)),
    },
    experiment: {
      tvMinutesPerSessionControl: tvMinutes("control"),
      tvMinutesPerSessionTreatment: tvMinutes("treatment"),
    },
  };
}

export type StreamwaveAnalysis = ReturnType<typeof analyzeStreamwave>;

function round(x: number, digits: number) {
  const f = 10 ** digits;
  return Math.round(x * f) / f;
}
