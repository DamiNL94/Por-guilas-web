# Riesgos legales · donaciones y datos personales

Web de **Por Águilas** · candidatura municipal de unidad de la izquierda (IU + PCE) para las
elecciones municipales de Águilas del 23 de mayo de 2027.

Fecha de la evaluación: **2 de septiembre de 2026**
Ámbito: la pestaña «Súmate», el sistema de donaciones por transferencia y el tratamiento de datos
que ambos generan.
Régimen vigente: **ordinario**, Ley Orgánica 8/2007. La LOREG todavía no aplica.
Responsable del tratamiento: **Izquierda Unida**, NIF G78269206.

> **Actualización del 2 de septiembre, en tres tiempos. R10 cerrado y páginas legales completas.**
>
> **Uno.** Se confirmó el NIF, **G78269206**, y con él se dio por hecho que había una sola persona
> jurídica. Sobre esa base se cerró R10, se corrigió el responsable —declarado hasta entonces como
> «Izquierda Unida de Águilas», que no es una entidad— y se rehízo la casilla de cesión, que pedía
> permiso para comunicar los datos al propio responsable.
>
> **Dos.** La política de privacidad que publica la propia organización decía lo contrario:
> *«por nuestra estructura territorial somos varias entidades jurídicas las responsables del
> tratamiento»*, con IU-V-RM / IU-RM enumerada entre ellas. R10 se reabrió en naranja: si la
> responsable era la federación de Murcia, el NIF publicado era el de otra entidad.
>
> **Tres.** Consultado el Registro de Partidos Políticos: **IU-RM no está inscrita como entidad
> propia**; Izquierda Unida sí, desde el **2 de noviembre de 1992**, con domicilio en Avenida de la
> Albufera 9, Madrid. Queda confirmado que hay una sola persona jurídica y **R10 se cierra**, esta
> vez sobre un registro público y no sobre una suposición.
>
> Con eso, y con la dirección de la sede de Águilas y el contacto del delegado de protección de
> datos, **las páginas legales no tienen ya ningún hueco sin rellenar**: el arranque del backend deja
> de bloquear por motivos legales. Lo que queda es configuración de despliegue y tareas humanas.

---

## Cómo se puntúa

Severidad × probabilidad, del 1 al 5 cada eje.

| Puntuación | Nivel | Qué significa en la práctica |
|---|---|---|
| 1-4 | 🟩 VERDE | Se asume. Se revisa si cambia algo. |
| 5-9 | 🟨 AMARILLO | Mitigación documentada, sin bloqueo. |
| 10-15 | 🟧 NARANJA | Mitigación obligatoria y persona asignada que lo vigila. |
| 16-25 | 🟥 ROJO | **Bloquea la publicación** hasta bajar de 16. |

La probabilidad se estima **con las mitigaciones ya escritas en el código**. Donde la valoración
cambia respecto a la preliminar, se dice y se explica por qué.

---

## Resumen

| # | Riesgo | Sev. | Prob. | Puntos | Nivel | Cambio |
|---|---|:--:|:--:|:--:|---|---|
| R1 | Donación de persona jurídica (art. 5 LO 8/2007: nulidad + sanción) | 4 | 3 | 12 | 🟧 NARANJA | = |
| R2 | Donación anónima o no identificable (ingreso con el concepto mal escrito) | 4 | 3 | 12 | 🟧 NARANJA | ↓ desde 16 🟥 |
| R3 | Datos de opinión política sin consentimiento explícito válido | 5 | 1 | 5 | 🟨 AMARILLO | ↓ desde 10 🟧 · DPD y art. 30 resueltos |
| R4 | Perfilado o enriquecimiento de datos (STC 76/2019) | 5 | 1 | 5 | 🟨 AMARILLO | ↓ desde 10 🟧 |
| R5 | Superar los 50.000 €/donante/año sin detectarlo | 3 | 3 | 9 | 🟨 AMARILLO | ↑ prob. desde 2 |
| R6 | Régimen electoral aplicándose sin haber conmutado la web | 4 | 3 | 12 | 🟧 NARANJA | = |
| R7 | Brecha de seguridad sobre datos de categoría especial | 5 | 2 | 10 | 🟧 NARANJA | = |
| R8 | Comunicaciones sin consentimiento o sin baja (LSSI art. 21) | 3 | 2 | 6 | 🟨 AMARILLO | ↓ desde 9 |
| R9 | Publicar sin aviso legal completo (LSSI art. 10) | 2 | 1 | 2 | 🟩 VERDE | ↓ desde 8 · **sin huecos** |
| R10 | Entidad responsable mal identificada | 4 | 1 | 4 | 🟩 VERDE | ↓ desde 16 🟥 · **cerrado con el Registro** |
| R11 | Donación de quien tiene contrato con el sector público | 4 | 2 | 8 | 🟨 AMARILLO | nuevo |
| R12 | `unsafe-eval` en la CSP por el runtime de la maqueta | 4 | 2 | 8 | 🟨 AMARILLO | nuevo |
| R13 | Certificados fiscales prometidos y no emitidos | 2 | 3 | 6 | 🟨 AMARILLO | nuevo |

