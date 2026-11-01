const data = {
  user: null,
  groups: [],
  students: [],
  organizations: [],
  supervisors: [],
  practices: [],
  assignmentsByPractice: new Map(),
};

const ROUTES = new Set(["overview", "imports", "practice", "assignments", "documents"]);
const SELECT_ALL_PRACTICES_VALUE = "__select_all_practices__";
const PRACTICE_FORM_OPTIONS = ["Очно", "Дистанционно"];
const PAYMENT_TYPE_OPTIONS = ["С оплатой", "Без оплаты"];
const MAX_IMPORT_SIZE = 5 * 1024 * 1024;
const IMPORT_CONFIG = {
  students: {
    endpoint: "/import/students",
    extension: ".xlsx",
    requirements: ".xlsx · до 5 МБ · группа и номера зачёток обязательны",
  },
  organizations: {
    endpoint: "/import/organizations",
    extension: ".txt",
    requirements: "UTF-8 или CP1251 · UTF-8 конвертируется · до 5 МБ · одна организация на строку",
  },
  gradesheets: {
    endpoint: "/import/gradesheets",
    extension: ".pdf",
    requirements: ".pdf · до 5 МБ · текстовая ведомость с группой и оценками",
  },
};
const DOCUMENT_CONFIG = {
  directions: { endpoint: "/documents/directions", label: "Направления", filename: "directions.docx" },
  order: { endpoint: "/documents/order", label: "Приказ", filename: "order.docx" },
  report: { endpoint: "/documents/report", label: "Отчёт", filename: "report.docx" },
};

const importState = {
  type: "students",
  file: null,
  uploadFile: null,
  result: null,
  validating: false,
  uploading: false,
  validationId: 0,
};
const documentHistory = [];
let authMode = "login";
let currentRoute = "overview";
let distributionRequestId = 0;
let documentSequence = 0;
let toastTimer;

class ApiError extends Error {
  constructor(status, detail = "") {
    super(`HTTP ${status}`);
    this.status = status;
    this.detail = detail;
  }
}

function $(id) {
  return document.getElementById(id);
}

async function responseError(response) {
  let detail = "";
  try {
    const body = await response.json();
    if (typeof body.detail === "string") {
      detail = body.detail;
    }
  } catch {
    detail = "";
  }
  return new ApiError(response.status, detail);
}

async function api(url, options = {}) {
  let response;
  try {
    response = await fetch(url, { credentials: "same-origin", ...options });
  } catch (error) {
    throw new ApiError(0, error.message);
  }

  if (!response.ok) {
    const error = await responseError(response);
    if (response.status === 401 && !url.startsWith("/auth/")) {
      showLogin("Сессия истекла. Войдите снова.");
    }
    throw error;
  }

  if (response.status === 204) {
    return null;
  }
  return response.json();
}

function friendlyError(error, context = "general") {
  if (!(error instanceof ApiError) || error.status === 0) {
    return "Нет связи с сервером. Проверьте соединение и повторите.";
  }
  if (error.status === 401) {
    return context === "auth" ? "Неверный логин или пароль." : "Сессия истекла. Войдите снова.";
  }
  if (error.status === 403) {
    return "Недостаточно прав для этого действия.";
  }
  if (error.status === 409 && context === "auth") {
    return "Такой логин уже зарегистрирован. Выберите другой.";
  }
  if (error.status === 413) {
    return "Файл слишком большой. Максимальный размер — 5 МБ.";
  }
  if (context === "documents" && error.status === 400) {
    return "Не удалось сформировать документ. Проверьте выбранные практики и назначения студентов.";
  }
  if (error.status === 422) {
    return "Проверьте заполнение полей и повторите.";
  }
  if (error.status >= 500) {
    return "Сервер временно недоступен. Попробуйте ещё раз.";
  }
  if (context === "documents" && error.status === 404) {
    return "Для выбранных практик недостаточно данных. Проверьте распределение студентов.";
  }
  if (context === "import") {
    return "Файл не прошёл проверку на сервере. Сверьте данные и повторите.";
  }
  if (context === "practice" && error.status === 404) {
    return "Группа не найдена. Обновите страницу и выберите группу снова.";
  }
  if (context === "assignments" && error.status === 404) {
    return "Не удалось найти студента, практику или организацию. Обновите данные.";
  }
  return "Не удалось выполнить действие. Повторите попытку.";
}

function showInline(id, text = "", isError = false) {
  const element = $(id);
  if (!element) {
    return;
  }
  element.textContent = text;
  element.hidden = !text;
  element.classList.toggle("error", isError);
  element.setAttribute("role", isError ? "alert" : "status");
  const retryId = id === "distribution-message" ? "distribution-retry" : `${id.replace("-message", "")}-retry`;
  const retryButton = $(retryId);
  if (retryButton) retryButton.hidden = !isError;
}

function showToast(text, isError = false) {
  const region = $("toast-region");
  region.replaceChildren();
  const toast = document.createElement("div");
  toast.className = `toast${isError ? " error" : ""}`;
  toast.setAttribute("role", isError ? "alert" : "status");
  toast.textContent = text;
  region.append(toast);
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.remove(), 4500);
}

function setButtonBusy(button, busy, busyText) {
  if (busy) {
    button.dataset.originalText = button.textContent;
    button.textContent = busyText;
    button.disabled = true;
  } else {
    button.textContent = button.dataset.originalText || button.textContent;
    button.disabled = false;
    delete button.dataset.originalText;
  }
}

function formatNumber(value) {
  return new Intl.NumberFormat("ru-RU").format(value);
}

function plural(value, forms) {
  const mod100 = value % 100;
  const mod10 = value % 10;
  if (mod100 >= 11 && mod100 <= 14) return forms[2];
  if (mod10 === 1) return forms[0];
  if (mod10 >= 2 && mod10 <= 4) return forms[1];
  return forms[2];
}

function fillSelect(select, placeholder, options, preserve = true) {
  const previous = select.value;
  select.replaceChildren(new Option(placeholder, ""));
  options.forEach(({ label, value }) => select.add(new Option(label, String(value))));
  if (preserve && Array.from(select.options).some((option) => option.value === previous)) {
    select.value = previous;
  }
}

function groupOptions() {
  return data.groups.map((group) => ({ label: group.name, value: group.id }));
}

function organizationOptions() {
  return data.organizations.map((organization) => ({ label: organization.name, value: organization.id }));
}

function supervisorOptions() {
  return data.supervisors.map((supervisor) => ({ label: supervisor.full_name, value: supervisor.id }));
}

function stringOptions(values) {
  return values.map((value) => ({ label: value, value }));
}

function practiceOptions() {
  return data.practices.map((practice) => {
    const group = data.groups.find((item) => item.id === practice.group_id);
    return {
      label: `${practice.type} — ${group?.name || "Группа не найдена"} (${formatDate(practice.start_date)} – ${formatDate(practice.end_date)})`,
      value: practice.id,
    };
  });
}

function formatDate(value) {
  if (!value) return "";
  const [year, month, day] = value.split("-");
  return day && month && year ? `${day}.${month}.${year}` : value;
}

