// =====================================================================
// ENGLISHLAB GS — MOTOR DE SIMULACROS TIPO ICFES
// =====================================================================

let quizState = {
  simulacroId: null,
  preguntas: [],
  respuestas: {},
  actual: 0,
  segundosRestantes: 0,
  intervalo: null,
  cambiosDePestana: 0,
};

async function iniciarSimulacro(simulacroId) {
  const { data: simulacro, error } = await supabaseClient
    .from("simulacros")
    .select("id, titulo, tiempo, preguntas_json")
    .eq("id", simulacroId)
    .single();

  if (error || !simulacro) {
    toast("No se pudo cargar el simulacro.", "error");
    return;
  }

  quizState = {
    simulacroId: simulacro.id,
    preguntas: Array.isArray(simulacro.preguntas_json) ? simulacro.preguntas_json : [],
    respuestas: {},
    actual: 0,
    segundosRestantes: simulacro.tiempo * 60,
    intervalo: null,
    cambiosDePestana: 0,
  };

  if (!quizState.preguntas.length) {
    toast("Este simulacro no tiene preguntas configuradas.", "error");
    return;
  }

  document.getElementById("quiz-titulo").textContent = simulacro.titulo;
  openModal("modal-simulacro");
  pintarPreguntaActual();
  iniciarTemporizador();
  activarSeguridadAntiTrampa();
}

function iniciarTemporizador() {
  clearInterval(quizState.intervalo);
  actualizarTimerUI();
  quizState.intervalo = setInterval(() => {
    quizState.segundosRestantes--;
    actualizarTimerUI();
    if (quizState.segundosRestantes <= 0) {
      clearInterval(quizState.intervalo);
      toast("Se acabó el tiempo. Enviando tus respuestas...", "error");
      finalizarSimulacro();
    }
  }, 1000);
}

function actualizarTimerUI() {
  const el = document.getElementById("quiz-timer");
  const m = Math.floor(quizState.segundosRestantes / 60);
  const s = quizState.segundosRestantes % 60;
  el.textContent = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  el.classList.toggle("low", quizState.segundosRestantes <= 60);
}

function pintarPreguntaActual() {
  const p = quizState.preguntas[quizState.actual];
  const body = document.getElementById("quiz-body");
  document.getElementById("quiz-progreso").textContent =
    `Pregunta ${quizState.actual + 1} de ${quizState.preguntas.length}`;

  const opciones = Array.isArray(p.opciones) ? p.opciones : [];
  body.innerHTML = `
    <div class="question-card">
      <div class="q-text">${escapeHTML(p.pregunta || "")}</div>
      ${opciones
        .map((op, i) => {
          const selected = quizState.respuestas[quizState.actual] === i;
          return `
          <label class="option-row ${selected ? "selected" : ""}" onclick="seleccionarOpcion(${i})">
            <input type="radio" name="opcion" ${selected ? "checked" : ""} />
            <span>${escapeHTML(op)}</span>
          </label>`;
        })
        .join("")}
    </div>`;

  document.getElementById("quiz-prev").style.visibility = quizState.actual === 0 ? "hidden" : "visible";
  document.getElementById("quiz-next").textContent =
    quizState.actual === quizState.preguntas.length - 1 ? "Finalizar" : "Siguiente";
}

function seleccionarOpcion(index) {
  quizState.respuestas[quizState.actual] = index;
  pintarPreguntaActual();
}

function quizAnterior() {
  if (quizState.actual > 0) {
    quizState.actual--;
    pintarPreguntaActual();
  }
}

function quizSiguiente() {
  if (quizState.actual < quizState.preguntas.length - 1) {
    quizState.actual++;
    pintarPreguntaActual();
  } else {
    finalizarSimulacro();
  }
}

function cerrarSimulacro() {
  if (!confirm("¿Seguro que quieres salir? Perderás tus respuestas si no has finalizado.")) return;
  limpiarSimulacro();
}

function limpiarSimulacro() {
  clearInterval(quizState.intervalo);
  desactivarSeguridadAntiTrampa();
  closeModal("modal-simulacro");
}

async function finalizarSimulacro() {
  clearInterval(quizState.intervalo);
  desactivarSeguridadAntiTrampa();

  const total = quizState.preguntas.length;
  let correctas = 0;
  quizState.preguntas.forEach((p, i) => {
    if (quizState.respuestas[i] === p.correcta) correctas++;
  });
  const puntaje = total ? Math.round((correctas / total) * 100) : 0;

  const { error } = await supabaseClient.from("resultados").upsert(
    {
      usuario_id: CURRENT_USER.id,
      simulacro_id: quizState.simulacroId,
      puntaje,
      respuestas_json: quizState.respuestas,
    },
    { onConflict: "usuario_id,simulacro_id" }
  );

  if (error) {
    console.error(error);
    toast("No se pudo guardar tu resultado. Contacta a tu profesor.", "error");
  } else {
    toast(`Simulacro enviado. Puntaje: ${puntaje}`, "success");
    // Actualiza progreso general (área "Simulacro ICFES") de forma simple
    await supabaseClient.from("progreso").upsert(
      { usuario_id: CURRENT_USER.id, area: "Simulacros ICFES", puntaje, updated_at: new Date().toISOString() },
      { onConflict: "usuario_id,area" }
    );
  }

  closeModal("modal-simulacro");
  cargarSimulacros(CURRENT_USER);
  cargarProgresoYPromedio(CURRENT_USER);
  cargarRanking(CURRENT_USER);
}

// ---------------------------------------------------------------------
// SEGURIDAD: detectar cambio de pestaña + bloquear copiar durante el quiz
// ---------------------------------------------------------------------
function handleVisibilityChange() {
  if (document.hidden) {
    quizState.cambiosDePestana++;
    toast(`Se detectó un cambio de pestaña (${quizState.cambiosDePestana}). Esto queda registrado.`, "error");
  }
}
function blockCopyPaste(e) {
  e.preventDefault();
  return false;
}
function activarSeguridadAntiTrampa() {
  document.addEventListener("visibilitychange", handleVisibilityChange);
  document.getElementById("modal-simulacro").addEventListener("copy", blockCopyPaste);
  document.getElementById("modal-simulacro").addEventListener("cut", blockCopyPaste);
  document.getElementById("modal-simulacro").addEventListener("contextmenu", blockCopyPaste);
}
function desactivarSeguridadAntiTrampa() {
  document.removeEventListener("visibilitychange", handleVisibilityChange);
  document.getElementById("modal-simulacro")?.removeEventListener("copy", blockCopyPaste);
  document.getElementById("modal-simulacro")?.removeEventListener("cut", blockCopyPaste);
  document.getElementById("modal-simulacro")?.removeEventListener("contextmenu", blockCopyPaste);
}
