// Prof de français vocal — serveur (Node 20+, aucune dépendance)
// Variables d'environnement :
//   GROQ_API_KEY  (obligatoire)  clé API Groq
//   ACCESS_CODE   (conseillé)    code demandé une fois sur le téléphone
//   GROQ_MODEL    (optionnel)    modèle de discussion, défaut openai/gpt-oss-120b
//   STT_MODEL     (optionnel)    modèle de transcription, défaut whisper-large-v3
//   PORT          (optionnel)    défaut 3000

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const GROQ_API_KEY = process.env.GROQ_API_KEY || "";
const ACCESS_CODE = process.env.ACCESS_CODE || "";
const GROQ_MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b";
const STT_MODEL = process.env.STT_MODEL || "whisper-large-v3";
const GROQ_BASE_URL = process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1";
const PUBLIC_DIR = path.join(__dirname, "public");

// Voix ElevenLabs (optionnel). Sans clé, le téléphone utilise sa propre voix.
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || "";
const ELEVEN_VOICE_AR = process.env.ELEVEN_VOICE_AR || "OfGMGmhShO8iL9jCkXy8"; // Ghizlane, darija marocaine
const ELEVEN_VOICE_FR = process.env.ELEVEN_VOICE_FR || ELEVEN_VOICE_AR; // voix multilingue : même prof
const ELEVEN_MODEL = process.env.ELEVEN_MODEL || "eleven_multilingual_v2";

const TOPICS = {
  presentation: "se présenter : bonjour, je m'appelle…, j'habite à…, je viens du Maroc, j'ai … enfants",
  courses: "faire les courses : je voudrais…, combien ça coûte ?, un kilo de…, merci, au revoir",
  medecin: "chez le médecin ou à la pharmacie : j'ai mal à…, depuis…, j'ai de la fièvre, un rendez-vous",
  transports: "les transports : le bus, le tramway, le ticket, où est l'arrêt ?, je descends ici",
  administration: "les papiers : la mairie, la CAF, la préfecture, mon nom, ma date de naissance, ma carte",
  chiffres: "les chiffres de 1 à 20, l'heure et les jours de la semaine",
  libre: "conversation libre et simple sur sa journée, sa famille, ce qu'elle aime",
};

function systemPrompt(topic) {
  const theme = TOPICS[topic] || TOPICS.libre;
  return `Tu es Prof Amina, une professeure de français très patiente, chaleureuse et encourageante.
Ton élève est une femme adulte marocaine. Elle parle uniquement la darija marocaine et débute complètement en français. Elle apprend uniquement à l'oral : tout ce que tu écris sera LU À VOIX HAUTE par le téléphone.

THÈME DE LA LEÇON : ${theme}

RÈGLES :
1. Réponses très courtes : 1 à 3 segments maximum. Phrases françaises de 2 à 8 mots.
2. Une seule nouvelle chose à la fois. Avance doucement, répète souvent.
3. Schéma habituel : tu dis une phrase en français, tu expliques très brièvement en darija ce qu'elle veut dire, puis tu lui demandes (en darija) de la répéter.
4. Si elle répond en darija, ne comprend pas, dit « ما فهمتش » ou appuie sur le bouton « je n'ai pas compris » : explique en darija marocaine simple, puis redis la phrase française.
5. Si elle répète à peu près correctement : félicite-la (par exemple « Bravo ! » ou « مزيان بزاف ») et passe à l'étape suivante. Le texte que tu reçois vient d'une reconnaissance vocale imparfaite : accepte une réponse proche, ne sois jamais sévère.
6. Petit à petit, pose-lui des questions simples en français pour qu'elle réponde elle-même.
7. La darija s'écrit en lettres arabes, avec de vrais mots marocains (واش، كيفاش، بغيت، دابا، مزيان، عافاك، شنو، فين). JAMAIS d'arabe classique littéraire.
8. Pas d'emoji, pas de markdown, pas de transcription phonétique, pas de parenthèses : seulement des phrases à dire.

FORMAT DE RÉPONSE : uniquement ce JSON, rien d'autre :
{"segments":[{"lang":"fr","text":"..."},{"lang":"ar","text":"..."}]}
"lang" vaut "fr" pour le français et "ar" pour la darija. Ne mélange jamais les deux langues dans un même segment.`;
}

const hasArabic = (s) => /[؀-ۿ]/.test(s);

