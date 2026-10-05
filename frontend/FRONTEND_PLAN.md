# DocFlow Frontend Plan

Status: proposal derived from a read-only audit of the FastAPI backend. No code
was changed to produce it.

Verified sources: `src/main.py`, `src/routers/*.py`, `src/schemas/*.py`,
`src/services/imports.py`, `src/services/documents.py`, `src/repositories/*.py`,
`src/models/domain.py`, `tests/test_imports.py`, `tests/test_order.py`,
`TheTask.md`. The endpoint list was cross-checked against the live OpenAPI
document produced by `app.openapi()`, so it reflects routes that are actually
registered, not code that merely exists.

Legend used throughout:

- **[CONFIRMED]** — observed in the backend, safe to build against.
- **[BLOCKED]** — cannot work until a backend endpoint exists. Do not fake it.
- **[PROPOSED]** — a design decision in this document, not existing behaviour.

---

## 1. Executive summary

The backend is a document-generation pipeline, not a CRUD service. It can import
students and companies, create practices and supervisors, assign organizations to
students, and render three DOCX artifacts. It exposes **13 routes**, and the only
collection it can return is a list of assignments as bare foreign keys. No
reference entity — student, group, organization, supervisor, practice — can be
listed or searched.

That single fact drives every conclusion below:

1. There is no way to populate a dropdown, autocomplete, or readable table from
   the API. Every screen that shows "the list of the group" from `TheTask.md`
   section 9 is impossible today.
2. An identifier is obtainable only from the create response that minted it; no
   later call can return it. Even a persisted client-side registry (§3.0) cannot
   be reconciled with the server, so a fresh browser or a cleared store means
   manual ID entry.
3. `POST /assignments/mass` requires a numeric `group_id`, but groups are only
   ever addressed by name elsewhere. Mass assignment is therefore unreachable
   from a browser.

The cheapest correct fix is five read endpoints on the backend (section 6), not
client-side workarounds. Until then, the frontend should ship as a narrow
wizard that owns a session-scoped ID store and degrades to manual ID entry.

Three items from `TheTask.md` have no backend implementation at all and must not
appear in the UI as working features: round-robin company distribution, selecting
groups for the order, and selecting groups for the summary report.

---

## 2. Confirmed backend contract

Development base URL: `http://127.0.0.1:8000` (uvicorn default).
Interactive docs: `http://127.0.0.1:8000/docs` — currently the only UI.

### 2.1 CORS: the first thing to solve [CONFIRMED]

`src/main.py` constructs the application with only a title and a lifespan
handler; there is no `CORSMiddleware` anywhere in `src/`:

```python
app = FastAPI(title="DocFlow", lifespan=lifespan)
```

A frontend served from another origin (Vite on `:5173`) will have every request
blocked by the preflight, including simple `GET`s, because the response carries
no `Access-Control-Allow-Origin`. Two options:

1. **Dev proxy [PROPOSED, recommended].** The frontend dev server proxies
   `/api/*` to `127.0.0.1:8000`. Requests become same-origin, the backend stays
   untouched, and the config is one file.
2. **Add CORS to the backend.** An explicit allow-list of the dev origin. Fine,
   but it is a backend change and an extra surface to keep correct.

Whichever is chosen, the client must use **relative URLs** (`/import/students`),
never a hard-coded host, so one build works behind the proxy and when served
directly by FastAPI.

### 2.2 Registered routes [CONFIRMED]