**Ningún riesgo en rojo.** Quedan cuatro en naranja —R1, R2, R6 y R7— y los cuatro dependen de algo
que ninguna línea de código puede hacer:

| # | Qué falta exactamente | De quién depende |
|---|---|---|
| R1 y R2 | **Asignar a una persona** la revisión semanal del extracto. El procedimiento ya está escrito en `PROTOCOLO-INGRESOS.md`; lo que falta es un nombre | Tesorería |
| R7 | Firmar los dos contratos de encargado del tratamiento con Brevo y Railway | Protección de datos |
| R6 | Poner en el calendario la conmutación a régimen electoral | Web |

Con la revisión de ingresos asignada, R1 y R2 bajan de 12 a 8. Con los contratos firmados, R7 baja
de 10 a 5. Con la tarea en el calendario, R6 baja de 12 a 4. **Ninguno de los tres cuesta dinero y
ninguno lleva más de una tarde.**

**Las páginas legales están completas.** El arranque del backend ya no bloquea por ningún motivo
legal: responsable, NIF, domicilio social, sede federal, establecimiento en Águilas, inscripción
registral, delegado de protección de datos y versión de la política, todo publicado y comprobado
automáticamente. Lo único que impide aceptar altas ahora mismo son las variables de entorno del
despliegue, que es lo correcto.

---

## R1 · Donación de persona jurídica 🟧 12

**La norma.** Art. 5.1.a LO 8/2007: los partidos no pueden aceptar donaciones de personas
jurídicas ni de entes sin personalidad jurídica. Son **nulas** y hay que devolverlas; aceptarlas
es infracción sancionable y, sobre todo, es el titular más fácil de escribir contra nosotros.

**Factores agravantes**
- Una transferencia desde una cuenta de empresa llega igual, marque lo que marque el formulario.
- En un pueblo, un autónomo o una pequeña sociedad familiar pueden donar «de buena fe» sin ver la
  diferencia entre su bolsillo y el de su negocio.
- El ingreso puede llegar sin haber pasado por el formulario, así que ninguna casilla lo filtra.

**Factores atenuantes**
- No existe ningún campo de empresa ni de CIF: no hay por dónde meterlo.
- La validación del documento rechaza los NIF de persona jurídica **por construcción**, no por una
  lista negra que haya que mantener: la expresión solo admite 8 dígitos + letra (DNI) o X/Y/Z + 7
  dígitos + letra (NIE), y ningún CIF encaja ahí. Probado con B, A, G, J y W en el banco de pruebas.
- Declaración responsable obligatoria en su propia casilla, con el literal guardado como prueba.
- La transferencia deja rastro del ordenante: el nombre de la cuenta de origen se ve en el extracto.

**Opciones de mitigación**

| Opción | Coste | Efectividad | ¿Hecho? |
|---|---|---|---|
| Declaración responsable en casilla propia | Nulo | Media — traslada la responsabilidad, no impide el ingreso | ✅ |
| Rechazo de CIF por construcción en la validación | Nulo | Alta, pero solo sobre quien usa el formulario | ✅ |
| **Revisión manual de cada ingreso contra el extracto antes de darlo por bueno** | ~15 min/semana | **Alta: es la única que ve el ordenante real** | ⚠️ escrito en `PROTOCOLO-INGRESOS.md`, **sin asignar** |
| Protocolo de devolución en 30 días de lo que no cuadre | Redactado | Alta | ✅ `PROTOCOLO-INGRESOS.md`, apartados 2 y 3 |

**Riesgo residual.** Con la revisión manual funcionando, 4 × 2 = **8 🟨**. Sin ella se queda en 12:
el código solo cubre la puerta de entrada del formulario, y el dinero entra por la del banco.

