# -*- coding: utf-8 -*-
import json, os

audios_dir = r"C:\Users\eduardo.perez\Documents\audios"
with open(os.path.join(audios_dir, "segments_fixed.json"), encoding="utf-8") as f:
    SEGMENTS = json.load(f)

F1 = 's3___010438475248-br01a-s3-records63_Recorder_hermes_p_Files_86D445A7935715B4_RECORDS_86A637C467F5B6B4_2026_05_26_1000_1000#20260526#145456#11066#342421876.wav'
F2 = 's3___010438475248-br01a-s3-records63_Recorder_hermes_p_Files_86D445A7935715B4_RECORDS_86A637C467F5B6B4_2026_05_26_1003_1003#20260526#134229#5863#56226224124.wav'
F3 = 's3___010438475248-br01a-s3-records63_Recorder_hermes_p_Files_86D445A7935715B4_RECORDS_86A637C467F5B6B4_2026_05_26_1008_1008#20260526#125526#11785#56412454174.wav'

RUBRIC_DEF = [
    {"key":"presentacion","nombre":"Presentación e identificación","peso":0.08,
     "definicion":"El ejecutivo se presenta con nombre, empresa e identifica a Infobusiness como distribuidor autorizado de Equifax, generando un contexto claro y profesional del llamado."},
    {"key":"validacion","nombre":"Validación de interlocutor","peso":0.12,
     "definicion":"Valida si habla con la persona correcta o identifica al responsable de evaluación comercial, facturación o cobranza cuando corresponde."},
    {"key":"deteccion","nombre":"Detección de necesidad / diagnóstico","peso":0.15,
     "definicion":"Realiza preguntas abiertas para identificar la necesidad real del cliente (riesgo de incobrables, evaluación de clientes, cobranza, monitoreo de cartera) antes de lanzar un discurso genérico."},
    {"key":"valor","nombre":"Presentación de valor del producto","peso":0.12,
     "definicion":"Explica beneficios y valor del producto de forma consultiva, relacionando la solución con la necesidad detectada (Reporte Interactivo, Mora Control o Portfolio Monitor)."},
    {"key":"objeciones","nombre":"Manejo de objeciones","peso":0.20,
     "definicion":"Escucha la objeción sin interrumpir y responde con argumentos consultivos, claros y alineados al producto, evitando confrontar o presionar de forma agresiva."},
    {"key":"agenda","nombre":"Interés de agenda y siguiente paso","peso":0.10,
     "definicion":"Identifica el nivel de interés del cliente, genera compromiso con una acción futura y deja definido el próximo paso de la gestión."},
    {"key":"lenguaje","nombre":"Lenguaje profesional y claridad","peso":0.08,
     "definicion":"Utiliza lenguaje claro, profesional y comprensible para un cliente Pyme, evitando tecnicismos innecesarios, muletillas o expresiones que resten credibilidad."},
    {"key":"empatia","nombre":"Empatía, escucha activa y trato cordial","peso":0.12,
     "definicion":"Mantiene tono cordial, demuestra disposición de ayuda, escucha activamente y adapta su comunicación al cliente sin sonar plano, apurado o desganado."},
    {"key":"fluidez","nombre":"Fluidez y control de silencios","peso":0.03,
     "definicion":"Mantiene una conversación natural, clara y continua, evitando pausas prolongadas o silencios innecesarios."},
]
# nota: en el archivo original "Rubrica Pauta Calidad.xlsx" las definiciones de
# "Lenguaje profesional y claridad" y "Empatía..." aparecen con texto de otra
# rúbrica (error de copiado en la fuente). Se usaron aquí las definiciones
# correctas (coherentes con el nombre del atributo), tomadas de la hoja
# "RUBRICA - NO INTERESA" del mismo archivo, donde sí coinciden.

MEDICION_VALUE = {"CUMPLE": 1, "CUMPLE CON OBS": 0.5, "NO CUMPLE": 0, "NO APLICA": 1}

def score(rubrica_eval):
    return round(sum(RUBRIC_DEF[i]["peso"] * MEDICION_VALUE[e["medicion"]] for i, e in enumerate(rubrica_eval)) * 100, 1)

