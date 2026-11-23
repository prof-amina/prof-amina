# Prof Amina : professeure de français en conversation vocale (version 2, temps réel)

L'élève appuie une seule fois sur « Commencer », puis parle naturellement avec Amina, comme au téléphone.
Il n'y a pas de bouton à presser à chaque phrase : Amina détecte toute seule quand l'élève a fini de parler, et on peut l'interrompre.
Amina explique en darija marocaine et fait répéter les phrases en français.

Technologie : l'API Realtime d'OpenAI (la même que le mode vocal de ChatGPT), connectée en WebRTC.

## Fichiers

| Fichier | Rôle |
|---|---|
| `server.js` | Crée une clé temporaire (10 minutes) pour chaque conversation, avec les consignes d'Amina. La vraie clé OpenAI reste sur le serveur. |
| `public/index.html` | L'application affichée sur le téléphone |
| `public/manifest.webmanifest`, `public/icon-*.png` | L'icône et le nom pour l'écran d'accueil |
| `Dockerfile` | La recette utilisée par Coolify |

## Réglages (Environment Variables dans Coolify)

| Nom | Obligatoire ? | Valeur |
|---|---|---|
| `OPENAI_API_KEY` | **oui** | clé API OpenAI (platform.openai.com → API keys), commence par `sk-` |
| `ACCESS_CODE` | conseillé | code demandé une fois sur le téléphone (ex. `2580`) |
| `REALTIME_MODEL` | non | par défaut `gpt-realtime-2.1`. Version moins chère : `gpt-realtime-2.1-mini` |
| `REALTIME_VOICE` | non | par défaut `marin` (voix féminine) |

Pour toutes ces variables, choisissez **Build time : Not available during build**.
`GROQ_API_KEY` et `ELEVENLABS_API_KEY` ne servent plus dans cette version : vous pouvez les laisser ou les supprimer.

## Mise à jour sur GitHub et Coolify

1. Sur GitHub (dépôt `prof-amina`) : Add file → Upload files, puis glissez `server.js`, `LISEZMOI.md` et le dossier `public`. Les fichiers existants sont remplacés. Terminez par Commit changes.
2. Dans Coolify : Environment Variables → ajoutez `OPENAI_API_KEY`.
3. Cliquez sur **Deploy**.
4. Vérifiez `https://prof.72.62.190.74.sslip.io/api/health` : vous devez voir `"mode":"realtime"` et `"keySet":true`.

## Coûts et sécurité

- OpenAI facture à la minute de conversation. Fixez une **limite de dépense** dans platform.openai.com → Settings → Limits.
- L'application **raccroche toute seule après 2 minutes sans parole**.
- Le bouton rouge **Raccrocher** arrête immédiatement la facturation.

## Utilisation

1. Choisir un thème.
2. Appuyer sur **▶️ Commencer / يالاه نبداو**. Amina salue et commence la leçon.
3. Parler normalement. La boule devient verte quand l'élève parle et orange quand Amina parle.
4. **📞 Raccrocher** pour terminer. La séance suivante reprend là où on s'était arrêté, car Amina se souvient de la fin de la dernière séance.
5. **↺** (en haut à droite) : effacer la mémoire de ce thème pour recommencer à zéro.
