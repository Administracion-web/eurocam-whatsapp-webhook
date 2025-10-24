// /api/whatsapp-webhook.js
// EUROCAM – Webhook con logs detallados de status (error_data), auto-reply y debug de envíos

const VERIFY_TOKEN = process.env.VERIFY_TOKEN || "eurocam123";
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;            // token largo de Meta
const PHONE_NUMBER_ID = process.env.WABA_PHONE_NUMBER_ID;     // ej: "869388702920570"
const TEMPLATE_NAME =
  process.env.TEMPLATE_NAME_AUTOREPLY || "respuesta_automatica_eurocam";
const TEMPLATE_LANG = process.env.TEMPLATE_LANG_CODE || "es"; // "es" o "es_AR"

// Forzamos debug=all para ver warnings del Graph en cada envío
const WABA_URL = (id) =>
  `https://graph.facebook.com/v20.0/${id}/messages?debug=all`;

async function postWABA(payload) {
  const url = WABA_URL(PHONE_NUMBER_ID);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${WHATSAPP_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const text = await res.text();

    // Log SIEMPRE request y response para depurar
    console.log("➡️ META REQ:", JSON.stringify(payload));
    console.log("⬅️ META RES:", res.status, text);

    if (!res.ok) {
      console.error("❌ WABA ERROR HTTP:", res.status, text);
    }
    return res.ok;
  } catch (e) {
    console.error("💥 WABA FETCH ERROR:", e?.message || e);
    return false;
  }
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
  return postWABA({
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: TEMPLATE_NAME,
      language: { code: TEMPLATE_LANG },
    },
  });
}

// Lee selección de botón (template quick reply o interactive)
function pickButton(msg) {
  if (msg?.button?.text) return (msg.button.text || "").toLowerCase();
  const br = msg?.interactive?.button_reply;
  if (br?.text) return (br.text || "").toLowerCase();
  if (br?.id) return (br.id || "").toLowerCase();
  return null;
}

// Respuesta por palabra clave para EUROCAM
function buildAutoReply(messageText) {
  const t = (messageText || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

  const ventas =
    "📍 *Sucursales de Ventas - EUROCAM*\n" +
    "🏢 Mataderos: +54 9 11 7361-4719\n" +
    "🏢 Canning:   +54 9 11 7063-5836";

  const admin =
    "💼 *Administración - EUROCAM*\n" + "+54 9 11 2264-5064";

  const generic =
    "👋 Hola, este número es el canal automatizado de *EUROCAM*.\n" +
    "Escribí o elegí una opción:\n" +
    "• *Ventas*\n" +
    "• *Administración*";

  if (t.includes("venta")) return ventas; // venta / ventas
  if (t.includes("administracion")) return admin;

  return generic;
}

export default async function handler(req, res) {
  try {
    // 1) Verificación de Meta (GET)
    if (req.method === "GET") {
      const mode = req.query["hub.mode"];
      const token = req.query["hub.verify_token"];
      const challenge = req.query["hub.challenge"];

      if (mode === "subscribe" && token === VERIFY_TOKEN) {
        console.log("✅ Webhook verificado");
        return res.status(200).send(challenge);
      }
      console.warn("❌ Verificación fallida");
      return res.status(403).send("Error de verificación");
    }

    // 2) Entradas (POST)
    if (req.method === "POST") {
      // Aceptar string/objeto
      const body =
        typeof req.body === "string"
          ? JSON.parse(req.body || "{}")
          : req.body || {};

      const value = body?.entry?.[0]?.changes?.[0]?.value;

      // 2a) STATUS CALLBACKS (acá viene el 131000 con error_data)
      if (value?.statuses?.length) {
        for (const s of value.statuses) {
          console.log("🧾 STATUS CALLBACK\n" + JSON.stringify(s, null, 2));

          if (s.errors?.length) {
            for (const e of s.errors) {
              console.error("❌ STATUS ERROR\n" + JSON.stringify(e, null, 2));
              if (e.error_data) {
                console.error(
                  "🔎 STATUS ERROR_DATA\n" + JSON.stringify(e.error_data, null, 2)
                );
              }
            }
          }
        }
        // Siempre 200 para que Meta no reintente indefinidamente
        return res.status(200).end();
      }

      // 2b) Mensajes entrantes
      const msg = value?.messages?.[0];
      const from = msg?.from;
      if (!from || !msg) {
        // Nada relevante (por ejemplo, cambios de perfil, etc.)
        return res.status(200).end();
      }

      console.log(
        "📩 Mensaje recibido de",
        from,
        ":",
        msg?.text?.body || msg?.type || "(sin texto)"
      );

      // Botón → tratamos como palabra clave
      const buttonChoice = pickButton(msg);
      if (buttonChoice) {
        const reply = buildAutoReply(buttonChoice);
        await sendText(from, reply);
        return res.status(200).end();
      }

      // Texto → palabra clave
      const text = (msg?.text?.body || "").toString();
      if (text) {
        const reply = buildAutoReply(text);
        if (reply.includes("canal automatizado")) {
          // intentamos plantilla si está aprobada
          const ok = await sendTemplate(from);
          if (!ok) await sendText(from, reply); // fallback
        } else {
          await sendText(from, reply);
        }
        return res.status(200).end();
      }

      // Sin texto ni botón → intentamos plantilla, si no, ayuda
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
    console.error(
      "💥 Error en webhook:",
      e?.response?.data || e?.message || e
    );
    // Meta exige 200 para no reintentar en loop
    return res.status(200).end();
  }
}

// Permitimos JSON en body
export const config = { api: { bodyParser: true } };

