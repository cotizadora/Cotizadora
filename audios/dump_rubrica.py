import openpyxl
path = r"C:\Users\eduardo.perez\Documents\Rubrica Pauta Calidad.xlsx"
wb = openpyxl.load_workbook(path, data_only=True)
for ws in wb.worksheets:
    print("=" * 100)
    print("SHEET:", ws.title, "dims:", ws.dimensions)
    print("=" * 100)
    for row in ws.iter_rows():
        vals = [c.value for c in row]
        if all(v is None for v in vals):
            continue
        print(row[0].row, "|", vals)
