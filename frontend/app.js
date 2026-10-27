const data = {
  groups: [],
  organizations: [],
  supervisors: [],
  practices: [],
};
const SELECT_ALL_PRACTICES_VALUE = "__select_all_practices__";
const PRACTICE_FORM_OPTIONS = ["Очно", "Дистанционно"];
const PAYMENT_TYPE_OPTIONS = ["С оплатой", "Без оплаты"];

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

function fillSelect(select, placeholder, options) {
  select.replaceChildren(new Option(placeholder, ""));
  options.forEach(({ label, value }) => {
    select.add(new Option(label, value));
  });
}

function groupOptions() {
  return data.groups.map((group) => ({
    label: group.name,
    value: String(group.id),
  }));
}

function organizationOptions() {
  return data.organizations.map((organization) => ({
    label: organization.name,
    value: String(organization.id),
  }));
}

function supervisorOptions() {
  return data.supervisors.map((supervisor) => ({
    label: supervisor.full_name,
    value: String(supervisor.id),
  }));
}

function stringOptions(values) {
  return values.map((value) => ({ label: value, value }));
}

function practiceOptions() {
  return data.practices.map((practice) => {
    const group = data.groups.find((item) => item.id === practice.group_id);
    const groupName = group ? group.name : "Группа не найдена";
    return {
      label: `${practice.type} — ${groupName} (${practice.start_date} – ${practice.end_date})`,
      value: String(practice.id),
    };
  });
}

function updatePracticeSelectors() {
  fillSelect(
    document.getElementById("practice-group"),
    "Выберите группу",
    data.groups.map((group) => ({ label: group.name, value: group.name })),
  );

  const practices = practiceOptions();

  ["order-practices", "report-practices"].forEach((selectId) => {
    const practicesSelect = document.getElementById(selectId);
    practicesSelect.replaceChildren(
      new Option("Выбрать все", SELECT_ALL_PRACTICES_VALUE),
    );
    practices.forEach(({ label, value }) => {
      practicesSelect.add(new Option(label, value));
    });
  });

  fillSelect(
    document.getElementById("directions-practice"),
    "Выберите практику",
    practices,
  );

  updateDistributionSelectors();
}

function updateDistributionSelectors() {
  fillSelect(
    document.getElementById("distribution-group"),
    "Выберите группу",
    groupOptions(),
  );

  updateDistributionPracticeSelect();

  fillSelect(
    document.getElementById("distribution-bulk-organization"),
    "Не менять",
    organizationOptions(),
  );
  fillSelect(
    document.getElementById("distribution-bulk-supervisor"),
    "Не менять",
    supervisorOptions(),
  );
  fillSelect(
    document.getElementById("distribution-bulk-practice-form"),
    "Не менять",
    stringOptions(PRACTICE_FORM_OPTIONS),
  );
  fillSelect(
    document.getElementById("distribution-bulk-payment-type"),
    "Не менять",
    stringOptions(PAYMENT_TYPE_OPTIONS),
  );
}

function updateDistributionPracticeSelect() {
  const groupSelect = document.getElementById("distribution-group");
  const groupId = groupSelect.value ? Number(groupSelect.value) : null;
  const practices = groupId
    ? data.practices.filter((practice) => practice.group_id === groupId)
    : [];

  fillSelect(
    document.getElementById("distribution-practice"),
    "Выберите практику",
    practices.map((practice) => ({
      label: `${practice.type} (${practice.start_date} – ${practice.end_date})`,
      value: String(practice.id),
    })),
  );
}

function createSelectCell(name, placeholder, options, selectedValue) {
  const cell = document.createElement("td");
  const select = document.createElement("select");
  select.name = name;
  select.classList.add("assignment-placeholder");
  fillSelect(select, placeholder, options);

  if (selectedValue) {
    select.value = selectedValue;
  }

  cell.append(select);
  return cell;
}

