# Registro de actividades del tratamiento

Artículo 30 del Reglamento General de Protección de Datos.

Este documento **no se publica**: es el registro interno que hay que poder enseñar si la Agencia
Española de Protección de Datos lo pide. Lo que se publica es la política de privacidad, que cuenta
lo mismo en otro tono y para otro público.

| | |
|---|---|
| Responsable | **Izquierda Unida** |
| NIF | G78269206 |
| Domicilio social | Avenida de la Albufera, 9 · Madrid (Registro de Partidos Políticos, inscripción de 2 de noviembre de 1992) |
| Sede federal | Calle Villablanca, 53-55 · 28032 Madrid |
| Establecimiento desde el que se opera | Calle Echegaray, 3, bajo A · Águilas (Murcia) |
| Delegado de protección de datos | dpd@izquierdaunida.org · Calle Villablanca 53-55, 28032 Madrid |
| Ámbito de este registro | La web de la candidatura Por Águilas: `poraguilas.es` |
| Versión | 1 · 2 de septiembre de 2026 |

> **Alcance.** Este registro cubre solo los tratamientos de esta web. Izquierda Unida tendrá los
> suyos para la militancia, la contabilidad y el resto de su actividad; esto se suma a aquellos, no
> los sustituye. Si la organización estatal mantiene un registro central, hay que integrar estas
> tres fichas en él y decírselo al delegado de protección de datos.

---

## Tratamiento 1 · Lista de contacto de la candidatura («Súmate»)

**Fin del tratamiento.** Informar a quien lo pide sobre la candidatura Por Águilas: convocatorias de
asamblea, actos, programa y campaña. Organizar la colaboración de quien se ofrece a echar una mano.
Contestar los mensajes que se escriben en el formulario.

**Categorías de interesados.** Personas mayores de edad que rellenan voluntariamente el formulario
de la web. No hay ninguna otra vía de entrada: no se compran listas, no se importan contactos y no
se recogen datos de redes sociales ni de fuentes públicas.

**Categorías de datos.**

| Dato | ¿Obligatorio? | Observaciones |
|---|---|---|
| Nombre | Sí | |
| Correo electrónico | Sí | Identifica el alta. Es la clave única. |
| Zona del municipio | No | Lista cerrada de doce zonas. **No se pide la dirección.** |
| Cómo quiere colaborar | No | Lista cerrada de seis opciones. |
| Teléfono | No | **Solo se recoge y se conserva si marca la casilla de colaborar.** Al retirar ese consentimiento se borra. |
| Mensaje libre | No | Se advierte de que no hace falta contar nada sobre salud ni situación personal. |
| Prueba del consentimiento | Se genera | Marca temporal, finalidad, literal exacto de la casilla, versión de la política e IP. Una fila por casilla marcada. |

**Categoría especial de datos.** Sí. Apuntarse a una candidatura revela una **opinión política**,
que es categoría especial del art. 9.1 RGPD. Todo este tratamiento se diseña alrededor de ese hecho.

**Base jurídica.** Consentimiento explícito: arts. **6.1.a** y **9.2.a** RGPD. No se invoca ninguna
excepción para partidos políticos; la que existía en el art. 58 bis.1 LOREG fue anulada por la
**STC 76/2019**.

Se recoge en cuatro casillas separadas, ninguna premarcada y ninguna que agrupe dos finalidades:

| Casilla | ¿Obligatoria? | Qué autoriza |
|---|---|---|
| `consiente_info` | Sí | El tratamiento y el envío de información. Sin ella no hay alta. |
| `consiente_colaborar` | No | Que se le contacte para organizar la colaboración, y el tratamiento del teléfono. |
| `consiente_cesion` | No | La comunicación de sus datos al Partido Comunista de España. |
| `mayor_edad` | Sí | Declaración de mayoría de edad. |

**Categorías de destinatarios.**

