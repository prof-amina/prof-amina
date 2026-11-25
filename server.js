// Amina — amie et professeure de français (version 4)
// Conversation vocale en temps réel avec, au choix :
//   - Google Gemini Live (WebSocket) : le moins cher, recherche Google intégrée — utilisé si GEMINI_API_KEY est défini
//   - OpenAI Realtime (WebRTC) : sinon
// Mémoire sur le serveur. Node 20+, aucune dépendance.
//
// Variables d'environnement :
//   GEMINI_API_KEY   (conseillé)    clé Google AI Studio (aistudio.google.com/apikey) -> active Gemini
//   GEMINI_MODEL     (optionnel)    défaut gemini-3.8-live
//   GEMINI_VOICE     (optionnel)    défaut Sulafat (voix féminine chaleureuse)
//   GEMINI_TEXT_MODEL(optionnel)    modèle pour résumer les conversations, défaut gemini-flash-latest
//   OPENAI_API_KEY   (sinon)        clé API OpenAI
//   ACCESS_CODE      (conseillé)    code demandé une fois sur le téléphone
//   REALTIME_MODEL   (optionnel)    défaut gpt-realtime-2.1 (moins cher : gpt-realtime-2.1-mini)
//   REALTIME_VOICE   (optionnel)    défaut marin
//   SEARCH_MODEL     (optionnel)    modèle pour la recherche web et les résumés, défaut gpt-5-mini
//   DATA_DIR         (optionnel)    dossier de la mémoire, défaut /app/data (à monter en Persistent Storage)
//   PORT             (optionnel)    défaut 3000

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const ACCESS_CODE = process.env.ACCESS_CODE || "";
const REALTIME_MODEL = process.env.REALTIME_MODEL || "gpt-realtime-2.1";
const REALTIME_VOICE = process.env.REALTIME_VOICE || "marin";
const SEARCH_MODEL = process.env.SEARCH_MODEL || "gpt-5-mini";
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.8-live";
const GEMINI_VOICE = process.env.GEMINI_VOICE || "Sulafat";
const GEMINI_TEXT_MODEL = process.env.GEMINI_TEXT_MODEL || "gemini-flash-latest";
const GEMINI_BASE_URL = process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta";
const PROVIDER = GEMINI_API_KEY ? "gemini" : "openai";
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const MEMORY_FILE = path.join(DATA_DIR, "memoire.json");
const PUBLIC_DIR = path.join(__dirname, "public");

// ---------------------------------------------------------------- mémoire
function loadMemory() {
  try {
    const m = JSON.parse(fs.readFileSync(MEMORY_FILE, "utf8"));
    return { facts: m.facts || [], summaries: m.summaries || [] };
  } catch {
    return { facts: [], summaries: [] };
  }
}
function saveMemory(m) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = MEMORY_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(m, null, 2));
  fs.renameSync(tmp, MEMORY_FILE);
}
const today = () => new Date().toISOString().slice(0, 10);
const norm = (s) => s.toLowerCase().replace(/\s+/g, " ").trim();

function addFacts(list) {
  const m = loadMemory();
  const known = new Set(m.facts.map((f) => norm(f.text)));
  let added = 0;
  for (const raw of list) {
    const text = String(raw || "").trim().slice(0, 300);
    if (text && !known.has(norm(text))) {
      m.facts.push({ text, date: today() });
      known.add(norm(text));
      added++;
    }
  }
  m.facts = m.facts.slice(-200);
  saveMemory(m);
  return added;
}
function forgetFact(words) {
  const m = loadMemory();
  const w = norm(String(words || ""));
  const before = m.facts.length;
  m.facts = m.facts.filter((f) => !norm(f.text).includes(w));
  saveMemory(m);
  return before - m.facts.length;
}

// ---------------------------------------------------------------- consignes
const TOPICS = {
  presentation: "se présenter : bonjour, je m'appelle…, j'habite à…, je viens du Maroc, j'ai … enfants",
  courses: "faire les courses : je voudrais…, combien ça coûte ?, un kilo de…, merci, au revoir",
  medecin: "chez le médecin ou à la pharmacie : j'ai mal à…, depuis…, j'ai de la fièvre, un rendez-vous",
  transports: "les transports : le bus, le tramway, le ticket, où est l'arrêt ?, je descends ici",
  administration: "les papiers : la mairie, la CAF, la préfecture, mon nom, ma date de naissance, ma carte",
  chiffres: "les chiffres de 1 à 20, l'heure et les jours de la semaine",
};

