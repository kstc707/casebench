import { describe, expect, it } from "vitest";
import { htmlToText, isFetchableUrl, onTopic, relevance, research } from "./research";

const long = (s: string) => `${s} `.repeat(80);

/** A fake internet: HN search, two articles, Wikipedia. */
function fakeFetch(log: string[]) {
  return (async (url: string) => {
    log.push(url);
    const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
    if (url.startsWith("https://hn.algolia.com/")) {
      return json({
        hits: [
          { objectID: "1", title: "Postmortem: duplicate events inflated our metrics", url: "https://blog.example.com/postmortem", points: 300 },
          { objectID: "2", title: "Ask HN: why did our metrics drop?", story_text: `<p>${long("Our events were logged twice and conversion fell.")}</p>`, points: 120 },
          { objectID: "4", title: "Show HN: my sourdough recipe", story_text: `<p>${long("Flour, water, salt.")}</p>`, points: 900 },
          { objectID: "3", title: "Internal link", url: "https://localhost/admin", points: 50 },
        ],
      });
    }
    if (url === "https://blog.example.com/postmortem") {
      return new Response(`<html><script>evil()</script><p>${long("A client release re-sent events.")}</p></html>`, {
        headers: { "content-type": "text/html" },
      });
    }
    if (url.includes("list=search")) return json({ query: { search: [{ title: "Duplicate metrics events" }, { title: "List of Latin phrases" }] } });
    if (url.includes("prop=extracts") && url.includes("Latin")) return json({ query: { pages: { "1": { extract: long("Carpe diem, et cetera.") } } } });
    if (url.includes("prop=extracts")) return json({ query: { pages: { "1": { extract: long("Duplicate events distort metrics…") } } } });
    return new Response("not found", { status: 404 });
  }) as unknown as typeof fetch;
}

describe("research", () => {
  it("collects on-topic sources from HN and Wikipedia, skips off-topic ones, and never fetches internal URLs", async () => {
    const log: string[] = [];
    const sources = await research(["duplicate events metrics drop"], { fetch: fakeFetch(log) });
    expect(sources.map((s) => s.via)).toEqual(["hackernews", "hackernews", "wikipedia"]);
    expect(sources[0].text).toContain("re-sent events");
    expect(sources[0].text).not.toContain("evil()");
    expect(sources[1].url).toBe("https://news.ycombinator.com/item?id=2"); // self-post text used directly
    expect(log.some((u) => u.includes("localhost"))).toBe(false);
    expect(sources.map((s) => s.title).join()).not.toMatch(/sourdough|Latin/); // off-topic pages dropped
    expect(log.find((u) => u.includes("algolia"))).toContain("optionalWords="); // every word optional, so specific queries still find things
  });

  it("only fetches public https pages", () => {
    expect(isFetchableUrl("https://example.com/a")).toBe(true);
    for (const bad of ["http://example.com", "https://localhost/x", "https://10.0.0.1/", "https://[::1]/", "https://intranet/"]) {
      expect(isFetchableUrl(bad)).toBe(false);
    }
  });

  it("turns HTML into text", () => {
    expect(htmlToText("<style>x{}</style><p>Hello &amp; welcome</p><p>Bye</p>")).toBe("Hello & welcome\nBye");
  });

  it("scores relevance by the query's meaningful words", () => {
    expect(relevance("duplicate analytics events", "We fixed duplicated events", "our analytics pipeline")).toBe(3);
    expect(relevance("duplicate analytics events", "List of Latin phrases", "carpe diem")).toBe(0);
  });

  it("isn't fooled by common words or a page that only mentions the topic in passing", () => {
    expect(onTopic("pixel firing multiple times", "UFOs invading airspace multiple times a month", "pixel")).toBe(false);
    expect(onTopic("conversion double counting", "Ask HN: which movies did you watch?", "conversion counting double")).toBe(false);
    expect(onTopic("conversion double counting", "We were double counting conversions", "our tracking pixel")).toBe(true);
  });
});

describe("postmortems list", () => {
  it("finds matching incidents and reads the linked write-up", async () => {
    const { searchPostmortems } = await import("./research");
    const md = [
      "# Post-mortems",
      "[Acme](https://acme.example.com/pm). A config deploy doubled API latency for two hours; the p99 regression came from a cache flag.",
      "[Other](https://other.example.com/pm). A certificate expired.",
    ].join("\n");
    const f = (async (url: string) => new Response(url.includes("githubusercontent") ? md : "", { status: 200 })) as unknown as typeof fetch;
    const hits = await searchPostmortems(f, "api latency regression deploy");
    expect(hits.map((h) => h.url)).toEqual(["https://acme.example.com/pm"]);
    expect(hits[0].summary).toContain("cache flag");
  });
});
