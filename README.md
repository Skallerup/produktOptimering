## ProduktOptimering

Next.js 16 app der scanner WooCommerce-produkter, gemmer data i Supabase og bruger din egen OpenAI-nøgle til at producere rapporter med manglende oplysninger, spørgsmål og optimeringsforslag. Designet til Vercel hosting.

## Tech stack

- Next.js App Router (serverless/edge klar til Vercel)
- Supabase (Postgres + API)
- OpenAI Responses API (`gpt-4.1-mini`)
- Tailwind CSS v4 (utility-klasser via `@import "tailwindcss"`)
- TypeScript + Zod til validering

## Miljøvariabler

| Navn | Beskrivelse |
| --- | --- |
| `SUPABASE_URL` | Public REST URL til din Supabase-projekt |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (bruges kun på serveren) |

Gem disse i `.env.local` under udvikling og som Environment Variables på Vercel (`Project Settings → Environment Variables`). Service role nøglen må **aldrig** udsættes i klientkode.

## Database

Supabase-tabeller findes som SQL-migration i `supabase/migrations/0001_init.sql`. Kør den via Supabase dashboard eller `supabase db push`.

Oversigt:

- `stores` — én række per WooCommerce-base-URL
- `products` — snapshot af hver produktside inkl. metadata
- `analyses` — AI-output per produkt

## Lokalt setup

```bash
cd webapp
npm install
npm run dev
```

Appen kører på `http://localhost:3000`.

## Deploy på Vercel

1. Opret et nyt projekt i Vercel og peg det mod repoet.
2. Tilføj miljøvariablerne `SUPABASE_URL` og `SUPABASE_SERVICE_ROLE_KEY`.
3. Deploy — Vercel bygger automatisk med `npm run build`.

## Brugerguide

1. Indtast WooCommerce URL og tryk “Scan webshop”. Appen bruger WooCommerce Store API til at hente produkter og gemmer dem i Supabase.
2. Vælg de produkter, der skal analyseres (enten top N eller egne valg).
3. Indtast din private OpenAI API-nøgle (lagres ikke) og start analysen.
4. Resultatet viser resume, manglende info, optimeringsforslag og SEO-noter.