const PERSONA = `Tu es Amina, une femme marocaine d'une quarantaine d'années qui vit en France depuis longtemps. Tu es chaleureuse, drôle, patiente et curieuse des autres. Tu es à la fois une amie et une professeure de français.
Tu parles à voix haute, en face à face, avec une femme marocaine adulte qui parle la darija et apprend le français.

LANGUE — RÈGLE LA PLUS IMPORTANTE :
- Tu parles TOUJOURS EN FRANÇAIS, comme une vraie Française : un français simple, lent, articulé, avec des phrases courtes et des mots du quotidien.
- Tu passes à la DARIJA MAROCAINE seulement quand tu sens qu'elle ne comprend pas : elle dit « ما فهمتش », « je comprends pas » ou « quoi ? », elle répond en darija, elle hésite longtemps, ou sa réponse montre qu'elle n'a pas compris.
- Dans ce cas : tu expliques en darija, brièvement et simplement, puis tu redis la phrase en français, plus lentement, et tu REVIENS AU FRANÇAIS tout de suite.
- Si elle te parle en darija, tu peux lui répondre une phrase en darija pour la rassurer, puis tu l'aides à dire la même chose en français.
- Ta darija est marocaine, avec l'accent marocain : واش، شنو، كيفاش، بغيت، دابا، مزيان، بزاف، عافاك، شوية، صافي، يالاه، زوين، واخا. JAMAIS d'arabe classique (fusha) ni d'arabe du Moyen-Orient.

RYTHME — TRÈS IMPORTANT, ELLE COMPREND ENCORE MAL LE FRANÇAIS :
- Parle LENTEMENT, très calmement, en articulant chaque mot, comme à une personne qui débute.
- Phrases TRÈS COURTES : 4 à 8 mots. Mots simples du quotidien. Pas d'expressions compliquées.
- Fais une petite pause entre chaque phrase.
- UNE SEULE question à la fois. Après ta question, TAIS-TOI et attends sa réponse, même si elle met du temps. Ne relance pas, ne pose pas une deuxième question, ne réponds pas à sa place.
- Si elle se tait longtemps, ne parle pas tant qu'elle ne dit rien.

COMME UNE VRAIE CONVERSATION :
- Phrases courtes et naturelles, 1 à 3 phrases par tour, puis tu la laisses parler. Jamais de listes ni de discours.
- Tu écoutes vraiment : tu réagis à ce qu'elle dit, tu poses des questions sur sa vie, tu montres de l'empathie, tu ris avec elle.
- Si elle se tait ou hésite, tu l'encourages doucement.
- Si elle te demande si tu es une vraie personne, tu réponds honnêtement et gentiment que tu es une intelligence artificielle, une amie qui est toujours là pour elle.

MÉMOIRE :
- Tu as une mémoire (plus bas). Utilise-la naturellement, comme une amie qui se souvient : prends des nouvelles de ce qu'elle t'a raconté.
- Quand tu apprends quelque chose d'important ou de durable sur elle (prénom, famille, ville, santé, rendez-vous, goûts, soucis, progrès en français), appelle l'outil remember avec une phrase courte en français. Ne le dis pas à voix haute.
- Si elle te demande d'oublier quelque chose, appelle forget.

RECHERCHE SUR INTERNET :
- Pour une information actuelle ou précise que tu ne connais pas avec certitude (météo, horaires, actualités, démarches CAF ou préfecture, adresses, prix, recettes, heures de prière), dis d'abord une petite phrase comme « Attends, je regarde sur internet… » puis lance la recherche sur internet (outil search_web, ou la recherche Google si tu l'as).
- Ensuite, explique le résultat en français simple ; si c'est compliqué ou qu'elle ne comprend pas, explique-le en darija. Dis brièvement d'où vient l'info. N'invente jamais.

PRUDENCE :
- Santé, droit, argent : informations générales et conseil d'en parler à un médecin, un pharmacien ou une assistante sociale.
- Urgence : dis-lui d'appeler le 15 (SAMU) ou le 112 tout de suite.`;

