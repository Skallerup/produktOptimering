import { load } from "cheerio";
import { asyncPool, countWords, stripHtml } from "@/lib/utils";

type WooImage = {
  id: number;
  src: string;
  alt?: string;
};

type WooPrices = {
  price: string | null;
  regular_price?: string | null;
  sale_price?: string | null;
  currency_code?: string;
};

type WooProduct = {
  id: number;
  name: string;
  permalink: string;
  description: string;
  short_description: string;
  sku?: string | null;
  images?: WooImage[];
  prices?: WooPrices;
  categories?: { name: string }[];
};

export type ProductSnapshot = {
  remoteId: string;
  name: string;
  permalink: string;
  shortDescription: string;
  description: string;
  sku: string | null;
  price: string | null;
  image: string | null;
  categories: string[];
  metaTitle: string | null;
  metaDescription: string | null;
  wordCount: number;
  raw: WooProduct;
};

async function fetchWooBatch(baseUrl: string, page: number, perPage = 100) {
  const endpoint = `${baseUrl}/wp-json/wc/store/products?per_page=${perPage}&page=${page}`;
  const res = await fetch(endpoint, { cache: "no-store" });

  if (!res.ok) {
    throw new Error(
      `Kunne ikke hente produkter fra WooCommerce Store API (${res.status})`
    );
  }

  const payload = (await res.json()) as WooProduct[];
  return payload;
}

async function fetchMeta(permalink: string) {
  try {
    const response = await fetch(permalink, { cache: "no-store" });
    if (!response.ok) {
      throw new Error("Meta fetch failed");
    }
    const html = await response.text();
    const $ = load(html);
    const title = $("title").text().trim() || null;
    const metaDescription =
      $('meta[name="description"]').attr("content")?.trim() || null;

    return {
      metaTitle: title,
      metaDescription,
    };
  } catch {
    return {
      metaTitle: null,
      metaDescription: null,
    };
  }
}

export async function crawlProducts(baseUrl: string) {
  const products: WooProduct[] = [];
  let page = 1;

  while (true) {
    const batch = await fetchWooBatch(baseUrl, page);
    if (!batch.length) break;
    products.push(...batch);
    if (batch.length < 100) break;
    page += 1;
  }

  const enriched = await asyncPool(5, products, async (product) => {
    const { metaTitle, metaDescription } = await fetchMeta(product.permalink);
    return {
      remoteId: String(product.id),
      name: product.name,
      permalink: product.permalink,
      shortDescription: stripHtml(product.short_description),
      description: stripHtml(product.description),
      sku: product.sku ?? null,
      price: product.prices?.price ?? null,
      image: product.images?.[0]?.src ?? null,
      categories: product.categories?.map((cat) => cat.name) ?? [],
      metaTitle,
      metaDescription,
      wordCount: countWords(stripHtml(product.description)),
      raw: product,
    } satisfies ProductSnapshot;
  });

  return enriched;
}

