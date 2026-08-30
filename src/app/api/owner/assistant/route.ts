import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { getOwnerSession } from "@/lib/auth";
import { generateGeminiText, getGeminiApiKey } from "@/lib/gemini";
import { getAllKnowledgeChunks } from "@/lib/sheets";

// Avoid Next.js's default fetch caching so knowledge reads stay live.
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

interface KnowledgeMatch {
	source_title: string;
	page_hint: string;
	source_type: string;
	chunk_text: string;
	tags: string;
	score: number;
}

interface ChatHistoryTurn {
	role: "user" | "assistant";
	text: string;
}

const STOPWORDS = new Set([
	"the",
	"and",
	"for",
	"with",
	"from",
	"that",
	"this",
	"what",
	"when",
	"where",
	"which",
	"have",
	"has",
	"you",
	"your",
	"our",
	"are",
	"was",
	"were",
	"can",
	"could",
	"please",
	"about",
	"into",
	"than",
	"then",
	"there",
	"their",
	"will",
	"would",
	"should",
	"policy",
	"society",
]);

function tokenize(input: string): string[] {
	return input
		.toLowerCase()
		.split(/[^a-z0-9]+/)
		.map((t) => t.trim())
		.filter((t) => t.length >= 3 && !STOPWORDS.has(t));
}

function scoreChunk(text: string, tags: string, sourceTitle: string, tokens: string[]): number {
	const lower = text.toLowerCase();
	const lowerTags = (tags || "").toLowerCase();
	const lowerTitle = (sourceTitle || "").toLowerCase();
	let score = 0;
	for (const token of tokens) {
		if (lower.includes(token)) {
			score += token.length >= 7 ? 4 : 3;
		}
		if (lowerTags.includes(token)) {
			score += 2;
		}
		if (lowerTitle.includes(token)) {
			score += 1;
		}
	}
	return score;
}

function rankKnowledge(question: string, chunks: Awaited<ReturnType<typeof getAllKnowledgeChunks>>): KnowledgeMatch[] {
	const tokens = tokenize(question);
	if (tokens.length === 0) return [];

	const ranked = chunks
		.map((chunk) => ({
			source_title: chunk.source_title,
			page_hint: chunk.page_hint,
			source_type: chunk.source_type,
			chunk_text: chunk.chunk_text,
			tags: chunk.tags,
			score: scoreChunk(chunk.chunk_text, chunk.tags, chunk.source_title, tokens),
		}))
		.filter((chunk) => chunk.score > 0)
		.sort((a, b) => b.score - a.score)
		.slice(0, 10);

	return ranked;
}

function uniqueSources(matches: KnowledgeMatch[]): string[] {
	const seen = new Set<string>();
	const sources: string[] = [];
	for (const m of matches) {
		const source = `${m.source_title}${m.page_hint ? ` (section ${m.page_hint})` : ""}`;
		if (!seen.has(source)) {
			seen.add(source);
			sources.push(source);
		}
	}
	return sources;
}

function splitSentences(text: string): string[] {
	return text
		.replace(/\s+/g, " ")
		.split(/(?<=[.!?])\s+/)
		.map((s) => s.trim())
		.filter((s) => s.length >= 30);
}

function sentenceScore(sentence: string, tokens: string[]): number {
	const lower = sentence.toLowerCase();
	let score = 0;
	for (const token of tokens) {
		if (!lower.includes(token)) continue;
		score += token.length >= 7 ? 4 : 3;
	}
	return score;
}

