"""Trilha de 'The Construct', sintetizada do zero (numpy + scipy).

Segue o mesmo timeline.json do vídeo, então batidas, pousos e transições caem
no quadro certo. Nada aqui imita a música do filme: é um pulso eletrônico próprio,
em ré menor no mundo cinza e ré maior no mundo branco.

    python3 audio/trilha.py          -> out/trilha.wav (48 kHz, estéreo, 24 bits)
"""

import json
import os
import wave

import numpy as np
from scipy.signal import butter, fftconvolve, sosfilt, sosfilt_zi

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TL = json.load(open(os.path.join(ROOT, "timeline.json"), encoding="utf-8"))
SR = 48000
DUR = float(TL["duration"])
N = int(SR * DUR)
BEAT = 60.0 / TL["bpm"]  # 0,6 s
rng = np.random.default_rng(20261104)


# ---------------------------------------------------------------- utilitários
def mtof(m):
    return 440.0 * 2 ** ((m - 69) / 12.0)


def tv(dur):
    return np.arange(int(dur * SR)) / SR


def sos(kind, fc, order=2):
    return butter(order, fc, btype=kind, fs=SR, output="sos")


def filt(x, kind, fc, order=2):
    return sosfilt(sos(kind, fc, order), x, axis=-1)


def sweep(x, kind, f0, f1, block=256, order=2, curve="exp"):
    """Filtro com frequência que muda no tempo (blocos com estado contínuo)."""
    y = np.zeros_like(x)
    nb = int(np.ceil(len(x) / block))
    zi = None
    for b in range(nb):
        u = b / max(1, nb - 1)
        fc = f0 * (f1 / f0) ** u if curve == "exp" else f0 + (f1 - f0) * u
        fc = min(fc, SR * 0.45)
        s = sos(kind, fc, order)
        if zi is None:
            zi = sosfilt_zi(s) * 0.0
        seg = x[b * block:(b + 1) * block]
        out, zi = sosfilt(s, seg, zi=zi)
        y[b * block:b * block + len(seg)] = out
    return y


def osc_phase(f, n):
    f = np.broadcast_to(np.asarray(f, dtype=float), (n,))
    return np.cumsum(f) / SR


def sine(f, dur, ph=0.0):
    n = int(dur * SR)
    return np.sin(2 * np.pi * (osc_phase(f, n) + ph))


def saw(f, dur, ph=0.0):
    """Dente de serra com polyBLEP (sem aliasing feio)."""
    n = int(dur * SR)
    fa = np.broadcast_to(np.asarray(f, dtype=float), (n,))
    p = (osc_phase(fa, n) + ph) % 1.0
    dt = fa / SR
    y = 2 * p - 1
    m1 = p < dt
    t1 = p[m1] / dt[m1]
    y[m1] -= t1 + t1 - t1 * t1 - 1
    m2 = p > 1 - dt
    t2 = (p[m2] - 1) / dt[m2]
    y[m2] -= t2 * t2 + t2 + t2 + 1
    return y


def noise(dur, n=None):
    return rng.standard_normal(int(dur * SR) if n is None else n)


def env(dur, a=0.005, d=0.3, hold=0.0):
    t = tv(dur)
    e = np.exp(-np.maximum(0, t - a - hold) / max(d, 1e-4))
    if a > 0:
        e *= np.clip(t / a, 0, 1)
    return e


def fade(x, fin=0.005, fout=0.01):
    n = x.shape[-1]
    a = min(n, int(fin * SR))
    b = min(n, int(fout * SR))
    w = np.ones(n)
    if a > 0:
        w[:a] = np.linspace(0, 1, a)
    if b > 0:
        w[n - b:] *= np.linspace(1, 0, b)
    return x * w


class Bus:
    def __init__(self):
        self.x = np.zeros((2, N))

    def add(self, t0, sig, gain=1.0, pan=0.0):
        i0 = int(round(t0 * SR))
        if sig.ndim == 1:
            l = np.cos((pan + 1) * np.pi / 4)
            r = np.sin((pan + 1) * np.pi / 4)
            sig = np.vstack([sig * l, sig * r]) * np.sqrt(2)
        if i0 < 0:
            sig = sig[:, -i0:]
            i0 = 0
        n = min(sig.shape[1], N - i0)
        if n > 0:
            self.x[:, i0:i0 + n] += sig[:, :n] * gain


