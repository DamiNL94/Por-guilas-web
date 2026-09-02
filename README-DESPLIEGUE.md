# Despliegue y operación

Web de **Por Águilas**. Un solo proceso Node sirve el sitio estático y, debajo, la API de «Súmate»
y la de comunicaciones de donación. Una sola dependencia (`pg`).

```bash
npm install && npm test
```

```bash
node scripts/compilar.js && node server.js
```

> **Lo que se publica no es `index.html`.** El equipo lo sigue editando —es la fuente, con su editor
> visual— pero lo que sale a Internet son las seis páginas de `publico/`, que genera
> `scripts/compilar.js`. Así no hace falta ningún runtime en el navegador, la política de seguridad
> puede decir `script-src 'self'` a secas, y quien no ejecute JavaScript recibe la página entera en
> vez de una plantilla sin resolver.
>
> **Después de tocar `index.html` hay que volver a compilar.** Si se olvida, el arranque avisa y
> `npm test` falla: el build guarda la huella del index con el que se hizo.

---

## 1. Variables de entorno

En local se leen de un fichero `.env` en la raíz (lo carga `server.js`, sin librerías). En Railway
se crean en el panel del servicio. **Lo que ya venga en el entorno nunca se pisa**, así que en
producción manda siempre el panel. `.env` está en `.gitignore` y no se sube jamás.

Punto de partida: `cp .env.example .env`.

| Variable | Obligatoria | Qué es |
|---|:--:|---|
| `DATABASE_URL` | ✅ | La pone sola el plugin de Postgres de Railway. |
| `ADMIN_TOKEN` | ✅ | Credencial del panel del equipo. Mínimo 32 caracteres aleatorios. |
| `SECRETO_HMAC` | ✅ | Del que se derivan los enlaces de baja. Mínimo 32 caracteres. |
| `URL_BASE` | ✅ | Dirección pública del sitio, sin barra final. Base de los enlaces de los correos. |
| `BREVO_API_KEY` | ✅ (o consola) | Clave de la API de Brevo para el correo transaccional. |
| `REMITENTE` | | Dirección **de un dominio propio verificado**. Por defecto `no-responder@por-aguilas.es`. **No puede ser de Gmail, Outlook ni similar**: su política DMARC haría que los correos de confirmación se rechacen o acaben en spam, y sin confirmar no hay alta. El arranque lo rechaza. |
| `REMITENTE_NOMBRE` | | Por defecto `Por Águilas`. |
| `RESPUESTA_A` | | Buzón que lee alguien de verdad. Por defecto `admin@por-aguilas.es`. |
| `CORREO_EN_CONSOLA` | | `1` imprime los correos en vez de enviarlos. **Solo local.** |
| `FECHA_PURGA_TOTAL` | | Borrado total de la lista. Por defecto `2027-11-30`. |
| `RUTA_LEGAL` | | Solo para pruebas. Apunta a una carpeta con copias de las páginas legales. No relaja ningún control. |

Generar los dos secretos:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

> **`SECRETO_HMAC` no se rota.** Si cambia, **todos** los enlaces de baja repartidos hasta ese
> momento dejan de funcionar y la gente se queda sin poder borrarse por su cuenta. Solo se cambia
> por un motivo de seguridad de peso, y avisando por correo a la lista.

---

## 2. Comprobar que está en marcha

El backend se autoevalúa al arrancar y **no acepta ni un dato** si algo falta. Lo dice en los logs
y en un endpoint sin secretos:

```bash
curl -s https://por-aguilas.es/api/salud
```

Devuelve `200` con `altasAbiertas: true` cuando todo está listo, o `503` con la lista exacta de lo
que falta. Mientras esté en `503`, los dos formularios responden con una dirección de correo en vez
de fingir que han guardado algo.

Lo que comprueba al arrancar:

- Que `legal/privacidad.html` existe y **no contiene ningún hueco `PENDIENTE:`**.
- Que la versión que declara la política publicada coincide con la que espera el backend.
- Que el NIF de `config.responsable` pasa su dígito de control.
- Que hay al menos una dirección del responsable.
- Que el aviso legal y la política publican ese mismo NIF.
- Que quien figura como responsable en las páginas legales es la persona jurídica que dice el
  código, y no un órgano suyo sin personalidad propia.
