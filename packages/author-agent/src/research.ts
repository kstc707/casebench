/**
 * Online research without paid search APIs.
 *
 * - Hacker News (Algolia search, no key): incident write-ups, postmortems,
 *   "why our metric dropped" stories: real, specific work problems.
 * - Wikipedia (no key): background on well-known incidents and concepts.
 * - Tavily (optional, free tier with a key): general web search, if
 *   TAVILY_API_KEY is set.
 *
 * Everything fetched is untrusted text: it only ever goes into a prompt as
 * quoted source material, never as instructions.
 */

export interface Source {
  title: string;
  url: string;
  /** Plain text the agent may cite; trimmed. */
  text: string;
  via: "hackernews" | "wikipedia" | "tavily";
}

type Fetch = typeof fetch;
const UA = { "User-Agent": "casebench-author-agent/1.0 (+https://casebench.vercel.app)" };
const MAX_TEXT = 6000;

async function getJson<T>(f: Fetch, url: string, init?: RequestInit): Promise<T | null> {
  try {
    const res = await f(url, { ...init, headers: { ...UA, ...(init?.headers ?? {}) }, signal: AbortSignal.timeout(10_000) });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

/** Only public https pages: no localhost, no bare IPs (keeps the server from being pointed at internal addresses). */
export function isFetchableUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:") return false;
    const h = u.hostname;
    if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal")) return false;
    if (/^[\d.]+$/.test(h) || h.includes(":")) return false; // IPv4 / IPv6 literal
    return h.includes(".");
  } catch {
    return false;
  }
}

/** Crude but dependable HTML → text. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|noscript|svg|nav|footer|header)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|div|li|h\d|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{2,}/g, "\n\n")
    .trim();
}

async function fetchPageText(f: Fetch, url: string): Promise<string> {
  if (!isFetchableUrl(url)) return "";
  try {
    const res = await f(url, { headers: UA, redirect: "follow", signal: AbortSignal.timeout(10_000) });
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok || !/text\/html|text\/plain/.test(type)) return "";
    const body = (await res.text()).slice(0, 1_500_000);
    return (type.includes("html") ? htmlToText(body) : body).slice(0, MAX_TEXT);
  } catch {
    return "";
  }
}

export async function searchHackerNews(f: Fetch, query: string, limit = 6): Promise<Array<{ title: string; url: string; points: number; storyText?: string }>> {
  const q = encodeURIComponent(query);
  const data = await getJson<{ hits: Array<{ title?: string; url?: string; points?: number; story_text?: string; objectID: string }> }>(
    f,
    `https://hn.algolia.com/api/v1/search?query=${q}&tags=story&hitsPerPage=${limit * 2}`
  );
  return (data?.hits ?? [])
    .filter((h) => h.title)
    .map((h) => ({
      title: h.title!,
      url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
      points: h.points ?? 0,
      storyText: h.story_text ? htmlToText(h.story_text) : undefined,
    }))
    .sort((a, b) => b.points - a.points)
    .slice(0, limit);
}

export async function searchWikipedia(f: Fetch, query: string, limit = 2): Promise<Source[]> {
  const q = encodeURIComponent(query);
  const found = await getJson<{ query?: { search?: Array<{ title: string }> } }>(
    f,
    `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${q}&srlimit=${limit}&format=json&origin=*`
  );
  const out: Source[] = [];
  for (const { title } of found?.query?.search ?? []) {
    const t = encodeURIComponent(title);
    const page = await getJson<{ query?: { pages?: Record<string, { extract?: string }> } }>(
      f,
      `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&titles=${t}&format=json&origin=*`
    );
    const text = Object.values(page?.query?.pages ?? {})[0]?.extract ?? "";
    if (text) out.push({ title, url: `https://en.wikipedia.org/wiki/${t}`, text: text.slice(0, MAX_TEXT), via: "wikipedia" });
  }
  return out;
}

async function searchTavily(f: Fetch, query: string, key: string): Promise<Source[]> {
  const data = await getJson<{ results?: Array<{ title: string; url: string; content?: string; raw_content?: string }> }>(f, "https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ query, max_results: 5, include_raw_content: true }),
  });
  return (data?.results ?? [])
    .map((r) => ({ title: r.title, url: r.url, text: (r.raw_content || r.content || "").slice(0, MAX_TEXT), via: "tavily" as const }))
    .filter((s) => s.text.length > 200);
}

/**
 * Run the queries, de-duplicate, fetch the most promising pages, and keep
 * the ones with enough real text to learn from. Returns at most `max` sources.
 */
export async function research(queries: string[], opts: { fetch?: Fetch; tavilyKey?: string; max?: number } = {}): Promise<Source[]> {
  const f = opts.fetch ?? fetch;
  const max = opts.max ?? 5;
  const sources: Source[] = [];
  const seen = new Set<string>();
  const add = (s: Source) => {
    if (seen.has(s.url) || s.text.length < 300 || sources.length >= max) return;
    seen.add(s.url);
    sources.push(s);
  };

  for (const q of queries) {
    if (opts.tavilyKey) for (const s of await searchTavily(f, q, opts.tavilyKey)) add(s);
    for (const hit of await searchHackerNews(f, q, 4)) {
      if (sources.length >= max) break;
      if (seen.has(hit.url)) continue;
      const text = hit.storyText && hit.storyText.length > 300 ? hit.storyText : await fetchPageText(f, hit.url);
      add({ title: hit.title, url: hit.url, text, via: "hackernews" });
    }
  }
  // Background from Wikipedia on the first query, if there's room.
  if (sources.length < max && queries[0]) for (const s of await searchWikipedia(f, queries[0], 1)) add(s);
  return sources;
}
