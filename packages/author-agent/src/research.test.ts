import { describe, expect, it } from "vitest";
import { htmlToText, isFetchableUrl, research } from "./research";

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
          { objectID: "2", title: "Ask HN: why did our conversion drop?", story_text: `<p>${long("We changed the checkout flow and conversion fell.")}</p>`, points: 120 },
          { objectID: "3", title: "Internal link", url: "https://localhost/admin", points: 50 },
        ],
      });
    }
    if (url === "https://blog.example.com/postmortem") {
      return new Response(`<html><script>evil()</script><p>${long("A client release re-sent events.")}</p></html>`, {
        headers: { "content-type": "text/html" },
      });
    }
    if (url.includes("list=search")) return json({ query: { search: [{ title: "Data quality" }] } });
    if (url.includes("prop=extracts")) return json({ query: { pages: { "1": { extract: long("Data quality is…") } } } });
    return new Response("not found", { status: 404 });
  }) as unknown as typeof fetch;
}

describe("research", () => {
  it("collects readable sources from HN and Wikipedia, and never fetches internal URLs", async () => {
    const log: string[] = [];
    const sources = await research(["duplicate events metrics drop"], { fetch: fakeFetch(log) });
    expect(sources.map((s) => s.via)).toEqual(["hackernews", "hackernews", "wikipedia"]);
    expect(sources[0].text).toContain("re-sent events");
    expect(sources[0].text).not.toContain("evil()");
    expect(sources[1].url).toBe("https://news.ycombinator.com/item?id=2"); // self-post text used directly
    expect(log.some((u) => u.includes("localhost"))).toBe(false);
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
});
