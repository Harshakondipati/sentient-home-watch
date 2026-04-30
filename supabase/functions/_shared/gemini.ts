type TextPart = { type: "text"; text: string };
type ImagePart = { type: "image_url"; image_url: { url: string } };
type MessagePart = TextPart | ImagePart;

export type GeminiMessage = {
  role: "system" | "user" | "assistant";
  content: string | MessagePart[];
};

type GenerateOptions = {
  apiKey: string;
  model: string;
  system?: string;
  messages: GeminiMessage[];
  temperature?: number;
  topP?: number;
  maxOutputTokens?: number;
};

export async function generateGeminiText({
  apiKey,
  model,
  system,
  messages,
  temperature = 0.3,
  topP = 0.85,
  maxOutputTokens = 1000,
}: GenerateOptions) {
  const systemParts: string[] = [];
  if (system) systemParts.push(system);

  const contents = messages.flatMap((message) => {
    if (message.role === "system") {
      if (typeof message.content === "string") systemParts.push(message.content);
      return [];
    }

    return [{
      role: message.role === "assistant" ? "model" : "user",
      parts: toGeminiParts(message.content),
    }];
  });

  const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      ...(systemParts.length ? { systemInstruction: { parts: [{ text: systemParts.join("\n\n") }] } } : {}),
      contents,
      generationConfig: { temperature, topP, maxOutputTokens },
    }),
  });

  if (!resp.ok) {
    const detail = await resp.text();
    throw new Error(`Gemini API error (${resp.status}): ${detail.slice(0, 300)}`);
  }

  const data = await resp.json();
  return (data?.candidates?.[0]?.content?.parts ?? [])
    .map((part: { text?: string }) => part.text ?? "")
    .join("")
    .trim();
}

function toGeminiParts(content: string | MessagePart[]) {
  if (typeof content === "string") return [{ text: content }];

  return content.map((part) => {
    if (part.type === "text") return { text: part.text };

    const parsed = parseDataUrl(part.image_url.url);
    return {
      inlineData: {
        mimeType: parsed.mimeType,
        data: parsed.data,
      },
    };
  });
}

function parseDataUrl(dataUrl: string) {
  const match = dataUrl.match(/^data:([^;,]+);base64,(.+)$/);
  if (!match) throw new Error("Only base64 data URLs are supported for images");
  return { mimeType: match[1], data: match[2] };
}
