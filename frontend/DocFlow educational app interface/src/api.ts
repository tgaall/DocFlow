/**
 * Typed client for the DocFlow FastAPI backend.
 *
 * The React app is served by the same FastAPI process under `/app`, so every
 * request uses a relative path on the current origin: no CORS setup and no
 * configurable base URL are required.
 */

const DOCX_MEDIA_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** Error carrying the message the backend returned in `detail`. */
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/** Response shapes mirror src/schemas/imports.py and src/schemas/assignments.py. */
export interface Group {
  id: number;
  name: string;
  department: string | null;
  year: number;
}

export interface Student {
  id: number;
  full_name: string;
  group_id: number;
  record_book: number;
}

export interface Organization {
  id: number;
  name: string;
  address: string | null;
}

export interface Supervisor {
  id: number;
  full_name: string;
  position: string;
}

export interface Practice {
  id: number;
  type: string;
  start_date: string;
  end_date: string;
  group_id: number;
  supervisor_id: number | null;
}

export interface ImportResult {
  created: number;
  skipped: number;
  errors: string[];
}

export interface Assignment {
  id: number;
  student_id: number;
  organization_id: number;
  practice_id: number;
  supervisor_id: number | null;
  practice_form: string | null;
  payment_type: string | null;
  grade: string | null;
}

/**
 * `POST /practice/create` takes the group *name*, while
 * `POST /assignments/mass` takes `group_id`. Keeping both payloads separate
 * makes that backend inconsistency impossible to mix up in the UI.
 */
export interface PracticeCreatePayload {
  type: string;
  start_date: string;
  end_date: string;
  group: string;
  supervisor_id?: number;
}

export interface SupervisorCreatePayload {
  full_name: string;
  position: string;
}

export interface AssignmentCreatePayload {
  student_id: number;
  organization_id: number;
  practice_id: number;
  supervisor_id?: number;
  practice_form?: string;
  payment_type?: string;
  grade?: string;
}

export interface MassAssignmentPayload {
  group_id: number;
  organization_id: number;
  practice_id: number;
  supervisor_id?: number;
  practice_form?: string;
  payment_type?: string;
}

/**
 * FastAPI reports errors as `{"detail": ...}`. `detail` is a plain string for
 * HTTPException and a list of validation items for 422 responses, so both
 * shapes have to be flattened into something readable.
 */
async function errorFromResponse(response: Response): Promise<ApiError> {
  const fallback = `Ошибка запроса (${response.status})`;

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return new ApiError(response.status, fallback);
  }

  const detail =
    body && typeof body === "object"
      ? (body as { detail?: unknown }).detail
      : undefined;

  if (typeof detail === "string" && detail.trim() !== "") {
    return new ApiError(response.status, detail);
  }

  if (Array.isArray(detail) && detail.length > 0) {
    const items = detail.map((item) => {
      const entry = item as { loc?: (string | number)[]; msg?: string };
      const field = (entry.loc ?? [])
        .filter((part): part is string => typeof part === "string" && part !== "body")
        .join(".");
      const message = entry.msg ?? "некорректное значение";
      return field ? `${field}: ${message}` : message;
    });
    return new ApiError(response.status, items.join("; "));
  }

  return new ApiError(response.status, fallback);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  if (!response.ok) {
    throw await errorFromResponse(response);
  }
  return (await response.json()) as T;
}

function postJson<T>(path: string, payload: unknown): Promise<T> {
  return request<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

/** Uploads a file to the import endpoints, which expect the field name `file`. */
function postFile<T>(path: string, file: File): Promise<T> {
  const form = new FormData();
  form.append("file", file);
  // Content-Type is intentionally not set: the browser must generate the
  // multipart boundary itself.
  return request<T>(path, { method: "POST", body: form });
}

export const api = {
  getGroups: () => request<Group[]>("/groups"),
  getStudents: () => request<Student[]>("/students"),
  getOrganizations: () => request<Organization[]>("/organizations"),
  getSupervisors: () => request<Supervisor[]>("/supervisors"),
  getPractices: () => request<Practice[]>("/practices"),

  importStudents: (file: File) =>
    postFile<ImportResult>("/import/students", file),
  importOrganizations: (file: File) =>
    postFile<ImportResult>("/import/organizations", file),

  createSupervisor: (payload: SupervisorCreatePayload) =>
    postJson<Supervisor>("/practice/create_supervisor", payload),
  createPractice: (payload: PracticeCreatePayload) =>
    postJson<Practice & { group: string }>("/practice/create", payload),

  createAssignment: (payload: AssignmentCreatePayload) =>
    postJson<Assignment>("/assignments/", payload),
  massAssign: (payload: MassAssignmentPayload) =>
    postJson<Assignment[]>("/assignments/mass", payload),
};

function fileNameFromHeaders(headers: Headers, fallback: string): string {
  const disposition = headers.get("content-disposition");
  if (!disposition) {
    return fallback;
  }

  const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (encoded) {
    try {
      return decodeURIComponent(encoded[1].trim().replace(/^"|"$/g, ""));
    } catch {
      // Fall through to the plain filename parameter.
    }
  }

  const plain = disposition.match(/filename="?([^";]+)"?/i);
  return plain ? plain[1].trim() : fallback;
}

/**
 * Downloads a DOCX document and hands it to the browser as a file save.
 *
 * The response is verified before saving: a JSON error body must never be
 * written to disk under a `.docx` name, which is what the prototype did.
 */
export async function downloadDocument(
  url: string,
  fallbackFileName: string,
): Promise<string> {
  const response = await fetch(url);
  const contentType = response.headers.get("content-type") ?? "";

  if (!response.ok) {
    throw await errorFromResponse(response);
  }
  if (!contentType.includes(DOCX_MEDIA_TYPE)) {
    throw new ApiError(response.status, "Сервер вернул не DOCX-документ");
  }

  const blob = await response.blob();
  const fileName = fileNameFromHeaders(response.headers, fallbackFileName);
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);

  return fileName;
}

export function directionsUrl(group: string): string {
  const params = new URLSearchParams({ group });
  return `/documents/directions?${params.toString()}`;
}

export function orderUrl(practiceType: string, groups: string[]): string {
  const params = new URLSearchParams({ practice_type: practiceType });
  groups.forEach((group) => params.append("groups", group));
  return `/documents/order?${params.toString()}`;
}

export function reportUrl(practiceType: string, groups: string[]): string {
  const params = new URLSearchParams();
  if (practiceType.trim() !== "") {
    params.set("practice_type", practiceType.trim());
  }
  groups.forEach((group) => params.append("groups", group));
  const query = params.toString();
  return query ? `/documents/report?${query}` : "/documents/report";
}