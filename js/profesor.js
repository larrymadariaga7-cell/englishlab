// =====================================================================
// ENGLISHLAB GS — PANEL PROFESOR
// =====================================================================

let PROFESOR = null;
let SALONES_ASIGNADOS = [];

function mostrarSeccion(id) {
  document.getElementById(`sec-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function cargarSalonesAsignados(user) {
  const { data, error } = await supabaseClient
    .from("profesor_salones")
    .select("salon_id, salones(id, nombre, grado_id, grados(nombre))")
    .eq("profesor_id", user.id);

  if (error || !data?.length) {
    document.getElementById("salones-asignados").textContent = "No tienes salones asignados. Contacta al administrador.";
    return [];
  }

  const salones = data.map((r) => r.salones).filter(Boolean);
  SALONES_ASIGNADOS = salones;
  document.getElementById("salones-asignados").textContent =
    "Salones: " + salones.map((s) => `${s.grados?.nombre}-${s.nombre.split("-")[1] || s.nombre}`).join(", ");

  const selects = [document.getElementById("act-salon"), document.getElementById("sim-salon")];
  selects.forEach((sel) => {
    if (!sel) return;
    sel.innerHTML = salones.map((s) => `<option value="${s.id}">${escapeHTML(s.nombre)}</option>`).join("");
  });

  return salones;
}

async function cargarEstudiantesCount(salonIds) {
  if (!salonIds.length) return 0;
  const { count } = await supabaseClient
    .from("usuarios")
    .select("id", { count: "exact", head: true })
    .in("salon_id", salonIds)
    .eq("rol", "student");
  return count || 0;
}

async function cargarActividadesProfesor(salonIds) {
  const box = document.getElementById("actividades-list");
  if (!salonIds.length) {
    box.innerHTML = `<div class="empty-state">Asigna salones para ver actividades.</div>`;
    return;
  }
  const { data, error } = await supabaseClient
    .from("actividades")
    .select("id, titulo, descripcion, salon_id, created_at")
    .in("salon_id", salonIds)
    .order("created_at", { ascending: false });

  document.getElementById("stat-actividades").textContent = data?.length || 0;

  if (error || !data?.length) {
    box.innerHTML = `<div class="empty-state">No has creado actividades todavía.</div>`;
    return;
  }
  box.innerHTML = data
    .map(
      (a) => `
      <div class="list-item">
        <div>
          <div class="title">${escapeHTML(a.titulo)}</div>
          <div class="desc">${escapeHTML(a.descripcion || "")}</div>
        </div>
        <button class="btn btn-danger btn-sm" onclick="eliminarActividad(${a.id})">Eliminar</button>
      </div>`
    )
    .join("");
}

async function eliminarActividad(id) {
  if (!confirm("¿Eliminar esta actividad?")) return;
  const { error } = await supabaseClient.from("actividades").delete().eq("id", id);
  if (error) return toast("No se pudo eliminar.", "error");
  toast("Actividad eliminada.", "success");
  cargarActividadesProfesor(SALONES_ASIGNADOS.map((s) => s.id));
}

async function cargarSimulacrosProfesor(salonIds) {
  const box = document.getElementById("simulacros-list");
  if (!salonIds.length) {
    box.innerHTML = `<div class="empty-state">Asigna salones para ver simulacros.</div>`;
    return;
  }
  const { data, error } = await supabaseClient
    .from("simulacros")
    .select("id, titulo, estado, tiempo, preguntas_json, salon_id, created_at")
    .in("salon_id", salonIds)
    .order("created_at", { ascending: false });

  const activos = (data || []).filter((s) => s.estado === "activo");
  document.getElementById("stat-simulacros").textContent = activos.length;

  if (error || !data?.length) {
    box.innerHTML = `<div class="empty-state">No has creado simulacros todavía.</div>`;
    return;
  }
  box.innerHTML = data
    .map((s) => {
      const nPreguntas = Array.isArray(s.preguntas_json) ? s.preguntas_json.length : 0;
      const badgeClass = s.estado === "activo" ? "badge-green" : s.estado === "cerrado" ? "badge-gray" : "badge-blue";
      return `
      <div class="list-item">
        <div>
          <div class="title">${escapeHTML(s.titulo)}</div>
          <div class="desc">${nPreguntas} preguntas · ${s.tiempo} min</div>
        </div>
        <div style="display:flex; align-items:center; gap:8px;">
          <span class="badge ${badgeClass}">${s.estado}</span>
          <button class="btn btn-danger btn-sm" onclick="eliminarSimulacro(${s.id})">Eliminar</button>
        </div>
      </div>`;
    })
    .join("");
}

async function eliminarSimulacro(id) {
  if (!confirm("¿Eliminar este simulacro? Se perderán los resultados asociados.")) return;
  const { error } = await supabaseClient.from("simulacros").delete().eq("id", id);
  if (error) return toast("No se pudo eliminar.", "error");
  toast("Simulacro eliminado.", "success");
  cargarSimulacrosProfesor(SALONES_ASIGNADOS.map((s) => s.id));
}

let ULTIMOS_RESULTADOS = [];

async function cargarResultados(salonIds) {
  const tbody = document.getElementById("resultados-tbody");
  if (!salonIds.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="empty-state">Asigna salones para ver resultados.</td></tr>`;
    return;
  }

  const { data: estudiantes } = await supabaseClient
    .from("usuarios")
    .select("id, nombre, salon_id, salones(nombre)")
    .in("salon_id", salonIds)
    .eq("rol", "student");

  const idsEst = (estudiantes || []).map((e) => e.id);
  if (!idsEst.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="empty-state">No hay estudiantes registrados.</td></tr>`;
    return;
  }

  const { data: resultados, error } = await supabaseClient
    .from("resultados")
    .select("id, usuario_id, puntaje, created_at, simulacros(titulo)")
    .in("usuario_id", idsEst)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error || !resultados?.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="empty-state">Aún no hay resultados registrados.</td></tr>`;
    document.getElementById("stat-promedio").textContent = "—";
    return;
  }

  const estMap = new Map(estudiantes.map((e) => [e.id, e]));
  const promedio = (resultados.reduce((a, r) => a + Number(r.puntaje), 0) / resultados.length).toFixed(1);
  document.getElementById("stat-promedio").textContent = promedio;
  document.getElementById("stat-estudiantes").textContent = idsEst.length;

  ULTIMOS_RESULTADOS = resultados.map((r) => ({
    estudiante: estMap.get(r.usuario_id)?.nombre || "—",
    salon: estMap.get(r.usuario_id)?.salones?.nombre || "—",
    simulacro: r.simulacros?.titulo || "—",
    puntaje: r.puntaje,
    fecha: new Date(r.created_at).toLocaleDateString("es-CO"),
  }));

  pintarGraficoResultados(ULTIMOS_RESULTADOS);

  tbody.innerHTML = ULTIMOS_RESULTADOS.map(
    (r) => `
    <tr>
      <td>${escapeHTML(r.estudiante)}</td>
      <td>${escapeHTML(r.salon)}</td>
      <td>${escapeHTML(r.simulacro)}</td>
      <td><span class="badge ${r.puntaje >= 70 ? "badge-green" : r.puntaje >= 50 ? "badge-blue" : "badge-red"}">${r.puntaje}</span></td>
      <td>${r.fecha}</td>
    </tr>`
  ).join("");
}

