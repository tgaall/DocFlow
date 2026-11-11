# DocFlow

Генерация документов практики студентов: импорт списков студентов и организаций,
распределение, генерация направлений, приказов и отчётов (.docx).

Один репозиторий — два варианта поставки:

| Edition | Платформа | БД | Запуск |
|---|---|---|---|
| **Web** | Linux VPS / сервер | PostgreSQL (`DATABASE_URL`) | `uvicorn src.main:app` или Docker (`platforms/web/`) |
| **Windows Desktop** | Windows 10/11, офлайн | SQLite в `%LOCALAPPDATA%/DocFlow` | `DocFlow.exe` (PyInstaller) |

Общее ядро — пакет `src/` (models, schemas, repositories, services, routers, auth).
Платформа выбирается переменной окружения `DOCFLOW_PLATFORM` (`web` — по умолчанию,
`windows` — десктопная редакция); конфигурация централизована в `src/config.py`.

## Web Edition

```bash
pip install -r requirements.txt
export DATABASE_URL="postgresql://user:password@host/docflow"
uvicorn src.main:app --host 0.0.0.0 --port 8000
```

См. `platforms/web/README.md` и `platforms/web/Dockerfile`.

## Windows Desktop Edition

Данные пользователя (БД, импорт, экспорт, логи) хранятся вне EXE:

```text
%LOCALAPPDATA%/DocFlow/
├── database/docflow.db
├── imports/
├── exports/
└── logs/
```

Поэтому обновление EXE не затрагивает пользовательские данные. Повторный запуск
второго экземпляра блокируется lock-файлом; сервер слушает только `127.0.0.1`
на свободном порту и останавливается при закрытии приложения.

### Сборка EXE (на машине с Windows)

```bat
pip install -r requirements.txt -r requirements-build.txt
pyinstaller platforms/windows/DocFlow.spec
```

Результат: `dist/DocFlow.exe`. Установщик — `platforms/windows/installer/docflow.iss`
(Inno Setup), опционально.

Дистрибуция «на флешке»: передайте `DocFlow.exe` (или `DocFlowSetup.exe`)
пользователю любым носителем — после установки данные хранятся локально на ПК
пользователя в `%LOCALAPPDATA%\DocFlow`, флешка дальше не используется.
Подробная инструкция — `platforms/windows/README.md`.

## Разработка

```bash
pip install -r requirements.txt
pytest tests/            # web- и windows-профили, integration-тесты включены
```

Миграции схемы: `src/db/bootstrap.py` (`create_all` + `migrate_legacy_schema`
для точечных изменений существующих таблиц, включая SQLite).