| Quién | Qué recibe | Condición |
|---|---|---|
| Partido Comunista de España | Los datos del alta | **Solo si marca `consiente_cesion`.** Es la única cesión real: IU-RM e IU de Águilas son órganos del propio responsable. |
| Brevo (Sendinblue SAS) — encargado | **Solo la dirección de correo y el enlace.** Ni nombre, ni zona, ni mensaje | Siempre, para poder enviar |
| Railway Corp. — encargado | Alojamiento de la web y de la base de datos | Siempre |

**Transferencias internacionales.** Railway Corp. es estadounidense con servidores en la Unión
Europea; la transferencia se ampara en las **cláusulas contractuales tipo** aprobadas por la
Comisión Europea. Brevo es francesa: no hay transferencia.

**Plazos de supresión.**

| Situación | Plazo | ¿Automático? |
|---|---|---|
| Alta sin confirmar | 30 días | Sí |
| Baja o supresión a petición | Inmediato, y es borrado real: no queda fila marcada | Sí |
| IP de la prueba de consentimiento | 12 meses | Sí |
| Todo lo demás | Hasta el 30 de noviembre de 2027, seis meses después de la jornada electoral | Sí |

**Medidas de seguridad.** Cifrado en tránsito (HTTPS con HSTS) y base de datos cifrada en reposo.
Doble opt-in obligatorio: sin confirmar desde el propio correo no hay alta. Los enlaces de
confirmación y de baja se guardan **solo como hash**, y el de baja se deriva por HMAC de un secreto
que vive en variables de entorno, así que un volcado de la base de datos no contiene ni un enlace
utilizable. Acceso al listado con credencial única comparada en tiempo constante, no publicada en
ninguna parte de la web. No se escriben datos personales en los registros técnicos del servidor.
Limitación de peticiones por IP, guardando el HMAC de la IP y no la IP. Sin cookies, sin analítica y
sin ningún recurso de terceros, comprobado por una prueba automática en cada cambio.

---

## Tratamiento 2 · Comunicaciones de donación

**Fin del tratamiento.** Identificar a quien dona, tal como obliga la **Ley Orgánica 8/2007** de
financiación de los partidos políticos, para poder casar cada ingreso con una persona; emitir el
certificado que permite aplicar la deducción del IRPF; y rendir cuentas de las donaciones ante quien
la ley diga.

**Categorías de interesados.** Personas físicas mayores de edad que avisan de que van a hacer una
transferencia. **Esta web no cobra**: no hay pasarela de pago, no se pide ningún dato bancario del
donante y no se mueve dinero. Lo que se recoge es la comunicación previa.

**Categorías de datos.** Nombre, apellidos, **DNI o NIE**, correo electrónico, importe, fecha
prevista del ingreso, el concepto de transferencia generado, y la prueba de las cinco declaraciones
responsables (marca temporal, literal exacto de cada casilla y versión de la política).

**Dato especialmente sensible.** El DNI se conserva **en claro**, y tiene que ser así: es lo que va
en el certificado fiscal y lo que se rinde al Tribunal de Cuentas. Seudonimizarlo lo dejaría
inservible. La protección es de otro orden, no el disfraz del dato.

**Base jurídica.** **Obligación legal**, art. **6.1.c** RGPD: LO 8/2007 y normativa fiscal y
contable. **No es consentimiento**, y por eso el interesado no puede retirarlo ni exigir la
supresión mientras dure el plazo legal. La política de privacidad lo explica en esos términos.

**Categorías de destinatarios.** Tribunal de Cuentas (fiscalización de la contabilidad de los
partidos; además, notificación en tres meses de las donaciones superiores a 25.000 €, art. 5.4 LO
8/2007). Agencia Tributaria (certificado y deducción). La entidad bancaria por la que pasa la
transferencia. Railway Corp. como encargado del alojamiento.

