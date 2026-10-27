#!/usr/bin/env python3
"""Sintetiza los tonos de alarma originales (sin material de terceros) como WAV mono 16-bit 22,05 kHz."""
import math, struct, wave, sys, os

SR = 22050
out = sys.argv[1] if len(sys.argv) > 1 else "."

def buf(sec): return [0.0] * int(SR * sec)

def add(b, start, samples):
    i0 = int(start * SR)
    for i, s in enumerate(samples):
        if i0 + i < len(b): b[i0 + i] += s

def tone(freq, dur, harm=((1, 1.0),), decay=6.0, attack=0.004, amp=0.5):
    n = int(dur * SR); r = []
    for i in range(n):
        t = i / SR
        env = min(1.0, t / attack) * math.exp(-decay * t)
        v = sum(a * math.sin(2 * math.pi * freq * k * t) for k, a in harm)
        r.append(amp * env * v)
    return r

def beep(freq, dur, amp=0.45):
    n = int(dur * SR); r = []
    for i in range(n):
        t = i / SR
        env = min(1.0, t / 0.005, (dur - t) / 0.008)
        v = math.sin(2 * math.pi * freq * t) + 0.5 * math.sin(2 * math.pi * freq * 2 * t) + 0.25 * math.sin(2 * math.pi * freq * 3 * t)
        r.append(amp * max(env, 0) * v)
    return r

def save(name, b):
    peak = max(1e-9, max(abs(x) for x in b))
    g = 0.89 / peak
    with wave.open(os.path.join(out, name), "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes(b"".join(struct.pack("<h", int(max(-1, min(1, x * g)) * 32767)) for x in b))

# 1. Amanecer: arpegio ascendente tipo campanilla
b = buf(4.0)
for k, f in enumerate([523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5]):
    add(b, k * 0.32, tone(f, 1.6, ((1, 1), (2, .35), (3, .12)), decay=3.2))
save("amanecer.wav", b)

# 2. Campanas: golpes de campana inarmónicos
b = buf(4.0)
for st in (0.0, 0.9, 1.8, 2.7):
    add(b, st, tone(880, 1.5, ((1, 1), (2.76, .5), (5.4, .25), (8.9, .1)), decay=3.0, amp=.5))
save("campanas.wav", b)

# 3. Pulso: pitidos digitales, muy audibles
b = buf(2.6)
for rep in range(2):
    for k in range(4):
        add(b, rep * 1.3 + k * 0.17, beep(1568 if k % 2 == 0 else 1319, 0.11))
save("pulso.wav", b)

# 4. Marimba: melodía percutida
b = buf(4.8)
for k, f in enumerate([392.0, 493.88, 587.33, 783.99, 587.33, 493.88, 659.25, 523.25]):
    add(b, k * 0.42, tone(f, 0.9, ((1, 1), (4, .3), (10, .08)), decay=7.5, attack=.002))
save("marimba.wav", b)

# 5. Radar: barrido ascendente repetido
b = buf(3.6)
for rep in range(3):
    n = int(0.9 * SR); ph = 0.0; r = []
    for i in range(n):
        t = i / SR; f = 600 + 700 * (t / 0.9) ** 1.5; ph += 2 * math.pi * f / SR
        env = min(1.0, t / .03, (0.9 - t) / .12)
        r.append(.5 * env * (math.sin(ph) + .3 * math.sin(2 * ph)))
    add(b, rep * 1.2, r)
save("radar.wav", b)
