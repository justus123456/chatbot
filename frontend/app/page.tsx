"use client";

import type { CSSProperties } from "react";
import { ArrowRight, Bell, BookOpen, Calendar, CheckCircle2, FileText, MapPin, MessageSquare, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PublicNav } from "@/components/layout/public-nav";

const features = [
  { icon: MessageSquare, title: "Ask anything, get a clear answer", description: "Course registration, school fees, hostel booking, clearance, rules, contacts, and campus questions in one chat." },
  { icon: Calendar, title: "Never miss a deadline again", description: "See exam dates, payment deadlines, registration windows, holidays, and school events for your level." },
  { icon: Bell, title: "Updates that actually concern you", description: "Get reminders based on your department and level, so you do not receive random notices meant for other students." },
  { icon: FileText, title: "Turn notes into study material", description: "Upload lecture notes and create summaries, flashcards, and question-and-answer practice." },
  { icon: Target, title: "Stay on track with your goals", description: "Set study targets, follow your progress, and get gentle reminders before things pile up." },
  { icon: MapPin, title: "Find offices faster", description: "Locate departments, bursary, student affairs, hostels, lecture halls, and other important campus places." },
];

const studentQuestions = [
  "exam timetable",
  "school fees",
  "course registration",
  "bursary office",
  "hostel booking",
  "clearance documents",
];

const benefits = [
  "Personalised for your department and level",
  "Important updates without searching WhatsApp groups",
  "Study support when your notes are too long",
  "Campus directions when you are not sure where to go",
];

const faqs = [
  { question: "Is this for all Veritas students?", answer: "Yes. The assistant is designed for students across departments and levels." },
  { question: "Will I still need WhatsApp groups?", answer: "You can still use them, but the important information can be organised here so you do not miss deadlines in noisy group chats." },
  { question: "Can it help with lecture notes?", answer: "Yes. The study tools are planned for summaries, flashcards, and practice questions from uploaded notes." },
  { question: "What if the assistant does not know an answer?", answer: "The question can be sent to an admin or school staff member instead of the system guessing." },
];

