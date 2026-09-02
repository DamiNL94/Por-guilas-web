# Pendientes de la sección Programa

Estado a 2 de septiembre de 2026. Rama `programa-2027`.

La sección Programa publica el documento **«Programa Por Águilas 2027», borrador
de trabajo, versión 1, septiembre de 2026**. El texto sale literal del `.docx`;
no hay ni una medida ni una cifra escritas fuera de él.

---

## 1 · Qué caduca, y cuándo

Cada dato del programa lleva fuente en el bloque E. Estos son los que se mueven
solos y hay que volver a mirar antes de cada publicación.

| Dato | Dónde aparece | Con qué frecuencia cambia | Fuente que hay que volver a mirar |
|---|---|---|---|
| 1.649 €/m² · +8,8 % · Calabardina-Cope +15,2 % · El Hornillo 2.563 € · Centro 1.346 € | Eje 01 (diagnóstico) y fuente 3 | **Mensual** | idealista, informe de precio de venta en Águilas |
| 1.741 personas en paro · 584 en hostelería, comercio y servicios personales | Eje 03 (diagnóstico) y fuente 5 | **Mensual** | CREM, paro registrado por municipio |
| Vivienda como primer problema · 20,7 % · 18,9 % · 17,8 % · 41,3 % | Eje 04 (diagnóstico) y fuentes 1 y 2 | **Mensual** | CIS, barómetro |
| 98,7 % del salario joven · 15,2 % emancipados | Eje 01 y fuente 4 | Semestral | Consejo de la Juventud de España, Observatorio de Emancipación |
| 37.811 habitantes | Eje 02 y fuente 6 | Anual (enero) | INE / CREM, cifras oficiales de población |
| Gasto en pruebas de imagen concertadas, cerca de +50 % en cinco años | Eje 02 y fuente 7 | Anual | Nota de IU sobre el CIAR, o dato actualizado del SMS |

## 2 · Qué cambia de estado en meses, no en años

Esto no es que caduque: es que puede quedar **factualmente falso** y dejar en mal
lugar a la candidatura.

- **CIAR.** El programa dice «abrirá a finales de 2026» y «servicios que ya
  funcionan aquí, sin laboratorio, sin hospitalización de corta estancia, sin
  cirugía menor ambulatoria y con la radiología sin garantizar». En cuanto abra
  hay que comprobar con qué abrió de verdad y reescribir el diagnóstico del eje
  02, la fila del CIAR del bloque C y el indicador «Servicios efectivamente
  abiertos en el CIAR», que hoy pone «Por confirmar a su apertura».
- **Cercanías Murcia-Lorca-Águilas.** El programa da por buena la previsión de
  «otoño de 2027» (fuente 10). Si se adelanta o se vuelve a aplazar, cambian la
  medida 14, la movilidad del eje 03 y la fila del tren del bloque C.
- **Ampliación de la desaladora.** «Llamada a ampliarse antes de 2027»
  (fuente 11). Si se adjudica, se paraliza o cambia el reparto de caudales,
  cambia el diagnóstico del eje 03 y la fila del agua del bloque C.
- **Ley de vivienda y zonas tensionadas.** El recargo del IBI se apoya en la
  Ley 12/2023 (fuente 9). Cualquier reforma estatal o autonómica obliga a
  revisar las medidas 02 y las tres primeras del eje 01.

## 3 · Qué hay que confirmar antes de publicar en dominio propio

1. **Retirar el aviso de borrador.** Está en dos sitios y los dos son
   deliberados; no se quitan solos:
   - La barra negra de la cabecera, en todas las páginas. Se apaga poniendo la
     prop `avisoBorrador` a `false` en el bloque `data-dc-script` de
     `index.html`, o desde el editor visual.
   - La cabecera de la propia sección Programa: la línea bermellón
     «Borrador de trabajo · versión 1 · septiembre de 2026» y el párrafo que
     empieza «Documento interno de la candidatura…». Los dos salen del objeto
     `PROGRAMA` en `index.html`.
   - El pie sigue diciendo «© 2026 Por Águilas · Borrador de trabajo».
2. **Decidir qué se hace con «Documento interno de la candidatura».** Va literal
   del `.docx` y hoy se publica tal cual. En una web pública esa frase se
   contradice a sí misma: o se cambia en el documento, o se quita de la web.
3. **Decidir si se publica el `.docx`.** Ahora mismo se sirve desde
   `/descargas/programa-por-aguilas-2027.docx`, y el botón de descarga de la
   portada y el del final del programa apuntan ahí. El fichero no lleva
   comentarios de edición dentro (se ha comprobado), pero sí lleva la frase del
   punto anterior. Alternativa: generar un PDF desde la propia página impresa,
   que ya está maquetada para A4, y descargar eso.