def reverb(x, decay=2.2, damp=6000.0, pre=0.02, width=1.0):
    n = int(decay * 1.6 * SR)
    t = np.arange(n) / SR
    ir = []
    for _ in range(2):
        r = rng.standard_normal(n) * np.exp(-6.9 * t / decay)
        r = filt(r, "low", damp)
        r[: int(pre * SR)] = 0
        ir.append(r / np.sqrt(np.sum(r ** 2)))
    ir[1] = ir[0] * (1 - width) + ir[1] * width
    out = np.vstack([fftconvolve(x[0], ir[0])[:N], fftconvolve(x[1], ir[1])[:N]])
    return out


def sidechain(times, depth=0.65, rel=0.2):
    t = np.arange(N) / SR
    g = np.ones(N)
    for tk in times:
        i0 = int(tk * SR)
        i1 = min(N, i0 + int(rel * 5 * SR))
        if i0 >= N:
            continue
        tt = t[i0:i1] - tk
        g[i0:i1] = np.minimum(g[i0:i1], 1 - depth * np.exp(-tt / rel))
    return g


def grid(t0, t1, step, offset=0.0):
    out = []
    k = 0
    while True:
        t = t0 + offset + k * step
        if t >= t1 - 1e-6:
            break
        out.append(round(t, 6))
        k += 1
    return out


# ---------------------------------------------------------------- instrumentos
def kick(level=1.0, f0=150, f1=46, decay=0.34):
    d = decay * 3
    t = tv(d)
    f = f1 + (f0 - f1) * np.exp(-t / 0.032)
    body = sine(f, d) * np.exp(-t / decay)
    click = filt(noise(0.006), "high", 3000) * np.linspace(1, 0, int(0.006 * SR))
    body[: len(click)] += click * 0.35
    return np.tanh(body * 1.6) * level


def snare(level=1.0):
    d = 0.5
    t = tv(d)
    n = filt(noise(d), "band", [1200, 6000]) * np.exp(-t / 0.11)
    tone = sine(190, d) * np.exp(-t / 0.07) * 0.6
    s = n + tone
    out = s.copy()
    for k, o in enumerate([0.009, 0.018]):  # pequeno "clap"
        i = int(o * SR)
        out[i:] += s[: len(s) - i] * (0.5 / (k + 1))
    return fade(out * level * 0.7)


def hat(level=1.0, d=0.03):
    t = tv(0.12)
    return filt(noise(0.12), "high", 7500) * np.exp(-t / d) * level * 0.5


def tick(level=1.0):
    t = tv(0.03)
    return filt(noise(0.03), "high", 9000) * np.exp(-t / 0.006) * level


def clank(level=1.0, base=520.0):
    d = 0.5
    t = tv(d)
    parts = [(1.0, 1.0, 0.12), (2.76, 0.6, 0.09), (5.4, 0.35, 0.06), (8.93, 0.2, 0.04)]
    s = sum(a * sine(base * r, d, rng.random()) * np.exp(-t / dd) for r, a, dd in parts)
    thump = sine(95, d) * np.exp(-t / 0.05) * 0.8
    return fade(np.tanh((s * 0.6 + thump) * 1.2) * level)


def bell(f, level=1.0, decay=1.6, d=None):
    d = d or decay * 3
    t = tv(d)
    parts = [(1.0, 1.0, 1.0), (2.0, 0.45, 0.6), (2.76, 0.3, 0.45), (4.07, 0.18, 0.3), (5.4, 0.1, 0.2)]
    s = sum(a * sine(f * r, d, rng.random()) * np.exp(-t / (decay * dd)) for r, a, dd in parts)
    return fade(s * level * 0.5, 0.002, 0.05)


def pluck(f, level=1.0, decay=0.16):
    d = decay * 4
    t = tv(d)
    s = sine(f, d) + 0.35 * sine(2 * f, d) * np.exp(-t / (decay * 0.5)) + 0.15 * filt(saw(f, d), "low", f * 4)
    return fade(s * np.exp(-t / decay) * level * 0.5, 0.002, 0.03)


def supersaw(notes, dur, voices=7, detune=0.18, ph_seed=0):
    out = np.zeros((2, int(dur * SR)))
    for m in notes:
        f = mtof(m)
        for v in range(voices):
            dv = (v / (voices - 1) - 0.5) * 2 * detune  # semitons
            s = saw(f * 2 ** (dv / 12), dur, rng.random())
            pan = (v / (voices - 1) - 0.5) * 1.6
            out[0] += s * np.cos((pan + 1) * np.pi / 4)
            out[1] += s * np.sin((pan + 1) * np.pi / 4)
    return out / (voices * len(notes)) * 2.2


