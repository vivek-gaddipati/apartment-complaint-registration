"use client";

import { FormEvent, useRef, useState } from "react";
import Link from "next/link";
import { KnowledgeDocument } from "@/lib/types";

export default function AdminAssistantClient({
	initialDocuments,
}: {
	initialDocuments: KnowledgeDocument[];
}) {
	const [documents, setDocuments] = useState(initialDocuments);
	const [title, setTitle] = useState("");
	const [tags, setTags] = useState("");
	const [selectedFile, setSelectedFile] = useState<File | null>(null);
	const [uploading, setUploading] = useState(false);
	const [deletingId, setDeletingId] = useState<string | null>(null);
	const [error, setError] = useState("");
	const [toastMessage, setToastMessage] = useState<string | null>(null);
	const fileInputRef = useRef<HTMLInputElement | null>(null);

	function showToast(message: string) {
		setToastMessage(message);
		setTimeout(() => setToastMessage(null), 3000);
	}

	async function handleUpload(e: FormEvent) {
		e.preventDefault();
		setError("");

		if (!selectedFile) {
			setError("Please choose a PDF or TXT file to upload.");
			return;
		}

		setUploading(true);
		try {
			const form = new FormData();
			form.append("file", selectedFile);
			form.append("title", title.trim());
			form.append("tags", tags.trim());

			const res = await fetch("/api/admin/knowledge", {
				method: "POST",
				body: form,
			});
			const data = await res.json();
			if (!res.ok) {
				setError(data.error || "Upload failed.");
				return;
			}

			setDocuments((prev) => [data.document, ...prev]);
			setTitle("");
			setTags("");
			setSelectedFile(null);
			if (fileInputRef.current) fileInputRef.current.value = "";
			showToast(`Uploaded ${data.document.source_title}.`);
		} catch {
			setError("Network error. Please try again.");
		} finally {
			setUploading(false);
		}
	}

	async function handleDelete(documentId: string) {
		setDeletingId(documentId);
		setError("");
		try {
			const res = await fetch("/api/admin/knowledge", {
				method: "DELETE",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ document_id: documentId }),
			});
			const data = await res.json();
			if (!res.ok) {
				setError(data.error || "Failed to delete document.");
				return;
			}

			setDocuments((prev) => prev.filter((d) => d.document_id !== documentId));
			showToast(`Removed ${data.removed} chunk(s).`);
		} catch {
			setError("Network error. Please try again.");
		} finally {
			setDeletingId(null);
		}
	}

	return (
		<main className="flex flex-1 flex-col py-4">
			{toastMessage && (
				<div className="fixed top-6 right-6 z-50 rounded-xl border border-sky-500/30 bg-slate-900/90 px-4 py-3 text-xs font-semibold text-sky-300 shadow-xl backdrop-blur-md">
					⚡ {toastMessage}
				</div>
			)}

			<div className="glass-panel mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl p-5 shadow-xl">
				<div>
					<Link
						href="/admin/dashboard"
						className="mb-2 inline-flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-white transition"
					>
						← Back to Dashboard
					</Link>
					<h1 className="text-xl font-bold text-white leading-tight">Knowledge Documents</h1>
					<p className="text-xs text-slate-400 font-medium">
						Upload policy manuals or notices for the admin knowledge base.
					</p>
				</div>
			</div>

			<div className="glass-panel mb-4 rounded-2xl p-4">
				<form onSubmit={handleUpload} className="flex flex-col gap-3">
					<div className="grid gap-3 sm:grid-cols-2">
						<div>
							<label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-300">
								Document Title (optional)
							</label>
							<input
								value={title}
								onChange={(e) => setTitle(e.target.value)}
								placeholder="Society handbook 2026"
								className="input-dark w-full rounded-xl px-3 py-2 text-xs text-white"
							/>
						</div>
						<div>
							<label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-300">
								Tags (comma separated)
							</label>
							<input
								value={tags}
								onChange={(e) => setTags(e.target.value)}
								placeholder="parking, security, visitor"
								className="input-dark w-full rounded-xl px-3 py-2 text-xs text-white"
							/>
						</div>
					</div>

					<div>
						<label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-300">
							Upload File (PDF or TXT, max 25 MB)
						</label>
						<input
							ref={fileInputRef}
							type="file"
							accept=".pdf,.txt,application/pdf,text/plain"
							onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
							className="input-dark w-full rounded-xl px-3 py-2 text-xs text-white file:mr-3 file:rounded-lg file:border-0 file:bg-sky-600 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white hover:file:bg-sky-500"
						/>
					</div>

					<div className="flex items-center justify-between gap-3">
						<p className="text-[11px] text-slate-400">
							Each upload is split into searchable chunks and written to the KnowledgeBase sheet.
						</p>
						<button
							type="submit"
							disabled={uploading}
							className="rounded-xl bg-gradient-to-r from-sky-600 to-blue-600 px-4 py-2 text-xs font-bold text-white shadow-md shadow-sky-600/30 hover:from-sky-500 hover:to-blue-500 transition disabled:opacity-50"
						>
							{uploading ? "Uploading..." : "⬆ Upload Document"}
						</button>
					</div>
				</form>
				{error && (
					<div className="mt-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-400">
						{error}
					</div>
				)}
			</div>

			<div className="overflow-hidden rounded-2xl glass-panel">
				<div className="overflow-x-auto">
					<table className="w-full text-left text-xs">
						<thead className="border-b border-slate-800 bg-slate-900/80 uppercase tracking-wider text-slate-400 font-semibold">
							<tr>
								<th className="px-4 py-3.5">Title</th>
								<th className="px-4 py-3.5">Type</th>
								<th className="px-4 py-3.5">Tags</th>
								<th className="px-4 py-3.5">Chunks</th>
								<th className="px-4 py-3.5">Uploaded</th>
								<th className="px-4 py-3.5">Action</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-slate-800/60">
							{documents.map((doc) => (
								<tr key={doc.document_id} className="hover:bg-slate-800/30 transition align-top">
									<td className="px-4 py-3 font-semibold text-white">{doc.source_title}</td>
									<td className="px-4 py-3 text-slate-300 uppercase">{doc.source_type}</td>
									<td className="px-4 py-3 text-slate-300">{doc.tags || "-"}</td>
									<td className="px-4 py-3 text-slate-300">{doc.chunk_count}</td>
									<td className="px-4 py-3 text-slate-400">
										{new Date(doc.created_at).toLocaleDateString()}
									</td>
									<td className="px-4 py-3">
										<button
											onClick={() => handleDelete(doc.document_id)}
											disabled={deletingId === doc.document_id}
											className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-300 hover:bg-rose-500/20 transition disabled:opacity-50"
										>
											{deletingId === doc.document_id ? "Removing..." : "Delete"}
										</button>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>

				{documents.length === 0 && (
					<div className="p-10 text-center text-slate-400">No knowledge documents uploaded yet.</div>
				)}
			</div>
		</main>
	);
}