4. **Cerrar los plazos aproximados.** Lo pide el propio documento: «sustituir los
   plazos aproximados por fechas cerradas».
5. **Volver a comprobar las once fuentes.** Lo dice el bloque E: «Todas
   consultadas en septiembre de 2026».

## 4 · Qué se ha dejado fuera a propósito

- **El capítulo «01 · El punto de partida / Qué ha cambiado desde 2023».** Está
  entero en el `.docx` —los cinco datos, la tabla de nueve filas «en 2023 → en
  2027 → por qué» y los cinco puntos de «Qué hemos quitado, y por qué»— y no se
  ha publicado. La estructura acordada para la web es: quince medidas, cuatro
  ejes, lo que no depende del Ayuntamiento, cómo comprobar si cumplimos y
  fuentes. **Decisión política pendiente:** explicarle al votante lo que decías
  en 2023 es regalar el marco, pero es material que existe y puede querer
  publicarse. Si se decide publicarlo, el texto está en el `.docx` y entra como
  un bloque más antes de las quince medidas.
- **Prensa y Agenda siguen con contenido de ejemplo.** Una nota contradice ya al
  programa: la del 14 de julio dice que la normativa permite el recargo del IBI
  «desde 2022», y el programa lo ancla en la **Ley 12/2023** (fuente 9). Hay que
  rehacer las cinco notas o retirarlas antes de publicar; no se han tocado
  porque escribir notas de prensa nuevas sería inventar contenido.
- **La foto de la portada del programa** sigue siendo un hueco
  («FOTO PENDIENTE · portada del programa o acto de calle»).

## 5 · Decisiones de maquetación que conviene conocer

- **Contradicción resuelta a favor del `.docx`.** El resumen de encargo decía que
  la medida 02 llega «hasta el 50 % que permite la ley»; el documento dice «hasta
  el máximo que permite la ley —que llega al 150 % para quien acumula viviendas
  vacías—», y el eje 01 lo desglosa (50 % de base, 100 % a los tres años, 150 %
  a grandes tenedores). **Manda el documento.** Igual con el número de fuentes:
  el encargo decía diez, el documento tiene once, y se publican once.
- **Las dos tablas no son `<table>`.** Son `<div role="table">` con roles ARIA.
  El motivo es técnico: el analizador de HTML del navegador expulsa fuera de una
  tabla cualquier etiqueta que no sea de tabla, y `sc-for` lo es, así que una
  tabla de verdad se rompería al abrir `index.html` sin compilar. Con roles el
  lector de pantalla la anuncia igual como tabla, y en móvil cada fila se
  convierte en pares etiqueta-valor sin scroll horizontal.
- **El bloque E es plegable pero viene abierto**, y al imprimir se fuerza
  abierto. Ningún contenido queda detrás de un clic obligatorio.
- **Los números de las quince medidas van en verde oscuro, no en bermellón.** El
  manual reserva el bermellón para la cuña, el «Por» y lo urgente; quince cifras
  rojas seguidas dejan de señalar nada.
- **Impresión.** La sección entera sale en A4 sin menús, sin fondos de color y
  con un eje por página (17 páginas). Se comprueba imprimiendo `/programa` desde
  el navegador.
- **La marquesina de la portada sale de `EJES`.** Llevaba tres de los cuatro
  lemas; ahora lleva el del programa más los cuatro de los ejes, en orden, y se
  genera de los datos para que no vuelva a quedarse corta. Las dos mitades de la
  cinta se pintan del mismo array, que es lo que mantiene el bucle sin costura.
- **El menú del móvil cierra al saltar a un ancla.** Estando ya en `/programa`,
  tocar «Eje 02» no recargaba nada: el diálogo se quedaba encima tapando el
  destino. Ahora se cierra y el foco va a la sección, no de vuelta al botón.
  Está en `app.js`, en el manejador de `abrirMenu`.
- **Anclas.** `/programa#medidas`, `/programa#eje-01` … `#eje-04`,
  `#competencias`, `#indicadores`, `#fuentes`. Están enlazadas desde la portada,
  desde el índice de la propia página y desde el menú del móvil. Si se cambia un
  `id` en el array `EJES` hay que cambiarlas en los tres sitios.

## 6 · Recordatorio de siempre

Después de tocar `index.html` hay que volver a compilar:

```bash
node scripts/compilar.js
```

El servidor guarda la huella del `index.html` con el que se compiló y avisa al
arrancar si alguien se olvida.
