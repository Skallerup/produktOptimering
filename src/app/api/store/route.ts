import { NextResponse } from "next/server";
import { z } from "zod";

import { getServiceClient } from "@/lib/supabase";
import { normalizeStoreUrl } from "@/lib/utils";
import type { Database } from "@/types/database";

const querySchema = z
  .object({
    storeId: z.string().uuid().optional(),
    storeUrl: z.string().min(3).optional(),
  })
  .refine(
    (value) => value.storeId || value.storeUrl,
    "storeId eller storeUrl er påkrævet"
  );

type StoreRow = Database["public"]["Tables"]["stores"]["Row"];
type ProductRow = Database["public"]["Tables"]["products"]["Row"];

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const parsed = querySchema.safeParse({
      storeId: url.searchParams.get("storeId") ?? undefined,
      storeUrl: url.searchParams.get("storeUrl") ?? undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Ugyldige query parametre", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const supabase = getServiceClient();
    let storeId = parsed.data.storeId ?? null;

    if (!storeId && parsed.data.storeUrl) {
      const normalizedUrl = normalizeStoreUrl(parsed.data.storeUrl);
      const { data: existingStore, error: storeByUrlError } = await supabase
        .from("stores")
        .select("*")
        .eq("base_url", normalizedUrl)
        .maybeSingle<StoreRow>();

      if (storeByUrlError) {
        throw new Error(storeByUrlError.message);
      }

      if (!existingStore) {
        return NextResponse.json(
          { error: "Ingen butik fundet for den URL." },
          { status: 404 }
        );
      }

      storeId = existingStore.id;
    }

    if (!storeId) {
      return NextResponse.json(
        { error: "Kunne ikke identificere butikken." },
        { status: 404 }
      );
    }

    const { data: store, error: storeError } = await supabase
      .from("stores")
      .select("*")
      .eq("id", storeId)
      .maybeSingle<StoreRow>();

    if (storeError) {
      throw new Error(storeError.message);
    }

    if (!store) {
      return NextResponse.json(
        { error: "Butikken eksisterer ikke længere." },
        { status: 404 }
      );
    }

    const { data: products, error: productsError } = await supabase
      .from("products")
      .select("*")
      .eq("store_id", store.id)
      .order("name", { ascending: true })
      .returns<ProductRow[]>();

    if (productsError) {
      throw new Error(productsError.message);
    }

    return NextResponse.json({
      store,
      products,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Uventet fejl ved hentning af butik.",
      },
      { status: 500 }
    );
  }
}

