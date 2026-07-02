import re, json, os

log_path = r"C:\Users\eduardo.perez\Documents\audios\transcribe_log_utf8.txt"
with open(log_path, encoding="utf-8", errors="replace") as f:
    text = f.read()

file_re = re.compile(r"FILE:\s*(\S+\.wav)")
seg_re = re.compile(r"\[\s*([\d.]+)\s*-\s*([\d.]+)\]\s*(.+)")

files = list(file_re.finditer(text))
result = {}
for i, m in enumerate(files):
    fname = m.group(1)
    start = m.end()
    end = files[i+1].start() if i+1 < len(files) else len(text)
    chunk = text[start:end]
    segs = []
    for line in chunk.splitlines():
        sm = seg_re.match(line.strip())
        if sm:
            segs.append({
                "start": float(sm.group(1)),
                "end": float(sm.group(2)),
                "text": sm.group(3).strip()
            })
    result[fname] = segs
    print(fname, "->", len(segs), "segments")

out_path = r"C:\Users\eduardo.perez\Documents\audios\segments.json"
with open(out_path, "w", encoding="utf-8") as out:
    json.dump(result, out, ensure_ascii=False, indent=1)
print("Saved to", out_path)
