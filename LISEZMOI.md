# Amina : amie et professeure de français (version 5)

- **Avatar animé** : le visage d'Amina (dessin original) bouge la bouche au rythme de sa voix, cligne des yeux, écoute et réfléchit.
- **Conversation en face à face**, en temps réel, sans bouton.
- **Langue** : Amina parle toujours en français simple, passe en darija seulement quand l'élève ne comprend pas, puis revient au français.
- **Mémoire** : Amina retient ce qui compte et résume chaque conversation. Tout est gardé dans `/app/data/memoire.json`. Le bouton 🧠 affiche ce qu'elle sait et permet de tout effacer.
- **Adaptée aux débutants** (v5) : Amina parle lentement, en phrases courtes, une question à la fois, puis attend la réponse (2 s de silence avant qu'elle reprenne la parole). Réglage de vitesse 🐢 (Lente, Très lente, Normale). Chaque phrase d'Amina s'affiche en français avec sa traduction en darija écrite en lettres arabes. Boutons 🔁 عاودي (réécouter) et ❓ ما فهمتش (explication en darija).
- **Recherche sur internet** : la recherche Google est intégrée avec Gemini (avec OpenAI, c'est la recherche web d'OpenAI). Les sources s'affichent sous les sous-titres.

## Deux moteurs au choix

| Moteur | Quand il est utilisé | Coût |
|---|---|---|
| **Google Gemini Live** (`gemini-3.8-live`) | dès que `GEMINI_API_KEY` est défini | environ 0,005 $/min en entrée et 0,018 $/min en sortie, avec une offre gratuite limitée |
| OpenAI Realtime (`gpt-realtime-2.1`) | si `GEMINI_API_KEY` est absent | beaucoup plus cher |

## Réglages (Environment Variables dans Coolify, Build time : Not available during build)

| Nom | Valeur |
|---|---|
| `GEMINI_API_KEY` | clé Google (aistudio.google.com/apikey), commence par `AIza` |
| `ACCESS_CODE` | ex. `2580` |
| `GEMINI_VOICE` | optionnel, défaut `Sulafat` (autres voix féminines : `Kore`, `Aoede`, `Leda`) |
| `GEMINI_MODEL` | optionnel, défaut `gemini-3.8-live` |
| `GEMINI_TEXT_MODEL` | optionnel, modèle qui résume les conversations, défaut `gemini-flash-latest` |
| `OPENAI_API_KEY` | recherches internet et traduction des sous-titres (quelques centimes) ; secours si vous retirez la clé Gemini |
| `GEMINI_SILENCE_MS` | optionnel, silence avant qu'Amina reprenne la parole, défaut `2000` (2 secondes) |
| `TRANSLATE_MODEL` | optionnel, modèle OpenAI des traductions, défaut `gpt-5-mini` |

## Persistent Storage (obligatoire pour garder la mémoire)

Dans Coolify : application → **Persistent Storage** → **+ Add** → **Volume Mount** :
- Name : `amina-memoire`
- Destination Path : `/app/data`

## Mise à jour

1. Sur GitHub : Add file → Upload files, glissez tout le contenu du dossier, puis Commit changes.
2. Dans Coolify : ajoutez `GEMINI_API_KEY` et le Persistent Storage, puis cliquez sur **Redeploy**.
3. Vérifiez `https://prof.72.62.190.74.sslip.io/api/health` : vous devez voir `"provider":"gemini"`, `"keySet":true` et `"memoryWritable":true`.
