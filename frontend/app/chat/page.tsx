"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { MessageSquarePlus, PanelRightClose, PanelRightOpen, Paperclip, Send, Trash2 } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { UploadDocumentForm } from "@/components/documents/upload-document-form";
import { deleteChat, getChatHistory, sendChatMessage } from "@/lib/api/chat";
import { getFreshAccessToken } from "@/lib/api/admin";
import { getChatSuggestions } from "@/lib/api/personalization";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { UploadDocumentResponse } from "@/lib/api/documents";

type DisplayMessage = {
  role: "assistant" | "user";
  text: string;
};

type SavedChat = {
  id: string;
  message: string;
  response: string;
  created_at: string;
};

type ChatSession = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  messages: DisplayMessage[];
  chatIds: string[];
};

const welcomeMessage: DisplayMessage = {
  role: "assistant",
  text: "Ask me about registration, fees, hostel, clearance, calendar, or upload a document and ask me questions about it.",
};

const storagePrefix = "smartcampus-chat-sessions";
const activeStoragePrefix = "smartcampus-active-chat";
const chatSuggestions = [
  "How do I register my courses?",
  "What school fees do I need to pay?",
  "Explain this note simply",
  "Summarize my uploaded document",
  "What deadlines should I remember?",
];

export default function ChatPage() {
  const [messages, setMessages] = useState<DisplayMessage[]>([welcomeMessage]);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState("");
  const [historyOpen, setHistoryOpen] = useState(true);
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);
  const [openedSessionId, setOpenedSessionId] = useState<string | null>(null);
  const [currentChatIds, setCurrentChatIds] = useState<string[]>([]);
  const [storageKey, setStorageKey] = useState<string | null>(null);
  const [activeStorageKey, setActiveStorageKey] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [showUploader, setShowUploader] = useState(false);
  const [suggestions, setSuggestions] = useState(chatSuggestions);
  const feedRef = useRef<HTMLDivElement>(null);
  const messageInputRef = useRef<HTMLInputElement>(null);
  const sendingRef = useRef(false);

  useEffect(() => {
    async function loadHistory() {
      setHistoryLoading(true);
      setHistoryError("");
      try {
        const supabase = createClient();
        const { data } = await supabase.auth.getSession();
        const userId = data.session?.user.id || "guest";
        const sessionsKey = `${storagePrefix}:${userId}`;
        const activeKey = `${activeStoragePrefix}:${userId}`;
        setStorageKey(sessionsKey);
        setActiveStorageKey(activeKey);

        const storedSessions = readSessions(sessionsKey);
        const activeSession = readActiveSession(activeKey);
        const localSessions = activeSession && activeSession.messages.length > 1
          ? mergeSessions([activeSession, ...storedSessions], [])
          : storedSessions;

        try {
          const result = await withFreshTokenRetry((token) => getChatHistory(token));
          const knownChatIds = new Set(localSessions.flatMap((session) => session.chatIds));
          const legacySessions = result.data
            .filter((chat) => !knownChatIds.has(chat.id))
            .map((chat) => sessionFromChats([chat]));

          const nextSessions = mergeSessions(localSessions, legacySessions);
          setSessions(nextSessions);
          saveSessions(sessionsKey, nextSessions);
          if (activeSession && activeSession.messages.length > 1) {
            window.localStorage.removeItem(activeKey);
          }
          return;
        } catch {
          setHistoryError("Could not sync server chat history yet. Local saved chats are still available.");
          setSessions(localSessions);
          saveSessions(sessionsKey, localSessions);
          return;
        }
      } catch {
        setHistoryError("Could not load saved chats yet. Please refresh after your login session finishes loading.");
      } finally {
        setHistoryLoading(false);
      }
    }

    loadHistory();
  }, []);

  useEffect(() => {
    async function loadSuggestions() {
      try {
        const result = await withFreshTokenRetry((token) => getChatSuggestions(token));
        if (result.suggestions?.length) {
          setSuggestions(mergeSuggestionLists(result.suggestions, chatSuggestions).slice(0, 8));
        }
      } catch {
        setSuggestions(chatSuggestions);
      }
    }

    loadSuggestions();
  }, []);

  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight });
  }, [messages]);

  const recentSessions = useMemo(() => [...sessions].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 12), [sessions]);

  function startNewChat() {
    archiveActiveSession();
    setMessages([welcomeMessage]);
    setShowUploader(false);
    setOpenedSessionId(null);
    setCurrentChatIds([]);
    if (activeStorageKey) {
      window.localStorage.removeItem(activeStorageKey);
    }
  }

  function openPreviousSession(session: ChatSession) {
    archiveActiveSession();
    setMessages(session.messages);
    setCurrentChatIds(session.chatIds);
    setOpenedSessionId(session.id);
    setShowUploader(false);
  }

  function archiveActiveSession() {
    if (!storageKey || messages.length <= 1 || !messages.some((message) => message.role === "user")) return;

    const session = buildSession(messages, currentChatIds);
    const nextSessions = mergeSessions([session, ...sessions.filter((item) => item.id !== openedSessionId)], []);
    setSessions(nextSessions);
    saveSessions(storageKey, nextSessions);
  }

  async function handleDeleteSession(session: ChatSession) {
    setDeletingSessionId(session.id);
    try {
      await Promise.all(session.chatIds.map((chatId) => withFreshTokenRetry((token) => deleteChat(chatId, token))));
    } catch {
      setHistoryError("Could not delete this chat from the server yet. It was removed from this browser.");
    } finally {
      const nextSessions = sessions.filter((item) => item.id !== session.id);
      setSessions(nextSessions);
      if (storageKey) saveSessions(storageKey, nextSessions);
      if (openedSessionId === session.id) {
        setMessages([welcomeMessage]);
        setCurrentChatIds([]);
        setOpenedSessionId(null);
      }
      setDeletingSessionId(null);
    }
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sendingRef.current) return;
    const form = event.currentTarget;
    const formData = new FormData(form);
    const text = String(formData.get("message") || "").trim();
    if (!text) return;
    sendingRef.current = true;
    form.reset();
    setMessages((items) => [...items, { role: "user", text }]);
    setIsSending(true);

    try {
      const response = await withFreshTokenRetry((token) => sendChatMessage(text, token));
      const responseMessage: DisplayMessage = {
        role: "assistant",
        text: response.response,
      };
      const nextMessages = [
        ...messages,
        { role: "user" as const, text },
        responseMessage,
      ];
      const nextChatIds = response.id ? [...currentChatIds, response.id] : currentChatIds;
      setCurrentChatIds(nextChatIds);
      if (activeStorageKey) {
        saveActiveSession(activeStorageKey, buildSession(nextMessages, nextChatIds, openedSessionId || undefined));
      }
      setMessages((items) => [
        ...items,
        responseMessage,
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "The Flask API is not available yet.";
      setMessages((items) => [...items, { role: "assistant", text: `I could not reach the RAG API yet. ${message}` }]);
    } finally {
      setIsSending(false);
      sendingRef.current = false;
    }
  }

  function handleDocumentUploaded(result: UploadDocumentResponse) {
    setShowUploader(false);
    setMessages((items) => [
      ...items,
      {
        role: "assistant",
        text: `I have added "${result.document.title}" to your study context. Ask me anything from that document and I will use it in my answer.`,
      },
    ]);
  }

  function useChatSuggestion(suggestion: string) {
    if (!messageInputRef.current) return;
    messageInputRef.current.value = suggestion;
    messageInputRef.current.focus();
  }

  return (
    <AppShell>
      <div className={cn("grid h-[calc(100vh-8rem)] min-h-[620px] gap-5 overflow-hidden transition-[grid-template-columns] duration-300", historyOpen ? "lg:grid-cols-[minmax(0,1fr)_320px]" : "lg:grid-cols-[minmax(0,1fr)_0px]")}>
        <Card className="flex min-h-0 flex-col overflow-hidden">
          <div className="shrink-0 border-b border-[var(--border-soft)] pb-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.3em] text-mint">SmartCampus Chat</p>
                <h2 className="mt-2 text-2xl font-semibold">Ask questions or chat with a file</h2>
                <p className="mt-3 text-sm text-[var(--text-muted)]">You can upload a lecture note, handout, or text file here and then ask questions from it like a normal conversation.</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={startNewChat}
                  className="inline-flex items-center gap-2 rounded-full border border-[var(--border-soft)] bg-[var(--panel-strong)] px-4 py-2 text-sm font-semibold text-[var(--text-main)] transition hover:border-[var(--accent-soft)] hover:text-[var(--accent)]"
                >
                  <MessageSquarePlus className="size-4" />
                  New chat
                </button>
                <button
                  type="button"
                  onClick={() => setHistoryOpen((current) => !current)}
                  className="grid size-10 place-items-center rounded-full border border-[var(--border-soft)] bg-[var(--panel-strong)] text-[var(--text-main)] transition hover:border-[var(--accent-soft)] hover:text-[var(--accent)]"
                  aria-label={historyOpen ? "Close previous chats" : "Open previous chats"}
                  title={historyOpen ? "Close previous chats" : "Open previous chats"}
                >
                  {historyOpen ? <PanelRightClose className="size-4" /> : <PanelRightOpen className="size-4" />}
                </button>
              </div>
            </div>
          </div>
          <div ref={feedRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto py-6 pr-1">
            {messages.map((message, index) => (
              <div key={index} className={message.role === "user" ? "text-right" : "text-left"}>
                <span className={`inline-block max-w-[75%] rounded-3xl border px-5 py-3 text-sm shadow-[0_14px_35px_rgba(0,0,0,0.08)] ${message.role === "user" ? "border-transparent bg-mint text-ink" : "border-[var(--border-soft)] bg-[var(--bg-elevated)] text-[var(--text-main)]"}`}>
                  {message.text}
                </span>
              </div>
            ))}
            {isSending ? <TypingIndicator /> : null}
          </div>
          {showUploader ? (
            <div className="mb-4 max-h-72 shrink-0 overflow-y-auto rounded-3xl border border-mint/15 bg-mint/5 p-4">
              <UploadDocumentForm embedded onUploaded={handleDocumentUploaded} />
            </div>
          ) : null}
          <div className="mb-3 flex shrink-0 gap-2 overflow-x-auto pb-1">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => useChatSuggestion(suggestion)}
                className="shrink-0 rounded-full border border-[var(--border-soft)] bg-[var(--panel-strong)] px-3 py-1.5 text-xs text-[var(--text-muted)] transition hover:border-[var(--accent-soft)] hover:text-[var(--accent)]"
              >
                {suggestion}
              </button>
            ))}
          </div>
          <form onSubmit={sendMessage} className="shrink-0 flex gap-3 rounded-full border border-[var(--border-soft)] bg-[var(--panel-strong)] p-2">
            <button
              type="button"
              onClick={() => setShowUploader((current) => !current)}
              className="grid size-11 place-items-center rounded-full border border-[var(--border-soft)] bg-[var(--bg-elevated)] text-[var(--accent)] transition hover:border-[var(--accent-soft)] hover:bg-[var(--accent-soft)] hover:text-[var(--text-main)]"
              aria-label="Attach document"
              title="Attach document"
            >
              <Paperclip className="size-4" />
            </button>
            <input ref={messageInputRef} name="message" list="chat-message-suggestions" className="min-w-0 flex-1 bg-transparent px-4 text-sm text-[var(--text-main)] outline-none placeholder:text-[var(--text-soft)]" placeholder="Ask SmartCampus..." />
            <datalist id="chat-message-suggestions">
              {suggestions.map((suggestion) => <option key={suggestion} value={suggestion} />)}
            </datalist>
            <Button type="submit" disabled={isSending}>{isSending ? "..." : <Send className="size-4" />}</Button>
          </form>
        </Card>
        <Card className={cn("hidden min-h-0 flex-col overflow-hidden transition-opacity duration-300 lg:flex", !historyOpen && "pointer-events-none opacity-0")}>
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-xl font-semibold">Previous chats</h3>
            <button
              type="button"
              onClick={() => setHistoryOpen(false)}
              className="grid size-9 place-items-center rounded-full border border-[var(--border-soft)] bg-[var(--panel-strong)] text-[var(--text-main)] transition hover:border-[var(--accent-soft)] hover:text-[var(--accent)]"
              aria-label="Close previous chats"
              title="Close previous chats"
            >
              <PanelRightClose className="size-4" />
            </button>
          </div>
          <div className="mt-5 min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
            {historyError ? (
              <p className="rounded-2xl border border-amber-300/30 bg-amber-400/10 p-3 text-sm leading-6 text-amber-100">{historyError}</p>
            ) : null}
            {historyLoading ? (
              <p className="text-sm text-[var(--text-muted)]">Loading chats...</p>
            ) : recentSessions.length ? (
              recentSessions.map((session) => (
                <div
                  key={session.id}
                  className={cn(
                    "group flex gap-2 rounded-2xl border border-[var(--border-soft)] bg-[var(--bg-elevated)] p-3 transition hover:border-[var(--accent-soft)] hover:bg-[var(--panel-strong)]",
                    openedSessionId === session.id && "border-[var(--accent-soft)] bg-[var(--accent-soft)]",
                  )}
                >
                  <button type="button" onClick={() => openPreviousSession(session)} className="min-w-0 flex-1 text-left">
                    <p className="line-clamp-2 text-sm font-medium text-[var(--text-main)]">{session.title}</p>
                    <p className="mt-2 text-xs text-[var(--text-soft)]">{session.chatIds.length} message{session.chatIds.length === 1 ? "" : "s"}</p>
                    <p className="mt-2 line-clamp-2 text-xs leading-5 text-[var(--text-muted)]">{session.messages.at(-1)?.text}</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteSession(session)}
                    disabled={deletingSessionId === session.id}
                    className="grid size-8 shrink-0 place-items-center rounded-full border border-[var(--border-soft)] text-[var(--text-muted)] opacity-100 transition hover:border-red-400/40 hover:bg-red-500/10 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-50 lg:opacity-0 lg:group-hover:opacity-100"
                    aria-label="Delete previous chat session"
                    title="Delete previous chat session"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              ))
            ) : (
              <p className="text-sm leading-6 text-[var(--text-muted)]">Your saved chats will appear here after you send a message.</p>
            )}
          </div>
        </Card>
      </div>
    </AppShell>
  );
}

