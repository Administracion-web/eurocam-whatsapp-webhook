// /api/wa-status.ts
// Endpoint simple para VERIFICAR el webhook y LOGUEAR statuses de WhatsApp.
// Sin axios. Node 18+ en Vercel.

const VERIFY_TOKEN = process.env.VERIFY_TOKEN || "eurocam123";

export default async function handler(req: any, res: any) {
  // 1) Verificación (GET)
  if (req.method === "GET") {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];
    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      console.log("✅ Webhook STATUS verificado.");
      return res.status(200).send(challenge);
    }
    return res.status(403).end();
  }

  // 2) Recepción (POST)
  if (req.method === "POST") {
    try {
      const payload =
        typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});

      // WhatsApp Cloud API envía estructura: object -> entry[] -> changes[] -> value
      const entries = payload?.entry || [];
      for (const e of entries) {
        const changes = e?.changes || [];
        for (const c of changes) {
          const value = c?.value;
          // Si es un status de mensaje
          const statuses = value?.statuses || [];
          for (const st of statuses) {
            const log = {
              TAG: "WA_STATUS",
              id: st?.id,                // wamid del mensaje
              status: st?.status,        // sent / delivered / read / failed / deleted
              recipient_id: st?.recipient_id,
              timestamp: st?.timestamp,
              conversation: st?.conversation,
              pricing: st?.pricing,
              errors: st?.errors,        // si falló, viene acá el motivo
            };
            console.log(JSON.stringify(log));
          }

          // (Opcional) Si también querés ver mensajes entrantes:
          const messages = value?.messages || [];
          for (const m of messages) {
            console.log(
              JSON.stringify({
                TAG: "WA_INBOUND",
                from: m?.from,
                type: m?.type,
                text: m?.text?.body,
              })
            );
          }
        }
      }

      return res.status(200).end(); // siempre 200 para que Meta no reintente
    } catch (err) {
      console.error("❌ Error en /wa-status:", err);
      return res.status(200).end();
    }
  }

  return res.status(404).end();
}
