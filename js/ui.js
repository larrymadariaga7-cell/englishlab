// =====================================================================
// ENGLISHLAB GS — UTILIDADES DE INTERFAZ COMPARTIDAS
// (topbar: chip de usuario + notificaciones, toasts, modales)
// =====================================================================

function initials(nombre) {
  return (nombre || "?")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join("");
}

function pintarUserChip(user) {
  const nameEl = document.getElementById("chip-name");
  const roleEl = document.getElementById("chip-role");
  const avatarEl = document.getElementById("chip-avatar");
  const roleLabel = { student: "Estudiante", teacher: "Profesor", admin: "Administrador" };
  if (nameEl) nameEl.textContent = user.nombre;
  if (roleEl) roleEl.textContent = roleLabel[user.rol] || user.rol;
  if (avatarEl) avatarEl.textContent = initials(user.nombre);
}

function toast(msg, type = "info") {
  let wrap = document.getElementById("toast-wrap");
  if (!wrap) {
    wrap = document.createElement("div");
    wrap.id = "toast-wrap";
    document.body.appendChild(wrap);
  }
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.textContent = msg;
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 4200);
}

function timeAgo(dateStr) {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60) return "hace un momento";
  if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)} h`;
  return `hace ${Math.floor(diff / 86400)} d`;
}

// ---------------------------------------------------------------------
// NOTIFICACIONES
// ---------------------------------------------------------------------
async function cargarNotificaciones(userId) {
  const { data, error } = await supabaseClient
    .from("notificaciones")
    .select("id, mensaje, leido, created_at")
    .eq("usuario_id", userId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    console.error(error);
    return [];
  }
  return data || [];
}

function pintarNotificaciones(lista) {
  const box = document.getElementById("notif-list");
  const dot = document.getElementById("bell-dot");
  if (!box) return;

  const sinLeer = lista.filter((n) => !n.leido).length;
  if (dot) dot.classList.toggle("show", sinLeer > 0);

  if (!lista.length) {
    box.innerHTML = `<div class="empty-note">No tienes notificaciones todavía.</div>`;
    return;
  }

  box.innerHTML = lista
    .map(
      (n) => `
      <div class="notif-item ${n.leido ? "" : "unread"}" data-id="${n.id}">
        <div>${escapeHTML(n.mensaje)}</div>
        <div class="notif-time">${timeAgo(n.created_at)}</div>
      </div>`
    )
    .join("");
}

async function initNotificaciones(userId) {
  const bellBtn = document.getElementById("bell-btn");
  const dropdown = document.getElementById("notif-dropdown");
  const markAllBtn = document.getElementById("notif-mark-all");

  const lista = await cargarNotificaciones(userId);
  pintarNotificaciones(lista);

  bellBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    dropdown.classList.toggle("show");
  });
  document.addEventListener("click", (e) => {
    if (dropdown && !dropdown.contains(e.target) && e.target !== bellBtn) {
      dropdown.classList.remove("show");
    }
  });

  markAllBtn?.addEventListener("click", async () => {
    await supabaseClient.from("notificaciones").update({ leido: true }).eq("usuario_id", userId).eq("leido", false);
    const actualizadas = await cargarNotificaciones(userId);
    pintarNotificaciones(actualizadas);
  });

  // Tiempo real: nuevas notificaciones para este usuario
  supabaseClient
    .channel(`notificaciones-${userId}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "notificaciones", filter: `usuario_id=eq.${userId}` },
      async () => {
        const actualizadas = await cargarNotificaciones(userId);
        pintarNotificaciones(actualizadas);
        toast("Tienes una nueva notificación", "info");
      }
    )
    .subscribe();
}

// ---------------------------------------------------------------------
// LOGOUT (botón compartido en las 3 vistas)
// ---------------------------------------------------------------------
function bindLogoutButton() {
  document.getElementById("logout-btn")?.addEventListener("click", logout);
  document.getElementById("logout-btn-top")?.addEventListener("click", logout);
}

// ---------------------------------------------------------------------
// MODALES genéricos
// ---------------------------------------------------------------------
function openModal(id) {
  document.getElementById(id)?.classList.add("show");
}
function closeModal(id) {
  document.getElementById(id)?.classList.remove("show");
}
document.addEventListener("click", (e) => {
  if (e.target.classList.contains("modal-overlay")) {
    e.target.classList.remove("show");
  }
});
