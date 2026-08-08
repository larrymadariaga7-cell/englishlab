// =====================================================================
// ENGLISHLAB GS — EDGE FUNCTION: create-user
// =====================================================================
// Crea un usuario de Auth + su fila en "usuarios" usando la Service Role
// Key (nunca expuesta al navegador). Solo puede ejecutarla un admin
// autenticado: se valida el JWT del solicitante y su rol en la tabla
// "usuarios" antes de hacer nada.
//
// Deploy:
//   supabase functions deploy create-user
// Variables ya disponibles automáticamente en el runtime de Supabase:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY
// =====================================================================

import { serve } from "https://deno.land/std@0.203.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace("Bearer ", "");
    if (!jwt) throw new Error("No autorizado.");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Cliente con el JWT del solicitante, para validar quién es
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    const { data: { user: caller }, error: callerErr } = await callerClient.auth.getUser();
    if (callerErr || !caller) throw new Error("Sesión inválida.");

    const adminClient = createClient(supabaseUrl, serviceKey);

    const { data: perfilCaller } = await adminClient
      .from("usuarios")
      .select("rol")
      .eq("id", caller.id)
      .single();

    if (!perfilCaller || perfilCaller.rol !== "admin") {
      return new Response(JSON.stringify({ error: "Solo un administrador puede crear usuarios." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { nombre, codigo, password, rol, grado_id, salon_id } = body;

    if (!nombre || !codigo || !password || !rol) {
      throw new Error("Faltan campos obligatorios (nombre, codigo, password, rol).");
    }
    if (!["student", "teacher", "admin"].includes(rol)) {
      throw new Error("Rol inválido.");
    }

    const email = `${String(codigo).trim().toLowerCase()}@englishlabgs.local`;

    const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (createErr) throw createErr;

    const { error: insertErr } = await adminClient.from("usuarios").insert({
      id: created.user.id,
      nombre,
      rol,
      codigo,
      grado_id: grado_id || null,
      salon_id: salon_id || null,
    });
    if (insertErr) {
      // rollback del usuario de auth si falla la inserción del perfil
      await adminClient.auth.admin.deleteUser(created.user.id);
      throw insertErr;
    }

    return new Response(JSON.stringify({ ok: true, id: created.user.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || "Error desconocido" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
