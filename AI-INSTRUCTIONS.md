# CLAUDE.md

## Project Overview

This is a personal Next.js starter repo used as a baseline for iterating on MVPs, prototyping concepts, and debugging ideas. It is not a production application — treat it as a scratchpad that happens to have good tooling.

## Commands

Use **Bun** for everything. Do not use npm, yarn, or pnpm.

```bash
bun install              # Install dependencies
bun run dev              # Start dev server (localhost:3000)
bun run build            # Production build
bun run lint             # ESLint check
bun run lint:fix         # ESLint auto-fix
bun run format:check     # Prettier check
bun run format:fix       # Prettier auto-fix
bun run type-check       # TypeScript type check (tsc --noEmit)
bun run db:up            # Start PostgreSQL via Docker
bun run db:down          # Stop PostgreSQL container
bun run db:generate      # Generate Prisma client
bun run db:migrate       # Run Prisma migrations
bun run db:reset         # Reset database
bun run db:studio        # Open Prisma Studio
```

## Tech Stack

- **Next.js 16** with App Router (no Pages Router)
- **React 19**
- **TypeScript 5** with strict mode
- **Tailwind CSS v4** (uses `@import "tailwindcss"` — no `tailwind.config.js`)
- **shadcn/ui** (New York style, `@/components/ui/`)
- **Prisma v7** with `@prisma/adapter-pg` driver adapter
- **PostgreSQL 16** via Docker Compose on port **5532**
- **ESLint 9** flat config
- **Prettier** with `prettier-plugin-tailwindcss`

## Project Structure

```
src/
├── app/                  # Next.js App Router — pages, layouts, globals.css
├── components/ui/        # shadcn/ui components
├── generated/prisma/     # Auto-generated Prisma client (do not edit)
├── lib/                  # Shared utilities
│   ├── prisma.ts         # Prisma client singleton
│   └── utils.ts          # cn() helper (clsx + tailwind-merge)
├── prisma/               # Prisma schema + migrations
│   └── schema.prisma
└── script.ts             # Database seed script
```

## Code Style & Conventions

- **Path alias:** `@/*` resolves to `./src/*` — always use it for imports
- **No nested ternaries** — ESLint enforces this as an error
- **Early returns** — ESLint enforces `no-else-return` as an error
- **Prettier config:** single quotes, semicolons, 2-space tabs, trailing commas (es5), 80 char print width
- **Tailwind classes** are auto-sorted by the Prettier plugin — do not manually reorder them
- **shadcn/ui** components live in `src/components/ui/` — add new ones with `bunx shadcn@latest add <component>`
- Use the `cn()` utility from `@/lib/utils` for conditional class merging

## Database

- Docker Compose is used for local PostgreSQL — run `bun run db:up` before working with the database
- The database runs on port **5532** (not the default 5432)
- Environment variables are in `.env` (copy from `.env.example`)
- Prisma schema is at `src/prisma/schema.prisma`
- Prisma config is at `prisma.config.ts` (root) — this is the Prisma v7 style config
- After changing the schema, run `bun run db:migrate` then `bun run db:generate`
- The generated Prisma client outputs to `src/generated/prisma/` — never edit these files

## Key Patterns

- This repo uses **React Server Components** by default (Next.js App Router). Only add `"use client"` when you need client-side interactivity.
- Fonts are loaded via `next/font` (Geist Sans and Geist Mono) in the root layout.
- The theme uses CSS custom properties defined in `src/app/globals.css` with both light and dark mode variants.

## When Adding New Features

1. Keep it simple — this is for prototyping, not production
2. Prefer server components unless client interactivity is needed
3. Use existing shadcn/ui components before building custom ones
4. Add Prisma models to `src/prisma/schema.prisma` and run migrations
5. Run `bun run lint` and `bun run type-check` before considering work done
