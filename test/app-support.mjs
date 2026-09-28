import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { start } from "../src/entry.mjs";

export const html = readFileSync(
  new URL("./fixtures/blog.html", import.meta.url),
  "utf8",
);
export const tick = async () => {
  for (let i = 0; i < 6; i++)
    await new Promise((resolve) => setTimeout(resolve, 0));
};
export const hit = (id, extras = {}) => ({
  id,
  kind: 0,
  parentID: 2,
  title: `Topic ${id}`,
  replyCount: 0,
  createdAt: 1697285544 - id,
  updatedAt: 1697285550,
  parentName: "站务论坛",
  ...extras,
});
export const envelope = (rows, offset, limit) => ({
  data: rows,
  pagination: { total: 400, offset, limit, totalIsEstimate: true },
  meta: { executionMs: 1 },
});
export function setup({
  url = "https://bgm.tv/user/sai/blog?mode=1",
  respond = (offset, limit) => envelope([], offset, limit),
  markup = html,
  fetchOverride,
  timers,
} = {}) {
  const dom = new JSDOM(markup, { url });
  const scrolls = [];
  dom.window.scrollTo = (...point) => scrolls.push(point);
  const requests = [];
  const fetch = async (input, init) => {
    const request = new URL(input);
    requests.push({ request, init });
    const result = await respond(
      Number(request.searchParams.get("offset")),
      Number(request.searchParams.get("limit")),
      request,
    );
    return { ok: true, json: async () => result };
  };
  start(dom.window, { fetch: fetchOverride || fetch, timers });
  return {
    window: dom.window,
    document: dom.window.document,
    requests,
    scrolls,
    dom,
  };
}
export function enter(app) {
  app.window.location.hash = "#posts/group";
  app.window.dispatchEvent(new app.window.HashChangeEvent("hashchange"));
}
