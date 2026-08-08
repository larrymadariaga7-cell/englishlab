// =====================================================================
// ENGLISHLAB GS — MI PERFIL
// =====================================================================

const ROLE_LABEL = { student: "Estudiante", teacher: "Profesor", admin: "Administrador" };
const ROLE_HOME_LOCAL = { student: "dashboard.html", teacher: "profesor.html", admin: "admin.html" };

async function cargarDatosPerfil(user) {
  document.getElementById("p-nombre").textContent = user.nombre;
  document.getElementById("p-codigo").textContent = user.codigo;
  document.getElementById("p-rol").textContent = ROLE_LABEL[user.rol] || user.rol;

  const gradoRow = document.getElementById("p-grado-row");
  const salonRow = document.getElementById("p-salon-row");

  if (user.rol === "admin") {
    gradoRow.style.display = "none";
    salonRow.style.display = "none";
    return;
  }

  if (user.rol === "student") {
    if (user.grado_id) {
      const { data: grado } = await supabaseClient.from("grados").select("nombre").eq("id", user.grado_id).single();
      document.getElementById("p-grado").textContent = grado?.nombre ? `Grado ${grado.nombre}` : "—";
    }
    if (user.salon_id) {
      const { data: salon } = await supabaseClient.from("salones").select("nombre").eq("id", user.salon_id).single();
      document.getElementById("p-salon").textContent = salon?.nombre || "—";
    }
  } else if (user.rol === "teacher") {
    gradoRow.style.display = "none";
    const { data: asignados } = await supabaseClient
      .from("profesor_salones")
      .select("salones(nombre)")
      .eq("profesor_id", user.id);
    const nombres = (asignados || []).map((r) => r.salones?.nombre).filter(Boolean);
    document.getElementById("p-salon-row").querySelector(".desc").textContent = "Salones asignados";
    document.getElementById("p-salon").textContent = nombres.length ? nombres.join(", ") : "Sin salones asignados";
  }
}

function initFormPassword() {
  document.getElementById("form-password")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const nueva = document.getElementById("nueva-password").value;
    const confirmar = document.getElementById("confirmar-password").value;

    if (nueva.length < 6) {
      toast("La contraseña debe tener al menos 6 caracteres.", "error");
      return;
    }
    if (nueva !== confirmar) {
      toast("Las contraseñas no coinciden.", "error");
      return;
    }

    const { error } = await supabaseClient.auth.updateUser({ password: nueva });
    if (error) {
      toast("No se pudo actualizar la contraseña.", "error");
      return;
    }
    toast("Contraseña actualizada correctamente.", "success");
    e.target.reset();
  });
}

async function initPerfil() {
  const user = await requireAuth();
  if (!user) return;

  document.getElementById("nav-volver").href = ROLE_HOME_LOCAL[user.rol] || "index.html";

  pintarUserChip(user);
  bindLogoutButton();
  initFormPassword();
  await cargarDatosPerfil(user);
}

document.addEventListener("DOMContentLoaded", initPerfil);
