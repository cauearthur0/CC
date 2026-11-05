"""Trilha e efeitos de 'LoopLoot 101', sintetizados do zero (numpy + scipy).

Lê o mesmo timeline.json do vídeo. Ukulele (Karplus-Strong) e piano de "volta às aulas",
giz rangendo, o "tink" oco, vozes de desenho para os alunos (balbucio, sem palavras),
relógio do quiz, sinal da escola, debandada e a baleia entalada na porta.

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
rng = np.random.default_rng(20261106)


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



# ---------------------------------------------------------------- instrumentos e vozes deste filme
from scipy.signal import lfilter


def uke(f, dur=1.4, level=1.0, bright=0.5):
    """Corda dedilhada (Karplus-Strong vetorizado com lfilter): soa como ukulele."""
    n = int(dur * SR)
    N_ = max(2, int(round(SR / f)))
    exc = np.zeros(n)
    burst = rng.uniform(-1, 1, N_)
    burst = filt(burst, "low", 1500 + 5000 * bright)
    exc[:N_] = burst
    d = 0.996
    a = np.zeros(N_ + 2)
    a[0] = 1.0
    a[N_] = -d * 0.5
    a[N_ + 1] = -d * 0.5
    y = lfilter([1.0], a, exc)
    y = filt(y, "high", 120)
    y *= np.exp(-tv(dur) / (dur * 0.45))
    return fade(y * level, 0.001, 0.05)


UKE = {"C": [67, 60, 64, 72], "G": [67, 62, 71, 74], "Am": [69, 60, 64, 69], "F": [69, 60, 65, 69], "Em": [67, 64, 67, 71], "Dm": [69, 62, 65, 69]}


def strum(bus, t, chord, level=0.18, down=True, spread=0.014, dur=1.2, pan=0.15):
    notes = UKE[chord] if down else UKE[chord][::-1]
    for i, m in enumerate(notes):
        bus.add(t + i * spread, uke(mtof(m), dur, level, 0.55 if down else 0.4), 1.0, pan=pan + (i - 1.5) * 0.06)


def piano(f, dur=1.6, level=1.0):
    t = tv(dur)
    B = 0.0004
    s = np.zeros_like(t)
    for k in range(1, 9):
        fk = f * k * np.sqrt(1 + B * k * k)
        if fk > SR * 0.45:
            break
        s += (1 / k ** 1.25) * sine(fk, dur, rng.random() * 0.1) * np.exp(-t * (1.2 + 0.9 * k))
    ham = filt(noise(0.02), "band", [800, 4000]) * np.exp(-tv(0.02) / 0.004) * 0.15
    s[: len(ham)] += ham
    return fade(s * level * 0.35, 0.002, 0.08)


FORMANTS = {"a": (750, 1200, 2600), "e": (450, 1900, 2600), "i": (300, 2300, 3000), "o": (450, 800, 2600), "u": (320, 870, 2240), "m": (260, 1000, 2200)}


def voice(f0, dur, vowel="a", level=1.0, glide=0.0, breath=0.05):
    """Sílaba de desenho animado: pulso glotal filtrado por 3 formantes (sem palavras)."""
    t = tv(dur)
    f = f0 * (1 + glide * (t / dur)) * (1 + 0.025 * np.sin(2 * np.pi * 5.5 * t))
    src = saw(f, dur) + noise(dur) * breath
    F1, F2, F3 = FORMANTS[vowel]
    y = filt(src, "band", [F1 * 0.75, F1 * 1.3]) * 1.0 + filt(src, "band", [F2 * 0.85, F2 * 1.15]) * 0.55 + filt(src, "band", [F3 * 0.9, F3 * 1.1]) * 0.25
    e = np.clip(t / 0.02, 0, 1) * np.clip((dur - t) / 0.04, 0, 1)
    return fade(y * e * level, 0.004, 0.02)


def babble(bus, t0, t1, f0, level=0.2, question=False, pan=0.0, vowels="aeiou", rate=(0.09, 0.15)):
    t = t0
    i = 0
    while t < t1 - 0.05:
        d = float(rng.uniform(*rate))
        d = min(d, t1 - t)
        last = t + d >= t1 - 0.1
        g = 0.35 if (question and last) else float(rng.uniform(-0.12, 0.12))
        v = vowels[rng.integers(len(vowels))]
        bus.add(t, voice(f0 * float(rng.uniform(0.92, 1.1)), d, v, level, glide=g), 1.0, pan=pan)
        t += d + float(rng.uniform(0.01, 0.04))
        i += 1


def crowd(bus, t0, dur, vowel, f_list, level=0.12, swell=0.3, glide=0.0):
    for k, f in enumerate(f_list):
        v = voice(f, dur, vowel, level, glide=glide + float(rng.uniform(-0.05, 0.05)), breath=0.12)
        e = np.clip(tv(dur) / swell, 0, 1)
        bus.add(t0 + k * 0.03, v * e, 1.0, pan=float(rng.uniform(-0.6, 0.6)))


def chalk_squeak(dur, level=1.0):
    t = tv(dur)
    f = 2900 + 600 * np.sin(2 * np.pi * float(rng.uniform(3, 9)) * t) + float(rng.uniform(-500, 500))
    tone = sine(f, dur) * (0.6 + 0.4 * np.sin(2 * np.pi * 37 * t))
    scr = filt(noise(dur), "band", [1800, 5000]) * 0.5
    e = np.clip(t / 0.015, 0, 1) * np.clip((dur - t) / 0.03, 0, 1)
    return fade((tone * 0.35 + scr) * e * level, 0.003, 0.02)


def chalk_scratch(dur, level=1.0):
    t = tv(dur)
    s = filt(noise(dur), "band", [1200, 6000])
    am = 0.55 + 0.45 * np.abs(np.sin(2 * np.pi * 5.5 * t + rng.random() * 3))
    return fade(s * am * level, 0.02, 0.05)


def creak(dur=0.55, level=1.0, f0=95):
    t = tv(dur)
    f = f0 * (1 + 0.25 * np.sin(2 * np.pi * 2.2 * t) + 0.12 * rng.standard_normal(len(t)).cumsum() / np.sqrt(len(t)))
    s = saw(f, dur)
    y = filt(s, "band", [300, 900]) + 0.6 * filt(s, "band", [1300, 1700])
    e = np.sin(np.pi * np.clip(t / dur, 0, 1)) ** 0.7
    return fade(y * e * level * 0.4, 0.01, 0.05)


def school_bell(dur=1.2, level=1.0):
    t = tv(dur)
    parts = [(1150, 1.0), (2860, 0.5), (4410, 0.3), (5960, 0.15)]
    s = sum(a * sine(f, dur, rng.random()) for f, a in parts)
    clap = 0.55 + 0.45 * np.sign(np.sin(2 * np.pi * 22 * t))
    return fade(s * clap * level * 0.25, 0.005, 0.12)


def woodblock(f=900, level=1.0):
    t = tv(0.15)
    s = sine(f, 0.15) * np.exp(-t / 0.03) + 0.4 * sine(f * 2.7, 0.15) * np.exp(-t / 0.015)
    return fade(s * level, 0.001, 0.02)


def snap(level=1.0):
    t = tv(0.08)
    return filt(noise(0.08), "band", [1500, 4500]) * np.exp(-t / 0.012) * level


def footstep(level=1.0, f=140):
    t = tv(0.12)
    return fade((sine(f, 0.12) * np.exp(-t / 0.03) + filt(noise(0.12), "low", 1500) * np.exp(-t / 0.02) * 0.5) * level, 0.001, 0.02)


def squeeze(dur=0.9, level=1.0):
    t = tv(dur)
    f = 260 + 140 * (t / dur) + 30 * np.sin(2 * np.pi * 11 * t)
    y = filt(saw(f, dur), "band", [400, 1800])
    return fade(y * level * 0.3, 0.02, 0.05)


def shing(level=1.0):
    out = np.zeros(int(0.9 * SR))
    for k, m in enumerate([84, 88, 91, 96, 100]):
        b = bell(mtof(m), 0.4, 0.5)
        i = int(k * 0.035 * SR)
        n = min(len(b), len(out) - i)
        out[i:i + n] += b[:n]
    return out * level


# ---------------------------------------------------------------- arranjo
EV = TL["events"]
BEAT = 60 / TL["bpm"]
BAR = BEAT * 4
music = Bus()
sfx = Bus()
vox = Bus()
send = Bus()

# trechos em que a música some (silêncio antes da piada)
holes = [(7.4, 8.35), (EV["think"][0] - 0.05, EV["answer"][1] + 0.3), (EV["bell"] - 0.05, EV["bell"] + 0.25), (EV["stuck"][0] + 0.05, EV["popThrough"])]
prog = ["C", "G", "Am", "F"]
mel = [76, 79, 81, 79, 76, 74, 72, 74, 76, 76, 79, 84, 81, 79, 76, 72]


def in_hole(t):
    return any(a <= t < b for a, b in holes)


def section(t0, t1, energy=1.0, fast=False):
    """Ukulele no padrão B-B-C-B-C-B (baixo, baixo, cima...), piano, chocalho, estalos."""
    step = BEAT / 2
    pattern = [1, 0, 1, 1, 0, 1, 1, 1] if not fast else [1, 1, 1, 1, 1, 1, 1, 1]
    dirs = [True, False, True, False, False, True, False, True]
    k = 0
    t = t0
    while t < t1 - 0.01:
        bar = int(round((t - 0.0) / BAR))
        ch = prog[bar % 4]
        pos = k % 8
        if pattern[pos] and not in_hole(t):
            strum(music, t, ch, 0.16 * energy * (1.0 if pos % 2 == 0 else 0.75), down=dirs[pos], dur=0.9 if not fast else 0.5)
        if pos % 2 == 0 and not in_hole(t):
            beat_i = int(round(t / BEAT))
            if beat_i % 2 == 0:
                music.add(t, kick(0.35 * energy, 120, 50, 0.18), 1.0)
            else:
                music.add(t, snap(0.35 * energy), 1.0, pan=0.25)
            m = mel[beat_i % len(mel)]
            if beat_i % 1 == 0:
                music.add(t, piano(mtof(m), 0.9, 0.55 * energy), 1.0, pan=-0.2)
            if beat_i % 4 == 0:
                root = {"C": 48, "G": 43, "Am": 45, "F": 41}[ch]
                music.add(t, piano(mtof(root), 2.0, 0.6 * energy), 1.0, pan=-0.1)
        if not in_hole(t):
            music.add(t, hat(0.05 * energy, 0.018), 1.0, pan=0.35 if pos % 2 else -0.35)
        t += step
        k += 1


section(0.0, 50.35, 1.0)
section(EV["stampede"][0], EV["stuck"][0], 1.15, fast=True)
section(EV["popThrough"], 56.0, 0.9)
# final calmo
for k, m in enumerate([48, 55, 60, 64, 67, 72]):
    music.add(56.0 + k * 0.06, piano(mtof(m), 5.0, 0.5), 1.0, pan=-0.3 + 0.12 * k)
strum(music, 57.6, "C", 0.12, dur=3.0, spread=0.05)
for k, m in enumerate([84, 88, 91]):
    music.add(57.7 + k * 0.1, bell(mtof(m), 0.12, 1.6), 1.0, pan=-0.3 + 0.3 * k)
    send.add(57.7 + k * 0.1, bell(mtof(m), 0.12, 1.6), 1.0)
for t in grid(56.0, 58.5, 1.0):
    sfx.add(t, woodblock(1800, 0.05), 1.0, pan=0.2)
music.add(EV["startle"] - 0.02, piano(mtof(36), 2.0, 0.5), 1.0)

# ---- giz: rangidos e arranhado enquanto escreve/desenha
B = TL["board"]
for a, b in [B["title"]["write"], B["title"]["underline"][0], B["title"]["underline"][1], B["diagram"]["draw"], B["homework"]["write"]]:
    sfx.add(a, chalk_scratch(b - a, 0.05), 1.0, pan=-0.1)
    t = a
    while t < b - 0.05:
        d = float(rng.uniform(0.05, 0.16))
        if rng.random() < 0.55:
            sfx.add(t, chalk_squeak(d, 0.06), 1.0, pan=-0.1)
        t += d + float(rng.uniform(0.04, 0.25))
for T in [B["title"]["underline"][0][0], B["title"]["underline"][1][0]]:
    sfx.add(T, chalk_squeak(0.3, 0.08), 1.0)

# ---- plano 1: alunos se ajeitam, carteira da baleia range
sfx.add(EV["sitUp"], filt(noise(0.3), "band", [300, 2000]) * np.exp(-tv(0.3) / 0.1), 0.05)
sfx.add(EV["sitUp"] + 0.2, creak(0.7, 0.5, 90), 1.0, pan=0.3)

# ---- plano 2: o tink e o "empty"
sfx.add(EV["batUp"], whoosh(0.35, 400, 3000, 0.05), 1.0)
sfx.add(EV["tink"], tink(0.6), 1.0)
send.add(EV["tink"], tink(0.2), 1.0)
crowd(vox, EV["leanIn"], 0.6, "m", [330, 390, 300, 180], 0.07, 0.2, glide=0.1)
sfx.add(EV["zoomBoard"][0], whoosh(0.5, 300, 7000, 0.12), 1.0)

# ---- plano 3: o sapo pigarreia e fala, o Loopy digita, POP
sfx.add(EV["pointFrog"], whoosh(0.2, 800, 5000, 0.05), 1.0)
vox.add(EV["ahem"], voice(360, 0.12, "a", 0.18, breath=0.4), 1.0, pan=-0.3)
vox.add(EV["ahem"] + 0.16, voice(400, 0.18, "e", 0.2, glide=-0.15, breath=0.3), 1.0, pan=-0.3)
babble(vox, EV["frogTalk"][0], EV["frogTalk"][1], 380, 0.17, pan=-0.3)
t = EV["typing"][0]
while t < EV["typing"][1]:
    sfx.add(t, tick(0.06), 1.0)
    sfx.add(t, fade(sine(mtof(int(rng.choice([86, 88, 91, 93, 95]))), 0.05) * np.exp(-tv(0.05) / 0.012), 0.001, 0.01), 0.04)
    t += float(rng.uniform(0.06, 0.12))
sfx.add(EV["pop"], pop_snd(0.75), 1.0)
send.add(EV["pop"], pop_snd(0.2), 1.0)
for k, m in enumerate([72, 76, 79, 84]):
    music.add(EV["pop"] + 0.05 + k * 0.05, uke(mtof(m), 1.0, 0.22), 1.0, pan=0.2)
crowd(vox, EV["gasp"], 0.9, "o", [420, 480, 360, 200], 0.09, 0.35, glide=0.15)
for k in range(4):
    sfx.add(EV["pop"] + 0.9 + k * 0.6, boing(0.06), 1.0, pan=0.2)
sfx.add(EV["dive"][0], whoosh(0.6, 200, 8000, 0.14), 1.0)

# ---- plano 4: o gato desconfia; Loopy desenha e bate na lousa
vox.add(EV["catHmm"], voice(430, 0.32, "m", 0.16, glide=0.3, breath=0.1), 1.0, pan=-0.35)
vox.add(EV["catHmm"] + 0.4, voice(470, 0.14, "o", 0.14, glide=0.25), 1.0, pan=-0.35)
babble(vox, EV["catHmm"] + 0.6, EV["catHmm"] + 1.6, 450, 0.12, question=True, pan=-0.35)
for T in [EV["taps"][0], EV["taps"][1]]:
    sfx.add(T, woodblock(700, 0.25), 1.0)
sfx.add(EV["morph"][0], whoosh(0.45, 300, 7000, 0.12), 1.0)

# ---- plano 5: quiz relâmpago
sfx.add(EV["whip"], whoosh(0.3, 500, 6000, 0.14), 1.0)
music.add(EV["whip"] + 0.25, piano(mtof(43), 0.6, 0.6), 1.0)
music.add(EV["whip"] + 0.25, piano(mtof(55), 0.6, 0.5), 1.0)
sfx.add(EV["startle"], boing(0.12, 300, 900, 0.2), 1.0)
vox.add(EV["startle"] + 0.05, voice(200, 0.18, "o", 0.18, glide=0.5), 1.0, pan=0.3)
sfx.add(EV["startle"] + 0.15, creak(0.5, 0.45, 80), 1.0, pan=0.3)
for i, t in enumerate(grid(EV["think"][0], EV["think"][1], 0.5)):
    sfx.add(t, woodblock(1400 if i % 2 else 1100, 0.14), 1.0, pan=-0.2 if i % 2 else 0.2)
babble(vox, EV["answer"][0], EV["answer"][1], 165, 0.22, question=True, pan=0.3, vowels="aeou", rate=(0.12, 0.2))
sfx.add(EV["correct"], bell(mtof(84), 0.3, 0.8), 1.0)
sfx.add(EV["correct"] + 0.12, bell(mtof(91), 0.3, 1.0), 1.0)
sfx.add(EV["star"], shing(0.8), 1.0)
send.add(EV["star"], shing(0.3), 1.0)
crowd(vox, EV["cheer"][0], 1.4, "a", [440, 520, 380, 470, 210], 0.11, 0.15, glide=0.2)
for i in range(16):
    sfx.add(EV["cheer"][0] + 0.1 + i * 0.11 + rng.random() * 0.04, snap(0.25), 1.0, pan=float(rng.uniform(-0.6, 0.6)))

# ---- plano 6: duas moedas, uma racha
crackle(EV["crack"][0], EV["crack"][1], sfx, 0.5)
rise = sine(300 * (4 ** (tv(EV["crack"][1] - EV["crack"][0]) / (EV["crack"][1] - EV["crack"][0]))), EV["crack"][1] - EV["crack"][0])
sfx.add(EV["crack"][0], fade(rise * (tv(len(rise) / SR) / (len(rise) / SR)) ** 2, 0.01, 0.01), 0.06)
sfx.add(EV["pop2"], pop_snd(0.75), 1.0)
send.add(EV["pop2"], pop_snd(0.2), 1.0)
for k, m in enumerate([72, 76, 79, 84, 88]):
    music.add(EV["pop2"] + 0.05 + k * 0.05, uke(mtof(m), 1.0, 0.2), 1.0, pan=0.2)
for i in range(10):
    sfx.add(EV["pop2"] + 0.2 + i * 0.12, bling(0.04, 1568 + 200 * rng.random(), 2093), 1.0, pan=float(rng.uniform(-0.5, 0.5)))
vox.add(EV["glassesOff"] + 0.1, voice(400, 0.7, "o", 0.14, glide=0.18, breath=0.1), 1.0, pan=-0.3)

# ---- plano 7: sinal, debandada, baleia entalada
sfx.add(EV["bell"], school_bell(1.25, 0.55), 1.0, pan=0.5)
send.add(EV["bell"], school_bell(1.25, 0.15), 1.0)
crowd(vox, EV["stampede"][0], 0.7, "e", [480, 520, 430, 220], 0.08, 0.1, glide=0.3)
t = EV["stampede"][0] + 0.1
while t < EV["stuck"][0]:
    sfx.add(t, footstep(0.12, float(rng.uniform(110, 190))), 1.0, pan=float(rng.uniform(0.0, 0.7)))
    t += float(rng.uniform(0.05, 0.11))
sfx.add(EV["stuck"][0] + 0.05, squeeze(EV["popThrough"] - EV["stuck"][0] - 0.05, 0.6), 1.0, pan=0.6)
vox.add(EV["stuck"][0] + 0.3, voice(180, 0.4, "u", 0.14, glide=0.2), 1.0, pan=0.6)
sfx.add(EV["popThrough"], pop_snd(0.8), 1.0, pan=0.6)
music.add(EV["shrug"][0], uke(mtof(76), 0.6, 0.25), 1.0)
music.add(EV["shrug"][0] + 0.22, uke(mtof(72), 0.9, 0.25), 1.0)

# ---- trocas para os gráficos: um "swish"
for g in TL["graphics"]:
    sfx.add(g["start"] - 0.05, whoosh(0.3, 600, 9000, 0.06, rise=False), 1.0)

# ---------------------------------------------------------------- mix
mix = music.x * 0.9 + sfx.x + vox.x
# a música abaixa quando alguém fala
duck = np.ones(N)
for a, b in [EV["frogTalk"], (EV["catHmm"], EV["catHmm"] + 1.7), EV["answer"]]:
    i0 = int((a - 0.1) * SR)
    i1 = int((b + 0.1) * SR)
    duck[i0:i1] = 0.5
duck = np.convolve(duck, np.ones(2400) / 2400, mode="same")
mix = music.x * 0.9 * duck + sfx.x + vox.x
mix = np.vstack([filt(mix[0], "high", 35), filt(mix[1], "high", 35)])
rev = reverb(send.x + vox.x * 0.3 + music.x * 0.15, 1.3, 7000, 0.012)
mix = mix + rev * 0.3
tt = np.arange(N) / SR
mix *= np.clip((TL["duration"] - tt) / 1.8, 0, 1)
peak = np.max(np.abs(mix))
mix = mix / peak * 1.7
mix = np.tanh(mix) / np.tanh(1.7) * 0.89

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
