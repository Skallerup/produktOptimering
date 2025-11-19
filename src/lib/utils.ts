const URL_WITH_PROTOCOL = /^(http|https):\/\//i;

export function normalizeStoreUrl(input: string) {
  const trimmed = input.trim();
  if (!trimmed) throw new Error("Butiks-URL mangler.");

  const withProtocol = URL_WITH_PROTOCOL.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  const url = new URL(withProtocol);
  url.pathname = "/";
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

export async function asyncPool<T, R>(
  limit: number,
  items: T[],
  iterator: (item: T, index: number) => Promise<R>
) {
  const results: R[] = [];
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const current = index;
      index += 1;
      results[current] = await iterator(items[current], current);
    }
  }

  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    () => worker()
  );
  await Promise.all(workers);
  return results;
}

export function stripHtml(html?: string | null) {
  if (!html) return "";
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

export function countWords(text?: string | null) {
  if (!text) return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

