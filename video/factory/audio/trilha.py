"""Trilha e efeitos de 'The Empty Coin Factory', sintetizados do zero (numpy + scipy).

Lê o mesmo timeline.json do vídeo. Música institucional sem graça (com fita velha),
o "tink" da moeda oca, o "thump" do carimbo, pizzicato de fininho, estalos da moeda
rachando, música de jogo, a fita parando, o grilo e o "ta-da".

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
rng = np.random.default_rng(20261105)


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



# ---------------------------------------------------------------- sons novos deste filme
def tink(level=1.0):
    """A moeda oca: curto, metálico, com um corpo vazio por dentro."""
    d = 0.6
    t = tv(d)
    parts = [(2350, 1.0, 0.07), (3480, 0.55, 0.05), (5450, 0.35, 0.035), (7280, 0.18, 0.025)]
    s = sum(a * sine(f, d, rng.random()) * np.exp(-t / dd) for f, a, dd in parts)
    body = filt(noise(d), "band", [900, 1500]) * np.exp(-t / 0.018) * 0.5
    hollow = sine(1180, d) * np.exp(-t / 0.05) * 0.25
    click = np.zeros_like(t)
    click[: int(0.002 * SR)] = 1.0
    return fade((s + body + hollow + click * 0.4) * level, 0.0005, 0.05)


def stamp_thump(level=1.0):
    d = 0.6
    t = tv(d)
    low = sine(48 + 50 * np.exp(-t / 0.03), d) * np.exp(-t / 0.12)
    slap = filt(noise(d), "band", [250, 1600]) * np.exp(-t / 0.045)
    box = filt(noise(d), "band", [500, 900]) * np.exp(-t / 0.09) * 0.5
    return fade(np.tanh((low * 1.4 + slap + box) * 1.5) * level, 0.0005, 0.05)


def boing(level=1.0, f0=330, f1=880, d=0.16):
    t = tv(d)
    f = f0 * (f1 / f0) ** (t / d)
    return fade(sine(f, d) * np.exp(-t / (d * 0.6)) * level, 0.002, 0.02)


def bling(level=1.0, f0=1046.5, f1=1568.0):
    a = filt(saw(f0, 0.06), "low", 4000) * np.exp(-tv(0.06) / 0.03)
    b = filt(saw(f1, 0.14), "low", 5000) * np.exp(-tv(0.14) / 0.06)
    return np.concatenate([a, b]) * level * 0.5


def pop_snd(level=1.0):
    d = 0.5
    t = tv(d)
    tone = sine(140 + 900 * np.exp(-t / 0.025), d) * np.exp(-t / 0.09)
    burst = filt(noise(d), "band", [800, 6000]) * np.exp(-t / 0.03)
    sub = sine(55, d) * np.exp(-t / 0.15)
    return fade((tone + burst * 0.6 + sub * 0.7) * level, 0.0005, 0.05)


def crackle(t0, t1, bus, level=1.0, gain_curve=2.0):
    """Estalos de casca de ovo, cada vez mais rápidos."""
    t = t0
    while t < t1:
        k = (t - t0) / (t1 - t0)
        d = 0.012 + rng.random() * 0.02
        c = filt(noise(d), "band", [1800 + 3000 * k, 9000]) * np.exp(-tv(d) / 0.004)
        bus.add(t, c, level * (0.3 + 0.7 * k ** gain_curve), pan=float(rng.uniform(-0.3, 0.3)))
        t += max(0.012, 0.09 * (1 - k) ** 1.5 + rng.random() * 0.02)


def squarish(f, d, cutoff=5000):
    s = saw(f, d) - saw(f, d, 0.5)
    return filt(s, "low", cutoff)


def cricket(level=1.0):
    out = []
    for k in range(3):
        d = 0.03
        out.append(sine(4650, d) * np.sin(np.pi * tv(d) / d))
        out.append(np.zeros(int(0.022 * SR)))
    return np.concatenate(out) * level


def tape_stop(x, t0, dur):
    """Fita parando: o trecho a partir de t0 desacelera até zero em dur segundos."""
    i0 = int(t0 * SR)
    n = int(dur * SR)
    r = (1 - np.arange(n) / n) ** 1.6
    pos = np.cumsum(r)
    out = np.zeros((2, n))
    for ch in range(2):
        seg = x[ch, i0:i0 + n + 1]
        out[ch] = np.interp(pos, np.arange(len(seg)), seg) * (1 - np.arange(n) / n) ** 0.5
    x[:, i0:i0 + n] = out
    x[:, i0 + n:] = 0


# ---------------------------------------------------------------- arranjo
music = Bus()   # trilha
fun = Bus()     # música animada (sofre o "tape stop")
sfx = Bus()
amb = Bus()     # zumbido da fábrica e chiado
send = Bus()

B90 = 60 / 90
CUT, BACK = TL["musicCut"], TL["musicBack"]
STOP = TL["stop"]

# ---- A. vídeo institucional (C - F - G - C), sério e sem graça, com fita velha
corp = Bus()
prog = [(0.0, [48, 52, 55], 36), (8 / 3, [53, 57, 60], 41), (16 / 3, [55, 59, 62], 43), (8.0, [48, 52, 55], 36), (BACK, [53, 57, 60], 41)]
melody = [64, 67, 69, 67, 65, 69, 72, 69, 67, 71, 74, 71, 72, 67, 64, 60]
for j, (t0, notes, root) in enumerate(prog):
    t1 = prog[j + 1][0] if j + 1 < len(prog) else 12.0
    if t0 < CUT <= t1:
        t1 = CUT
    for t in grid(t0, t1, B90 * 2):
        d = min(B90 * 2, t1 - t)
        for m in notes:
            ep = sine(mtof(m + 12), d) + 0.3 * sine(mtof(m + 24), d) * np.exp(-tv(d) / 0.15)
            corp.add(t, fade(ep * np.exp(-tv(d) / 0.9), 0.004, 0.05), 0.07, pan=(m % 3 - 1) * 0.3)
        b = sine(mtof(root), d) + 0.4 * filt(saw(mtof(root), d), "low", 600)
        corp.add(t, fade(b * np.exp(-tv(d) / 0.6), 0.004, 0.04), 0.22)
    for i, t in enumerate(grid(t0, t1, B90)):
        k = int(round(t / B90))
        corp.add(t, bell(mtof(melody[k % len(melody)]), 0.08, 0.45), 1.0, pan=0.2)
        if k % 2 == 0:
            corp.add(t, kick(0.35, 110, 50, 0.2), 1.0)
        else:
            corp.add(t, snare(0.12), 1.0)
    for t in grid(t0, t1, B90 / 2):
        corp.add(t, hat(0.07), 1.0, pan=-0.2)
    strings = pad([n + 12 for n in notes], t1 - t0 + 0.1, kind="saw", a=0.4, r=0.1, detune=0.15)
    strings = np.vstack([filt(strings[0], "low", 1800), filt(strings[1], "low", 1800)])
    corp.add(t0, strings, 0.12)
# fita: oscilação lenta de afinação + banda estreita + chiado
tt = np.arange(N) / SR
wow = tt + 0.0022 * np.sin(2 * np.pi * 0.55 * tt) + 0.0007 * np.sin(2 * np.pi * 3.1 * tt)
for ch in range(2):
    corp.x[ch] = np.interp(wow, tt, corp.x[ch])
corp.x = np.vstack([filt(filt(corp.x[0], "low", 6500), "high", 140), filt(filt(corp.x[1], "low", 6500), "high", 140)])
fadeback = np.ones(N)
i_back = int(11.85 * SR)
fadeback[i_back:int(12.25 * SR)] = np.linspace(1, 0, int(12.25 * SR) - i_back)
fadeback[int(12.25 * SR):] = 0
music.x += corp.x * fadeback

# ---- prensas: "clank" no tempo, alternando lados, até a fábrica parar
for i, t in enumerate(grid(0.08, STOP + 0.25, B90 / 2)):
    wide = 1.0 if t < 6.0 else (0.45 if t < CUT else (0.08 if t < BACK else 0.28))
    if 34 <= t:
        wide *= 0.5
    sfx.add(t, clank(0.5 * wide, 430 + 25 * (i % 3)), 1.0, pan=-0.45 if i % 2 else 0.45)
    send.add(t, clank(0.15 * wide, 430), 1.0)

# ---- zumbido da fábrica (some quando ela para)
hum_d = STOP + 1.6
th = tv(hum_d)
slow = np.ones_like(th)
k0 = int(STOP * SR)
slow[k0:] = np.maximum(0.25, 1 - (th[k0:] - STOP) / 1.6)
ph = np.cumsum(slow) / SR
hum = (np.sin(2 * np.pi * 60 * ph) + 0.5 * np.sin(2 * np.pi * 120 * ph) + 0.25 * np.sin(2 * np.pi * 180 * ph)) * 0.6
rumble = filt(noise(hum_d), "low", 220) * 0.8
hv = np.where(th < CUT, 1.0, np.where(th < BACK, 0.45, 0.8))
hv[k0:] *= np.clip(1 - (th[k0:] - STOP) / 1.6, 0, 1)
amb.add(0.0, fade((hum + rumble) * hv, 0.5, 0.05), 0.05)
sfx.add(STOP + 1.55, clank(0.35, 300), 1.0)
hiss = filt(noise(DUR), "high", 3000) * 0.012
amb.add(0.0, fade(hiss * np.clip((TL["end"]["black"][1] - tt) / 0.4, 0, 1), 0.2, 0.05), 1.0)

# ---- B. o tink, o silêncio, o carimbo
for T in TL["tinks"]:
    sfx.add(T, tink(0.55), 1.0, pan=-0.1)
    send.add(T, tink(0.2), 1.0)
sfx.add(9.3, filt(noise(0.3), "band", [300, 2500]) * np.exp(-tv(0.3) / 0.08), 0.05)  # tecido do ombro
sfx.add(TL["stampHit"] - 0.2, whoosh(0.2, 300, 3000, 0.12), 1.0)
sfx.add(TL["stampHit"], stamp_thump(0.9), 1.0)
send.add(TL["stampHit"], stamp_thump(0.25), 1.0)

# ---- C. o Loopy entra: pizzicato na ponta dos pés
sneak_notes = [57, 60, 64, 60, 59]
for T, m in zip(TL["steps"], sneak_notes):
    music.add(T, pluck(mtof(m - 12), 1.0, 0.1), 1.0, pan=-0.2)
    music.add(T + B90 / 3, pluck(mtof(m - 5), 0.55, 0.08), 1.0, pan=0.2)
    sfx.add(T, tick(0.05), 1.0)
music.add(12.0, filt(pad([45, 52], 2.5, kind="saw", a=0.3, r=0.6, detune=0.2)[0], "low", 700), 0.18)
music.add(TL["grab"], bell(mtof(88), 0.22, 0.5), 1.0, pan=0.3)
sfx.add(TL["grab"], bling(0.25, 1568, 2093), 1.0, pan=0.3)
for i, T in enumerate(TL["scurry"]):
    music.add(T, pluck(mtof(57 + i * 2), 0.8, 0.07), 1.0, pan=0.3 - i * 0.1)
    sfx.add(T, tick(0.04), 1.0)
sfx.add(16.25, whoosh(0.25, 400, 5000, 0.1), 1.0)
sus = pad([45, 48, 52], 17.0 + 3.5 - 16.3, kind="saw", a=0.4, r=0.3, detune=0.08)
sus *= 1 + 0.3 * np.sin(2 * np.pi * 7 * tv(sus.shape[1] / SR))
music.add(16.3, np.vstack([filt(sus[0], "low", 900), filt(sus[1], "low", 900)]), 0.2)

# ---- D/E. digitação, a moeda racha, POP, música animada e sons de jogo
fr = TL["frog"]
mo = TL["montage"]
type_windows = [fr["typing"]] + [[s + mo["typing"][0], s + mo["typing"][1]] for s in mo["starts"]]
crack_windows = [fr["crack"]] + [[s + mo["crack"][0], s + mo["crack"][1]] for s in mo["starts"]]
pops = [fr["pop"]] + [s + mo["pop"] for s in mo["starts"]]
penta = [74, 76, 79, 81, 84, 86]
for a, b in type_windows:
    t = a
    while t < b:
        sfx.add(t, tick(0.07), 1.0, pan=float(rng.uniform(-0.2, 0.2)))
        bl = sine(mtof(penta[rng.integers(len(penta))] + 12), 0.06) * np.exp(-tv(0.06) / 0.015)
        sfx.add(t, fade(bl, 0.001, 0.01), 0.045)
        t += float(rng.uniform(0.06, 0.13)) * (0.6 if b - a < 1 else 1)
for (a, b), P in zip(crack_windows, pops):
    crackle(a, b, sfx, 0.6)
    rise = sine(300 * (4 ** (tv(b - a) / (b - a))), b - a) * (tv(b - a) / (b - a)) ** 2
    sfx.add(a, fade(rise, 0.01, 0.01), 0.08)
    sfx.add(P, pop_snd(0.8), 1.0)
    send.add(P, pop_snd(0.25), 1.0)
    sfx.add(P + 0.02, bell(mtof(96), 0.12, 0.6), 1.0)

B120 = 0.5
F0 = fr["pop"]
fun_end = STOP + 0.9
kicks = grid(F0, fun_end, B120)
chords = [[48, 52, 55], [45, 48, 52], [41, 45, 48], [43, 47, 50]]
lead = [72, 76, 79, 76, 81, 79, 76, 72, 74, 77, 81, 77, 79, 74, 71, 67]
for i, t in enumerate(kicks):
    fun.add(t, kick(0.8, 160, 50, 0.25), 1.0)
    if i % 2 == 1:
        fun.add(t, snare(0.5), 1.0)
        send.add(t, snare(0.15), 1.0)
for i, t in enumerate(grid(F0, fun_end, B120 / 4)):
    fun.add(t, hat(0.12 if i % 2 else 0.06, 0.02), 1.0, pan=0.35 if i % 2 else -0.35)
for i, t in enumerate(grid(F0, fun_end, B120 * 4)):
    notes = chords[i % 4]
    root = notes[0] - 12
    for j, tb in enumerate(grid(t, min(t + 2.0, fun_end), B120 / 2)):
        m = root + (12 if j % 2 else 0)
        b = filt(squarish(mtof(m), 0.22), "low", 900)
        fun.add(tb, fade(b * np.exp(-tv(0.22) / 0.12), 0.002, 0.03), 0.3)
    for j, ta in enumerate(grid(t, min(t + 2.0, fun_end), B120 / 4)):
        m = notes[j % 3] + 24
        fun.add(ta, fade(squarish(mtof(m), 0.09, 6000) * np.exp(-tv(0.09) / 0.05), 0.002, 0.02), 0.06, pan=0.25)
    for j, tm in enumerate(grid(t, min(t + 2.0, fun_end), B120)):
        m = lead[(i * 4 + j) % len(lead)]
        fun.add(tm, fade(squarish(mtof(m), 0.32, 4500) * np.exp(-tv(0.32) / 0.2), 0.003, 0.05), 0.09, pan=-0.15)
    p = pad([n + 12 for n in notes], min(2.0, fun_end - t) + 0.05, kind="saw", a=0.05, r=0.1, detune=0.12)
    fun.add(t, np.vstack([filt(p[0], "low", 2200), filt(p[1], "low", 2200)]), 0.12)

# sons dos mundos
P0 = pops[0]
k = 0
while True:
    hs = P0 + 0.45 + 0.6 * k
    if hs > mo["starts"][0]:
        break
    sfx.add(hs, boing(0.12), 1.0, pan=0.25)
    sfx.add(hs + 0.42, bling(0.12), 1.0, pan=0.25)
    k += 1
Ps = pops[1]
for s0 in [Ps, Ps + 1.5]:
    sfx.add(s0, whoosh(1.1, 600, 5000, 0.12, rise=False), 1.0)
for i in range(14):
    sfx.add(Ps + 0.1 + i * 0.1 + rng.random() * 0.05, bling(0.05, 1568 + 200 * rng.random(), 2093), 1.0, pan=float(rng.uniform(-0.5, 0.5)))
Pw = pops[2]
for n in range(4):
    T = Pw + n * 0.42 + 0.07
    sfx.add(T, fade(sine(mtof(64 + n * 2), 0.12) * np.exp(-tv(0.12) / 0.05), 0.001, 0.02), 0.18)
    sfx.add(T, kick(0.25, 200, 90, 0.06), 1.0)
Pc = pops[3]
for n in range(6):
    T = Pc + (n % 3) * (0.8 / 3) + 0.55 * 0.8 + (n // 3) * 0.8
    if T > mo["starts"][3]:
        continue
    sfx.add(T - 0.05, whoosh(0.12, 800, 6000, 0.08, rise=False), 1.0)
    sfx.add(T + 0.03, boing(0.08, 900, 350, 0.12), 1.0, pan=-0.3)
Pb = pops[4]
laser = filt(saw(110 + 3 * np.sin(2 * np.pi * 9 * tv(STOP - Pb)), STOP - Pb), "band", [300, 3000])
sfx.add(Pb, fade(laser, 0.05, 0.05), 0.03)
for a in [0.583, 0.829, 1.2, 1.571]:
    T = Pb + a
    sfx.add(T, fade(filt(noise(0.25), "low", 3000) * np.exp(-tv(0.25) / 0.06), 0.001, 0.03), 0.35)
    sfx.add(T, kick(0.3, 180, 60, 0.1), 1.0)

# fita parando quando a fábrica para
tape_stop(fun.x, STOP, 0.85)
music.x += fun.x

# ---- F. silêncio constrangido: tink e grilo
c0, c1 = TL["cricket"]
t = c0
while t < c1:
    sfx.add(t, cricket(0.04), 1.0, pan=0.5)
    t += 0.52
room = filt(noise(48 - STOP), "low", 500) * 0.004
amb.add(STOP + 1.0, fade(room, 1.0, 0.3), 1.0)

# ---- G. final: acorde de vitória, painéis voando, ta-da e silêncio
E = TL["end"]
EB = Bus()
hit = supersaw([48, 55, 60, 64, 67], 1.6)
EB.add(40.0, np.vstack([sweep(hit[0], "low", 6000, 1500), sweep(hit[1], "low", 6000, 1500)]) * np.exp(-tv(1.6) / 0.6), 0.45)
EB.add(40.0, kick(1.0, 150, 45, 0.4), 1.0)
EB.add(40.0, filt(noise(2.0), "low", 9000) * np.exp(-tv(2.0) / 0.7), 0.3)
send.add(40.0, filt(noise(2.0), "low", 9000) * np.exp(-tv(2.0) / 0.7), 0.3)
for i, t in enumerate(grid(40.0, E["tada"][0], B120)):
    EB.add(t, kick(0.7, 160, 50, 0.25), 1.0)
    if i % 2:
        EB.add(t, snare(0.45), 1.0)
for i, t in enumerate(grid(40.0, E["tada"][0], B120 / 2)):
    m = [60, 64, 67, 72][i % 4] + 12
    EB.add(t, fade(squarish(mtof(m), 0.2, 5000) * np.exp(-tv(0.2) / 0.1), 0.002, 0.03), 0.07)
for t in grid(41.5, E["tada"][0] - 0.02, 0.05):
    EB.add(t, snare(0.12 + 0.3 * (t - 41.5)), 1.0)
p0, p1 = E["peel"]
for i in range(12):
    T = p0 + (p1 - p0) * (i / 12) + rng.random() * 0.08
    EB.add(T, whoosh(0.35, 300 + 100 * rng.random(), 4000, 0.07, rise=False), 1.0, pan=float(rng.uniform(-0.7, 0.7)))
for i in range(10):
    EB.add(p0 + 0.3 + i * 0.15, bell(mtof(91 + (i % 3) * 3), 0.05, 0.4), 1.0, pan=float(rng.uniform(-0.6, 0.6)))
ta1, ta2 = E["tada"]
ta_ch = supersaw([60, 64, 67, 72], 0.18)
EB.add(ta1, fade(ta_ch * np.exp(-tv(0.18) / 0.08), 0.003, 0.03), 0.5)
da = supersaw([48, 60, 64, 67, 72, 76], 1.2)
da = np.vstack([sweep(da[0], "low", 7000, 2500), sweep(da[1], "low", 7000, 2500)]) * np.exp(-tv(1.2) / 0.35)
EB.add(ta2, da, 0.6)
EB.add(ta2, kick(1.0, 140, 45, 0.35), 1.0)
EB.add(ta2, filt(noise(1.2), "low", 10000) * np.exp(-tv(1.2) / 0.4), 0.3)
send.add(ta2, da, 0.25)
cut = np.ones(N)
c0i = int(E["black"][0] * SR)
c1i = int(E["black"][1] * SR)
cut[c0i:c1i] = np.linspace(1, 0, c1i - c0i)
cut[c1i:] = 0
music.x += EB.x * cut

# ---------------------------------------------------------------- mix
mix = music.x + sfx.x + amb.x
mix = np.vstack([filt(mix[0], "high", 30), filt(mix[1], "high", 30)])
rev = reverb(send.x, 1.6, 6000, 0.015)
room_r = reverb(sfx.x * 0.6 + music.x * 0.3, 0.7, 7000, 0.008)
rev_cut = np.ones(N)
r0 = int((E["black"][1] + 0.1) * SR)
rev_cut[r0:int((E["black"][1] + 0.9) * SR)] = np.linspace(1, 0, int(0.8 * SR))
rev_cut[int((E["black"][1] + 0.9) * SR):] = 0
mix = mix + (rev * 0.45 + room_r * 0.12) * rev_cut
peak = np.max(np.abs(mix))
mix = mix / peak * 1.2
mix = np.tanh(mix) / np.tanh(1.2) * 0.89

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
    print(f"  plano {s['id']:>2} ({s['start']:>4}-{s['end']:>4}s) RMS {db(seg):6.1f} dBFS  pico {20*np.log10(np.max(np.abs(seg))+1e-9):5.1f}")
