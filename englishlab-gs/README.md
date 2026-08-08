# Englishlab Gs

Plataforma educativa para el colegio (grados 7° a 11°, inglés + simulacros
tipo ICFES). HTML + CSS + JavaScript puro, con Supabase como backend
(auth, base de datos, RLS y realtime) y despliegue en Netlify.

## 1. Estructura del proyecto

```
/index.html          → Login
/dashboard.html       → Panel del estudiante
/profesor.html        → Panel del profesor
/admin.html           → Panel de administración
/css/styles.css
/js/
  supabaseClient.js   → Inicializa el cliente de Supabase
  env.js              → Config (reemplazado en build por Netlify)
  auth.js             → Login / logout / protección de rutas
  ui.js               → Topbar, notificaciones, toasts, modales
  dashboard.js         → Lógica del estudiante
  simulacros.js        → Motor del simulacro (timer, anti-copia, puntaje)
  profesor.js          → Lógica del profesor
  admin.js             → Lógica del administrador
/supabase/
  schema.sql                        → Tablas + políticas RLS + realtime
  functions/create-user/index.ts    → Edge Function: crear usuarios
  functions/delete-user/index.ts    → Edge Function: eliminar usuarios
netlify.toml
scripts/inject-env.sh
```

## 2. Configurar Supabase

1. Crea un proyecto en [supabase.com](https://supabase.com).
2. Ve a **SQL Editor** y ejecuta todo el contenido de `supabase/schema.sql`.
   Esto crea las tablas, las políticas de Row Level Security y activa
   realtime en `actividades`, `simulacros` y `notificaciones`.
3. Ve a **Project Settings → API** y copia:
   - `Project URL` → será tu `SUPABASE_URL`
   - `anon public key` → será tu `SUPABASE_ANON_KEY`
   - `service_role key` → solo se usa dentro de las Edge Functions, **nunca** en el frontend.

### Edge Functions (creación/eliminación de usuarios)

La creación de usuarios necesita la Service Role Key, que nunca debe
viajar al navegador. Por eso se hace mediante dos Edge Functions que
solo un administrador autenticado puede invocar:

```bash
supabase login
supabase link --project-ref <tu-project-ref>
supabase functions deploy create-user
supabase functions deploy delete-user
```

Ambas funciones ya reciben automáticamente `SUPABASE_URL`,
`SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` del entorno de
Supabase — no hace falta configurarlas manualmente.

## 3. Configurar Netlify

1. Sube este proyecto a un repositorio Git (GitHub/GitLab) o arrastra la
   carpeta directamente en Netlify.
2. En **Site settings → Environment variables**, agrega:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
3. Build command: `bash scripts/inject-env.sh` (ya configurado en `netlify.toml`).
4. Publish directory: `.` (raíz del proyecto).
5. Despliega. El script de build reemplaza `js/env.js` con tus variables
   reales en cada deploy — la clave nunca queda hardcodeada en el repo.

### Probar en local sin Netlify

Edita manualmente `js/env.js` con tu URL y anon key reales (no lo subas
así a un repositorio público), y sirve la carpeta con cualquier servidor
estático, por ejemplo:

```bash
npx serve .
```

## 4. Primer uso

1. Con el proyecto desplegado, crea manualmente **un primer administrador**
   directamente en Supabase (Authentication → Add user, con email
   `admin@englishlabgs.local` y una contraseña), y luego inserta su fila
   correspondiente en la tabla `usuarios` con `rol = 'admin'` y el mismo
   `codigo` usado antes del `@`.
2. Inicia sesión en `index.html` con ese código y contraseña.
3. Desde el panel admin: crea grados, salones, profesores y estudiantes
   (uno por uno o subiendo un Excel con columnas
   `nombre, codigo, password, rol, grado, salon`).
4. Asigna salones a cada profesor insertando filas en
   `profesor_salones` (grado_id se resuelve automáticamente por salón).

## 5. Seguridad

- Las contraseñas nunca se manejan manualmente: las gestiona Supabase Auth.
- Row Level Security está activo en todas las tablas: cada rol solo ve lo
  que le corresponde (ver `supabase/schema.sql`).
- Todo el contenido dinámico se sanitiza con `escapeHTML()` antes de
  insertarse en el DOM para evitar XSS.
- La `service_role key` vive únicamente en las Edge Functions, nunca en
  el código del navegador.
