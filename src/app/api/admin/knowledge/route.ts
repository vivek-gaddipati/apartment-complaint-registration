import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import {
	appendKnowledgeChunks,
	deleteKnowledgeDocumentById,
	listKnowledgeDocuments,
} from "@/lib/sheets";
import { MAX_KNOWLEDGE_UPLOAD_BYTES, prepareKnowledgeChunks } from "@/lib/knowledge";

// Keep knowledge reads/writes uncached so admin sees immediate updates.
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function GET() {
	const session = getAdminSession();
	if (!session) {
		return NextResponse.json({ error: "Not signed in as admin." }, { status: 401 });
	}

	try {
		const documents = await listKnowledgeDocuments();
		return NextResponse.json({ documents });
	} catch (err) {
		console.error("Fetch knowledge documents error:", err);
		return NextResponse.json({ error: "Failed to fetch knowledge documents." }, { status: 500 });
	}
}

export async function POST(req: NextRequest) {
	const session = getAdminSession();
	if (!session) {
		return NextResponse.json({ error: "Not signed in as admin." }, { status: 401 });
	}

	try {
		const form = await req.formData();
		const file = form.get("file");
		const title = String(form.get("title") || "").trim();
		const tags = String(form.get("tags") || "").trim();

		if (!(file instanceof File)) {
			return NextResponse.json({ error: "Please select a PDF or TXT file." }, { status: 400 });
		}

		const lowerName = file.name.toLowerCase();
		const isPdf = file.type === "application/pdf" || lowerName.endsWith(".pdf");
		const isTxt = file.type === "text/plain" || lowerName.endsWith(".txt");
		if (!isPdf && !isTxt) {
			return NextResponse.json(
				{ error: "Only PDF and TXT files are supported." },
				{ status: 400 }
			);
		}

		if (file.size <= 0) {
			return NextResponse.json({ error: "Uploaded file is empty." }, { status: 400 });
		}
		if (file.size > MAX_KNOWLEDGE_UPLOAD_BYTES) {
			return NextResponse.json(
				{ error: "File is too large. Max upload size is 25 MB." },
				{ status: 400 }
			);
		}

		const bytes = await file.arrayBuffer();
		const prepared = await prepareKnowledgeChunks({
			fileBuffer: Buffer.from(bytes),
			fileName: file.name,
			mimeType: file.type,
			title,
			tags,
			createdBy: "admin",
		});

		await appendKnowledgeChunks(prepared.chunks);

		return NextResponse.json({
			ok: true,
			document: {
				document_id: prepared.document_id,
				source_title: prepared.source_title,
				source_type: prepared.source_type,
				tags: prepared.tags,
				chunk_count: prepared.chunk_count,
				created_at: prepared.created_at,
				created_by: prepared.created_by,
			},
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : "Failed to process upload.";
		return NextResponse.json({ error: message }, { status: 400 });
	}
}

export async function DELETE(req: NextRequest) {
	const session = getAdminSession();
	if (!session) {
		return NextResponse.json({ error: "Not signed in as admin." }, { status: 401 });
	}

	try {
		const { document_id } = await req.json();
		if (typeof document_id !== "string" || !document_id.trim()) {
			return NextResponse.json({ error: "document_id is required." }, { status: 400 });
		}

		const removed = await deleteKnowledgeDocumentById(document_id.trim());
		return NextResponse.json({ ok: true, removed });
	} catch (err) {
		console.error("Delete knowledge document error:", err);
		return NextResponse.json({ error: "Failed to delete knowledge document." }, { status: 500 });
	}
}
