const data = {
  groups: [],
  organizations: [],
  supervisors: [],
  practices: [],
};
const SELECT_ALL_PRACTICES_VALUE = "__select_all_practices__";
const NO_SUPERVISOR_VALUE = "__no_supervisor__";
const BULK_FIELDS = [
  { name: "organization_id", label: "Организация", placeholder: "Выберите организацию" },
  { name: "supervisor_id", label: "Руководитель", placeholder: "Без руководителя" },
  { name: "practice_form", label: "Форма практики", placeholder: "Выберите форму практики", options: ["Очно", "Дистанционно"] },
  { name: "payment_type", label: "Тип оплаты", placeholder: "Выберите тип оплаты", options: ["С оплатой", "Без оплаты"] },
];
let bulkLoadSequence = 0;

async function api(url, options) {
  const response = await fetch(url, options);

  if (!response.ok) {
    let message = response.statusText;

    try {
      const body = await response.json();
      if (body.detail) {
        message = body.detail;
      }
    } catch {
      // Use the HTTP status text when the error response is not JSON.
    }

    throw new Error(message);
  }

  return response.json();
}

function showMessage(elementId, text, isError) {
  const element = document.getElementById(elementId);
  if (!element) {
    return;
  }

  element.textContent = text;
  element.hidden = !text;
  element.setAttribute("role", isError ? "alert" : "status");
}

function updatePracticeSelectors() {
  const groupSelect = document.getElementById("practice-group");
  groupSelect.replaceChildren(new Option("Выберите группу", ""));
  data.groups.forEach((group) => {
    groupSelect.add(new Option(group.name, group.name));
  });

  ["order-practices", "report-practices"].forEach((selectId) => {
    const practicesSelect = document.getElementById(selectId);
    practicesSelect.replaceChildren(
      new Option("Выбрать все", SELECT_ALL_PRACTICES_VALUE),
    );
    data.practices.forEach((practice) => {
      const group = data.groups.find((item) => item.id === practice.group_id);
      const groupName = group ? group.name : "Группа не найдена";
      practicesSelect.add(
        new Option(
          `${practice.type} — ${groupName} (${practice.start_date} – ${practice.end_date})`,
          String(practice.id),
        ),
      );
    });
  });

  updateAssignmentSelectors();
}

function updateAssignmentSelectors() {
  const groupSelect = document.getElementById("bulk-assignment-group");
  groupSelect.replaceChildren(new Option("Выберите группу", ""));
  data.groups.forEach((group) => {
    groupSelect.add(new Option(group.name, String(group.id)));
  });

  ["directions-practice"].forEach((selectId) => {
    const practiceSelect = document.getElementById(selectId);
    practiceSelect.replaceChildren(new Option("Выберите практику", ""));
    data.practices.forEach((practice) => {
      const group = data.groups.find((item) => item.id === practice.group_id);
      const groupName = group ? group.name : "";
      practiceSelect.add(
        new Option(
          `${practice.type} — ${groupName} (${practice.start_date} – ${practice.end_date})`,
          String(practice.id),
        ),
      );
    });
  });

  const practiceSelect = document.getElementById("bulk-assignment-practice");
  practiceSelect.replaceChildren(new Option("Сначала выберите группу", ""));
  practiceSelect.disabled = true;

  const bulkDefaults = document.getElementById("bulk-defaults");
  bulkDefaults.replaceChildren();
  BULK_FIELDS.forEach((field) => {
    bulkDefaults.append(createBulkControl(field, true));
  });
}

function createBulkSelect(field, isDefault = false) {
  const select = document.createElement("select");
  select.dataset.field = field.name;
  select.setAttribute("aria-label", isDefault ? `${field.label} для всех` : field.label);

  if (isDefault) {
    select.add(new Option("Не менять", ""));
    if (field.name === "supervisor_id") {
      select.add(new Option("Без руководителя", NO_SUPERVISOR_VALUE));
    }
  } else {
    select.add(new Option(field.placeholder, ""));
  }

  if (field.name === "organization_id") {
    data.organizations.forEach((organization) => {
      select.add(new Option(organization.name, String(organization.id)));
    });
  } else if (field.name === "supervisor_id") {
    data.supervisors.forEach((supervisor) => {
      select.add(new Option(supervisor.full_name, String(supervisor.id)));
    });
  } else {
    field.options.forEach((value) => select.add(new Option(value, value)));
  }

  return select;
}

