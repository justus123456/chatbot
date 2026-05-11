import { apiFetch } from "@/lib/api/flask-client";
import type { PaginatedResponse } from "@/lib/types";

export type Goal = {
  id: string;
  user_id: string;
  goal_text: string;
  title: string | null;
  description: string | null;
  progress: number;
  deadline: string | null;
  status: "pending" | "in_progress" | "completed" | "overdue";
  target_value: number;
  current_value: number;
  unit: string;
  created_at: string;
  items?: GoalItem[];
};

export type GoalItem = {
  id: string;
  goal_id: string;
  title: string;
  is_completed: boolean;
  created_at: string;
};

export type GoalInput = {
  title: string;
  description: string;
  deadline: string;
  target_value: number;
  current_value: number;
  unit: string;
  items: string[];
};

export function getGoals(accessToken?: string) {
  return apiFetch<PaginatedResponse<Goal>>("/api/goals", accessToken);
}

export function createGoal(input: GoalInput, accessToken?: string) {
  return apiFetch<{ goal: Goal }>("/api/goals", accessToken, {
    method: "POST",
    body: JSON.stringify({
      ...input,
      target_value: input.items.length || 1,
      current_value: 0,
      unit: "task",
      progress: 0,
      status: "pending",
    }),
  });
}

export function updateGoal(id: string, updates: Partial<Goal>, accessToken?: string) {
  return apiFetch<{ goal: Goal }>(`/api/goals/${id}`, accessToken, {
    method: "PATCH",
    body: JSON.stringify(updates),
  });
}

export function deleteGoal(id: string, accessToken?: string) {
  return apiFetch<{ ok: boolean }>(`/api/goals/${id}`, accessToken, {
    method: "DELETE",
  });
}

export function updateGoalItem(goalId: string, itemId: string, updates: Partial<GoalItem>, accessToken?: string) {
  return apiFetch<{ item: GoalItem }>(`/api/goals/${goalId}/items/${itemId}`, accessToken, {
    method: "PATCH",
    body: JSON.stringify(updates),
  });
}

export function calculateProgress(currentValue: number, targetValue: number) {
  if (!targetValue) return 0;
  return Math.max(0, Math.min(100, Math.round((currentValue / targetValue) * 100)));
}