| # | Method and path | Input | Success | Notes |
|---|---|---|---|---|
| 1 | `GET /` | — | `{"message":"everything is okay"}` | Health check. |
| 2 | `POST /import/students` | `multipart/form-data`, field `file`, `.xlsx` | `ImportResult`, **200** | Not 201. |
| 3 | `POST /import/organizations` | `multipart/form-data`, field `file`, `.txt` cp1251 | `ImportResult`, **200** | |
| 4 | `POST /practice/create` | JSON `PracticeCreate` | `PracticeRead`, **201** | Unknown group name → 404. |
| 5 | `POST /practice/create_supervisor` | JSON `SupervisorCreate` | `SupervisorRead`, **201** | No dedup. |
| 6 | `POST /assignments/` | JSON `AssignmentCreate` | `AssignmentRead`, **200** | **Upsert** on `(student_id, practice_id)`. Trailing slash matters. |
| 7 | `POST /assignments/mass` | JSON `MassAssignmentCreate` | `list[AssignmentRead]`, 200 | Needs `group_id` → [BLOCKED], §6.2. |
| 8 | `PATCH /assignments/{assignment_id}` | JSON `AssignmentUpdate` | `AssignmentRead`, 200 | Unknown id → 404. |
| 9 | `GET /assignments/practice/{practice_id}` | path | `list[AssignmentRead]`, 200 | Bare FKs only, §6.3. |
| 10 | `GET /assignments/{assignment_id}` | path | `AssignmentRead`, 200 | Unknown id → 404. |
| 11 | `GET /documents/directions?group=<name>` | required query | **binary DOCX** `directions.docx` | No assigned students → 404. |
| 12 | `GET /documents/order` | none | **binary DOCX** `order.docx` | All students always. No students → 404. |
| 13 | `GET /documents/report?practice_type=<type>` | optional query | **binary DOCX** `report.docx` | No data → 404. |

Dead code worth knowing about [CONFIRMED]: `src/routers/documents.py` also
defines `router = APIRouter(prefix="/export", tags=["export"])`, and `main.py`
includes it. It has **zero routes**, so every `/export/*` path 404s. The working
document routes are only under `/documents`. Additionally
`render_direction_test()` is a plain async function, not decorated as a route,
so single-direction rendering is not exposed either.

### 2.3 Response shapes [CONFIRMED]

```jsonc
// ImportResult — `errors` defaults to [] and is NEVER populated by the services;
// both import functions return ImportResult(created, skipped) only.
{ "created": 0, "skipped": 0, "errors": [] }

// PracticeRead — dates serialize as ISO "YYYY-MM-DD"
{ "id": 1, "group": "БПО09и-25-03", "type": "Учебная",
  "start_date": "2026-06-01", "end_date": "2026-06-30", "supervisor_id": null }

// SupervisorRead
{ "id": 1, "full_name": "...", "position": "..." }

// AssignmentRead
{ "id": 1, "student_id": 1, "organization_id": 2, "practice_id": 3,
  "supervisor_id": null, "practice_form": null, "payment_type": null, "grade": null }
```

`PracticeCreate` requires `group`, `type`, `start_date`, `end_date`;
`supervisor_id` is optional. `AssignmentCreate` requires `student_id`,
`organization_id`, `practice_id`. `AssignmentUpdate` accepts any subset of
`organization_id`, `supervisor_id`, `practice_form`, `payment_type`, `grade` — it
cannot retarget a student or a practice, which is correct and should be mirrored
in the edit form (those two fields are read-only).

### 2.4 Error contract [CONFIRMED]

Every failure is an `HTTPException`, so bodies are `{"detail": "..."}`. Observed:

- **400** — unreadable/empty file, wrong extension, duplicate record books inside
  one Excel, missing required Excel columns, unparseable TXT, mass-assignment
  failure. Text is Russian and written for humans, e.g.
  `Не удалось определить группу из заголовка Excel`.
- **404** — unknown group on practice creation, no assigned students in a group,
  no imported students, no report data, unknown assignment id.
- **422** — framework validation: malformed JSON, missing multipart `file`,
  missing required `group` query parameter.

UI rule [PROPOSED]: render `detail` verbatim for 400/404 — it is the only
user-facing copy the backend provides, and genericising it hides actionable
information. Treat 422 as a client bug with a short developer-oriented message;
correct client-side validation should make it unreachable.

### 2.5 Import semantics: atomic, not row-by-row [CONFIRMED]