def pad(notes, dur, kind="sine", a=1.0, r=1.5, detune=0.06):
    n = int(dur * SR)
    out = np.zeros((2, n))
    for i, m in enumerate(notes):
        f = mtof(m)
        for k, dv in enumerate([-detune, 0, detune]):
            w = sine(f * 2 ** (dv / 12), dur, rng.random()) if kind == "sine" else saw(f * 2 ** (dv / 12), dur, rng.random())
            pan = ((i + k) % 3 - 1) * 0.5
            out[0] += w * np.cos((pan + 1) * np.pi / 4)
            out[1] += w * np.sin((pan + 1) * np.pi / 4)
    t = tv(dur)
    e = np.clip(t / a, 0, 1) * np.clip((dur - t) / r, 0, 1)
    return out * e / (3 * len(notes))


def whoosh(dur, f0=300, f1=6000, level=1.0, rise=True):
    t = tv(dur)
    out = []
    for _ in range(2):
        nz = noise(dur)
        y = sweep(nz, "band" if False else "low", f0, f1)  # passa-baixa abrindo
        y = y - filt(y, "low", f0 * 0.5)
        out.append(y)
    e = (t / dur) ** 2.2 if rise else np.exp(-t / (dur * 0.3))
    return np.vstack(out) * e * level


def thud(level=1.0):
    d = 2.0
    t = tv(d)
    sub = sine(32 + 40 * np.exp(-t / 0.09), d) * np.exp(-t / 0.55)
    tom = sine(70 + 45 * np.exp(-t / 0.05), d) * np.exp(-t / 0.3) * 0.7
    metal = filt(noise(d), "band", [700, 2600]) * np.exp(-t / 0.16) * 0.6
    parts = [(180, 0.5, 0.6), (397, 0.35, 0.5), (611, 0.3, 0.42), (853, 0.22, 0.3), (1220, 0.15, 0.2)]
    ring = sum(a * sine(f, d, rng.random()) * np.exp(-t / dd) for f, a, dd in parts) * 0.35
    s = np.tanh((sub * 1.4 + tom + metal + ring) * 1.3)
    return fade(s * level, 0.001, 0.2)


# ---------------------------------------------------------------- arranjo
drums = Bus()
bass = Bus()
music = Bus()
fx = Bus()
send = Bus()  # vai para o reverb grande

# ---- A. mundo cinza (0–14 s): pulso grave, frio, de máquina
A0, A1 = 0.0, 14.0
eighths = grid(A0, A1, BEAT / 2)
for i, t in enumerate(eighths):
    d = 0.32
    tt = tv(d)
    acc = 1.0 if i % 2 == 0 else 0.68
    ramp = min(1.0, (t + 0.3) / 2.4)
    open_ = 1 + 0.9 * max(0.0, (t - 8.0) / 6.0)  # filtro abre no plano 2
    s = saw(mtof(38), d) * 0.9 + sine(mtof(26), d) * 0.9
    s = sweep(s, "low", 900 * open_, 170 * open_, block=128)
    s = fade(s * np.exp(-tt / 0.13) * acc * ramp, 0.003, 0.03)
    bass.add(t, s, 0.78)
for i, t in enumerate(grid(A0, A1, BEAT / 4)):
    lvl = (0.25 if i % 2 else 0.12) * min(1.0, t / 3.0)
    drums.add(t, tick(lvl), 1.0, pan=0.3 * np.sin(i * 1.7))
for i, t in enumerate(grid(A0, A1, BEAT * 2, BEAT)):
    drums.add(t, clank(0.42 if t > 1.0 else 0.2, 520 + 15 * (i % 3)), 1.0, pan=-0.25 + 0.5 * (i % 2))
    send.add(t, clank(0.12, 520), 1.0)
for t in grid(8.0, A1, BEAT / 2, BEAT / 4):
    drums.add(t, hat(0.22 * min(1.0, (t - 8.0) / 3.0)), 1.0, pan=0.2)