async function withFreshTokenRetry<T>(requester: (token: string) => Promise<T>) {
  try {
    return await requester(await getFreshAccessToken());
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    if (!message.includes("invalid token") && !message.includes("unauthorized")) {
      throw error;
    }
    return requester(await getFreshAccessToken(true));
  }
}

function TypingIndicator() {
  return (
    <div className="text-left">
      <span className="inline-flex items-center gap-1 rounded-3xl border border-[var(--border-soft)] bg-[var(--bg-elevated)] px-5 py-4 shadow-[0_14px_35px_rgba(0,0,0,0.08)]" aria-label="SmartCampus is typing">
        <span className="size-2 animate-bounce rounded-full bg-[var(--accent)] [animation-delay:-0.24s]" />
        <span className="size-2 animate-bounce rounded-full bg-[var(--accent)] [animation-delay:-0.12s]" />
        <span className="size-2 animate-bounce rounded-full bg-[var(--accent)]" />
      </span>
    </div>
  );
}

function readSessions(key: string): ChatSession[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveSessions(key: string, sessions: ChatSession[]) {
  window.localStorage.setItem(key, JSON.stringify(sessions));
}

function readActiveSession(key: string): ChatSession | null {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) || "null");
    return parsed && Array.isArray(parsed.messages) ? parsed : null;
  } catch {
    return null;
  }
}