**Quién lo vigila.** Persona responsable de tesorería de la candidatura, semanalmente, contra el
extracto. **Sin asignar: asignarlo antes de publicar.**

---

## R2 · Donación anónima o no identificable 🟧 12 · antes 🟥 16

**La norma.** Art. 5.1.c LO 8/2007: prohibidas las donaciones anónimas. Un ingreso que no se puede
atribuir a una persona concreta hay que devolverlo, y si no se puede devolver —porque no se sabe a
quién— se convierte en un problema contable que arrastra hasta la rendición de cuentas.

**Por qué baja de ROJO a NARANJA.** La valoración preliminar daba probabilidad 4 porque suponía que
la única defensa era pedir amablemente que se escribiera bien el concepto. Lo implementado añade
tres cosas que reducen la probabilidad a 3:

1. **Comunicación previa obligatoria.** Antes de transferir, la persona deja nombre, apellidos,
   DNI, importe y fecha prevista. Aunque el concepto llegue destrozado, el ingreso se puede casar
   por importe + fecha + nombre del ordenante.
2. **El concepto se genera, no se explica.** La web lo monta con los datos ya escritos, en
   mayúsculas y sin tildes, y lo enseña listo para copiar. No se le pide a nadie que lo redacte.
3. **Aviso de truncado.** El concepto completo mide típicamente ~50 caracteres y muchos bancos
   españoles cortan alrededor de 35. La web lo detecta, lo dice con el número exacto y ofrece una
   versión corta (`DONACION AGUILAS <DNI>`, 26 caracteres) que sigue identificando el ingreso.
   Este era el fallo silencioso más probable de todos y no estaba en la valoración preliminar.

**Factores agravantes**
- Nada obliga a usar el formulario antes de transferir. Quien copie el IBAN y se lance, no aparece.
- Sin tildes en el concepto por decisión propia (hay bancos que las convierten en interrogaciones):
  eso hace el cotejo por nombre algo menos directo.
- Un ingreso desde una cuenta conjunta puede llegar a nombre de dos personas.

**Factores atenuantes**
- El DNI dentro del concepto es único: basta él para identificar.
- La comunicación previa se guarda con importe y fecha prevista, que es lo que permite el cruce.
- El bloque de datos es seleccionable con un clic y tiene botón de copiar con degradación: si el
  navegador deniega el portapapeles, la web selecciona el texto para que baste un Ctrl+C.

**Opciones de mitigación**

| Opción | Coste | Efectividad |
|---|---|---|
| Concepto generado + botón de copiar | Hecho | Alta |
| Aviso de truncado + versión corta | Hecho | Alta sobre el fallo más probable |
| Comunicación previa guardada y consultable en el panel | Hecho | Alta |
| ~~Protocolo escrito de devolución del ingreso no identificable~~ | Redactado | Alta: convierte el problema en trámite | ✅ `PROTOCOLO-INGRESOS.md` |
| **Asignar a alguien la revisión semanal del extracto** | ~15 min/semana | **Alta, y es lo único que falta** | ⬜ **sin asignar** |
| Pedir que se avise por correo tras transferir | Nulo | Baja: nadie lo hace | ❌ descartado |

**Riesgo residual.** 4 × 3 = **12 🟧**, y no baja de ahí solo con código: la parte que falta es
humana. Con el protocolo de devolución escrito y aplicado, **8 🟨**.

**Quién lo vigila.** Tesorería, en la misma revisión semanal del extracto que R1.

---

## R3 · Datos de opinión política sin consentimiento válido 🟧 10

**La norma.** Art. 9.1 RGPD: la opinión política es categoría especial. La única base utilizable
aquí es el **consentimiento explícito** del art. 9.2.a. Y el art. 7 exige poder demostrarlo.

**Factores agravantes**
- Es el tratamiento más sensible de todo el proyecto: una lista de quién simpatiza con la izquierda
  en un municipio de 35.000 habitantes.
- Una reclamación ante la AEPD la puede poner cualquiera, y el coste reputacional para una
  candidatura que presume de esto sería desproporcionado respecto a la sanción.
- El consentimiento hay que poder demostrarlo **años después**, cuando ya nadie recuerde qué decía
  el formulario.