Both import services loop over parsed records inside one `try`; any exception
rolls the whole session back and re-raises. Consequences the UI must respect:

- A single bad row discards the entire file: `created`/`skipped` stay `0`/`0` and
  the user receives one `detail` string.
- The result card must therefore never imply partial success or list per-row
  errors. Show either "imported N, skipped M duplicates" or "nothing imported:
  <detail>".
- Idempotency is real and useful: re-uploading the same file yields
  `created: 0, skipped: N`, because students are keyed by unique `record_book`
  and organizations by `(name, address)`.

### 2.6 Exact input file formats [CONFIRMED]

Students `.xlsx` (pandas + openpyxl):

- The group name comes from any cell matching `Список студентов группы <NAME>`
  (case-insensitive), typically `B4`. It is **not** read from a column.
- A header row must contain the literal strings `Фамилия, имя, отчество` and
  `Номер зачетки`. Column positions are discovered, not fixed.
- Data rows follow the header; rows empty in both tracked cells are skipped.
- The record book must be a positive integer; blanks, non-integers and in-file
  duplicates are hard errors.
- The `Направление` column (values like `бюджет` / `платное`) is **ignored** by
  the parser. Payment status reaches the database only through
  `Assignment.payment_type`. Do not promise the user that this column is imported.

Organizations `.txt`:

- Decoded strictly as `cp1251`; any other encoding is a 400.
- One company per line. If the line contains a comma, everything after the
  **last** comma is the address and both parts are mandatory.
- Without a comma, a trailing `г.` / `с.` / `д.` token is captured as the address.
- Otherwise the whole line becomes the name and the address is `null`.

Frontend implication [PROPOSED]: surface these as pre-flight hints next to the
dropzone (accepted extensions, mandatory cp1251, one bad row aborts the whole
file) instead of letting users discover them through a series of 400s.

### 2.7 Documents are binary, and errors are not [CONFIRMED]

All three document routes return raw bytes with the DOCX media type and a
`Content-Disposition: attachment` header, but they raise `HTTPException` when
there is nothing to render — which produces a **JSON** body with a 404 status.
A naive `<a href="/documents/order" download>` therefore saves the JSON error as
a corrupt `.docx` when the database is empty.

Required client behaviour [PROPOSED]:

```ts
const res = await fetch(url);                        // relative URL, no caching
const type = res.headers.get("content-type") ?? "";
if (!res.ok || !type.includes("wordprocessingml")) {
  const detail = await res.json().then(d => d.detail).catch(() => res.statusText);
  throw new ApiError(detail);                        // e.g. "Нет импортированных студентов"
}
const blob = await res.blob();
saveBlob(blob, filenameFromContentDisposition(res) ?? fallback);
```

Document contents the UI can rely on [CONFIRMED]:

- **Directions**: one merged DOCX, one blank per assignment found for that group,
  separated by page breaks. Course is computed from the group intake year with a
  September rollover; dates are formatted `dd.mm.yyyy`. `organization_address`
  falls back to an empty string.
- **Order**: every student in the database, ordered by `Student.id` — effectively
  import order. Students without an assignment appear with empty organization,
  date and supervisor cells rather than being omitted.
- **Report**: rows grouped by `(group, practice)`, with distinct student counts
  and a count of students whose `payment_type` is non-null. Only
  `practice_type` equality filtering exists; the `year` field of
  `src/schemas/reports.py::ReportFilter` is defined but referenced by no router,
  so it is dead for planning purposes.

---

## 3. Pages and data flows

Five screens cover the whole `TheTask.md` user cycle. They are deliberately
ordered like the wizard in section 9 of the task document, because the backend
enforces that order: a group cannot get a practice before its students were
imported, and directions cannot render before assignments exist.

### 3.0 Global layout and session store [PROPOSED]

- Left rail navigation: Dashboard → Imports → Practice → Assignments →
  Documents. Disabled steps show a hint instead of disappearing, so the user can
  see what the pipeline looks like.
