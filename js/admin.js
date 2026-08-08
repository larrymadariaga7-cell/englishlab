// =====================================================================
// ENGLISHLAB GS — PANEL ADMIN
// =====================================================================

let ADMIN_USER = null;
let GRADOS_CACHE = [];
let SALONES_CACHE = [];

function mostrarSeccion(id) {
  document.getElementById(`sec-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

// ---------------------------------------------------------------------
// GRADOS
// ---------------------------------------------------------------------
async function cargarGrados() {
  const box = document.getElementById("grados-list");
  const { data, error } = await supabaseClient.from("grados").select("id, nombre").order("nombre");
  GRADOS_CACHE = data || [];
  document.getElementById("stat-grados").textContent = GRADOS_CACHE.length;

  const selects = [document.getElementById("salon-grado"), document.getElementById("usr-grado")];
  selects.forEach((sel) => {
    if (!sel) return;
    sel.innerHTML =
      `<option value="">Sin grado</option>` +
      GRADOS_CACHE.map((g) => `<option value="${g.id}">Grado ${escapeHTML(g.nombre)}</option>`).join("");
  });

  if (error || !GRADOS_CACHE.length) {
    box.innerHTML = `<div class="empty-state">No hay grados creados.</div>`;
    return;
  }
  box.innerHTML = GRADOS_CACHE.map(
    (g) => `
    <div class="list-item">
      <div class="title">Grado ${escapeHTML(g.nombre)}</div>
      <button class="btn btn-danger btn-sm" onclick="eliminarGrado(${g.id})">Eliminar</button>
    </div>`
  ).join("");
}

async function eliminarGrado(id) {
  if (!confirm("Eliminar este grado también eliminará sus salones y desvinculará usuarios. ¿Continuar?")) return;
  const { error } = await supabaseClient.from("grados").delete().eq("id", id);
  if (error) return toast("No se pudo eliminar el grado.", "error");
  toast("Grado eliminado.", "success");
  cargarGrados();
  cargarSalones();
}

// ---------------------------------------------------------------------
// SALONES
// ---------------------------------------------------------------------
async function cargarSalones() {
  const box = document.getElementById("salones-list");
  const { data, error } = await supabaseClient
    .from("salones")
    .select("id, nombre, grado_id, grados(nombre)")
    .order("nombre");
  SALONES_CACHE = data || [];
  document.getElementById("stat-salones").textContent = SALONES_CACHE.length;

  if (error || !SALONES_CACHE.length) {
    box.innerHTML = `<div class="empty-state">No hay salones creados.</div>`;
    return;
  }
  box.innerHTML = SALONES_CACHE.map(
    (s) => `
    <div class="list-item">
      <div class="title">${escapeHTML(s.nombre)} <span class="badge badge-blue">Grado ${escapeHTML(s.grados?.nombre || "-")}</span></div>
      <button class="btn btn-danger btn-sm" onclick="eliminarSalon(${s.id})">Eliminar</button>
    </div>`
  ).join("");
}

async function eliminarSalon(id) {
  if (!confirm("¿Eliminar este salón?")) return;
  const { error } = await supabaseClient.from("salones").delete().eq("id", id);
  if (error) return toast("No se pudo eliminar el salón.", "error");
  toast("Salón eliminado.", "success");
  cargarSalones();
}

// ---------------------------------------------------------------------
// USUARIOS
// ---------------------------------------------------------------------
async function cargarUsuarios() {
  const tbody = document.getElementById("usuarios-tbody");
  const { data, error } = await supabaseClient
    .from("usuarios")
    .select("id, nombre, codigo, rol, grado_id, salon_id, grados(nombre), salones(nombre)")
    .order("nombre")
    .limit(500);

  if (error || !data?.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty-state">No hay usuarios registrados.</td></tr>`;
    document.getElementById("stat-estudiantes").textContent = "0";
    document.getElementById("stat-profesores").textContent = "0";
    return;
  }

  document.getElementById("stat-estudiantes").textContent = data.filter((u) => u.rol === "student").length;
  document.getElementById("stat-profesores").textContent = data.filter((u) => u.rol === "teacher").length;

  const rolLabel = { student: "Estudiante", teacher: "Profesor", admin: "Admin" };
  const rolBadge = { student: "badge-blue", teacher: "badge-gold", admin: "badge-green" };

  tbody.innerHTML = data
    .map(
      (u) => `
      <tr>
        <td>${escapeHTML(u.nombre)}</td>
        <td>${escapeHTML(u.codigo)}</td>
        <td><span class="badge ${rolBadge[u.rol]}">${rolLabel[u.rol]}</span></td>
        <td>${escapeHTML(u.grados?.nombre || "—")}</td>
        <td>${escapeHTML(u.salones?.nombre || "—")}</td>
        <td><button class="btn btn-danger btn-sm" onclick="eliminarUsuario('${u.id}')">Eliminar</button></td>
      </tr>`
    )
    .join("");
}

