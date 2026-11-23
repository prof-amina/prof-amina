// Prof Amina — serveur (Node 20+, aucune dépendance)
// Conversation vocale en temps réel avec l'API Realtime d'OpenAI (WebRTC).
// Le téléphone parle directement à OpenAI avec une clé temporaire créée ici :
// la vraie clé OPENAI_API_KEY ne quitte jamais le serveur.
//
// Variables d'environnement :
//   OPENAI_API_KEY   (obligatoire)  clé API OpenAI (platform.openai.com)
//   ACCESS_CODE      (conseillé)    code demandé une fois sur le téléphone
//   REALTIME_MODEL   (optionnel)    défaut gpt-realtime-2.1 (moins cher : gpt-realtime-2.1-mini)
//   REALTIME_VOICE   (optionnel)    défaut marin
//   PORT             (optionnel)    défaut 3000

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const ACCESS_CODE = process.env.ACCESS_CODE || "";
const REALTIME_MODEL = process.env.REALTIME_MODEL || "gpt-realtime-2.1";
const REALTIME_VOICE = process.env.REALTIME_VOICE || "marin";
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
const PUBLIC_DIR = path.join(__dirname, "public");

const TOPICS = {
  presentation: "se présenter : bonjour, je m'appelle…, j'habite à…, je viens du Maroc, j'ai … enfants",
  courses: "faire les courses : je voudrais…, combien ça coûte ?, un kilo de…, merci, au revoir",
  medecin: "chez le médecin ou à la pharmacie : j'ai mal à…, depuis…, j'ai de la fièvre, un rendez-vous",
  transports: "les transports : le bus, le tramway, le ticket, où est l'arrêt ?, je descends ici",
  administration: "les papiers : la mairie, la CAF, la préfecture, mon nom, ma date de naissance, ma carte",
  chiffres: "les chiffres de 1 à 20, l'heure et les jours de la semaine",
  libre: "conversation libre et simple sur sa journée, sa famille, ce qu'elle aime",
};

function instructions(topic, history) {
  const theme = TOPICS[topic] || TOPICS.libre;
  let text = `Tu es Amina, une professeure de français marocaine, très patiente, chaleureuse et souriante. Tu parles au téléphone, à voix haute, avec ton élève.

TON ÉLÈVE : une femme adulte marocaine. Elle parle UNIQUEMENT la darija marocaine. Elle débute complètement en français. Elle apprend à l'oral.

LANGUES — RÈGLE LA PLUS IMPORTANTE :
- Tu parles À ELLE en DARIJA MAROCAINE, avec l'accent marocain : explications, consignes, encouragements, questions.
- Tu utilises le FRANÇAIS uniquement pour les mots et phrases à apprendre.
- JAMAIS d'arabe classique (fusha), jamais d'arabe du Moyen-Orient. Utilise les mots marocains : واش، شنو، كيفاش، بغيت، دابا، مزيان، بزاف، عافاك، شوية، صافي، يالاه، زوين.
- Si elle te parle en darija, réponds-lui en darija.
- Quand elle progresse bien, tu peux mettre un peu plus de français, mais toujours expliqué en darija.

THÈME DE LA LEÇON : ${theme}

MÉTHODE :
1. Tours de parole TRÈS COURTS : 1 ou 2 phrases, puis tu te tais et tu la laisses parler.
2. Pour chaque phrase française : dis en darija ce qu'elle veut dire, puis dis la phrase française LENTEMENT et clairement, puis demande-lui en darija de la répéter (« عاودي معايا »).
3. Une seule nouvelle chose à la fois. Répète souvent ce qu'elle a déjà appris.
4. Quand elle répète : si c'est à peu près bien, félicite-la chaleureusement (« مزيان بزاف! Bravo! ») et passe à la suite. Si ce n'est pas encore ça, corrige UN seul son, gentiment, et redis le mot lentement.
5. Si elle ne comprend pas, dit « ما فهمتش » ou hésite : réexplique plus simplement en darija, puis redis le français encore plus lentement.
6. Petit à petit, pose-lui des questions simples en français (« Comment tu t'appelles ? ») et aide-la à répondre.
7. Si elle te demande autre chose (traduire un mot, une aide pour un papier), aide-la en darija, puis reviens doucement à la leçon.
8. Ne sois jamais sévère. Elle doit se sentir en confiance et avoir envie de revenir.

DÉBUT : salue-la chaleureusement en darija, présente-toi (« أنا أمينة، الأستاذة ديالك ديال الفرنسية »), explique en une phrase comment on va travailler, puis commence le thème.`;

  if (Array.isArray(history) && history.length) {
    const lines = history
      .slice(-20)
      .filter((h) => h && typeof h.text === "string")
      .map((h) => `${h.role === "user" ? "Élève" : "Amina"} : ${h.text.slice(0, 300)}`)
      .join("\n");
    text += `\n\nVOUS AVEZ DÉJÀ TRAVAILLÉ ENSEMBLE SUR CE THÈME. Fin de la dernière séance :\n${lines}\n\nCommence par la saluer, rappelle en darija ce qu'elle a appris la dernière fois, fais-lui répéter une phrase pour réviser, puis continue.`;
  }
  return text;
}