**Factores atenuantes**
- Tres casillas separadas —informar, colaborar, ceder a IU y al PCE— más la de mayoría de edad.
  Ninguna agrupa dos finalidades y **ninguna viene marcada**: el atributo HTML que las marcaría no
  aparece ni una vez en `index.html`, y hay una prueba automática que lo comprueba con un grep.
- Doble opt-in: sin confirmar desde el propio correo no hay alta, y lo no confirmado se borra a los
  30 días automáticamente.
- La prueba se guarda **por finalidad, no por envío**: una fila por casilla marcada, con la marca
  temporal, el literal exacto que la persona tenía delante y la versión de la política publicada.
  Es lo que permite responder «demuéstreme que consintió la cesión», que es distinto de
  «demuéstreme que consintió recibir información».
- Los literales viven en `src/config.js` y no en el HTML, y el servidor **se niega a arrancar** si
  la versión que declara la política publicada no coincide con la que él espera.
- Retirar el consentimiento borra de verdad: no queda una fila marcada como «baja».
- Retirar el permiso de colaborar borra el teléfono, que solo existía para esa finalidad.

**Opciones de mitigación**

| Opción | Coste | Efectividad |
|---|---|---|
| Casillas granulares sin premarcar | Hecho | Alta |
| Prueba versionada por finalidad | Hecho | Alta |
| Bloqueo de arranque por descuadre de versión | Hecho | Alta contra el fallo por descuido |
| ~~Nombrar delegado de protección de datos~~ (art. 37 RGPD, art. 34 LOPDGDD) | Nulo | Media-alta | ✅ ya existía: `dpd@izquierdaunida.org` |
| ~~Registro de actividades del tratamiento~~ (art. 30 RGPD) | Redactado | Media | ✅ `REGISTRO-TRATAMIENTOS.md`, tres fichas |

**Riesgo residual.** **5 🟨**, y ya es el residual: las dos piezas formales que lo mantenían en 10
están hechas. El delegado de protección de datos existía ya —`dpd@izquierdaunida.org`— y el registro
de actividades del art. 30 está redactado en `REGISTRO-TRATAMIENTOS.md`, con una ficha por
tratamiento: la lista de Súmate, las comunicaciones de donación y la atención de derechos.

Lo que queda no baja de 5: es el riesgo inherente a tratar opiniones políticas de vecinos de un
municipio pequeño, y con eso se convive haciéndolo bien, no eliminándolo.

**Quién lo vigila.** Quien asuma protección de datos en la candidatura. **Sin asignar.**

---

## R4 · Perfilado o enriquecimiento de datos 🟨 5 · antes 🟧 10

**La norma.** La STC 76/2019 anuló el art. 58 bis.1 LOREG: los partidos **no** pueden recopilar
datos sobre opiniones políticas de la ciudadanía obtenidos de páginas web u otras fuentes.

**Por qué baja.** La probabilidad era 2 sobre la hipótesis de que alguien añadiera analítica más
adelante. Con lo implementado baja a 1, porque el añadido descuidado ya no pasa desapercibido:

- Cero recursos de terceros. Las tipografías están auto-alojadas y React se sirve desde `vendor/`.
- Una **prueba automática falla** si aparece en `index.html` cualquier mención a un dominio de
  terceros (Analytics, Tag Manager, Meta, reCAPTCHA, CDN…), con la única excepción del mapa
  `window.__resources`, que precisamente existe para que el runtime **no** salga a Internet, y cuyos
  valores se comprueban uno a uno contra ficheros del repositorio.
- Un centinela en la propia página registra en consola cualquier petición externa en tiempo de
  ejecución.
- Sin cookies, sin almacenamiento local, sin CAPTCHA de terceros. El antiabuso es trampa + reloj +
  cupo por IP, sin enviar nada a nadie.
- La zona del municipio es una lista cerrada: no se pide la dirección. El teléfono solo aparece si
  se marca colaborar.

**Riesgo residual.** **5 🟨.** La vía que queda abierta no es técnica: es que alguien del equipo
haga un cruce a mano, en una hoja de cálculo, con datos sacados de redes sociales. Eso no lo impide
ningún código.

**Quién lo vigila.** Prohibición escrita en este documento y en el README. Revisión en cada cambio
de la web.

---

## R5 · Superar el límite de 50.000 €/donante/año 🟨 9

**La norma.** Art. 5.1.b LO 8/2007: 50.000 € por donante y año. Art. 5.4: lo que pase de 25.000 €
se notifica al Tribunal de Cuentas en tres meses.