export default function HomePage() {
  return (
    <main className="min-h-screen overflow-hidden bg-[var(--bg-main)] text-[var(--text-main)]">
      <div className="fixed inset-0 bg-[var(--hero-backdrop)]" />
      <div className="noise fixed inset-0 opacity-40" />
      <section className="relative mx-auto min-h-screen max-w-7xl px-5 pb-5 pt-28 md:pt-32">
        <PublicNav />

        <div className="relative z-10 mx-auto flex min-h-[calc(100vh-9rem)] max-w-5xl flex-col items-center justify-center text-center">
          <p className="animate-fade-up-delay-1 mb-5 rounded-full border border-mint/20 bg-mint/10 px-4 py-2 text-xs uppercase tracking-[0.35em] text-mint">
            Built for Veritas University students
          </p>
          <h1 className="animate-fade-up-delay-2 max-w-4xl text-balance text-5xl font-semibold leading-tight md:text-7xl">
            Stop missing updates. Ask about{" "}
            <span className="student-word-rotator bg-gradient-to-r from-[var(--text-main)] via-[var(--accent)] to-emeraldGlow bg-clip-text text-transparent">
              {studentQuestions.map((question) => (
                <span key={question}>{question}</span>
              ))}
            </span>
          </h1>
          <p className="animate-fade-up-delay-3 mt-6 max-w-2xl text-pretty text-base leading-7 text-white/65 md:text-lg">
            Find school information faster, track deadlines, and study with less stress.
          </p>
          <div className="animate-fade-up-delay-4 mt-6 flex flex-wrap justify-center gap-2">
            {studentQuestions.slice(1).map((question) => (
              <span key={question} className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/60">
                {question}
              </span>
            ))}
          </div>
          <div className="animate-fade-up-delay-5 mt-9 flex flex-col gap-3 sm:flex-row">
            <Button href="/signup">Create free student account <ArrowRight className="size-4" /></Button>
            <Button href="/login" variant="outline">I already have an account</Button>
          </div>
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[42vh] rounded-t-[100%] border-t border-mint/30 bg-[radial-gradient(ellipse_at_center,rgba(var(--accent-rgb),.28),transparent_58%)] blur-[1px]" />
        <Card className="absolute bottom-20 left-8 hidden w-72 -rotate-12 animate-float md:block" style={{ "--rotate": "-12deg" } as CSSProperties}>
          <span className="rounded-full bg-[var(--panel-strong)] px-3 py-1 text-xs text-[var(--accent)]">Campus updates</span>
          <p className="mt-6 text-3xl font-semibold text-[var(--text-main)]">Stay informed</p>
          <p className="mt-2 text-sm text-[var(--text-muted)]">See important school notices when your department or level has an update.</p>
        </Card>
        <Card className="absolute bottom-24 right-8 hidden w-80 rotate-12 animate-float md:block" style={{ "--rotate": "12deg" } as CSSProperties}>
          <div className="space-y-3">
            <div className="rounded-2xl bg-white/10 p-3 text-left text-xs text-white/70">What can I ask SmartCampus?</div>
            <div className="rounded-2xl bg-mint/15 p-3 text-left text-xs text-mint">Ask about campus services, documents, locations, announcements, and study support.</div>
          </div>
        </Card>
      </section>

      <section id="features" className="relative z-10 mx-auto max-w-7xl px-5 py-24">
        <div className="mb-12 flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-mint">Student support</p>
            <h2 className="mt-3 text-4xl font-semibold">Everything you usually chase around campus, organised in one place.</h2>
          </div>
          <p className="max-w-xl text-white/55">No more guessing who to ask, where to go, or which WhatsApp message had the real deadline.</p>
        </div>
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {features.map((feature, index) => {
            const Icon = feature.icon;
            return (
              <div key={feature.title} className="animate-fade-up" style={{ animationDelay: `${index * 70}ms` }}>
                <Card className="group h-full transition duration-300 hover:-translate-y-2 hover:border-mint/35">
                  <div className="mb-5 grid size-12 place-items-center rounded-2xl bg-mint/10 text-mint transition group-hover:bg-mint group-hover:text-ink">
                    <Icon className="size-6" />
                  </div>
                  <h3 className="text-xl font-semibold">{feature.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-white/55">{feature.description}</p>
                </Card>
              </div>
            );
          })}
        </div>
      </section>

      <section id="how-it-helps" className="relative z-10 mx-auto grid max-w-7xl gap-6 px-5 py-20 lg:grid-cols-[1fr_0.9fr]">
        <Card>
          <p className="text-sm uppercase tracking-[0.3em] text-mint">Why students need it</p>
          <h2 className="mt-4 text-4xl font-semibold">The right school information should not be hard to find.</h2>
          <p className="mt-5 text-white/60">SmartCampus helps you cut through scattered announcements, confusing deadlines, long documents, and repeated questions.</p>
          <ul className="mt-8 space-y-4">
            {benefits.map((item) => (
              <li key={item} className="flex items-center gap-3 text-[var(--text-main)]">
                <CheckCircle2 className="size-5 text-mint" />
                {item}
              </li>
            ))}
          </ul>
        </Card>
        <Card className="bg-mint/10">
          <MessageSquare className="size-8 text-mint" />
          <h3 className="mt-5 text-2xl font-semibold">“I missed it in the group chat.”</h3>
          <p className="mt-3 text-white/60">That should not happen with registration deadlines, fee reminders, hostel updates, or exam information. SmartCampus keeps the important things visible.</p>
          <div className="mt-6 rounded-3xl bg-white/10 p-4 text-sm text-white/70">
            “I used to scroll through old WhatsApp messages to find deadlines. This puts the information where I can actually find it.”
          </div>
        </Card>
      </section>

      <section id="faq" className="relative z-10 mx-auto max-w-7xl px-5 py-20">
        <div className="mb-10 text-center">
          <p className="text-sm uppercase tracking-[0.3em] text-mint">Questions students ask</p>
          <h2 className="mt-3 text-4xl font-semibold">Simple answers before you start.</h2>
        </div>
        <div className="grid gap-5 md:grid-cols-2">
          {faqs.map((faq) => (
            <Card key={faq.question}>
              <h3 className="text-xl font-semibold">{faq.question}</h3>
              <p className="mt-3 text-sm leading-6 text-white/55">{faq.answer}</p>
            </Card>
          ))}
        </div>
        <div className="py-20 text-center">
          <h2 className="text-4xl font-semibold">Stop guessing deadlines. Stop searching old messages.</h2>
          <p className="mx-auto mt-4 max-w-2xl text-white/55">Create your account and keep your school life organised from one dashboard.</p>
          <div className="mt-8">
            <Button href="/signup">Get started free <ArrowRight className="size-4" /></Button>
          </div>
        </div>
      </section>
    </main>
  );
}
