import { Rng } from "./rng";
import type { Row } from "./csv";

/**
 * Generates the StreamWave "watch-time decline" dataset.
 *
 * The story baked into the data (this is the hidden truth the user must find):
 *
 *  1. MEASUREMENT ARTIFACT — mobile app v5.2.0 re-sent some play events, so
 *     ~30% of mobile sessions before 2026-08-03 appear twice (or three times),
 *     a few seconds apart, with different session_ids. v5.3.0 shipped on
 *     2026-08-03 and fixed it. So the "before" period is inflated.
 *
 *  2. MIX SHIFT — the "Summer Free Month" paid-social campaign (Aug 3–30)
 *     brought in a wave of trial users who watch much less. Existing users'
 *     behaviour barely changed; the average fell because WHO is active changed.
 *
 *  3. SMALL REAL PRODUCT EFFECT — experiment autoplay_next_v2 (from Aug 3,
 *     existing users only) turned autoplay off for the treatment arm, cutting
 *     TV session length ~20% for those users. Real, but small overall.
 *
 * Plus ordinary mess: inconsistent plan labels, missing genres, a finished
 * experiment that's irrelevant, and a campaign table with unrelated rows.
 */

export const WINDOW_START = "2026-07-06"; // Monday, week 1
export const FIX_DATE = "2026-08-03"; // Monday, week 5: v5.3.0 + campaign + experiment start
export const WEEKS = 8;
export const PLAN_MIGRATION_DATE = "2026-05-01";

const DAY_MS = 86_400_000;
const dayOffset = (iso: string, days: number) =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

type Device = "mobile" | "web" | "tv";
type Cohort = "existing" | "organic_new" | "campaign";

interface User {
  user_id: string;
  signup_date: string;
  plan: string;
  region: string;
  age_band: string;
  acquisition_channel: string;
  cohort: Cohort;
  weeklySessions: number; // engagement level (mean sessions/week)
  minutesFactor: number;
  devicePref: Device;
  cancelledBeforeWindow: boolean;
  arm: "control" | "treatment" | null;
}

export interface Dataset {
  users: Row[];
  sessions: Row[];
  content: Row[];
  subscriptions: Row[];
  experiments: Row[];
  marketing_campaigns: Row[];
}

export const COLUMNS: Record<keyof Dataset, string[]> = {
  users: ["user_id", "signup_date", "plan", "region", "age_band", "acquisition_channel"],
  sessions: ["session_id", "user_id", "content_id", "device", "app_version", "started_at", "minutes_watched"],
  content: ["content_id", "title", "genre", "is_original", "release_date"],
  subscriptions: ["user_id", "plan", "is_trial", "status", "started_at", "cancelled_at"],
  experiments: ["user_id", "experiment", "arm", "assigned_at"],
  marketing_campaigns: ["campaign_id", "name", "channel", "start_date", "end_date", "target_segment"],
};

const MEDIAN_MINUTES: Record<Device, number> = { mobile: 22, web: 35, tv: 48 };