let CHART_RESULTADOS = null;
function pintarGraficoResultados(resultados) {
  const canvas = document.getElementById("chart-resultados");
  if (!canvas || typeof Chart === "undefined") return;

  const buckets = { "0-39": 0, "40-59": 0, "60-79": 0, "80-100": 0 };
  resultados.forEach((r) => {
    const p = Number(r.puntaje);
    if (p < 40) buckets["0-39"]++;
    else if (p < 60) buckets["40-59"]++;
    else if (p < 80) buckets["60-79"]++;
    else buckets["80-100"]++;
  });

  CHART_RESULTADOS?.destroy();
  CHART_RESULTADOS = new Chart(canvas, {
    type: "bar",
    data: {
      labels: Object.keys(buckets),
      datasets: [{
        label: "Estudiantes",
        data: Object.values(buckets),
        backgroundColor: "#3b82f6",
        borderRadius: 6,
      }],
    },
    options: {
      plugins: { legend: { display: false }, title: { display: true, text: "Distribución de puntajes", color: "#e2e8f0" } },
      scales: {
        x: { ticks: { color: "#94a3b8" }, grid: { display: false } },
        y: { ticks: { color: "#94a3b8", precision: 0 }, grid: { color: "#2a3a52" } },
      },
    },
  });
}

