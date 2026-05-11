"use client";

import { useEffect, useMemo, useState } from "react";
import { BookOpen, CheckCircle2, Layers3, PanelRightClose, Sparkles } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { askPlannerAi as askPlannerAiApi, deletePlannerFlashcard, getPlannerState, savePlannerFlashcards, savePlannerNote } from "@/lib/api/planner";
import { createClient } from "@/lib/supabase/client";

type Flashcard = {
  id?: string;
  front: string;
  back: string;
};

type PlannerPanel = "summary" | "notes" | "flashcards" | null;
const noteSuggestions = [
  "Topic:\nKey points:\nQuestions I still have:",
  "Definition:\nExample:\nWhy it matters:",
  "Exam focus:\nImportant formulas or terms:\nThings to revise:",
  "Lecture summary:\nMain idea:\nQuick explanation:",
];

export default function PlannerPage() {
  const [notes, setNotes] = useState("");
  const [summary, setSummary] = useState("");
  const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
  const [savedNotes, setSavedNotes] = useState<{ id: string; title: string | null; content: string | null; created_at: string }[]>([]);
  const [loadingAction, setLoadingAction] = useState<"summary" | "flashcards" | "">("");
  const [loadingPlanner, setLoadingPlanner] = useState(true);
  const [error, setError] = useState("");
  const [activePanel, setActivePanel] = useState<PlannerPanel>(null);

  const wordCount = useMemo(() => notes.trim().split(/\s+/).filter(Boolean).length, [notes]);

  useEffect(() => {
    let cancelled = false;

    async function loadPlanner() {
      try {
        const token = await getAccessToken();
        const data = await getPlannerState(token);
        if (cancelled) return;
        setSavedNotes(data.notes);
        setFlashcards(
          data.flashcards.map((card) => ({
            id: card.id,
            front: card.question || "",
            back: card.answer || "",
          })),
        );
      } catch (caught) {
        if (!cancelled) setError(toFriendlyError(caught));
      } finally {
        if (!cancelled) setLoadingPlanner(false);
      }
    }

    loadPlanner();

    return () => {
      cancelled = true;
    };
  }, []);

  async function getAccessToken() {
    const supabase = createClient();
    const { data } = await supabase.auth.getSession();
    let token = data.session?.access_token;
    if (!token) {
      const refreshed = await supabase.auth.refreshSession();
      token = refreshed.data.session?.access_token;
    }
    if (!token) throw new Error("Please log in again before using the planner.");
    return token;
  }

  async function askPlannerAi(mode: "summary" | "flashcards") {
    if (!notes.trim()) {
      setError("Add your notes first.");
      return;
    }

    setError("");
    setLoadingAction(mode);

    try {
      const token = await getAccessToken();

      if (mode === "summary") {
        const response = await askPlannerAiApi({ mode, notes }, token);
        setSummary(response.summary);
        setActivePanel("summary");
      } else {
        const response = await askPlannerAiApi({ mode, notes }, token);
        const generated = response.flashcards;
        const saved = await savePlannerFlashcards(generated, token);
        setFlashcards((items) => [
          ...saved.flashcards.map((card) => ({ id: card.id, front: card.question || "", back: card.answer || "" })),
          ...items,
        ]);
        setActivePanel("flashcards");
      }
    } catch (caught) {
      setError(toFriendlyError(caught));
    } finally {
      setLoadingAction("");
    }
  }

  function addManualFlashcard() {
    setFlashcards((items) => [{ front: "New question", back: "New answer" }, ...items]);
  }

  function updateFlashcard(index: number, field: keyof Flashcard, value: string) {
    setFlashcards((items) => items.map((item, itemIndex) => (itemIndex === index ? { ...item, [field]: value } : item)));
  }

  async function deleteFlashcard(index: number) {
    const card = flashcards[index];
    setFlashcards((items) => items.filter((_, itemIndex) => itemIndex !== index));
    if (!card.id) return;
    try {
      const token = await getAccessToken();
      await deletePlannerFlashcard(card.id, token);
    } catch (caught) {
      setError(toFriendlyError(caught));
    }
  }

  async function saveCurrentNote() {
    if (!notes.trim()) {
      setError("Add your notes first.");
      return;
    }

    setLoadingAction("summary");
    setError("");
    try {
      const token = await getAccessToken();
      const title = notes.trim().split("\n")[0]?.slice(0, 80) || "Study note";
      const saved = await savePlannerNote({ title, content: notes }, token);
      setSavedNotes((items) => [saved.note, ...items]);
      setActivePanel("notes");
    } catch (caught) {
      setError(toFriendlyError(caught));
    } finally {
      setLoadingAction("");
    }
  }

  function appendNoteSuggestion(suggestion: string) {
    setNotes((current) => current.trim() ? `${current.trim()}\n\n${suggestion}` : suggestion);
  }

  return (
    <AppShell>
      <div className="relative h-[calc(100vh-8rem)] min-h-[650px] overflow-hidden">
        <div className="absolute right-4 top-4 z-20 flex flex-col gap-2">
          <PanelButton active={activePanel === "summary"} label="AI summary" onClick={() => setActivePanel((panel) => panel === "summary" ? null : "summary")}>
            <CheckCircle2 className="size-5" />
          </PanelButton>
          <PanelButton active={activePanel === "notes"} label="Saved notes" onClick={() => setActivePanel((panel) => panel === "notes" ? null : "notes")}>
            <BookOpen className="size-5" />
          </PanelButton>
          <PanelButton active={activePanel === "flashcards"} label="Flashcards" onClick={() => setActivePanel((panel) => panel === "flashcards" ? null : "flashcards")}>
            <Layers3 className="size-5" />
          </PanelButton>
        </div>

      <div className="grid h-full gap-5 overflow-hidden">
        <Card className="flex min-h-0 flex-col overflow-hidden">
          <div className="shrink-0 border-b border-[var(--border-soft)] pb-5">
            <p className="text-sm uppercase tracking-[0.3em] text-mint">Planner</p>
            <h1 className="mt-2 text-3xl font-semibold">Create notes and flashcards with AI help.</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--text-muted)]">
              Write or paste study notes, then ask AI to summarize them or turn them into review cards.
            </p>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto py-5 pr-1">
            <label className="text-sm font-medium text-[var(--text-main)]" htmlFor="study-notes">Study notes</label>
            <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
              {noteSuggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => appendNoteSuggestion(suggestion)}
                  className="shrink-0 rounded-full border border-[var(--border-soft)] bg-[var(--panel-strong)] px-3 py-1.5 text-xs text-[var(--text-muted)] transition hover:border-[var(--accent-soft)] hover:text-[var(--accent)]"
                >
                  {suggestion.split("\n")[0].replace(":", "")}
                </button>
              ))}
            </div>
            <textarea
              id="study-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              className="mt-3 min-h-[360px] w-full resize-y rounded-3xl border border-[var(--border-soft)] bg-[var(--bg-elevated)] p-5 text-sm leading-7 text-[var(--text-main)] outline-none placeholder:text-[var(--text-soft)] focus:border-[var(--accent-soft)]"
              placeholder="Paste lecture notes, handout points, textbook explanations, or your own study notes here..."
            />
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <span className="text-sm text-[var(--text-muted)]">{wordCount} words</span>
              <div className="flex flex-wrap gap-3">
                <Button type="button" variant="outline" onClick={() => askPlannerAi("summary")} disabled={loadingAction !== ""}>
                  <Sparkles className="size-4" />
                  {loadingAction === "summary" ? "Summarizing..." : "Summarize notes"}
                </Button>
                <Button type="button" onClick={() => askPlannerAi("flashcards")} disabled={loadingAction !== ""}>
                  <Layers3 className="size-4" />
                  {loadingAction === "flashcards" ? "Creating..." : "Create flashcards"}
                </Button>
                <Button type="button" variant="outline" onClick={saveCurrentNote} disabled={loadingAction !== ""}>
                  Save note
                </Button>
              </div>
            </div>
            {error ? <p className="mt-4 rounded-2xl border border-red-400/20 bg-red-500/10 p-3 text-sm text-red-200">{error}</p> : null}
          </div>
        </Card>

        <aside className={`absolute inset-y-0 right-0 z-30 w-full max-w-md transition duration-300 ${activePanel ? "translate-x-0 opacity-100" : "pointer-events-none translate-x-8 opacity-0"}`}>
          <Card className="flex h-full min-h-0 flex-col overflow-hidden shadow-glass">
            <div className="flex shrink-0 items-center justify-between border-b border-[var(--border-soft)] pb-4">
              <h2 className="text-2xl font-semibold">{getPanelTitle(activePanel)}</h2>
              <button
                type="button"
                onClick={() => setActivePanel(null)}
                className="grid size-10 place-items-center rounded-full border border-[var(--border-soft)] bg-[var(--panel-strong)] text-[var(--text-main)] transition hover:border-[var(--accent-soft)] hover:text-[var(--accent)]"
                aria-label="Close planner panel"
              >
                <PanelRightClose className="size-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto py-5 pr-1">
              {activePanel === "summary" ? (
                summary ? (
                  <p className="whitespace-pre-wrap text-sm leading-7 text-[var(--text-muted)]">{summary}</p>
                ) : (
                  <EmptyPanelText>Your summary will appear here after you click Summarize notes.</EmptyPanelText>
                )
              ) : null}

              {activePanel === "notes" ? (
                <div className="space-y-3">
                  {loadingPlanner ? (
                    <p className="text-sm text-[var(--text-muted)]">Loading notes...</p>
                  ) : savedNotes.length ? savedNotes.map((note) => (
                    <button
                      key={note.id}
                      type="button"
                      onClick={() => {
                        setNotes(note.content || "");
                        setActivePanel(null);
                      }}
                      className="block w-full rounded-2xl border border-[var(--border-soft)] bg-[var(--bg-elevated)] p-4 text-left transition hover:border-[var(--accent-soft)]"
                    >
                      <p className="font-medium">{note.title || "Study note"}</p>
                      <p className="mt-2 line-clamp-3 text-sm text-[var(--text-muted)]">{note.content}</p>
                    </button>
                  )) : (
                    <EmptyPanelText>No saved notes yet.</EmptyPanelText>
                  )}
                </div>
              ) : null}

              {activePanel === "flashcards" ? (
                <div>
                  <div className="mb-4 flex justify-end">
                    <Button type="button" variant="outline" onClick={addManualFlashcard}>Add card</Button>
                  </div>
                  <div className="space-y-4">
                    {flashcards.length ? flashcards.map((card, index) => (
                      <article key={index} className="rounded-2xl border border-[var(--border-soft)] bg-[var(--bg-elevated)] p-4">
                        <label className="text-xs uppercase tracking-[0.2em] text-[var(--text-soft)]">Front</label>
                        <textarea
                          value={card.front}
                          onChange={(event) => updateFlashcard(index, "front", event.target.value)}
                          className="mt-2 min-h-16 w-full resize-y rounded-2xl border border-[var(--border-soft)] bg-[var(--panel)] p-3 text-sm text-[var(--text-main)] outline-none"
                        />
                        <label className="mt-4 block text-xs uppercase tracking-[0.2em] text-[var(--text-soft)]">Back</label>
                        <textarea
                          value={card.back}
                          onChange={(event) => updateFlashcard(index, "back", event.target.value)}
                          className="mt-2 min-h-20 w-full resize-y rounded-2xl border border-[var(--border-soft)] bg-[var(--panel)] p-3 text-sm text-[var(--text-main)] outline-none"
                        />
                        <button type="button" onClick={() => deleteFlashcard(index)} className="mt-3 text-sm text-red-300 hover:text-red-200">Delete card</button>
                      </article>
                    )) : (
                      <EmptyPanelText>Generated flashcards will appear here. You can edit them after creation.</EmptyPanelText>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          </Card>
        </aside>
        </div>
      </div>
    </AppShell>
  );
}

function PanelButton({ active, children, label, onClick }: { active: boolean; children: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`grid size-12 place-items-center rounded-full border shadow-glass backdrop-blur-xl transition ${active ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]" : "border-[var(--border-soft)] bg-[var(--panel)] text-[var(--text-main)] hover:border-[var(--accent-soft)] hover:text-[var(--accent)]"}`}
      aria-label={label}
      title={label}
    >
      {children}
    </button>
  );
}

function EmptyPanelText({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-2xl border border-[var(--border-soft)] bg-[var(--bg-elevated)] p-4 text-sm leading-6 text-[var(--text-muted)]">
      {children}
    </p>
  );
}

function getPanelTitle(panel: PlannerPanel) {
  if (panel === "summary") return "AI summary";
  if (panel === "notes") return "Saved notes";
  if (panel === "flashcards") return "Flashcards";
  return "Planner";
}

function toFriendlyError(caught: unknown) {
  const message = caught instanceof Error ? caught.message : "Could not complete that action.";
  if (message === "Invalid token" || message === "Unauthorized") {
    return "Your login session expired. Please log out, log in again, and retry.";
  }
  return message;
}
