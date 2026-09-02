# Protocolo de revisión de ingresos y devoluciones

Qué hacer cada semana con el extracto de la cuenta de donaciones, y qué hacer cuando algo no cuadra.

> **Por qué existe este documento.** El código impide que entre por el formulario una donación
> prohibida: rechaza los NIF de persona jurídica, exige las cinco declaraciones, genera el concepto
> y avisa si no cabe en el banco. Pero **el dinero no entra por el formulario, entra por el banco**,
> y ahí no hay validación que valga. Cualquiera puede copiar el IBAN y transferir desde la cuenta de
> su empresa sin pasar por la web. La única barrera que ve al ordenante real es una persona mirando
> el extracto. Esto es esa barrera, escrita.

| | |
|---|---|
| Cuenta | La que declara `config.donaciones` en `src/config.js` |
| Titular | Izquierda Unida Región de Murcia |
| Régimen vigente | Ordinario · LO 8/2007 |
| Panel del equipo | `/api/admin/donaciones` con el token de administración |
| Quién lo hace | **PENDIENTE: ASIGNAR** — tesorería de la candidatura |
| Cada cuánto | Semanal. Y siempre antes de dar por buena una donación grande |

---

## 1. La revisión semanal

Quince minutos. Se abre el extracto de la cuenta y el listado de comunicaciones del panel, y se
cruzan.

### Paso 1 · Descargar las dos listas

```bash
curl -s -H "Authorization: Bearer $ADMIN_TOKEN" \
  "https://poraguilas.es/api/admin/donaciones?estado=comunicada"
```

El listado trae, por cada comunicación: nombre, apellidos, DNI, importe, fecha prevista y el
concepto exacto que se le dijo a la persona que escribiera. Trae además dos cosas que conviene mirar
sin que nadie lo pida:

- `superaUmbralNotificacion`: marca las donaciones por encima de 25.000 €. Ver el apartado 4.
- `vigilar`: quien lleva acumulado más de la mitad del tope anual. Ver el apartado 5.

### Paso 2 · Casar cada ingreso

Para cada apunte de entrada del extracto, buscar su comunicación. Por este orden:

1. **Por el concepto.** Si lleva el DNI, se identifica solo.
2. **Por importe y fecha.** Es para lo que sirve la comunicación previa: aunque el concepto llegue
   destrozado o cortado por el banco, importe y fecha suelen bastar.
3. **Por el nombre del ordenante** que figura en el extracto.

Si cuadra, se marca la comunicación como `cobrada`.

### Paso 3 · Mirar quién ordena, no solo cuánto

Este es el paso que no puede hacer ningún código y el motivo por el que existe la revisión. Del
nombre de la cuenta de origen hay que responder tres preguntas:

- **¿Es una persona física?** Si el ordenante es una S.L., una asociación, una comunidad de bienes o
  cualquier cosa que no sea una persona con nombre y apellidos: **devolver**. Art. 5.1.a LO 8/2007,
  la donación es nula.
- **¿Coincide con quien avisó?** Si Fulano avisó y transfiere Mengana, es una donación de Mengana,
  y de Mengana no tenemos ni DNI ni declaraciones. Ver el apartado 3.
- **¿Tiene contrato con el Ayuntamiento?** En un municipio de 35.000 habitantes esto se sabe. Quien
  tiene la contrata de jardinería, la de limpieza o la del alumbrado es identificable. Si suena,
  comprobarlo en el portal de contratación antes de aceptar. Art. 5.1 LO 8/2007.

### Paso 4 · Dejar constancia

En el campo `notas` de cada donación: qué día se revisó, con qué apunte cuadró y quién lo miró. Si
algún día hay que acreditar la diligencia, esto es lo que hay.

---

## 2. Ingreso que no se puede identificar

Un ingreso que no se puede atribuir a una persona concreta es una **donación anónima**, prohibida
por el art. 5.1.c de la LO 8/2007. No vale dejarlo «a ver si alguien reclama».

**Plazo: 30 días** desde que se detecta. Después, el problema deja de ser un apunte pendiente y pasa
a ser un apunte que hay que explicar en la rendición de cuentas.

1. **Buscar dos veces.** Repasar comunicaciones de las cuatro semanas anteriores y posteriores por
   importe aproximado. La gente avisa tarde y transfiere pronto, o al revés.
