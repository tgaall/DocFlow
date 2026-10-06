const data = {
  groups: [],
  students: [],
  organizations: [],
  supervisors: [],
  practices: [],
};

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

  ["order-groups", "report-groups"].forEach((selectId) => {
    const groupsSelect = document.getElementById(selectId);
    groupsSelect.replaceChildren();
    data.groups.forEach((group) => {
      groupsSelect.add(new Option(group.name, group.name));
    });
  });

  const supervisorSelect = document.getElementById("practice-supervisor");
  supervisorSelect.replaceChildren(new Option("Без руководителя", ""));
  data.supervisors.forEach((supervisor) => {
    supervisorSelect.add(
      new Option(supervisor.full_name, String(supervisor.id)),
    );
  });

  updateAssignmentSelectors();
}

function updateAssignmentSelectors() {
  const groupSelect = document.getElementById("mass-assignment-group");
  groupSelect.replaceChildren(new Option("Выберите группу", ""));
  data.groups.forEach((group) => {
    groupSelect.add(new Option(group.name, String(group.id)));
  });

  const studentSelect = document.getElementById("assignment-student");
  studentSelect.replaceChildren(new Option("Выберите студента", ""));
  data.students.forEach((student) => {
    studentSelect.add(new Option(student.full_name, String(student.id)));
  });

  [
    "assignment-organization",
    "mass-assignment-organization",
  ].forEach((selectId) => {
    const organizationSelect = document.getElementById(selectId);
    organizationSelect.replaceChildren(new Option("Выберите организацию", ""));
    data.organizations.forEach((organization) => {
      organizationSelect.add(
        new Option(organization.name, String(organization.id)),
      );
    });
  });

  [
    "assignment-practice",
    "mass-assignment-practice",
    "directions-practice",
  ].forEach((selectId) => {
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

  ["assignment-supervisor", "mass-assignment-supervisor"].forEach(
    (selectId) => {
      const supervisorSelect = document.getElementById(selectId);
      supervisorSelect.replaceChildren(new Option("Без руководителя", ""));
      data.supervisors.forEach((supervisor) => {
        supervisorSelect.add(
          new Option(supervisor.full_name, String(supervisor.id)),
        );
      });
    },
  );
}

async function submitImport(form, endpoint, messageId) {
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
    `Создано: ${result.created}, пропущено: ${result.skipped}`,
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
  const [groups, students, organizations, supervisors, practices] =
    await Promise.all([
      api("/groups"),
      api("/students"),
      api("/organizations"),
      api("/supervisors"),
      api("/practices"),
    ]);

  Object.assign(data, {
    groups,
    students,
    organizations,
    supervisors,
    practices,
  });
  updatePracticeSelectors();

  return data;
}

async function submitPracticeForm(form, endpoint, messageId, successMessage) {
  const payload = Object.fromEntries(new FormData(form));
  if (payload.supervisor_id === "") {
    delete payload.supervisor_id;
  } else if (payload.supervisor_id !== undefined) {
    payload.supervisor_id = Number(payload.supervisor_id);
  }

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

function assignmentPayload(form) {
  const payload = Object.fromEntries(new FormData(form));
  ["student_id", "organization_id", "practice_id", "group_id", "supervisor_id"]
    .forEach((field) => {
      if (payload[field] === "") {
        delete payload[field];
      } else if (payload[field] !== undefined) {
        payload[field] = Number(payload[field]);
      }
    });

  ["practice_form", "payment_type", "grade"].forEach((field) => {
    if (payload[field] === "") {
      delete payload[field];
    }
  });

  return payload;
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

  for (const group of formData.getAll("groups")) {
    query.append("groups", group);
  }

  if (formData.has("practice_id") && formData.get("practice_id")) {
    query.set("practice_id", formData.get("practice_id"));
  }
  if (formData.has("practice_type") && formData.get("practice_type")) {
    query.set("practice_type", formData.get("practice_type"));
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

async function submitAssignmentForm(form, endpoint, messageId, successText) {
  const isMassAssignment = endpoint === "/assignments/mass";

  try {
    const result = await api(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(assignmentPayload(form)),
    });
    const message = isMassAssignment
      ? `Назначено студентов: ${result.length}`
      : successText;
    showMessage(messageId, message, false);
    form.reset();
  } catch (error) {
    showMessage(messageId, error.message, true);
  }
}

document.addEventListener("DOMContentLoaded", () => {
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
    .getElementById("individual-assignment-form")
    .addEventListener("submit", (event) => {
      event.preventDefault();
      submitAssignmentForm(
        event.currentTarget,
        "/assignments/",
        "individual-assignment-message",
        "Назначение сохранено",
      );
    });

  document
    .getElementById("mass-assignment-form")
    .addEventListener("submit", (event) => {
      event.preventDefault();
      submitAssignmentForm(
        event.currentTarget,
        "/assignments/mass",
        "mass-assignment-message",
        "",
      );
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