cold = pad([50, 53, 57], A1 + 0.4, kind="saw", a=2.5, r=0.4, detune=0.12)
cold = np.vstack([filt(cold[0], "low", 650), filt(cold[1], "low", 650)])
music.add(0.0, cold, 0.32)
# o Loopy se vira: brilho frio-quente
for k, m in enumerate([81, 86, 88]):
    music.add(TL["loopyTurn"] + 0.15 + k * 0.06, bell(mtof(m), 0.16, 1.4), 1.0, pan=-0.4 + 0.4 * k)
    send.add(TL["loopyTurn"] + 0.15 + k * 0.06, bell(mtof(m), 0.16, 1.4), 1.0)

# ---- B. a escolha (14–20 s): quase silêncio, só um zumbido
B0, B1 = 14.0, 20.0
tb = tv(B1 - B0)
hum = (sine(mtof(38), B1 - B0) + 0.4 * sine(mtof(50), B1 - B0) + 0.12 * sine(mtof(57) * 1.003, B1 - B0))
hum *= (1 + 0.08 * np.sin(2 * np.pi * 3.7 * tb)) * np.clip(tb / 0.6, 0, 1) * (0.7 + 0.3 * tb / (B1 - B0))
air = filt(noise(B1 - B0), "band", [180, 900]) * 0.05
fx.add(B0, fade(hum * 0.05 + air * 0.4, 0.3, 0.02), 1.0)
warm = sine(mtof(62), B1 - 16.8) * np.clip(tv(B1 - 16.8) / 2.5, 0, 1) ** 2
fx.add(16.8, fade(warm, 0.5, 0.02), 0.03)
fx.add(18.7, whoosh(1.3, 200, 9000, 0.22), 1.0)
rev_chord = pad([62, 66, 69, 74], 1.3, a=1.2, r=0.01)
fx.add(18.7, rev_chord * (tv(1.3) / 1.3) ** 3, 0.9)

# ---- C. chuva de ∞ (20–26 s): o drop
C0, C1 = 20.0, 26.0
ti = tv(3.0)
boom = sine(38 + 80 * np.exp(-ti / 0.12), 3.0) * np.exp(-ti / 0.9)
crash = filt(noise(3.0), "low", 9000) * np.exp(-ti / 0.7) * 0.5
fx.add(C0, np.tanh(boom * 1.5) * 0.9, 1.0)
fx.add(C0, crash, 0.35, pan=0.0)
send.add(C0, crash, 0.5)
kicksC = grid(C0, 25.4, BEAT)
for t in kicksC:
    drums.add(t, kick(0.95), 1.0)
for t in grid(C0, 25.4, BEAT * 2, BEAT):
    drums.add(t, snare(0.75), 1.0)
    send.add(t, snare(0.25), 1.0)
for i, t in enumerate(grid(C0, 25.4, BEAT / 2, BEAT / 4)):
    drums.add(t, hat(0.3), 1.0, pan=0.25 if i % 2 else -0.25)
chordsC = [(20.0, 22.4, [50, 53, 57, 62], 38), (22.4, 24.8, [46, 50, 53, 58], 34), (24.8, 26.0, [48, 52, 55, 60], 36)]
scC = sidechain(kicksC, 0.6, 0.18)
for t0, t1, notes, root in chordsC:
    d = t1 - t0
    ss = supersaw(notes, d)
    ss = np.vstack([sweep(ss[0], "low", 1500, 5200), sweep(ss[1], "low", 1500, 5200)])
    ss = fade(ss, 0.01, 0.06)
    i0 = int(t0 * SR)
    ss *= scC[i0:i0 + ss.shape[1]]
    music.add(t0, ss, 0.42)
    send.add(t0, ss, 0.15)
    for t in grid(t0, min(t1, 25.4), BEAT / 2):
        d2 = 0.28
        b = filt(saw(mtof(root), d2) + 0.8 * sine(mtof(root - 12), d2), "low", 420)
        b = fade(b * np.exp(-tv(d2) / 0.16), 0.003, 0.03)
        i = int(t * SR)
        bass.add(t, b * scC[i:i + len(b)] if i + len(b) <= N else b, 0.5)
    # arpejo "chuva": notas curtas que caem
    tones = [n + 24 for n in notes] + [n + 36 for n in notes[:2]]
    for t in grid(t0, min(t1, 25.6), BEAT / 4):
        m = tones[rng.integers(len(tones))]
        p = float(rng.uniform(-0.8, 0.8))
        music.add(t, pluck(mtof(m), 0.2, 0.12), 1.0, pan=p)
        send.add(t, pluck(mtof(m), 0.12, 0.12), 1.0, pan=-p)
