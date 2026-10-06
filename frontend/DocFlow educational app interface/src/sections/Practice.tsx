import { useState, type FormEvent } from "react";

import { api, type Group, type Supervisor } from "../api";
import { toOptionalNumber } from "../format";
import { useAction } from "../useAction";
import {
  ArrowIcon,
  Card,
  EmptyOption,
  Field,
  PRACTICE_TYPE_LIST_ID,
  Select,
  SectionHeading,
  StatusLine,
} from "../ui";

interface PracticeSectionProps {
  groups: Group[];
  supervisors: Supervisor[];
  onCreate: () => Promise<void>;
}

function SupervisorCard({ onCreate }: { onCreate: () => Promise<void> }) {
  const [fullName, setFullName] = useState("");
  const [position, setPosition] = useState("");
  const { feedback, pending, run, fail } = useAction();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (fullName.trim() === "" || position.trim() === "") {
      fail("Заполните ФИО и должность руководителя");
      return;
    }

    const succeeded = await run(async () => {
      const supervisor = await api.createSupervisor({
        full_name: fullName.trim(),
        position: position.trim(),
      });
      await onCreate();
      return `Создан руководитель: ${supervisor.full_name}`;
    });

    if (succeeded) {
      setFullName("");
      setPosition("");
    }
  }

  return (
    <Card className="form-card" step="02.1" title="Руководитель практики">
      <form onSubmit={handleSubmit}>
        <div className="fields-stack">
          <Field label="ФИО">
            <input
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              placeholder="Иванов Иван Иванович"
              required
            />
          </Field>
          <Field label="Должность">
            <input
              value={position}
              onChange={(event) => setPosition(event.target.value)}
              placeholder="Старший преподаватель"
              required
            />
          </Field>
          <div className="card-action">
            <button className="primary-button" type="submit" disabled={pending}>
              {pending ? "Сохранение…" : "Создать руководителя"}
              <ArrowIcon />
            </button>
            <StatusLine feedback={feedback} />
          </div>
        </div>
      </form>
      <p className="card-hint">
        Руководители появляются в списке при создании практики и назначении
        студентов.
      </p>
    </Card>
  );
}

function PracticeCard({ groups, supervisors, onCreate }: PracticeSectionProps) {
  const [groupName, setGroupName] = useState("");
  const [type, setType] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [supervisorId, setSupervisorId] = useState("");
  const { feedback, pending, run, fail } = useAction();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (groupName === "") {
      fail("Выберите группу");
      return;
    }
    if (type.trim() === "") {
      fail("Укажите тип практики");
      return;
    }
    if (startDate === "" || endDate === "") {
      fail("Укажите даты начала и окончания практики");
      return;
    }
    if (startDate > endDate) {
      fail("Дата начала не может быть позже даты окончания");
      return;
    }

    const succeeded = await run(async () => {
      await api.createPractice({
        group: groupName,
        type: type.trim(),
        start_date: startDate,
        end_date: endDate,
        supervisor_id: toOptionalNumber(supervisorId),
      });
      await onCreate();
      return `Практика создана для группы ${groupName}`;
    });

    if (succeeded) {
      setGroupName("");
      setType("");
      setStartDate("");
      setEndDate("");
      setSupervisorId("");
    }
  }

  return (
    <Card className="form-card" step="02.2" title="Практика">
      <form onSubmit={handleSubmit}>
        <div className="fields-stack">
          <Field label="Группа" hint="Группы берутся из импортированного списка студентов">
            <Select
              value={groupName}
              onChange={(event) => setGroupName(event.target.value)}
              required
            >
              <EmptyOption
                placeholder="Выберите группу"
                isEmpty={groups.length === 0}
                emptyText="Импортируйте список студентов"
              />
              {groups.map((group) => (
                <option key={group.id} value={group.name}>
                  {group.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Тип практики" hint="Можно выбрать вариант или ввести свой">
            <input
              list={PRACTICE_TYPE_LIST_ID}
              value={type}
              onChange={(event) => setType(event.target.value)}
              placeholder="Учебная"
              required
            />
          </Field>

          <div className="field-grid">
            <Field label="Дата начала">
              <input
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
                required
              />
            </Field>
            <Field label="Дата окончания">
              <input
                type="date"
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
                required
              />
            </Field>
          </div>

          <Field label="Руководитель">
            <Select
              value={supervisorId}
              onChange={(event) => setSupervisorId(event.target.value)}
            >
              <option value="">Без руководителя</option>
              {supervisors.map((supervisor) => (
                <option key={supervisor.id} value={String(supervisor.id)}>
                  {supervisor.full_name} — {supervisor.position}
                </option>
              ))}
            </Select>
          </Field>

          <div className="card-action">
            <button className="primary-button" type="submit" disabled={pending}>
              {pending ? "Сохранение…" : "Создать практику"}
              <ArrowIcon />
            </button>
            <StatusLine feedback={feedback} />
          </div>
        </div>
      </form>
      <p className="card-hint">
        Практика создаётся для одной группы. Она появляется в формах
        распределения и в генерации документов.
      </p>
    </Card>
  );
}

export function PracticeSection(props: PracticeSectionProps) {
  return (
    <section className="section" id="practice">
      <div>
        <SectionHeading
          eyebrow="Шаг 02 — настройка"
          title="Практика"
          description="Заведите руководителей и откройте практику для нужных групп. Без этих данных распределение студентов невозможно."
        />

        <div className="split-layout">
          <SupervisorCard onCreate={props.onCreate} />
          <PracticeCard {...props} />
        </div>
      </div>
    </section>
  );
}