/**
 * Bulk-enrollment role vocabulary per organisation type.
 *
 * The platform only has two underlying role tiers for org members —
 * STUDENT (member tier) and COUNSELOR (support tier) — but each org type
 * has its own name for them (see lib/orgTheme.js on the frontend, which
 * this mirrors). Bulk-upload spreadsheets should accept the org's own
 * vocabulary in the `role` column instead of forcing every org to type
 * school-specific values like "STUDENT".
 */

type RoleTier = "STUDENT" | "COUNSELOR";

const ORG_ROLE_LABELS: Record<string, { member: string; support: string }> = {
  SCHOOL:   { member: "STUDENT",  support: "COUNSELOR" },
  COMPANY:  { member: "EMPLOYEE", support: "WELLNESS COACH" },
  HOSPITAL: { member: "STAFF",    support: "THERAPIST" },
  NGO:      { member: "MEMBER",   support: "SUPPORT WORKER" },
};

const DEFAULT_LABELS = ORG_ROLE_LABELS.SCHOOL;

// Extra recognized synonyms beyond the primary label, keyed by tier.
const SYNONYMS: Record<RoleTier, string[]> = {
  STUDENT: ["STUDENT", "STUDENTS", "EMPLOYEE", "EMPLOYEES", "STAFF", "MEMBER", "MEMBERS"],
  COUNSELOR: [
    "COUNSELOR", "COUNSELORS", "COUNSELLOR", "COUNSELLORS",
    "WELLNESS COACH", "WELLNESS COACHES", "COACH", "COACHES",
    "THERAPIST", "THERAPISTS",
    "SUPPORT WORKER", "SUPPORT WORKERS",
  ],
};

function normalize(value: string): string {
  return value.trim().toUpperCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

export function getOrgRoleLabels(orgType: string | undefined | null) {
  return ORG_ROLE_LABELS[orgType ?? ""] ?? DEFAULT_LABELS;
}

/**
 * Resolve a raw spreadsheet "role" cell to the underlying role tier,
 * accepting the org's own vocabulary, common synonyms, and the raw
 * underlying tier names as an escape hatch. Returns null if unrecognized.
 */
export function resolveRoleAlias(
  orgType: string | undefined | null,
  rawValue: string,
): RoleTier | null {
  if (!rawValue) return null;
  const normalized = normalize(rawValue);
  const labels = getOrgRoleLabels(orgType);

  if (normalized === normalize(labels.member) || SYNONYMS.STUDENT.includes(normalized)) {
    return "STUDENT";
  }
  if (normalized === normalize(labels.support) || SYNONYMS.COUNSELOR.includes(normalized)) {
    return "COUNSELOR";
  }
  return null;
}

export function acceptedRoleValuesDescription(orgType: string | undefined | null): string {
  const labels = getOrgRoleLabels(orgType);
  return `${labels.member} or ${labels.support}`;
}
