// =====================================================================
// ENGLISHLAB GS — AUTENTICACIÓN
// =====================================================================

const ROLE_HOME = {
  student: "dashboard.html",
  teacher: "profesor.html",
  admin: "admin.html",
};

/**
 * Obtiene la sesión actual y el perfil de "usuarios" asociado.
 * Devuelve null si no hay sesión válida.
 */
async function getCurrentUser() {
  const { data: { session }, error: sessErr } = await supabaseClient.auth.getSession();
  if (sessErr || !session) return null;

  const { data: perfil, error: perfilErr } = await supabaseClient
    .from("usuarios")
    .select("id, nombre, rol, codigo, grado_id, salon_id")
    .eq("id", session.user.id)
    .single();

  if (perfilErr || !perfil) return null;
  return perfil;
}

/**
 * Protege una página: exige sesión y, opcionalmente, un rol específico.
 * Redirige a index.html si no hay sesión, o al home del rol correcto
 * si el usuario intenta entrar a una página que no le corresponde.
 */
async function requireAuth(expectedRole) {
  const user = await getCurrentUser();
  if (!user) {
    window.location.href = "index.html";
    return null;
  }
  if (expectedRole && user.rol !== expectedRole) {
    window.location.href = ROLE_HOME[user.rol] || "index.html";
    return null;
  }
  return user;
}

async function loginConCodigo(codigo, password) {
  const email = codigoToEmail(codigo);
  const { data, error } = await supabaseClient.auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw error;

  const { data: perfil, error: perfilErr } = await supabaseClient
    .from("usuarios")
    .select("rol")
    .eq("id", data.user.id)
    .single();

  if (perfilErr || !perfil) {
    await supabaseClient.auth.signOut();
    throw new Error("No se encontró un perfil asociado a esta cuenta.");
  }

  return perfil.rol;
}

async function logout() {
  await supabaseClient.auth.signOut();
  window.location.href = "index.html";
}

// ----------------------------------------------------------------------
// Lógica de la página de login (index.html)
// ----------------------------------------------------------------------
function initLoginPage() {
  const form = document.getElementById("login-form");
  if (!form) return;

  const errorBox = document.getElementById("login-error");
  const errorText = document.getElementById("login-error-text");
  const submitBtn = document.getElementById("login-submit");
  const toggleBtn = document.getElementById("toggle-pass");
  const passInput = document.getElementById("password");

  // Si ya hay sesión activa, redirige directo al dashboard correspondiente
  getCurrentUser().then((user) => {
    if (user) window.location.href = ROLE_HOME[user.rol] || "index.html";
  });

  toggleBtn?.addEventListener("click", () => {
    const isPass = passInput.type === "password";
    passInput.type = isPass ? "text" : "password";
    toggleBtn.setAttribute("aria-label", isPass ? "Ocultar contraseña" : "Mostrar contraseña");
  });

  function showError(msg) {
    errorText.textContent = msg;
    errorBox.classList.add("show");
  }
  function hideError() {
    errorBox.classList.remove("show");
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    hideError();

    const codigo = document.getElementById("codigo").value.trim();
    const password = passInput.value;

    if (!codigo || !password) {
      showError("Ingresa tu código y tu contraseña.");
      return;
    }
    if (codigo.length > 40 || password.length > 128) {
      showError("Los datos ingresados no son válidos.");
      return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner"></span> Ingresando...';

    try {
      const rol = await loginConCodigo(codigo, password);
      window.location.href = ROLE_HOME[rol] || "index.html";
    } catch (err) {
      console.error(err);
      showError("Código o contraseña incorrectos. Verifica e intenta de nuevo.");
      submitBtn.disabled = false;
      submitBtn.innerHTML = "Ingresar";
    }
  });
}

document.addEventListener("DOMContentLoaded", initLoginPage);
