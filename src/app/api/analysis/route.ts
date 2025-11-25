import { NextResponse } from "next/server";
import { z } from "zod";

import { getServiceClient } from "@/lib/supabase";

const deleteSchema = z.object({
  analysisId: z.string().uuid(),
});

export const runtime = "nodejs";

export async function DELETE(request: Request) {
  try {
    const body = await request.json();
    const parsed = deleteSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Ugyldigt request", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const supabase = getServiceClient();
    const { error } = await supabase
      .from("analyses")
      .delete()
      .eq("id", parsed.data.analysisId);

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Uventet fejl ved sletning af analyse.",
      },
      { status: 500 }
    );
  }
}