- A single client-side store ("session ID registry") holds every identifier the
  client obtained from create responses: `{ supervisors[], practices[], groups[],
  lastImport }`. It is persisted to `localStorage`/`sessionStorage` because a
  page reload otherwise destroys all knowledge of IDs (§1, point 2). Persisted
  state is best-effort: it is labelled "from this browser session", never
  presented as server truth, since no read endpoint can confirm it.
- On boot, the app calls `GET /` once for availability. If it fails, every page
  shows the offline banner and disables mutations.

### 3.1 Dashboard

Purpose: one glance at where the pipeline stands; entry point for the wizard.

- Data: purely local (registry contents) plus whatever the user just did.
  There is **no** server-side summary call. [CONFIRMED limitation]
- Cards: "Students imported (last batch: created N / skipped M)",
  "Companies imported", "Practices created this session", "Supervisors
  created". Each card links to its page.
- A "what is still missing" strip explains the three unimplemented task-doc
  features (§6.4–§6.5) so users do not look for them.

### 3.2 Imports

Two independent panels; both can run in any order, students first is merely
recommended.

**Panel A — students `.xlsx`**

1. Dropzone validates extension client-side (`.xlsx` only) and shows the format
   hints from §2.6 (title cell with group name, the two mandatory column
   headers, one-bad-row-aborts-all).
2. `POST /import/students` with `FormData({ file })`. No manual
   `Content-Type`; the browser sets the multipart boundary.
3. On 200 → result card: `created`, `skipped`; `errors` is always `[]` (§2.3)
   and must not be rendered as a list. On 400/422 → inline error with `detail`.
4. The response contains **no group name and no student IDs**. To learn the
   group name the user must either read it off the file themselves or rely on
   the next step: creating a practice echoes the group name back on success, and
   a 404 there is currently the only programmatic "does this group exist?"
   probe. [PROPOSED] The panel therefore offers a free-text "group name" field
   that the app remembers per import batch, with the caveat spelled out in the
   UI. This awkwardness is exactly what gap §6.1 removes.

**Panel B — organizations `.txt`**

Same shape: extension check, cp1251 warning, upload, result card. No IDs are
returned here either; organization IDs can only come from a future read
endpoint (§6.1) — today there is no client path to them at all, which makes
per-student assignment (§3.4) effectively unusable until the backend grows
`GET /organizations`.

### 3.3 Practice setup

Two forms, one page, strict dependency: supervisor → practice.

**Supervisor form** — `full_name`, `position` →
`POST /practice/create_supervisor` → 201 → store `SupervisorRead.id`.
No deduplication server-side, so the client should warn on submitting an
identical name+position twice in one session (registry check).

**Practice form** — fields map 1:1 to `PracticeCreate`:

- `group`: text input (no list available, §1 point 2). Prefill from the Imports
  panel's remembered group name when present.
- `type`: text input; suggest known values from templates/tests ("Учебная",
  "Производственная") but do not restrict — the backend accepts any string.
- `start_date`, `end_date`: native date pickers, submitted as ISO `YYYY-MM-DD`.
  Client-side rule: `end_date >= start_date` (the backend does not check).
- `supervisor_id`: dropdown fed **only** from supervisors created in this
  browser session (§3.0 registry). Optional; label it "из этой сессии" so the
  user understands why the list can be empty.

Outcomes: 201 → store `PracticeRead` (this is the only place the client learns
a `practice_id`; note that `PracticeRead.group` is echoed straight from the
request, so it confirms what the user typed, not what the database holds),
404 → `Группа ... не найдена`, pointing back to Imports.

One backend detail matters for this form [CONFIRMED]: `supervisor_id` is never
validated. `SupervisorRepository.supervisor_exists()` exists in
`src/repositories/practices.py` but no router calls it, and the engine in
`src/db/session.py` never issues `PRAGMA foreign_keys=ON`, so SQLite foreign key
constraints are not enforced at all. A wrong `supervisor_id` therefore produces
a practice with a dangling supervisor instead of an error, and the DOCX
templates that render the supervisor name will show it empty. Consequence for
the client: only ever submit IDs taken from the §3.0 registry (supervisors this
browser created), and treat an empty supervisor as a valid state rather than
assuming the server rejected a bad one.

