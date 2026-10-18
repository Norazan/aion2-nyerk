"""Addons' Python parts, run inside the helper (the app's shared/addons.ts has the rest).

The app starts the helper with `--addon <id>=<path>` for each addon switched on that has one. Each
file is loaded as its own module and its `setup(api)` is called with an `AddonApi`:

    from aion2_tracker import protocol as P

    def setup(api):
        @api.on_packet
        def packet(ts, pkt): ...            # every game packet, after the tracker has seen it
        @api.on_zone
        def zone(world): ...                # a new zone; None when the game closed
        @api.on_message
        def message(name, data): ...        # sent by the addon's own pages (nyerk.send)
        @api.on_settings
        def settings(values): ...           # its declared settings, at start and on each change
        @api.every(0.25)
        def tick(): ...                     # on a timer (under the tracker's lock, as the others)
        api.emit("nodes", [...])            # to the addon's own pages (nyerk.on("nodes", ...))
        api.world, api.position, api.height, api.self_entity   # the tracker's view, read only
        api.log("...")                      # a line in tracker.log

An addon runs with the helper's full access: this is for addons the user chose to trust. What the
contract promises (ADDON_API_VERSION 1 in the app) is this API and, from `aion2_tracker.protocol`,
`opcode`, `read_varint`, `_body`, `_f32` and the parse_* functions.

A hook that raises is logged; one that keeps raising (MAX_ERRORS) is switched off, and the app is
told, so a broken addon costs a line in the log rather than the tracker.

Lines out (the protocol's stdout):
    {"type": "addonLoaded", "addon": "nearby-nodes"}
    {"type": "addonError", "addon": "nearby-nodes", "detail": "...", "fatal": bool}
    {"type": "addon", "addon": "nearby-nodes", "name": "nodes", "data": ...}
"""

from __future__ import annotations

import importlib.util
import sys
import threading
import traceback
from pathlib import Path
from typing import Any, Callable

# Errors a hook may raise before its addon is switched off for the rest of the run.
MAX_ERRORS = 20


class AddonApi:
    def __init__(self, addon_id: str, folder: Path, tracker: Any, emit: Callable[[dict], None]) -> None:
        self.id = addon_id
        self.folder = folder
        self._tracker = tracker
        self._emit = emit
        self._packet: list[Callable] = []
        self._zone: list[Callable] = []
        self._message: list[Callable] = []
        self._settings: list[Callable] = []
        self._timers: list[tuple[float, Callable]] = []
        self.settings: dict = {}

    # Registration, usable as decorators.
    def on_packet(self, fn: Callable[[float, bytes], None]) -> Callable:
        self._packet.append(fn)
        return fn

    def on_zone(self, fn: Callable[[int | None], None]) -> Callable:
        self._zone.append(fn)
        return fn

    def on_message(self, fn: Callable[[str, Any], None]) -> Callable:
        self._message.append(fn)
        return fn

    def on_settings(self, fn: Callable[[dict], None]) -> Callable:
        self._settings.append(fn)
        return fn

    def every(self, seconds: float) -> Callable[[Callable[[], None]], Callable]:
        """Run the decorated function every `seconds` (at least 0.05) while the helper runs."""
        def register(fn: Callable[[], None]) -> Callable:
            self._timers.append((max(0.05, float(seconds)), fn))
            return fn
        return register

    def emit(self, name: str, data: Any = None) -> None:
        self._emit({"type": "addon", "addon": self.id, "name": str(name), "data": data})

    def log(self, message: str) -> None:
        print(f"addon {self.id}: {message}", file=sys.stderr)

    # The tracker's view, read only.
    @property
    def world(self) -> int | None:
        return self._tracker.world

    @property
    def position(self) -> tuple[float, float] | None:
        """Where you are, in the map data's coordinates (y as the app's maps have it)."""
        return self._tracker.position

    @property
    def height(self) -> float | None:
        return self._tracker.height

    @property
    def self_entity(self) -> int | None:
        return self._tracker.self_entity


class Addons:
    """Every addon loaded, and the calls into them, each guarded."""

    def __init__(self, tracker: Any, emit: Callable[[dict], None]) -> None:
        self.tracker = tracker
        self.emit = emit
        self.loaded: dict[str, AddonApi] = {}
        self.errors: dict[str, int] = {}

    def load(self, specs: list[str]) -> None:
        """`specs` as the command line has them: `<id>=<path to the .py file>`."""
        for spec in specs:
            addon_id, _, path = spec.partition("=")
            if not addon_id or not path:
                print(f"addons: ignoring {spec!r}", file=sys.stderr)
                continue
            self._load(addon_id, Path(path))

    def _load(self, addon_id: str, path: Path) -> None:
        api = AddonApi(addon_id, path.parent, self.tracker, self.emit)
        try:
            # The addon's own folder first, so it can import its other files.
            if str(path.parent) not in sys.path:
                sys.path.insert(0, str(path.parent))
            name = f"nyerk_addon_{addon_id.replace('-', '_')}"
            spec = importlib.util.spec_from_file_location(name, path)
            if spec is None or spec.loader is None:
                raise ImportError(f"cannot load {path}")
            module = importlib.util.module_from_spec(spec)
            # Registered before it runs, as an import would be: dataclasses look their module up there.
            sys.modules[name] = module
            try:
                spec.loader.exec_module(module)
            except BaseException:
                sys.modules.pop(name, None)
                raise
            setup = getattr(module, "setup", None)
            if not callable(setup):
                raise AttributeError(f"{path.name} has no setup(api)")
            setup(api)
        except Exception as e:  # noqa: BLE001 -- an addon must never stop the helper
            self._fail(addon_id, e, fatal=True)
            return
        self.loaded[addon_id] = api
        self.emit({"type": "addonLoaded", "addon": addon_id})
        for seconds, fn in api._timers:
            threading.Thread(target=self._tick, args=(api, seconds, fn), name=f"addon {addon_id}", daemon=True).start()

    def _tick(self, api: AddonApi, seconds: float, fn: Callable) -> None:
        stop = threading.Event()
        while not stop.wait(seconds):
            if self.loaded.get(api.id) is not api:
                return  # switched off for its errors
            with self.tracker.lock:
                self._call(api, [fn])

    def _fail(self, addon_id: str, error: BaseException, fatal: bool) -> None:
        detail = f"{type(error).__name__}: {error}"
        print(f"addon {addon_id}: {''.join(traceback.format_exception(error)).rstrip()}", file=sys.stderr)
        self.emit({"type": "addonError", "addon": addon_id, "detail": detail, "fatal": fatal})
        if fatal:
            self.loaded.pop(addon_id, None)

    def _call(self, api: AddonApi, hooks: list[Callable], *args: Any) -> None:
        for fn in hooks:
            try:
                fn(*args)
            except Exception as e:  # noqa: BLE001
                n = self.errors[api.id] = self.errors.get(api.id, 0) + 1
                self._fail(api.id, e, fatal=n >= MAX_ERRORS)
                if n >= MAX_ERRORS:
                    return

    def packet(self, ts: float, pkt: bytes) -> None:
        for api in list(self.loaded.values()):
            if api._packet:
                self._call(api, api._packet, ts, pkt)

    def zone(self, world: int | None) -> None:
        for api in list(self.loaded.values()):
            self._call(api, api._zone, world)

    def message(self, addon_id: str, name: str, data: Any) -> None:
        if api := self.loaded.get(addon_id):
            self._call(api, api._message, name, data)

    def settings(self, addon_id: str, values: dict) -> None:
        if api := self.loaded.get(addon_id):
            api.settings = dict(values)
            self._call(api, api._settings, api.settings)