function currentAcademicContext() {
  const now = new Date();
  const month = now.getMonth() + 1;
  const startYear = month >= 7 ? now.getFullYear() : now.getFullYear() - 1;
  const semester = month >= 7 ? "осенний семестр" : "весенний семестр";
  return `Практики ${startYear}/${String(startYear + 1).slice(-2)} · ${semester}`;
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Доброе утро";
  if (hour < 18) return "Добрый день";
  return "Добрый вечер";
}

function updatePracticeSelectors() {
  fillSelect(
    $("practice-group"),
    "Выберите группу",
    data.groups.map((group) => ({ label: group.name, value: group.name })),
  );

  const practices = practiceOptions();
  fillSelect($("document-practice"), "Выберите практику", practices);

  const multiple = $("document-practices");
  const selected = new Set(Array.from(multiple.selectedOptions).map((option) => option.value));
  multiple.replaceChildren(new Option("Все практики", SELECT_ALL_PRACTICES_VALUE));
  practices.forEach(({ label, value }) => {
    const option = new Option(label, value);
    option.selected = selected.has(String(value));
    multiple.add(option);
  });
  const allOption = multiple.options[0];
  allOption.selected = selected.has(SELECT_ALL_PRACTICES_VALUE) || multiple.selectedOptions.length === 0;
  multiple.dataset.allSelected = String(allOption.selected);

  fillSelect($("distribution-group"), "Выберите группу", groupOptions());
  updateDistributionPracticeSelect();
  fillSelect($("distribution-bulk-organization"), "Не менять", organizationOptions());
  fillSelect($("distribution-bulk-supervisor"), "Не менять", supervisorOptions());
  fillSelect($("distribution-bulk-practice-form"), "Не менять", stringOptions(PRACTICE_FORM_OPTIONS));
  fillSelect($("distribution-bulk-payment-type"), "Не менять", stringOptions(PAYMENT_TYPE_OPTIONS));
  updateDocumentPracticeControl();
}

function updateDistributionPracticeSelect(preserve = true) {
  const groupId = Number($("distribution-group").value) || null;
  const practices = groupId ? data.practices.filter((practice) => practice.group_id === groupId) : [];
  fillSelect(
    $("distribution-practice"),
    "Выберите практику",
    practices.map((practice) => ({
      label: `${practice.type} (${formatDate(practice.start_date)} – ${formatDate(practice.end_date)})`,
      value: practice.id,
    })),
    preserve,
  );
}

function renderRoute() {
  const requested = window.location.hash.slice(1) || "overview";
  currentRoute = ROUTES.has(requested) ? requested : "overview";
  if (currentRoute === "overview" && $("overview-error") && !$("overview-error").hidden) {
    $("overview-loading").hidden = true;
  }
  document.querySelectorAll("[data-screen]").forEach((screen) => {
    screen.hidden = screen.dataset.screen !== currentRoute;
  });
  document.querySelectorAll("[data-route]").forEach((link) => {
    if (link.dataset.route === currentRoute) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  });
  if (currentRoute === "assignments" && !$("app-shell").hidden) {
    refreshDistributionSafely();
  }
  window.scrollTo({ top: 0, behavior: "auto" });
}

function navigate(route) {
  if (window.location.hash === `#${route}`) {
    renderRoute();
  } else {
    window.location.hash = route;
  }
}

function renderOverview() {
  if (!data.user) return;
  const greetingPrefix = greeting();
  const userName = data.user.full_name?.trim() || data.user.username;
  const firstName = userName.split(/\s+/)[1] || userName;
  $("overview-greeting").textContent = `${greetingPrefix}, ${firstName}`;
  $("overview-context").textContent = currentAcademicContext();
  $("stat-students").textContent = formatNumber(data.students.length);
  $("stat-practices").textContent = formatNumber(data.practices.length);
  $("stat-organizations").textContent = formatNumber(data.organizations.length);
  $("stat-documents").textContent = formatNumber(documentHistory.filter((item) => item.status === "ready").length);

  let remainingAssignments = 0;
  if (data.practices.length) {
    data.practices.forEach((practice) => {
      const studentsInGroup = data.students.filter((student) => student.group_id === practice.group_id).length;
      const assigned = (data.assignmentsByPractice.get(practice.id) || []).filter((item) => item.organization_id).length;
      remainingAssignments += Math.max(0, studentsInGroup - assigned);
    });
  }
  const allAssigned = data.practices.length > 0 && data.students.length > 0 && remainingAssignments === 0;
  const hasReadyDocument = documentHistory.some((item) => item.status === "ready");
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = data.practices
    .map((practice) => practice.start_date)
    .filter((date) => date && date >= today)
    .sort()[0];
  const steps = [
    { title: "Загрузить список студентов", done: data.students.length > 0, route: "imports", importType: "students", action: "Импортировать студентов", meta: data.students.length ? `${data.students.length} загружено` : "Импорт" },
    { title: "Загрузить организации", done: data.organizations.length > 0, route: "imports", importType: "organizations", action: "Загрузить организации", meta: data.organizations.length ? `${data.organizations.length} загружено` : "Импорт" },
    { title: "Создать практику", done: data.practices.length > 0, route: "practice", action: "Создать практику", meta: "Практики" },
    { title: "Распределить студентов", done: allAssigned, route: "assignments", action: "Перейти к распределению", meta: `${remainingAssignments} осталось${upcoming ? ` · до ${formatDate(upcoming).slice(0, 5)}` : ""}` },
    { title: "Сформировать документ", done: hasReadyDocument, route: "documents", action: "Сформировать документ", meta: "Документы" },
  ];

  const list = $("next-steps-list");
  const items = steps.map((step) => {
    const item = document.createElement("li");
    item.className = `step-item${step.done ? " done" : ""}`;
    const check = document.createElement("span");
    check.className = "step-check";
    check.textContent = "✓";
    check.setAttribute("aria-label", step.done ? "Выполнено" : "Не выполнено");
    const title = document.createElement("span");
    title.className = "step-title";
    title.textContent = step.title;
    const meta = document.createElement("span");
    meta.className = "step-meta";
    meta.textContent = step.meta;
    item.append(check, title, meta);
    return item;
  });
  list.replaceChildren(...items);
  const completed = steps.filter((step) => step.done).length;
  $("overview-progress-label").textContent = `${completed} из ${steps.length} готово`;
  const next = steps.find((step) => !step.done) || steps[steps.length - 1];
  const nextButton = $("overview-next");
  nextButton.textContent = next.action;
  nextButton.dataset.routeTarget = next.route;
  nextButton.dataset.importType = next.importType || "";
}

