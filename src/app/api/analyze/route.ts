import { NextResponse } from "next/server";
import { z } from "zod";
import OpenAI from "openai";

import { getServiceClient } from "@/lib/supabase";
import type { Database } from "@/types/database";

type ProductRow = Database["public"]["Tables"]["products"]["Row"];

function extractText(output: OpenAI.Responses.OutputItem[] | null | undefined) {
  if (!output?.length) return "{}";
  for (const item of output) {
    if (item.type === "message") {
      const textChunk = item.content.find((part) => part.type === "output_text");
      if (textChunk && textChunk.type === "output_text") {
        return textChunk.text.join(" ").trim();
      }
    }
  }
  return "{}";
}

const requestSchema = z.object({
  storeId: z.string().uuid(),
  productIds: z.array(z.string().uuid()).optional(),
  limit: z.number().min(1).max(50).default(5),
  openAiKey: z.string().min(40),
});

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = requestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Ugyldigt request", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const { storeId, productIds, limit, openAiKey } = parsed.data;

    const supabase = getServiceClient();
    let query = supabase
      .from("products")
      .select("*")
      .eq("store_id", storeId)
      .limit(limit);

    if (productIds?.length) {
      query = query.in("id", productIds);
    }

    const { data: products, error: productsError } =
      await query.returns<ProductRow[]>();

    if (productsError || !products?.length) {
      return NextResponse.json(
        {
          error:
            productsError?.message ??
            "Ingen produkter blev fundet til analyse.",
        },
        { status: 404 }
      );
    }

    const client = new OpenAI({ apiKey: openAiKey });
    const results = [];

    for (const product of products) {
      const systemPrompt =
        "Du er en dansk e-commerce specialist, der optimerer WooCommerce produktbeskrivelser. Returnér altid JSON.";
      const userPrompt = `
Produktnavn: ${product.name}
Kort beskrivelse: ${product.short_description ?? "N/A"}
Beskrivelse: ${product.description ?? "N/A"}
Pris: ${product.price ?? "N/A"}
SKU: ${product.sku ?? "N/A"}
Meta Title: ${product.meta_title ?? "N/A"}
Meta Description: ${product.meta_description ?? "N/A"}
Ord antal: ${product.word_count ?? 0}

Opgave:
1. Hvor mangler vi vigtig information? Stil konkrete spørgsmål.
2. Hvad bør forbedres for at øge konvertering?
3. Giv SEO-noter (tone of voice, struktur, metadata).
`;

      const response = await client.responses.create({
        model: "gpt-4.1-mini",
        input: [
          {
            role: "system",
            content: systemPrompt,
          },
          {
            role: "user",
            content: userPrompt,
          },
        ],
      });

      const content = extractText(response.output);

      let parsedResult: unknown;
      try {
        parsedResult = JSON.parse(content);
      } catch (parseError) {
        console.error("Kunne ikke parse OpenAI output", parseError);
        parsedResult = {
          summary: "Modellen returnerede ikke gyldigt JSON.",
          missing_information_questions: [],
          optimization_suggestions: [],
          seo_notes: [],
        };
      }

      const { data: savedAnalysis, error: analysisError } = await supabase
        .from("analyses")
        .insert({
          product_id: product.id,
          model: response.model ?? "gpt-4.1-mini",
          analysis: parsedResult,
        })
        .select()
        .single();

      if (analysisError || !savedAnalysis) {
        throw new Error(
          analysisError?.message ?? "Kunne ikke gemme analysen."
        );
      }

      results.push({
        productId: product.id,
        productName: product.name,
        permalink: product.permalink,
        analysis: parsedResult,
      });
    }

    return NextResponse.json({ results });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Uventet fejl under analyse.",
      },
      { status: 500 }
    );
  }
}