function createBulkControl(field, isDefault = false, selectedValue = "") {
  const wrapper = document.createElement("div");
  wrapper.className = "bulk-control";
  const select = createBulkSelect(field, isDefault);

  if (field.name === "organization_id" && data.organizations.length > 15) {
    const search = document.createElement("input");
    search.type = "search";
    search.placeholder = "Поиск организации";
    search.setAttribute("aria-label", `Поиск: ${select.getAttribute("aria-label")}`);
    search.autocomplete = "off";
    search.addEventListener("input", () => {
      const query = search.value.trim().toLocaleLowerCase("ru");
      const selected = select.value;
      const emptyLabel = isDefault ? "Не менять" : field.placeholder;
      select.replaceChildren(new Option(emptyLabel, ""));
      data.organizations
        .filter((organization) =>
          String(organization.id) === selected ||
          organization.name.toLocaleLowerCase("ru").includes(query),
        )
        .forEach((organization) =>
          select.add(new Option(organization.name, String(organization.id))),
        );
      select.value = selected;
    });
    wrapper.append(search);
  }

  select.value = selectedValue == null ? "" : String(selectedValue);
  wrapper.append(select);
  return wrapper;
}

function updateBulkCount() {
  const rows = Array.from(document.querySelectorAll("#bulk-assignment-rows tr[data-student-id]"));
  let completed = 0;
  rows.forEach((row) => {
    const values = Object.fromEntries(
      Array.from(row.querySelectorAll("select")).map((select) => [select.dataset.field, select.value]),
    );
    const isComplete = Boolean(values.organization_id && values.practice_form && values.payment_type);
    const indicator = row.querySelector(".bulk-student-status");
    indicator.classList.toggle("is-complete", isComplete);
    indicator.setAttribute("aria-label", isComplete ? "Распределение заполнено" : "Распределение не заполнено");
    indicator.title = isComplete ? "Распределение заполнено" : "Распределение не заполнено";
    if (isComplete) completed += 1;
  });
  document.getElementById("bulk-assignment-count").textContent = `Заполнено ${completed} из ${rows.length}`;
}

function renderBulkStudents(students, assignments) {
  const assignmentByStudent = new Map(assignments.map((assignment) => [assignment.student_id, assignment]));
  const tbody = document.getElementById("bulk-assignment-rows");
  tbody.replaceChildren();

  students.forEach((student) => {
    const assignment = assignmentByStudent.get(student.id);
    const row = document.createElement("tr");
    row.dataset.studentId = String(student.id);
    const studentCell = document.createElement("th");
    studentCell.scope = "row";
    const indicator = document.createElement("span");
    indicator.className = "bulk-student-status";
    indicator.setAttribute("aria-label", "Распределение не заполнено");
    indicator.title = "Распределение не заполнено";
    studentCell.append(indicator, document.createTextNode(student.full_name));
    row.append(studentCell);

    BULK_FIELDS.forEach((field) => {
      const cell = document.createElement("td");
      const value = assignment ? assignment[field.name] : "";
      const control = createBulkControl(field, false, value);
      const select = control.querySelector("select");
      select.addEventListener("change", () => {
        row.classList.remove("has-error");
        const error = row.nextElementSibling?.classList.contains("bulk-row-error-row")
          ? row.nextElementSibling
          : null;
        if (error) error.remove();
        updateBulkCount();
      });
      cell.append(control);
      row.append(cell);
    });

    tbody.append(row);
  });

  document.getElementById("bulk-assignment-content").hidden = false;
  updateBulkCount();
}

