/**
 * orgType.util.ts
 *
 * Helpers for organisation-type-aware display labels and guards.
 */

export type OrgType = "SCHOOL" | "COMPANY" | "HOSPITAL" | "NGO";

/**
 * Returns the display label for the "member" role based on org type.
 *
 * SCHOOL   → Student
 * COMPANY  → Employee
 * HOSPITAL → Patient
 * NGO      → Member
 */
export function getMemberLabel(orgType: OrgType | string): string {
  switch (orgType) {
    case "COMPANY":  return "Employee";
    case "HOSPITAL": return "Patient";
    case "NGO":      return "Member";
    case "SCHOOL":
    default:         return "Student";
  }
}

/**
 * Returns the display label for the "counselor" role based on org type.
 *
 * SCHOOL   → Counselor
 * COMPANY  → Wellness Coach
 * HOSPITAL → Doctor
 * NGO      → Support Worker
 */
export function getCounselorLabel(orgType: OrgType | string): string {
  switch (orgType) {
    case "COMPANY":  return "Wellness Coach";
    case "HOSPITAL": return "Doctor";
    case "NGO":      return "Support Worker";
    case "SCHOOL":
    default:         return "Counselor";
  }
}

/**
 * Returns true only for org types that support the Parent–Child relationship feature.
 */
export function supportsParentRelationship(orgType: OrgType | string): boolean {
  return orgType === "SCHOOL";
}
