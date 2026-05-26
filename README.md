# Reservas — Restaurante y Pescadería Ramírez

Sitio público de reservas para clientes. Conectado al backend de Apps Script de Ramírez Group (Bloque Q, Fase 7).

## Estructura

```
.
├── index.html       # Estructura: 4 vistas (form, success, consulta, error)
├── styles.css       # Mobile-first, brand consistente con el PWA
├── app.js           # Routing + validaciones + API calls
└── README.md        # Este archivo
```

## Funcionamiento

### Flujo 1 — Nueva reserva
- Cliente entra a la raíz del sitio (sin `?token=`).
- Llena el formulario (nombre, WhatsApp, fecha, hora, personas, ocasión opcional, observaciones opcionales).
- Envía → backend valida → guarda en `RESERVAS` → envía WhatsApp al cliente y al grupo del equipo.
- Cliente ve pantalla de éxito con resumen + link de consulta + botón para copiar.

### Flujo 2 — Consulta y cancelación
- Cliente abre el link recibido por WhatsApp (`https://tu-sitio?token=XXX`).
- El sitio fetchea la reserva por token y la muestra con su estado (pendiente, confirmada, rechazada, etc).
- Si el estado es `PENDIENTE` o `CONFIRMADA`, aparece botón "Cancelar mi reserva" (con confirmación).

## Deploy en GitHub Pages

1. **Crear el repo nuevo en GitHub** (ej. `ramirez-reservas`).
2. **Subir los 3 archivos** (`index.html`, `styles.css`, `app.js`) a la raíz del repo.
3. **Activar GitHub Pages**: `Settings → Pages → Branch: main → / (root) → Save`.
4. Esperar 1-2 minutos. GitHub Pages te dará la URL: `https://<usuario>.github.io/<repo>/`.
5. **Configurar la URL en el PWA**:
   - Entrar al PWA como SUPERUSUARIO.
   - Configuración → 📅 Reservas.
   - Pegar la URL de GitHub Pages en **URL base del sitio público de reservas**.
   - Guardar sección.

A partir de ese momento, el WhatsApp que recibe el cliente al crear la reserva incluirá el link correcto de consulta.

## Configuración

La URL del backend está hardcoded en `app.js`:

```js
const API_BASE = 'https://script.google.com/macros/s/.../exec';
```

Si cambias la deployment del Apps Script (poco común — Apps Script preserva la URL al reimplementar), tienes que actualizarla aquí.

## Endpoints del backend usados

Todos públicos (sin auth), expuestos por el dispatcher del Apps Script Web App:

- `POST crearReserva` — crea reserva, envía WhatsApps, devuelve `{ id, tokenPublico, consultaUrl }`.
- `GET consultarReservaPorToken?token=XXX` — devuelve datos de la reserva + datos públicos del restaurante.
- `POST cancelarReservaCliente { token }` — cancela si está en estado válido.

## Rate limit

El backend tiene un rate limit de **5 solicitudes por minuto por número de teléfono**. Si un cliente intenta crear muchas reservas en poco tiempo, recibirá un mensaje de error claro.

## Personalización rápida

- **Logo de Reservas**: hardcoded en el HTML como URL de Cloudinary. Cambiar las 4 ocurrencias si quieres otro logo.
- **Tipos de ocasión**: el `<select id="f-tipo">` en `index.html` tiene las 5 opciones definidas en el kickoff. Para cambiarlas hay que coordinar con el backend (validan contra la misma lista).
- **Horario de slots**: hoy se generan desde `11:00` a `22:00` por default (no se consulta al backend en cada carga para evitar latencia). Si cambias el horario del restaurante en Configuración del PWA, recordate de actualizar también `HORARIO_DEFAULT` en `app.js` para que el sitio público lo refleje.

> **Mejora opcional para Phase 7.1**: agregar endpoint público `getHorarioPublico` que devuelva solo el horario actual, y consultarlo en `inicializarFormulario()` antes de pintar slots. Hoy no es crítico.

## Footer

El footer es obligatorio del proyecto:

> **Oscar Polania** · Experto en soluciones automáticas · Cel: 3103230712

Mantenerlo intacto.

## Compatibilidad

Probado en:
- Chrome / Safari móvil (iOS 15+, Android 10+)
- Chrome / Safari / Firefox desktop

Usa solo APIs estándar (fetch, URLSearchParams, Clipboard API con fallback). No requiere build ni dependencias nodes; cargas externas solo:
- Google Fonts (Fraunces + IBM Plex Sans)
- SweetAlert2 (CDN jsdelivr)

## Autor

Oscar Polania · Cel: 3103230712