async function refreshData({ showLoading = true } = {}) {
  if (showLoading) {
    $("overview-loading").hidden = false;
    $("overview-content").hidden = true;
    $("overview-error").hidden = true;
  }
  try {
    const [groups, organizations, supervisors, practices, students] = await Promise.all([
      api("/groups"),
      api("/organizations"),
      api("/supervisors"),
      api("/practices"),
      api("/students"),
    ]);
    const assignmentEntries = await Promise.all(
      practices.map(async (practice) => [practice.id, await api(`/assignments/practice/${encodeURIComponent(practice.id)}`)]),
    );
    Object.assign(data, { groups, organizations, supervisors, practices, students });
    data.assignmentsByPractice = new Map(assignmentEntries);
    updatePracticeSelectors();
    renderOverview();
    $("overview-loading").hidden = true;
    $("overview-error").hidden = true;
    $("overview-content").hidden = false;
    return data;
  } catch (error) {
    if (error.status === 401) {
      showLogin("Сессия истекла. Войдите снова.");
    }
    if (showLoading && data.user && error.status !== 401) {
      $("overview-loading").hidden = true;
      $("overview-content").hidden = true;
      $("overview-error").hidden = false;
    }
    throw error;
  }
}

function clearDocumentHistory() {
  documentHistory.forEach((item) => {
    if (item.url) URL.revokeObjectURL(item.url);
  });
  documentHistory.length = 0;
  renderDocumentHistory();
}

function showLogin(message = "") {
  distributionRequestId += 1;
  importState.validationId += 1;
  clearDocumentHistory();
  data.user = null;
  $("app-shell").hidden = true;
  $("auth-view").hidden = false;
  $("sidebar-username").textContent = "";
  $("auth-form").reset();
  authMode = "login";
  updateAuthForm();
  clearAuthErrors();
  showInline("auth-message", message, Boolean(message));
}

async function showApplication(user) {
  data.user = user;
  $("auth-view").hidden = true;
  $("app-shell").hidden = false;
  $("sidebar-username").textContent = user.username;
  showInline("auth-message");
  renderRoute();
  try {
    await refreshData();
  } catch {
    if (data.user) showInline("auth-message");
  }
}

function updateAuthForm() {
  const registering = authMode === "register";
  $("auth-title").textContent = registering ? "Создание аккаунта" : "Вход в DocFlow";
  $("auth-submit").textContent = registering ? "Зарегистрироваться" : "Войти";
  $("auth-toggle").textContent = registering ? "Уже есть аккаунт? Войти" : "Создать аккаунт";
  $("auth-password").autocomplete = registering ? "new-password" : "current-password";
  $("auth-password-hint").hidden = !registering;
}

function clearAuthErrors() {
  ["username", "password"].forEach((field) => {
    $(`auth-${field}-field`).classList.remove("has-error");
    $(`auth-${field}-error`).hidden = true;
    $(`auth-${field}-error`).textContent = "";
    $(`auth-${field}`).removeAttribute("aria-invalid");
  });
}

function setAuthFieldError(field, message) {
  $(`auth-${field}-field`).classList.add("has-error");
  $(`auth-${field}`).setAttribute("aria-invalid", "true");
  $(`auth-${field}-error`).textContent = message;
  $(`auth-${field}-error`).hidden = false;
}

