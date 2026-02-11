# next-js-starter

A personal baseline starter for quickly iterating on MVPs, prototyping concepts, and debugging ideas. Not meant for production — just a fast launchpad.

## Tech Stack

- **Framework:** Next.js 16 (App Router) + React 19
- **Language:** TypeScript 5 (strict mode)
- **Styling:** Tailwind CSS v4 + shadcn/ui (New York style)
- **Database:** PostgreSQL 16 (via Docker) + Prisma v7
- **Code Quality:** ESLint 9 + Prettier
- **Package Manager:** Bun

## Prerequisites

- [Bun](https://bun.sh) installed
- [Docker](https://www.docker.com/) installed and running (for PostgreSQL)

## Getting Started

### 1. Install dependencies

```bash
bun install
```

### 2. Set up environment variables

```bash
cp .env.example .env
```

Fill in your `.env` values:

```
DATABASE_URL="postgresql://<user>:<password>@localhost:5532/<dbname>?schema=public"
LOCAL_DB_USER=<user>
LOCAL_DB_PASSWORD=<password>
LOCAL_DB_NAME=<dbname>
```

### 3. Start the database

```bash
bun run db:up
```

### 4. Run migrations and generate the Prisma client

```bash
bun run db:migrate
bun run db:generate
```

### 5. (Optional) Seed the database

```bash
bun run src/script.ts
```

### 6. Start the dev server

```bash
bun run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Available Scripts

| Command                | Description                          |
| ---------------------- | ------------------------------------ |
| `bun run dev`          | Start Next.js dev server             |
| `bun run build`        | Production build                     |
| `bun run start`        | Start production server              |
| `bun run lint`         | Run ESLint                           |
| `bun run lint:fix`     | Run ESLint with auto-fix             |
| `bun run format:check` | Check Prettier formatting            |
| `bun run format:fix`   | Fix Prettier formatting              |
| `bun run type-check`   | Run TypeScript type checking         |
| `bun run db:up`        | Start PostgreSQL container           |
| `bun run db:down`      | Stop PostgreSQL container            |
| `bun run db:generate`  | Generate Prisma client               |
| `bun run db:push`      | Push schema to database (no migrate) |
| `bun run db:migrate`   | Run Prisma migrations                |
| `bun run db:reset`     | Reset database and re-run migrations |
| `bun run db:studio`    | Open Prisma Studio                   |

## Project Structure

```
src/
├── app/                  # Next.js App Router (pages, layouts, globals.css)
├── components/ui/        # shadcn/ui components
├── generated/prisma/     # Generated Prisma client (gitignored)
├── lib/                  # Utilities (prisma client, cn helper)
├── prisma/               # Schema and migrations
└── script.ts             # Database seed script
```

## Notes

- Path alias `@/*` maps to `./src/*`
- ESLint enforces no nested ternaries and early returns
- Prettier is configured with the Tailwind CSS plugin for class sorting
- Prisma v7 uses the `@prisma/adapter-pg` driver adapter
- The PostgreSQL container runs on port **5532** (not the default 5432)

## ANy issues with the DB set up:

If you get:
Error: P1000: Authentication failed against database server, the provided database credentials for `nobeen` are not valid.

Please make sure to provide valid database credentials for the database server at the configured address.

docker-compose down -v: Stops the running nextjs_starter container (shown in your screenshot) and deletes the postgres_data volume where the old user/password data was stored.