**Por qué sube la probabilidad de 2 a 3.** Al implementarlo apareció un dato que la valoración
preliminar no tenía: **la cuenta no es de la candidatura**, sino de Izquierda Unida Región de
Murcia, que es un órgano de Izquierda Unida. Y como responsable y perceptor son una sola persona
jurídica de ámbito estatal, el límite se cuenta sobre **todo** lo que Izquierda Unida reciba de esa
persona en el año, en cualquier punto del país, no solo sobre lo que entre por Águilas. Desde aquí
no se ve el resto, así que el control es necesariamente parcial. La simplificación que cerró R10
no ayuda a este riesgo: al contrario, deja claro que el perímetro a vigilar es más ancho de lo que
parecía.

**Factores atenuantes**
- El importe se valida en servidor contra el tope exacto, en céntimos enteros. Un céntimo por
  encima se rechaza (probado).
- El aviso del límite es visible junto al formulario y dice explícitamente que el acumulado lo lleva
  la federación.
- El panel del equipo muestra el acumulado por DNI y año y marca a quien pase de la mitad del tope,
  además de señalar cada donación por encima del umbral de notificación.
- Realismo: en una candidatura municipal, una donación de 50.000 € sería extraordinaria.

**Riesgo residual.** **9 🟨**, y no baja desde aquí. Baja cuando exista un canal con la federación
para consultar el acumulado antes de aceptar una donación grande.

**Quién lo vigila.** Tesorería, consultando el panel; y la federación regional para el acumulado
real.

---

## R6 · Régimen electoral sin conmutar 🟧 12

**La norma.** Desde la convocatoria: administrador electoral (arts. 121-123 LOREG), cuenta
electoral comunicada a la Junta Electoral de Zona en 24 horas (art. 124), todos los fondos por esa
cuenta (art. 125), identificación en el acto del depósito (art. 126) y **límite de 10.000 € por
aportante** (art. 129).

**Factores agravantes**
- El día de la convocatoria hay veinte cosas urgentes y esta es invisible: la web sigue funcionando
  igual de bien con los datos equivocados.
- El plazo de 24 horas del art. 124 no admite «se nos pasó».
- Publicar un límite de 50.000 € cuando el legal son 10.000 € es publicar información falsa sobre
  el régimen de financiación de una candidatura, en campaña.

**Factores atenuantes**
- **Un solo sitio que tocar.** El IBAN, el titular, el límite, el umbral de notificación y el marco
  legal viven en `config.donaciones` (`src/config.js`). El bloque electoral ya está escrito, con sus
  valores y sus huecos. Conmutar es cambiar `REGIMEN` a `"electoral"`, rellenar la cuenta y el
  administrador, y desplegar.
- El punto exacto está marcado con el comentario `CAMBIO A RÉGIMEN ELECTORAL`, que aparece también
  en `index.html` para que se encuentre desde cualquiera de los dos lados.
- El arranque **se niega a aceptar donaciones** si el régimen activo tiene huecos `PENDIENTE`: al
  conmutar sin rellenar la cuenta electoral, el formulario se cierra solo en vez de seguir
  publicando el IBAN viejo. Es el modo de fallo correcto.
- La web enseña el régimen vigente y advierte de que cambiará.
- El IBAN publicado se valida al arrancar con el mod-97 del ISO 13616 **y** con los dos dígitos de
  control del CCC español: un dígito bailado en la cuenta electoral no llega a publicarse.

**Opciones de mitigación**

| Opción | Coste | Efectividad |
|---|---|---|
| Configuración centralizada + interruptor documentado | Hecho | Alta |
| Cierre automático del formulario si el régimen nuevo está incompleto | Hecho | Alta |
| **Tarea con fecha en el calendario del equipo, disparada por la convocatoria** | Nulo | Alta | ⬜ |
| Designar administrador electoral con antelación | Variable | Alta | ⬜ |

**Riesgo residual.** Con la tarea en el calendario y el administrador designado, 4 × 1 = **4 🟩**.
Sin eso se queda en 12: el código está listo, pero alguien tiene que acordarse de pulsar.

**Quién lo vigila.** Persona responsable de la web + futura persona administradora electoral.
Procedimiento paso a paso en `README-DESPLIEGUE.md`.

---

## R7 · Brecha de seguridad 🟧 10

