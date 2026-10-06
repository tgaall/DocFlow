import { useState, type FormEvent } from "react";

import {
  directionsUrl,
  downloadDocument,
  orderUrl,
  reportUrl,
  type Group,
} from "../api";
import { useAction } from "../useAction";
import {
  Card,
  DownloadIcon,
  EmptyOption,
  Field,
  MultiSelect,
  PRACTICE_TYPE_LIST_ID,
  Select,
  SectionHeading,
  StatusLine,
} from "../ui";

interface DocumentsProps {
  groups: Group[];
  dictionariesLoading: boolean;
}

function GroupOptions({ groups }: { groups: Group[] }) {
  return (
    <>
      {groups.map((group) => (
        <option key={group.id} value={group.name}>
          {group.name}
        </option>
      ))}
    </>
  );
}

/**
 * Directions are generated for a single group, identified by its name
 * (`GET /documents/directions?group=`), not by id.
 */
function DirectionsCard({ groups, dictionariesLoading }: DocumentsProps) {
  const [groupName, setGroupName] = useState("");
  const { feedback, pending, run, fail } = useAction();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (groupName === "") {
      fail("Выберите группу");
      return;
    }

    await run(async () => {
      const fileName = await downloadDocument(
        directionsUrl(groupName),
        "directions.docx",
      );
      return `Файл сохранён: ${fileName}`;
    }, "Генерация направлений…");
  }

  return (
    <Card className="document-card" step="04.1" title="Направления">
      <div>
        <span className="doc-format">.DOCX</span>
        <p>
          Единый документ с направлениями на практику для всех студентов
          выбранной группы.
        </p>
      </div>

      <form className="document-action" onSubmit={handleSubmit}>
        <div className="fields-stack">
          <Field label="Группа">
            <Select
              value={groupName}
              onChange={(event) => setGroupName(event.target.value)}
              disabled={dictionariesLoading}
              required
            >
              <EmptyOption
                placeholder="Выберите группу"
                isEmpty={groups.length === 0}
                emptyText="Группы не найдены"
              />
              <GroupOptions groups={groups} />
            </Select>
          </Field>

          <button className="secondary-button" type="submit" disabled={pending}>
            <DownloadIcon />
            {pending ? "Генерация…" : "Скачать направления"}
          </button>
          <StatusLine feedback={feedback} idleText="Требуется хотя бы одно назначение студентов" />
        </div>
      </form>
    </Card>
  );
}

interface OrderReportProps extends DocumentsProps {
  variant: "order" | "report";
}

/**
 * Order and report share the same controls: a practice type and an optional
 * multi-selection of groups. The backend treats an empty `groups` list as
 * "all groups", so nothing is invented on the client side.
 */
function OrderReportCard({ variant, groups, dictionariesLoading }: OrderReportProps) {
  const [practiceType, setPracticeType] = useState("");
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const { feedback, pending, run, fail } = useAction();

  const isOrder = variant === "order";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isOrder && practiceType.trim() === "") {
      fail("Укажите тип практики для приказа");
      return;
    }

    await run(async () => {
      const url = isOrder
        ? orderUrl(practiceType.trim(), selectedGroups)
        : reportUrl(practiceType.trim(), selectedGroups);
      const fileName = await downloadDocument(
        url,
        isOrder ? "order.docx" : "report.docx",
      );
      return `Файл сохранён: ${fileName}`;
    }, isOrder ? "Генерация приказа…" : "Генерация отчёта…");
  }

  return (
    <Card
      className="document-card"
      step={isOrder ? "04.2" : "04.3"}
      title={isOrder ? "Приказ" : "Отчёт"}
    >
      <div>
        <span className="doc-format">.DOCX</span>
        <p>
          {isOrder
            ? "Приказ о распределении студентов по выбранным группам или по всем сразу."
            : "Сводный отчёт по прохождению практики за выбранные группы."}
        </p>
      </div>

      <form className="document-action" onSubmit={handleSubmit}>
        <div className="fields-stack">
          <Field
            label="Тип практики"
            hint={isOrder ? "Обязательно для приказа" : "Необязательно"}
          >
            <input
              list={PRACTICE_TYPE_LIST_ID}
              value={practiceType}
              onChange={(event) => setPracticeType(event.target.value)}
              placeholder="Учебная"
              required={isOrder}
            />
          </Field>

          <Field
            label="Группы"
            hint={groups.length === 0 ? "Группы не найдены" : "Пусто — все группы"}
          >
            <MultiSelect
              multiple
              disabled={dictionariesLoading || groups.length === 0}
              value={selectedGroups}
              onChange={(event) =>
                setSelectedGroups(
                  Array.from(event.target.selectedOptions, (option) => option.value),
                )
              }
            >
              <GroupOptions groups={groups} />
            </MultiSelect>
          </Field>

          <button className="secondary-button" type="submit" disabled={pending}>
            <DownloadIcon />
            {pending ? "Генерация…" : isOrder ? "Скачать приказ" : "Скачать отчёт"}
          </button>
          <StatusLine feedback={feedback} />
        </div>
      </form>
    </Card>
  );
}

export function DocumentsSection(props: DocumentsProps) {
  return (
    <section className="section documents-section" id="documents">
      <div>
        <SectionHeading
          eyebrow="Шаг 04 — документы"
          title="Готовые документы"
          description="Направления, приказ и отчёт собираются из сохранённых распределений и скачиваются в формате DOCX."
        />

        <div className="documents-grid">
          <DirectionsCard {...props} />
          <OrderReportCard variant="order" {...props} />
          <OrderReportCard variant="report" {...props} />
        </div>
      </div>
    </section>
  );
}