### 3.4 Assignments

Intended purpose: review and edit who is assigned where. Current reality:
**[BLOCKED]** for any meaningful version of this page, because the client has no
way to enumerate students, organizations, or groups (§6.1, §6.2).

What can be built today, and how it must behave:

- **Per-student assignment form** → `POST /assignments/` with
  `student_id`, `organization_id`, `practice_id` (+ optional `supervisor_id`,
  `practice_form`, `payment_type`, `grade`). `practice_id` can come from the
  session registry; `student_id` and `organization_id` have **no source**.
  Interim UX: numeric ID inputs with explicit "нет справочника — введите ID
  вручную" helper text, plus deep links from a future read API. Do not hide this
  behind a fake dropdown.
- **Mass assignment** → `POST /assignments/mass` needs `group_id` (integer),
  while every other route addresses a group by **name**. There is no endpoint
  returning group IDs, so this route is unreachable from the browser until
  §6.2 lands. Mark the control as disabled with a tooltip, not removed, so the
  capability is visible in the roadmap.
- **Assignment review table** → `GET /assignments/practice/{practice_id}`
  returns rows of bare foreign keys: no student name, no organization name, no
  group. Rendering it as a table of numbers is technically possible and useless;
  the page should therefore render it only after §6.3 (an enriched read model)
  exists. Until then, offer `GET /assignments/{assignment_id}` as a single-record
  inspector for debugging.
- **Edit** → `PATCH /assignments/{assignment_id}` with a subset of
  `organization_id`, `supervisor_id`, `practice_form`, `payment_type`, `grade`.
  `student_id` and `practice_id` are immutable by schema design — show them
  read-only. 404 → "назначение не найдено".

### 3.5 Documents

The only page that works end-to-end without backend changes.

- **Directions**: group name input (prefill from registry) → 
  `GET /documents/directions?group=<name>` → blob download per §2.7. 404 means
  "no assigned students in group" and must link the user straight to
  Assignments, not just show an error.
- **Order**: single button, no parameters. Explain in the UI that it always
  covers **all** imported students and that group selection is not supported
  (§6.5). Unassigned students appear with empty cells.
- **Report**: optional `practice_type` filter (free text or the same suggestion
  list as in §3.3). Explain that filtering by group or year is unavailable
  (§6.5). 404 → "нет данных для отчёта".
- Shared behaviour: disable while a request is in flight, show progress
  (generation is synchronous and can take seconds for large groups), surface
  `detail` on failure, never navigate away, and keep the last downloaded
  filename visible.

### 3.6 Component inventory [PROPOSED]

Small, deliberately dumb components; all data access lives in hooks/api modules.

| Component | Responsibility | Notes |
|---|---|---|
| `AppShell` / `SideNav` | Layout, step ordering, offline banner | Uses the health check result. |
| `SessionRegistryProvider` | Context store for IDs obtained from create calls | Persisted, clearly labelled as client-side. |
| `FileDropzone` | Extension/size pre-checks, drag-drop, cancel | Emits a `File`, knows nothing about endpoints. |
| `ImportFormatHint` | Static §2.6 rules | Duplicated per panel; cheap and high-value. |
| `ImportResultCard` | `created` / `skipped`, atomic-failure copy | Must not render `errors` as a list. |
| `SupervisorForm`, `PracticeForm` | §3.3 fields | Date range validation client-side only. |
| `SessionIdSelect` | Dropdown from registry (supervisors) | Empty-state explains why. |
| `ManualIdInput` | Numeric ID entry with warning | Temporary substitute for missing read APIs. |
| `AssignmentTable` | §3.4 review/edit grid | Hidden until §6.3 lands; gated by a feature flag. |
| `DocxDownloadButton` | §2.7 fetch-blob-error logic, progress | The single place binary handling lives. |
| `ApiErrorText` | Renders `detail` verbatim, distinguishes 400/404/422 | §2.4 rule. |

