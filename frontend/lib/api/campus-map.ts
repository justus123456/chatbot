import { apiFetch } from "@/lib/api/flask-client";

export type CampusLocation = {
  id: string;
  location_name: string;
  description?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  category?: string | null;
  created_at?: string | null;
};

export function getCampusLocations(accessToken?: string) {
  return apiFetch<{ data: CampusLocation[]; total: number }>("/api/campus-map", accessToken);
}

export function createCampusLocation(location: Omit<CampusLocation, "id" | "created_at">, accessToken?: string) {
  return apiFetch<{ location: CampusLocation }>("/api/campus-map", accessToken, {
    method: "POST",
    body: JSON.stringify(location),
  });
}

export function updateCampusLocation(id: string, location: Partial<Omit<CampusLocation, "id" | "created_at">>, accessToken?: string) {
  return apiFetch<{ location: CampusLocation }>(`/api/campus-map/${id}`, accessToken, {
    method: "PATCH",
    body: JSON.stringify(location),
  });
}

export function deleteCampusLocation(id: string, accessToken?: string) {
  return apiFetch<{ ok: boolean }>(`/api/campus-map/${id}`, accessToken, { method: "DELETE" });
}