- Que el IBAN de `config.donaciones` pasa el dígito de control (mod-97 del ISO 13616 **y** los dos
  dígitos del CCC español).
- Que el régimen activo no tiene huecos sin rellenar.
- Que el bloque `pa-donaciones` de `index.html` coincide con `config.donaciones`.
- Que el `REMITENTE` no es una dirección de Gmail, Outlook o similar.
- Que están las tres variables obligatorias y que los secretos tienen longitud suficiente.

---

## 3. Antes de publicar en dominio propio

Nada de esto es opcional. El detalle y el porqué de cada punto está en `RIESGOS-LEGALES.md`.

### 3.1. Bloqueantes que el propio sistema impide saltarse

**Ninguno pendiente.** Desde el 2 de septiembre de 2026 las páginas legales están completas y el
arranque no bloquea por ningún motivo legal. Lo que comprueba, y seguirá comprobando en cada
despliegue:

| Dato | Valor publicado |
|---|---|
| Responsable | Izquierda Unida |
| NIF | `G78269206` — validado por su dígito de control |
| Domicilio social | Avenida de la Albufera, 9 · Madrid — el del Registro de Partidos |
| Sede federal | Calle Villablanca, 53-55 · 28032 Madrid — donde está hoy la organización |
| Establecimiento en Águilas | Calle Echegaray, 3, bajo A · Águilas (Murcia) |
| Inscripción | Registro de Partidos Políticos, 2 de noviembre de 1992 |
| Delegado de protección de datos | `dpd@izquierdaunida.org` |
| Versión de la política | `privacidad-2026-09-05` |
| Correo de contacto | `admin@por-aguilas.es` |
| Dominio | `por-aguilas.es` — **con guion**. El código lo asumía sin él hasta el 2 de septiembre de 2026 |

> **Las dos direcciones de Madrid no coinciden, y es a propósito.** La del Registro consta desde la
> inscripción de 1992; la de Villablanca es donde está hoy la organización y la que ella misma
> publica. Se publican las dos, cada una con su etiqueta. Que el asiento registral esté sin
> actualizar es asunto de la organización estatal, no de Águilas, pero mientras lo esté lo honesto
> es enseñar las dos.

Si alguien reintroduce un hueco `PENDIENTE:` al editar los textos, el arranque vuelve a bloquear y
dice cuál es. Hay una prueba que mete un hueco de mentira en una copia para comprobar que el
detector sigue vivo.

### 3.2. Bloqueantes que ningún código puede comprobar

| # | Qué falta | Quién |
|---|---|---|
| 1 | **Contrato de encargado del tratamiento (art. 28 RGPD) con Brevo** (Sendinblue SAS, Francia) | Protección de datos |
| 2 | **Contrato de encargado del tratamiento (art. 28 RGPD) con Railway** (EE. UU., servidores en la UE, cláusulas contractuales tipo) | Protección de datos |
| 3 | Verificar el dominio en Brevo con SPF, DKIM y DMARC en el DNS | Web |
| 4 | Confirmar que `admin@por-aguilas.es` existe y que lo lee alguien | Secretaría |
| 5 | **Asignar quién revisa cada ingreso contra el extracto**, semanalmente. El procedimiento está escrito en `PROTOCOLO-INGRESOS.md`; falta el nombre (riesgos R1, R2 y R11) | Tesorería |
| 6 | Confirmar si la cuenta es de uso exclusivo de donaciones y está comunicada al Tribunal de Cuentas (art. 8 LO 8/2007) | Federación |
| 7 | Meter en el calendario la conmutación a régimen electoral (apartado 6) | Web |
| 8 | Consultar con la organización estatal cómo se lleva el acumulado por donante y año: al ser una sola persona jurídica, el tope de 50.000 € se cuenta sobre todo lo que reciba Izquierda Unida de esa persona en el país, no solo sobre lo de Águilas (riesgo R5) | Tesorería |

### 3.2.bis Ya hechos