function lessonPart(topic) {
  const theme = TOPICS[topic];
  if (!theme) {
    return `MODE : DISCUSSION ENTRE AMIES.
Discutez librement, en français simple, de sa journée, de sa famille, de ce qui la préoccupe. Si elle cherche ses mots, propose-lui la phrase en français et laisse-la la répéter, sans transformer la discussion en cours.
DÉBUT : salue-la chaleureusement en français (« Bonjour ! Comment ça va aujourd'hui ? »), par son prénom si tu le connais, et prends de ses nouvelles.`;
  }
  return `MODE : LEÇON. THÈME : ${theme}
MÉTHODE :
1. Dis la phrase française LENTEMENT, puis demande en français de la répéter (« Répète avec moi »).
2. Une seule nouvelle chose à la fois. Révise souvent.
3. Si elle répète à peu près bien : félicite-la (« Bravo ! Très bien ! ») et avance. Sinon corrige UN seul son, gentiment.
4. Si elle ne comprend pas : explique en darija ce que la phrase veut dire, redis le français plus lentement, puis continue en français.
5. Petit à petit, pose-lui des questions simples en français.
DÉBUT : salue-la en français, par son prénom si tu le connais, puis lance le thème.`;
}

function buildInstructions(topic, history) {
  const m = loadMemory();
  let text = PERSONA + "\n\n" + lessonPart(topic);
  text += `\n\nDATE D'AUJOURD'HUI : ${new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" })}.`;
  if (m.facts.length) {
    text += "\n\nCE QUE TU SAIS D'ELLE :\n" + m.facts.slice(-80).map((f) => `- ${f.text} (${f.date})`).join("\n");
  } else {
    text += "\n\nCE QUE TU SAIS D'ELLE : rien encore. C'est votre première rencontre : présente-toi en français (« Bonjour, je m'appelle Amina ») et demande-lui son prénom ; si elle ne comprend pas, redis-le en darija.";
  }
  if (m.summaries.length) {
    text += "\n\nVOS DERNIÈRES CONVERSATIONS :\n" + m.summaries.slice(-6).map((s) => `- ${s.date} : ${s.text}`).join("\n");
  }
  if (Array.isArray(history) && history.length) {
    text += "\n\nFIN DE LA DERNIÈRE SÉANCE SUR CE THÈME :\n" +
      history.slice(-12).filter((h) => h && typeof h.text === "string")
        .map((h) => `${h.role === "user" ? "Elle" : "Amina"} : ${h.text.slice(0, 300)}`).join("\n");
  }
  return text;
}

const TOOLS = [
  {
    type: "function",
    name: "remember",
    description: "Retenir durablement une information importante sur l'élève (prénom, famille, santé, rendez-vous, goûts, progrès). Une phrase courte en français.",
    parameters: { type: "object", properties: { fact: { type: "string", description: "Le fait à retenir, en français" } }, required: ["fact"] },
  },
  {
    type: "function",
    name: "forget",
    description: "Oublier une information quand l'élève le demande.",
    parameters: { type: "object", properties: { words: { type: "string", description: "Mots qui identifient le fait à oublier" } }, required: ["words"] },
  },
  {
    type: "function",
    name: "search_web",
    description: "Chercher sur internet une information actuelle ou précise (météo, horaires, démarches administratives, actualités, adresses, recettes). Écrire la question en français, avec la ville si utile.",
    parameters: { type: "object", properties: { query: { type: "string", description: "La recherche, en français" } }, required: ["query"] },
  },
];

