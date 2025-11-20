import { NextResponse } from "next/server";
import { z } from "zod";
import OpenAI from "openai";

import { getServiceClient } from "@/lib/supabase";
import type { Database, Json } from "@/types/database";

type ProductRow = Database["public"]["Tables"]["products"]["Row"];
type AnalysisRow = Database["public"]["Tables"]["analyses"]["Row"];
type AnalysisInsert = Database["public"]["Tables"]["analyses"]["Insert"];
type ResponseMessage = Extract<
  NonNullable<OpenAI.Responses.Response["output"]>[number],
  { type: "message" }
>;

function extractText(output: OpenAI.Responses.Response["output"]) {
  if (!Array.isArray(output)) return "{}";
  const message = output.find(
    (item): item is ResponseMessage => item?.type === "message"
  );
  if (!message) return "{}";
  const textPart = message.content.find(
    (part) => part.type === "output_text"
  );
  if (!textPart || textPart.type !== "output_text") return "{}";
  if (Array.isArray(textPart.text)) {
    return textPart.text.join(" ").trim() || "{}";
  }
  if (typeof textPart.text === "string") {
    return textPart.text.trim() || "{}";
  }
  return "{}";
}

const requestSchema = z.object({
  storeId: z.string().uuid(),
  productIds: z.array(z.string().uuid()).optional(),
  limit: z.number().min(1).max(50).default(5),
  openAiKey: z.string().min(40),
});

const analysisSchema = z.object({
  summary: z.string().min(1),
  missing_information_questions: z.array(z.string()),
  optimization_suggestions: z.array(z.string()),
  seo_notes: z.array(z.string()),
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
            content:
              systemPrompt +
              "\nSvar altid som gyldigt JSON der matcher nøglerne: summary, missing_information_questions, optimization_suggestions, seo_notes.",
          },
          {
            role: "user",
            content: userPrompt,
          },
        ],
      });

      const content = extractText(response.output);

      let parsedResult: Json = {
        summary: "Modellen returnerede ikke gyldigt JSON.",
        missing_information_questions: [],
        optimization_suggestions: [],
        seo_notes: [],
      };
      try {
        const candidate = JSON.parse(content);
        const check = analysisSchema.safeParse(candidate);
        if (check.success) {
          parsedResult = check.data;
        } else {
          console.warn("Schema validation failed", check.error.flatten());
        }
      } catch (parseError) {
        console.error("Kunne ikke parse OpenAI output", parseError);
      }

      const insertPayload: AnalysisInsert = {
        product_id: product.id,
        model: response.model ?? "gpt-4.1-mini",
        analysis: parsedResult as Json,
      };
      const { data: savedAnalysis, error: analysisError } = await supabase
        .from("analyses")
        .insert<AnalysisInsert>(insertPayload)
        .select()
        .single()
        .returns<AnalysisRow>();

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