async function eliminarUsuario(id) {
  if (!confirm("¿Eliminar este usuario? Esta acción no se puede deshacer.")) return;
  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    const res = await fetch(`${ENV.SUPABASE_URL}/functions/v1/delete-user`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ targetId: id }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Error eliminando usuario.");
    toast("Usuario eliminado del sistema.", "success");
    cargarUsuarios();
  } catch (err) {
    toast(err.message, "error");
  }
}

function toggleCamposRol() {
  const rol = document.getElementById("usr-rol").value;
  document.getElementById("campo-grado").style.display = rol === "admin" ? "none" : "";
  document.getElementById("campo-salon").style.display = rol === "admin" ? "none" : "";
}

function filtrarSalonesPorGrado() {
  const gradoId = Number(document.getElementById("usr-grado").value);
  const sel = document.getElementById("usr-salon");
  const filtrados = gradoId ? SALONES_CACHE.filter((s) => s.grado_id === gradoId) : SALONES_CACHE;
  sel.innerHTML =
    `<option value="">Sin salón</option>` +
    filtrados.map((s) => `<option value="${s.id}">${escapeHTML(s.nombre)}</option>`).join("");
}

async function crearUsuarioViaFuncion(payload) {
  const { data: { session } } = await supabaseClient.auth.getSession();
  const res = await fetch(`${ENV.SUPABASE_URL}/functions/v1/create-user`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(payload),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Error creando usuario.");
  return json;
}

// ---------------------------------------------------------------------
// IMPORTAR EXCEL (columnas esperadas: nombre, codigo, password, rol, grado, salon)
// ---------------------------------------------------------------------
async function importarUsuariosExcel(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const wb = XLSX.read(e.target.result, { type: "binary" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const filas = XLSX.utils.sheet_to_json(sheet);

      if (!filas.length) return toast("El archivo está vacío.", "error");

      toast(`Importando ${filas.length} usuarios...`, "info");
      let ok = 0, fallos = 0;

      for (const fila of filas) {
        const grado = GRADOS_CACHE.find((g) => String(g.nombre) === String(fila.grado));
        const salon = SALONES_CACHE.find((s) => String(s.nombre) === String(fila.salon));
        try {
          await crearUsuarioViaFuncion({
            nombre: String(fila.nombre || "").trim(),
            codigo: String(fila.codigo || "").trim(),
            password: String(fila.password || "").trim(),
            rol: String(fila.rol || "student").trim(),
            grado_id: grado?.id || null,
            salon_id: salon?.id || null,
          });
          ok++;
        } catch (err) {
          console.error("Fila fallida:", fila, err);
          fallos++;
        }
      }
      toast(`Importación terminada: ${ok} creados, ${fallos} con error.`, fallos ? "error" : "success");
      cargarUsuarios();
    } catch (err) {
      console.error(err);
      toast("No se pudo leer el archivo Excel.", "error");
    }
    event.target.value = "";
  };
  reader.readAsBinaryString(file);
}

// ---------------------------------------------------------------------
// MODALES + FORMS
// ---------------------------------------------------------------------
function abrirModalGrado() { openModal("modal-grado"); }
function abrirModalSalon() { openModal("modal-salon"); }
function abrirModalUsuario() { openModal("modal-usuario"); }

function initForms() {
  document.getElementById("form-grado")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const nombre = document.getElementById("grado-nombre").value.trim();
    const { error } = await supabaseClient.from("grados").insert({ nombre });
    if (error) return toast("No se pudo crear el grado (¿ya existe?).", "error");
    toast("Grado creado.", "success");
    closeModal("modal-grado");
    e.target.reset();
    cargarGrados();
  });

  document.getElementById("form-salon")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const nombre = document.getElementById("salon-nombre").value.trim();
    const grado_id = Number(document.getElementById("salon-grado").value) || null;
    const { error } = await supabaseClient.from("salones").insert({ nombre, grado_id });
    if (error) return toast("No se pudo crear el salón.", "error");
    toast("Salón creado.", "success");
    closeModal("modal-salon");
    e.target.reset();
    cargarSalones();
  });

  document.getElementById("form-usuario")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const payload = {
      nombre: document.getElementById("usr-nombre").value.trim(),
      codigo: document.getElementById("usr-codigo").value.trim(),
      password: document.getElementById("usr-password").value,
      rol: document.getElementById("usr-rol").value,
      grado_id: Number(document.getElementById("usr-grado").value) || null,
      salon_id: Number(document.getElementById("usr-salon").value) || null,
    };
    try {
      await crearUsuarioViaFuncion(payload);
      toast("Usuario creado correctamente.", "success");
      closeModal("modal-usuario");
      e.target.reset();
      cargarUsuarios();
    } catch (err) {
      toast(err.message, "error");
    }
  });
}

