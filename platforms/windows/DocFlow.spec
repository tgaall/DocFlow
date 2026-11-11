# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller build spec for DocFlow Windows Desktop Edition.

Build (on Windows, from the repository root):
    pip install -r requirements.txt -r requirements-build.txt
    pyinstaller platforms/windows/DocFlow.spec

The SQLite database and user data live in %LOCALAPPDATA%/DocFlow and are
NOT part of the bundle, so replacing the EXE never touches user data.
"""

from pathlib import Path

project_root = Path(SPECPATH).parent.parent

a = Analysis(
    [str(project_root / "platforms" / "windows" / "launcher.py")],
    pathex=[str(project_root)],
    binaries=[],
    datas=[
        (str(project_root / "frontend"), "frontend"),
        (str(project_root / "templates"), "templates"),
    ],
    hiddenimports=[
        "docxtpl",
        "docx",
        "lxml",
        "lxml.etree",
        "pandas",
        "openpyxl",
        "pypdf",
        "aiosqlite",
        "uvicorn.logging",
        "uvicorn.loops",
        "uvicorn.loops.auto",
        "uvicorn.protocols",
        "uvicorn.protocols.http",
        "uvicorn.protocols.http.auto",
        "uvicorn.protocols.websockets",
        "uvicorn.protocols.websockets.auto",
        "uvicorn.lifespan",
        "uvicorn.lifespan.on",
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=["pytest"],
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name="DocFlow",
    debug=False,
    strip=False,
    upx=True,
    console=True,
)