function exportarResultadosExcel() {
  if (!ULTIMOS_RESULTADOS.length) return toast("No hay resultados para exportar.", "error");
  const ws = XLSX.utils.json_to_sheet(
    ULTIMOS_RESULTADOS.map((r) => ({
      Estudiante: r.estudiante,
      Salón: r.salon,
      Simulacro: r.simulacro,
      Puntaje: r.puntaje,
      Fecha: r.fecha,
    }))
  );
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Resultados");
  XLSX.writeFile(wb, `resultados_englishlabgs_${Date.now()}.xlsx`);
}

// ---------------------------------------------------------------------
// MODALES: crear actividad / simulacro
// ---------------------------------------------------------------------
function abrirModalActividad() { openModal("modal-actividad"); }
function abrirModalSimulacro() {
  if (!preguntasBuilderState.length) {
    reiniciarPreguntasBuilder();
    agregarPreguntaBuilder(); // arranca con una pregunta lista para llenar
  }
  openModal("modal-simulacro-editor");
}

// ---------------------------------------------------------------------
// EDITOR DE PREGUNTAS (sin JSON) — enunciado + de 2 a 6 opciones (A-F)
// Estado en memoria para poder pre-llenar desde un PDF y permitir
// agregar/quitar opciones dinámicamente.
// ---------------------------------------------------------------------
const LETRAS = ["A", "B", "C", "D", "E", "F"];
let preguntasBuilderState = [];
let preguntaBuilderCounter = 0;

function agregarPreguntaBuilder(prefill) {
  preguntaBuilderCounter++;
  preguntasBuilderState.push({
    id: preguntaBuilderCounter,
    pregunta: prefill?.pregunta || "",
    opciones: prefill?.opciones && prefill.opciones.length >= 2 ? prefill.opciones : ["", "", "", ""],
    correcta: prefill?.correcta ?? 0,
    incierta: prefill?.incierta || false,
  });
  renderPreguntasBuilder();
}

function removerPreguntaBuilder(id) {
  preguntasBuilderState = preguntasBuilderState.filter((p) => p.id !== id);
  renderPreguntasBuilder();
}

function agregarOpcionBuilder(id) {
  const p = preguntasBuilderState.find((x) => x.id === id);
  if (!p || p.opciones.length >= 6) return;
  p.opciones.push("");
  renderPreguntasBuilder();
}

function quitarOpcionBuilder(id, idx) {
  const p = preguntasBuilderState.find((x) => x.id === id);
  if (!p || p.opciones.length <= 2) return;
  p.opciones.splice(idx, 1);
  if (p.correcta >= p.opciones.length) p.correcta = 0;
  renderPreguntasBuilder();
}

function actualizarPreguntaBuilder(id, valor) {
  const p = preguntasBuilderState.find((x) => x.id === id);
  if (p) p.pregunta = valor;
}

function actualizarOpcionBuilder(id, idx, valor) {
  const p = preguntasBuilderState.find((x) => x.id === id);
  if (p) p.opciones[idx] = valor;
}

function marcarCorrectaBuilder(id, idx) {
  const p = preguntasBuilderState.find((x) => x.id === id);
  if (p) { p.correcta = idx; p.incierta = false; }
  renderPreguntasBuilder();
}