| Documento | Qué cierra |
|---|---|
| `REGISTRO-TRATAMIENTOS.md` | Registro de actividades del art. 30 RGPD, con una ficha por tratamiento: lista de Súmate, comunicaciones de donación y atención de derechos. Cerró la última pieza formal de R3, que baja de 10 🟧 a 5 🟨. **No se publica**: es interno, para enseñarlo si lo pide la AEPD. |
| `PROTOCOLO-INGRESOS.md` | Qué mirar cada semana en el extracto, qué devolver y en qué plazo. Cierra el protocolo de devolución de R1 y R2. Falta asignarle una persona. |

### 3.2.ter Qué se enseña de las reglas de financiación, y dónde

La sección de donaciones tenía un cartel con las siete reglas de la LO 8/2007. Se quitó el 2 de
septiembre de 2026: cuatro estaban dichas dos veces y la página parecía un prospecto. Los tres
avisos que el encargo pedía **siguen visibles**, cada uno donde sirve:

| Aviso | Dónde está ahora |
|---|---|
| Límite de 50.000 €/año | Pista del campo «importe», donde se escribe la cifra |
| No finalista **ni revocable** | Justo debajo de los datos de la cuenta, antes de transferir |
| Deducción del 20 % hasta 600 € | Junto al formulario, en positivo: es una razón para donar, no una advertencia |

Lo demás —personas jurídicas, anónimas, contratos con el sector público, gobiernos extranjeros,
notificación al Tribunal de Cuentas— vive en dos sitios mejores: las que afectan a quien dona son
**las cinco declaraciones que hay que marcar**, y el detalle completo está en el **aviso legal**,
que es donde se busca. Si alguien vuelve a añadir un cartel, que sepa que esto ya se decidió.

### 3.3. Recomendable antes de publicar


- Sustituir las notas de prensa y los eventos de ejemplo, y quitar la barra de «borrador de
  trabajo».
- Copia de seguridad cifrada y **probada** de la tabla `donaciones`: es la única que no se puede
  reconstruir y la única que la ley obliga a conservar.

---

## 4. Quién responde, y por qué está en un solo sitio

Hay **una sola persona jurídica** detrás de todo esto:

| | |
|---|---|
| Responsable | **Izquierda Unida** · NIF `G78269206` |
| Inscripción | Registro de Partidos Políticos, 2 de noviembre de 1992 |
| Federación de Murcia | **No está inscrita como entidad propia.** Comprobado en el Registro. |
| Delegado de protección de datos | `dpd@izquierdaunida.org` · Calle Villablanca 53-55, 28032 Madrid |
| Dirección de contacto | Calle Echegaray, 3, bajo A · Águilas (Murcia) |
| Candidatura | Por Águilas — **sin inscribir todavía**, sin personalidad jurídica. Por eso el titular de la web es IU. |
| Federación regional | Izquierda Unida Región de Murcia — **órgano**, mismo NIF |
| Asamblea local | Izquierda Unida de Águilas — **órgano**, mismo NIF |
| Partido Comunista de España | Impulsa la candidatura, pero **no recibe ningún dato**: la casilla que lo permitía se retiró |

### Cómo se nombra a IU y al PCE de cara al público

La regla, decidida el 2 de septiembre de 2026: **la candidatura por delante, las siglas solo donde
la ley las exige.** Quien entra en la web se está acercando a Por Águilas, no a un partido, y el
texto tiene que reflejar eso.

| Dónde | Qué se hace | Por qué |
|---|---|---|
| Portada, pie, entradilla de Súmate | **Sin siglas.** El pie remite a «Quiénes somos» | Es copy, no obligación |
| «Quiénes somos» → «Por qué una marca propia» | **Se dice con todas las letras** | La sección existe para explicar la relación. Quitarlo ahí sería lo único que un adversario podría capturar como ocultación, y hace más daño que la vinculación que evita |
| Casilla `consiente_info` | Se nombra a Izquierda Unida, **en segundo lugar** tras la candidatura | Art. 13.1.a RGPD: el dato es de categoría especial y el consentimiento tiene que ser informado en el momento de marcar, no en un enlace |
| Casilla de cesión al PCE | **Retirada el 4 de septiembre de 2026** | Sin consentimiento no hay comunicación. Ya no existe ninguna vía por la que la lista salga hacia otra organización: ni la casilla, ni la columna, ni el destinatario en la política. Recuperarla exigiría preguntar de nuevo a cada persona |
| Titular junto al IBAN | Izquierda Unida Región de Murcia | Es lo que el donante ve en su banco. Si no coincide, el ingreso no se puede casar (riesgo R2) |
| Aviso legal y política de privacidad | Identificación completa | Arts. 10 LSSI y 13.1.a RGPD |