function parseSegments(content) {
  try {
    const m = content.match(/\{[\s\S]*\}/);
    const obj = JSON.parse(m ? m[0] : content);
    const segs = (obj.segments || [])
      .filter((s) => s && typeof s.text === "string" && s.text.trim())
      .map((s) => ({ lang: s.lang === "ar" || hasArabic(s.text) ? "ar" : "fr", text: s.text.trim() }));
    if (segs.length) return segs;
  } catch (_) {}
  // Secours : une ligne = un segment, langue devinée
  return content
    .split(/\n+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => ({ lang: hasArabic(t) ? "ar" : "fr", text: t }));
}

function send(res, status, obj) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(obj));
}

function readBody(req, limit = 15 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) {
        reject(new Error("Fichier trop gros"));
        req.destroy();
      } else chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function transcribe(audioBuf, mime) {
  const ext = mime.includes("mp4") ? "mp4" : mime.includes("ogg") ? "ogg" : "webm";
  const form = new FormData();
  form.append("file", new Blob([audioBuf], { type: mime }), `audio.${ext}`);
  form.append("model", STT_MODEL);
  form.append("temperature", "0");
  form.append("response_format", "json");
  // Indice pour Whisper : conversation mélangeant darija et français
  form.append("prompt", "Bonjour, je m'appelle Fatima. السلام، ما فهمتش، عافاك عاود. Merci, au revoir.");
  const r = await fetch(`${GROQ_BASE_URL}/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${GROQ_API_KEY}` },
    body: form,
  });
  if (!r.ok) throw new Error(`Transcription ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const data = await r.json();
  return (data.text || "").trim();
}

async function chat(messages, topic) {
  const body = {
    model: GROQ_MODEL,
    messages: [{ role: "system", content: systemPrompt(topic) }, ...messages],
    temperature: 0.6,
    max_completion_tokens: 600,
    response_format: { type: "json_object" },
  };
  if (GROQ_MODEL.startsWith("openai/gpt-oss")) body.reasoning_effort = "low";
  const r = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${GROQ_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`IA ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const data = await r.json();
  return parseSegments(data.choices?.[0]?.message?.content || "");
}

async function tts(text, lang) {
  const voice = lang === "ar" ? ELEVEN_VOICE_AR : ELEVEN_VOICE_FR;
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_64`, {
    method: "POST",
    headers: { "xi-api-key": ELEVENLABS_API_KEY, "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({
      text,
      model_id: ELEVEN_MODEL,
      voice_settings: { stability: 0.6, similarity_boost: 0.8, speed: lang === "fr" ? 0.85 : 0.95 },
    }),
  });
  if (!r.ok) throw new Error(`Voix ${r.status}: ${(await r.text()).slice(0, 300)}`);
  return Buffer.from(await r.arrayBuffer());
}

function cleanMessages(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-24)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }));
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

  if (url.pathname === "/api/health") return send(res, 200, { ok: true, model: GROQ_MODEL, keySet: !!GROQ_API_KEY });

  if (ACCESS_CODE && req.headers["x-access-code"] !== ACCESS_CODE) return send(res, 401, { error: "code" });
  if (url.pathname === "/api/check") return send(res, 200, { ok: true, cloudVoice: !!ELEVENLABS_API_KEY });
  if (!GROQ_API_KEY) return send(res, 500, { error: "GROQ_API_KEY manquante sur le serveur" });
  if (req.method !== "POST") return send(res, 405, { error: "POST uniquement" });

  try {
    if (url.pathname === "/api/transcribe") {
      const audio = await readBody(req);
      if (audio.length < 1000) return send(res, 200, { text: "" });
      const text = await transcribe(audio, req.headers["content-type"] || "audio/webm");
      return send(res, 200, { text });
    }
    if (url.pathname === "/api/chat") {
      const { messages, topic } = JSON.parse((await readBody(req, 1024 * 1024)).toString("utf8"));
      const segments = await chat(cleanMessages(messages), topic);
      return send(res, 200, { segments });
    }
    if (url.pathname === "/api/tts") {
      if (!ELEVENLABS_API_KEY) return send(res, 404, { error: "pas de voix ElevenLabs" });
      const { text, lang } = JSON.parse((await readBody(req, 64 * 1024)).toString("utf8"));
      const audio = await tts(String(text || "").slice(0, 600), lang === "ar" ? "ar" : "fr");
      res.writeHead(200, { "Content-Type": "audio/mpeg", "Content-Length": audio.length });
      return res.end(audio);
    }
    send(res, 404, { error: "introuvable" });
  } catch (e) {
    console.error(e);
    send(res, 502, { error: String(e.message || e) });
  }
});

server.listen(PORT, () => console.log(`Prof de français prêt sur le port ${PORT} (modèle ${GROQ_MODEL})`));
