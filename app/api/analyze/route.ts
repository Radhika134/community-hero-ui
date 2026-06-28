import { NextRequest } from "next/server";
import dns from "dns";

// Prioritize IPv4 DNS resolution to prevent IPv6 gateway failures in local environments
dns.setDefaultResultOrder("ipv4first");

export async function POST(request: NextRequest) {
  // Disable strict SSL verification for local proxy/VPN environments
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  try {
    const apiKey = process.env.GOOGLE_AI_KEY;
    if (!apiKey) {
      return Response.json(
        { error: "GOOGLE_AI_KEY environment variable is not configured on the server." },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { base64Image, mimeType } = body;

    if (!base64Image || !mimeType) {
      return Response.json(
        { error: "Missing required fields: base64Image and mimeType are required." },
        { status: 400 }
      );
    }

    // Clean up base64 if it has data URL prefixes
    let cleanBase64 = base64Image;
    if (base64Image.includes(";base64,")) {
      cleanBase64 = base64Image.split(";base64,").pop() || "";
    }

    console.log('Key starts with:', apiKey ? `${apiKey.substring(0, 10)}... (Length: ${apiKey.length})` : 'undefined');

    // Make direct native fetch call to Gemini REST API
    const apiUrl = `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    const apiResponse = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: "You are a civic issue analyzer. Analyze this image. Return ONLY valid JSON with keys: 'issue_type' (string), 'severity' (integer 1-10), 'confidence' (float 0.0 to 1.0), 'action_required' (string). NO MARKDOWN.",
              },
              {
                inline_data: {
                  mime_type: mimeType,
                  data: cleanBase64,
                },
              },
            ],
          },
        ],
      }),
    });

    if (!apiResponse.ok) {
      const errText = await apiResponse.text();
      console.error("Gemini REST API error output:", errText);
      return Response.json({ error: "AI parsing failed" });
    }

    try {
      const responseJson = await apiResponse.json();
      const responseText = responseJson.candidates[0].content.parts[0].text;
      
      // Strip out all markdown backticks
      const cleanJsonText = responseText.replace(/```json/g, "").replace(/```/g, "").trim();
      const parsedJsonObject = JSON.parse(cleanJsonText);
      
      return Response.json(parsedJsonObject);
    } catch (error) {
      console.error("AI extraction/parsing failed:", error);
      return Response.json({ error: "AI parsing failed" });
    }
  } catch (error: any) {
    console.error("Error in /api/analyze route:", error);
    return Response.json({ error: "AI parsing failed" });
  }
}
