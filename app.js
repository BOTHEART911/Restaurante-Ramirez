/* ============================================================
   RAMIREZ GROUP — SITIO PÚBLICO DE RESERVAS
   Restaurante y Pescadería Ramírez
   Autor: Oscar Polania | Cel: 3103230712
   ============================================================
   Sitio estático para GitHub Pages. Llama al mismo backend
   Apps Script que el PWA, vía endpoints públicos del Bloque Q.

   Routing por query string:
     - sin token   → vista de formulario (submit nueva reserva)
     - ?token=XXX  → vista de consulta/cancelación
   ============================================================ */

/* ============================================================
   CONFIGURACIÓN
   ============================================================ */
const API_BASE = 'https://script.google.com/macros/s/AKfycbx25rbzh5YOXcX_w-Ex6TTw5s5bfeDOy_y1elfltx4VFfCtUxsyCmxUKPo3OPe57PEK/exec';

/* Horario por defecto si el backend aún no responde con la consulta
   (la primera vez que carga la vista). Se sobrescribe en cuanto
   tenemos los datos del config (via reserva consultada, ya que el
   sitio público no necesita endpoint propio de config). */
const HORARIO_DEFAULT = { apertura: '11:00', cierre: '22:00' };

/* ============================================================
   HELPERS UI
   ============================================================ */
const $  = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

function startLoading() {
  const l = $('#loader');
  if (l) l.classList.remove('hidden');
}
function stopLoading() {
  const l = $('#loader');
  if (l) l.classList.add('hidden');
}

