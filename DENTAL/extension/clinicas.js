/* ============================================================
   RED DE CLÍNICAS
   ------------------------------------------------------------
   Este archivo está VACÍO a propósito. No trae clínicas de
   ejemplo: un dato inventado acá termina leído a un cliente por
   teléfono, y eso es peor que no tener el buscador.

   Para llenarlo hay que extraer los listados de:
     - Uno Salud Dental   https://www.unosalud.cl/clinicas/
     - E-dental           https://www.e-dentalsys.com/#clinicas

   ------------------------------------------------------------
   ESQUEMA

   capturado : "DD-MM-AAAA", la fecha en que se extrajeron los
               datos. Se muestra en pantalla para que el
               ejecutivo sepa qué tan viejos son.

   lista     : un objeto por clínica.
       nombre    texto
       direccion texto
       comuna    texto
       region    texto
       telefono  texto o null
       red       "unosalud" o "edental"
       lat, lng  número, o null si el sitio no las publica.
                 NUNCA estimadas: sin coordenadas el buscador
                 cae a búsqueda por comuna y región, que es
                 menos útil pero no miente.

   comunas   : opcional, para ordenar por cercanía cuando la
               comuna buscada no tiene ninguna clínica. Mapea el
               nombre de la comuna a su centro geográfico.
                 "providencia": {region:"...", lat:-33.43, lng:-70.61}
               Mientras esté vacío, el buscador responde con las
               clínicas de la región y lo dice.
   ============================================================ */
const CLINICAS = {
  capturado: null,
  lista: [],
  comunas: {}
};