async function submitAuth(event) {
  event.preventDefault();
  clearAuthErrors();
  showInline("auth-message");
  $("forgot-password-hint").hidden = true;
  const username = $("auth-username").value.trim();
  const password = $("auth-password").value;
  let valid = true;
  if (!username) {
    setAuthFieldError("username", "Введите логин.");
    valid = false;
  }
  if (password.length < 8) {
    setAuthFieldError("password", "Пароль должен содержать минимум 8 символов.");
    valid = false;
  }
  if (!valid) return;

  const button = $("auth-submit");
  const originalButtonText = button.textContent;
  setButtonBusy(button, true, authMode === "login" ? "Входим…" : "Создаём…");
  try {
    const user = await api(`/auth/${authMode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    await showApplication(user);
  } catch (error) {
    if (error.status === 401) setAuthFieldError("password", "Проверьте логин и пароль.");
    showInline("auth-message", friendlyError(error, "auth"), true);
  } finally {
    setButtonBusy(button, false);
    button.textContent = originalButtonText;
  }
}

function createSelectCell(name, placeholder, options, selectedValue) {
  const cell = document.createElement("td");
  const select = document.createElement("select");
  select.name = name;
  select.classList.add("assignment-placeholder");
  fillSelect(select, placeholder, options, false);
  if (selectedValue) select.value = selectedValue;
  select.addEventListener("change", () => {
    updateRowStatus(select.closest("tr"));
    updateDistributionCount();
  });
  cell.append(select);
  return cell;
}

function updateRowStatus(row) {
  const assigned = Boolean(row.querySelector('[name="organization_id"]').value);
  const badge = row.querySelector(".status-badge");
  badge.className = `status-badge ${assigned ? "success" : "neutral"}`;
  badge.textContent = assigned ? "Назначена" : "Не назначена";
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
      createSelectCell("organization_id", "Выберите организацию", organizationOptions(), assignment ? String(assignment.organization_id) : ""),
      createSelectCell("supervisor_id", "Без руководителя", supervisorOptions(), assignment?.supervisor_id ? String(assignment.supervisor_id) : ""),
      createSelectCell("practice_form", "Выберите форму", stringOptions(PRACTICE_FORM_OPTIONS), assignment?.practice_form || ""),
      createSelectCell("payment_type", "Выберите оплату", stringOptions(PAYMENT_TYPE_OPTIONS), assignment?.payment_type || ""),
    );
    const statusCell = document.createElement("td");
    const badge = document.createElement("span");
    badge.className = "status-badge neutral";
    badge.textContent = "Не назначена";
    statusCell.append(badge);
    row.append(statusCell);
    updateRowStatus(row);
    return row;
  });
  $("distribution-body").replaceChildren(...rows);
  updateDistributionCount();
}

function updateDistributionCount() {
  const rows = Array.from($("distribution-body").rows);
  const assigned = rows.filter((row) => row.querySelector('[name="organization_id"]').value).length;
  $("distribution-count").textContent = `Назначено ${assigned} из ${rows.length} ${plural(rows.length, ["студента", "студентов", "студентов"])}`;
}

function showDistributionMessage(text = "", isError = false, retryAction = "") {
  const container = $("distribution-message");
  container.hidden = !text;
  container.classList.toggle("error-state", isError);
  container.setAttribute("role", isError ? "alert" : "status");
  container.querySelector("p").textContent = text;
  const retry = $("distribution-retry");
  retry.hidden = !retryAction;
  retry.dataset.action = retryAction;
}

function setDistributionEmpty(title, text, actionText = "", actionRoute = "") {
  const empty = $("distribution-empty");
  empty.hidden = false;
  empty.querySelector("h2").textContent = title;
  empty.querySelector("p").textContent = text;
  const action = $("distribution-empty-action");
  action.textContent = actionText;
  action.href = actionRoute ? `#${actionRoute}` : "#assignments";
  action.hidden = !actionText;
  $("distribution-retry").hidden = true;
  $("distribution-workspace").hidden = true;
}

async function refreshDistribution() {
  const groupId = $("distribution-group").value;
  const practiceId = $("distribution-practice").value;
  const requestId = ++distributionRequestId;
  $("distribution-loading").hidden = true;
  showDistributionMessage();

  if (!groupId || !practiceId) {
    $("distribution-empty").hidden = false;
    setDistributionEmpty(
      groupId ? "Выберите практику" : "Выберите группу и практику",
      groupId ? "Практика нужна, чтобы загрузить сохранённые назначения." : "Здесь появится таблица студентов и их назначений.",
      data.groups.length ? (data.practices.length ? "" : "Создать практику") : "Перейти к импорту",
      data.groups.length ? "practice" : "imports",
    );
    return;
  }
  if (!data.groups.length || !data.practices.length) {
    $("distribution-empty").hidden = false;
    setDistributionEmpty("Нет практик для распределения", "Сначала загрузите студентов, создайте практику и укажите организацию.", "Создать практику", "practice");
    return;
  }
  const practice = data.practices.find((item) => item.id === Number(practiceId));
  if (!practice || practice.group_id !== Number(groupId)) {
    $("distribution-empty").hidden = false;
    setDistributionEmpty("Выберите практику этой группы", "Список практик обновился. Выберите практику ещё раз.");
    return;
  }
  if (!data.students.length) {
    $("distribution-empty").hidden = false;
    setDistributionEmpty("Нет студентов", "Загрузите список студентов, чтобы начать распределение.", "Перейти к импорту", "imports");
    return;
  }
  const studentsInGroup = data.students.filter((student) => student.group_id === Number(groupId));
  if (!studentsInGroup.length) {
    $("distribution-empty").hidden = false;
    setDistributionEmpty("В группе нет студентов", "Загрузите список студентов этой группы.", "Перейти к импорту", "imports");
    return;
  }
  if (!data.organizations.length) {
    $("distribution-empty").hidden = false;
    setDistributionEmpty("Нет организаций", "Сначала загрузите список организаций.", "Перейти к импорту", "imports");
    return;
  }

  $("distribution-empty").hidden = true;
  showDistributionMessage();
  $("distribution-workspace").hidden = true;
  $("distribution-loading").hidden = false;
  $("distribution-retry").hidden = true;
  try {
    const [students, assignments] = await Promise.all([
      api(`/students?group_id=${encodeURIComponent(groupId)}`),
      api(`/assignments/practice/${encodeURIComponent(practiceId)}`),
    ]);
    if (requestId !== distributionRequestId) return;
    $("distribution-empty").hidden = true;
    data.assignmentsByPractice.set(Number(practiceId), assignments);
    renderDistributionTable(students, new Map(assignments.map((assignment) => [assignment.student_id, assignment])));
    $("distribution-loading").hidden = true;
    $("distribution-workspace").hidden = false;
  } catch (error) {
    if (requestId !== distributionRequestId) return;
    $("distribution-loading").hidden = true;
    $("distribution-empty").hidden = true;
    $("distribution-workspace").hidden = true;
    showDistributionMessage(friendlyError(error, "assignments"), true, "load");
  }
}

function refreshDistributionSafely() {
  refreshDistribution().catch((error) => {
    if (error.status === 401) return;
    showDistributionMessage(friendlyError(error, "assignments"), true, "load");
  });
}

function applyBulkToAllRows() {
  const fields = ["organization_id", "supervisor_id", "practice_form", "payment_type"];
  const bulkValues = Object.fromEntries(fields.map((field) => [field, $(`distribution-bulk-${field === "organization_id" ? "organization" : field === "supervisor_id" ? "supervisor" : field === "practice_form" ? "practice-form" : "payment-type"}`).value]));
  document.querySelectorAll("#distribution-body tr").forEach((row) => {
    fields.forEach((field) => {
      const value = bulkValues[field];
      if (value) row.querySelector(`[name="${field}"]`).value = value;
    });
    updateRowStatus(row);
  });
  updateDistributionCount();
  showToast("Значения применены ко всем строкам.");
}

function distributionRowPayload(row, practiceId) {
  const readValue = (field) => row.querySelector(`[name="${field}"]`).value.trim();
  const organizationId = readValue("organization_id");
  if (!organizationId) return null;
  const payload = {
    student_id: Number(row.dataset.studentId),
    practice_id: Number(practiceId),
    organization_id: Number(organizationId),
  };
  const supervisorId = readValue("supervisor_id");
  if (supervisorId) payload.supervisor_id = Number(supervisorId);
  ["practice_form", "payment_type"].forEach((field) => {
    const value = readValue(field);
    if (value) payload[field] = value;
  });
  return payload;
}

async function submitDistribution(event) {
  event.preventDefault();
  const practiceId = $("distribution-practice").value;
  if (!practiceId) {
    showDistributionMessage("Сначала выберите практику.", true);
    return;
  }
  const rows = Array.from(document.querySelectorAll("#distribution-body tr"));
  const payloads = rows.map((row) => distributionRowPayload(row, practiceId)).filter(Boolean);
  if (!payloads.length) {
    showDistributionMessage("Укажите организацию хотя бы для одного студента.", true);
    return;
  }

  const button = $("distribution-submit");
  setButtonBusy(button, true, "Сохранение…");
  showDistributionMessage();
  try {
    const results = await Promise.allSettled(
      payloads.map((payload) => api("/assignments/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })),
    );
    const savedCount = results.filter((result) => result.status === "fulfilled").length;
    const failedCount = results.length - savedCount;
    const skippedCount = rows.length - payloads.length;
    if (!failedCount) {
      const skippedNote = skippedCount ? ` Без организации: ${skippedCount}.` : "";
      showDistributionMessage(`Сохранено назначений: ${savedCount}.${skippedNote}`);
      showToast("Распределение сохранено.");
      await refreshDistributionSafelyAsync();
      refreshOverviewInBackground();
    } else {
      showDistributionMessage(`Сохранено: ${savedCount}. Не удалось сохранить: ${failedCount}. Повторите сохранение.`, true, "save");
    }
  } catch (error) {
    if (error.status === 401) return;
    showDistributionMessage(friendlyError(error, "assignments"), true, "save");
  } finally {
    setButtonBusy(button, false);
  }
}

function refreshDistributionSafelyAsync() {
  return refreshDistribution();
}

function refreshOverviewInBackground() {
  refreshData({ showLoading: false }).then(renderOverview).catch(() => {});
}

async function submitPracticeForm(form, endpoint, messageId, successMessage) {
  let valid = true;
  form.querySelectorAll("[aria-invalid='true']").forEach((field) => {
    field.removeAttribute("aria-invalid");
    const error = $(`${field.id}-error`);
    if (error) error.hidden = true;
  });
  form.querySelectorAll("[required]").forEach((field) => {
    if (String(field.value).trim()) return;
    field.setAttribute("aria-invalid", "true");
    $(`${field.id}-error`).textContent = "Заполните это поле.";
    $(`${field.id}-error`).hidden = false;
    valid = false;
  });
  if (!valid) return;

  if (form.id === "practice-form") {
    const start = $("practice-start-date").value;
    const end = $("practice-end-date").value;
    if (start && end && end < start) {
      const field = $("practice-end-date");
      field.setAttribute("aria-invalid", "true");
      $("practice-end-date-error").textContent = "Дата окончания не может быть раньше даты начала.";
      $("practice-end-date-error").hidden = false;
      field.focus();
      return;
    }
  }

  const payload = Object.fromEntries(new FormData(form));
  const button = form.querySelector('button[type="submit"]');
  const retryButton = $(`${form.id.replace("-form", "")}-retry`);
  setButtonBusy(button, true, "Сохранение…");
  if (retryButton) retryButton.hidden = true;
  showInline(messageId);
  try {
    await api(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    form.reset();
    form.querySelectorAll("[id$='-error']").forEach((error) => { error.hidden = true; });
    showInline(messageId, successMessage);
    showToast(successMessage);
    await refreshData({ showLoading: false });
  } catch (error) {
    if (error.status === 401) {
      showLogin("Сессия истекла. Войдите снова.");
      return;
    }
    if (error.status === 404 && form.id === "practice-form") {
      $("practice-group").setAttribute("aria-invalid", "true");
      $("practice-group-error").textContent = "Группа не найдена. Обновите список групп и выберите её снова.";
      $("practice-group-error").hidden = false;
      $("practice-group").focus();
    } else {
      showInline(messageId, friendlyError(error, "practice"), true);
      if (retryButton) retryButton.hidden = false;
    }
  } finally {
    setButtonBusy(button, false);
  }
}

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

function resetImport({ keepMessage = false } = {}) {
  importState.validationId += 1;
  importState.file = null;
  importState.uploadFile = null;
  importState.result = null;
  importState.validating = false;
  importState.uploading = false;
  $("import-form").reset();
  $("import-file-row").hidden = true;
  $("import-validation-loading").hidden = true;
  $("import-progress").hidden = true;
  $("import-report").hidden = true;
  $("import-errors").replaceChildren();
  $("import-submit").disabled = true;
  $("import-submit").textContent = "Импортировать записи";
  $("import-file").value = "";
  if (!keepMessage) showInline("import-message");
}

function updateImportType(type) {
  resetImport();
  importState.type = type;
  const typeInput = document.querySelector(`input[name="import-type"][value="${type}"]`);
  if (typeInput) typeInput.checked = true;
  const config = IMPORT_CONFIG[type];
  $("import-file").accept = config.extension;
  $("import-requirements").textContent = config.requirements;
}

function importError(message, row = null) {
  return { row, message };
}

async function validateStudentsFile(file) {
  if (!window.XLSX) {
    return { count: 0, errors: [importError("Библиотека проверки XLSX не загрузилась. Проверьте соединение и обновите страницу.")] };
  }
  const workbook = window.XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: false });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return { count: 0, errors: [importError("В Excel-файле нет листов.")] };
  const rows = window.XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: null, raw: true });
  let group = "";
  let headerIndex = -1;
  let nameColumn = -1;
  let recordBookColumn = -1;
  for (let index = 0; index < rows.length; index += 1) {
    const normalized = rows[index].map((value) => value === null ? "" : String(value).trim());
    normalized.forEach((value) => {
      const match = value.match(/Список студентов группы\s+(.+)/i);
      if (match) group = match[1].trim();
    });
    const currentName = normalized.indexOf("Фамилия, имя, отчество");
    const currentRecordBook = normalized.indexOf("Номер зачетки");
    if (currentName >= 0 && currentRecordBook >= 0) {
      headerIndex = index;
      nameColumn = currentName;
      recordBookColumn = currentRecordBook;
      break;
    }
  }
  const errors = [];
  if (!group) errors.push(importError("Не удалось определить группу из заголовка Excel."));
  if (group && !data.groups.some((item) => item.name === group) && !/-(\d{2})-/.test(group)) {
    errors.push(importError("В названии новой группы должен быть год набора, например «ИВТ-25-01»."));
  }
  if (headerIndex < 0) errors.push(importError("Не найдены колонки «Фамилия, имя, отчество» и «Номер зачетки»."));
  if (errors.length) return { count: 0, errors };

  const records = [];
  const invalidRows = new Set();
  for (let index = headerIndex + 1; index < rows.length; index += 1) {
    const fullNameValue = rows[index][nameColumn];
    const recordBookValue = rows[index][recordBookColumn];
    const emptyName = fullNameValue === null || String(fullNameValue).trim() === "";
    const emptyRecordBook = recordBookValue === null || String(recordBookValue).trim() === "";
    if (emptyName && emptyRecordBook) continue;
    const rowNumber = index + 1;
    if (emptyName || emptyRecordBook) {
      errors.push(importError("Отсутствует ФИО или номер зачётки.", rowNumber));
      invalidRows.add(rowNumber);
      continue;
    }
    const recordBook = Number(recordBookValue);
    if (!Number.isInteger(recordBook) || recordBook <= 0) {
      errors.push(importError("Некорректный номер зачётки.", rowNumber));
      invalidRows.add(rowNumber);
      continue;
    }
    records.push({ row: rowNumber, fullName: String(fullNameValue).trim(), recordBook });
  }
  const seen = new Map();
  records.forEach((record) => {
    if (seen.has(record.recordBook)) {
      invalidRows.add(record.row);
      invalidRows.add(seen.get(record.recordBook).row);
    } else {
      seen.set(record.recordBook, record);
    }
  });
  if (invalidRows.size) {
    const duplicateRows = records.filter((record) => invalidRows.has(record.row) && !errors.some((error) => error.row === record.row));
    duplicateRows.forEach((record) => errors.push(importError("Номер зачётки повторяется в файле.", record.row)));
  }
  if (!records.length) errors.push(importError("В Excel-файле не найдены записи студентов."));
  const count = records.filter((record) => !invalidRows.has(record.row)).length;
  return { count, errors };
}

function encodeCp1251(text) {
  const punctuation = new Map([
    [0x0401, 0xa8], [0x0451, 0xb8], [0x2013, 0x96], [0x2014, 0x97],
    [0x2018, 0x91], [0x2019, 0x92], [0x201a, 0x82], [0x201c, 0x93],
    [0x201d, 0x94], [0x201e, 0x84], [0x2020, 0x86], [0x2021, 0x87],
    [0x2022, 0x95], [0x2026, 0x85], [0x2030, 0x89], [0x2039, 0x8b],
    [0x203a, 0x9b], [0x20ac, 0x88], [0x2116, 0xb9], [0x2122, 0x99],
    [0x00a0, 0xa0], [0x00ad, 0xad], [0x00ab, 0xab], [0x00bb, 0xbb],
  ]);
  const bytes = [];
  for (const character of text) {
    const code = character.codePointAt(0);
    if (code <= 0x7f) bytes.push(code);
    else if (code >= 0x0410 && code <= 0x042f) bytes.push(code - 0x0410 + 0xc0);
    else if (code >= 0x0430 && code <= 0x044f) bytes.push(code - 0x0430 + 0xe0);
    else if (punctuation.has(code)) bytes.push(punctuation.get(code));
    else throw new Error(`Символ «${character}» не поддерживается в cp1251.`);
  }
  return new Uint8Array(bytes);
}

async function validateOrganizationsFile(file) {
  const buffer = await file.arrayBuffer();
  let encoding = "utf-8";
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    encoding = "cp1251";
    text = new TextDecoder("windows-1251").decode(buffer);
  }
  text = text.replace(/^\uFEFF/, "");
  const errors = [];
  let count = 0;
  text.split(/\r?\n/).forEach((sourceLine, index) => {
    const line = sourceLine.trim();
    if (!line) return;
    if (line.includes(",")) {
      const separator = line.lastIndexOf(",");
      if (!line.slice(0, separator).trim() || !line.slice(separator + 1).trim()) {
        errors.push(importError("Ожидаются название и адрес организации.", index + 1));
        return;
      }
    }
    count += 1;
  });
  if (!count && !errors.length) errors.push(importError("В TXT-файле не найдены организации."));
  let uploadFile = file;
  if (encoding === "utf-8" && !errors.length) {
    try {
      uploadFile = new File([encodeCp1251(text)], file.name, { type: "text/plain" });
    } catch (error) {
      errors.push(importError(error.message));
      count = 0;
    }
  }
  return { count, errors, uploadFile, encoding };
}