function showView(name) {
  ['form', 'success', 'consulta', 'error'].forEach(v => {
    const el = document.getElementById('view-' + v);
    if (el) el.hidden = v !== name;
  });
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function alertOk(title, html) {
  return Swal.fire({
    icon: 'success',
    title,
    html: html || '',
    confirmButtonText: 'OK'
  });
}

function alertErr(title, html) {
  return Swal.fire({
    icon: 'error',
    title,
    html: html || '',
    confirmButtonText: 'Entendido'
  });
}

function alertWarn(title, html) {
  return Swal.fire({
    icon: 'warning',
    title,
    html: html || '',
    confirmButtonText: 'Entendido'
  });
}

function confirmar(title, html, confirmText) {
  return Swal.fire({
    icon: 'question',
    title,
    html: html || '',
    showCancelButton: true,
    confirmButtonText: confirmText || 'Sí, continuar',
    cancelButtonText: 'No, volver',
    reverseButtons: true
  }).then(r => r.isConfirmed);
}

/* ============================================================
   API helpers
   ============================================================ */
async function apiGet(action, params = {}) {
  const qs = new URLSearchParams({ action, ...params }).toString();
  const r = await fetch(`${API_BASE}?${qs}`, { method: 'GET' });
  const json = await r.json();
  if (!json.ok) throw new Error(json.error || 'Error desconocido');
  return json.data;
}

async function apiPost(action, body = {}) {
  const r = await fetch(`${API_BASE}?action=${encodeURIComponent(action)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },  // evita preflight CORS
    body: JSON.stringify(body)
  });
  const json = await r.json();
  if (!json.ok) throw new Error(json.error || 'Error desconocido');
  return json.data;
}

/* ============================================================
   HELPERS DE FECHA — equivalente a fmtFechaLargaCortaEsp_
   Formato: "Martes, 28 de Mayo de 2026 5:00 PM"
   ============================================================ */
const DIAS  = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
               'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

function fmtFechaLargaCorta(fechaYmd, horaHm) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaYmd || '')) return '—';
  const [y, m, d] = fechaYmd.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  let dia = DIAS[dt.getDay()] + ', ' + d + ' de ' + MESES[m - 1] + ' de ' + y;
  if (horaHm && /^\d{2}:\d{2}$/.test(horaHm)) {
    const [hh, mm] = horaHm.split(':').map(Number);
    const ampm = hh >= 12 ? 'PM' : 'AM';
    const h12 = hh === 0 ? 12 : (hh > 12 ? hh - 12 : hh);
    dia += ' ' + h12 + ':' + String(mm).padStart(2, '0') + ' ' + ampm;
  }
  return dia;
}

function hoyYmdLocal() {
  const d = new Date();
  return d.getFullYear() + '-' +
         String(d.getMonth() + 1).padStart(2, '0') + '-' +
         String(d.getDate()).padStart(2, '0');
}

function horaActualHm() {
  const d = new Date();
  return String(d.getHours()).padStart(2, '0') + ':' +
         String(d.getMinutes()).padStart(2, '0');
}

/* ============================================================
   GENERAR SLOTS DE HORA
   Cada 30min desde apertura hasta cierre (inclusive).
   Si cierre < apertura (ej 11:00 → 02:00), se entiende cierre
   al día siguiente; se generan slots desde apertura hasta 23:30
   y de 00:00 hasta cierre.
   ============================================================ */
function generarSlots(apertura, cierre) {
  const toMin = (h) => {
    const [hh, mm] = h.split(':').map(Number);
    return hh * 60 + mm;
  };
  const a = toMin(apertura);
  const c = toMin(cierre);
  const out = [];
  const STEP = 30;

  let inicio, fin;
  if (a <= c) {
    inicio = a; fin = c;
    for (let m = inicio; m <= fin; m += STEP) out.push(formatMin(m));
  } else {
    // Cruza medianoche
    for (let m = a; m <= 23 * 60 + 30; m += STEP) out.push(formatMin(m));
    for (let m = 0; m <= c; m += STEP) out.push(formatMin(m));
  }
  return out;
}

function formatMin(min) {
  const hh = Math.floor(min / 60);
  const mm = min % 60;
  return String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
}

function formatHora12(hm) {
  if (!/^\d{2}:\d{2}$/.test(hm)) return hm;
  const [hh, mm] = hm.split(':').map(Number);
  const ampm = hh >= 12 ? 'PM' : 'AM';
  const h12 = hh === 0 ? 12 : (hh > 12 ? hh - 12 : hh);
  return h12 + ':' + String(mm).padStart(2, '0') + ' ' + ampm;
}

/* ============================================================
   ROUTING — punto de entrada
   ============================================================ */
window.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');

  if (token) {
    abrirVistaConsulta(token);
  } else {
    abrirVistaFormulario();
  }
});

/* ============================================================
   VISTA: FORMULARIO
   ============================================================ */
let horarioRestaurante = HORARIO_DEFAULT;

function abrirVistaFormulario() {
  showView('form');
  inicializarFormulario();
}

/* Idempotente: se puede llamar varias veces (ej. al volver de "Hacer otra
   reserva"). Los listeners se bindean solo la primera vez gracias al flag
   _bound en cada elemento. La fecha y los slots sí se recalculan siempre. */
function inicializarFormulario() {
  // 1. Fecha mínima = hoy
  const inpFecha = $('#f-fecha');
  inpFecha.min = hoyYmdLocal();
  if (!inpFecha.value) inpFecha.value = hoyYmdLocal();

  // 2. Slots de hora (siempre recalcular; depende de la fecha)
  renderSlotsHora(horarioRestaurante.apertura, horarioRestaurante.cierre);

  // 3. Contador +/-
  const btnMas = $('#btn-personas-mas');
  if (btnMas && !btnMas._bound) {
    btnMas.addEventListener('click', () => {
      const inp = $('#f-personas');
      inp.value = Math.min(50, (parseInt(inp.value, 10) || 1) + 1);
    });
    btnMas._bound = true;
  }
  const btnMenos = $('#btn-personas-menos');
  if (btnMenos && !btnMenos._bound) {
    btnMenos.addEventListener('click', () => {
      const inp = $('#f-personas');
      inp.value = Math.max(1, (parseInt(inp.value, 10) || 1) - 1);
    });
    btnMenos._bound = true;
  }
  const inpPers = $('#f-personas');
  if (inpPers && !inpPers._bound) {
    inpPers.addEventListener('input', () => {
      let v = parseInt(inpPers.value, 10);
      if (isNaN(v)) v = 1;
      inpPers.value = Math.max(1, Math.min(50, v));
    });
    inpPers._bound = true;
  }

  // 4. Sanitización de teléfono
  const inpTel = $('#f-telefono');
  if (inpTel && !inpTel._bound) {
    inpTel.addEventListener('input', (e) => {
      e.target.value = e.target.value.replace(/\D/g, '').substring(0, 10);
    });
    inpTel._bound = true;
  }

  // 5. Contador de observaciones
  const obs = $('#f-obs');
  if (obs && !obs._bound) {
    const cnt = $('#obs-count');
    obs.addEventListener('input', () => {
      cnt.textContent = obs.value.length;
    });
    obs._bound = true;
  }

  // 6. Submit
  const form = $('#form-reserva');
  if (form && !form._bound) {
    form.addEventListener('submit', submitReserva);
    form._bound = true;
  }

  // 7. Restaurar botón de submit por si quedó deshabilitado
  const btn = $('#btn-enviar');
  if (btn) {
    btn.disabled = false;
    const txt = btn.querySelector('.btn__text');
    if (txt) txt.textContent = 'Solicitar reserva';
  }
}

function renderSlotsHora(apertura, cierre) {
  const sel = $('#f-hora');
  if (!sel) return;
  const slots = generarSlots(apertura, cierre);
  const fecha = $('#f-fecha').value;
  const ahora = horaActualHm();
  const esHoy = fecha === hoyYmdLocal();

  // Preservar selección si todavía es válida
  const prev = sel.value;
  sel.innerHTML = '<option value="">Selecciona…</option>' +
    slots.map(s => {
      // Si es hoy, deshabilitar slots ya pasados
      const disabled = esHoy && s <= ahora;
      return `<option value="${s}" ${disabled ? 'disabled' : ''}>${formatHora12(s)}</option>`;
    }).join('');
  if (prev && slots.indexOf(prev) >= 0) sel.value = prev;

  // Recalcular cuando cambie la fecha
  $('#f-fecha').onchange = () => renderSlotsHora(apertura, cierre);
}

function limpiarErrores() {
  ['f-nombre','f-telefono','f-fecha','f-hora','f-personas'].forEach(id => {
    const el = $('#' + id);
    if (el) el.classList.remove('is-error');
  });
  const row = $('.field__row');
  if (row) row.classList.remove('is-error');
  const hint = $('#hint-telefono');
  if (hint) {
    hint.textContent = '10 dígitos, debe iniciar en 3';
    hint.classList.remove('is-error');
  }
  const hn = $('#hint-nombre');
  if (hn) { hn.textContent = ''; hn.classList.remove('is-error'); }
}

function setError(inputId, mensaje) {
  const el = $('#' + inputId);
  if (el) el.classList.add('is-error');
  if (inputId === 'f-telefono') {
    $('.field__row').classList.add('is-error');
    const h = $('#hint-telefono');
    if (h) { h.textContent = mensaje; h.classList.add('is-error'); }
  } else if (inputId === 'f-nombre') {
    const h = $('#hint-nombre');
    if (h) { h.textContent = mensaje; h.classList.add('is-error'); }
  }
}

async function submitReserva(e) {
  e.preventDefault();
  limpiarErrores();

  const nombre = $('#f-nombre').value.trim();
  const tel = $('#f-telefono').value.trim();
  const fecha = $('#f-fecha').value;
  const hora = $('#f-hora').value;
  const personas = parseInt($('#f-personas').value, 10);
  const tipo = $('#f-tipo').value;
  const obs = $('#f-obs').value.trim();

  // Validaciones cliente — espejo de las del backend
  if (nombre.length < 3) {
    setError('f-nombre', 'Mínimo 3 caracteres');
    $('#f-nombre').focus();
    return;
  }
  if (!/^3\d{9}$/.test(tel)) {
    setError('f-telefono', 'Debe ser un celular de 10 dígitos que inicie en 3');
    $('#f-telefono').focus();
    return;
  }
  if (!fecha) {
    setError('f-fecha', '');
    $('#f-fecha').focus();
    return;
  }
  if (fecha < hoyYmdLocal()) {
    setError('f-fecha', '');
    return alertWarn('Fecha inválida', 'La fecha no puede ser en el pasado.');
  }
  if (!hora) {
    setError('f-hora', '');
    $('#f-hora').focus();
    return;
  }
  if (!(personas >= 1 && personas <= 50)) {
    setError('f-personas', '');
    return alertWarn('Personas inválidas', 'Debe estar entre 1 y 50.');
  }

  const btn = $('#btn-enviar');
  btn.disabled = true;
  btn.querySelector('.btn__text').textContent = 'Enviando…';
  startLoading();

  try {
    const r = await apiPost('crearReserva', {
      clienteNombre:   nombre,
      clienteTelefono: tel,
      fechaReserva:    fecha,
      horaReserva:     hora,
      personas:        personas,
      tipoEvento:      tipo,
      observaciones:   obs
    });
    stopLoading();
    btn.disabled = false;
    btn.querySelector('.btn__text').textContent = 'Solicitar reserva';
    mostrarExito(r, { nombre, fecha, hora, personas, tipo });
  } catch (err) {
    stopLoading();
    btn.disabled = false;
    btn.querySelector('.btn__text').textContent = 'Solicitar reserva';
    alertErr('No se pudo enviar', err.message);
  }
}

function mostrarExito(r, datos) {
  showView('success');

  // Resumen
  const tipoFinal = datos.tipo || 'Sin especificar';
  const resumen = $('#success-resumen');
  resumen.innerHTML = `
    <div class="success-resumen__row">
      <span class="success-resumen__lbl">📅 Fecha</span>
      <span class="success-resumen__val">${escapeHtml(fmtFechaLargaCorta(datos.fecha, datos.hora))}</span>
    </div>
    <div class="success-resumen__row">
      <span class="success-resumen__lbl">👥 Personas</span>
      <span class="success-resumen__val">${datos.personas}</span>
    </div>
    <div class="success-resumen__row">
      <span class="success-resumen__lbl">🎉 Ocasión</span>
      <span class="success-resumen__val">${escapeHtml(tipoFinal)}</span>
    </div>
    <div class="success-resumen__row">
      <span class="success-resumen__lbl">🔖 Código</span>
      <span class="success-resumen__val">${escapeHtml(r.id)}</span>
    </div>
  `;

  // Link de consulta
  const url = r.consultaUrl || (window.location.origin + window.location.pathname + '?token=' + r.tokenPublico);
  const a = $('#success-url');
  a.textContent = url;
  a.href = url;

  // Botón copiar
  $('#btn-copiar').onclick = async () => {
    try {
      await navigator.clipboard.writeText(url);
      Swal.fire({
        toast: true, position: 'top', icon: 'success',
        title: 'Enlace copiado', showConfirmButton: false, timer: 1800
      });
    } catch (e) {
      alertWarn('No se pudo copiar', 'Selecciona el texto y cópialo manualmente.');
    }
  };

  // Botón "otra reserva"
  $('#btn-otra').onclick = () => {
    // Resetear formulario y volver
    $('#form-reserva').reset();
    $('#obs-count').textContent = '0';
    abrirVistaFormulario();
  };
}

/* ============================================================
   VISTA: CONSULTA POR TOKEN
   ============================================================ */
async function abrirVistaConsulta(token) {
  startLoading();
  try {
    const r = await apiGet('consultarReservaPorToken', { token });
    stopLoading();
    // Refinar horario si el restaurante lo expone (no aplica acá,
    // pero dejamos el hook por si el backend amplía el payload)
    renderConsulta(r);
  } catch (err) {
    stopLoading();
    mostrarErrorTokenInvalido(err.message);
  }
}

function renderConsulta(data) {
  showView('consulta');
  const r = data.reserva;
  const rest = data.restaurante;

  const estado = String(r.estado || 'PENDIENTE').toUpperCase();
  const cfg = configEstado(estado);

  const wrap = $('#consulta-wrap');
  wrap.innerHTML = `
    <article class="consulta-card ${cfg.cls}">
      <!-- Estado -->
      <header class="consulta-status">
        <div class="consulta-status__icon">${cfg.icon}</div>
        <div class="consulta-status__label">${cfg.label}</div>
        <div class="consulta-status__sub">${cfg.sub}</div>
      </header>

      <!-- Bloque información de la reserva -->
      <section class="consulta-block">
        <h3 class="consulta-block__title">Detalles</h3>
        <div class="consulta-row">
          <span class="consulta-row__lbl">📅 Fecha</span>
          <span class="consulta-row__val">${escapeHtml(fmtFechaLargaCorta(r.fechaReserva, r.horaReserva))}</span>
        </div>
        <div class="consulta-row">
          <span class="consulta-row__lbl">👥 Personas</span>
          <span class="consulta-row__val">${r.personas}</span>
        </div>
        ${r.tipoEvento ? `
          <div class="consulta-row">
            <span class="consulta-row__lbl">🎉 Ocasión</span>
            <span class="consulta-row__val">${escapeHtml(r.tipoEvento)}</span>
          </div>` : ''}
        ${r.mesaNumero ? `
          <div class="consulta-row">
            <span class="consulta-row__lbl">🪑 Mesa asignada</span>
            <span class="consulta-row__val">${escapeHtml(r.mesaNumero)}</span>
          </div>` : ''}
        <div class="consulta-row">
          <span class="consulta-row__lbl">🔖 Código</span>
          <span class="consulta-row__val">${escapeHtml(r.id)}</span>
        </div>
        ${r.observaciones ? `
          <div class="consulta-obs">📝 ${escapeHtml(r.observaciones)}</div>` : ''}
        ${(estado === 'RECHAZADA' && r.motivoRechazo) ? `
          <div class="consulta-motivo"><b>Motivo del rechazo:</b><br>${escapeHtml(r.motivoRechazo)}</div>` : ''}
      </section>

      <!-- Bloque restaurante -->
      <section class="consulta-block">
        <h3 class="consulta-block__title">Restaurante</h3>
        ${rest.razonSocial ? `
          <div class="consulta-row">
            <span class="consulta-row__lbl">🍽️</span>
            <span class="consulta-row__val">${escapeHtml(rest.razonSocial)}</span>
          </div>` : ''}
        ${rest.direccion ? `
          <div class="consulta-row">
            <span class="consulta-row__lbl">📍 Dirección</span>
            <span class="consulta-row__val">${escapeHtml(rest.direccion)}</span>
          </div>` : ''}
        ${rest.telefono ? `
          <div class="consulta-row">
            <span class="consulta-row__lbl">📞 Teléfono</span>
            <span class="consulta-row__val">
              <a href="tel:${escapeHtml(rest.telefono)}" style="color:var(--accent);">${escapeHtml(rest.telefono)}</a>
            </span>
          </div>` : ''}
      </section>

      <!-- Acciones -->
      <div class="consulta-actions">
        ${(estado === 'PENDIENTE' || estado === 'CONFIRMADA') ? `
          <button type="button" id="btn-cancelar" class="btn btn-danger btn-block">
            Cancelar mi reserva
          </button>` : ''}
        <a href="./" class="btn btn-ghost btn-block" style="margin-top:10px;">
          Hacer una nueva reserva
        </a>
      </div>
    </article>
  `;

  // Bind cancelar
  const btnCancel = $('#btn-cancelar');
  if (btnCancel) {
    btnCancel.addEventListener('click', () => cancelarReserva(r.id));
  }
}

function configEstado(estado) {
  const map = {
    PENDIENTE: {
      cls: 'estado-pendiente',
      icon: '⏳',
      label: 'En revisión',
      sub: 'Te avisaremos por WhatsApp cuando esté confirmada.'
    },
    CONFIRMADA: {
      cls: 'estado-confirmada',
      icon: '✓',
      label: '¡Confirmada!',
      sub: 'Te esperamos en la fecha y hora indicadas.'
    },
    RECHAZADA: {
      cls: 'estado-rechazada',
      icon: '✕',
      label: 'No disponible',
      sub: 'No pudimos confirmar esta solicitud.'
    },
    CANCELADA_CLIENTE: {
      cls: 'estado-cancelada',
      icon: '⊘',
      label: 'Cancelada',
      sub: 'Tú cancelaste esta reserva.'
    },
    CUMPLIDA: {
      cls: 'estado-cumplida',
      icon: '✓',
      label: 'Cumplida',
      sub: 'Gracias por tu visita. ¡Esperamos verte pronto!'
    },
    NO_SHOW: {
      cls: 'estado-noshow',
      icon: '—',
      label: 'No asistió',
      sub: 'Esta reserva quedó sin asistencia.'
    }
  };
  return map[estado] || map.PENDIENTE;
}

async function cancelarReserva(reservaId) {
  // Confirmación con SweetAlert para evitar cancelaciones accidentales
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');
  if (!token) return alertErr('Error', 'Token no encontrado en la URL.');

  const ok = await confirmar(
    '¿Cancelar la reserva?',
    'Esta acción no se puede deshacer. Tu mesa quedará disponible para otros clientes.',
    'Sí, cancelar'
  );
  if (!ok) return;

  startLoading();
  try {
    await apiPost('cancelarReservaCliente', { token });
    stopLoading();
    await alertOk(
      'Reserva cancelada',
      'Hemos cancelado tu reserva. Esperamos verte en otra ocasión. 💚'
    );
    // Recargar la vista de consulta con el estado actualizado
    abrirVistaConsulta(token);
  } catch (err) {
    stopLoading();
    alertErr('No se pudo cancelar', err.message);
  }
}

function mostrarErrorTokenInvalido(mensaje) {
  showView('error');
  const msgEl = $('#error-msg');
  if (msgEl) {
    // Mensaje del backend si dice "no encontrada" lo mostramos genérico,
    // si dice otra cosa (rate limit, etc) lo mostramos tal cual
    if (/no encontrada/i.test(mensaje)) {
      msgEl.textContent = 'El enlace que usaste no es válido o la reserva ya no existe.';
    } else {
      msgEl.textContent = mensaje;
    }
  }
}
