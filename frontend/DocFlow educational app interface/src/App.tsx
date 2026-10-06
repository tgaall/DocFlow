import { AllocationSection } from "./sections/Allocation";
import { DocumentsSection } from "./sections/Documents";
import { ImportsSection } from "./sections/Imports";
import { PracticeSection } from "./sections/Practice";
import { useDictionaries } from "./useDictionaries";
import { ArrowIcon, DictionaryNotice, PracticeTypeList } from "./ui";

const NAV_ITEMS = [
  { href: "#imports", label: "Импорт" },
  { href: "#practice", label: "Практика" },
  { href: "#assignments", label: "Распределение" },
  { href: "#documents", label: "Документы" },
];

const OVERVIEW_LINKS = [
  { href: "#imports", index: "01", label: "Импорт студентов и организаций" },
  { href: "#practice", index: "02", label: "Руководители и практики" },
  { href: "#assignments", index: "03", label: "Распределение студентов" },
  { href: "#documents", index: "04", label: "Направления, приказ, отчёт" },
];

export default function App() {
  const dictionaries = useDictionaries();
  const { groups, students, organizations, supervisors, practices } = dictionaries;

  // Metrics come from the live dictionaries: no placeholder numbers.
  // While they load, a dash is shown instead of a misleading zero.
  const metrics = [
    { value: students.length, label: "студентов" },
    { value: organizations.length, label: "организаций" },
    { value: practices.length, label: "практик" },
    { value: groups.length, label: "групп" },
  ];

  return (
    <div className="app-shell">
      <header className="site-header">
        <a className="brand" href="#overview">
          <span className="brand-mark">DF</span>
          DocFlow
        </a>
        <nav aria-label="Основная навигация">
          {NAV_ITEMS.map((item) => (
            <a key={item.href} href={item.href}>
              {item.label}
            </a>
          ))}
        </nav>
        <span className="status-label">
          <i />
          {dictionaries.loading ? "Синхронизация" : "Подключено к API"}
        </span>
      </header>

      <main>
        <PracticeTypeList />

        <section className="hero" id="overview">
          <div className="hero-copy">
            <span className="eyebrow">Документооборот практики</span>
            <h1>Распределение студентов и документы за четыре шага</h1>
            <p>
              Загрузите списки студентов и организаций, откройте практику,
              закрепите места прохождения — и получите направления, приказ и
              отчёт в DOCX. Каждая форма работает напрямую с API DocFlow.
            </p>
            <div className="hero-metrics">
              {metrics.map((metric) => (
                <div key={metric.label}>
                  <strong>{dictionaries.loaded ? metric.value : "—"}</strong>
                  <span>{metric.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="overview-links">
            <span className="overview-label">Рабочий процесс</span>
            {OVERVIEW_LINKS.map((link) => (
              <a key={link.href} href={link.href}>
                <span>{link.index}</span>
                <strong>{link.label}</strong>
                <ArrowIcon />
              </a>
            ))}
          </div>
        </section>

        <DictionaryNotice
          loading={dictionaries.loading}
          error={dictionaries.error}
          onRetry={() => void dictionaries.refresh()}
        />

        <ImportsSection onImported={() => dictionaries.refresh()} />

        <PracticeSection
          groups={groups}
          supervisors={supervisors}
          onCreate={() => dictionaries.refresh()}
        />

        <AllocationSection
          groups={groups}
          students={students}
          organizations={organizations}
          supervisors={supervisors}
          practices={practices}
        />

        <DocumentsSection
          groups={groups}
          dictionariesLoading={dictionaries.loading}
        />
      </main>

      <footer>
        <p>DocFlow — внутренний сервис практики</p>
        <button
          className="ghost-button"
          type="button"
          onClick={() => void dictionaries.refresh()}
        >
          Обновить справочники
        </button>
      </footer>
    </div>
  );
}