function pdfItemsToText(items) {
  const lines = [];
  let current = [];
  let previousY = null;
  const flushLine = () => {
    let text = "";
    let previous = null;
    current.sort((a, b) => a.x - b.x).forEach((entry) => {
      const separated = previous && entry.x - (previous.x + previous.width) > 2;
      if (separated && !text.endsWith(" ") && !entry.text.startsWith(" ")) text += " ";
      text += entry.text;
      previous = entry;
    });
    lines.push(text);
    current = [];
  };
  items.forEach((item) => {
    const y = Math.round(item.transform[5] * 2) / 2;
    if (previousY !== null && Math.abs(y - previousY) > 2 && current.length) flushLine();
    if (item.str.trim()) current.push({ x: item.transform[4], width: item.width, text: item.str });
    previousY = y;
    if (item.hasEOL && current.length) {
      flushLine();
      previousY = null;
    }
  });
  if (current.length) flushLine();
  return lines.join("\n");
}

async function validateGradesheetFile(file) {
  if (!window.pdfjsLib) {
    return { count: 0, errors: [importError("Библиотека проверки PDF не загрузилась. Проверьте соединение и обновите страницу.")] };
  }
  const task = window.pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const pdf = await task.promise;
  const pages = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(pdfItemsToText(content.items));
  }
  const text = pages.join("\n");
  const groupMatch = text.match(/\b[А-ЯЁA-Z]{2,}\d{2}[А-ЯЁа-яё]?-?\d{2}-\d{2}\b/i);
  const errors = [];
  if (!groupMatch) errors.push(importError("Не удалось определить группу в ведомости."));
  const fragments = text.split(/\r?\n/).map((line) => line.replace(/\s+/g, " ").trim());
  const gradeValues = new Map([["отлично", 5], ["хорошо", 4], ["удовлетворительно", 3], ["неявка", 2]]);
  const students = [];
  let index = 0;
  while (index < fragments.length) {
    if (!/^\d{1,3}$/.test(fragments[index])) {
      index += 1;
      continue;
    }
    const startIndex = index;
    const nameParts = [];
    index += 1;
    while (index < fragments.length && !/^\d{5,}$/.test(fragments[index])) {
      nameParts.push(fragments[index]);
      index += 1;
    }
    if (index >= fragments.length) break;
    const fullName = nameParts.join(" ").trim();
    index += 1;
    while (index < fragments.length && !fragments[index]) index += 1;
    if (index >= fragments.length) break;
    const gradeText = fragments[index].toLowerCase();
    const grade = gradeValues.get(gradeText);
    if (!fullName || fullName.split(" ").length < 2 || fullName.split(" ").length > 4) {
      index += 1;
      continue;
    }
    if (grade === undefined) {
      errors.push(importError(`Неизвестная оценка для студента ${fullName}.`, startIndex + 1));
    } else {
      students.push({ fullName, grade });
    }
    index += 1;
  }
  if (!students.length && !errors.length) errors.push(importError("В PDF-ведомости не найдены студенты с оценками."));
  await pdf.destroy();
  return { count: students.length, errors };
}

