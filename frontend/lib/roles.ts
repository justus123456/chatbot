import type { UserRole } from "@/lib/types";

export const staffRoles: UserRole[] = ["lecturer", "admin", "dean"];

export function canAccessAdmin(role?: string | null) {
  return role === "admin" || role === "dean";
}

export function canAccessLecturer(role?: string | null) {
  return role === "lecturer";
}

export function canAccessDean(role?: string | null) {
  return role === "dean";
}

export function getRoleHome(role?: string | null, isProfileComplete = false) {
  if (role === "dean") return "/dean";
  if (role === "admin") return "/admin";
  if (role === "lecturer") return "/lecturer";
  return isProfileComplete ? "/dashboard" : "/complete-profile";
}

export function isStaffRole(role?: string | null) {
  return staffRoles.includes(role as UserRole);
}