Si alguien quiere ir más allá, el límite está en las cuatro últimas filas: son lo estrictamente
legal y quitarlas no es desvincular, es incumplir.

Vive en `RESPONSABLE`, dentro de `src/config.js`, y de ahí salen el aviso legal, la política de
privacidad y los literales de las casillas de consentimiento. El arranque comprueba que las páginas
legales dicen lo mismo, así que no pueden desincronizarse en silencio.

Dos cosas que conviene no volver a mezclar:

1. **La asamblea local y la federación regional no responden de nada.** Son órganos. Si alguien
   vuelve a ponerlas en la casilla «Responsable» de una página legal, el arranque lo rechaza.
2. **Ya no hay ninguna cesión.** Mover datos entre órganos de Izquierda Unida no lo es —es el mismo
   responsable— y la única que sí lo era, la comunicación al PCE, se retiró el 4 de septiembre de
   2026 junto con su casilla y su columna. Hay una prueba automática que falla si alguien
   reintroduce la casilla, el campo o un consentimiento que se guarde sin haberse preguntado.

Si cambia cualquiera de estos datos hay que **subir la versión de la política** (`VERSION_POLITICA`)
y actualizar el `<meta name="pa-version-politica">` de `legal/privacidad.html`. Si no coinciden, el
backend se niega a arrancar: guardar un consentimiento que apunte a un texto distinto del que la
persona leyó no vale nada como prueba.

---

## 5. La configuración de donaciones

Todo lo que tiene efecto legal en las donaciones vive en **un solo objeto**: `DONACIONES`, en
`src/config.js`. El IBAN, el titular, el prefijo del concepto, el límite anual, el umbral de
notificación al Tribunal de Cuentas, la deducción del IRPF y los avisos que se publican.

De ahí salen, sin copiarse a mano en ningún sitio:

- Lo que valida el servidor.
- El bloque `<script id="pa-donaciones">` que el servidor inyecta en cada página que sirve.
- El literal que `index.html` lleva escrito, para que la web abierta con doble clic —sin servidor—
  siga enseñando el IBAN correcto.

Ese último es el único duplicado, y está atado por los dos extremos: se genera con un script y el
arranque aborta si deja de coincidir.

**Después de tocar `config.donaciones`, siempre:**

```bash
node scripts/sincronizar-donaciones.js && npm test
```

---

## 6. Conmutación a régimen electoral

> Se ejecuta **el mismo día** en que se publique el real decreto de convocatoria. Previsiblemente,
> abril de 2027. Ponerlo en el calendario del equipo hoy.

Mientras no haya convocatoria, la financiación es ordinaria y la rige la LO 8/2007. Desde la
convocatoria entra la LOREG y cambian tres cosas de golpe:

- El límite por aportante baja de **50.000 € a 10.000 €** (art. 129 LOREG).
- Los fondos tienen que entrar por la **cuenta electoral**, abierta y comunicada a la Junta
  Electoral de Zona **en 24 horas** (arts. 124 y 125). No es la cuenta actual.
- Quien responde ya no es la federación, sino el **administrador electoral** designado
  (arts. 121-123).

### Procedimiento

1. **Antes de la convocatoria**, tener designada a la persona administradora electoral. No se puede
   improvisar en 24 horas.
2. El día de la convocatoria, abrir la cuenta electoral y comunicarla a la Junta Electoral de Zona.
   Esto va primero: es lo que tiene plazo legal.
3. En `src/config.js`, buscar el comentario `CAMBIO A RÉGIMEN ELECTORAL` y:
   - poner `const REGIMEN = "electoral";`
   - rellenar en el bloque `electoral` el `titular`, el `iban` y el `administradorElectoral`.