async function loadBulkStudents() {
  const groupId = document.getElementById("bulk-assignment-group").value;
  const practiceId = document.getElementById("bulk-assignment-practice").value;
  const sequence = ++bulkLoadSequence;
  const content = document.getElementById("bulk-assignment-content");
  content.hidden = true;
  document.getElementById("bulk-assignment-rows").replaceChildren();
  showMessage("bulk-assignment-message", "", false);

  if (!groupId || !practiceId) return;

  showMessage("bulk-assignment-message", "Загружаем студентов и сохранённые распределения…", false);
  try {
    const [students, assignments] = await Promise.all([
      api(`/students?group_id=${encodeURIComponent(groupId)}`),
      api(`/assignments/practice/${encodeURIComponent(practiceId)}`),
    ]);
    if (sequence !== bulkLoadSequence) return;
    renderBulkStudents(students, assignments);
    showMessage("bulk-assignment-message", "", false);
    if (students.length === 0) {
      showMessage("bulk-assignment-message", "В выбранной группе пока нет студентов.", false);
    }
  } catch (error) {
    if (sequence !== bulkLoadSequence) return;
    const detail = error instanceof TypeError
      ? "Не удалось связаться с сервером. Проверьте подключение и попробуйте ещё раз."
      : `Не удалось загрузить студентов или распределения: ${error.message}`;
    showMessage("bulk-assignment-message", detail, true);
  }
}

function applyBulkDefaults() {
  const defaults = Object.fromEntries(
    Array.from(document.querySelectorAll("#bulk-defaults select")).map((select) => [select.dataset.field, select.value]),
  );
  document.querySelectorAll("#bulk-assignment-rows tr[data-student-id]").forEach((row) => {
    Object.entries(defaults).forEach(([field, value]) => {
      if (value === "") return;
      const select = row.querySelector(`select[data-field="${field}"]`);
      select.value = value === NO_SUPERVISOR_VALUE ? "" : value;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
  });
}

function resetBulkRows() {
  document.querySelectorAll("#bulk-assignment-rows select").forEach((select) => {
    select.value = "";
  });
  document.querySelectorAll("#bulk-assignment-rows tr").forEach((row) => {
    row.classList.remove("has-error");
    if (row.nextElementSibling?.classList.contains("bulk-row-error-row")) {
      row.nextElementSibling.remove();
    }
  });
  updateBulkCount();
  showMessage("bulk-assignment-message", "", false);
}

async function saveBulkAssignments() {
  const practiceId = Number(document.getElementById("bulk-assignment-practice").value);
  const rows = Array.from(document.querySelectorAll("#bulk-assignment-rows tr[data-student-id]"));
  const completeRows = rows.filter((row) => {
    const values = Object.fromEntries(Array.from(row.querySelectorAll("select")).map((select) => [select.dataset.field, select.value]));
    return values.organization_id && values.practice_form && values.payment_type;
  });

  if (!completeRows.length) {
    showMessage("bulk-assignment-message", "Нет заполненных строк для сохранения.", true);
    return;
  }

  const button = document.getElementById("bulk-save");
  button.disabled = true;
  const originalText = button.textContent;
  button.textContent = "Сохранение…";
  showMessage("bulk-assignment-message", "", false);
  rows.forEach((row) => {
    row.classList.remove("has-error");
    if (row.nextElementSibling?.classList.contains("bulk-row-error-row")) {
      row.nextElementSibling.remove();
    }
  });

  let saved = 0;
  const errors = [];
  for (const row of completeRows) {
    const values = Object.fromEntries(Array.from(row.querySelectorAll("select")).map((select) => [select.dataset.field, select.value]));
    const studentName = row.querySelector("th").textContent.trim();
    try {
      await api("/assignments/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          student_id: Number(row.dataset.studentId),
          practice_id: practiceId,
          organization_id: Number(values.organization_id),
          supervisor_id: values.supervisor_id ? Number(values.supervisor_id) : null,
          practice_form: values.practice_form,
          payment_type: values.payment_type,
        }),
      });
      saved += 1;
    } catch (error) {
      const reason = error instanceof TypeError
        ? "Не удалось связаться с сервером."
        : error.message;
      row.classList.add("has-error");
      const errorRow = document.createElement("tr");
      errorRow.className = "bulk-row-error-row";
      const errorCell = document.createElement("td");
      errorCell.colSpan = BULK_FIELDS.length + 1;
      errorCell.className = "bulk-row-error";
      errorCell.textContent = `Не сохранено: ${reason}`;
      errorRow.append(errorCell);
      row.after(errorRow);
      errors.push(`${studentName}: ${reason}`);
    }
  }

  const message = `Сохранено: ${saved} из ${completeRows.length}${errors.length ? `. Не сохранены ${errors.length} строк — причины указаны в таблице.` : "."}`;
  showMessage("bulk-assignment-message", message, errors.length > 0);
  button.disabled = false;
  button.textContent = originalText;
}

