# NSK Technical Information Portal

A secure web application for publishing NSK Head Quarters technical information to authorised dealers.
Administrators upload an official PDF **once**; dealers always see the latest approved revision, can search
inside it, preview it in the browser and download the original file unchanged.

- **Admin dashboard** (`/admin`): upload, revise, publish, archive and withdraw documents; categories; dealer
  accounts; revision history; activity log; settings.
- **Dealer portal** (`/portal`): dashboard, search & filters, categories, latest updates, saved documents and
  download history, in-browser PDF viewer.

> Sample data: the four PDFs in `doc_sample/` are official NSK documents provided for testing and are ingested
> unchanged by the seed. All seeded **accounts, regions and dealer companies are test data** (marked "SAMPLE" /
> `.test` e-mail domains). Automated tests use synthetic PDFs clearly marked "TEST FILE – NOT AN OFFICIAL NSK
> DOCUMENT".

---

## 1. Architecture

```
Browser ──► Next.js 16 (App Router, React 19, TypeScript, Tailwind CSS 4)
              │  src/proxy.ts            optimistic "has session cookie?" redirect only
              │  Server Components       pages read data through the data-access layer
              │  Server Actions          all mutations (each re-checks permissions)
              │  Route handlers          /api/admin/uploads   PDF upload + analysis (progress via XHR)
              │                          /api/files/revisions/:id   the ONLY way to get a document file
              │                          /api/assets/:id      images inside authored documents
              ▼
        Data-access layer  src/server/auth/dal.ts  +  src/server/services/*
              │  permission checks (src/lib/permissions.ts) • visibility rules (services/access.ts)
              ▼
   PostgreSQL (Drizzle ORM)              Private file storage (src/server/storage)
   documents, revisions, users,          local folder outside /public  — or —
   full-text index (tsvector + pg_trgm), private S3-compatible bucket
   audit log, DB-level integrity triggers
```

| Concern | Choice | Why |
|---|---|---|
| App framework | Next.js 16 + TypeScript | One deployable for UI, server actions and file routes |
| Database | PostgreSQL 15+ (Drizzle ORM, SQL migrations in `drizzle/`) | Relational integrity, full-text search, triggers; runs locally, in Docker, Supabase, Neon, RDS… |
| Auth | Built-in: argon2id password hashes, random session tokens stored **hashed** in the DB, `httpOnly` `SameSite=Lax` cookies, login rate limiting | No external auth service needed; individual dealer accounts; instant revocation |
| Authorisation | Role → permission map (`src/lib/permissions.ts`), checked on the server in every page, action and route | New roles (Technical Reviewer, Regional Admin, Dealer Manager) are already defined |
| Files | Private storage; streamed through an authenticated route | No public URLs; guessing a URL returns 404 |
| PDF viewing | PDF.js 5 (canvas + text layer) | Original layout, selectable text, zoom/fit/full-screen, find-in-document |
| Search | Postgres `tsvector` + trigram index over metadata **and** text extracted from the current published PDF; NFKC normalisation (full-width text in TEC-26-056 becomes searchable) | Finds order codes / UDI-DI inside product tables |
| OCR | tesseract.js (on demand, background) | Makes scanned PDFs searchable; original file untouched |
| Rich text | TipTap 3 (tables, images with resize/align/caption, page breaks, links) | Authored documents; exported to PDF with headless Chrome |
| E-mail | Resend HTTP API (optional) | Simple, cheap; disabled until configured |

### Revision integrity (enforced in the database)
`drizzle/0001_revision_integrity.sql` adds triggers so that **no code path** can overwrite an official revision:
- once a revision is published, its file, checksum, revision number, dates and uploader are immutable;
- a revision that was ever published cannot be deleted;
- `documents.current_revision_id` must point to a *published* revision of the *same* document;
- `activity_logs` is append-only;
- at most one published revision per document (unique partial index).

Super administrators can fix a mistyped revision number/date of a published record through the
**Correct** action, which sets `app.revision_correction` for that transaction only and writes an audit entry.

### Labels
Labels are computed from publication events, never set by hand:

