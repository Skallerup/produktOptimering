import { NextResponse } from "next/server";
import { z } from "zod";

import { crawlProducts } from "@/lib/woocommerce";
import { normalizeStoreUrl } from "@/lib/utils";
import { getServiceClient } from "@/lib/supabase";
import type { Database } from "@/types/database";

const bodySchema = z.object({
  storeUrl: z.string().min(3),
});

type StoreInsert = Database["public"]["Tables"]["stores"]["Insert"];
type ProductInsert = Database["public"]["Tables"]["products"]["Insert"];

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

    const supabase = getServiceClient();

    const storePayload: StoreInsert = {
      base_url: normalizedUrl,
      last_synced_at: new Date().toISOString(),
    };

    const { data: store, error: storeError } = await supabase
      .from("stores")
      .upsert<StoreInsert>(storePayload, { onConflict: "base_url" })
      .select()
      .single();

    if (storeError || !store) {
      throw new Error(storeError?.message ?? "Kunne ikke gemme butikken.");
    }

    const { data: savedProducts, error: productError } = await supabase
      .from("products")
      .upsert<ProductInsert>(
        snapshots.map((product) => ({
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
        })),
        {
          onConflict: "store_id,remote_id",
        }
      )
      .select();

    if (productError || !savedProducts) {
      throw new Error(
        productError?.message ?? "Kunne ikke gemme produktdata i Supabase."
      );
    }

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