2. **Si hay nombre de ordenante y no hay comunicación**, escribir al banco pidiendo el dato de
   contacto del ordenante, o esperar una semana más por si el aviso llega con retraso.
3. **Si sigue sin identificarse: devolver el ingreso** a la cuenta de origen, con el concepto
   `DEVOLUCION DONACION NO IDENTIFICADA`.
4. Anotar la devolución en el panel con estado `devuelta` y una nota que diga por qué.

**Si no se puede devolver** —porque la cuenta de origen no admite el abono, por ejemplo— hay que
dejarlo documentado con fecha, importe y todos los intentos hechos, y contárselo a quien lleve la
contabilidad de la federación **antes** del cierre del ejercicio. Un ingreso no identificable y no
devuelto no se arregla solo y no se arregla tarde.

---

## 3. Ingreso de persona jurídica

**Devolver siempre.** No hay valoración que hacer: el art. 5.1.a la declara nula.

1. Devolver a la cuenta de origen con el concepto `DEVOLUCION DONACION NO ADMISIBLE`.
2. Estado `devuelta` en el panel, con nota.
3. **Escribir a quien la hizo**, si se sabe quién es, explicando por qué. Casi siempre es buena fe:
   alguien que no distingue su bolsillo del de su negocio. Se le puede decir que si quiere donar a
   título personal, desde su cuenta particular, se puede.

Lo mismo vale para el ingreso de un gobierno o entidad pública extranjera, y para el de quien tenga
contrato vigente con el sector público.

---

## 4. Donación superior a 25.000 €

**Se notifica al Tribunal de Cuentas dentro de los tres meses siguientes.** Art. 5.4 LO 8/2007.

El panel las marca con `superaUmbralNotificacion`. En cuanto aparezca una:

1. Avisar el mismo día a quien lleve la contabilidad de la federación: la notificación la hace
   quien rinde cuentas, no la candidatura.
2. Anotar en el calendario la fecha límite —tres meses desde el ingreso— y no esperar al último día.
3. Dejar constancia en `notas` de cuándo se avisó y a quién.

---

## 5. Acumulado por donante

El tope es de **50.000 € por donante y año natural** (art. 5.1.b LO 8/2007).

El panel enseña el acumulado por DNI y año, y marca a quien pase de la mitad. **Pero ese acumulado
es parcial**, y conviene tenerlo muy presente: como Izquierda Unida es una sola persona jurídica de
ámbito estatal, el tope se cuenta sobre **todo lo que la organización reciba de esa persona en el
año, en cualquier punto del país**, no solo sobre lo que entre por Águilas.

Por eso: **antes de aceptar una donación grande, preguntar a la organización estatal por el
acumulado real de esa persona.** Desde aquí no se ve.

---

## 6. El día que se convoquen las elecciones

Todo esto cambia, y cambia de golpe:

- El límite por aportante baja a **10.000 €** (art. 129 LOREG).
- El dinero tiene que entrar por la **cuenta electoral**, no por esta.
- Quien responde pasa a ser el **administrador electoral** (arts. 121-123 LOREG).
- Hay que **identificar al aportante en el acto del depósito** (art. 126).

El procedimiento técnico está en el apartado de conmutación de `README-DESPLIEGUE.md`. Este
protocolo hay que rehacerlo ese mismo día: lo de arriba deja de valer.

---

## Resumen de una página

| Qué ves | Qué haces |
|---|---|
| Ingreso con concepto correcto y comunicación que cuadra | `cobrada` + nota |
| Ingreso sin concepto identificable | Buscar por importe y fecha. Si a los 30 días sigue sin cuadrar: **devolver** |
| Ordenante que es una empresa o asociación | **Devolver.** Es nula |
| Ordenante distinto de quien avisó | Es donación del ordenante. Sin sus datos, tratar como no identificada |
| Ordenante con contrato municipal | Comprobar en el portal de contratación. Si lo tiene: **devolver** |
| Más de 25.000 € | Avisar a la federación el mismo día. Notificación al Tribunal de Cuentas en 3 meses |
| Acumulado por encima de 25.000 € | Preguntar el acumulado estatal antes de aceptar más |
| Nada de lo anterior | Nota con la fecha y quién revisó |

---

*Preparado con ayuda de una herramienta de IA. No es asesoramiento jurídico. Antes de aplicarlo
conviene que lo revise quien lleve la contabilidad de la federación, que es quien conoce el
procedimiento de rendición de cuentas.*