**Lo que no ocurre, y conviene que conste.** Estos datos **no salen hacia ningún proveedor de
correo**: el tratamiento no genera ningún envío automático, así que el nombre, el DNI y el importe
no pasan por Brevo ni por ningún tercero. El concepto se enseña en pantalla y el equipo lo consulta
en el panel.

**Transferencias internacionales.** Las mismas que el tratamiento 1, y por la misma vía: Railway,
cláusulas contractuales tipo.

**Plazos de supresión.**

| Situación | Plazo | ¿Automático? |
|---|---|---|
| Aviso que nunca llegó a ingresarse | Se elimina al comprobar que no hubo transferencia | **No.** Manual, en la revisión de ingresos |
| Donación efectivamente ingresada | **Mínimo cuatro años** desde el cierre del ejercicio, y hasta que el Tribunal de Cuentas dé por fiscalizado el ejercicio | **No.** Manual |

> **Por qué no es automático, y es a propósito.** La purga que borra la lista de Súmate **no toca**
> la tabla de donaciones. Un borrado automático de datos que la ley obliga a conservar sería un
> fallo, no una garantía. Se revisa a mano cuando toca y se deja constancia de haberlo hecho.

**Medidas de seguridad.** Las del tratamiento 1, más dos decisiones propias: **no se guarda la IP**
—la declaración va casada con un apunte bancario a nombre de la misma persona, que es mejor prueba,
así que la IP sería un dato de más— y los datos **no salen de la propia infraestructura**. La
validación del documento de identidad rechaza por construcción los NIF de persona jurídica, lo que
impide que el formulario registre una donación prohibida por el art. 5.1.a.

---

## Tratamiento 3 · Atención de los derechos de las personas

**Fin del tratamiento.** Atender las solicitudes de acceso, rectificación, supresión, oposición,
limitación y portabilidad, y la retirada del consentimiento.

**Categorías de interesados.** Cualquiera que escriba ejerciendo un derecho, esté o no en la lista.

**Categorías de datos.** La dirección de correo desde la que se escribe y lo que la persona cuente.
Para el borrado autoservicio, solo la dirección: el sistema manda un enlace en vez de borrar al
vuelo, porque borrar con solo recibir una dirección permitiría a cualquiera eliminar los datos de
otra persona.

**Base jurídica.** **Obligación legal**, art. 6.1.c RGPD, en relación con los arts. 15 a 22 del
propio Reglamento.

**Destinatarios.** Ninguno, salvo que la solicitud haya de trasladarse al delegado de protección de
datos.

**Plazo.** Lo que dure la tramitación, más el tiempo necesario para poder acreditar que se atendió.
Se responde en un mes como máximo.

**Medidas.** Las del tratamiento 1. La vía más rápida —el enlace de baja de cualquier correo— no
requiere escribir a nadie ni esperar respuesta, que es lo que exige que retirar el consentimiento
sea tan fácil como darlo.

---

## Qué hacer cuando esto cambie

Este registro se actualiza **antes**, no después:

- Si se añade un campo al formulario, entra aquí y en el epígrafe «Qué datos tratamos» de la
  política. Hay una prueba automática que falla si el formulario recoge algo que la política no
  declara.
- Si cambia una finalidad, un destinatario o un plazo, sube la versión de la política
  (`VERSION_POLITICA` en `src/config.js` y el `<meta>` de `legal/privacidad.html`, que el arranque
  comprueba que coincidan) y **se vuelve a pedir el consentimiento** si el cambio es sustancial.
- **El día de la convocatoria electoral** aparece un tratamiento nuevo: la cuenta electoral y las
  aportaciones bajo régimen LOREG, con el administrador electoral como figura responsable. Hay que
  añadir su ficha aquí. Ver el apartado de conmutación de `README-DESPLIEGUE.md`.

---

*Documento interno preparado con ayuda de una herramienta de IA. No es asesoramiento jurídico:
antes de darlo por bueno debe revisarlo una persona con experiencia en protección de datos, y
conviene que lo vea el delegado de protección de datos de la organización.*