// ---------------------------------------------------------------- OpenAI
async function openai(pathname, body) {
  const r = await fetch(`${OPENAI_BASE_URL}${pathname}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`OpenAI ${r.status}: ${text.slice(0, 400)}`);
  return JSON.parse(text);
}

async function createRealtimeSecret(topic, history) {
  const data = await openai("/realtime/client_secrets", {
    expires_after: { anchor: "created_at", seconds: 600 },
    session: {
      type: "realtime",
      model: REALTIME_MODEL,
      instructions: buildInstructions(topic, history),
      tools: TOOLS,
      tool_choice: "auto",
      audio: {
        input: {
          turn_detection: { type: "semantic_vad", eagerness: "low" },
          transcription: { model: "whisper-1" },
          noise_reduction: { type: "near_field" },
        },
        output: { voice: REALTIME_VOICE },
      },
    },
  });
  return data.value || data.client_secret?.value;
}

// ---------------------------------------------------------------- Gemini
async function gemini(pathname, body) {
  const r = await fetch(`${GEMINI_BASE_URL}${pathname}`, {
    method: "POST",
    headers: { "x-goog-api-key": GEMINI_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`Gemini ${r.status}: ${text.slice(0, 400)}`);
  return JSON.parse(text);
}

// Schéma des outils au format Gemini (types en majuscules)
const toGeminiSchema = (s) => {
  if (!s || typeof s !== "object") return s;
  const out = { ...s };
  if (out.type) out.type = String(out.type).toUpperCase();
  if (out.properties) out.properties = Object.fromEntries(Object.entries(out.properties).map(([k, v]) => [k, toGeminiSchema(v)]));
  return out;
};
const GEMINI_FUNCTIONS = TOOLS.filter((t) => t.name !== "search_web").map((t) => ({
  name: t.name, description: t.description, parameters: toGeminiSchema(t.parameters),
}));

// GEMINI_GOOGLE_SEARCH=off : pas de recherche Google intégrée (l'offre gratuite ne la permet pas avec Gemini 3).
const GEMINI_GOOGLE_SEARCH = (process.env.GEMINI_GOOGLE_SEARCH || "on").toLowerCase() !== "off";
const SEARCH_FN = TOOLS.find((t) => t.name === "search_web");

async function createGeminiSession(topic, history, handle, noGoogle) {
  const useGoogle = GEMINI_GOOGLE_SEARCH && !noGoogle;
  const functions = [...GEMINI_FUNCTIONS];
  // Sans recherche Google : recherche par OpenAI si une clé OpenAI existe
  if (!useGoogle && OPENAI_API_KEY)
    functions.push({ name: SEARCH_FN.name, description: SEARCH_FN.description, parameters: toGeminiSchema(SEARCH_FN.parameters) });
  let instructions = buildInstructions(topic, history);
  if (!useGoogle && !OPENAI_API_KEY)
    instructions += "\n\nIMPORTANT : tu n'as PAS accès à internet aujourd'hui. Si elle demande une information actuelle, dis-le gentiment et conseille-lui où la trouver.";
  const now = Date.now();
  const tokenBody = {
    uses: 1,
    expireTime: new Date(now + 30 * 60 * 1000).toISOString(),
    newSessionExpireTime: new Date(now + 2 * 60 * 1000).toISOString(),
    liveConnectConstraints: { model: `models/${GEMINI_MODEL}` },
  };
  let token;
  try {
    token = await gemini("/auth_tokens", tokenBody);
  } catch (e) {
    console.warn("Jeton avec contrainte refusé, nouvel essai sans contrainte :", e.message);
    delete tokenBody.liveConnectConstraints;
    token = await gemini("/auth_tokens", tokenBody);
  }
  const setup = {
    model: `models/${GEMINI_MODEL}`,
    generationConfig: {
      responseModalities: ["AUDIO"],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: GEMINI_VOICE } } },
    },
    systemInstruction: { parts: [{ text: instructions }] },
    tools: useGoogle ? [{ googleSearch: {} }, { functionDeclarations: functions }] : [{ functionDeclarations: functions }],
    realtimeInputConfig: {
      // Patience : elle peut chercher ses mots sans être coupée
      automaticActivityDetection: {
        startOfSpeechSensitivity: "START_SENSITIVITY_LOW",
        endOfSpeechSensitivity: "END_SENSITIVITY_LOW",
        silenceDurationMs: Number(process.env.GEMINI_SILENCE_MS || 2000),
      },
    },
    inputAudioTranscription: {},
    outputAudioTranscription: {},
    sessionResumption: handle ? { handle } : {},
    contextWindowCompression: { slidingWindow: {} },
  };
  return { provider: "gemini", token: token.name, setup, google: useGoogle, wsUrl: process.env.GEMINI_WS_URL || undefined };
}

async function summarizeWithGemini(prompt) {
  const data = await gemini(`/models/${GEMINI_TEXT_MODEL}:generateContent`, {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { responseMimeType: "application/json" },
  });
  return (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
}

// ---------------------------------------------------------------- traduction des sous-titres
const TRANSLATE_MODEL = process.env.TRANSLATE_MODEL || "gpt-5-mini";
const translateCache = new Map();
async function translateToArabic(text) {
  const key = text.trim();
  if (translateCache.has(key)) return translateCache.get(key);
  const prompt = `Traduis ce texte français en darija marocaine, écrite en lettres arabes, avec des mots simples. Réponds uniquement avec la traduction, sans guillemets ni explication. Si le texte est déjà en arabe, recopie-le tel quel.\n\n${key}`;
  let ar;
  if (OPENAI_API_KEY) {
    const data = await openai("/responses", { model: TRANSLATE_MODEL, reasoning: { effort: "minimal" }, input: prompt });
    ar = responseText(data);
  } else {
    const data = await gemini(`/models/${GEMINI_TEXT_MODEL}:generateContent`, { contents: [{ role: "user", parts: [{ text: prompt }] }] });
    ar = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
  }
  ar = String(ar || "").trim().slice(0, 1000);
  if (translateCache.size > 500) translateCache.clear();
  translateCache.set(key, ar);
  return ar;
}

function responseText(data) {
  if (typeof data.output_text === "string") return data.output_text;
  const msg = (data.output || []).filter((o) => o.type === "message").pop();
  return (msg?.content || []).map((c) => c.text || "").join("\n");
}
function responseSources(data) {
  const msg = (data.output || []).filter((o) => o.type === "message").pop();
  const out = [];
  for (const c of msg?.content || [])
    for (const a of c.annotations || [])
      if (a.type === "url_citation" && a.url && !out.some((s) => s.url === a.url)) out.push({ title: a.title || a.url, url: a.url });
  return out.slice(0, 4);
}

async function searchWeb(query) {
  const data = await openai("/responses", {
    model: SEARCH_MODEL,
    reasoning: { effort: "low" },
    tools: [{ type: "web_search", user_location: { type: "approximate", country: "FR", timezone: "Europe/Paris" } }],
    input: `Recherche sur internet et réponds en français, en 5 phrases simples maximum, avec les chiffres, dates et horaires précis. Cite le nom des sites utilisés. Question : ${query}`,
  });
  return { answer: responseText(data).slice(0, 2500), sources: responseSources(data) };
}

async function summarize(transcript) {
  const lines = transcript
    .filter((t) => t && typeof t.text === "string" && t.text.trim())
    .slice(-80)
    .map((t) => `${t.role === "user" ? "Elle" : "Amina"} : ${t.text.slice(0, 400)}`)
    .join("\n");
  if (lines.length < 40) return null;
  const prompt = `Voici une conversation entre Amina (amie et professeure de français) et une femme marocaine qui apprend le français.
Réponds UNIQUEMENT avec ce JSON : {"summary":"2 phrases en français : de quoi vous avez parlé et ce qu'elle a appris","facts":["faits importants et durables sur elle, en français, phrases courtes"]}
Conversation :
${lines}`;
  let raw;
  if (PROVIDER === "gemini") raw = await summarizeWithGemini(prompt);
  else raw = responseText(await openai("/responses", { model: SEARCH_MODEL, reasoning: { effort: "low" }, input: prompt }));
  const j = JSON.parse((raw.match(/\{[\s\S]*\}/) || [raw])[0]);
  return { summary: String(j.summary || "").slice(0, 500), facts: Array.isArray(j.facts) ? j.facts.slice(0, 10) : [] };
}

// ---------------------------------------------------------------- HTTP
function send(res, status, obj) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(obj));
}
function readBody(req, limit = 512 * 1024) {
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
const json = async (req) => JSON.parse((await readBody(req)).toString("utf8") || "{}");

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
    res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-cache" });
    res.end(data);
  });
}

function memoryWritable() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.accessSync(DATA_DIR, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  if (!url.pathname.startsWith("/api/")) return serveStatic(req, res);

  if (url.pathname === "/api/health")
    return send(res, 200, {
      ok: true, mode: "v4", provider: PROVIDER,
      model: PROVIDER === "gemini" ? GEMINI_MODEL : REALTIME_MODEL,
      voice: PROVIDER === "gemini" ? GEMINI_VOICE : REALTIME_VOICE,
      keySet: PROVIDER === "gemini" ? !!GEMINI_API_KEY : !!OPENAI_API_KEY,
      memoryWritable: memoryWritable(), facts: loadMemory().facts.length,
    });

  if (ACCESS_CODE && req.headers["x-access-code"] !== ACCESS_CODE) return send(res, 401, { error: "code" });
  if (url.pathname === "/api/check") return send(res, 200, { ok: true });

  try {
    if (url.pathname === "/api/memory" && req.method === "GET") return send(res, 200, loadMemory());
    if (url.pathname === "/api/memory" && req.method === "DELETE") {
      saveMemory({ facts: [], summaries: [] });
      return send(res, 200, { ok: true });
    }
    if (!GEMINI_API_KEY && !OPENAI_API_KEY) return send(res, 500, { error: "Aucune clé (GEMINI_API_KEY ou OPENAI_API_KEY) sur le serveur" });

    if (url.pathname === "/api/session" && req.method === "POST") {
      const { topic, history, handle, noGoogle } = await json(req);
      if (PROVIDER === "gemini") return send(res, 200, await createGeminiSession(topic, history, handle, !!noGoogle));
      const value = await createRealtimeSecret(topic, history);
      if (!value) throw new Error("Pas de clé temporaire reçue");
      return send(res, 200, { provider: "openai", value, model: REALTIME_MODEL });
    }

    if (url.pathname === "/api/tool" && req.method === "POST") {
      const { name, args } = await json(req);
      let output;
      if (name === "remember") {
        const n = addFacts([args?.fact]);
        output = { ok: true, saved: n > 0 };
      } else if (name === "forget") {
        output = { ok: true, removed: forgetFact(args?.words) };
      } else if (name === "search_web") {
        const q = String(args?.query || "").slice(0, 300);
        if (!q) output = { error: "recherche vide" };
        else {
          try { output = await searchWeb(q); }
          catch (e) { console.error(e); output = { error: "La recherche n'a pas marché. Dis-le simplement et propose de réessayer." }; }
        }
      } else output = { error: "outil inconnu" };
      return send(res, 200, { output });
    }

    if (url.pathname === "/api/translate" && req.method === "POST") {
      const { text } = await json(req);
      const t = String(text || "").slice(0, 1500);
      if (!t.trim()) return send(res, 200, { ar: "" });
      try { return send(res, 200, { ar: await translateToArabic(t) }); }
      catch (e) { console.error(e); return send(res, 200, { ar: "", error: "traduction indisponible" }); }
    }

    if (url.pathname === "/api/summary" && req.method === "POST") {
      const { transcript } = await json(req);
      const s = await summarize(Array.isArray(transcript) ? transcript : []);
      if (s) {
        if (s.facts.length) addFacts(s.facts);
        const m = loadMemory();
        if (s.summary) m.summaries.push({ date: today(), text: s.summary });
        m.summaries = m.summaries.slice(-30);
        saveMemory(m);
      }
      return send(res, 200, { ok: true });
    }

    send(res, 404, { error: "introuvable" });
  } catch (e) {
    console.error(e);
    send(res, 502, { error: String(e.message || e) });
  }
});

server.listen(PORT, () =>
  console.log(`Amina v4 (${PROVIDER === "gemini" ? GEMINI_MODEL : REALTIME_MODEL}) prête sur le port ${PORT} — mémoire : ${MEMORY_FILE} ${memoryWritable() ? "OK" : "NON INSCRIPTIBLE"}`)
);