async function submitImport(form, endpoint, messageId, resultLabel = "Создано") {
  let result;

  try {
    result = await api(endpoint, {
      method: "POST",
      body: new FormData(form),
    });
  } catch (error) {
    showMessage(messageId, error.message, true);
    return;
  }

  showMessage(
    messageId,
    `${resultLabel}: ${result.created}, пропущено: ${result.skipped}`,
    false,
  );

  try {
    await refreshData();
  } catch (error) {
    showMessage(
      "overview-message",
      `Не удалось обновить справочники: ${error.message}`,
      true,
    );
  }
}

async function refreshData() {
  const [groups, organizations, supervisors, practices] =
    await Promise.all([
      api("/groups"),
      api("/organizations"),
      api("/supervisors"),
      api("/practices"),
    ]);

  Object.assign(data, {
    groups,
    organizations,
    supervisors,
    practices,
  });
  updatePracticeSelectors();

  return data;
}

async function submitPracticeForm(form, endpoint, messageId, successMessage) {
  const payload = Object.fromEntries(new FormData(form));

  try {
    await api(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    showMessage(messageId, error.message, true);
    return;
  }

  showMessage(messageId, successMessage, false);
  form.reset();

  try {
    await refreshData();
  } catch (error) {
    showMessage(
      "overview-message",
      `Не удалось обновить справочники: ${error.message}`,
      true,
    );
  }
}

function documentFilename(contentDisposition, fallback) {
  if (!contentDisposition) {
    return fallback;
  }

  const encodedFilename = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (encodedFilename) {
    try {
      return decodeURIComponent(encodedFilename[1].trim().replace(/^"|"$/g, ""));
    } catch {
      // Fall back to the standard filename parameter when decoding fails.
    }
  }

  const filename = contentDisposition.match(/filename="?([^";]+)"?/i);
  return filename ? filename[1].trim() : fallback;
}

