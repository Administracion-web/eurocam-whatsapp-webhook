// /api/whatsapp-webhook.js
// EUROCAM: respuestas por palabra clave + soporte para botones (quick replies)

const VERIFY_TOKEN = process.env.VERIFY_TOKEN || "eurocam123";
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;             // token largo de Meta
const PHONE_NUMBER_ID = process.env.WABA_PHONE_NUMBER_ID;      // p.ej. "869388702920570"
const TEMPLATE_NAME = process.env.TEMPLATE_NAME_AUTOREPLY || "respuesta_automatica_eurocam";
const TEMPLATE_LANG = process.env.TEMPLATE_LANG_CODE || "es";  // usa "es" si tu plantilla no tiene es_AR

const WABA_URL = (id) => `https://graph.facebook.com/v20.0/${id}/messages`;

async function postWABA(payload) {
  const res = await fetch(WABA_URL(PHONE_NUMBER_ID), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${WHATSAPP_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error("❌ WABA ERROR:", res.status, text);
  } else {
    console.log("✅ WABA OK:", res.status, text);
  }
  return res.ok;
}

async function sendText(to, body) {
  return postWABA({
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: { body },
  });
}

async function sendTemplate(to) {
  // Enviá la plantilla si ya está APROBADA (sino va a fallar)
  return postWABA({
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: TEMPLATE_NAME,
      language: { code: TEMPLATE_LANG }, // "es" ó "es_AR" según tu plantilla
    },
  });
}

// Extrae selección de botón (plantillas quick-reply o mensajes interactivos)
function pickButton(msg) {
  // Plantilla quick reply: messages[0].button.text
  if (msg?.button?.text) return (msg.button.text || "").toLowerCase();
  // Interactivo: messages[0].interactive.button_reply.text
  const br = msg?.interactive?.button_reply;
  if (br?.text) return (br.text || "").toLowerCase();
  if (br?.id) return (br.id || "").toLowerCase();
  return null;
}

// Respuesta por palabra clave (ventas/administración) para EUROCAM
function buildAutoReply(messageText) {
  const t = (messageText || "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

  const ventas =
    "📍 *Sucursales de Ventas - EUROCAM*\n" +
    "🏢 Mataderos: +54 9 11 7361-4719\n" +
    "🏢 Canning:   +54 9 11 7063-5836";

  const admin =
    "💼 *Administración - EUROCAM*\n" +
    "+54 9 11 2264-5064";

  const generic =
    "👋 Hola, este número es el canal automatizado de *EUROCAM*.\n" +
    "Escribí o elegí una opción:\n" +
    "• *Ventas*\n" +
    "• *Administración*";

  if (t.includes("venta")) return ventas; // cubre "venta" y "ventas"
  if (t.includes("administracion")) return admin; // cubre con/sin tilde

  return generic;
}

export default async function handler(req, res) {
  try {
    // Verificación de Meta (GET)
    if (req.method === "GET") {
      const mode = req.query["hub.mode"];
      const token = req.query["hub.verify_token"];
      const challenge = req.query["hub.challenge"];
      if (mode === "subscribe" && token === VERIFY_TOKEN) {
        return res.status(200).send(challenge);
      }
      return res.status(403).send("Error de verificación");
    }

    // Mensajes entrantes (POST)
    if (req.method === "POST") {
      const body = req.body || {};
      const value = body?.entry?.[0]?.changes?.[0]?.value;

      // ignorar callbacks de status
      if (value?.statuses) return res.status(200).end();

      const msg = value?.messages?.[0];
      const from = msg?.from;
      if (!from || !msg) return res.status(200).end();

      console.log("📩 Mensaje recibido de", from, ":", msg?.text?.body || "(no-text)");

      // 1) Si viene de botón, tratamos como palabra clave
      const buttonChoice = pickButton(msg);
      if (buttonChoice) {
        const reply = buildAutoReply(buttonChoice);
        await sendText(from, reply);
        return res.status(200).end();
      }

      // 2) Si escribió texto, intentamos match por palabra clave
      const text = (msg?.text?.body || "").toString();
      if (text) {
        const reply = buildAutoReply(text);
        // Si respondió genérico, podemos intentar plantilla (si ya está aprobada)
        if (reply.includes("canal automatizado")) {
          const ok = await sendTemplate(from);
          if (!ok) await sendText(from, reply); // fallback si la plantilla aún está en revisión
        } else {
          await sendText(from, reply);
        }
        return res.status(200).end();
      }

      // 3) Si no hay texto ni botón (ej. medios), devolvemos ayuda genérica
      const ok = await sendTemplate(from);
      if (!ok) {
        await sendText(
          from,
          "👋 Hola, este número es el canal automatizado de *EUROCAM*.\n" +
            "Escribí *Ventas* o *Administración* para continuar."
        );
      }
      return res.status(200).end();
    }

    return res.status(404).send("Not found");
  } catch (e) {
    console.error("💥 Error en webhook:", e?.response?.data || e?.message || e);
    // Meta exige 200 para no reintentar en loop
    return res.status(200).end();
  }
}

// Para que Vercel parsee JSON de la request
export const config = { api: { bodyParser: true } };
