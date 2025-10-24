// /api/waba-proxy/[...path].js
// Proxy/Relay para ver qué envía Flexxus y qué responde Meta.
// Cambiá el "URL" en Flexxus para que pegue acá en lugar de graph.facebook.com

export default async function handler(req, res) {
  try {
    // path que Flexxus arma (ej: 869388702920570/messages)
    const parts = Array.isArray(req.query.path) ? req.query.path : [];
    const destUrl = `https://graph.facebook.com/${parts.join("/")}`;

    // Cuerpo que envía Flexxus
    // (si body es string lo uso tal cual; si es objeto, lo serializo)
    let bodyToSend = undefined;
    if (req.method !== "GET" && req.method !== "HEAD") {
      if (typeof req.body === "string") bodyToSend = req.body;
      else bodyToSend = JSON.stringify(req.body || {});
    }

    // Header Authorization que manda Flexxus (si no lo manda, puedo inyectar uno de env)
    const incomingAuth = req.headers["authorization"];
    const auth =
      incomingAuth && String(incomingAuth).trim() !== ""
        ? incomingAuth
        : process.env.WHATSAPP_TOKEN
        ? `Bearer ${process.env.WHATSAPP_TOKEN}`
        : undefined;

    const contentType = req.headers["content-type"] || "application/json";

    // Log completo de la solicitud que hizo Flexxus
    console.log("➡️ FLEXXUS → PROXY", {
      method: req.method,
      destUrl,
      headers: {
        authorization: auth ? "[present]" : "[missing]",
        "content-type": contentType,
      },
      body: bodyToSend ? tryParse(bodyToSend) : null,
    });

    // Reenvío a Meta
    const metaRes = await fetch(destUrl, {
      method: req.method,
      headers: {
        ...(auth ? { Authorization: auth } : {}),
        "Content-Type": contentType,
      },
      body: bodyToSend,
    });

    const metaText = await metaRes.text();

    // Log de la respuesta de Meta
    console.log("⬅️ META → PROXY", {
      status: metaRes.status,
      body: safeJson(metaText),
    });

    // Devuelvo a Flexxus lo mismo que respondió Meta
    res.status(metaRes.status).send(metaText);
  } catch (e) {
    console.error("💥 PROXY ERROR", e?.response?.data || e?.message || e);
    res.status(500).json({ error: "proxy_failed", detail: String(e?.message || e) });
  }
}

function tryParse(str) {
  try { return JSON.parse(str); } catch { return str; }
}
function safeJson(str) {
  try { return JSON.parse(str); } catch { return str; }
}
