import { apiFetch } from "@/lib/api/flask-client";

export type SavedNote = {
  id: string;
  title: string | null;
  content: string | null;
  created_at: string;
};

export type SavedFlashcard = {
  id: string;
  question: string | null;
  answer: string | null;
  source: string | null;
  difficulty: "easy" | "medium" | "hard";
  created_at: string;
};

export type PlannerFlashcardInput = {
  front: string;
  back: string;
};

export function getPlannerState(accessToken?: string) {
  return apiFetch<{ notes: SavedNote[]; flashcards: SavedFlashcard[] }>("/api/planner", accessToken);
}

export function savePlannerNote(input: { title: string; content: string }, accessToken?: string) {
  return apiFetch<{ note: SavedNote }>("/api/planner/notes", accessToken, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function savePlannerFlashcards(flashcards: PlannerFlashcardInput[], accessToken?: string) {
  return apiFetch<{ flashcards: SavedFlashcard[] }>("/api/planner/flashcards", accessToken, {
    method: "POST",
    body: JSON.stringify({ flashcards, source: "planner" }),
  });
}

export function askPlannerAi(input: { mode: "summary"; notes: string }, accessToken?: string): Promise<{ summary: string }>;
export function askPlannerAi(input: { mode: "flashcards"; notes: string }, accessToken?: string): Promise<{ flashcards: PlannerFlashcardInput[] }>;
export function askPlannerAi(input: { mode: "summary" | "flashcards"; notes: string }, accessToken?: string) {
  return apiFetch<{ summary?: string; flashcards?: PlannerFlashcardInput[] }>("/api/planner/ai", accessToken, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function deletePlannerFlashcard(id: string, accessToken?: string) {
  return apiFetch<{ ok: boolean }>(`/api/planner/flashcards/${id}`, accessToken, {
    method: "DELETE",
  });
}