function renderDistributionTable(students, assignmentsByStudent) {
  const rows = students.map((student) => {
    const assignment = assignmentsByStudent.get(student.id);
    const row = document.createElement("tr");
    row.dataset.studentId = String(student.id);

    const nameCell = document.createElement("th");
    nameCell.scope = "row";
    nameCell.textContent = student.full_name;
    row.append(nameCell);

    row.append(
      createSelectCell(
        "organization_id",
        "Выберите организацию",
        organizationOptions(),
        assignment ? String(assignment.organization_id) : "",
      ),
    );
    row.append(
      createSelectCell(
        "supervisor_id",
        "Без руководителя",
        supervisorOptions(),
        assignment?.supervisor_id ? String(assignment.supervisor_id) : "",
      ),
    );
    row.append(
      createSelectCell(
        "practice_form",
        "Выберите форму",
        stringOptions(PRACTICE_FORM_OPTIONS),
        assignment?.practice_form || "",
      ),
    );
    row.append(
      createSelectCell(
        "payment_type",
        "Выберите оплату",
        stringOptions(PAYMENT_TYPE_OPTIONS),
        assignment?.payment_type || "",
      ),
    );

    const gradeCell = document.createElement("td");
    const gradeInput = document.createElement("input");
    gradeInput.name = "grade";
    gradeInput.value = assignment?.grade || "";
    gradeCell.append(gradeInput);
    row.append(gradeCell);

    return row;
  });

  document.getElementById("distribution-body").replaceChildren(...rows);
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
  const [groups, organizations, supervisors, practices] = await Promise.all([
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

async function refreshDistribution() {
  const groupId = document.getElementById("distribution-group").value;
  const practiceId = document.getElementById("distribution-practice").value;
  const form = document.getElementById("distribution-form");
  const bulk = document.getElementById("distribution-bulk");

  if (!groupId) {
    document.getElementById("distribution-body").replaceChildren();
    form.hidden = true;
    bulk.hidden = true;
    showMessage("distribution-message", "", false);
    return;
  }

  const students = await api(
    `/students?group_id=${encodeURIComponent(groupId)}`,
  );
  const assignments = practiceId
    ? await api(`/assignments/practice/${encodeURIComponent(practiceId)}`)
    : [];
  const assignmentsByStudent = new Map(
    assignments.map((assignment) => [assignment.student_id, assignment]),
  );

  renderDistributionTable(students, assignmentsByStudent);
  form.hidden = students.length === 0;
  bulk.hidden = students.length === 0;

  if (students.length === 0) {
    showMessage(
      "distribution-message",
      "В выбранной группе нет студентов.",
      true,
    );
  } else if (!practiceId) {
    showMessage(
      "distribution-message",
      "Выберите практику, чтобы увидеть сохранённые назначения.",
      false,
    );
  } else {
    showMessage("distribution-message", "", false);
  }
}

function refreshDistributionSafely() {
  refreshDistribution().catch((error) => {
    showMessage("distribution-message", error.message, true);
  });
}

function applyBulkToAllRows() {
  const bulkValues = {
    organization_id: document.getElementById("distribution-bulk-organization")
      .value,
    supervisor_id: document.getElementById("distribution-bulk-supervisor")
      .value,
    practice_form: document.getElementById("distribution-bulk-practice-form")
      .value,
    payment_type: document.getElementById("distribution-bulk-payment-type")
      .value,
  };

  document.querySelectorAll("#distribution-body tr").forEach((row) => {
    Object.entries(bulkValues).forEach(([field, value]) => {
      if (!value) {
        return;
      }

      const select = row.querySelector(`[name="${field}"]`);
      if (select) {
        select.value = value;
      }
    });
  });
}

function distributionRowPayload(row, practiceId) {
  const readValue = (field) => {
    const element = row.querySelector(`[name="${field}"]`);
    return element ? element.value.trim() : "";
  };

  const organizationId = readValue("organization_id");
  if (!organizationId) {
    return null;
  }

  const payload = {
    student_id: Number(row.dataset.studentId),
    practice_id: Number(practiceId),
    organization_id: Number(organizationId),
  };

  const supervisorId = readValue("supervisor_id");
  if (supervisorId) {
    payload.supervisor_id = Number(supervisorId);
  }

  ["practice_form", "payment_type", "grade"].forEach((field) => {
    const value = readValue(field);
    if (value) {
      payload[field] = value;
    }
  });

  return payload;
}

async function submitDistribution(form) {
  const practiceId = document.getElementById("distribution-practice").value;
  if (!practiceId) {
    showMessage("distribution-message", "Сначала выберите практику.", true);
    return;
  }

  const rows = Array.from(document.querySelectorAll("#distribution-body tr"));
  const payloads = rows
    .map((row) => distributionRowPayload(row, practiceId))
    .filter((payload) => payload !== null);

  if (payloads.length === 0) {
    showMessage(
      "distribution-message",
      "Укажите организацию хотя бы для одного студента.",
      true,
    );
    return;
  }

  const button = form.querySelector("button[type='submit']");
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = "Сохранение...";
  showMessage("distribution-message", "", false);

  const results = await Promise.allSettled(
    payloads.map((payload) =>
      api("/assignments/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
    ),
  );

  button.disabled = false;
  button.textContent = originalText;

  const savedCount = results.filter(
    (result) => result.status === "fulfilled",
  ).length;
  const failed = results.filter((result) => result.status === "rejected");
  const skippedCount = rows.length - payloads.length;

  if (failed.length === 0) {
    const skippedNote = skippedCount ? `, без организации: ${skippedCount}` : "";
    showMessage(
      "distribution-message",
      `Сохранено: ${savedCount}${skippedNote}`,
      false,
    );
    return;
  }

  showMessage(
    "distribution-message",
    `Сохранено: ${savedCount}, ошибок: ${failed.length}. ${failed[0].reason.message}`,
    true,
  );
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

  document
    .getElementById("distribution-group")
    .addEventListener("change", () => {
      updateDistributionPracticeSelect();
      refreshDistributionSafely();
    });

  document
    .getElementById("distribution-practice")
    .addEventListener("change", refreshDistributionSafely);

  document
    .getElementById("distribution-bulk-apply")
    .addEventListener("click", applyBulkToAllRows);

  document
    .getElementById("distribution-form")
    .addEventListener("submit", (event) => {
      event.preventDefault();
      submitDistribution(event.currentTarget);
    });

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
