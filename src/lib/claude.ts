import Anthropic from "@anthropic-ai/sdk";
import { generateGeminiText, getGeminiApiKey } from "./gemini";
import { Complaint } from "./types";

export interface InsightsReport {
  total_complaints: number;
  by_category: Record<string, number>;
  flagged_urgent: { flat_no: string; issue: string; days_open: number }[];
  repeat_issues: { flat_no: string; count: number; category: string }[];
  avg_resolution_days: number;
  summary: string;
}

const SYSTEM_PROMPT = `You are analyzing apartment society complaint data for a residential committee.
Given a JSON array of complaint records, return STRICT JSON only (no markdown, no prose outside the JSON) matching exactly this schema:

{
  "total_complaints": number,
  "by_category": { "<category>": number, ... },
  "flagged_urgent": [ { "flat_no": string, "issue": string, "days_open": number } ],
  "repeat_issues": [ { "flat_no": string, "count": number, "category": string } ],
  "avg_resolution_days": number,
  "summary": string
}

Rules:
- flagged_urgent: complaints that are still open/unresolved and have been open unusually long, or are high priority/high severity categories (Security, Electrical, Lift). Cap at 10 items, most urgent first.
- repeat_issues: flats with 2+ complaints in the same category. Cap at 10 items.
- avg_resolution_days: average of (resolved_at - timestamp) in days across complaints that have a resolved_at, rounded to 1 decimal. Use 0 if none are resolved.
- summary: 3-5 plain-English sentences suitable for committee meeting minutes — no jargon.
- Return ONLY the JSON object, nothing else.`;

function parseJsonObject(raw: string): InsightsReport {
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  const jsonText = jsonMatch ? jsonMatch[0] : raw;
  return JSON.parse(jsonText) as InsightsReport;
}

async function generateWithGemini(complaints: Complaint[]): Promise<InsightsReport | null> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) return null;

  try {
    const compact = complaints.map((c) => ({
      id: c.id,
      timestamp: c.timestamp,
      flat_no: c.flat_no,
      category: c.category,
      description: c.description?.slice(0, 300),
      status: c.status,
      priority: c.priority,
      resolved_at: c.resolved_at || null,
    }));

    const raw = await generateGeminiText({
      apiKey,
      system: SYSTEM_PROMPT,
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `Complaint data (${compact.length} records):\n${JSON.stringify(compact)}`,
            },
          ],
        },
      ],
      maxOutputTokens: 2048,
      temperature: 0.1,
    });

    if (!raw) return null;
    return parseJsonObject(raw);
  } catch (err) {
    console.warn("Gemini API call failed, trying other providers/fallback:", err);
    return null;
  }
}

export async function generateInsightsReport(
  complaints: Complaint[]
): Promise<InsightsReport> {
  const geminiReport = await generateWithGemini(complaints);
  if (geminiReport) {
    return geminiReport;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (apiKey) {
    try {
      const anthropic = new Anthropic({ apiKey });

      const compact = complaints.map((c) => ({
        id: c.id,
        timestamp: c.timestamp,
        flat_no: c.flat_no,
        category: c.category,
        description: c.description?.slice(0, 300),
        status: c.status,
        priority: c.priority,
        resolved_at: c.resolved_at || null,
      }));

      const message = await anthropic.messages.create({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: `Complaint data (${compact.length} records):\n${JSON.stringify(compact)}`,
          },
        ],
      });

      const textBlock = message.content.find((b) => b.type === "text");
      const raw = textBlock && "text" in textBlock ? textBlock.text : "{}";
      return parseJsonObject(raw);
    } catch (err) {
      console.warn("Claude API call failed, using local analytics calculation:", err);
    }
  }

  // Fallback programmatic analytical calculation
  return calculateLocalReport(complaints);
}

function calculateLocalReport(complaints: Complaint[]): InsightsReport {
  const total_complaints = complaints.length;
  const by_category: Record<string, number> = {};

  const now = Date.now();
  const flagged_urgent: { flat_no: string; issue: string; days_open: number }[] = [];
  const flatCategoryCounts: Record<string, number> = {};

  let totalResolutionMs = 0;
  let resolvedCount = 0;

  for (const c of complaints) {
    by_category[c.category] = (by_category[c.category] || 0) + 1;

    const key = `${c.flat_no}:${c.category}`;
    flatCategoryCounts[key] = (flatCategoryCounts[key] || 0) + 1;

    if (c.status !== "Resolved" && c.status !== "Closed") {
      const createdMs = new Date(c.timestamp).getTime();
      const daysOpen = Math.max(1, Math.round((now - createdMs) / 86400000));
      if (c.priority === "High" || daysOpen > 3 || ["Security", "Electrical", "Lift"].includes(c.category)) {
        flagged_urgent.push({
          flat_no: c.flat_no,
          issue: `${c.category}: ${c.description.slice(0, 100)}`,
          days_open: daysOpen,
        });
      }
    }

    if (c.resolved_at) {
      const createdMs = new Date(c.timestamp).getTime();
      const resolvedMs = new Date(c.resolved_at).getTime();
      if (resolvedMs > createdMs) {
        totalResolutionMs += resolvedMs - createdMs;
        resolvedCount++;
      }
    }
  }

  const repeat_issues: { flat_no: string; count: number; category: string }[] = [];
  for (const [key, count] of Object.entries(flatCategoryCounts)) {
    if (count >= 2) {
      const [flat_no, category] = key.split(":");
      repeat_issues.push({ flat_no, category, count });
    }
  }

  const avg_resolution_days =
    resolvedCount > 0
      ? Number((totalResolutionMs / resolvedCount / 86400000).toFixed(1))
      : 0;

  const topCategory = Object.entries(by_category).sort((a, b) => b[1] - a[1])[0]?.[0] || "General";

  const summary = `During this reporting period, a total of ${total_complaints} complaint ticket(s) were processed across the society. ${topCategory} emerged as the primary category requiring maintenance attention. The average turnaround time for ticket resolution stands at ${avg_resolution_days} day(s). Management recommends prioritizing flagged high-priority items and reviewing repeat occurrences in affected flats during committee meetings.`;

  return {
    total_complaints,
    by_category,
    flagged_urgent: flagged_urgent.slice(0, 10),
    repeat_issues: repeat_issues.slice(0, 10),
    avg_resolution_days,
    summary,
  };
}