4. Ejecutar `node scripts/sincronizar-donaciones.js`.
5. Ejecutar `npm test`. Falla si el IBAN nuevo tiene un dígito mal.
6. Desplegar y comprobar `GET /api/salud`.
7. Revisar el aviso legal: añadir la denominación registral de la coalición y el nombre de la
   persona administradora electoral.

**Modo de fallo, por si se hace a medias:** si se conmuta el régimen sin rellenar la cuenta, el
arranque detecta los huecos `PENDIENTE` y **cierra el formulario de donación** en vez de seguir
publicando el IBAN antiguo. Es lo correcto: mejor no recoger nada que recoger dinero en la cuenta
equivocada durante la campaña.

No hay que tocar `index.html` ni ningún texto legal para conmutar: los dos leen la configuración.

---

## 7. El panel del equipo

Protegido con `ADMIN_TOKEN` en la cabecera. No aparece en la web, ni en ninguna URL, ni en el
repositorio: una lista de afinidad política no puede quedar a un enlace de distancia.

```bash
curl -s -H "Authorization: Bearer $ADMIN_TOKEN" https://por-aguilas.es/api/admin/altas
```

| Ruta | Qué da |
|---|---|
| `/api/admin/altas?estado=confirmado\|pendiente\|todos` | Listado en JSON |
| `/api/admin/altas.csv?estado=…` | CSV para Excel (BOM y punto y coma) |
| `/api/admin/donaciones?estado=comunicada\|cobrada\|devuelta\|anulada\|todos` | Listado, suma y **acumulado por donante** |
| `/api/admin/donaciones.csv?estado=…` | CSV |

El listado de donaciones marca las que superan el umbral de notificación al Tribunal de Cuentas y
trae un apartado `vigilar` con quien lleva acumulado más de la mitad del límite anual.

> **Ese acumulado es parcial.** El límite de la LO 8/2007 se cuenta sobre todo lo que reciba el
> partido de esa persona en el año, no solo sobre lo que entre por Águilas. Antes de aceptar una
> donación grande, consultarlo con la federación.

**Reglas de uso del panel, que no las impone ningún código:**

- El CSV no se pega en el «Para» de un correo. Los envíos salen del sistema, con su enlace de baja.
- El token no se comparte por WhatsApp ni se escribe en ningún fichero del repositorio.
- El CSV descargado se borra del ordenador cuando se termina con él.

---

## 8. Conservación de datos

Los plazos de la política de privacidad están programados y se ejecutan solos, al arrancar y cada
seis horas:

| Qué | Cuándo | Cómo |
|---|---|---|
| Altas sin confirmar | 30 días | Automático |
| IP de la prueba de consentimiento | 12 meses | Automático (se anonimiza; el resto de la prueba se queda) |
| Baja o supresión a petición | En el momento | Borrado real, sin fila fantasma |
| Lista completa | `FECHA_PURGA_TOTAL` (30-11-2027) | Automático |
| **Donaciones** | **Mínimo 4 años** | **A mano. Nunca automático.** |

La tabla `donaciones` **no la toca la purga**, y es a propósito. Esos datos no se conservan por
consentimiento sino por obligación legal (art. 6.1.c RGPD): la LO 8/2007 y la normativa fiscal y
contable obligan a poder acreditar quién donó qué. Un borrado automático de datos que la ley obliga
a conservar sería un fallo, no una garantía.

Cuando venza el plazo, se borra a mano y se deja constancia de que se ha hecho.

---

## 9. Qué hacer si llega un ingreso raro

> El procedimiento completo, con plazos y con qué mirar del ordenante, está en
> **`PROTOCOLO-INGRESOS.md`**. Lo de aquí abajo es el resumen.