WO0, WO1 = TL["whiteout"]
fx.add(WO0, whoosh(WO1 - WO0, 400, 12000, 0.35), 1.0)

# ---- D. o Construct (26–32 s): tom limpo e aberto, digitação
D0 = 26.0
open_pad = pad([50, 57, 64, 66, 69], 32.6 - D0, a=1.4, r=0.6, detune=0.03)
music.add(D0, open_pad, 0.5)
send.add(D0, open_pad, 0.35)
tone = sine(mtof(81), 6.0) * np.clip(tv(6.0) / 1.5, 0, 1) * np.clip((6.0 - tv(6.0)) / 1.0, 0, 1)
music.add(D0 + 0.3, tone, 0.035, pan=0.2)
send.add(D0 + 0.3, tone, 0.05)
ty0, ty1 = TL["typing"]
t = ty0
penta = [74, 76, 78, 81, 83, 86]
while t < ty1:
    music.add(t, tick(0.08), 1.0, pan=float(rng.uniform(-0.3, 0.3)))
    bl = sine(mtof(penta[rng.integers(len(penta))] + 12), 0.08) * np.exp(-tv(0.08) / 0.02)
    music.add(t, fade(bl, 0.001, 0.01), 0.05, pan=float(rng.uniform(-0.3, 0.3)))
    t += float(rng.uniform(0.07, 0.17))
fx.add(31.2, whoosh(1.3, 150, 4000, 0.16), 1.0)

# ---- E. as prateleiras (32–40 s): pancadas pesadas e percussão forte
waves = TL["rackWaves"]
for k, T in enumerate(waves):
    heavy = k < 4
    fx.add(T - 0.45, whoosh(0.45, 300, 7000, 0.3 if heavy else 0.12), 1.0, )
    fx.add(T, thud(0.95 if heavy else 0.42), 1.0, pan=(-0.3 if k % 2 else 0.3) * (0 if heavy else 1))
    send.add(T, thud(0.45 if heavy else 0.35), 1.0)
G0 = 35.6
groove_end = 49.4
kicksE = grid(G0, groove_end, BEAT)
for t in kicksE:
    drums.add(t, kick(1.0, 140, 44, 0.38), 1.0)
for t in grid(G0, groove_end, BEAT * 2, BEAT):
    drums.add(t, snare(0.85), 1.0)
    send.add(t, snare(0.3), 1.0)
for i, t in enumerate(grid(G0, groove_end, BEAT / 4)):
    drums.add(t, hat(0.22 if i % 2 else 0.12), 1.0, pan=0.3 if i % 2 else -0.3)
for t in grid(G0, groove_end, BEAT * 4, BEAT * 3.5):  # tom no fim de cada compasso
    drums.add(t, kick(0.5, 220, 110, 0.15), 1.0, pan=-0.3)
scE = sidechain(kicksE, 0.5, 0.2)
prog = [(35.6, [50, 54, 57], 38), (38.0, [45, 49, 52], 33), (40.4, [47, 50, 54], 35), (42.8, [43, 47, 50], 31), (45.2, [50, 54, 57], 38), (47.6, [45, 49, 52, 57], 33)]
for j, (t0, notes, root) in enumerate(prog):
    t1 = prog[j + 1][0] if j + 1 < len(prog) else 50.0
    d = t1 - t0
    k = j / (len(prog) - 1)
    p = pad([n + 12 for n in notes], d + 0.3, kind="saw", a=0.08, r=0.3, detune=0.1)
    p = np.vstack([filt(p[0], "low", 900 + 2600 * k), filt(p[1], "low", 900 + 2600 * k)])
    i0 = int(t0 * SR)
    n_ = min(p.shape[1], N - i0)
    p[:, :n_] *= scE[i0:i0 + n_]
    music.add(t0, p, 0.5 + 0.2 * k)
    send.add(t0, p, 0.2)
    for t in grid(t0, min(t1, groove_end), BEAT / 2):
        d2 = 0.27
        b = filt(saw(mtof(root), d2) + 0.9 * sine(mtof(root - 12), d2), "low", 380)
        b = fade(b * np.exp(-tv(d2) / 0.15), 0.003, 0.03)
        bass.add(t, b, 0.5)

