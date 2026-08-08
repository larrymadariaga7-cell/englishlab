// =====================================================================
// ENGLISHLAB GS — DASHBOARD ESTUDIANTE
// =====================================================================

let CURRENT_USER = null;

function mostrarSeccion(id) {
  document.getElementById(`sec-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function cargarNombresGradoSalon(user) {
  const el = document.getElementById("ubicacion-usuario");
  if (!user.grado_id || !user.salon_id) {
    el.textContent = "Sin grado/salón asignado";
    return;
  }
  const [{ data: grado }, { data: salon }] = await Promise.all([
    supabaseClient.from("grados").select("nombre").eq("id", user.grado_id).single(),
    supabaseClient.from("salones").select("nombre").eq("id", user.salon_id).single(),
  ]);
  el.textContent = `Grado ${grado?.nombre ?? "-"} · Salón ${salon?.nombre ?? "-"}`;
}

async function cargarActividades(user) {
  const box = document.getElementById("actividades-list");
  const { data, error } = await supabaseClient
    .from("actividades")
    .select("id, titulo, descripcion, created_at")
    .or(`salon_id.eq.${user.salon_id},grado_id.eq.${user.grado_id}`)
    .order("created_at", { ascending: false })
    .limit(10);

  if (error || !data?.length) {
    box.innerHTML = `<div class="empty-state">No hay actividades asignadas todavía.</div>`;
    document.getElementById("stat-actividades").textContent = "0";
    return;
  }
  document.getElementById("stat-actividades").textContent = data.length;
  box.innerHTML = data
    .map(
      (a) => `
      <div class="list-item">
        <div>
          <div class="title">${escapeHTML(a.titulo)}</div>
          <div class="desc">${escapeHTML(a.descripcion || "")}</div>
        </div>
        <span class="badge badge-blue">Nueva</span>
      </div>`
    )
    .join("");
}

async function cargarSimulacros(user) {
  const box = document.getElementById("simulacros-list");
  const { data, error } = await supabaseClient
    .from("simulacros")
    .select("id, titulo, tiempo, estado, preguntas_json")
    .eq("estado", "activo")
    .or(`salon_id.eq.${user.salon_id},grado_id.eq.${user.grado_id}`)
    .order("created_at", { ascending: false });

  if (error || !data?.length) {
    box.innerHTML = `<div class="empty-state">No hay simulacros activos por ahora.</div>`;
    document.getElementById("stat-simulacros").textContent = "0";
    return;
  }
  document.getElementById("stat-simulacros").textContent = data.length;

  const { data: yaHechos } = await supabaseClient
    .from("resultados")
    .select("simulacro_id, puntaje")
    .eq("usuario_id", user.id);
  const hechosMap = new Map((yaHechos || []).map((r) => [r.simulacro_id, r.puntaje]));

  box.innerHTML = data
    .map((s) => {
      const hecho = hechosMap.has(s.id);
      const numPreguntas = Array.isArray(s.preguntas_json) ? s.preguntas_json.length : 0;
      return `
      <div class="list-item">
        <div>
          <div class="title">${escapeHTML(s.titulo)}</div>
          <div class="desc">${numPreguntas} preguntas · ${s.tiempo} min</div>
        </div>
        ${
          hecho
            ? `<span class="badge badge-green">Puntaje: ${hechosMap.get(s.id)}</span>`
            : `<button class="btn btn-blue btn-sm" onclick="iniciarSimulacro(${s.id})">Presentar</button>`
        }
      </div>`;
    })
    .join("");
}

async function cargarProgresoYPromedio(user) {
  const box = document.getElementById("progreso-list");
  const { data, error } = await supabaseClient
    .from("progreso")
    .select("area, puntaje")
    .eq("usuario_id", user.id);

  if (error || !data?.length) {
    box.innerHTML = `<div class="empty-state">Aún no tienes progreso registrado. ¡Presenta tu primer simulacro!</div>`;
    document.getElementById("stat-promedio").textContent = "—";
    return;
  }

  const promedio = (data.reduce((acc, p) => acc + Number(p.puntaje), 0) / data.length).toFixed(1);
  document.getElementById("stat-promedio").textContent = promedio;

  box.innerHTML = data
    .map(
      (p) => `
      <div class="progress-row">
        <div class="top"><span>${escapeHTML(p.area)}</span><span>${Number(p.puntaje).toFixed(0)}%</span></div>
        <div class="progress-track"><div class="progress-fill" style="width:${Math.min(100, p.puntaje)}%"></div></div>
      </div>`
    )
    .join("");
}

async function cargarRanking(user) {
  const box = document.getElementById("ranking-list");
  if (!user.salon_id) {
    box.innerHTML = `<div class="empty-state">No tienes salón asignado.</div>`;
    return;
  }

  const { data: companeros, error } = await supabaseClient
    .from("usuarios")
    .select("id, nombre")
    .eq("salon_id", user.salon_id)
    .eq("rol", "student");

  if (error || !companeros?.length) {
    box.innerHTML = `<div class="empty-state">No hay datos de ranking todavía.</div>`;
    return;
  }

  const ids = companeros.map((c) => c.id);
  const { data: resultados } = await supabaseClient
    .from("resultados")
    .select("usuario_id, puntaje")
    .in("usuario_id", ids);

  const promedios = companeros.map((c) => {
    const propios = (resultados || []).filter((r) => r.usuario_id === c.id);
    const prom = propios.length ? propios.reduce((a, r) => a + Number(r.puntaje), 0) / propios.length : 0;
    return { ...c, promedio: prom };
  });

  promedios.sort((a, b) => b.promedio - a.promedio);

  const miPuesto = promedios.findIndex((p) => p.id === user.id) + 1;
  document.getElementById("stat-puesto").textContent = miPuesto ? `#${miPuesto}` : "—";

  box.innerHTML = promedios
    .map(
      (p, i) => `
      <div class="rank-row ${p.id === user.id ? "me" : ""}">
        <div class="rank-num ${i < 3 ? "top" : ""}">${i + 1}</div>
        <div class="rank-name">${escapeHTML(p.nombre)}${p.id === user.id ? " (tú)" : ""}</div>
        <div class="rank-score">${p.promedio.toFixed(1)}</div>
      </div>`
    )
    .join("");
}

async function initDashboard() {
  const user = await requireAuth("student");
  if (!user) return;
  CURRENT_USER = user;

  document.getElementById("saludo").textContent = `Hola, ${user.nombre.split(" ")[0]} 👋`;
  pintarUserChip(user);
  bindLogoutButton();

  await Promise.all([
    cargarNombresGradoSalon(user),
    cargarActividades(user),
    cargarSimulacros(user),
    cargarProgresoYPromedio(user),
    cargarRanking(user),
    initNotificaciones(user.id),
  ]);

  // Tiempo real: nuevas actividades del salón/grado del estudiante
  supabaseClient
    .channel(`actividades-${user.salon_id}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "actividades" },
      (payload) => {
        if (payload.new.salon_id === user.salon_id || payload.new.grado_id === user.grado_id) {
          toast("Nueva actividad publicada", "success");
          cargarActividades(user);
        }
      }
    )
    .subscribe();

  supabaseClient
    .channel(`simulacros-${user.salon_id}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "simulacros" },
      (payload) => {
        const s = payload.new;
        if (s && (s.salon_id === user.salon_id || s.grado_id === user.grado_id)) {
          cargarSimulacros(user);
        }
      }
    )
    .subscribe();
}

document.addEventListener("DOMContentLoaded", initDashboard);