function localAnswer(question: string, matches: KnowledgeMatch[]): string {
	if (matches.length === 0) {
		return "I could not find this in the uploaded society knowledge documents. Please contact the admin committee for clarification.";
	}

	const tokens = tokenize(question);
	type Candidate = { text: string; score: number; sourceNo: number };
	const candidates: Candidate[] = [];

	matches.slice(0, 6).forEach((match, idx) => {
		const sourceNo = idx + 1;
		for (const sentence of splitSentences(match.chunk_text)) {
			const score = sentenceScore(sentence, tokens);
			if (score <= 0) continue;
			candidates.push({ text: sentence, score, sourceNo });
		}
	});

	candidates.sort((a, b) => b.score - a.score);

	const seenText = new Set<string>();
	const selected: Candidate[] = [];
	for (const c of candidates) {
		const key = c.text.toLowerCase();
		if (seenText.has(key)) continue;
		seenText.add(key);
		selected.push(c);
		if (selected.length >= 4) break;
	}

	if (selected.length === 0) {
		const fallback = matches
			.slice(0, 2)
			.map((m, i) => {
				const sentence = splitSentences(m.chunk_text)[0] || m.chunk_text.slice(0, 220);
				return `- ${sentence}${sentence.endsWith(".") ? "" : "."} [${i + 1}]`;
			})
			.join("\n");

		return [
			"I could not reach the AI model right now, but here is what the documents state:",
			fallback,
			"If you want, ask a narrower follow-up (for example: visitor timing, parking penalties, or clubhouse booking).",
		].join("\n\n");
	}

	const bullets = selected
		.map((s) => `- ${s.text}${s.text.endsWith(".") ? "" : "."} [${s.sourceNo}]`)
		.join("\n");

	return [
		"Here is the answer from the uploaded society documents:",
		bullets,
		"I can also summarize this into steps for residents if you want.",
	].join("\n\n");
}

async function aiAnswer(question: string, matches: KnowledgeMatch[]): Promise<string | null> {
	const apiKey = process.env.ANTHROPIC_API_KEY;
	if (!apiKey || matches.length === 0) return null;

	try {
		const anthropic = new Anthropic({ apiKey });
		const context = matches
			.map(
				(m, i) =>
					`[Source ${i + 1}] ${m.source_title} | section ${m.page_hint || "n/a"}\n${m.chunk_text}`
			)
			.join("\n\n");

		const system =
			"You are a helpful apartment society assistant. Answer using only the provided knowledge snippets. If the snippets are insufficient, clearly say the policy is not available in the knowledge base. Keep the answer concise and resident-friendly.";

		const message = await anthropic.messages.create({
			model: "claude-3-5-sonnet-20241022",
			max_tokens: 500,
			system,
			messages: [
				{
					role: "user",
					content: `Resident question: ${question}\n\nKnowledge snippets:\n${context}`,
				},
			],
		});

		const textBlock = message.content.find((b) => b.type === "text");
		const answer = textBlock && "text" in textBlock ? textBlock.text.trim() : "";
		return answer || null;
	} catch (err) {
		console.warn("Owner assistant AI answer failed, using local fallback:", err);
		return null;
	}
}

function toClaudeTurns(history: ChatHistoryTurn[], question: string) {
	const trimmed = history
		.filter((t) => (t.role === "user" || t.role === "assistant") && typeof t.text === "string")
		.map((t) => ({ role: t.role, content: t.text.trim() }))
		.filter((t) => t.content.length > 0)
		.slice(-8)
		.map((t) => ({
			role: t.role as "user" | "assistant",
			content: t.content,
		}));

	return [...trimmed, { role: "user" as const, content: question.trim() }];
}

function buildKnowledgeContext(matches: KnowledgeMatch[]): string {
	return matches
		.map(
			(m, i) =>
				`[Source ${i + 1}] ${m.source_title} | section ${m.page_hint || "n/a"}\n${m.chunk_text}`
		)
		.join("\n\n");
}

function toGeminiTurns(history: ChatHistoryTurn[], question: string) {
	const turns: Array<{ role: "user" | "model"; parts: Array<{ text: string }> }> = history
		.filter((t) => (t.role === "user" || t.role === "assistant") && typeof t.text === "string")
		.map((t) => ({
			role: t.role === "assistant" ? ("model" as const) : ("user" as const),
			text: t.text.trim(),
		}))
		.filter((t) => t.text.length > 0)
		.slice(-8)
		.map((t) => ({ role: t.role, parts: [{ text: t.text }] }));

	turns.push({ role: "user", parts: [{ text: question.trim() }] });
	return turns;
}

