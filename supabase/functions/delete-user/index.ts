// =====================================================================
// ENGLISHLAB GS — EDGE FUNCTION: delete-user
// =====================================================================
// Elimina un usuario completamente (fila en "usuarios" + cuenta de
// Supabase Auth) usando la Service Role Key. Solo un admin autenticado
// puede invocarla.
//
// Deploy: supabase functions deploy delete-user
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

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    const { data: { user: caller }, error: callerErr } = await callerClient.auth.getUser();
    if (callerErr || !caller) throw new Error("Sesión inválida.");

    const adminClient = createClient(supabaseUrl, serviceKey);

    const { data: perfilCaller } = await adminClient.from("usuarios").select("rol").eq("id", caller.id).single();
    if (!perfilCaller || perfilCaller.rol !== "admin") {
      return new Response(JSON.stringify({ error: "Solo un administrador puede eliminar usuarios." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { targetId } = await req.json();
    if (!targetId) throw new Error("Falta el id del usuario a eliminar.");
    if (targetId === caller.id) throw new Error("No puedes eliminar tu propia cuenta.");

    await adminClient.from("usuarios").delete().eq("id", targetId);
    const { error: delErr } = await adminClient.auth.admin.deleteUser(targetId);
    if (delErr) throw delErr;

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || "Error desconocido" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
