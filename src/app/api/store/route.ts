import { NextResponse } from "next/server";
import { z } from "zod";

import { getServiceClient } from "@/lib/supabase";
import { normalizeStoreUrl } from "@/lib/utils";
import type { Database, Json } from "@/types/database";

const querySchema = z
  .object({
    storeId: z.string().uuid().optional(),
    storeUrl: z.string().min(3).optional(),
    brand: z.string().optional(),
    category: z.string().optional(),
    onSale: z
      .string()
      .optional()
      .transform((val) => (val === "true" ? true : val === "false" ? false : undefined)),
    featured: z
      .string()
      .optional()
      .transform((val) => (val === "true" ? true : val === "false" ? false : undefined)),
    sortBy: z.enum(["name", "date_created", "price"]).default("name"),
    sortOrder: z.enum(["asc", "desc"]).default("asc"),
  })
  .refine(
    (value) => value.storeId || value.storeUrl,
    "storeId eller storeUrl er påkrævet"
  );

type StoreRow = Database["public"]["Tables"]["stores"]["Row"];
type ProductRow = Database["public"]["Tables"]["products"]["Row"];
type AnalysisRow = Database["public"]["Tables"]["analyses"]["Row"];

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const parsed = querySchema.safeParse({
      storeId: url.searchParams.get("storeId") ?? undefined,
      storeUrl: url.searchParams.get("storeUrl") ?? undefined,
      brand: url.searchParams.get("brand") ?? undefined,
      category: url.searchParams.get("category") ?? undefined,
      onSale: url.searchParams.get("onSale") ?? undefined,
      featured: url.searchParams.get("featured") ?? undefined,
      sortBy: url.searchParams.get("sortBy") ?? "name",
      sortOrder: url.searchParams.get("sortOrder") ?? "asc",
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

    let query = supabase
      .from("products")
      .select("*")
      .eq("store_id", store.id);

    // Tilføj filtre
    if (parsed.data.brand) {
      query = query.eq("brand", parsed.data.brand);
    }
    if (parsed.data.category) {
      // Søg efter kategori i category_names array
      query = query.contains("category_names", [parsed.data.category]);
    }
    if (parsed.data.onSale !== undefined) {
      query = query.eq("on_sale", parsed.data.onSale);
    }
    if (parsed.data.featured !== undefined) {
      query = query.eq("featured", parsed.data.featured);
    }

    // Sortering
    const sortBy = parsed.data.sortBy ?? "name";
    const ascending = parsed.data.sortOrder !== "desc";
    
    // Håndter særlige sorteringsfelter
    if (sortBy === "price") {
      // For price skal vi sortere efter numerisk værdi, men vi gemmer det som string
      // Så vi sorterer alfabetisk (hvilket fungerer for samme format)
      query = query.order("price", { ascending });
    } else {
      query = query.order(sortBy, { ascending });
    }

    const { data: products, error: productsError } = await query.returns<ProductRow[]>();

    if (productsError) {
      throw new Error(productsError.message);
    }

    const productIds = products.map((product) => product.id);
    let analysesByProduct:
      | Record<
          string,
          {
            analysis?: Json;
            rewrite?: Json;
          }
        >
      | undefined;

    if (productIds.length) {
      const { data: analysesRows, error: analysesError } = await supabase
        .from("analyses")
        .select("*")
        .in("product_id", productIds)
        .order("created_at", { ascending: false })
        .returns<AnalysisRow[]>();

      if (analysesError) {
        throw new Error(analysesError.message);
      }

      analysesByProduct = {};
      for (const row of analysesRows ?? []) {
        const bucket =
          analysesByProduct[row.product_id] ??
          (analysesByProduct[row.product_id] = {});
        const payload = row.analysis;
        const isRewrite =
          payload && typeof payload === "object" && "kind" in payload;
        if (isRewrite && !bucket.rewrite) {
          bucket.rewrite = payload;
        } else if (!isRewrite && !bucket.analysis) {
          bucket.analysis = payload;
        }
      }
    }

    return NextResponse.json({
      store,
      products,
      analyses: analysesByProduct ?? {},
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

