"use client";

import { forwardRef, type ReactNode, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ChevronDown, Circle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api/flask-client";
import { getRoleHome, isStaffRole } from "@/lib/roles";
import { createClient } from "@/lib/supabase/client";

type SectionId = "academic" | "contact" | "preferences";

type ProfileState = {
  department: string;
  level: string;
  matric_number: string;
  phone: string;
  preferred_language: "en" | "pidgin";
  preferred_tone: "formal" | "simple";
};

const initialState: ProfileState = {
  department: "",
  level: "",
  matric_number: "",
  phone: "",
  preferred_language: "en",
  preferred_tone: "simple",
};

type Step = {
  id: SectionId;
  title: string;
  description: string;
  complete: boolean;
  cta: string;
};

export function ProfileForm() {
  const router = useRouter();
  const academicRef = useRef<HTMLDivElement | null>(null);
  const contactRef = useRef<HTMLDivElement | null>(null);
  const preferencesRef = useRef<HTMLDivElement | null>(null);

  const [form, setForm] = useState<ProfileState>(initialState);
  const [expanded, setExpanded] = useState<SectionId>("academic");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const steps: Step[] = useMemo(() => {
    const academicComplete = Boolean(form.department && form.level && form.matric_number);
    const contactComplete = Boolean(form.phone);
    const preferencesComplete = Boolean(form.preferred_language && form.preferred_tone);

    return [
      {
        id: "academic",
        title: "Academic profile",
        description: "Tell us your department, level, and matric number so your dashboard feels like it belongs to your class.",
        complete: academicComplete,
        cta: "Add academic details",
      },
      {
        id: "contact",
        title: "Contact and alerts",
        description: "Save your phone number so reminders, escalations, and WhatsApp support can reach the right student.",
        complete: contactComplete,
        cta: "Add phone number",
      },
      {
        id: "preferences",
        title: "App preferences",
        description: "Choose how SmartCampus talks to you, from simple explanations to more formal academic wording.",
        complete: preferencesComplete,
        cta: "Set your preferences",
      },
    ];
  }, [form]);

  const completedCount = steps.filter((step) => step.complete).length;
  const progress = Math.round((completedCount / steps.length) * 100);

  function scrollToSection(section: SectionId) {
    setExpanded(section);

    const refs = {
      academic: academicRef,
      contact: contactRef,
      preferences: preferencesRef,
    } satisfies Record<SectionId, typeof academicRef>;

    refs[section].current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function updateField<K extends keyof ProfileState>(key: K, value: ProfileState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);
    let supabase;

    try {
      supabase = createClient();
    } catch (caught) {
      setLoading(false);
      setError(caught instanceof Error ? caught.message : "Supabase is not configured yet.");
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data: sessionData } = await supabase.auth.getSession();

    if (!user) {
      setLoading(false);
      setError("Please log in before completing your onboarding.");
      return;
    }

    try {
      const bootstrap = await apiFetch<{ profile: { role?: string } }>("/api/auth/bootstrap-user", sessionData.session?.access_token, {
        method: "POST",
      });
      if (isStaffRole(bootstrap.profile?.role)) {
        router.push(getRoleHome(bootstrap.profile?.role, true));
        router.refresh();
        return;
      }
    } catch (caught) {
      setLoading(false);
      setError(caught instanceof Error ? caught.message : "Could not prepare your student profile.");
      return;
    }

    const payload = {
      phone: form.phone.trim(),
      matric_number: form.matric_number.trim(),
      department: form.department.trim(),
      level: Number(form.level || 0),
      preferred_language: form.preferred_language,
      preferred_tone: form.preferred_tone,
      is_profile_complete: true,
    };

    const { error: updateError } = await supabase.from("users").update(payload).eq("id", user.id);

    setLoading(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
      <aside className="rounded-[28px] border border-white/10 bg-white/5 p-5 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-2xl bg-mint/15 text-mint">
            <Sparkles className="size-5" />
          </span>
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-white/40">Checklist</p>
            <h2 className="text-lg font-semibold text-white">Set up your space</h2>
          </div>
        </div>

        <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-sm text-white/50">Progress</p>
              <p className="mt-1 text-3xl font-semibold text-white">{progress}%</p>
            </div>
            <p className="text-sm text-white/50">
              {completedCount} of {steps.length} done
            </p>
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-mint via-emerald-300 to-mint transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        <div className="mt-5 space-y-3">
          {steps.map((step, index) => (
            <button
              key={step.id}
              type="button"
              onClick={() => scrollToSection(step.id)}
              className="w-full rounded-2xl border border-white/10 bg-white/5 p-4 text-left transition hover:border-mint/35 hover:bg-white/10"
            >
              <div className="flex items-start gap-3">
                <span className="mt-0.5 text-mint">
                  {step.complete ? <CheckCircle2 className="size-5" /> : <Circle className="size-5 text-white/30" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium text-white">
                      {index + 1}. {step.title}
                    </p>
                    <span className="text-xs text-white/35">{step.complete ? "Done" : "Pending"}</span>
                  </div>
                  <p className="mt-1 text-sm leading-6 text-white/50">{step.description}</p>
                  <p className="mt-3 text-sm text-mint">{step.cta}</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </aside>

      <div className="space-y-4">
        <OnboardingPanel
          ref={academicRef}
          title="Academic profile"
          subtitle="We'll use this to filter announcements, deadlines, documents, and school calendar events for your class."
          expanded={expanded === "academic"}
          onToggle={() => setExpanded("academic")}
          complete={steps[0].complete}
        >
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm text-white/60">Department</span>
              <input
                value={form.department}
                onChange={(event) => updateField("department", event.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 outline-none transition focus:border-mint/45"
                placeholder="Computer Science"
                required
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm text-white/60">Level</span>
              <select
                value={form.level}
                onChange={(event) => updateField("level", event.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 outline-none transition focus:border-mint/45"
                required
              >
                <option value="">Select your level</option>
                {[100, 200, 300, 400, 500].map((level) => (
                  <option key={level} value={level}>
                    {level} Level
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-2 md:col-span-2">
              <span className="text-sm text-white/60">Matric number</span>
              <input
                value={form.matric_number}
                onChange={(event) => updateField("matric_number", event.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 outline-none transition focus:border-mint/45"
                placeholder="VUG/CSC/23/001"
                required
              />
            </label>
          </div>
        </OnboardingPanel>

        <OnboardingPanel
          ref={contactRef}
          title="Contact and alerts"
          subtitle="Your phone number helps with reminders, escalation follow-ups, and future WhatsApp support."
          expanded={expanded === "contact"}
          onToggle={() => setExpanded("contact")}
          complete={steps[1].complete}
        >
          <div className="grid gap-4">
            <label className="space-y-2">
              <span className="text-sm text-white/60">Phone number</span>
              <input
                value={form.phone}
                onChange={(event) => updateField("phone", event.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 outline-none transition focus:border-mint/45"
                placeholder="+234 801 234 5678"
                required
              />
            </label>

            <div className="rounded-2xl border border-mint/15 bg-mint/10 p-4 text-sm leading-6 text-white/70">
              Your dashboard can later use this for reminders, escalation updates, and connecting your profile to WhatsApp support when that channel is enabled.
            </div>
          </div>
        </OnboardingPanel>

        <OnboardingPanel
          ref={preferencesRef}
          title="App preferences"
          subtitle="Make the assistant feel more natural for you from the very first response."
          expanded={expanded === "preferences"}
          onToggle={() => setExpanded("preferences")}
          complete={steps[2].complete}
        >
          <div className="grid gap-5 md:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm text-white/60">Language</span>
              <select
                value={form.preferred_language}
                onChange={(event) => updateField("preferred_language", event.target.value as ProfileState["preferred_language"])}
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 outline-none transition focus:border-mint/45"
              >
                <option value="en">English</option>
                <option value="pidgin">Pidgin</option>
              </select>
            </label>

            <div className="space-y-2">
              <span className="text-sm text-white/60">Response style</span>
              <div className="grid gap-3">
                {[
                  {
                    value: "simple" as const,
                    title: "Simple",
                    description: "Clear, short explanations for quick answers.",
                  },
                  {
                    value: "formal" as const,
                    title: "Formal",
                    description: "More structured and academic wording.",
                  },
                ].map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => updateField("preferred_tone", option.value)}
                    className={`rounded-2xl border p-4 text-left transition ${
                      form.preferred_tone === option.value
                        ? "border-mint/50 bg-mint/12"
                        : "border-white/10 bg-white/5 hover:border-white/20"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-medium text-white">{option.title}</p>
                      {form.preferred_tone === option.value ? <CheckCircle2 className="size-4 text-mint" /> : null}
                    </div>
                    <p className="mt-2 text-sm leading-6 text-white/55">{option.description}</p>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </OnboardingPanel>

        {error ? (
          <p className="rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-200">{error}</p>
        ) : null}

        <div className="flex flex-col gap-3 rounded-[28px] border border-white/10 bg-white/5 p-5 backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-white/40">Finish setup</p>
            <p className="mt-2 text-sm leading-6 text-white/60">
              We'll save these details directly to your `users` profile so SmartCampus can personalize announcements, reminders, calendar events, and chat answers.
            </p>
          </div>
          <Button type="submit" disabled={loading} className="min-w-[180px]">
            {loading ? "Saving setup..." : "Complete onboarding"}
          </Button>
        </div>
      </div>
    </form>
  );
}

type OnboardingPanelProps = {
  title: string;
  subtitle: string;
  expanded: boolean;
  onToggle: () => void;
  complete: boolean;
  children: ReactNode;
};

const OnboardingPanel = forwardRef<HTMLDivElement, OnboardingPanelProps>(function OnboardingPanel(
  { title, subtitle, expanded, onToggle, complete, children },
  ref,
) {
  return (
    <section ref={ref} className="overflow-hidden rounded-[30px] border border-white/10 bg-white/5 backdrop-blur-xl">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start justify-between gap-4 px-6 py-5 text-left transition hover:bg-white/[0.03]"
      >
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            {complete ? <CheckCircle2 className="size-5 text-mint" /> : <Circle className="size-5 text-white/25" />}
            <h3 className="text-xl font-semibold text-white">{title}</h3>
          </div>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-white/55">{subtitle}</p>
        </div>
        <ChevronDown className={`mt-1 size-5 shrink-0 text-white/45 transition ${expanded ? "rotate-180" : ""}`} />
      </button>
      {expanded ? <div className="border-t border-white/10 px-6 py-6">{children}</div> : null}
    </section>
  );
});
