import { randomUUID } from "crypto";
import { KnowledgeChunk } from "@/lib/types";

const MAX_PDF_BYTES = 25 * 1024 * 1024;
const CHUNK_SIZE = 900;
const CHUNK_OVERLAP = 120;

export const MAX_KNOWLEDGE_UPLOAD_BYTES = MAX_PDF_BYTES;

function normalizeWhitespace(text: string): string {
	return text.replace(/\r\n/g, "\n").replace(/\u0000/g, "").replace(/[ \t]+/g, " ").trim();
}

function splitIntoChunks(text: string): string[] {
	const clean = normalizeWhitespace(text);
	if (!clean) return [];

	const chunks: string[] = [];
	let cursor = 0;

	while (cursor < clean.length) {
		const hardEnd = Math.min(cursor + CHUNK_SIZE, clean.length);
		let end = hardEnd;

		// Prefer ending near whitespace so chunk boundaries remain readable.
		if (hardEnd < clean.length) {
			const breakpoint = clean.lastIndexOf(" ", hardEnd);
			if (breakpoint > cursor + 150) {
				end = breakpoint;
			}
		}

		const chunk = clean.slice(cursor, end).trim();
		if (chunk) chunks.push(chunk);

		if (end >= clean.length) break;
		cursor = Math.max(end - CHUNK_OVERLAP, cursor + 1);
	}

	return chunks;
}

function inferSourceType(fileName: string, mimeType: string): "pdf" | "txt" {
	const lower = fileName.toLowerCase();
	if (mimeType === "application/pdf" || lower.endsWith(".pdf")) return "pdf";
	return "txt";
}

function sanitizeTags(rawTags: string): string {
	if (!rawTags.trim()) return "";
	const unique = new Set(
		rawTags
			.split(",")
			.map((t) => t.trim().toLowerCase())
			.filter(Boolean)
	);
	return [...unique].join(",");
}

async function extractText(buffer: Buffer, sourceType: "pdf" | "txt"): Promise<string> {
	if (sourceType === "txt") {
		return normalizeWhitespace(buffer.toString("utf8"));
	}

	// Import the parser implementation directly. The package root has a debug
	// wrapper that attempts to read a local test file when loaded in some ESM
	// contexts, which throws ENOENT in Next.js server runtime.
	const parserMod = await import("pdf-parse/lib/pdf-parse.js");
	const parsePdf = (parserMod as unknown as { default?: (input: Buffer) => Promise<{ text: string }> })
		.default;
	if (!parsePdf) {
		throw new Error("PDF parser is unavailable.");
	}

	const parsed = await parsePdf(buffer);
	return normalizeWhitespace(parsed.text || "");
}

export interface PreparedKnowledgeDocument {
	document_id: string;
	source_title: string;
	source_type: "pdf" | "txt";
	tags: string;
	chunk_count: number;
	created_at: string;
	created_by: string;
	chunks: KnowledgeChunk[];
}

export async function prepareKnowledgeChunks(params: {
	fileBuffer: Buffer;
	fileName: string;
	mimeType: string;
	title?: string;
	tags?: string;
	createdBy: string;
}): Promise<PreparedKnowledgeDocument> {
	const { fileBuffer, fileName, mimeType, title = "", tags = "", createdBy } = params;

	const sourceType = inferSourceType(fileName, mimeType);
	const createdAt = new Date().toISOString();
	const sourceTitle = (title || fileName || "Untitled document").trim();
	const documentId = `doc-${Date.now()}-${randomUUID().slice(0, 8)}`;
	const normalizedTags = sanitizeTags(tags);

	const extracted = await extractText(fileBuffer, sourceType);
	const textChunks = splitIntoChunks(extracted);
	if (textChunks.length === 0) {
		throw new Error("No readable text found in the uploaded document.");
	}

	const chunks: KnowledgeChunk[] = textChunks.map((chunkText, index) => ({
		id: `k-${Date.now()}-${index + 1}-${randomUUID().slice(0, 6)}`,
		document_id: documentId,
		source_title: sourceTitle,
		source_type: sourceType,
		page_hint: `${index + 1}`,
		chunk_text: chunkText,
		tags: normalizedTags,
		created_at: createdAt,
		created_by: createdBy,
	}));

	return {
		document_id: documentId,
		source_title: sourceTitle,
		source_type: sourceType,
		tags: normalizedTags,
		chunk_count: chunks.length,
		created_at: createdAt,
		created_by: createdBy,
		chunks,
	};
}