function saveActiveSession(key: string, session: ChatSession) {
  window.localStorage.setItem(key, JSON.stringify(session));
}

function mergeSuggestionLists(primary: string[], fallback: string[]) {
  const seen = new Set<string>();
  return [...primary, ...fallback].filter((item) => {
    const normalized = item.trim().toLowerCase();
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

function sessionFromChats(chats: SavedChat[]): ChatSession {
  const messages = [
    welcomeMessage,
    ...chats.flatMap((chat) => [
      { role: "user" as const, text: chat.message },
      { role: "assistant" as const, text: chat.response },
    ]),
  ];
  return buildSession(messages, chats.map((chat) => chat.id), chats[0]?.id);
}

function buildSession(messages: DisplayMessage[], chatIds: string[], existingId?: string): ChatSession {
  const firstQuestion = messages.find((message) => message.role === "user")?.text || "New chat";
  const now = new Date().toISOString();
  return {
    id: existingId || `session-${Date.now()}`,
    title: firstQuestion.length > 54 ? `${firstQuestion.slice(0, 54)}...` : firstQuestion,
    created_at: now,
    updated_at: now,
    messages,
    chatIds,
  };
}

function mergeSessions(primary: ChatSession[], fallback: ChatSession[]) {
  const seen = new Set<string>();
  return [...primary, ...fallback].filter((session) => {
    const key = session.id || session.chatIds.join(",");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
