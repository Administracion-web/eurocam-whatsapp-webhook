// api/whatsapp-webhook.js
import axios from 'axios';

// Variables de entorno (las vas a cargar en Vercel)
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;                 // ej: eurocam123
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;             // "permanent token" de Meta
const WABA_PHONE_NUMBER_ID = process.env.WABA_PHONE_NUMBER_ID; // ej: 11xxxxxxxxxxxxx
const TEMPLATE_NAME_AUTOREPLY = process.env.TEMPLATE_NAME_AUTOREPLY || 'respuesta_automatica_eurocam'; // tu template aprobado

export default async function handler(req, res) {
  try {
    // 1) Verificación inicial del webhook (Meta hace un GET)
    if (req.method === 'GET') {
      const mode = req.query['hub.mode'];
      const token = req.query['hub.verify_token'];
      const challenge = req.query['hub.challenge'];

      if (mode === 'subscribe' && token === VERIFY_TOKEN) {
        return res.status(200).send(challenge);
      } else {
        return res.status(403).send('Error de verificación');
      }
    }

    // 2) Recepción de eventos (POST)
    if (req.method === 'POST') {
      const body = req.body;

      // Por si vienen mensajes
      const message = body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
      if (message) {
        const from = message.from; // número del usuario
        const text = message?.text?.body?.toLowerCase?.() || '';

        console.log('📩 Mensaje recibido de', from, ':', text);

        // Enviar template automático
        try {
          await axios.post(
            `https://graph.facebook.com/v19.0/${WABA_PHONE_NUMBER_ID}/messages`,
            {
              messaging_product: 'whatsapp',
              to: from,
              type: 'template',
              template: {
                name: TEMPLATE_NAME_AUTOREPLY,
                language: { code: 'es_AR' }
              }
            },
            {
              headers: {
                Authorization: `Bearer ${WHATSAPP_TOKEN}`,
                'Content-Type': 'application/json'
              }
            }
          );
          console.log('✅ Plantilla enviada correctamente');
        } catch (err) {
          console.error('❌ Error al enviar la plantilla:', err?.response?.data || err?.message);
        }
      }

      // SIEMPRE responder 200 a Meta
      return res.status(200).send('EVENT_RECEIVED');
    }

    return res.status(404).send('Not found');
  } catch (error) {
    console.error('❌ Error en webhook:', error?.response?.data || error?.message);
    return res.status(500).send('Server error');
  }
}

// Importante para que Vercel parsee el JSON del POST
export const config = {
  api: {
    bodyParser: true
  }
};