async function validateImportFile(file, type) {
  if (type === "students") return validateStudentsFile(file);
  if (type === "organizations") return validateOrganizationsFile(file);
  return validateGradesheetFile(file);
}

function renderImportReport() {
  const result = importState.result;
  if (!result) {
    $("import-report").hidden = true;
    return;
  }
  const report = $("import-report");
  report.hidden = false;
  report.classList.toggle("has-errors", result.errors.length > 0);
  const countLabel = `${result.count} ${plural(result.count, ["запись", "записи", "записей"])}`;
  $("import-report-summary").textContent = result.errors.length
    ? `Найдено ${result.errors.length} ${plural(result.errors.length, ["ошибка", "ошибки", "ошибок"])}. Корректных записей: ${countLabel}. Исправьте файл и загрузите его снова: импорт выполняется целиком.`
    : `Проверено: ${countLabel}. Файл готов к импорту.`;
  const items = result.errors.map((error) => {
    const item = document.createElement("li");
    item.textContent = `${error.row ? `Строка ${error.row} · ` : ""}${error.message}`;
    return item;
  });
  $("import-errors").replaceChildren(...items);
  const downloadReport = $("import-download-report");
  downloadReport.hidden = result.errors.length === 0;
  const submit = $("import-submit");
  submit.disabled = importState.validating || importState.uploading || result.count === 0 || result.errors.length > 0;
  submit.textContent = result.count ? `Импортировать ${result.count} ${plural(result.count, ["запись", "записи", "записей"])}` : "Импортировать записи";
}

async function handleImportFile(file) {
  resetImport();
  if (!file) return;
  importState.file = file;
  importState.uploadFile = file;
  $("import-file-name").textContent = file.name;
  $("import-file-size").textContent = `${formatFileSize(file.size)} · ${IMPORT_CONFIG[importState.type].extension.slice(1).toUpperCase()}`;
  $("import-file-row").hidden = false;
  const validationId = ++importState.validationId;
  const config = IMPORT_CONFIG[importState.type];
  const errors = [];
  if (!file.name.toLowerCase().endsWith(config.extension)) errors.push(importError(`Ожидается файл ${config.extension}.`));
  if (file.size === 0) errors.push(importError("Файл пуст."));
  if (file.size > MAX_IMPORT_SIZE) errors.push(importError("Размер файла превышает 5 МБ."));
  if (errors.length) {
    importState.result = { count: 0, errors };
    renderImportReport();
    return;
  }

  importState.validating = true;
  $("import-validation-loading").hidden = false;
  $("import-submit").disabled = true;
  try {
    const result = await validateImportFile(file, importState.type);
    if (validationId !== importState.validationId) return;
    importState.result = result;
    importState.uploadFile = result.uploadFile || file;
  } catch (error) {
    if (validationId !== importState.validationId) return;
    console.error("Import validation failed", error);
    importState.result = { count: 0, errors: [importError("Не удалось прочитать файл. Проверьте формат и содержимое.")] };
  } finally {
    if (validationId === importState.validationId) {
      importState.validating = false;
      $("import-validation-loading").hidden = true;
      renderImportReport();
    }
  }
}