| Label | Rule |
|---|---|
| NEW | first publication of a document, for *N* days (Settings, default 30) |
| UPDATED | a later revision was published, for *N* days (default 30) |
| CURRENT | published, after the NEW/UPDATED period |
| ARCHIVED / WITHDRAWN | document status |
| DRAFT | admin only — never published, or unpublished |

---

## 2. Database schema

Defined in `src/server/db/schema.ts` (migrations in `drizzle/`).

| Table | Key columns |
|---|---|
| `users` | id, full_name, email (unique, case-insensitive), password_hash, role, dealer_name, region_id, status (active/suspended), must_change_password, email_notifications, last_login_at, created_by |
| `sessions` | id = sha256(token), user_id, expires_at, ip, user_agent |
| `login_attempts` | email, ip, success, created_at (rate limiting) |
| `regions` | id, name, code |
| `categories` | id, name, slug, description, icon, parent_category_id (one level of subcategories), display_order, status |
| `document_types` | id, name, display_order, active |
| `documents` | id, title, document_number (unique), description, category_id, subcategory_id, product_models[], document_type_id, language, source, kind (uploaded_pdf / authored), status (draft/published/archived/withdrawn), visibility (all_dealers / regions), current_revision_id, first_published_at, last_published_at, last_publish_event (new/updated), status_reason, search_text, search_vector (generated) |
| `document_regions` | document_id, region_id (region-restricted documents) |
| `document_revisions` | id, document_id, revision_number, sequence, release_date, file_path, original_filename, file_size, sha256, page_count, extracted_text, text_source (pdf/ocr/authored/none), ocr_status, authored_content (TipTap JSON), uploaded_by, uploaded_at, approval_status (draft/published/superseded/rejected), approved_by, published_at, superseded_at, revision_notes, restored_from_id |
| `uploads` | staged PDF uploads awaiting metadata (purged after 2 days if unused) |
| `assets` | images used in authored documents (same visibility as their document) |
| `notifications` | publication events (new/updated/withdrawn/archived/restored) + e-mail delivery status |
| `activity_logs` | user_id, action, entity, document_id, description, metadata (before/after), ip — append-only |
| `downloads` | user_id, document_id, revision_id, created_at (download history & usage stats) |
| `saved_documents` | user_id, document_id |
| `settings` | key/value (label durations, notification switches) |

---

## 3. Environment variables

Copy `.env.example` to `.env.local` (development) or set them in your host. Summary:

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | ✔ | PostgreSQL connection string |
| `APP_URL` | ✔ in prod | Public URL (links in e-mails) |
| `STORAGE_DRIVER` | | `local` (default) or `s3` |
| `STORAGE_LOCAL_DIR` | | Private folder for files (default `./storage`) — back it up |
| `S3_BUCKET`, `S3_REGION`, `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_FORCE_PATH_STYLE` | if `s3` | Private bucket (AWS S3, Cloudflare R2, MinIO…) |
| `MAX_UPLOAD_MB` | | Upload limit (default 50) |
| `SESSION_TTL_HOURS` | | Session lifetime (default 12) |
| `COOKIE_SECURE` | | `true` behind HTTPS (default true in production) |
| `RESEND_API_KEY`, `EMAIL_FROM` | | Enable e-mail notifications (also switch them on in Settings) |
| `CHROME_EXECUTABLE_PATH` | | Enables server-side PDF export of authored documents |
| `OCR_CACHE_DIR`, `OCR_LANGS` | | OCR language data cache / languages (e.g. `eng+jpn`) |
| `TZ` | | Time zone for displayed timestamps |
| `SEED_*` | dev only | Test accounts created by `npm run db:seed` |

**Not configured in this repository:** no Resend key, no S3 bucket and no production database. Without them the
portal works fully with local storage; e-mails are recorded as "not configured" instead of being sent.

---

## 4. Local installation

Requirements: Node.js 20.9+ (tested on 23), PostgreSQL 15+ (tested on 17), Google Chrome (optional, for authored-PDF
export and the e2e tests). Internet access is needed the first time OCR runs (language data is downloaded and cached).

