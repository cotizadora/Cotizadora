"""Arma el paquete para las compañeras desde la configuración exportada por Eduardo.

Uso:  python3 preparar.py auto-atajos-config.json

- Toma los atajos del archivo que deja "⬇ Exportar" de ShortCut (cualquier versión).
- Quita el usuario y la clave: los campos del inicio de sesión quedan en blanco
  y marcados (`credencial`), para que cada compañera escriba los suyos.
- Quita lo que viene después de "?" en las direcciones grabadas (RUT de clientes,
  sesiones).
- Escribe ShortCut-Vicidial-GO/default-config.json y rehace Extensiones-Dental-Bci.zip.
La extensión instalada de Eduardo no se toca.
"""
import json, os, re, shutil, sys, tempfile, time, zipfile

AQUI = os.path.dirname(os.path.abspath(__file__))
DENTAL = os.path.dirname(AQUI)
LOGIN = re.compile(r'login|ingres|sesion', re.I)


def sin_credenciales(pasos):
    out, nu, nc = [], 0, 0
    for p in pasos or []:
        p = dict(p)
        if p.get('url'):
            p['url'] = re.sub(r'[?#].*$', '', p['url'])
        es_entrada = p.get('kind') == 'input' or p.get('secreto')
        if es_entrada and not p.get('dyn') and (p.get('secreto') or LOGIN.search(p.get('ruta') or '')):
            if p.get('secreto'):
                nc += 1; campo = 'clave' + (str(nc) if nc > 1 else '')
            else:
                nu += 1; campo = 'usuario' + (str(nu) if nu > 1 else '')
            p['value'] = ''
            p['credencial'] = campo
        out.append(p)
    return out


def main(origen):
    cfg = json.load(open(origen, encoding='utf-8'))
    estados = []
    for s in cfg.get('states') or []:
        if not s or not s.get('id') or not s.get('steps'):
            continue
        estados.append({'id': s['id'], 'label': s.get('label') or 'Atajo', 'steps': sin_credenciales(s['steps']),
                        'color': s.get('color') or '', 'site': s.get('site') or ''})
    if not estados:
        sys.exit('El archivo no trae atajos.')
    nuevo = {'version': 3, '_comment': 'Atajos de Eduardo para las compañeras, sin usuario ni clave.',
             'publicado': int(time.time() * 1000), 'autor': 'eduardo', 'states': estados, 'settings': {}}
    destino = os.path.join(DENTAL, 'ShortCut-Vicidial-GO', 'default-config.json')
    json.dump(nuevo, open(destino, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
    # El paquete: misma estructura que deja INSTALAR.bat
    tmp = tempfile.mkdtemp()
    raiz = os.path.join(tmp, 'DENTAL')
    os.makedirs(raiz)
    for c in ('extension', 'ShortCut-Vicidial-GO'):
        shutil.copytree(os.path.join(DENTAL, c), os.path.join(raiz, c))
    shutil.copy(os.path.join(DENTAL, 'INSTALAR.bat'), raiz)
    shutil.copy(os.path.join(AQUI, 'COMO-INSTALAR.txt'), raiz)
    zipf = os.path.join(AQUI, 'Extensiones-Dental-Bci.zip')
    with zipfile.ZipFile(zipf, 'w', zipfile.ZIP_DEFLATED) as z:
        for base, _, archivos in os.walk(tmp):
            for a in sorted(archivos):
                ruta = os.path.join(base, a)
                z.write(ruta, os.path.relpath(ruta, tmp))
    shutil.rmtree(tmp)
    texto = json.dumps(nuevo, ensure_ascii=False)
    print(len(estados), 'atajos:', ' | '.join(e['label'] + ' (' + e['site'] + ')' for e in estados))
    print('campos en blanco:', sum(1 for e in estados for p in e['steps'] if p.get('credencial')),
          '| quedan claves ocultas:', '"v1:' in texto)
    print('listo:', destino, 'y', zipf)


if __name__ == '__main__':
    main(sys.argv[1])
