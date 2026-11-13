
// ELEMENTOS DEL HTML
const campoMensaje = document.getElementById("mensaje");
const botonEnviar = document.getElementById("enviar");
const contenedorMensajes = document.getElementById("mensajes");
const estadoChat = document.getElementById("estado-chat");
const contador = document.getElementById("contador");

// IDENTIFICADOR DE SESIÓN
let sessionId;

function generarSessionId() {
    try {
        let guardado = localStorage.getItem("nutricionista_session");

        if (guardado) {
            return guardado;
        }

        const nuevoId = crypto.randomUUID
            ? crypto.randomUUID()
            : Date.now() + "-" + Math.random().toString(36).substring(2);

        localStorage.setItem("nutricionista_session", nuevoId);
        return nuevoId;

    } catch (error) {
        return Date.now() + "-" + Math.random().toString(36).substring(2);
    }
}

sessionId = generarSessionId();

// VARIABLES DE CONTROL
let ultimoEnvio = 0;
let cargando = false;

// CREAR MENSAJES SIN USAR INNERHTML
function agregarMensaje(texto, tipo) {
    const mensaje = document.createElement("div");
    mensaje.className = "mensaje " + tipo;

    const avatar = document.createElement("div");
    avatar.className = "avatar";
    avatar.textContent = tipo === "usuario" ? "😊" : "🥗";

    const burbuja = document.createElement("div");
    burbuja.className = "burbuja";

    const parrafo = document.createElement("p");
    parrafo.textContent = texto;

    burbuja.appendChild(parrafo);
    mensaje.appendChild(avatar);
    mensaje.appendChild(burbuja);

    contenedorMensajes.appendChild(mensaje);

    // Llevar el chat al último mensaje
    contenedorMensajes.scrollTop = contenedorMensajes.scrollHeight;
}

// ACTUALIZAR CONTADOR DE CARACTERES
campoMensaje.addEventListener("input", () => {
    contador.textContent = campoMensaje.value.length + "/500";
});

// MOSTRAR AVISOS
function mostrarEstado(texto, tipo = "") {
    estadoChat.textContent = texto;
    estadoChat.className = "estado-chat " + tipo;
}

// PAUSA ENTRE ENVÍOS
function esperar(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// OBTENER LA RESPUESTA DE MAKE
function extraerRespuesta(texto) {
    if (!texto.trim()) {
        return "(respuesta vacía)";
    }

    try {
        const datos = JSON.parse(texto);

        if (datos && typeof datos === "object" && !Array.isArray(datos)) {
            const propiedades = [
                "response",
                "respuesta",
                "message",
                "mensaje"
            ];

            for (const propiedad of propiedades) {
                if (
                    typeof datos[propiedad] === "string" &&
                    datos[propiedad].trim() !== ""
                ) {
                    return datos[propiedad];
                }
            }

            return "Make respondió, pero sin el campo response";
        }

        return "Make respondió, pero sin el campo response";

    } catch (error) {
        return texto;
    }
}

// ENVIAR MENSAJE AL WEBHOOK
async function enviarMensaje() {
    const mensaje = campoMensaje.value.trim();

    if (cargando || mensaje === "") {
        return;
    }

    if (mensaje.length > 500) {
        mostrarEstado("El mensaje no puede superar los 500 caracteres.", "error");
        return;
    }

    // Verificar que exista la URL del webhook
    if (
        typeof WEBHOOK_URL === "undefined" ||
        !WEBHOOK_URL ||
        WEBHOOK_URL.includes("ACA VA")
    ) {
        agregarMensaje(
            "Falta pegar la URL de tu webhook en config.js",
            "agente"
        );
        return;
    }

    cargando = true;
    botonEnviar.disabled = true;
    campoMensaje.disabled = true;

    agregarMensaje(mensaje, "usuario");
    campoMensaje.value = "";
    contador.textContent = "0/500";

    mostrarEstado("El nutricionista está preparando su respuesta...", "cargando");

    try {
        // Esperar al menos 1,5 segundos entre envíos
        const tiempoTranscurrido = Date.now() - ultimoEnvio;
        const esperaRestante = Math.max(0, 1500 - tiempoTranscurrido);

        if (esperaRestante > 0) {
            await esperar(esperaRestante);
        }

        ultimoEnvio = Date.now();

        // Preparar el límite de tiempo de 30 segundos
        const controlador = new AbortController();

        const temporizador = setTimeout(() => {
            controlador.abort();
        }, 30000);

        let respuesta;
        let textoRespuesta;

        try {
            respuesta = await fetch(WEBHOOK_URL, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    sessionId,
                    mensaje,
                    fecha: new Date().toISOString()
                }),
                signal: controlador.signal
            });

            textoRespuesta = await respuesta.text();

        } finally {
            clearTimeout(temporizador);
        }

        // Comprobar errores HTTP
        if (!respuesta.ok) {
            throw new Error("HTTP_" + respuesta.status);
        }

        // Procesar la respuesta
        const resultado = extraerRespuesta(textoRespuesta);

        agregarMensaje(resultado, "agente");
        mostrarEstado("Respuesta recibida correctamente.", "exito");

    } catch (error) {

        // Diferenciar los tipos de errores
        if (error.name === "AbortError") {
            mostrarEstado("Se agotó el tiempo de espera. Intentá nuevamente.", "error");
            agregarMensaje("La consulta tardó demasiado. Por favor, volvé a intentarlo.", "agente");

        } else if (error.message.startsWith("HTTP_")) {
            const codigo = error.message.replace("HTTP_", "");

            mostrarEstado("Error HTTP " + codigo, "error");

            agregarMensaje(
                "Make respondió con error (código " + codigo + "). Revisá que tu escenario esté en Active o que hayas apretado Run once.",
                "agente"
            );

        } else if (error instanceof TypeError) {
            mostrarEstado("Error de conexión.", "error");
            agregarMensaje(
                "No se pudo conectar con el servidor. Revisá tu conexión y la URL del webhook.",
                "agente"
            );

        } else {
            mostrarEstado("Ocurrió un error inesperado.", "error");
            agregarMensaje(
                "Ocurrió un problema al procesar tu consulta. Intentá nuevamente.",
                "agente"
            );
        }

    } finally {
        // Siempre recuperar los controles
        cargando = false;
        botonEnviar.disabled = false;
        campoMensaje.disabled = false;
        campoMensaje.focus();
    }
}

// EVENTO DEL BOTÓN
botonEnviar.addEventListener("click", enviarMensaje);

// ENVIAR CON ENTER Y USAR SHIFT + ENTER PARA SALTAR DE LÍNEA
campoMensaje.addEventListener("keydown", (evento) => {
    if (evento.key === "Enter" && !evento.shiftKey) {
        evento.preventDefault();
        enviarMensaje();
    }
});

// COMPROBAR LA CONFIGURACIÓN AL INICIAR
if (
    typeof WEBHOOK_URL === "undefined" ||
    !WEBHOOK_URL ||
    WEBHOOK_URL.includes("ACA VA")
) {
    agregarMensaje(
        "Falta pegar la URL de tu webhook en config.js",
        "agente"
    );
}
