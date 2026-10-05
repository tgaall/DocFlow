# DocFlow Frontend Plan

## Goal

Create a simple visual interface for demonstrating the DocFlow project to an
instructor. The frontend is a lightweight presentation and interaction layer for
the existing FastAPI API, not a production-grade application. Keep the code easy
to understand and avoid unnecessary architecture, dependencies, and validation.

## 1. Technology and serving

- Use a static frontend in this directory: `index.html` and `app.js`.
- Use vanilla JavaScript; do not add Node.js, a build step, a frontend framework,
  or Jinja2.
- Load Pico.css from its CDN for simple, readable styling.
- Have FastAPI serve this directory at `/app` using
  `app.mount("/app", StaticFiles(directory="frontend", html=True))`.
- Mount at `/app`, **not** `/`, so the existing `GET /` health endpoint remains
  available.
- The frontend and API share one origin. Do not add a proxy or CORS setup.
- Make API requests only to relative URLs, such as `/import/students`.

## 2. Interface

Build a single page with clear navigation or sections for the main demonstration
workflow:

1. **Overview** — a short project introduction and links to the main actions.
2. **Imports** — upload a student `.xlsx` file and an organizations `.txt` file;
   show the backend's created/skipped result or error.
3. **Practice** — create a supervisor and a practice using the available API.
4. **Assignments** — create a per-student assignment or assign one organization
   to a whole group, using choices loaded from the API.
5. **Documents** — generate and download directions, an order, or a report.

Keep the layout simple and visually clear when presented on a screen. Use Pico.css
elements and a small amount of custom CSS only if needed. No component system,
client-side router, persistent state store, or elaborate dashboard is required.

## 3. API integration

Use the existing backend routes and relative URLs. At page load, fetch the
reference data needed to populate selectors: groups, students, organizations,
supervisors, and practices. Refresh the relevant list after a successful import
or create operation where it helps the demonstration.

The current API includes:

- `GET /` for the existing health check.
- `GET /groups`, `/students`, `/organizations`, `/supervisors`, `/practices` for
  reference data.
- `POST /import/students` and `POST /import/organizations` for file imports.
- `POST /practice/create_supervisor` and `POST /practice/create` for setup.
- `POST /assignments/` for an individual assignment. Preserve the trailing slash.
- `POST /assignments/mass` for assigning one organization to a group. This is
  not circular distribution.
- `GET /documents/directions`, `/documents/order`, and `/documents/report` for
  document generation.

Use `FormData` for file uploads and let the browser set the multipart content
type. For document generation, handle the response as a download when successful
and show the backend error message when the request fails; do not save an error
response as a DOCX file. Keep other error handling straightforward and display
the API's `detail` when available.

## 4. Form fields and suggestions

The backend accepts arbitrary strings for several fields, so keep them as text
inputs and use HTML `<datalist>` elements for known suggestions rather than
restrictive selects. Confirmed practice type suggestions:

```text
Учебная
Производственная
```

Keep `practice_form`, `payment_type`, and `grade` as text inputs. Do not invent
fixed accepted values or datalist options for them; add suggestions only when
they are confirmed by the project requirements or examples.

Use selectors for entities that have API-provided choices (groups, students,
organizations, supervisors, and practices), submitting the identifier or group
name required by the selected endpoint.

## 5. Demonstration scope

- Do not implement or display circular/round-robin distribution. It is outside
  this frontend's scope.
- Do not build import history, a persistent client-side registry, pagination,
  generated API types, or advanced state management.
- Keep validation to basic browser form requirements and what is needed to submit
  a usable request. The goal is to demonstrate existing project functionality,
  not to duplicate backend validation in the browser.
- Keep API limitations visible only where they affect the demonstrated workflow;
  do not add speculative features.

## 6. Completion checklist

- [x] `/app` serves the frontend and `GET /` still returns the health response.
- [x] Pico.css loads from its CDN; the page works without a Node install or build.
- [x] All API requests use relative URLs on the same origin.
- [x] Reference data populates the relevant form selectors.
- [x] Imports, practice setup, assignments, and document generation provide
      visible success or error feedback.
- [x] Individual assignment posts to `/assignments/` with the trailing slash.
- [x] Successful document responses download as files; failed responses show an
      error instead of downloading JSON as DOCX.
- [x] The UI does not include circular distribution.