function renderPreguntasBuilder() {
  const box = document.getElementById("preguntas-builder");
  const empty = document.getElementById("preguntas-builder-empty");
  if (!box) return;
  empty.style.display = preguntasBuilderState.length ? "none" : "block";

  box.innerHTML = preguntasBuilderState
    .map(
      (p, idx) => `
    <div class="card" style="margin-bottom:12px;" data-pregunta-id="${p.id}">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; gap:8px; flex-wrap:wrap;">
        <strong style="font-size:13px; color:var(--text-muted);">Pregunta ${idx + 1}</strong>
        ${p.incierta ? `<span class="badge badge-gold">⚠ Verifica la respuesta correcta</span>` : ""}
        <button type="button" class="btn btn-danger btn-sm" onclick="removerPreguntaBuilder(${p.id})">Eliminar</button>
      </div>
      <div class="form-field" style="margin-bottom:10px;">
        <label>Enunciado</label>
        <input type="text" maxlength="500" value="${escapeHTML(p.pregunta)}"
               oninput="actualizarPreguntaBuilder(${p.id}, this.value)"
               placeholder="Ej: Choose the correct form: She ___ to school every day." />
      </div>
      <div class="form-grid">
        ${p.opciones
          .map(
            (op, i) => `
          <div class="form-field">
            <label style="display:flex; align-items:center; gap:6px; margin-bottom:6px;">
              <input type="radio" name="correcta-${p.id}" ${i === p.correcta ? "checked" : ""}
                     onchange="marcarCorrectaBuilder(${p.id}, ${i})" />
              Opción ${LETRAS[i]}${i === p.correcta ? " (correcta)" : ""}
            </label>
            <div style="display:flex; gap:6px;">
              <input type="text" maxlength="200" value="${escapeHTML(op)}"
                     oninput="actualizarOpcionBuilder(${p.id}, ${i}, this.value)"
                     placeholder="Texto de la opción ${LETRAS[i]}" style="flex:1;" />
              ${p.opciones.length > 2 ? `<button type="button" class="btn btn-ghost btn-sm" onclick="quitarOpcionBuilder(${p.id}, ${i})">✕</button>` : ""}
            </div>
          </div>`
          )
          .join("")}
      </div>
      ${p.opciones.length < 6 ? `<button type="button" class="btn btn-ghost btn-sm" style="margin-top:8px;" onclick="agregarOpcionBuilder(${p.id})">+ Agregar opción (hasta F)</button>` : ""}
    </div>`
    )
    .join("");
}

function leerPreguntasBuilder() {
  if (!preguntasBuilderState.length) {
    toast("Agrega al menos una pregunta antes de guardar.", "error");
    return null;
  }
  const preguntas = [];
  for (const p of preguntasBuilderState) {
    const pregunta = p.pregunta.trim();
    const opciones = p.opciones.map((o) => o.trim());
    if (!pregunta || opciones.some((o) => !o)) {
      toast("Completa el enunciado y todas las opciones de cada pregunta.", "error");
      return null;
    }
    preguntas.push({ pregunta, opciones, correcta: p.correcta });
  }
  return preguntas;
}

function reiniciarPreguntasBuilder() {
  preguntasBuilderState = [];
  preguntaBuilderCounter = 0;
  renderPreguntasBuilder();
}

// ---------------------------------------------------------------------
// CREAR SIMULACRO DESDE PDF — extracción de texto (pdf.js) + parser
// heurístico de preguntas/opciones/respuesta correcta. El profesor
// siempre revisa el resultado en el editor antes de guardar.
// ---------------------------------------------------------------------
function abrirModalPdf() {
  document.getElementById("pdf-file").value = "";
  document.getElementById("pdf-file-label").textContent = "Toca para elegir un archivo PDF";
  document.getElementById("pdf-extract-status").style.display = "none";
  const sel = document.getElementById("pdf-salon");
  sel.innerHTML = SALONES_ASIGNADOS.map((s) => `<option value="${s.id}">${escapeHTML(s.nombre)}</option>`).join("");
  openModal("modal-pdf-upload");
}

