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
  reiniciarPreguntasBuilder();
  agregarPreguntaBuilder(); // arranca con una pregunta lista para llenar
  openModal("modal-simulacro-editor");
}

// ---------------------------------------------------------------------
// EDITOR DE PREGUNTAS (sin JSON) — cada pregunta con enunciado + 4 opciones
// ---------------------------------------------------------------------
let preguntaBuilderIds = [];
let preguntaBuilderCounter = 0;

function agregarPreguntaBuilder() {
  preguntaBuilderCounter++;
  preguntaBuilderIds.push(preguntaBuilderCounter);
  renderPreguntasBuilder();
}

function removerPreguntaBuilder(id) {
  preguntaBuilderIds = preguntaBuilderIds.filter((x) => x !== id);
  renderPreguntasBuilder();
}

function renderPreguntasBuilder() {
  const box = document.getElementById("preguntas-builder");
  const empty = document.getElementById("preguntas-builder-empty");
  if (!box) return;
  empty.style.display = preguntaBuilderIds.length ? "none" : "block";

  box.innerHTML = preguntaBuilderIds
    .map(
      (id, idx) => `
    <div class="card" style="margin-bottom:12px;" data-pregunta-id="${id}">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
        <strong style="font-size:13px; color:var(--text-muted);">Pregunta ${idx + 1}</strong>
        <button type="button" class="btn btn-danger btn-sm" onclick="removerPreguntaBuilder(${id})">Eliminar</button>
      </div>
      <div class="form-field" style="margin-bottom:10px;">
        <label>Enunciado</label>
        <input type="text" class="pb-pregunta" maxlength="300" placeholder="Ej: Choose the correct form: She ___ to school every day." />
      </div>
      <div class="form-grid">
        ${[0, 1, 2, 3]
          .map(
            (i) => `
          <div class="form-field">
            <label style="display:flex; align-items:center; gap:6px; margin-bottom:6px;">
              <input type="radio" name="correcta-${id}" class="pb-correcta" value="${i}" ${i === 0 ? "checked" : ""} />
              Opción ${i + 1}${i === 0 ? " (marca la correcta)" : ""}
            </label>
            <input type="text" class="pb-opcion" maxlength="150" placeholder="Texto de la opción ${i + 1}" />
          </div>`
          )
          .join("")}
      </div>
    </div>`
    )
    .join("");
}

function leerPreguntasBuilder() {
  const bloques = document.querySelectorAll("#preguntas-builder [data-pregunta-id]");
  if (!bloques.length) {
    toast("Agrega al menos una pregunta antes de guardar.", "error");
    return null;
  }
  const preguntas = [];
  for (const bloque of bloques) {
    const pregunta = bloque.querySelector(".pb-pregunta").value.trim();
    const opciones = Array.from(bloque.querySelectorAll(".pb-opcion")).map((i) => i.value.trim());
    const correctaInput = bloque.querySelector(".pb-correcta:checked");
    if (!pregunta || opciones.some((o) => !o) || !correctaInput) {
      toast("Completa el enunciado y las 4 opciones de cada pregunta.", "error");
      return null;
    }
    preguntas.push({ pregunta, opciones, correcta: Number(correctaInput.value) });
  }
  return preguntas;
}

function reiniciarPreguntasBuilder() {
  preguntaBuilderIds = [];
  preguntaBuilderCounter = 0;
  renderPreguntasBuilder();
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
