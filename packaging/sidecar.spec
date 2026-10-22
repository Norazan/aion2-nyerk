# PyInstaller spec for the native tracker helper (`aion2-tracker` on Linux), a one-folder build
# (starts faster than one-file, which unpacks itself on every launch).
#
#   cd app && npm run build:sidecar
#
# The monster-name table goes in as data/npcs_en.json, where aion2_tracker.analyze looks for it,
# the app's soul droppers as data/spawns.json (which pet a crystal's monster drops), and its pet
# list as data/pets.json (each pet's genus, which a crystal's must match).
from PyInstaller.utils.hooks import collect_submodules
import sys

a = Analysis(
    ["sidecar_entry.py"],
    pathex=[".."],
    datas=[("../data/npcs_en.json", "data"), ("../app/src/renderer/public/maps/spawns.json", "data"),
           ("../app/src/renderer/src/data/pets.json", "data")],
    # scapy imports its layers by name at runtime.
    hiddenimports=collect_submodules("scapy.layers") + collect_submodules("scapy.arch") + ["lz4.block"],
    excludes=["tkinter", "matplotlib", "IPython", "PIL", "pytest", "cryptography"],
    noarchive=False,
)
pyz = PYZ(a.pure)
exe = EXE(pyz, a.scripts, [], exclude_binaries=True, name="aion2-tracker", console=True,
          icon="../app/build/icon.ico" if sys.platform == "win32" else None)
coll = COLLECT(exe, a.binaries, a.datas, name="aion2-tracker")
