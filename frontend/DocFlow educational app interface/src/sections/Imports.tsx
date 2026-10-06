import { useRef, useState, type FormEvent } from "react";

import { api } from "../api";
import { importSummary } from "../format";
import { useAction } from "../useAction";
import { ArrowIcon, Card, Field, SectionHeading, StatusLine } from "../ui";

interface ImportsSectionProps {
  /** Reloads the dictionaries so freshly imported rows appear in the selects. */
  onImported: () => Promise<void>;
}

function ImportCard({
  step,
  title,
  hint,
  accept,
  fileLabel,
  buttonLabel,
  requiredExtension,
  upload,
  onImported,
}: {
  step: string;
  title: string;
  hint: string;
  accept: string;
  fileLabel: string;
  buttonLabel: string;
  requiredExtension: string;
  upload: (file: File) => Promise<{ created: number; skipped: number; errors: string[] }>;
  onImported: () => Promise<void>;
}) {
  const [file, setFile] = useState<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { feedback, pending, run, fail } = useAction();

  function clearFile() {
    setFile(null);
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!file) {
      fail(`Выберите файл формата ${requiredExtension}`);
      return;
    }
    if (!file.name.toLowerCase().endsWith(requiredExtension)) {
      fail(`Ожидается файл ${requiredExtension}: ${file.name}`);
      return;
    }

    const succeeded = await run(async () => {
      const result = await upload(file);
      await onImported();
      return importSummary(result);
    }, "Загрузка файла…");

    // Keep the selected file on failure so the user can retry it as-is.
    if (succeeded) {
      clearFile();
    }
  }

  return (
    <Card className="form-card" step={step} title={title}>
      <form onSubmit={handleSubmit}>
        <div className="fields-stack">
          <Field label={fileLabel} hint={`Расширение: ${requiredExtension}`}>
            <span className="file-picker">
              <input
                ref={inputRef}
                className="sr-only"
                type="file"
                accept={accept}
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
              <span className="file-action">Выбрать файл</span>
              <span className="file-name">{file ? file.name : "файл не выбран"}</span>
            </span>
          </Field>

          <div className="card-action">
            <button className="primary-button" type="submit" disabled={pending}>
              {pending ? "Отправка…" : buttonLabel}
              <ArrowIcon />
            </button>
            <StatusLine feedback={feedback} />
          </div>
        </div>
      </form>
      <p className="card-hint">{hint}</p>
    </Card>
  );
}

export function ImportsSection({ onImported }: ImportsSectionProps) {
  return (
    <section className="section" id="imports">
      <div>
        <SectionHeading
          eyebrow="Шаг 01 — данные"
          title="Импорт"
          description="Загрузите список студентов и перечень организаций. Обе кнопки отправляют файл на сервер, а после успешного импорта справочники обновляются автоматически."
        />

        <div className="split-layout">
          <ImportCard
            step="01.1"
            title="Студенты"
            hint="В Excel название группы читается из заголовка «Список студентов группы …». Повторный импорт не создаёт дублей."
            accept=".xlsx"
            fileLabel="Файл студентов"
            buttonLabel="Импортировать студентов"
            requiredExtension=".xlsx"
            upload={(file) => api.importStudents(file)}
            onImported={onImported}
          />
          <ImportCard
            step="01.2"
            title="Организации"
            hint="Текстовый файл в кодировке Windows-1251, по одной организации в строке: «Название, адрес». Адрес необязателен."
            accept=".txt"
            fileLabel="Файл организаций"
            buttonLabel="Импортировать организации"
            requiredExtension=".txt"
            upload={(file) => api.importOrganizations(file)}
            onImported={onImported}
          />
        </div>
      </div>
    </section>
  );
}