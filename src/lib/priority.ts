import type { Category, Priority } from "./types";

/** Auto-suggested starting priority by category. Admin can always override. */
const CATEGORY_PRIORITY: Record<string, Priority> = {
  Security: "High",
  Electrical: "High",
  Plumbing: "Medium",
  Lift: "High",
  Parking: "Low",
  Noise: "Low",
  "Common Area": "Medium",
  Housekeeping: "Low",
  Other: "Medium",
};

export function suggestPriority(category: Category | string): Priority {
  return CATEGORY_PRIORITY[category] ?? "Medium";
}