| Situación | Qué hacer |
|---|---|
| Ingreso sin concepto identificable | Buscar por importe y fecha en el panel de donaciones. Si no cuadra con ninguna comunicación previa: **devolver**. No dejarlo «a ver si alguien reclama». |
| Ingreso desde una cuenta de empresa | **Devolver.** Art. 5.1.a LO 8/2007: es nula. Marcar la comunicación como `devuelta`. |
| Donación por encima de 25.000 € | Notificarla al Tribunal de Cuentas **dentro de los tres meses siguientes** (art. 5.4). |
| Donante que se acerca al límite anual | Consultar el acumulado con la federación antes de aceptar. |
| Alguien pide que borremos su donación | No se puede mientras dure el plazo legal, y hay que explicárselo. Si el ingreso nunca llegó a hacerse, sí: sin ingreso no hay donación que rendir. |
| Alguien pide borrar sus datos de la lista | Enlace de baja de cualquier correo, o `/sumate/borrar`. Es un tratamiento distinto y sí depende de su permiso. |

---

## 10. Prohibiciones que no vuelven a discutirse

Están aquí para que quien retome esto dentro de un año no las reabra por descuido. Cada una tiene
detrás una norma, no una preferencia.

- **Sin pasarela de pago.** Ni tarjeta, ni Bizum, ni PayPal, ni Stripe, ni cripto. Solo
  transferencia.
- **Sin donaciones anónimas.** No existe ningún flujo sin identificación. Ninguno.
- **Sin personas jurídicas.** Ni campo de empresa, ni de CIF. La validación del documento las
  rechaza por construcción.
- **Sin donaciones finalistas.** No hay selector de destino, ni «dona para vivienda», ni barra de
  progreso de «llevamos X de Y». Art. 5.1.d LO 8/2007.
- **Sin carteles de reglas legales en la página pública.** El detalle va al aviso legal y las reglas
  que afectan a quien dona van en las casillas que hay que marcar. En la página quedan los tres
  avisos que hacen falta antes de transferir, y ni uno más.
- **Sin prometer devoluciones.** Las donaciones son irrevocables y la copy no puede sugerir lo
  contrario.
- **Sin donación recurrente.**
- **Sin analítica, sin píxeles, sin cookies, sin CAPTCHA de terceros.** La STC 76/2019 anuló el art.
  58 bis.1 LOREG: los partidos no pueden recopilar datos de opinión política obtenidos de páginas
  web. Nada de perfilado, scoring ni enriquecimiento.
- **Sin Mailchimp ni Google Sheets** para los datos de la lista. Proveedor con sede en la UE.
- **Sin casillas premarcadas y sin finalidades agrupadas.** Una casilla, una finalidad.

Las pruebas automáticas comprueban varias de estas: casillas premarcadas, recursos de terceros,
menciones a pasarelas de pago, selector de destino, e IBAN escrito a mano fuera de la
configuración. Si alguien las incumple, `npm test` falla.

---

## 11. Desarrollo local

```bash
cp .env.example .env
```

Con `CORREO_EN_CONSOLA=1` se recorre el alta entera —incluido el enlace de confirmación, que se
imprime por consola— sin cuenta de Brevo ni dominio verificado.

Sin Postgres a mano, el sitio y los dos formularios se pueden abrir igual: la validación, la
trampa, el control de origen y el límite por IP funcionan, y el guardado devuelve error. Así pasan
64 de las 78 pruebas y las otras 14 se saltan, diciéndolo.

Para el flujo completo hace falta una base de datos de verdad. La más cómoda es un contenedor que
no deje nada detrás: los datos van en memoria y el contenedor se borra solo al pararlo.

```bash
docker run -d --rm --name poraguilas-pruebas -e POSTGRES_USER=pruebas -e POSTGRES_PASSWORD=pruebas -e POSTGRES_DB=poraguilas_pruebas -p 55432:5432 --tmpfs /var/lib/postgresql/data postgres:17-alpine
```

```bash
DATABASE_URL="postgres://pruebas:pruebas@127.0.0.1:55432/poraguilas_pruebas?sslmode=disable" npm test
```

```bash
docker stop poraguilas-pruebas
```

> **El `?sslmode=disable` no es opcional en local.** Fuera de él, `src/db.js` exige TLS, que es lo
> correcto contra Railway pero imposible contra un Postgres de andar por casa: sin ese parámetro el
> banco de pruebas se cae entero con «the server does not support SSL connections».

Esa base se usa de verdad: crea las tablas y las vacía al terminar. **No apuntar nunca a la de
producción.**
