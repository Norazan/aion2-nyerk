"""Native capture setup, permissions, resource cleanup, and offline replay contracts."""

import threading
from types import SimpleNamespace
from unittest.mock import Mock

import pytest
from scapy.all import Ether, IP, TCP, Raw, wrpcap

from aion2_tracker import capture


def test_linux_selects_libpcap(monkeypatch):
    config = SimpleNamespace(use_pcap=False)
    monkeypatch.setattr(capture, "conf", config)
    monkeypatch.setattr(capture.sys, "platform", "linux")
    capture._configure_capture()
    assert config.use_pcap is True


def test_missing_libpcap_has_actionable_error(monkeypatch):
    class MissingPcap:
        @property
        def use_pcap(self):
            return False

        @use_pcap.setter
        def use_pcap(self, value):
            pass  # Scapy falls back to raw sockets when the library cannot load.

    monkeypatch.setattr(capture, "conf", MissingPcap())
    monkeypatch.setattr(capture.sys, "platform", "linux")
    with pytest.raises(RuntimeError, match="libpcap is required"):
        capture._configure_capture()


def test_windows_retains_scapy_backend(monkeypatch):
    config = SimpleNamespace(use_pcap=False)
    monkeypatch.setattr(capture, "conf", config)
    monkeypatch.setattr(capture.sys, "platform", "win32")
    capture._configure_capture()
    assert config.use_pcap is False


@pytest.mark.parametrize("error", [PermissionError("denied"), OSError("Operation not permitted")])
def test_linux_capture_permissions_have_actionable_error(monkeypatch, error):
    listen = Mock(side_effect=error)
    monkeypatch.setattr(capture, "conf", SimpleNamespace(L2listen=listen))
    monkeypatch.setattr(capture.sys, "platform", "linux")
    with pytest.raises(RuntimeError, match="CAP_NET_RAW") as exc:
        capture._listen("eth0")
    assert "do not run Electron as root" in str(exc.value)
    listen.assert_called_once_with(iface="eth0", filter="tcp", promisc=False)


def test_one_denied_adapter_does_not_prevent_other_capture(monkeypatch):
    bad = SimpleNamespace(name="eth0", description="Ethernet", ips={4: ["10.0.0.2"]})
    good = SimpleNamespace(name="tun0", description="VPN", ips={4: ["10.1.0.2"]})
    monkeypatch.setattr(capture, "pick_interfaces", lambda _: [bad, good])
    monkeypatch.setattr(capture, "conf", SimpleNamespace(ifaces={}))
    sock = Mock()
    monkeypatch.setattr(capture, "_listen", Mock(side_effect=[PermissionError("denied"), sock]))
    logs = []
    assert capture._open(logs.append) == {sock: "tun0"}
    assert any("could not open eth0" in line for line in logs)


def test_live_uses_selected_backend_and_closes_socket(monkeypatch):
    configure, socket = Mock(), Mock()
    monkeypatch.setattr(capture, "_configure_capture", configure)
    listen = Mock(return_value=socket)
    monkeypatch.setattr(capture, "_listen", listen)
    sniffer = Mock()
    sniffer.thread.is_alive.return_value = True
    create = Mock(return_value=sniffer)
    monkeypatch.setattr(capture, "AsyncSniffer", create)
    stop = threading.Event()
    stop.set()
    capture.live(capture.GameStream(Mock()), iface="tun0", stop=stop, log=Mock())
    configure.assert_called_once()
    listen.assert_called_once_with("tun0")
    assert create.call_args.kwargs["opened_socket"] == {socket: "tun0"}
    sniffer.start.assert_called_once()
    sniffer.stop.assert_called_once()
    socket.close.assert_called_once()


def test_saved_pcap_replay_requires_no_live_backend(monkeypatch, tmp_path):
    monkeypatch.setattr(capture, "_configure_capture", Mock(side_effect=AssertionError("live backend used")))
    path = tmp_path / "replay.pcap"
    packet = Ether()/IP(src="192.0.2.1", dst="192.0.2.2")/TCP(sport=13328, dport=45678, seq=100)/Raw(b"game-payload")
    packet.time = 42.0
    wrpcap(str(path), [packet])
    stream = Mock()
    capture.replay(str(path), stream)
    stream.segment.assert_called_once_with(42.0, "192.0.2.1", 13328, "192.0.2.2", 45678, 100, b"game-payload")


def test_live_closes_capture_socket_when_sniffer_cannot_start(monkeypatch):
    monkeypatch.setattr(capture, "_configure_capture", Mock())
    sock = Mock()
    monkeypatch.setattr(capture, "_listen", Mock(return_value=sock))
    sniffer = Mock(thread=None)
    sniffer.start.side_effect = RuntimeError("cannot start capture thread")
    monkeypatch.setattr(capture, "AsyncSniffer", Mock(return_value=sniffer))
    with pytest.raises(RuntimeError, match="cannot start capture thread"):
        capture.live(capture.GameStream(Mock()), iface="eth0", log=Mock())
    sock.close.assert_called_once()