**La norma.** Art. 32 RGPD (medidas técnicas y organizativas) y art. 33 (notificación en 72 h).
Aquí conviven dos cosas sensibles: una lista de afinidad política y una tabla con DNI.

**Factores agravantes**
- Los datos de donación incluyen DNI en claro, y tienen que estar así: es lo que va en el
  certificado fiscal y en la rendición al Tribunal de Cuentas. Seudonimizarlos los dejaría
  inservibles.
- Un solo token de administración da acceso a toda la lista.
- Los contadores del límite por IP viven en memoria y se reinician en cada despliegue.
- El runtime de la maqueta obliga a `unsafe-eval` en la política de seguridad de contenidos
  (ver R12).

**Factores atenuantes**
- Todo cifrado en tránsito, HSTS sobre HTTPS, y base de datos cifrada en reposo.
- Los secretos van en variables de entorno; ninguno está en el repositorio, y hay una prueba
  automática que comprueba que el IBAN no aparece escrito a mano fuera de la configuración.
- Los enlaces de confirmación y de baja se guardan **solo como hash**: un volcado robado de la base
  de datos no contiene ni un enlace utilizable.
- El token de baja se deriva por HMAC del secreto y del identificador, así que no se puede
  reconstruir desde la base de datos.
- El token de administración se compara en **tiempo constante**.
- No se escriben datos personales en los registros del servidor: solo códigos de error.
- Del formulario de donación **no se guarda la IP**: la declaración va casada con un apunte bancario
  a nombre de la misma persona, que es mejor prueba, así que la IP sería un dato de más.
- La IP de la prueba de consentimiento se borra automáticamente a los 12 meses.
- Minimización en el camino del dato: el nombre, el DNI y el importe **no salen** de nuestra
  infraestructura. No pasan por Brevo ni por ningún tercero, porque las donaciones no generan
  ningún correo.
- Superficie mínima: un proceso, un puerto, una dependencia (`pg`), sin CORS abierto.

**Opciones de mitigación pendientes**

| Opción | Coste | Efectividad |
|---|---|---|
| **Contrato de encargado del tratamiento con Brevo y con Railway** (art. 28) | ~2 h | Obligatorio, no opcional | ⬜ |
| Rotación del token de administración tras la campaña | Nulo | Media | ⬜ |
| Copia de seguridad cifrada y probada de la tabla de donaciones | ~2 h | Alta: aquí borrar de más es incumplir | ⬜ |
| Procedimiento escrito de notificación en 72 h | ~1 h | Alta si pasa | ⬜ |

**Riesgo residual.** **10 🟧** hasta firmar los contratos del art. 28. Después, 5 × 1 = **5 🟨**.

**Quién lo vigila.** Persona responsable de la web.

---

## R8 · Comunicaciones sin consentimiento o sin baja 🟨 6

Art. 21 LSSI. Baja de 9 a 6: hay doble opt-in real, enlace de baja en todos los correos, cabecera
`List-Unsubscribe` (RFC 8058) para el botón del propio cliente de correo, y un techo global de 200
correos/hora que impide convertir esto en un cañón de envíos. La baja borra de verdad.

Lo que falta: que nadie del equipo exporte el CSV y lo pegue en el «Para» de un correo. Es
organizativo. Pendiente: escribir la regla en el README del panel.

---

## R9 · Publicar sin aviso legal completo 🟩 4

Art. 10 LSSI. Baja de 8 a 4: las tres páginas legales existen, están enlazadas desde el pie de
todas las secciones, y hay una prueba automática que comprueba los tres enlaces.

El bloqueo por huecos sin rellenar **está implementado y funcionando**: mientras la política
contenga `PENDIENTE:`, el backend se niega a aceptar altas y responde con una dirección de correo.
Cada página legal lleva además, al principio, la lista de lo que falta.

El **NIF ya está puesto y validado** (G78269206), y el arranque comprueba además que las páginas
legales lo publican y que quien figura como responsable es la persona jurídica correcta. Siguen
faltando el domicilio social, los datos de inscripción registral y el contacto del delegado de
protección de datos. Eso es lo que mantiene el riesgo por encima de cero.

---

## R10 · Entidad responsable mal identificada 🟩 4 · antes 🟥 16 · CERRADO

**Qué era.** La cuenta de donaciones figura a nombre de Izquierda Unida Región de Murcia y el aviso
lo recogía una web que declaraba como responsable a Izquierda Unida de Águilas. Parecían dos
entidades, y por el formulario circulaban nombre, apellidos y DNI de una a otra sin que estuviera
escrito con qué título. Se puntuó en 16 porque, de ser dos personas jurídicas, ocurriría en cada
donación.

