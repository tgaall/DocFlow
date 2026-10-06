import type { Group, ImportResult, Practice } from "./api";

/** `2026-06-01` -> `01.06.2026` (the convention used across the backend docs). */
export function formatDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-");
  return year && month && day ? `${day}.${month}.${year}` : isoDate;
}

export function practiceLabel(practice: Practice, groups: Group[]): string {
  const group = groups.find((item) => item.id === practice.group_id);
  const groupName = group ? group.name : `группа #${practice.group_id}`;
  return `${practice.type} — ${groupName} (${formatDate(practice.start_date)} – ${formatDate(
    practice.end_date,
  )})`;
}

export function importSummary(result: ImportResult): string {
  const base = `Создано: ${result.created}, пропущено: ${result.skipped}`;
  if (result.errors.length === 0) {
    return base;
  }
  return `${base}. Замечания: ${result.errors.join("; ")}`;
}

/** Empty form values must be omitted so the backend applies its defaults. */
export function toOptionalNumber(value: string): number | undefined {
  if (value === "") {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function toOptionalText(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}