function downloadImportReport() {
  const result = importState.result;
  if (!result || !importState.file) return;
  const lines = [
    `DocFlow · отчёт проверки ${importState.file.name}`,
    `Валидных записей: ${result.count}`,
    `Ошибок: ${result.errors.length}`,
    "",
    ...result.errors.map((error) => `${error.row ? `Строка ${error.row}: ` : ""}${error.message}`),
  ];
  const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" }));
  triggerDownload(url, `${importState.file.name}.report.txt`);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function uploadImport(endpoint, file) {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    const formData = new FormData();
    formData.append("file", file, file.name);
    request.open("POST", endpoint);
    request.withCredentials = true;
    request.upload.addEventListener("progress", (event) => {
      if (!event.lengthComputable) return;
      const percent = Math.round((event.loaded / event.total) * 100);
      $("import-progress-bar").value = percent;
      $("import-progress-value").textContent = `${percent}%`;
      if (percent === 100) {
        $("import-progress-label").textContent = "Обработка на сервере";
        $("import-progress-value").textContent = "";
        $("import-progress-bar").removeAttribute("value");
      }
    });
    request.addEventListener("load", () => {
      let body = null;
      try {
        body = request.responseText ? JSON.parse(request.responseText) : null;
      } catch {
        body = null;
      }
      if (request.status >= 200 && request.status < 300) resolve(body);
      else reject(new ApiError(request.status, typeof body?.detail === "string" ? body.detail : ""));
    });
    request.addEventListener("error", () => reject(new ApiError(0)));
    request.addEventListener("abort", () => reject(new ApiError(0)));
    request.send(formData);
  });
}

async function submitImport(event) {
  event.preventDefault();
  const result = importState.result;
  if (!result || result.errors.length || !result.count || importState.validating || importState.uploading) return;
  importState.uploading = true;
  const button = $("import-submit");
  button.disabled = true;
  button.textContent = "Импорт…";
  showInline("import-message");
  $("import-progress").hidden = false;
  $("import-progress-label").textContent = "Загрузка файла";
  $("import-progress-value").textContent = "0%";
  const progress = $("import-progress-bar");
  progress.max = 100;
  progress.value = 0;
  try {
    const response = await uploadImport(IMPORT_CONFIG[importState.type].endpoint, importState.uploadFile);
    const isGradesheet = importState.type === "gradesheets";
    const message = isGradesheet
      ? `Обновлено оценок: ${response.created}.`
      : `Создано: ${response.created}, пропущено: ${response.skipped}.`;
    resetImport({ keepMessage: true });
    showInline("import-message", message);
    showToast(isGradesheet ? "Оценки обновлены." : "Импорт завершён.");
    await refreshData({ showLoading: false });
  } catch (error) {
    if (error.status === 401) {
      showLogin("Сессия истекла. Войдите снова.");
    } else {
      showInline("import-message", friendlyError(error, "import"), true);
    }
  } finally {
    importState.uploading = false;
    $("import-progress").hidden = true;
    renderImportReport();
  }
}

function updateDocumentPracticeControl() {
  const type = new FormData($("document-form")).get("document_type") || "directions";
  const single = type === "directions";
  const multiple = $("document-practices");
  $("document-single-practice").hidden = !single;
  $("document-multiple-practices").hidden = single;
  $("document-practice").required = single;
  if (!single && multiple.selectedOptions.length === 0) {
    multiple.options[0].selected = true;
  }
  multiple.dataset.allSelected = String(multiple.options[0]?.selected ?? false);
}

function handleDocumentMultiSelect() {
  const select = $("document-practices");
  const options = Array.from(select.options);
  const all = options[0];
  if (!all) return;
  const hadAll = select.dataset.allSelected === "true";
  if (all.selected && !hadAll) {
    options.forEach((option) => { option.selected = option === all; });
  } else if (all.selected && hadAll && select.selectedOptions.length > 1) {
    all.selected = false;
  }
  if (!select.selectedOptions.length) all.selected = true;
  select.dataset.allSelected = String(all.selected);
}

function renderDocumentHistory() {
  const list = $("document-history");
  const items = documentHistory.map((entry) => {
    const item = document.createElement("li");
    item.className = `document-item${entry.status === "error" ? " has-error" : ""}`;
    item.classList.toggle("has-error", entry.status === "error");
    item.dataset.documentId = String(entry.id);
    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    icon.setAttribute("class", "icon");
    icon.setAttribute("aria-hidden", "true");
    const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
    use.setAttribute("href", "#icon-document");
    icon.append(use);
    const info = document.createElement("div");
    info.className = "document-info";
    const name = document.createElement("strong");
    name.textContent = entry.status === "error" ? DOCUMENT_CONFIG[entry.type].filename : entry.filename;
    const meta = document.createElement("span");
    meta.className = "meta-label";
    meta.textContent = `${DOCUMENT_CONFIG[entry.type].label} · ${entry.createdAt}`;
    info.append(name, meta);
    if (entry.status === "error" && entry.error) {
      const error = document.createElement("span");
      error.className = "document-error";
      error.textContent = entry.error;
      info.append(error);
    }
    const badge = document.createElement("span");
    const statusClass = entry.status === "ready" ? "success" : entry.status === "pending" ? "pending" : "error";
    const statusText = entry.status === "ready" ? "Готово" : entry.status === "pending" ? "Формируется" : "Ошибка";
    badge.className = `status-badge ${statusClass}`;
    badge.textContent = statusText;
    item.append(icon, info, badge);
    if (entry.status === "ready") {
      const download = document.createElement("button");
      download.type = "button";
      download.className = "button tertiary";
      download.textContent = "Скачать";
      download.addEventListener("click", () => triggerDownload(entry.url, entry.filename));
      item.append(download);
    } else if (entry.status === "error") {
      const retry = document.createElement("button");
      retry.type = "button";
      retry.className = "button secondary";
      retry.textContent = "Повторить";
      retry.addEventListener("click", () => generateDocument(entry));
      item.append(retry);
    } else {
      const progress = document.createElement("progress");
      progress.className = "document-progress";
      progress.setAttribute("aria-label", "Формирование документа");
      item.append(progress);
    }
    return item;
  });
  list.replaceChildren(...items);
  $("document-history-empty").hidden = documentHistory.length > 0;
  $("document-history-count").textContent = `${documentHistory.length} ${plural(documentHistory.length, ["файл", "файла", "файлов"])}`;
  if (data.user) renderOverview();
}

function triggerDownload(url, filename) {
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
}

function documentFilename(contentDisposition, fallback) {
  if (!contentDisposition) return fallback;
  const encoded = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (encoded) {
    try {
      return decodeURIComponent(encoded[1].trim().replace(/^"|"$/g, ""));
    } catch {
      return fallback;
    }
  }
  const filename = contentDisposition.match(/filename="?([^";]+)"?/i);
  return filename ? filename[1].trim() : fallback;
}

