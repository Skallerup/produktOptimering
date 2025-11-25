import { NextResponse } from "next/server";
import { z } from "zod";
import OpenAI from "openai";

import { getServiceClient } from "@/lib/supabase";
import type { Database, Json } from "@/types/database";

type ProductRow = Database["public"]["Tables"]["products"]["Row"];
type AnalysisInsert = Database["public"]["Tables"]["analyses"]["Insert"];
type ResponseMessage = Extract<
  NonNullable<OpenAI.Responses.Response["output"]>[number],
  { type: "message" }
>;

const requestSchema = z.object({
  productId: z.string().uuid(),
  openAiKey: z.string().min(40),
  instructions: z.string().optional(),
  depthLevel: z.number().int().min(1).max(5).default(5),
});

const rewriteSchema = z.object({
  short_description: z.string(),
  description: z.string(),
  notes: z.array(z.string()).optional(),
});

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const depthGuidance: Record<number, string> = {
  1: "Dybde 1: Lav en ultra kort langtekst (max 2 sætninger) – fokus på elevator pitch uden detaljer.",
  2: "Dybde 2: Kort longform med 3-4 nøglepointer og et par emojis.",
  3: "Dybde 3: Balanceret longform med 4-5 afsnit eller bullets, tydelige sektionstitler i <strong>bold</strong> og relevante emojis.",
  4: "Dybde 4: Inddrag detaljerede scenarier, bullets og microcopy til CTA'er. Brug flere emojis og <strong>bold</strong> for at fremhæve benefits.",
  5: "Dybde 5: Skriv en dybdegående longform med storytelling, bullets, tabeller (HTML), CTA-sektion og rig brug af <strong>bold</strong>/emojis for at fremhæve hvert kernepunkt.",
};

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

    const { productId, openAiKey, instructions, depthLevel } = parsed.data;

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

    const depthInstruction =
      depthGuidance[depthLevel] ?? depthGuidance[3];

    const client = new OpenAI({ apiKey: openAiKey });
    const response = await client.responses.create({
      model: "gpt-4.1-mini",
      input: [
        {
          role: "system",
          content: [
            "Du er en dansk copywriter for e-commerce. Du modtager produktinformation og skal levere en optimeret kort beskrivelse samt en længere beskrivelse.",
            "Ignorér størrelsesguider og kundeanmeldelser, da de håndteres separat på websitet.",
            depthInstruction,
            "Returnér altid gyldigt JSON med felterne short_description, description (HTML-string) og valgfrit notes (array af strenge).",
            instructions?.trim()
              ? `Instruktioner:\n${instructions.trim()}`
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
- En forbedret kort tekst i HTML.
- En forbedret lang tekst.
- Eventuelle noter/råd til shop-ejeren.`,
        },
      ],
    });

    const content = extractText(response.output);

    let parsedResult: {
      short_description: string;
      description: string;
      notes?: string[];
    } = {
      short_description: product.short_description ?? "",
      description: product.description ?? "",
    };

    try {
      const candidate = JSON.parse(content);
      const check = rewriteSchema.safeParse(candidate);
      if (check.success) {
        parsedResult = check.data;
      } else {
        console.warn("Rewrite schema validation failed", check.error.flatten());
      }
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