Suggested module layout: `src/api/{client,imports,practices,assignments,documents}.ts`
(one file per router, thin wrappers returning typed DTOs), `src/types/api.ts`
(hand-written mirrors of §2.3), `src/pages/*`, `src/components/*`,
`src/state/registry.ts`.

---

## 4. Client architecture and conventions [PROPOSED]

These rules exist because of specific backend properties, not taste.

1. **One api module per router, typed DTOs, no ad-hoc `fetch` in components.**
   The backend offers no trustworthy read contract, so the DTO mirror in
   `src/types/api.ts` is the single place where §2.3 shapes live. Keeping it in
   one file makes the eventual switch to OpenAPI code generation mechanical.
2. **Relative URLs only** (§2.1), with a configurable `API_BASE` defaulting to
   `""`, so one build works behind the dev proxy and when FastAPI serves the SPA.
3. **Errors are values, not toasts by default.** Import and document failures
   must stay inline next to the control that caused them: `detail` strings are
   long, Russian, and actionable. Toasts are acceptable only for successes.
4. **No optimistic writes.** Responses are authoritative; reconciling
   optimistically would require read endpoints, which do not exist.
5. **Feature flags for blocked screens.** `AssignmentTable` and mass assignment
   (§3.4) ship disabled and are enabled by backend capability, not by date. This
   keeps the roadmap honest inside the product.
6. **Client validation mirrors, never replaces, the backend.** Duplicate only
   what produces the worst UX: file extension, empty file,
   `end_date >= start_date`, and the §2.6 format hints.
7. **No caching of reads.** The only GETs are assignment lookups and document
   generation; both can change behind the user's back (Swagger UI is a second
   client). Send `Cache-Control: no-store` on document fetches so a re-import
   cannot leave a stale DOCX in the browser cache.

---

## 5. End-to-end happy path

The `TheTask.md` §9 scenario as an explicit call sequence. `⟨store⟩` marks a
value the client must persist, because no later call can return it.

```text
1. GET  /                                        → availability
2. POST /import/students      (file: group.xlsx) → {created: 23, skipped: 0}
   ⟨groupName = "БПО09и-25-03"⟩                  ← typed by the user; not returned
3. POST /import/organizations (file: orgs.txt)   → {created: 9, skipped: 1}
   ⟨no organization ids⟩                          ← gap §6.1
4. POST /practice/create_supervisor {full_name, position}
                                                → 201 {id: ⟨supId⟩, ...}
5. POST /practice/create {group: "БПО09и-25-03", type: "Учебная",
                          start_date, end_date, supervisor_id: ⟨supId⟩}
                                                → 201 {id: ⟨practiceId⟩, ...}
   A 404 here is the only "does this group exist?" signal in the API.
6. POST /assignments/mass {group_id, organization_id, practice_id: ⟨practiceId⟩}
   [BLOCKED] neither group_id nor organization_id has a source  ← §6.1, §6.2
   Fallback: POST /assignments/ per student — still needs student_id ← §6.1
7. GET  /documents/directions?group=БПО09и-25-03 → directions.docx
8. GET  /documents/order                          → order.docx
9. GET  /documents/report?practice_type=Учебная   → report.docx
```

Steps 1–5 and 7–9 are implementable today. Step 6 is the critical path: without
assignments there is nothing to render — directions 404 and the order emits empty
organization cells. **That makes step 6 the first thing to fix, and it is a
backend fix, not a frontend one.**

---

## 6. Backend gaps that gate frontend work

Ordered by blocking power. Each item is small on the backend and removes an
entire class of client-side workaround.

### 6.1 Read endpoints for reference data — highest priority