**Cómo se cerró, y por qué se cuenta el recorrido entero.** Se cerró dos veces, y la primera fue
prematura. Merece quedar escrito, porque es el modo de fallo más fácil de repetir: dar por bueno un
dato que encaja y no contrastarlo.

| | Qué se supo | Qué se concluyó |
|---|---|---|
| Primero | El NIF `G78269206`. El bloque 78 es de ámbito estatal, no provincial | Una sola persona jurídica. R10 cerrado |
| Después | La política de la propia organización: *«somos varias entidades jurídicas las responsables del tratamiento»*, con IU-RM enumerada | Contradicción. **R10 reabierto en naranja** |
| Por fin | El Registro de Partidos Políticos: **IU-RM no está inscrita como entidad propia**; Izquierda Unida sí, desde el 2 de noviembre de 1992 | Una sola persona jurídica, ahora sí acreditada. **R10 cerrado** |

La lección operativa, y por eso está en el documento y no solo en el historial: el primer cierre se
apoyaba en una inferencia razonable —el bloque del CIF— y en lo que alguien recordaba. El cierre
bueno se apoya en un registro público. Cuando lo que está en juego es a quién se identifica como
responsable en un documento legal, la diferencia importa.

**Qué se corrigió por el camino.** Las dos correcciones resultaron ser buenas en cualquiera de los
escenarios, así que se hicieron antes de tener la confirmación:

1. **El responsable estaba mal declarado.** La política nombraba a «Izquierda Unida de Águilas»,
   que no es una persona jurídica y por tanto no puede responder de nada. Un consentimiento
   recogido bajo esa declaración habría sido un consentimiento mal informado.
2. **La casilla de cesión pedía permiso para algo que no era una cesión.** Decía «consiento que mis
   datos se comuniquen a Izquierda Unida y al Partido Comunista de España». La primera mitad no era
   una cesión —es el propio responsable— y, al ir agrupada con la segunda, tapaba la única
   comunicación que sí lo es. Ahora pregunta **solo por el Partido Comunista de España**.

Cambiar el literal de una casilla obliga a subir la versión de la política, y así se hizo:
`privacidad-2026-09-03`. El apartado de cambios de la propia política lo cuenta a la vista de
cualquiera. No había consentimientos anteriores que remediar, porque el formulario nunca ha llegado
a aceptar altas.

**Una cosa que apareció de paso y se ha publicado en vez de disimularla.** El domicilio que consta
en el Registro —Avenida de la Albufera 9— **no es el que la organización publica hoy**, que es Calle
Villablanca 53-55. Lo más probable es que el asiento registral esté sin actualizar desde 1992. El
aviso legal publica las dos, cada una con su etiqueta, y dice cuál usar para escribir. Actualizar el
Registro es asunto de la organización estatal, no de Águilas.

**Qué impide que vuelva a pasar**

| Control | Qué hace |
|---|---|
| `config.responsable` en `src/config.js` | Única fuente de la denominación, el NIF, las tres direcciones, la inscripción y el contacto del delegado. |
| Validación del dígito de control del NIF al arrancar | Un NIF mal copiado no llega a publicarse. |
| Comprobación de que las páginas legales publican ese NIF | El aviso legal y la política no pueden quedarse con otro. |
| Comprobación de quién figura en la casilla «Responsable» | Si alguien vuelve a poner ahí a la asamblea local, el arranque lo rechaza. |
| Comprobación de que hay al menos una dirección | Sin dirección no se puede llegar al responsable, y no se publica. |
| Prueba sobre el bloque del NIF | Falla si pasa a ser provincial: sería señal de que se ha confundido la entidad. |
| Prueba sobre la casilla de cesión | Falla si vuelve a pedirse permiso para comunicar los datos al propio responsable. |
| Prueba sobre la inscripción publicada | Falla si el aviso legal deja de nombrar el Registro o la fecha. |

**Lo que ningún control puede hacer.** Detectar que un NIF válido pertenece a otra entidad. Eso solo
lo resuelve preguntar, y es exactamente lo que pasó aquí.

**Riesgo residual.** 4 × 1 = **4 🟩**.