function actualizarNombrePdf(event) {
  const file = event.target.files[0];
  document.getElementById("pdf-file-label").textContent = file ? file.name : "Toca para elegir un archivo PDF";
}

async function extraerTextoPdf(file) {
  const buffer = await file.arrayBuffer();
  pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js";
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  let texto = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    texto += content.items.map((it) => it.str).join(" ") + "\n";
  }
  return texto;
}

// Intenta separar el texto en preguntas numeradas (1. / 1) / 1-) con
// opciones A-F (A. / A) ), y detectar la respuesta correcta si el PDF
// la indica explícitamente (ej: "Respuesta: B", "Clave: C").
function parsearPreguntasDesdeTexto(texto) {
  const limpio = texto.replace(/\r/g, "").replace(/[ \t]+/g, " ");
  const bloques = limpio.split(/\n?\s*(?=\d{1,3}[\.\)]\s+)/g).filter((b) => /^\d{1,3}[\.\)]/.test(b.trim()));

  const preguntas = [];
  for (const bloque of bloques) {
    const sinNumero = bloque.replace(/^\d{1,3}[\.\)]\s*/, "").trim();

    // separa el enunciado de las opciones A-F
    const partes = sinNumero.split(/\n?\s*(?=[A-F][\.\)]\s+)/g);
    if (partes.length < 3) continue; // necesita enunciado + al menos 2 opciones

    const enunciado = partes[0].trim();
    const opciones = [];
    let correcta = 0;
    let incierta = true;

    for (const parte of partes.slice(1)) {
      const m = parte.match(/^([A-F])[\.\)]\s*(.+)/s);
      if (!m) continue;
      let textoOpcion = m[2].trim();

      // busca un marcador de respuesta correcta dentro del propio texto de la opción
      const marcaRespuesta = textoOpcion.match(/\b(?:respuesta|clave|correcta)\s*[:\-]?\s*([A-F])\b/i);
      if (marcaRespuesta) {
        textoOpcion = textoOpcion.replace(marcaRespuesta[0], "").trim();
      }
      opciones.push(textoOpcion);
    }
    if (opciones.length < 2) continue;

    // busca "Respuesta: X" / "Clave: X" en todo el bloque (después de las opciones)
    const marcaGlobal = sinNumero.match(/\b(?:respuesta\s*correcta|respuesta|clave)\s*[:\-]?\s*([A-F])\b/i);
    if (marcaGlobal) {
      const idx = LETRAS.indexOf(marcaGlobal[1].toUpperCase());
      if (idx >= 0 && idx < opciones.length) {
        correcta = idx;
        incierta = false;
      }
    }

    preguntas.push({ pregunta: enunciado, opciones, correcta, incierta });
  }
  return preguntas;
}

async function extraerPreguntasDesdePdf() {
  const fileInput = document.getElementById("pdf-file");
  const file = fileInput.files[0];
  const status = document.getElementById("pdf-extract-status");
  const salonId = Number(document.getElementById("pdf-salon").value);

  if (!file) return toast("Selecciona un archivo PDF primero.", "error");
  if (!salonId) return toast("Selecciona el salón antes de continuar.", "error");

  status.style.display = "block";
  status.textContent = "Leyendo el PDF...";

  try {
    const texto = await extraerTextoPdf(file);
    const preguntas = parsearPreguntasDesdeTexto(texto);

    if (!preguntas.length) {
      status.textContent = "No se pudo detectar ninguna pregunta en el PDF automáticamente. Puedes crear el simulacro manualmente con '+ Nuevo simulacro'.";
      return;
    }

    reiniciarPreguntasBuilder();
    preguntas.forEach((p) => agregarPreguntaBuilder(p));

    const inciertas = preguntas.filter((p) => p.incierta).length;

    document.getElementById("sim-titulo").value = file.name.replace(/\.pdf$/i, "");
    document.getElementById("sim-salon").innerHTML = SALONES_ASIGNADOS.map((s) => `<option value="${s.id}">${escapeHTML(s.nombre)}</option>`).join("");
    document.getElementById("sim-salon").value = String(salonId);
    document.getElementById("sim-estado").value = "borrador";

    closeModal("modal-pdf-upload");
    openModal("modal-simulacro-editor");

    toast(
      inciertas
        ? `Se detectaron ${preguntas.length} preguntas. ${inciertas} necesitan que confirmes la respuesta correcta manualmente.`
        : `Se detectaron ${preguntas.length} preguntas con sus respuestas. Revísalas antes de guardar.`,
      inciertas ? "error" : "success"
    );
  } catch (err) {
    console.error(err);
    status.textContent = "No se pudo leer este PDF. Puede estar escaneado como imagen (sin texto seleccionable) o dañado.";
  }
}