Needed: `GET /groups`, `GET /students?group_id=`, `GET /organizations`,
`GET /supervisors`, `GET /practices`. The schemas already exist
(`StudentRead`, `OrganizationRead`, `SupervisorRead`, `GroupReportRead` in
`src/schemas/imports.py` and `src/schemas/reports.py`) but no router imports
them, so they are dead code today. Repositories only implement
`get_or_create`; list methods must be added.

Without these, every dropdown, the assignments table, and the group overview
requested in `TheTask.md` §9 ("возможность проверить всю информацию по группе")
are impossible. With them, §3.4 becomes buildable and `ManualIdInput` disappears.

### 6.2 Group identity reconciliation (`group_id` vs `group`)

`POST /practice/create` takes a group **name**; `POST /assignments/mass` takes a
numeric `group_id`; `GET /documents/directions` takes a group **name** again.
Pick one addressing scheme per route and expose the mapping — minimally
`GET /groups` returning `{id, name, year}`, ideally accepting `group` by name on
mass assignment for symmetry.

### 6.3 Enriched assignment read

`GET /assignments/practice/{practice_id}` returns bare foreign keys. A UI needs
`student_full_name`, `group_name`, `record_book`, `organization_name`,
`organization_address`, `supervisor_full_name`. Either extend `AssignmentRead`
with joined fields (note: `Assignment` has no ORM relationships for
student/organization/practice, so this needs an explicit join in the repository,
like `get_directions_data` already does) or add a dedicated
`GET /groups/{name}/assignments` view.

### 6.4 Round-robin distribution — requested in the task, absent in code

`TheTask.md` §5 specifies `POST /practice/company?(group=|student=)` with three
distribution variants and states "распределение выполняется приложением
автоматически по кругу". No such route, service, or repository method exists;
`mass_assign_to_group` only assigns one organization to a whole group. This is a
backend feature request, not a frontend one; the UI should show it as planned,
not present.

### 6.5 Selection of groups for order and report

`TheTask.md` §9 asks for choosing which groups enter the order and the summary
report. Today `GET /documents/order` takes no parameters at all, and
`GET /documents/report` accepts only `practice_type`. `ReportFilter.year` is
declared and unused. Adding optional `groups` query parameters (and wiring
`ReportFilter`) is required before these controls can exist.

### 6.6 Smaller inconsistencies worth recording now

- `ImportResult.errors` is never populated; either fill it or drop it from the
  schema, so clients stop carrying a dead field.
- Imports return 200 instead of 201/207; harmless, but document the choice.
- `POST /assignments/` has a trailing slash; with a proxy that rewrites paths,
  a missing slash silently becomes 307. Keep the slash in the client.
- The `/export` router is mounted with no routes; delete it or move the
  `/documents` routes onto it, otherwise every new reader re-discovers the 404.
- `PATCH /assignments/{id}` raises `ValueError` → 404, but
  `POST /assignments/mass` swallows all exceptions into one 400 string; error
  semantics are inconsistent across the same resource.
- No pagination anywhere. Fine for a prototype, but `GET /students` and the
  assignment list should be designed with limits from the start.
- Foreign keys are declared in `src/models/domain.py` but never enforced:
  `src/db/session.py` does not enable `PRAGMA foreign_keys` for SQLite, and
  `SupervisorRepository.supervisor_exists()` is defined but called by no router.
  Writes with dangling IDs succeed silently, so data quality has to be guarded by
  the service layer, not the database. This is a backend concern, but it explains
  why the client must never send an ID it did not obtain from a create response.

---

## 7. Open questions

Product and architecture decisions I deliberately did not invent answers for.
Each one changes the UI shape, so they should be settled before implementation.

1. **Is a frontend in scope at all?** `TheTask.md` §5 and §8 say Swagger UI is
   the interface and a separate frontend is out of scope, while §9 describes a
   group-review step that only a real UI can serve. Which document wins?
