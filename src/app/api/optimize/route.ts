import { NextResponse } from "next/server";
import { z } from "zod";
import OpenAI from "openai";

import { getServiceClient } from "@/lib/supabase";
import type { Database, Json } from "@/types/database";

type ProductRow = Database["public"]["Tables"]["products"]["Row"];
type AnalysisInsert = Database["public"]["Tables"]["analyses"]["Insert"];

const requestSchema = z.object({
  productId: z.string().uuid(),
  openAiKey: z.string().min(40),
  instructions: z.string().optional(),
});

const rewriteSchema = {
  type: "object",
  properties: {
    short_description: { type: "string" },
    description: { type: "string" },
    notes: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: ["short_description", "description"],
  additionalProperties: false,
} as const;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function insertAnalysis(payload: AnalysisInsert) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "Supabase environment variables mangler til optimeringsresultatet."
    );
  }

  const response = await fetch(`${SUPABASE_URL}/rest/v1/analyses`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify([payload]),
  });

  if (!response.ok) {
    throw new Error(
      `Supabase REST fejl (${response.status}): ${await response.text()}`
    );
  }

  const data = (await response.json()) as AnalysisInsert[];
  if (!data.length) {
    throw new Error("Ingen optimering blev gemt i Supabase.");
  }

  return data[0];
}

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const parsed = requestSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Ugyldigt request", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const { productId, openAiKey, instructions } = parsed.data;

    const supabase = getServiceClient();
    const { data: product, error: productError } = await supabase
      .from("products")
      .select("*")
      .eq("id", productId)
      .maybeSingle<ProductRow>();

    if (productError || !product) {
      return NextResponse.json(
        { error: productError?.message ?? "Produktet blev ikke fundet." },
        { status: 404 }
      );
    }

    const client = new OpenAI({ apiKey: openAiKey });
    const response = await client.responses.create({
      model: "gpt-4.1-mini",
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "ProductRewrite",
          schema: rewriteSchema,
        },
      },
      input: [
        {
          role: "system",
          content: [
            "Du er en dansk copywriter for e-commerce. Du modtager produktinformation og skal levere en optimeret kort beskrivelse samt en længere beskrivelse.",
            "Ignorér størrelsesguider og kundeanmeldelser, da de håndteres separat på websitet.",
            "Lav separate optimeringsforslag for kort og lang tekst.",
            instructions?.trim()
              ? `Yderligere instruktioner:\n${instructions.trim()}`
              : null,
          ]
            .filter(Boolean)
            .join("\n\n"),
        },
        {
          role: "user",
          content: `Produktnavn: ${product.name}
Kort beskrivelse: ${product.short_description ?? "N/A"}
Beskrivelse: ${product.description ?? "N/A"}
Funktion: ${product.raw && typeof product.raw === "object" ? JSON.stringify(product.raw) : "N/A"}

Lever nu:
- En forbedret kort tekst (max 400 tegn).
- En forbedret lang tekst med fokus på funktion, skader, forebyggelse og potentielle kundespørgsmål.
- Eventuelle noter/råd til shop-ejeren.`,
        },
      ],
    });

    const content =
      response.output?.[0]?.content?.[0]?.type === "output_text"
        ? response.output[0].content[0].text ?? "{}"
        : "{}";

    let parsedResult: {
      short_description: string;
      description: string;
      notes?: string[];
    } = {
      short_description: product.short_description ?? "",
      description: product.description ?? "",
    };

    try {
      parsedResult = JSON.parse(content);
    } catch (parseError) {
      console.error("Kunne ikke parse OpenAI rewrite output", parseError);
    }

    await insertAnalysis({
      product_id: product.id,
      model: response.model ?? "gpt-4.1-mini",
      analysis: {
        kind: "rewrite",
        result: parsedResult,
      } as Json,
    });

    return NextResponse.json({ rewrite: parsedResult });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Uventet fejl under optimering.",
      },
      { status: 500 }
    );
  }
}