```bash
npm install                      # also copies PDF.js worker/CMaps to public/pdfjs
createdb nsk_portal
cp .env.example .env.local       # adjust DATABASE_URL if needed
npm run db:migrate
npm run db:seed                  # categories, types, sample regions, TEST accounts, the PDFs in doc_sample/
npm run dev                      # http://localhost:3000
```

Development test accounts (from `.env.example`): `admin@nsk-portal.test` (super administrator),
`dealer@sample-dealer.test` (Southeast Asia), `dealer2@sample-dealer.test` (Middle East). Passwords are the
`SEED_*_PASSWORD` values. `npm run db:reset` wipes everything and re-seeds (development only).

### Checks
```bash
npm run typecheck && npm run lint
createdb nsk_portal_test         # once
npm run test:e2e                 # builds the app and runs the acceptance scenarios against nsk_portal_test
```
The e2e suite (`e2e/acceptance.spec.ts`) covers scenarios A–F of the brief plus upload validation, metadata
editing, region restrictions, withdrawal, OCR and rich-text authoring.

---

## 5. Deployment

### Option A — single server with Docker (recommended, lowest cost)
```bash
cp .env.example .env             # set APP_URL, POSTGRES_PASSWORD, TZ, optional RESEND_*; leave DATABASE_URL to compose
docker compose up -d --build     # PostgreSQL 17 + portal; migrations run on start
docker compose exec app npm run user:create -- --email you@company.com --name "Your Name" --role super_admin
```
Put a TLS reverse proxy (Caddy, nginx, Traefik) in front and keep `COOKIE_SECURE=true`. Documents live in the
`storage` volume, the database in `pgdata` — back up both (`scripts/backup.sh` does `pg_dump` + a storage
tarball; schedule it with cron and copy the output off the server).

### Option B — managed services
- Database: any PostgreSQL 15+ (Supabase, Neon, RDS, Azure). Run `npm run db:migrate` against it.
- Files: a **private** S3-compatible bucket (`STORAGE_DRIVER=s3`). Never make it public; files are always
  streamed through `/api/files/...` after a permission check.
- App: any Node host that keeps a long-running process (needed for background OCR), e.g. a VM, Render, Railway,
  Fly.io, or the Docker image above. Serverless hosts work for everything except long OCR jobs.

### Option C — free test server (Render + Supabase)
For demos and feedback only. `render.yaml` at the repository root describes the web service.
- **Supabase (free):** create a project, then in **Storage** create a **private** bucket named `nsk-portal` and,
  under **Storage → S3 Configuration**, a new access key. Use the **Session pooler** connection string
  (port 5432, IPv4) with `?sslmode=require` as `DATABASE_URL`.
- **Load data from your machine:** copy the values into `.env.deploy` (git-ignored), then
  ```bash
  npx tsx --env-file=.env.deploy scripts/migrate.ts
  npx tsx --env-file=.env.deploy --conditions=react-server scripts/seed.ts   # needs ./doc_sample
  ```
- **Render (free):** New → Blueprint → pick the repository; enter the secret values when asked. `APP_URL`
  is the service address, e.g. `https://nsk-tech-portal.onrender.com`.
- **Limits of the free tier:** the server sleeps after 15 minutes without visits (the next visit takes about a
  minute); 512 MB of memory, so server-side PDF export of authored documents is off
  (`CHROME_EXECUTABLE_PATH=off`) and large scanned-PDF OCR jobs may fail; a free Supabase project pauses after
  a week without activity. E-mail stays off until `RESEND_API_KEY` and `EMAIL_FROM` are added.

### Production checklist
- [ ] HTTPS, `COOKIE_SECURE=true`, correct `APP_URL` and `TZ`
- [ ] Remove or change the seeded test accounts (or never run `db:seed` in production)
- [ ] Daily backups of database **and** storage, tested restore
- [ ] Resend domain verified and `EMAIL_FROM` set, then enable notifications in **Settings**
- [ ] Define dealer **regions** in Settings before creating dealer accounts

---

## 6. Administrator setup
1. Create the first super administrator: `npm run user:create -- --email … --name "…" --role super_admin`.
   The command prints a one-time temporary password; the administrator must change it at first sign-in.