2. **Which stack, and where does it live?** Nothing exists yet: no
   `package.json`, no frontend directory in git, only `requirements.txt`. Is
   `frontend/` the intended home, and is a Node-based SPA acceptable, or should
   this stay server-rendered (Jinja2 templates through FastAPI) to avoid a second
   toolchain?
3. **Should the SPA be served by FastAPI in production?** That removes the CORS
   question entirely (same origin) and is the simplest deployment for a
   prototype. Confirm before configuring anything.
4. **Are the five read endpoints (§6.1) acceptable backend work, or must the UI
   live without them?** This is the single biggest fork in the road: with them,
   §3.4 is a normal admin table; without them, the product is a wizard plus
   manual ID entry, and "проверить всю информацию по группе" stays unsatisfied.
5. **Where does round-robin distribution belong?** Backend service (matching
   `TheTask.md` §5) or client-side loop of `POST /assignments/` calls? Client-side
   would need the student and organization lists anyway, and it would be
   non-atomic — 23 separate commits instead of one. Recommendation: backend.
6. **What are the legal values of `practice.type`, `practice_form`,
   `payment_type`, and `grade`?** The backend accepts arbitrary strings and the
   templates presumably expect specific ones; the report filter is an equality
   match on `type`, so free text will silently produce empty reports. A fixed
   enum (server-side, exposed to the client) is preferable to a hardcoded list in
   the frontend.

---

## 8. Delivery phases

Each phase is independently shippable and none of them pretends a missing
capability exists.

**Phase 0 — transport (no UI value on its own).** Dev proxy or CORS decision
(§2.1), typed API client with the §2.7 binary-download helper, error mapping,
`GET /` availability. Verify by downloading `order.docx` from a stub page and by
forcing the 404 path with an empty database.

**Phase 1 — the parts that work today.** Imports (§3.2) with format hints and
atomic-failure copy; supervisor and practice forms (§3.3); the Documents page
(§3.5) with the group-name input prefilled from the session registry. This is
already a usable replacement for Swagger for the main scenario.

**Phase 2 — unblock assignments (requires §6.1–§6.3 on the backend).** Reference
data reads, `group_id`/`group` reconciliation, enriched assignment read; then the
real Assignments page replaces `ManualIdInput`, and the group review from
`TheTask.md` §9 becomes possible.

**Phase 3 — features the task asks for but the code lacks (§6.4–§6.5).**
Round-robin distribution endpoint plus its UI control; group selection for the
order and the report. Ship behind the feature flags required by §4 point 5 so the
buttons never lie.

**Phase 4 — hygiene.** Replace hand-written DTOs with generated types from the
OpenAPI document once the route set stabilises; add pagination support; drop the
dead `/export` router and unused schemas.

---

## 9. Verification checklist for whoever implements this

Not a test suite — a list of behaviours that are easy to get wrong given the
backend facts above. Each is checkable manually against a running server.

- [ ] Empty-database order download shows the Russian 404 message, not a saved
      0-byte or JSON `.docx` file (§2.7).
- [ ] Re-importing the same Excel reports `created: 0, skipped: N` and leaves the
      database unchanged (§2.5).
- [ ] An Excel with one invalid record book row imports nothing at all (§2.5).
- [ ] A UTF-8 organizations file is rejected with the cp1251 message (§2.6).
- [ ] Directions for a group that exists but has no assignments shows the 404
      with a link to Assignments (§3.5).
- [ ] Practice creation for an unknown group surfaces `Группа ... не найдена`
      and routes the user to Imports (§3.3).
- [ ] `PATCH` sends only changed fields and never includes `student_id` or
      `practice_id` (§2.3).
- [ ] Reloading the page keeps the session registry populated, and every
      registry-sourced value is visibly labelled as client-side (§3.0).
- [ ] No request URL is absolute; killing the proxy reproduces a network error,
      not a CORS error, in the browser console (§2.1).
- [ ] Mass assignment is visibly disabled, with a tooltip naming the missing
      endpoint, rather than hidden or broken (§3.4, §6.2).