CALLS = [
{
    "id": "c1",
    "file": F1,
    "titulo": "Prospección en frío: cómo detectar una deuda impaga para vender Mora Control",
    "categoria": "Prospección",
    "ejecutivo": "Marcelo Araneda",
    "cliente": "Dennis Fernández",
    "empresa": "Adway Chile Marketing SpA",
    "fecha": "26-05-2026",
    "hora": "14:54",
    "duracionTxt": "3:33",
    "motivo": "Llamado de prospección en frío para ofrecer monitoreo financiero de clientes y proveedores, e introducir la publicación en Dicom (Mora Control) como herramienta de cobro de facturas impagas.",
    "resumen": "El ejecutivo contacta por primera vez a Adway Chile Marketing SpA, valida que habla con el encargado de finanzas (Don Dennis Fernández) y presenta una propuesta de monitoreo financiero de clientes y proveedores. Hacia el cierre indaga si la empresa tiene facturas impagas, detectando una deuda de 15 millones de pesos posterior a 2019, y usa ese hallazgo para reforzar el valor de publicar al deudor en Dicom como palanca de cobro. Cierra pidiendo el correo de contacto para enviar la propuesta.",
    "sentimiento": "Neutral / cooperativo",
    "palabrasClave": ["Mora Control", "Publicación en Dicom", "Factura impaga", "Recuperación de cartera", "Prospección en frío"],
    "momentos": [
        {"t": 0.37, "label": "Apertura y validación del interlocutor"},
        {"t": 58.97, "label": "Presentación de valor: monitoreo financiero de clientes y proveedores"},
        {"t": 90.49, "label": "Frase de presión sobre “muerte financiera” en Dicom"},
        {"t": 148.25, "label": "Pregunta de diagnóstico: ¿tiene facturas impagas?"},
        {"t": 157.17, "label": "Cuantificación de la deuda: 15 millones de pesos"},
        {"t": 204.17, "label": "Cierre y despedida"}
    ],
    "rubrica": [
        {"medicion": "CUMPLE CON OBS", "cita": "mi nombre es Marcelo Araneda, yo soy ejecutivo comercial de Dicom Equifax", "ts": 0.37,
         "comentario": "Se presenta con nombre y empresa, pero no menciona a Infobusiness como distribuidor autorizado de Equifax."},
        {"medicion": "CUMPLE", "cita": "necesito hablar con la persona encargada de facturación... ¿Con quién tengo el gusto de hablar? Don Dennis Fernández.", "ts": 22.95,
         "comentario": "Valida correctamente al interlocutor antes de presentar la propuesta."},
        {"medicion": "CUMPLE CON OBS", "cita": "¿tiene alguna empresa que le haya quedado debiendo una factura en modo crédito? ... ¿Cuántos millones estamos hablando?", "ts": 148.25,
         "comentario": "Sí indaga la necesidad real (deuda impaga), pero lo hace al final, después de un discurso de producto ya armado de antemano, no como diagnóstico inicial."},
        {"medicion": "CUMPLE", "cita": "podría monitorear a sus clientes y a sus proveedores cómo se comportan financieramente... le aseguramos el 70% de recuperación de esa factura el primer mes", "ts": 58.97,
         "comentario": "Explica con claridad el valor del producto (monitoreo + recuperación de cartera), aunque sin nombrarlo comercialmente como “Mora Control”."},
        {"medicion": "NO APLICA", "cita": "", "ts": None,
         "comentario": "El cliente no presenta objeciones durante la llamada; se limita a responder afirmativamente."},
        {"medicion": "CUMPLE", "cita": "Deme su mail, Don Dennis... me puede contactar por teléfono, mail, whatsapp o si quiere tener una reunión virtual", "ts": 105.13,
         "comentario": "Define un siguiente paso claro: envío de propuesta por correo y canales de contacto."},
        {"medicion": "CUMPLE CON OBS", "cita": "la persona que está en Dicom o la empresa tiene la muerte financiera", "ts": 90.49,
         "comentario": "En general es claro, pero usa una frase alarmista/poco profesional que podría restar credibilidad."},
        {"medicion": "CUMPLE", "cita": "última pregunta, Don Dennis, y gracias por su tiempo... Muchas gracias. Que esté muy bien.", "ts": 143.21,
         "comentario": "Trato cordial durante toda la llamada, agradece el tiempo y se despide amablemente."},
        {"medicion": "CUMPLE", "cita": "", "ts": None,
         "comentario": "La conversación fluye sin cortes ni silencios prolongados perceptibles."},
    ],
    "fortalezas": [
        "Valida correctamente al interlocutor antes de avanzar con la propuesta.",
        "Detecta una necesidad concreta y cuantificable (factura impaga de 15 millones).",
        "Cierra con un siguiente paso y canales de contacto claros."
    ],
    "oportunidades": [
        "Mencionar a Infobusiness como distribuidor autorizado de Equifax en la presentación.",
        "Adelantar el diagnóstico de necesidad antes de desplegar el discurso de producto.",
        "Evitar frases alarmistas (“muerte financiera”) que pueden sonar agresivas o poco profesionales."
    ],
    "accionRecomendada": "Feedback individual",
},
{
    "id": "c2",
    "file": F2,
    "titulo": "Cómo presentar Mora Control y Reporte Interactivo: planes, precios y objeción del contrato anual",
    "categoria": "Objeciones",
    "ejecutivo": "Ximena Cofré",
    "cliente": "Mauricio Maillard",
    "empresa": "M Impresores",
    "fecha": "26-05-2026",
    "hora": "13:42",
    "duracionTxt": "11:22",
    "motivo": "Presentación completa de la plataforma de autogestión (Reporte Interactivo + Mora Control) y negociación de plan y precio con el representante de M Impresores.",
    "resumen": "La ejecutiva presenta en detalle la plataforma de autogestión: carga de facturas de hasta 7 años de antigüedad, tres acciones de cobranza (SMS, carta, mail), publicación en Dicom los martes y jueves, integración con el SII y emisión de certificado de no deuda. Expone dos planes (2.5 UF con Mora Control hasta $4.100.000 y 4.0 UF con Mora Control ilimitado, rebajado a 3.5 UF por campaña) bajo contrato anual y pago pospago. El cliente muestra interés pero objeta el compromiso de pago mensual por un año; la ejecutiva responde destacando la cobertura de información de Dicom y ofrece gestionar una rebaja de plan con su jefatura antes del viernes.",
    "sentimiento": "Interesado con reservas (objeción de precio/plazo)",
    "palabrasClave": ["Reporte Interactivo", "Mora Control", "Autogestión", "Objeción de plazo anual", "Publicación en Dicom", "Certificado de no deuda"],
    "momentos": [
        {"t": 0.0, "label": "Apertura y validación del interlocutor"},
        {"t": 19.82, "label": "Presentación de la plataforma: facturas hasta 7 años de antigüedad"},
        {"t": 52.34, "label": "Acciones de cobranza: SMS, carta y mail"},
        {"t": 78.86, "label": "Publicación en Dicom (martes y jueves) e integración con el SII"},
        {"t": 135.98, "label": "Certificado de no deuda"},
        {"t": 182.02, "label": "Presentación de los dos planes disponibles"},
        {"t": 306.02, "label": "Precio y descuento de campaña (3.5 UF)"},
        {"t": 492.62, "label": "Objeción: “no me gusta el pago mensual por un año”"},
        {"t": 600.62, "label": "Cliente expresa interés con reservas"},
        {"t": 615.62, "label": "Manejo de objeción: gestionar rebaja con la jefatura"},
        {"t": 669.62, "label": "Cierre: envío de correo y próximos pasos"}
    ],
    "rubrica": [
        {"medicion": "CUMPLE CON OBS", "cita": "mi nombre es Ximena Cofré, yo estoy llamando de parte de Ecosaxicom", "ts": 0.0,
         "comentario": "Se presenta con nombre y empresa, pero no menciona a Infobusiness como distribuidor autorizado de Equifax."},
        {"medicion": "CUMPLE", "cita": "Hablo con la persona encargada de finanzas, representante legal de la empresa. Sí.", "ts": 8.38,
         "comentario": "Valida correctamente al interlocutor al inicio de la llamada."},
        {"medicion": "CUMPLE CON OBS", "cita": "No sé si ustedes tienen o tiene usted una idea de cuánto es lo que tiene usted en facturas pendientes en este momento.", "ts": 479.62,
         "comentario": "Despliega un discurso extenso y genérico de la plataforma antes de indagar la situación real del cliente; el diagnóstico llega recién sobre el minuto 8."},
        {"medicion": "CUMPLE", "cita": "Tenemos tres acciones que usted puede enviar a los clientes, pueden ser SMS, carta de aviso o mail de cobranza... puede publicar a los clientes deudores dentro de la misma plataforma", "ts": 52.34,
         "comentario": "Explicación extensa, clara y correcta del valor de Reporte Interactivo y Mora Control."},
        {"medicion": "CUMPLE", "cita": "lo que pasa es que el plan, lamentablemente, los planes que nosotros ofrecemos son así... podemos ver la posibilidad de rebajar el plan si se interesa", "ts": 497.62,
         "comentario": "Escucha la objeción de precio/plazo sin interrumpir y responde con argumentos consultivos (cobertura de información) sin presionar."},
        {"medicion": "CUMPLE", "cita": "Mientras yo le voy a enviar el correo y cualquier cosa se comunica a través del mismo correo.", "ts": 669.62,
         "comentario": "Cierra con un siguiente paso concreto: envío de correo y gestión de rebaja antes del viernes."},
        {"medicion": "CUMPLE", "cita": "", "ts": None,
         "comentario": "Lenguaje claro y profesional a lo largo de una explicación extensa y detallada."},
        {"medicion": "CUMPLE", "cita": "", "ts": None,
         "comentario": "Mantiene un tono cordial y paciente incluso ante la objeción del cliente."},
        {"medicion": "CUMPLE", "cita": "", "ts": None,
         "comentario": "Llamada extensa pero fluida, sin silencios prolongados evidentes."},
    ],
    "fortalezas": [
        "Domina en profundidad el funcionamiento de la plataforma y sus dos planes.",
        "Maneja la objeción de plazo/precio sin confrontar, ofreciendo una salida concreta (rebaja con jefatura).",
        "Cierra con fecha límite y canal de seguimiento definidos."
    ],
    "oportunidades": [
        "Diagnosticar la necesidad y el volumen de facturas pendientes antes de extender el discurso de producto.",
        "Acortar la explicación inicial para llegar antes al diagnóstico y a la objeción real del cliente.",
        "Mencionar a Infobusiness como distribuidor autorizado de Equifax en la presentación."
    ],
    "accionRecomendada": "Feedback individual",
},
{
    "id": "c3",
    "file": F3,
    "titulo": "Venta consultiva de Reporte Interactivo comparando el costo actual del cliente",
    "categoria": "Venta consultiva",
    "ejecutivo": "Karen",
    "cliente": "Julio Valdebenito",
    "empresa": "TS Servicios Limitadas",
    "fecha": "26-05-2026",
    "hora": "12:55",
    "duracionTxt": "2:46",
    "motivo": "Prospección para ofrecer Reporte Interactivo comparando el costo que el cliente ya paga hoy por un informe comercial individual.",
    "resumen": "La ejecutiva contacta a TS Servicios Limitadas y descubre que Julio Valdebenito ya utiliza un informe Dicom laboral una vez al mes, pagando cerca de $28.000 por consulta de forma particular. A partir de ese dato, presenta dos alternativas de Reporte Interactivo: una bolsa de 10 informes en 12 meses por 3 UF de pago único, o un plan mensual de 1 UF con 10 informes al mes (~$4.000 por informe), evidenciando el ahorro frente al gasto actual. El cliente debe consultar con su jefe; la ejecutiva agenda un nuevo contacto para el jueves.",
    "sentimiento": "Interesado, pendiente de aprobación de jefatura",
    "palabrasClave": ["Reporte Interactivo Bolsa", "Comparación de costos", "Gasto hormiga", "Informe comercial", "Seguimiento agendado"],
    "momentos": [
        {"t": 0.0, "label": "Apertura y validación de la empresa"},
        {"t": 20.0, "label": "Sondeo: ¿conoce o ha usado la plataforma?"},
        {"t": 27.0, "label": "Diagnóstico: ya usa Dicom laboral 1 vez al mes (~$28.000)"},
        {"t": 70.0, "label": "Oferta: bolsa de 10 informes en 12 meses (3 UF)"},
        {"t": 97.0, "label": "Oferta: plan mensual 1 UF con 10 informes (~$4.000 c/u)"},
        {"t": 119.0, "label": "Argumento del “gasto hormiga”"},
        {"t": 125.0, "label": "Solicitud de correo y derivación al jefe"},
        {"t": 149.28, "label": "Cierre: agenda seguimiento para el jueves"}
    ],
    "rubrica": [
        {"medicion": "CUMPLE CON OBS", "cita": "Me presento, mi nombre es Karen, perdón, estoy hablando de Decom Xfax.", "ts": 3.0,
         "comentario": "Se presenta con nombre y empresa, pero no menciona a Infobusiness como distribuidor autorizado de Equifax."},
        {"medicion": "CUMPLE", "cita": "estamos llamando a la empresa TS Servicios Limitadas... ¿Ya está correcto, cierto?", "ts": 10.0,
         "comentario": "Valida que habla con la empresa y la persona correctas antes de continuar."},
        {"medicion": "CUMPLE", "cita": "yo la utilizo una vez al mes por lo general... el reporte le sale casi 28 mil pesos", "ts": 27.0,
         "comentario": "Indaga temprano la situación actual del cliente (uso y costo real) antes de ofrecer, permitiendo una propuesta a medida."},
        {"medicion": "CUMPLE", "cita": "Tenemos unas bolsas que son 10 informes durante 12 meses... el informe está saliendo casi a 4 mil pesos", "ts": 70.0,
         "comentario": "Presenta el valor de forma comparativa y consultiva, ligada directamente a la necesidad ya diagnosticada."},
        {"medicion": "NO APLICA", "cita": "", "ts": None,
         "comentario": "No hay una objeción del cliente propiamente tal; solo indica que debe consultar con su jefe."},
        {"medicion": "CUMPLE", "cita": "Lo vuelvo a llamar el jueves para ver si lo recibió, si está todo ok, ¿le parece?", "ts": 149.28,
         "comentario": "Agenda un siguiente paso concreto y con fecha definida."},
        {"medicion": "CUMPLE", "cita": "", "ts": None,
         "comentario": "Lenguaje claro y directo, aunque el nombre de la empresa se transcribe de forma confusa en el audio."},
        {"medicion": "CUMPLE", "cita": "Ok, muchas gracias Don Julio, estamos hablando. Hasta luego.", "ts": 158.28,
         "comentario": "Trato cordial durante toda la llamada, breve y respetuosa."},
        {"medicion": "CUMPLE", "cita": "", "ts": None,
         "comentario": "Llamada corta, fluida y sin silencios prolongados."},
    ],
    "fortalezas": [
        "Diagnostica el gasto actual del cliente antes de ofrecer, lo que le permite un argumento de ahorro muy concreto.",
        "Usa el concepto de “gasto hormiga” para evidenciar valor de forma consultiva.",
        "Agenda un seguimiento con fecha específica (jueves)."
    ],
    "oportunidades": [
        "Mencionar a Infobusiness como distribuidor autorizado de Equifax en la presentación.",
        "Profundizar en el volumen real de informes que solicita la empresa al mes para dimensionar mejor el plan a ofrecer.",
        "Confirmar el correo del jefe/decisor para asegurar que la propuesta llegue a quien aprueba."
    ],
    "accionRecomendada": "Sin acción",
},
]

for c in CALLS:
    c["segments"] = SEGMENTS[c["file"]]
    c["scoreTotal"] = score(c["rubrica"])

def js_str(s):
    return json.dumps(s, ensure_ascii=False)

lines = []
lines.append("var RUBRIC_DEF=" + json.dumps(RUBRIC_DEF, ensure_ascii=False) + ";")
lines.append("var MEDICION_VALUE=" + json.dumps(MEDICION_VALUE, ensure_ascii=False) + ";")
lines.append("var CALLS=" + json.dumps(CALLS, ensure_ascii=False) + ";")

out_path = os.path.join(audios_dir, "calls_data.js")
with open(out_path, "w", encoding="utf-8") as f:
    f.write("\n".join(lines))

print("Written", out_path, "size:", os.path.getsize(out_path), "bytes")
for c in CALLS:
    print(c["id"], c["titulo"], "-> score", c["scoreTotal"], "%, segments:", len(c["segments"]))