function send(res, status, obj) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(obj));
}

function readBody(req, limit = 256 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) {
        reject(new Error("Requête trop grosse"));
        req.destroy();
      } else chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function createRealtimeSecret(topic, history) {
  const body = {
    expires_after: { anchor: "created_at", seconds: 600 },
    session: {
      type: "realtime",
      model: REALTIME_MODEL,
      instructions: instructions(topic, history),
      audio: {
        input: {
          // Détection automatique de fin de parole, patiente pour une débutante
          turn_detection: { type: "semantic_vad", eagerness: "low" },
          // Transcription de ce qu'elle dit (pour l'affichage à l'écran)
          transcription: { model: "whisper-1" },
          noise_reduction: { type: "near_field" },
        },
        output: { voice: REALTIME_VOICE },
      },
    },
  };
  const r = await fetch(`${OPENAI_BASE_URL}/realtime/client_secrets`, {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`OpenAI ${r.status}: ${text.slice(0, 400)}`);
  const data = JSON.parse(text);
  return data.value || data.client_secret?.value;
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

function serveStatic(req, res) {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (p === "/") p = "/index.html";
  const file = path.normalize(path.join(PUBLIC_DIR, p));
  if (!file.startsWith(PUBLIC_DIR)) return send(res, 403, { error: "interdit" });
  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, { error: "introuvable" });
    res.writeHead(200, {
      "Content-Type": MIME[path.extname(file)] || "application/octet-stream",
      "Cache-Control": "no-cache",
    });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  if (!url.pathname.startsWith("/api/")) return serveStatic(req, res);

  if (url.pathname === "/api/health")
    return send(res, 200, { ok: true, mode: "realtime", model: REALTIME_MODEL, voice: REALTIME_VOICE, keySet: !!OPENAI_API_KEY });

  if (ACCESS_CODE && req.headers["x-access-code"] !== ACCESS_CODE) return send(res, 401, { error: "code" });
  if (url.pathname === "/api/check") return send(res, 200, { ok: true });
  if (!OPENAI_API_KEY) return send(res, 500, { error: "OPENAI_API_KEY manquante sur le serveur" });

  try {
    if (url.pathname === "/api/session" && req.method === "POST") {
      const { topic, history } = JSON.parse((await readBody(req)).toString("utf8") || "{}");
      const value = await createRealtimeSecret(topic, history);
      if (!value) throw new Error("Pas de clé temporaire reçue");
      return send(res, 200, { value, model: REALTIME_MODEL });
    }
    send(res, 404, { error: "introuvable" });
  } catch (e) {
    console.error(e);
    send(res, 502, { error: String(e.message || e) });
  }
});

server.listen(PORT, () => console.log(`Prof Amina (temps réel, ${REALTIME_MODEL}) prête sur le port ${PORT}`));
