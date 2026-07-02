import sys, glob, os
from faster_whisper import WhisperModel

model = WhisperModel("medium", device="cpu", compute_type="int8")

files = sorted(glob.glob(os.path.join(os.path.dirname(__file__), "*.wav")))
for f in files:
    print("=" * 100)
    print("FILE:", os.path.basename(f))
    print("=" * 100)
    segments, info = model.transcribe(f, language="es", beam_size=5, vad_filter=True)
    print(f"Detected language: {info.language} (prob {info.language_probability:.2f}), duration: {info.duration:.1f}s")
    full_text = []
    for seg in segments:
        line = f"[{seg.start:7.2f} - {seg.end:7.2f}] {seg.text.strip()}"
        print(line)
        full_text.append(seg.text.strip())
    out_path = f + ".txt"
    with open(out_path, "w", encoding="utf-8") as out:
        out.write(" ".join(full_text))
    print(f"\n--> Saved transcript to {out_path}\n")