async function recargarTodo() {
  const salonIds = SALONES_ASIGNADOS.map((s) => s.id);
  await Promise.all([
    cargarActividadesProfesor(salonIds),
    cargarSimulacrosProfesor(salonIds),
    cargarResultados(salonIds),
  ]);
}

function initFormsProfesor() {
  document.getElementById("form-actividad")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const titulo = document.getElementById("act-titulo").value.trim();
    const descripcion = document.getElementById("act-descripcion").value.trim();
    const salon_id = Number(document.getElementById("act-salon").value);
    const salon = SALONES_ASIGNADOS.find((s) => s.id === salon_id);

    const { error } = await supabaseClient.from("actividades").insert({
      titulo,
      descripcion,
      salon_id,
      grado_id: salon?.grado_id || null,
      creado_por: PROFESOR.id,
    });
    if (error) return toast("No se pudo publicar la actividad.", "error");
    toast("Actividad publicada.", "success");
    closeModal("modal-actividad");
    e.target.reset();
    recargarTodo();
  });

  document.getElementById("form-simulacro")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const titulo = document.getElementById("sim-titulo").value.trim();
    const salon_id = Number(document.getElementById("sim-salon").value);
    const tiempo = Number(document.getElementById("sim-tiempo").value);
    const estado = document.getElementById("sim-estado").value;
    const salon = SALONES_ASIGNADOS.find((s) => s.id === salon_id);

    const preguntas = leerPreguntasBuilder();
    if (!preguntas) return; // leerPreguntasBuilder ya muestra el toast de error correspondiente

    const { error } = await supabaseClient.from("simulacros").insert({
      titulo,
      salon_id,
      grado_id: salon?.grado_id || null,
      tiempo,
      estado,
      preguntas_json: preguntas,
      creado_por: PROFESOR.id,
    });
    if (error) return toast("No se pudo guardar el simulacro.", "error");
    toast("Simulacro guardado.", "success");
    closeModal("modal-simulacro-editor");
    e.target.reset();
    reiniciarPreguntasBuilder();
    recargarTodo();
  });
}

async function initProfesor() {
  const user = await requireAuth("teacher");
  if (!user) return;
  PROFESOR = user;

  pintarUserChip(user);
  bindLogoutButton();
  initFormsProfesor();

  const salones = await cargarSalonesAsignados(user);
  const salonIds = salones.map((s) => s.id);

  document.getElementById("stat-estudiantes").textContent = await cargarEstudiantesCount(salonIds);

  await Promise.all([
    cargarActividadesProfesor(salonIds),
    cargarSimulacrosProfesor(salonIds),
    cargarResultados(salonIds),
    initNotificaciones(user.id),
  ]);

  // Tiempo real: resultados nuevos de sus estudiantes refrescan la tabla
  supabaseClient
    .channel(`resultados-profesor-${user.id}`)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "resultados" }, () => {
      cargarResultados(salonIds);
    })
    .subscribe();
}

document.addEventListener("DOMContentLoaded", initProfesor);