function documentRequest(type) {
  const config = DOCUMENT_CONFIG[type];
  const query = new URLSearchParams();
  if (type === "directions") {
    const practiceId = $("document-practice").value;
    if (!practiceId) return null;
    query.set("practice_id", practiceId);
  } else {
    Array.from($("document-practices").selectedOptions).forEach((option) => {
      if (option.value !== SELECT_ALL_PRACTICES_VALUE) query.append("practice_ids", option.value);
    });
  }
  const queryString = query.toString();
  return `${config.endpoint}${queryString ? `?${queryString}` : ""}`;
}

async function generateDocument(entry) {
  if (entry.status === "pending") return;
  entry.status = "pending";
  entry.filename = DOCUMENT_CONFIG[entry.type].filename;
  entry.error = "";
  if (entry.url) {
    URL.revokeObjectURL(entry.url);
    entry.url = "";
  }
  renderDocumentHistory();
  const submit = $("document-submit");
  submit.disabled = true;
  submit.dataset.busy = "true";
  showInline("document-message");
  try {
    let response;
    try {
      response = await fetch(entry.urlRequest, { credentials: "same-origin" });
    } catch {
      throw new ApiError(0);
    }
    const contentType = response.headers.get("content-type") || "";
    if (!response.ok) throw await responseError(response);
    if (!contentType.includes("wordprocessingml")) throw new ApiError(500);
    const blob = await response.blob();
    if (!documentHistory.includes(entry)) return;
    entry.url = URL.createObjectURL(blob);
    entry.filename = documentFilename(response.headers.get("content-disposition"), DOCUMENT_CONFIG[entry.type].filename);
    entry.status = "ready";
    renderDocumentHistory();
    triggerDownload(entry.url, entry.filename);
    showToast("Документ сформирован и скачан.");
  } catch (error) {
    if (!documentHistory.includes(entry)) return;
    if (error.status === 401) {
      showLogin("Сессия истекла. Войдите снова.");
      return;
    }
    entry.status = "error";
    entry.error = friendlyError(error, "documents");
    renderDocumentHistory();
    showInline("document-message", "Документ не сформирован. Подробнее см. в истории.", true);
  } finally {
    delete submit.dataset.busy;
    submit.disabled = documentHistory.some((item) => item.status === "pending");
  }
}

function submitDocument(event) {
  event.preventDefault();
  const type = new FormData($("document-form")).get("document_type") || "directions";
  if ($("document-submit").dataset.busy === "true") return;
  const urlRequest = documentRequest(type);
  if (!urlRequest) {
    showInline("document-message", "Выберите практику для формирования направлений.", true);
    return;
  }
  const entry = {
    id: ++documentSequence,
    type,
    urlRequest,
    filename: DOCUMENT_CONFIG[type].filename,
    status: "new",
    createdAt: new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" }).format(new Date()),
    url: "",
  };
  documentHistory.unshift(entry);
  generateDocument(entry);
}

function bindDropzone() {
  const dropzone = $("import-dropzone");
  ["dragenter", "dragover"].forEach((eventName) => {
    dropzone.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropzone.classList.add("dragover");
    });
  });
  ["dragleave", "drop"].forEach((eventName) => {
    dropzone.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropzone.classList.remove("dragover");
    });
  });
  dropzone.addEventListener("drop", (event) => {
    const file = event.dataTransfer.files[0];
    if (!file) return;
    const transfer = new DataTransfer();
    transfer.items.add(file);
    $("import-file").files = transfer.files;
    handleImportFile(file);
  });
}

function bindEvents() {
  window.addEventListener("hashchange", renderRoute);
  $("overview-next").addEventListener("click", (event) => {
    const button = event.currentTarget;
    const importType = button.dataset.importType;
    if (importType) {
      const currentType = document.querySelector('input[name="import-type"]:checked')?.value;
      const selector = document.querySelector(`input[name="import-type"][value="${importType}"]`);
      if (selector && currentType !== importType) {
        selector.checked = true;
        updateImportType(importType);
      }
    }
    navigate(button.dataset.routeTarget || "imports");
  });
  $("overview-retry").addEventListener("click", () => refreshData().catch(() => {}));
  $("auth-form").addEventListener("submit", submitAuth);
  $("auth-toggle").addEventListener("click", () => {
    authMode = authMode === "login" ? "register" : "login";
    $("auth-form").reset();
    clearAuthErrors();
    showInline("auth-message");
    $("forgot-password-hint").hidden = true;
    updateAuthForm();
    $("auth-username").focus();
  });
  $("forgot-password").addEventListener("click", () => {
    $("forgot-password-hint").hidden = !$("forgot-password-hint").hidden;
  });
  $("logout-button").addEventListener("click", async () => {
    try {
      await api("/auth/logout", { method: "POST" });
    } catch {
      showToast("Сеанс завершён на этом устройстве.", false);
    } finally {
      showLogin();
    }
  });

  document.querySelectorAll('input[name="import-type"]').forEach((input) => {
    input.addEventListener("change", () => updateImportType(input.value));
  });
  $("import-file").addEventListener("change", (event) => handleImportFile(event.target.files[0]));
  $("import-file-remove").addEventListener("click", () => resetImport());
  $("import-download-report").addEventListener("click", downloadImportReport);
  $("import-form").addEventListener("submit", submitImport);
  bindDropzone();

  $("supervisor-form").addEventListener("submit", (event) => {
    event.preventDefault();
    submitPracticeForm(event.currentTarget, "/practice/create_supervisor", "supervisor-message", "Руководитель создан.");
  });
  $("practice-form").addEventListener("submit", (event) => {
    event.preventDefault();
    submitPracticeForm(event.currentTarget, "/practice/create", "practice-message", "Практика создана.");
  });
  $("supervisor-retry").addEventListener("click", () => $("supervisor-form").requestSubmit());
  $("practice-retry").addEventListener("click", () => $("practice-form").requestSubmit());

  $("distribution-group").addEventListener("change", () => {
    updateDistributionPracticeSelect(false);
    refreshDistributionSafely();
  });
  $("distribution-practice").addEventListener("change", refreshDistributionSafely);
  $("distribution-bulk-apply").addEventListener("click", applyBulkToAllRows);
  $("distribution-form").addEventListener("submit", submitDistribution);
  $("distribution-retry").addEventListener("click", () => {
    if ($("distribution-retry").dataset.action === "save") $("distribution-form").requestSubmit();
    else refreshDistributionSafely();
  });

  document.querySelectorAll('input[name="document_type"]').forEach((input) => {
    input.addEventListener("change", updateDocumentPracticeControl);
  });
  $("document-practices").addEventListener("change", handleDocumentMultiSelect);
  $("document-form").addEventListener("submit", submitDocument);
}

document.addEventListener("DOMContentLoaded", () => {
  if (window.pdfjsLib) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  }
  bindEvents();
  updateDocumentPracticeControl();
  renderDocumentHistory();
  renderRoute();
  api("/auth/me").then(showApplication).catch(() => showLogin());
});