# ---- F. cada trade constrói (40–48 s): uma nota a cada ficha, sempre subindo
chimes = [74, 76, 78, 81, 83, 86, 88, 90]
for T, m in zip(TL["tokens"], chimes):
    music.add(T, bell(mtof(m), 0.32, 1.2), 1.0, pan=0.15)
    send.add(T, bell(mtof(m), 0.25, 1.2), 1.0)
    music.add(T + 0.03, filt(noise(0.05), "band", [1800, 5000]) * np.exp(-tv(0.05) / 0.01), 0.18)  # encaixe dos blocos
    for k in range(3):
        music.add(T + 0.06 + k * 0.05, pluck(mtof(m + 12 + 2 * k), 0.08, 0.06), 1.0, pan=0.4 - 0.4 * k)
fx.add(46.4, whoosh(1.2, 200, 6000, 0.16), 1.0)
for k, t in enumerate(grid(46.4, 47.6, BEAT / 4)):  # virada
    drums.add(t, kick(0.45, 240 - 15 * k, 100 - 6 * k, 0.12), 1.0, pan=-0.5 + 0.2 * k)

# ---- G. fim (48–55 s): resolve, branco, ∞
fx.add(47.6, filt(noise(3.0), "low", 10000) * np.exp(-tv(3.0) / 0.9), 0.3)
send.add(47.6, filt(noise(3.0), "low", 10000) * np.exp(-tv(3.0) / 0.9), 0.35)
final = pad([38, 50, 57, 62, 66, 69, 74], DUR - 47.6, a=0.05, r=3.0, detune=0.05)
music.add(47.6, final, 0.55)
send.add(47.6, final, 0.4)
W0, W1 = TL["end"]["white"]
sh = sum(sine(mtof(m), W1 - W0 + 1.0, rng.random()) for m in [86, 90, 93]) / 3
sh *= (1 + 0.3 * np.sin(2 * np.pi * 7 * tv(W1 - W0 + 1.0))) * np.clip(tv(W1 - W0 + 1.0) / (W1 - W0), 0, 1)
fx.add(W0, fade(sh, 0.3, 0.6), 0.05)
send.add(W0, fade(sh, 0.3, 0.6), 0.08)
TI = TL["end"]["infinity"]
for k, m in enumerate([86, 93, 90]):
    music.add(TI + k * 0.08, bell(mtof(m), 0.22, 2.2), 1.0, pan=-0.3 + 0.3 * k)
    send.add(TI + k * 0.08, bell(mtof(m), 0.22, 2.2), 1.0)

# ---------------------------------------------------------------- mix
mix = drums.x * 1.0 + bass.x * 1.0 + music.x * 1.0 + fx.x * 1.0
mix = np.vstack([filt(mix[0], "high", 28), filt(mix[1], "high", 28)])
rev = reverb(send.x, 2.8, 6500, 0.025)
room = reverb(drums.x + music.x * 0.5, 0.9, 8000, 0.01)
mix = mix + rev * 0.55 + room * 0.12

t = np.arange(N) / SR
master = np.ones(N)
master *= np.clip((DUR - t) / 1.6, 0, 1)  # some no fim
mix *= master
peak = np.max(np.abs(mix))
mix = mix / peak * 1.25
mix = np.tanh(mix) / np.tanh(1.25) * 0.89  # ~ -1 dBFS

out = os.path.join(ROOT, "out", "trilha.wav")
os.makedirs(os.path.dirname(out), exist_ok=True)
pcm = np.clip(mix.T, -1, 1)
i24 = (pcm * (2 ** 23 - 1)).astype(np.int32)
b = np.zeros((i24.shape[0], 2, 3), dtype=np.uint8)
for ch in range(2):
    v = i24[:, ch].astype(np.uint32)
    b[:, ch, 0] = v & 0xFF
    b[:, ch, 1] = (v >> 8) & 0xFF
    b[:, ch, 2] = (v >> 16) & 0xFF
with wave.open(out, "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(3)
    w.setframerate(SR)
    w.writeframes(b.tobytes())


def db(x):
    return 20 * np.log10(np.sqrt(np.mean(x ** 2)) + 1e-9)


print("ok:", out)
for s in TL["shots"]:
    seg = mix[:, int(s["start"] * SR):int(s["end"] * SR)]
    print(f"  plano {s['id']} ({s['start']:>4}-{s['end']:>4}s) RMS {db(seg):6.1f} dBFS  pico {20*np.log10(np.max(np.abs(seg))+1e-9):5.1f}")