// ---------------------------------------------------------------------
// PROFESORES Y SALONES (asignación desde el admin, sin SQL manual)
// ---------------------------------------------------------------------
let PROFESOR_SELECCIONADO = null;

async function cargarProfesores() {
  const box = document.getElementById("profesores-list");
  const { data: profesores, error } = await supabaseClient
    .from("usuarios")
    .select("id, nombre, codigo")
    .eq("rol", "teacher")
    .order("nombre");

  if (error || !profesores?.length) {
    box.innerHTML = `<div class="empty-state">No hay profesores registrados todavía.</div>`;
    return;
  }

  const { data: asignaciones } = await supabaseClient
    .from("profesor_salones")
    .select("profesor_id, salones(nombre)");

  const mapa = new Map();
  (asignaciones || []).forEach((a) => {
    if (!mapa.has(a.profesor_id)) mapa.set(a.profesor_id, []);
    if (a.salones?.nombre) mapa.get(a.profesor_id).push(a.salones.nombre);
  });

  box.innerHTML = profesores
    .map((p) => {
      const salones = mapa.get(p.id) || [];
      return `
      <div class="list-item">
        <div>
          <div class="title">${escapeHTML(p.nombre)} <span class="badge badge-gray">${escapeHTML(p.codigo)}</span></div>
          <div class="desc">${salones.length ? escapeHTML(salones.join(", ")) : "Sin salones asignados"}</div>
        </div>
        <button class="btn btn-blue btn-sm" onclick='abrirAsignarSalones("${p.id}", ${JSON.stringify(p.nombre)})'>Asignar salones</button>
      </div>`;
    })
    .join("");
}

async function abrirAsignarSalones(profesorId, nombre) {
  PROFESOR_SELECCIONADO = profesorId;
  document.getElementById("asignar-salones-titulo").textContent = `Salones de ${nombre}`;

  const { data: asignadosActuales } = await supabaseClient
    .from("profesor_salones")
    .select("salon_id")
    .eq("profesor_id", profesorId);
  const idsAsignados = new Set((asignadosActuales || []).map((a) => a.salon_id));

  const checklist = document.getElementById("asignar-salones-checklist");
  if (!SALONES_CACHE.length) {
    checklist.innerHTML = `<div class="empty-state">No hay salones creados todavía.</div>`;
  } else {
    checklist.innerHTML = SALONES_CACHE
      .map(
        (s) => `
        <label class="option-row ${idsAsignados.has(s.id) ? "selected" : ""}" style="cursor:pointer;">
          <input type="checkbox" value="${s.id}" ${idsAsignados.has(s.id) ? "checked" : ""}
                 onchange="this.closest('.option-row').classList.toggle('selected', this.checked)" />
          <span>${escapeHTML(s.nombre)} ${s.grados?.nombre ? `— Grado ${escapeHTML(s.grados.nombre)}` : ""}</span>
        </label>`
      )
      .join("");
  }

  openModal("modal-asignar-salones");
}

async function guardarAsignacionSalones() {
  if (!PROFESOR_SELECCIONADO) return;
  const checkboxes = document.querySelectorAll("#asignar-salones-checklist input[type=checkbox]");
  const seleccionados = Array.from(checkboxes).filter((c) => c.checked).map((c) => Number(c.value));

  // Reemplaza el conjunto completo: borra las asignaciones actuales y crea las nuevas.
  const { error: delErr } = await supabaseClient.from("profesor_salones").delete().eq("profesor_id", PROFESOR_SELECCIONADO);
  if (delErr) return toast("No se pudo actualizar la asignación.", "error");

  if (seleccionados.length) {
    const filas = seleccionados.map((salon_id) => ({ profesor_id: PROFESOR_SELECCIONADO, salon_id }));
    const { error: insErr } = await supabaseClient.from("profesor_salones").insert(filas);
    if (insErr) return toast("No se pudo guardar la asignación.", "error");
  }

  toast("Salones actualizados.", "success");
  closeModal("modal-asignar-salones");
  cargarProfesores();
}

async function initAdmin() {
  const user = await requireAuth("admin");
  if (!user) return;
  ADMIN_USER = user;

  pintarUserChip(user);
  bindLogoutButton();
  initForms();

  await Promise.all([cargarGrados(), cargarSalones()]);
  await cargarUsuarios();
  await cargarProfesores();
  await initNotificaciones(user.id);
}

document.addEventListener("DOMContentLoaded", initAdmin);