async function downloadDocument(form, endpoint, messageId, fallbackFilename) {
  const button = form.querySelector("button[type='submit']");
  const originalText = button.textContent;
  const query = new URLSearchParams();
  const formData = new FormData(form);

  for (const practiceId of formData.getAll("practice_ids")) {
    if (practiceId !== SELECT_ALL_PRACTICES_VALUE) {
      query.append("practice_ids", practiceId);
    }
  }

  if (formData.has("practice_id") && formData.get("practice_id")) {
    query.set("practice_id", formData.get("practice_id"));
  }

  const queryString = query.toString();
  const url = queryString ? `${endpoint}?${queryString}` : endpoint;
  button.disabled = true;
  button.textContent = "Генерация...";
  showMessage(messageId, "", false);

  try {
    const response = await fetch(url);
    const contentType = response.headers.get("content-type") || "";

    if (!response.ok || !contentType.includes("wordprocessingml")) {
      let message = response.statusText || "Не удалось сгенерировать документ";
      try {
        const body = await response.json();
        if (body.detail) {
          message = body.detail;
        }
      } catch {
        // Show the status message when the backend did not return JSON.
      }
      throw new Error(message);
    }

    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = documentFilename(
      response.headers.get("content-disposition"),
      fallbackFilename,
    );
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  } catch (error) {
    showMessage(messageId, error.message, true);
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  ["order-practices", "report-practices"].forEach((selectId) => {
    document.getElementById(selectId).addEventListener("change", (event) => {
      const select = event.currentTarget;
      const selectAllOption = Array.from(select.selectedOptions).find(
        (option) => option.value === SELECT_ALL_PRACTICES_VALUE,
      );
      if (!selectAllOption) {
        return;
      }

      Array.from(select.options).forEach((option) => {
        option.selected = option !== selectAllOption;
      });
    });
  });

  document
    .getElementById("students-import-form")
    .addEventListener("submit", (event) => {
      event.preventDefault();
      submitImport(
        event.currentTarget,
        "/import/students",
        "students-import-message",
      );
    });

  document
    .getElementById("organizations-import-form")
    .addEventListener("submit", (event) => {
      event.preventDefault();
      submitImport(
        event.currentTarget,
        "/import/organizations",
        "organizations-import-message",
      );
    });

  document
    .getElementById("gradesheets-import-form")
    .addEventListener("submit", (event) => {
      event.preventDefault();
      submitImport(
        event.currentTarget,
        "/import/gradesheets",
        "gradesheets-import-message",
        "Обновлено оценок",
      );
    });

  document
    .getElementById("supervisor-form")
    .addEventListener("submit", (event) => {
      event.preventDefault();
      submitPracticeForm(
        event.currentTarget,
        "/practice/create_supervisor",
        "supervisor-message",
        "Руководитель создан.",
      );
    });

  document
    .getElementById("practice-form")
    .addEventListener("submit", (event) => {
      event.preventDefault();
      submitPracticeForm(
        event.currentTarget,
        "/practice/create",
        "practice-message",
        "Практика создана.",
      );
    });

  const bulkGroupSelect = document.getElementById("bulk-assignment-group");
  const bulkPracticeSelect = document.getElementById("bulk-assignment-practice");
  bulkGroupSelect.addEventListener("change", () => {
    const groupId = bulkGroupSelect.value;
    bulkPracticeSelect.replaceChildren(
      new Option(groupId ? "Выберите практику" : "Сначала выберите группу", ""),
    );
    data.practices
      .filter((practice) => String(practice.group_id) === groupId)
      .forEach((practice) => {
        bulkPracticeSelect.add(
          new Option(
            `${practice.type} (${practice.start_date} – ${practice.end_date})`,
            String(practice.id),
          ),
        );
      });
    bulkPracticeSelect.disabled = !groupId;
    if (groupId && bulkPracticeSelect.options.length === 1) {
      bulkPracticeSelect.options[0].text = "Для группы нет практик";
    }
    loadBulkStudents();
  });
  bulkPracticeSelect.addEventListener("change", loadBulkStudents);
  document.getElementById("bulk-apply-all").addEventListener("click", applyBulkDefaults);
  document.getElementById("bulk-reset").addEventListener("click", resetBulkRows);
  document.getElementById("bulk-save").addEventListener("click", saveBulkAssignments);

  [
    {
      formId: "directions-form",
      endpoint: "/documents/directions",
      messageId: "directions-message",
      filename: "directions.docx",
    },
    {
      formId: "order-form",
      endpoint: "/documents/order",
      messageId: "order-message",
      filename: "order.docx",
    },
    {
      formId: "report-form",
      endpoint: "/documents/report",
      messageId: "report-message",
      filename: "report.docx",
    },
  ].forEach(({ formId, endpoint, messageId, filename }) => {
    document.getElementById(formId).addEventListener("submit", (event) => {
      event.preventDefault();
      downloadDocument(event.currentTarget, endpoint, messageId, filename);
    });
  });

  refreshData().catch((error) => {
    showMessage(
      "overview-message",
      `Не удалось загрузить справочники: ${error.message}`,
      true,
    );
  });
});
