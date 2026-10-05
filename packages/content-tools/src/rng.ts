/**
 * A small seeded random number generator. Same seed => same dataset, every
 * time, on every machine. That's what lets us commit generated CSVs and
 * still prove (by re-running) exactly how they were made.
 */
export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** Uniform float in [0, 1). mulberry32 — tiny, fast, good enough for synthetic data. */
  next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  int(min: number, maxInclusive: number): number {
    return min + Math.floor(this.next() * (maxInclusive - min + 1));
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length)];
  }

  /** Pick by weight, e.g. weighted([["mobile", 0.45], ["web", 0.25], ["tv", 0.3]]). */
  weighted<T>(options: ReadonlyArray<readonly [T, number]>): T {
    const total = options.reduce((s, [, w]) => s + w, 0);
    let r = this.next() * total;
    for (const [value, w] of options) {
      r -= w;
      if (r < 0) return value;
    }
    return options[options.length - 1][0];
  }

  /** Standard normal via Box–Muller. */
  normal(): number {
    const u = 1 - this.next();
    const v = this.next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  /** Log-normal with the given median and spread — good for "minutes watched". */
  logNormal(median: number, sigma: number): number {
    return median * Math.exp(sigma * this.normal());
  }

  /** Poisson count (Knuth's method; fine for small means like sessions/week). */
  poisson(mean: number): number {
    const limit = Math.exp(-mean);
    let k = 0;
    let p = 1;
    do {
      k++;
      p *= this.next();
    } while (p > limit);
    return k - 1;
  }
}
