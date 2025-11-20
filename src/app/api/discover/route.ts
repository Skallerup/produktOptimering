import { NextResponse } from "next/server";
import { z } from "zod";

import { crawlProducts } from "@/lib/woocommerce";
import { normalizeStoreUrl } from "@/lib/utils";
import type { Database } from "@/types/database";

const bodySchema = z.object({
  storeUrl: z.string().min(3),
});

type StoreRow = Database["public"]["Tables"]["stores"]["Row"];
type StoreInsert = Database["public"]["Tables"]["stores"]["Insert"];
type ProductRow = Database["public"]["Tables"]["products"]["Row"];
type ProductInsert = Database["public"]["Tables"]["products"]["Insert"];

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function requireSupabaseEnv() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Supabase environment vars mangler.");
  }
  return {
    url: SUPABASE_URL,
    key: SUPABASE_SERVICE_ROLE_KEY,
  };
}

async function restUpsert<T>(
  path: string,
  payload: unknown,
  searchParams?: string
): Promise<T[]> {
  const { url, key } = requireSupabaseEnv();
  const endpoint = `${url}/rest/v1/${path}${
    searchParams ? `?${searchParams}` : ""
  }`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=representation",
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(
      `Supabase REST fejl (${response.status}): ${await response.text()}`
    );
  }
  return (await response.json()) as T[];
}

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const parsed = bodySchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Ugyldig body", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const normalizedUrl = normalizeStoreUrl(parsed.data.storeUrl);
    const snapshots = await crawlProducts(normalizedUrl);

    if (!snapshots.length) {
      return NextResponse.json(
        { error: "Ingen produkter blev fundet via WooCommerce Store API." },
        { status: 404 }
      );
    }

    const storePayload: StoreInsert = {
      base_url: normalizedUrl,
      last_synced_at: new Date().toISOString(),
    };

    const storesRest = await restUpsert<StoreRow>(
      "stores",
      [storePayload],
      "on_conflict=base_url"
    );
    const store = storesRest[0];

    const productsPayload = snapshots.map<ProductInsert>((product) => ({
      store_id: store.id,
      remote_id: product.remoteId,
      name: product.name,
      short_description: product.shortDescription,
      description: product.description,
      permalink: product.permalink,
      price: product.price,
      sku: product.sku,
      image: product.image,
      meta_title: product.metaTitle,
      meta_description: product.metaDescription,
      word_count: product.wordCount,
      raw: product.raw,
      last_crawled_at: new Date().toISOString(),
    }));

    const savedProducts = await restUpsert<ProductRow>(
      "products",
      productsPayload,
      "on_conflict=store_id,remote_id"
    );

    return NextResponse.json({
      storeId: store.id,
      storeUrl: store.base_url,
      products: savedProducts,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Uventet fejl under scanning.",
      },
      { status: 500 }
    );
  }
}

