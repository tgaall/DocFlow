import { useState, type FormEvent } from "react";

import { api, type Group, type Organization, type Practice, type Student, type Supervisor } from "../api";
import { practiceLabel, toOptionalNumber, toOptionalText } from "../format";
import { useAction } from "../useAction";
import {
  ArrowIcon,
  Card,
  EmptyOption,
  Field,
  PAYMENT_TYPES,
  PRACTICE_FORMS,
  Select,
  SectionHeading,
  StatusLine,
} from "../ui";

interface AllocationProps {
  groups: Group[];
  students: Student[];
  organizations: Organization[];
  supervisors: Supervisor[];
  practices: Practice[];
}

function IndividualCard({
  students,
  organizations,
  supervisors,
  practices,
  groups,
}: AllocationProps) {
  const [studentId, setStudentId] = useState("");
  const [organizationId, setOrganizationId] = useState("");
  const [practiceId, setPracticeId] = useState("");
  const [supervisorId, setSupervisorId] = useState("");
  const [practiceForm, setPracticeForm] = useState("");
  const [paymentType, setPaymentType] = useState("");
  const [grade, setGrade] = useState("");
  const { feedback, pending, run, fail } = useAction();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (studentId === "" || organizationId === "" || practiceId === "") {
      fail("Выберите студента, организацию и практику");
      return;
    }

    const succeeded = await run(async () => {
      await api.createAssignment({
        student_id: Number(studentId),
        organization_id: Number(organizationId),
        practice_id: Number(practiceId),
        supervisor_id: toOptionalNumber(supervisorId),
        practice_form: toOptionalText(practiceForm),
        payment_type: toOptionalText(paymentType),
        grade: toOptionalText(grade),
      });
      const student = students.find((item) => String(item.id) === studentId);
      return `Распределение сохранено: ${student?.full_name ?? `студент #${studentId}`}`;
    });

    // Only the per-student details are cleared so the next student in the same
    // organization/practice can be assigned without reselecting them.
    if (succeeded) {
      setPracticeForm("");
      setPaymentType("");
      setGrade("");
    }
  }

  return (
    <Card className="form-card" step="03.1" title="Индивидуальное назначение">
      <form onSubmit={handleSubmit}>
        <div className="fields-stack">
          <Field label="Студент">
            <Select value={studentId} onChange={(e) => setStudentId(e.target.value)} required>
              <EmptyOption
                placeholder="Выберите студента"
                isEmpty={students.length === 0}
                emptyText="Сначала импортируйте студентов"
              />
              {students.map((student) => (
                <option key={student.id} value={String(student.id)}>
                  {student.full_name} · зач. {student.record_book}
                </option>
              ))}
            </Select>
          </Field>

          <div className="field-grid">
            <Field label="Организация">
              <Select
                value={organizationId}
                onChange={(e) => setOrganizationId(e.target.value)}
                required
              >
                <EmptyOption
                  placeholder="Выберите организацию"
                  isEmpty={organizations.length === 0}
                  emptyText="Сначала импортируйте организации"
                />
                {organizations.map((organization) => (
                  <option key={organization.id} value={String(organization.id)}>
                    {organization.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Практика">
              <Select value={practiceId} onChange={(e) => setPracticeId(e.target.value)} required>
                <EmptyOption
                  placeholder="Выберите практику"
                  isEmpty={practices.length === 0}
                  emptyText="Сначала создайте практику"
                />
                {practices.map((practice) => (
                  <option key={practice.id} value={String(practice.id)}>
                    {practiceLabel(practice, groups)}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Field label="Руководитель">
            <Select value={supervisorId} onChange={(e) => setSupervisorId(e.target.value)}>
              <option value="">Без руководителя</option>
              {supervisors.map((supervisor) => (
                <option key={supervisor.id} value={String(supervisor.id)}>
                  {supervisor.full_name} — {supervisor.position}
                </option>
              ))}
            </Select>
          </Field>

          <div className="field-grid three">
            <Field label="Форма практики">
              <Select value={practiceForm} onChange={(e) => setPracticeForm(e.target.value)}>
                <option value="">Не указана</option>
                {PRACTICE_FORMS.map((form) => (
                  <option key={form} value={form}>
                    {form}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Тип оплаты">
              <Select value={paymentType} onChange={(e) => setPaymentType(e.target.value)}>
                <option value="">Не указан</option>
                {PAYMENT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Оценка" hint="Произвольный текст">
              <input value={grade} onChange={(e) => setGrade(e.target.value)} placeholder="Зачтено" />
            </Field>
          </div>

          <div className="card-action">
            <button className="primary-button" type="submit" disabled={pending}>
              {pending ? "Сохранение…" : "Сохранить распределение"}
              <ArrowIcon />
            </button>
            <StatusLine feedback={feedback} />
          </div>
        </div>
      </form>
      <p className="card-hint">
        Если у студента уже есть назначение на эту практику, оно будет обновлено.
      </p>
    </Card>
  );
}

function MassCard({ groups, organizations, supervisors, practices }: AllocationProps) {
  const [groupId, setGroupId] = useState("");
  const [organizationId, setOrganizationId] = useState("");
  const [practiceId, setPracticeId] = useState("");
  const [supervisorId, setSupervisorId] = useState("");
  const [practiceForm, setPracticeForm] = useState("");
  const [paymentType, setPaymentType] = useState("");
  const { feedback, pending, run, fail } = useAction();

  // The backend does not enforce it, but assigning a practice of another group
  // is always a mistake, so the list is filtered by the selected group.
  const groupPractices = practices.filter(
    (practice) => String(practice.group_id) === groupId,
  );
  const selectedGroup = groups.find((group) => String(group.id) === groupId);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (groupId === "" || organizationId === "" || practiceId === "") {
      fail("Выберите группу, организацию и практику");
      return;
    }

    const succeeded = await run(async () => {
      const result = await api.massAssign({
        group_id: Number(groupId),
        organization_id: Number(organizationId),
        practice_id: Number(practiceId),
        supervisor_id: toOptionalNumber(supervisorId),
        practice_form: toOptionalText(practiceForm),
        payment_type: toOptionalText(paymentType),
      });
      return `Назначено студентов: ${result.length}`;
    });

    if (succeeded) {
      setPracticeForm("");
      setPaymentType("");
    }
  }

  return (
    <Card className="form-card accented-card" step="03.2" title="Массовое назначение">
      <form onSubmit={handleSubmit}>
        <div className="fields-stack">
          <Field label="Группа" hint="Одна организация на всю группу">
            <Select value={groupId} onChange={(e) => setGroupId(e.target.value)} required>
              <EmptyOption
                placeholder="Выберите группу"
                isEmpty={groups.length === 0}
                emptyText="Сначала импортируйте студентов"
              />
              {groups.map((group) => (
                <option key={group.id} value={String(group.id)}>
                  {group.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Практика" hint="Показаны только практики выбранной группы">
            <Select value={practiceId} onChange={(e) => setPracticeId(e.target.value)} required>
              <EmptyOption
                placeholder="Выберите практику"
                isEmpty={groupPractices.length === 0}
                emptyText={
                  groupId === "" ? "Сначала выберите группу" : "Для этой группы практик нет"
                }
              />
              {groupPractices.map((practice) => (
                <option key={practice.id} value={String(practice.id)}>
                  {practiceLabel(practice, groups)}
                </option>
              ))}
            </Select>
          </Field>

          <div className="field-grid">
            <Field label="Организация">
              <Select
                value={organizationId}
                onChange={(e) => setOrganizationId(e.target.value)}
                required
              >
                <EmptyOption
                  placeholder="Выберите организацию"
                  isEmpty={organizations.length === 0}
                  emptyText="Сначала импортируйте организации"
                />
                {organizations.map((organization) => (
                  <option key={organization.id} value={String(organization.id)}>
                    {organization.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Руководитель">
              <Select value={supervisorId} onChange={(e) => setSupervisorId(e.target.value)}>
                <option value="">Без руководителя</option>
                {supervisors.map((supervisor) => (
                  <option key={supervisor.id} value={String(supervisor.id)}>
                    {supervisor.full_name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="field-grid">
            <Field label="Форма практики">
              <Select value={practiceForm} onChange={(e) => setPracticeForm(e.target.value)}>
                <option value="">Не указана</option>
                {PRACTICE_FORMS.map((form) => (
                  <option key={form} value={form}>
                    {form}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Тип оплаты">
              <Select value={paymentType} onChange={(e) => setPaymentType(e.target.value)}>
                <option value="">Не указан</option>
                {PAYMENT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="card-action">
            <button className="primary-button" type="submit" disabled={pending}>
              {pending ? "Назначение…" : "Назначить группе"}
              <ArrowIcon />
            </button>
            <StatusLine feedback={feedback} />
          </div>
        </div>
      </form>
      <p className="card-hint">
        Существующие назначения студентов этой группы на выбранную практику
        будут перезаписаны.
        {selectedGroup ? ` Выбрана группа: ${selectedGroup.name}.` : ""}
      </p>
    </Card>
  );
}

export function AllocationSection(props: AllocationProps) {
  return (
    <section className="section" id="assignments">
      <div>
        <SectionHeading
          eyebrow="Шаг 03 — распределение"
          title="Студенты и организации"
          description="Закрепите за каждым студентом место прохождения практики. Массовое назначение применяет одну организацию ко всей группе сразу."
        />

        <div className="split-layout allocation-layout">
          <IndividualCard {...props} />
          <MassCard {...props} />
        </div>
      </div>
    </section>
  );
}