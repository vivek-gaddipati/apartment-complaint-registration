const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const GEMINI_REQUEST_TIMEOUT_MS = 20_000;

const FALLBACK_MODELS = [
  "models/gemini-2.5-flash",
  "models/gemini-2.0-flash",
  "models/gemini-1.5-flash-latest",
  "models/gemini-1.5-flash",
  "models/gemini-pro",
];

type GeminiModel = {
  name: string;
  supportedGenerationMethods?: string[];
};

type GeminiContent = {
  role: "user" | "model";
  parts: Array<{ text: string }>;
};

let cachedModels: string[] | null = null;

export function getGeminiApiKey(): string {
  return process.env.GEMINI_API_KEY || process.env.gemini_api_key || "";
}

function rankModel(name: string): number {
  if (name.includes("gemini-2.5") && name.includes("flash")) return 0;
  if (name.includes("gemini-2.0") && name.includes("flash")) return 1;
  if (name.includes("gemini-1.5") && name.includes("flash")) return 2;
  if (name.includes("gemini") && name.includes("flash")) return 3;
  if (name.includes("gemini") && name.includes("pro")) return 4;
  if (name.includes("gemini")) return 5;
  return 99;
}

export async function getPreferredGeminiModels(apiKey: string): Promise<string[]> {
  if (cachedModels) return cachedModels;

  try {
    const res = await fetch(`${GEMINI_API_BASE}/models?key=${encodeURIComponent(apiKey)}`);
    if (!res.ok) {
      cachedModels = [...FALLBACK_MODELS];
      return cachedModels;
    }

    const data = (await res.json()) as { models?: GeminiModel[] };
    const discovered = (data.models || [])
      .filter((m) =>
        (m.supportedGenerationMethods || []).some((method) => method === "generateContent")
      )
      .map((m) => m.name)
      .filter((name) => name.startsWith("models/gemini"))
      .sort((a, b) => rankModel(a) - rankModel(b));

    cachedModels = discovered.length > 0 ? discovered : [...FALLBACK_MODELS];
    return cachedModels;
  } catch {
    cachedModels = [...FALLBACK_MODELS];
    return cachedModels;
  }
}

export async function generateGeminiText(params: {
  apiKey: string;
  system: string;
  contents: GeminiContent[];
  maxOutputTokens: number;
  temperature?: number;
}): Promise<string | null> {
  const { apiKey, system, contents, maxOutputTokens, temperature = 0.1 } = params;
  const models = await getPreferredGeminiModels(apiKey);
  let lastError: string | null = null;

  for (const model of models) {
    try {
      const res = await fetch(
        `${GEMINI_API_BASE}/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: AbortSignal.timeout(GEMINI_REQUEST_TIMEOUT_MS),
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: system }] },
            contents,
            generationConfig: {
              temperature,
              maxOutputTokens,
            },
          }),
        }
      );

      if (res.status === 404) {
        lastError = `Model not supported: ${model}`;
        continue;
      }

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Gemini API error ${res.status}: ${errText.slice(0, 300)}`);
      }

      const data = (await res.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };

      const text =
        data.candidates?.[0]?.content?.parts
          ?.map((p) => p.text || "")
          .join("\n")
          .trim() || "";

      if (text) return text;
      lastError = `Model ${model} returned empty response.`;
    } catch (err) {
      lastError = err instanceof Error ? err.message : "Unknown Gemini error.";
    }
  }

  if (lastError) {
    throw new Error(lastError);
  }
  return null;
}