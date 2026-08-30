# Local setup notes

Supplements the README's "Getting Started". These are deviations required to get
the project running on a current Node/npm toolchain (verified on Node 24, npm 11).

## Install

```bash
npm install --legacy-peer-deps
```

Plain `npm install` **fails** with `ERESOLVE`: `@headlessui/react@1.7.19` declares
a peer range of React `^16 || ^17 || ^18`, but the project runs React 19. The
committed `bun.lock` pins that same pairing (bun does not enforce peer ranges), so
`--legacy-peer-deps` reproduces the intended tree. The real fix is upgrading to
`@headlessui/react` v2 (React 19 support), which is a breaking API change to the
four modal/drawer components that use it.

## Install scripts

npm 11 blocks dependency install scripts by default. The needed ones are approved
via the `allowScripts` field in `package.json`:

- `prisma` / `@prisma/client` / `@prisma/engines` — generate the Prisma client + query engine
- `bcrypt` — build the native binding (password hashing fails without it)
- `sharp` — image processing
- `unrs-resolver` — eslint import resolution

If the client is ever missing, regenerate it with `npx prisma generate`.

## Database

Prisma's MongoDB connector **requires a replica set** — a standalone `mongod` will
not work. Pick one:

1. **MongoDB Atlas** (free tier, easiest): create a cluster, copy the connection
   string into `DATABASE_URL`. Replica set is built in.
2. **Local MongoDB Community Server**: start with `mongod --replSet rs0`, then run
   `rs.initiate()` once in `mongosh`.
3. **Docker**: `docker run -d -p 27017:27017 mongo:7 --replSet rs0`, then initiate.

Then push the schema:

```bash
npx prisma db push
```

## Third-party services

The app degrades without these, but still builds and serves the login page:

- **Pusher** — realtime message delivery. Without it messages persist but do not
  appear live; you must reload.
- **Cloudinary** — image upload in chat and avatar changes.
- **GitHub / Google OAuth** — the social sign-in buttons. Email + password
  registration works without them (needs only the database).

## Changed from upstream

- `app/components/inputs/select.tsx` — removed a stale `// @ts-expect-error`.
  `react-select`'s types have since been fixed, so the directive suppressed
  nothing and TypeScript 5.9 errors on an unused directive, breaking `npm run build`.