async function geminiAnswerWithHistory(
	question: string,
	history: ChatHistoryTurn[],
	matches: KnowledgeMatch[]
): Promise<string | null> {
	const apiKey = getGeminiApiKey();
	if (!apiKey || matches.length === 0) return null;

	const context = buildKnowledgeContext(matches);
	const system = [
		"You are a society resident support assistant.",
		"Answer strictly from the supplied Knowledge snippets only.",
		"If the answer is not present in the snippets, say that the policy is not available in the uploaded knowledge documents.",
		"Do not invent rules, timings, or penalties.",
		"Give a complete answer in 4-8 clear sentences, resident-friendly and practical.",
		"Synthesize across snippets; do not dump raw chunk text.",
		"When you use facts, cite sources in-line as [1], [2], matching the snippet numbers.",
		"If the resident asks a follow-up, use prior chat turns for context but still ground facts only in snippets.",
		"Knowledge snippets:\n" + context,
	].join(" ");

	try {
		return await generateGeminiText({
			apiKey,
			system,
			contents: toGeminiTurns(history, question),
			maxOutputTokens: 1200,
			temperature: 0.1,
		});
	} catch (err) {
		console.warn("Owner assistant Gemini answer failed, trying fallback:", err);
		return null;
	}
}

async function aiAnswerWithHistory(
	question: string,
	history: ChatHistoryTurn[],
	matches: KnowledgeMatch[]
): Promise<string | null> {
	const apiKey = process.env.ANTHROPIC_API_KEY;
	if (!apiKey || matches.length === 0) return null;

	try {
		const anthropic = new Anthropic({ apiKey });
		const context = buildKnowledgeContext(matches);

		const system = [
			"You are a society resident support assistant.",
			"Answer strictly from the supplied Knowledge snippets only.",
			"If the answer is not present in the snippets, say that the policy is not available in the uploaded knowledge documents.",
			"Do not invent rules, timings, or penalties.",
			"Give a complete answer in 4-8 clear sentences, resident-friendly and practical.",
			"Synthesize across snippets; do not dump raw chunk text.",
			"When you use facts, cite sources in-line as [1], [2], matching the snippet numbers.",
			"If the resident asks a follow-up, use prior chat turns for context but still ground facts only in snippets.",
			"Knowledge snippets:\n" + context,
		].join(" ");

		const message = await anthropic.messages.create({
			model: "claude-3-5-sonnet-20241022",
			max_tokens: 1200,
			system,
			messages: toClaudeTurns(history, question),
		});

		const textBlock = message.content.find((b) => b.type === "text");
		const answer = textBlock && "text" in textBlock ? textBlock.text.trim() : "";
		return answer || null;
	} catch (err) {
		console.warn("Owner assistant AI answer failed, using local fallback:", err);
		return null;
	}
}

export async function POST(req: NextRequest) {
	const session = getOwnerSession();
	if (!session) {
		return NextResponse.json({ error: "Not signed in." }, { status: 401 });
	}

	try {
		const { question, history } = await req.json().catch(() => ({ question: "", history: [] }));
		if (typeof question !== "string" || !question.trim()) {
			return NextResponse.json({ error: "Question is required." }, { status: 400 });
		}

		const safeHistory: ChatHistoryTurn[] = Array.isArray(history)
			? history.reduce<ChatHistoryTurn[]>((acc, h) => {
					const text = typeof h?.text === "string" ? h.text.trim() : "";
					if (!text) return acc;
					acc.push({
						role: h?.role === "assistant" ? "assistant" : "user",
						text,
					});
					return acc;
			  }, [])
			: [];

		const allChunks = await getAllKnowledgeChunks();
		if (allChunks.length === 0) {
			return NextResponse.json({
				ok: true,
				answer:
					"Knowledge base is currently empty. Please ask the admin committee to upload society handbook or policy documents.",
				sources: [] as string[],
			});
		}

		const matches = rankKnowledge(question, allChunks);
		const sources = uniqueSources(matches);

		const answer =
			(await geminiAnswerWithHistory(question, safeHistory, matches)) ??
			(await aiAnswerWithHistory(question, safeHistory, matches)) ??
			(await aiAnswer(question, matches)) ??
			localAnswer(question, matches);

		return NextResponse.json({
			ok: true,
			answer,
			sources,
		});
	} catch (err) {
		console.error("Owner assistant error:", err);
		return NextResponse.json(
			{ error: "Unable to generate assistant response. Please try again." },
			{ status: 500 }
		);
	}
}