export function generateStreamwave(seed = 20260803): Dataset {
  const rng = new Rng(seed);

  // ---------- content ----------
  const adjectives = ["Silent", "Broken", "Golden", "Last", "Hidden", "Northern", "Midnight", "Paper", "Wild", "Electric"];
  const nouns = ["Harbor", "Signal", "Kingdom", "Orchard", "Frontier", "Archive", "Tide", "Circuit", "Garden", "Summit"];
  const genres = ["drama", "comedy", "documentary", "thriller", "kids", "reality", "sci-fi"];
  const content: Row[] = [];
  for (let i = 1; i <= 60; i++) {
    content.push({
      content_id: `c${String(i).padStart(3, "0")}`,
      title: `${rng.pick(adjectives)} ${rng.pick(nouns)}`,
      genre: rng.chance(0.1) ? "" : rng.pick(genres), // ~10% missing genre labels
      is_original: rng.chance(0.3),
      release_date: dayOffset("2024-01-01", rng.int(0, 900)),
    });
  }
  // Popular titles get most views (roughly Zipf-like).
  const contentWeights = content.map((c, i) => [c.content_id as string, 1 / (i + 1) ** 0.8] as const);

  // ---------- users ----------
  const users: User[] = [];
  let userSeq = 1;
  const regions = ["US-East", "US-West", "US-Central", "Canada"];
  const nextUserId = () => `u${String(userSeq++).padStart(4, "0")}`;

  // Plan labels changed in a billing migration: lowercase before, Title Case after.
  const planLabel = (signup: string) => {
    const plan = rng.weighted([["basic", 0.35], ["standard", 0.45], ["premium", 0.2]] as const);
    return signup < PLAN_MIGRATION_DATE ? plan : plan[0].toUpperCase() + plan.slice(1);
  };

  // Existing subscribers (signed up before the window).
  for (let i = 0; i < 750; i++) {
    const signup = dayOffset("2025-01-01", rng.int(0, 550));
    users.push({
      user_id: nextUserId(),
      signup_date: signup,
      plan: planLabel(signup),
      region: rng.pick(regions),
      age_band: rng.weighted([["18-24", 0.15], ["25-34", 0.3], ["35-44", 0.25], ["45-54", 0.18], ["55+", 0.12]] as const),
      acquisition_channel: rng.weighted([["organic", 0.5], ["referral", 0.2], ["paid_search", 0.3]] as const),
      cohort: "existing",
      weeklySessions: rng.logNormal(2.6, 0.5),
      minutesFactor: rng.logNormal(1, 0.25),
      devicePref: rng.weighted([["mobile", 0.45], ["web", 0.25], ["tv", 0.3]] as const),
      cancelledBeforeWindow: rng.chance(0.08),
      arm: null,
    });
  }

  // Steady trickle of normal new sign-ups through the whole window.
  for (let week = 0; week < WEEKS; week++) {
    for (let i = 0; i < 12; i++) {
      const signup = dayOffset(WINDOW_START, week * 7 + rng.int(0, 6));
      users.push({
        user_id: nextUserId(),
        signup_date: signup,
        plan: planLabel(signup),
        region: rng.pick(regions),
        age_band: rng.weighted([["18-24", 0.2], ["25-34", 0.35], ["35-44", 0.25], ["45-54", 0.12], ["55+", 0.08]] as const),
        acquisition_channel: rng.weighted([["organic", 0.55], ["referral", 0.2], ["paid_search", 0.25]] as const),
        cohort: "organic_new",
        weeklySessions: rng.logNormal(2.3, 0.5),
        minutesFactor: rng.logNormal(0.95, 0.25),
        devicePref: rng.weighted([["mobile", 0.5], ["web", 0.25], ["tv", 0.25]] as const),
        cancelledBeforeWindow: false,
        arm: null,
      });
    }
  }

  // The campaign wave: ramps up over Aug 3–30, young, mobile-heavy, light viewers.
  const campaignPerWeek = [55, 75, 85, 80];
  campaignPerWeek.forEach((count, k) => {
    for (let i = 0; i < count; i++) {
      const signup = dayOffset(FIX_DATE, k * 7 + rng.int(0, 6));
      users.push({
        user_id: nextUserId(),
        signup_date: signup,
        plan: planLabel(signup),
        region: rng.pick(regions),
        age_band: rng.weighted([["18-24", 0.65], ["25-34", 0.3], ["35-44", 0.05]] as const),
        acquisition_channel: "paid_social",
        cohort: "campaign",
        weeklySessions: rng.logNormal(1.4, 0.5),
        minutesFactor: rng.logNormal(0.65, 0.25),
        devicePref: rng.weighted([["mobile", 0.7], ["web", 0.2], ["tv", 0.1]] as const),
        cancelledBeforeWindow: false,
        arm: null,
      });
    }
  });

  // Experiment: existing, still-subscribed users split 50/50 from Aug 3.
  for (const u of users) {
    if (u.cohort === "existing" && !u.cancelledBeforeWindow) {
      u.arm = rng.chance(0.5) ? "treatment" : "control";
    }
  }

  // ---------- sessions ----------
  interface RawSession {
    user_id: string;
    content_id: string;
    device: Device;
    app_version: string;
    startedMs: number;
    minutes: number;
  }
  const raw: RawSession[] = [];
  const windowStartMs = Date.parse(`${WINDOW_START}T00:00:00Z`);
  const fixMs = Date.parse(`${FIX_DATE}T00:00:00Z`);

  for (const u of users) {
    if (u.cancelledBeforeWindow) continue;
    const signupMs = Date.parse(`${u.signup_date}T00:00:00Z`);
    for (let week = 0; week < WEEKS; week++) {
      const weekStart = windowStartMs + week * 7 * DAY_MS;
      const n = rng.poisson(u.weeklySessions);
      for (let s = 0; s < n; s++) {
        // Evening-heavy viewing times.
        const hour = rng.weighted([[8, 0.05], [12, 0.1], [17, 0.15], [19, 0.3], [21, 0.3], [23, 0.1]] as const);
        const startedMs =
          weekStart + rng.int(0, 6) * DAY_MS + (hour * 3600 + rng.int(0, 3599)) * 1000;
        if (startedMs < signupMs) continue;

        const device: Device = rng.chance(0.8)
          ? u.devicePref
          : rng.weighted([["mobile", 0.45], ["web", 0.25], ["tv", 0.3]] as const);
        let minutes = rng.logNormal(MEDIAN_MINUTES[device] * u.minutesFactor, 0.6);
        // The real (small) product effect: autoplay off shortens TV binges.
        if (u.arm === "treatment" && device === "tv" && startedMs >= fixMs) minutes *= 0.8;
        minutes = Math.max(1, Math.min(240, Math.round(minutes)));

        raw.push({
          user_id: u.user_id,
          content_id: rng.weighted(contentWeights),
          device,
          app_version: device === "mobile" ? (startedMs < fixMs ? "5.2.0" : "5.3.0") : "",
          startedMs,
          minutes,
        });
      }
    }
  }

  // The measurement bug: v5.2.0 mobile re-sends ~30% of play events.
  const withDuplicates: RawSession[] = [];
  for (const s of raw) {
    withDuplicates.push(s);
    // (Skip events in the last few minutes before the fix so no re-send lands after it.)
    if (s.device === "mobile" && s.startedMs < fixMs - 5 * 60_000 && rng.chance(0.3)) {
      let at = s.startedMs;
      const copies = rng.chance(0.15) ? 2 : 1; // occasionally a chain of re-sends
      for (let c = 0; c < copies; c++) {
        at += rng.int(3, 60) * 1000;
        withDuplicates.push({ ...s, startedMs: at });
      }
    }
  }

  // Sort by time and number sequentially, so session_id order gives nothing away.
  withDuplicates.sort((a, b) => a.startedMs - b.startedMs || a.user_id.localeCompare(b.user_id));
  const sessions: Row[] = withDuplicates.map((s, i) => ({
    session_id: `s${String(i + 1).padStart(6, "0")}`,
    user_id: s.user_id,
    content_id: s.content_id,
    device: s.device,
    app_version: s.app_version,
    started_at: new Date(s.startedMs).toISOString().replace(".000Z", "Z"),
    minutes_watched: s.minutes,
  }));

  // ---------- subscriptions ----------
  const subscriptions: Row[] = users.map((u) => ({
    user_id: u.user_id,
    plan: u.plan,
    is_trial: u.cohort === "campaign",
    status: u.cancelledBeforeWindow ? "cancelled" : "active",
    started_at: u.signup_date,
    cancelled_at: u.cancelledBeforeWindow ? dayOffset(WINDOW_START, -rng.int(5, 120)) : "",
  }));

  // ---------- experiments ----------
  const experiments: Row[] = [];
  for (const u of users) {
    // An older, finished experiment that's irrelevant to this question (noise).
    if (u.cohort === "existing" && rng.chance(0.4)) {
      experiments.push({
        user_id: u.user_id,
        experiment: "home_row_ranking",
        arm: rng.chance(0.5) ? "treatment" : "control",
        assigned_at: dayOffset("2026-05-11", rng.int(0, 6)),
      });
    }
    if (u.arm) {
      experiments.push({
        user_id: u.user_id,
        experiment: "autoplay_next_v2",
        arm: u.arm,
        assigned_at: dayOffset(FIX_DATE, rng.int(0, 2)),
      });
    }
  }

  const marketing_campaigns: Row[] = [
    { campaign_id: "mc01", name: "Spring Referral Bonus", channel: "referral", start_date: "2026-03-02", end_date: "2026-04-26", target_segment: "existing subscribers" },
    { campaign_id: "mc02", name: "Back Catalog Email", channel: "email", start_date: "2026-06-08", end_date: "2026-06-21", target_segment: "lapsed users" },
    { campaign_id: "mc03", name: "Summer Free Month", channel: "paid_social", start_date: FIX_DATE, end_date: "2026-08-30", target_segment: "new users 18-24" },
  ];

  return {
    users: users.map(({ user_id, signup_date, plan, region, age_band, acquisition_channel }) => ({
      user_id,
      signup_date,
      plan,
      region,
      age_band,
      acquisition_channel,
    })),
    sessions,
    content,
    subscriptions,
    experiments,
    marketing_campaigns,
  };
}
