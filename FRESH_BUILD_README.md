# SmartCampus AI Fresh Build

This repository now contains the start of the new architecture beside the older Flask/Jinja app.

## Structure

- `frontend/`: Next.js App Router UI with the dark glassy SmartCampus design.
- `api/`: Flask API backend for Supabase JWT validation, RAG, Groq LLaMA, documents, escalations, and WhatsApp webhooks.
- `supabase/fresh_build_schema.sql`: Fresh Supabase schema for Auth profiles, pgvector RAG, school data, study tools, and WhatsApp.

## Environment

Copy values from `.env.example` into:

- Root `.env` for the Flask API.
- `frontend/.env.local` for Next.js public values.

Important values:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_API_URL=http://localhost:5000
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
GROQ_API_KEY=
GROQ_MODEL=llama-3.1-8b-instant
WHATSAPP_VERIFY_TOKEN=
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
```

`OLLAMA_MODEL=llama3.2:1b` can remain for local experiments, but Groq is the main LLaMA provider.

## Run Locally

Install frontend dependencies:

```powershell
cd frontend
npm install
npm run dev
```

Run the Flask API from the project root:

```powershell
pip install -r requirements.txt
python -m api.run
```

Open the frontend at `http://localhost:3000`.

## Supabase

Run `supabase/fresh_build_schema.sql` in the Supabase SQL editor for the new build. Use it on a fresh Supabase project or review carefully before applying it to an existing project.