2. Further staff accounts: **Dealer Management → Staff accounts → New staff account** (super administrators only).
   Roles: *Super Administrator* (everything, incl. staff accounts and published-record corrections) and
   *Administrator* (all document, category, dealer and settings work). *Technical Reviewer*, *Regional
   Administrator* and *Dealer Manager* are pre-defined for later use.
3. Review **Categories** (rename, reorder, add series, deactivate) and **Settings** (label periods, document types,
   regions, e-mail switches).

## 7. Dealer account setup
1. **Dealer Management → New dealer account**: name, e-mail, dealer company, region.
2. A temporary password is shown **once** — send it through a secure channel. The dealer must set a personal
   password at first sign-in. Accounts are individual; do not share them.
3. **Reset password** issues a new temporary password and signs the dealer out everywhere.
   **Suspend access** blocks sign-in immediately and ends active sessions. Changing a dealer's region or role
   also ends their sessions so new access rules apply at once.
4. Region-restricted documents (document metadata → *Dealer access*) are visible only to dealers in the selected
   regions.

---

## 8. Document upload & revision workflow

**New document** — *Upload Documents → Upload new document*
1. Drag & drop (or browse) a PDF. It is validated (extension, `%PDF` header, size, readable/not encrypted),
   checksummed (SHA-256), and its text is extracted for search. Scanned PDFs are flagged; duplicates of an
   existing file are reported.
2. Metadata is pre-filled from the first page (document number, revision, date, title) — **check it**.
3. Preview the PDF, then **Save as draft** (admins only) or **Publish to dealers** (labelled NEW).

**New revision** — *Upload new revision* on a document (or *Update existing document*)
1. Select the document; upload the newer PDF. A comparison with the current revision is shown.
2. **Save as draft**: dealers keep seeing the current approved revision.
3. On the document page, **Approve & publish** (or **Reject**). Publishing marks the previous revision
   *superseded* (kept with its original file), makes the new one current and labels the document UPDATED.
4. Only one draft revision can be pending per document.

**History & restore** — *Revision history* tab: every revision with upload/publish dates and users, preview,
download, compare with current. **Restore** creates a *new draft* from a copy of an older revision's file
(nothing is overwritten); publish it to make it current again.

**Lifecycle** — *Unpublish* (hide; republish later without a label), *Archive* (hide, keep), *Withdraw* (official
withdrawal with reason; dealers see a withdrawal notice in Latest Updates), *Reinstate*.

**Metadata** can be edited at any time (title, number, category, products, type, language, source, description,
dealer access). It never changes the PDF and never creates a NEW/UPDATED label.

**Authored documents** — *Document Management → New authored document*: TipTap editor with headings, lists,
tables, images (resize, align, caption), page breaks and links. Saved as drafts; on publish the content is
exported to PDF (when `CHROME_EXECUTABLE_PATH` is set) so dealers get a downloadable PDF. They are labelled
"Authored in portal" and kept separate from official HQ PDFs, which are never converted or retyped.

**OCR** — for a PDF flagged as scanned, open the revision and click **Run OCR**. Text is recognised in the
background and added to the search index; the original PDF is not modified.

**Notifications** — every publish/withdraw records an event shown in *Latest Updates*. If e-mail is configured and
enabled, dealers who can see the document (and have not opted out) receive an e-mail with the title, number,
category, revision, date and a portal link — PDFs are never attached.

---

## 9. Project layout
```
src/app/(login, portal/*, admin/*, print/*, api/*)   pages and route handlers
src/server/db/schema.ts                          database schema
src/server/auth/                                 sessions, passwords, data-access layer
src/server/services/                             documents/search, revisions, access rules, OCR, notifications, authored
src/server/actions/                              server actions (all permission-checked)
src/components/pdf/pdf-viewer.tsx                PDF.js viewer
src/components/editor/rich-text-editor.tsx       TipTap editor
src/lib/permissions.ts                           roles & permissions
drizzle/                                         SQL migrations (incl. integrity triggers)
scripts/                                         migrate, seed, create-user, backup
e2e/                                             Playwright acceptance tests + synthetic fixtures
```
