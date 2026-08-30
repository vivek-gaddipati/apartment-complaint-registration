export const CATEGORIES = [
  "Plumbing",
  "Electrical",
  "Security",
  "Parking",
  "Noise",
  "Common Area",
  "Lift",
  "Housekeeping",
  "Other",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const STATUSES = [
  "Open",
  "Acknowledged",
  "In Progress",
  "Resolved",
  "Closed",
  "Reopened",
] as const;
export type Status = (typeof STATUSES)[number];

export const PRIORITIES = ["Low", "Medium", "High"] as const;
export type Priority = (typeof PRIORITIES)[number];

export interface Complaint {
  id: string;
  timestamp: string;
  flat_no: string;
  owner_name: string;
  category: Category | string;
  description: string;
  photo_url: string;
  status: Status | string;
  priority: Priority | string;
  assigned_to: string;
  admin_notes: string;
  resolved_at: string;
  owner_rating: string;
}

export interface Owner {
  flat_no: string;
  owner_name: string;
  pin: string;
  phone: string;
  /** 0-based row index within the Owners sheet data (excluding header) */
  rowIndex: number;
}

/** Column order for the Complaints sheet tab — must match the spec exactly. */
export const COMPLAINT_COLUMNS: (keyof Complaint)[] = [
  "id",
  "timestamp",
  "flat_no",
  "owner_name",
  "category",
  "description",
  "photo_url",
  "status",
  "priority",
  "assigned_to",
  "admin_notes",
  "resolved_at",
  "owner_rating",
];

export const OWNER_COLUMNS: (keyof Owner)[] = [
  "flat_no",
  "owner_name",
  "pin",
  "phone",
];

export interface KnowledgeChunk {
  id: string;
  document_id: string;
  source_title: string;
  source_type: string;
  page_hint: string;
  chunk_text: string;
  tags: string;
  created_at: string;
  created_by: string;
}

export interface KnowledgeDocument {
  document_id: string;
  source_title: string;
  source_type: string;
  tags: string;
  chunk_count: number;
  created_at: string;
  created_by: string;
}

export const KNOWLEDGE_COLUMNS: (keyof KnowledgeChunk)[] = [
  "id",
  "document_id",
  "source_title",
  "source_type",
  "page_hint",
  "chunk_text",
  "tags",
  "created_at",
  "created_by",
];
