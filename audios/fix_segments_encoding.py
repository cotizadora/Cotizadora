import json, glob, os

audios_dir = r"C:\Users\eduardo.perez\Documents\audios"
with open(os.path.join(audios_dir, "segments.json"), encoding="utf-8") as f:
    corrupted = json.load(f)

result = {}
for fname, segs in corrupted.items():
    txt_path = os.path.join(audios_dir, fname + ".txt")
    with open(txt_path, encoding="utf-8") as f:
        full_text = f.read()

    pos = 0
    fixed_segs = []
    ok = True
    for seg in segs:
        L = len(seg["text"])
        piece = full_text[pos:pos+L]
        if len(piece) != L:
            ok = False
        fixed_segs.append({"start": seg["start"], "end": seg["end"], "text": piece})
        pos += L + 1  # +1 for the joining space
    result[fname] = fixed_segs
    # sanity check: rejoin and compare to full_text (allow trailing mismatch of last space)
    rejoined = " ".join(s["text"] for s in fixed_segs)
    match = rejoined.strip() == full_text.strip()
    print(fname, "segments:", len(fixed_segs), "length match:", ok, "rejoin match:", match)
    if not match:
        print("  MISMATCH len corrupted-concat vs full:", len(rejoined), len(full_text))

out_path = os.path.join(audios_dir, "segments_fixed.json")
with open(out_path, "w", encoding="utf-8") as out:
    json.dump(result, out, ensure_ascii=False, indent=1)
print("Saved", out_path)
