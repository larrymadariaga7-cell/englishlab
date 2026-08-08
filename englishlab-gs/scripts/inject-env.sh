#!/usr/bin/env bash
# =====================================================================
# ENGLISHLAB GS — Inyecta SUPABASE_URL / SUPABASE_ANON_KEY (configuradas
# como variables de entorno en Netlify) dentro de js/env.js durante el
# build. Así la anon key nunca queda hardcodeada en el repositorio.
# =====================================================================
set -e

if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_ANON_KEY" ]; then
  echo "ERROR: Debes configurar SUPABASE_URL y SUPABASE_ANON_KEY en Netlify (Site settings → Environment variables)."
  exit 1
fi

cat > js/env.js <<EOF
window.__ENV__ = {
  SUPABASE_URL: "${SUPABASE_URL}",
  SUPABASE_ANON_KEY: "${SUPABASE_ANON_KEY}",
};
EOF

echo "js/env.js generado correctamente con las variables de entorno de Netlify."
