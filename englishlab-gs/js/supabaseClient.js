// =====================================================================
// ENGLISHLAB GS — CLIENTE SUPABASE
// =====================================================================
// SUPABASE_URL y SUPABASE_ANON_KEY se inyectan en tiempo de build por
// Netlify (ver netlify.toml + build.sh) dentro de window.__ENV__.
// NUNCA se hardcodea la anon key en el repositorio.
// =====================================================================

const ENV = window.__ENV__ || {};

if (!ENV.SUPABASE_URL || !ENV.SUPABASE_ANON_KEY) {
  console.error(
    "[EnglishLab GS] Faltan variables de entorno SUPABASE_URL / SUPABASE_ANON_KEY. " +
    "Configúralas en Netlify (Site settings → Environment variables) y revisa env.js."
  );
}

const supabaseClient = window.supabase.createClient(
  ENV.SUPABASE_URL,
  ENV.SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  }
);

// Dominio interno usado para mapear "código de estudiante" -> email de Auth.
// El código nunca se expone como email real al usuario; solo se usa
// internamente para autenticar contra Supabase Auth.
const AUTH_EMAIL_DOMAIN = "@englishlabgs.local";

function codigoToEmail(codigo) {
  return `${String(codigo).trim().toLowerCase()}${AUTH_EMAIL_DOMAIN}`;
}

// Sanitiza texto simple para prevenir inyección de HTML (XSS) al
// insertar contenido dinámico con innerHTML en las vistas.
function escapeHTML(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
