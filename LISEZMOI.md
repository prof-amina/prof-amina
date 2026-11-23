# Prof Amina : professeure de français vocale

Application vocale pour apprendre le français à partir de la darija marocaine.
L'élève appuie sur le micro et parle. Prof Amina lui répond à voix haute, en français, et réexplique en darija quand c'est nécessaire.

## Ce qu'il y a dans le dossier

| Fichier | Rôle |
|---|---|
| `server.js` | Le serveur. Il reçoit la voix et parle à Groq (et à ElevenLabs si vous l'activez). |
| `public/index.html` | L'application affichée sur le téléphone |
| `public/manifest.webmanifest`, `public/icon-*.png` | L'icône et le nom pour l'écran d'accueil |
| `Dockerfile` | La recette que Coolify utilise pour lancer l'application |

## Les réglages (variables d'environnement, à saisir dans Coolify)

| Nom | Obligatoire ? | Valeur |
|---|---|---|
| `GROQ_API_KEY` | **oui** | votre clé Groq (console.groq.com → API Keys) |
| `ACCESS_CODE` | conseillé | un code à 4 chiffres, par exemple `2580`. Il est demandé une seule fois sur le téléphone et empêche les inconnus d'utiliser votre clé. |
| `ELEVENLABS_API_KEY` | non | votre clé ElevenLabs. Si elle est présente, l'application utilise les belles voix ; sinon, elle utilise la voix du téléphone. |
| `ELEVEN_VOICE_AR` | non | identifiant de la voix darija (par défaut : Ghizlane, `OfGMGmhShO8iL9jCkXy8`) |
| `ELEVEN_VOICE_FR` | non | identifiant de la voix française (par défaut : la même que la voix darija) |
| `GROQ_MODEL` | non | modèle de discussion (par défaut : `openai/gpt-oss-120b`) |

> Avec ElevenLabs : si la voix ne marche pas, ajoutez d'abord la voix « Ghizlane » à « My Voices » depuis la Voice Library du site ElevenLabs.

## Mise en ligne avec Coolify (sur votre VPS Hostinger)

1. **Mettre le code sur GitHub** : créez un dépôt (par exemple `prof-amina`), puis faites glisser tous les fichiers du dossier dans la page « Add file → Upload files ».
2. **Ouvrir Coolify** : dans hPanel, allez dans VPS → Gérer → « Gérer le panel ».
3. **Créer l'application** : Projects → + New → Resource → **Public Repository** (ou « Private Repository (with GitHub App) » si le dépôt est privé). Collez l'adresse du dépôt, et choisissez le Build Pack **Dockerfile**.
4. **Port** : `3000` (champ « Ports Exposes »).
5. **Adresse (Domains)** : par exemple `https://prof.72.62.190.74.sslip.io`. Le **https://** est indispensable, sinon le micro du téléphone ne marchera pas. Coolify crée le certificat tout seul.
6. **Environment Variables** : ajoutez `GROQ_API_KEY`, `ACCESS_CODE` et, si vous l'avez, `ELEVENLABS_API_KEY`.
7. Cliquez sur **Deploy**, puis attendez que le statut soit « Running ».
8. **Vérifier** : ouvrez `https://prof.72.62.190.74.sslip.io/api/health`. Vous devez voir `"keySet":true`.

## Installer sur le Samsung

1. Ouvrez l'adresse dans **Chrome**.
2. Tapez le code d'accès.
3. Menu ⋮ → **Ajouter à l'écran d'accueil** (ou « Installer l'application »).
4. À la première leçon, autorisez le **micro**.
5. Si vous n'utilisez pas ElevenLabs : Paramètres → Gestion globale → Langue → **Synthèse vocale**, choisissez le moteur Google, puis installez les voix **Français** et **Arabe**.

## Utilisation

- **🎤** : appuyer une fois pour parler, puis appuyer encore pour finir.
- **🔁 عاودي** : réécouter la dernière phrase de la professeure.
- **❓ ما فهمتش** : demander une explication en darija.
- **↺** (en haut à droite) : recommencer la leçon depuis le début.

Les conversations sont gardées sur le téléphone, une par thème.
