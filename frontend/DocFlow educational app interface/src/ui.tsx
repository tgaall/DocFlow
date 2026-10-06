import type { ReactNode, SelectHTMLAttributes } from "react";

/** Shared `<datalist>` id for practice type suggestions. */
export const PRACTICE_TYPE_LIST_ID = "practice-types";

export const PRACTICE_TYPES = ["Учебная", "Производственная"];

export const PRACTICE_FORMS = ["Очно", "Дистанционно"];

export const PAYMENT_TYPES = ["С оплатой", "Без оплаты"];

export type FeedbackKind = "idle" | "pending" | "success" | "error";

/** Single shape for every per-form status line in the UI. */
export interface Feedback {
  kind: FeedbackKind;
  text: string;
}

export const idleFeedback: Feedback = { kind: "idle", text: "" };

export function Card({
  className,
  step,
  title,
  children,
}: {
  className: string;
  step: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <article className={className}>
      <div className="card-topline">
        <h3>{title}</h3>
        <span className="step-number">{step}</span>
      </div>
      {children}
    </article>
  );
}

/**
 * Placeholder option that also covers the "nothing to choose from yet" case,
 * so a form never looks broken when the corresponding dictionary is empty.
 */
export function EmptyOption({
  placeholder,
  isEmpty,
  emptyText,
}: {
  placeholder: string;
  isEmpty: boolean;
  emptyText: string;
}) {
  if (isEmpty) {
    return <option value="">{emptyText}</option>;
  }
  return <option value="">{placeholder}</option>;
}

export function PracticeTypeList() {
  return (
    <datalist id={PRACTICE_TYPE_LIST_ID}>
      {PRACTICE_TYPES.map((type) => (
        <option key={type} value={type} />
      ))}
    </datalist>
  );
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className="select-wrap">
      <select {...props} />
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path d="m4 6 4 4 4-4" />
      </svg>
    </span>
  );
}

/** Multi-select rendered without the chevron overlay, which would be useless. */
export function MultiSelect(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} className={`multi-select ${props.className ?? ""}`.trim()} />
  );
}

export function StatusLine({
  feedback,
  idleText,
}: {
  feedback: Feedback;
  idleText?: string;
}) {
  if (feedback.kind === "idle") {
    return idleText ? <span className="generation">{idleText}</span> : null;
  }

  const className =
    feedback.kind === "error"
      ? "error-message"
      : feedback.kind === "pending"
        ? "pending-message"
        : "success-message";

  return (
    <span
      className={className}
      role={feedback.kind === "error" ? "alert" : "status"}
      aria-live="polite"
    >
      {feedback.text}
    </span>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="section-heading">
      <span className="eyebrow">{eyebrow}</span>
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
    </div>
  );
}

export function ArrowIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M4 10h11M11 6l4 4-4 4" />
    </svg>
  );
}

export function DownloadIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M10 3v10m0 0 4-4m-4 4L6 9M4 16h12" />
    </svg>
  );
}

/**
 * Dictionaries load from several endpoints. Showing one shared banner instead
 * of silently rendering empty selects keeps a backend outage visible.
 */
export function DictionaryNotice({
  loading,
  error,
  onRetry,
}: {
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  if (error === null && !loading) {
    return null;
  }

  return (
    <div className="dictionary-notice" role={error ? "alert" : "status"}>
      <span className="api-kicker">Справочники</span>
      <strong>
        {error
          ? `Не удалось загрузить данные: ${error}`
          : "Загрузка групп, студентов, организаций и практик…"}
      </strong>
      {error && (
        <button className="ghost-button" type="button" onClick={onRetry}>
          Повторить
        </button>
      )}
    </div>
  );
}