**Quién lo vigila.** El banco de pruebas, con ocho controles. Solo hay que volver a mirarlo si
Izquierda Unida cambia de NIF o de domicilio registral, o cuando la coalición se constituya ante la
Junta Electoral con la convocatoria, que es cuando aparecerá una entidad nueva. Ver R6.

---

## R11 · Donación de quien tiene contrato con el sector público 🟨 8 · NUEVO

Art. 5.1 LO 8/2007. La web no tiene forma de comprobarlo: la declaración responsable es la única
barrera, y va en su casilla propia con el literal guardado como prueba.

En un municipio de 35.000 habitantes esto no es abstracto: quien tiene la contrata de jardinería o
la de limpieza es identificable, y una donación suya sería noticia. La mitigación real es que quien
revise los ingresos conozca el municipio y mire los nombres.

**Riesgo residual:** 8 🟨. Baja a 4 si la revisión de ingresos se contrasta con el perfil del
contratante municipal, que es público.

---

## R12 · `unsafe-eval` en la política de seguridad de contenidos 🟨 8 · NUEVO

`index.html` está construido con el runtime de Claude Design, que compila su bloque de lógica con
`new Function()`. Eso obliga a mantener `script-src 'unsafe-eval'`, lo que debilita la defensa
contra XSS justo en la página que contiene los dos formularios.

**Atenuantes:** no se usa `unsafe-inline` —los dos scripts en línea van por hash calculado del HTML
real, así que un script inyectado no se ejecuta—; `object-src` y `base-uri` a `'none'`;
`form-action 'self'`, que impide redirigir el envío a un tercero; y las páginas legales, que no
llevan runtime, se sirven con una política estrictamente más dura.

**Mitigación pendiente:** compilar la maqueta a HTML/JS estático antes de publicar en dominio
propio y quitar `unsafe-eval`. Coste: medio. Efectividad: alta. Riesgo residual: 4 🟩.

---

## R13 · Certificados fiscales prometidos y no emitidos 🟨 6 · NUEVO

La web dice que la donación desgrava el 20 % sobre una base máxima de 600 € y que hace falta un
certificado emitido por la formación. Si alguien dona y el certificado no llega a tiempo para la
campaña de renta, no hay sanción, pero sí una promesa incumplida a quien puso dinero.

**Mitigación:** procedimiento anual de emisión de certificados, acordado con la federación, y
recordatorio en el calendario antes de cada campaña de renta. La copy ya advierte de que sin
certificado no hay deducción, en vez de dar la deducción por hecha.

---

## Lo que bloquea la publicación

**Los datos y los documentos están todos.** Lo que queda son tres decisiones y una configuración.

1. **Poner un nombre** a la revisión semanal del extracto. El procedimiento está escrito paso a paso
   en `PROTOCOLO-INGRESOS.md`, con qué mirar, qué devolver y en qué plazo. Falta quién lo hace.
   Cierra la mitad humana de R1 y R2.
2. **Firmar los dos contratos** de encargado del tratamiento (art. 28 RGPD) con Brevo y con Railway.
   Los dos publican su contrato tipo; es aceptarlo desde el panel de cada uno y guardar copia.
3. **Meter en el calendario** la conmutación a régimen electoral, para el día de la convocatoria.
4. **Configurar el despliegue**: variables de entorno en Railway y dominio verificado en Brevo con
   SPF, DKIM y DMARC.

Cerrados hasta aquí: **R10** con el Registro de Partidos; la **dirección de contacto**, el
**delegado de protección de datos**, el **domicilio social** y la **inscripción registral**, con lo
que las páginas legales quedaron sin huecos; el **registro de actividades del art. 30**
(`REGISTRO-TRATAMIENTOS.md`), que cerró la última pieza formal de R3; y el **protocolo de ingresos y
devoluciones** (`PROTOCOLO-INGRESOS.md`).

Sobre el delegado de protección de datos, un apunte práctico que cambia con el hallazgo de R10:
como el responsable es Izquierda Unida a escala estatal, y un partido que trata opiniones políticas
a gran escala está obligado a designarlo (art. 37 RGPD y art. 34 LOPDGDD), lo más probable es que
**ya exista** y que baste con pedirle su contacto a la organización estatal. No hay que nombrar a
nadie desde Águilas.

---

*Este análisis lo ha preparado una herramienta de IA, no es asesoramiento jurídico, y antes de
publicar en dominio propio debe revisarlo una persona con experiencia en LOPDGDD y en financiación
de partidos.*
