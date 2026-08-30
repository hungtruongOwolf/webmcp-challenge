import { NextResponse } from "next/server";

import { createClient } from "@/app/libs/supabase/server";

/**
 * Describes an image message for the describe_image WebMCP tool -- the
 * accessibility feature the whole pitch is built around, so a blind or
 * low-vision user can ask "what's in this photo?" and get an answer.
 *
 * The vision API key has to stay server-side, which is the one reason this
 * route exists instead of calling a provider straight from the tool.
 */
export async function POST(req: Request) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return new NextResponse("Unauthorized.", { status: 401 });

    const { imageUrl } = await req.json();
    if (!imageUrl || typeof imageUrl !== "string") {
      return new NextResponse("imageUrl is required.", { status: 400 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return new NextResponse(
        "Image description isn't configured yet (missing OPENAI_API_KEY).",
        { status: 501 }
      );
    }

    const completion = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        max_tokens: 200,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Describe this image in one or two plain sentences for someone who can't see it. Be concrete and factual.",
              },
              { type: "image_url", image_url: { url: imageUrl } },
            ],
          },
        ],
      }),
    });

    if (!completion.ok) {
      const detail = await completion.text().catch(() => "");
      console.error("ERROR_DESCRIBE:", completion.status, detail);
      return new NextResponse("The vision model request failed.", { status: 502 });
    }

    const data = await completion.json();
    const description: string =
      data.choices?.[0]?.message?.content?.trim() || "No description available.";

    return NextResponse.json({ description });
  } catch (error: unknown) {
    console.error("ERROR_DESCRIBE:", error);
    return new NextResponse("Internal Server Error.", { status: 500 });
  }
}
