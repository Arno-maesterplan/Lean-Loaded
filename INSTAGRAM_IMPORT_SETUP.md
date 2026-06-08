# Lean & Loaded — Instagram Import Setup

Recepten rechtstreeks vanuit Instagram delen naar Lean & Loaded in ~2 min live.

---

## Wat heb je nodig?

1. **Cloudflare account** (gratis) → [cloudflare.com](https://cloudflare.com)
2. **Anthropic API key** → [console.anthropic.com](https://console.anthropic.com)
3. **GitHub PAT** (staat al in je git remote, zie stap C)
4. **iOS Shortcuts app** (staat standaard op iPhone)

---

## STAP A — Cloudflare Worker aanmaken

1. Ga naar [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages** → **Create**
2. Kies **"Hello World"** template → naam: `lean-loaded-import` → **Deploy**
3. Klik **Edit code** (rechts)
4. Vervang ALLE code door de inhoud van `worker.js` (uit je GitHub repo)
5. Klik **Save and deploy**
6. Noteer je Worker URL: `https://lean-loaded-import.JOUWSUBDOMAIN.workers.dev`

---

## STAP B — Environment Variables instellen

In de Worker settings → **Settings** → **Variables** → **Add variable**:

| Naam | Waarde |
|------|--------|
| `ANTHROPIC_API_KEY` | je key van console.anthropic.com |
| `GITHUB_TOKEN` | zie stap C hieronder |
| `GITHUB_OWNER` | `arno-maesterplan` |
| `GITHUB_REPO` | `Lean---Loaded` |
| `SECRET_KEY` | kies zelf een wachtwoord, bv `LeanLoaded2024!` |

⚠️ Klik bij elke variable op **Encrypt** voor API keys!

---

## STAP C — GitHub PAT ophalen

Je hebt al een token in je git remote. Haal het op via Terminal:

```bash
git -C "/Users/arnomaes/Documents/GitHub/Lean & Loaded" remote get-url origin
```

De URL ziet er zo uit: `https://GEBRUIKER:TOKEN@github.com/...`
Kopieer het deel **na de dubbele punt en voor de @** — dat is je token.

Als je een nieuw token wil aanmaken:
1. GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens
2. Repository access: alleen `Lean---Loaded`
3. Permissions: **Contents** → Read and write
4. Genereer en kopieer

---

## STAP D — iOS Shortcut aanmaken

1. Open **Shortcuts** app op iPhone
2. Tik **+** (nieuw) → **Add Action**
3. Zoek **"Get details of Safari web page"** → kies dit

Bouw de volgende flow (acties in volgorde):

```
[1] Receive: Safari web pages from Share Sheet
[2] Get Details of Safari Web Page → Page Contents (sla op als "Caption")
[3] URL → https://lean-loaded-import.JOUWSUBDOMAIN.workers.dev
[4] Get Contents of URL
     Method: POST
     Headers:
       Content-Type: application/json
       Authorization: Bearer LeanLoaded2024!
     Request Body: JSON
       caption → Caption (variabele uit stap 2)
       url     → Shortcut Input (de Instagram URL)
[5] Get Dictionary from Input
[6] Get Dictionary Value → key: "message"
[7] Show Notification → text uit stap 6
```

**Naam shortcut:** `Lean & Loaded` (zo verschijnt het in de Share Sheet)

### Alternatieve aanpak (eenvoudiger voor de caption):

Instagram captions staan soms niet in "Page Contents". Gebruik dan:

```
[1] Receive: Any from Share Sheet
[2] Text → Shortcut Input (de gedeelde tekst/URL)
[3] ... (rest hetzelfde)
```

Bij Instagram: **lang drukken op post → Kopieer** → dan de Shortcut uitvoeren met geplakte tekst.

---

## STAP E — Testen

1. Ga naar een Instagram recept-post
2. Tik **Deel** (↑) → scrol naar **Lean & Loaded** shortcut
3. Wacht ~10 sec
4. Je krijgt een notificatie: `✅ "Naam recept" (ID X) is opgeslagen!`
5. Na ~2 min staat het in de app op [arno-maesterplan.github.io/Lean-Loaded](https://arno-maesterplan.github.io/Lean-Loaded/)

---

## Problemen?

**"Geen caption gevonden"** → De Instagram post deelt alleen een URL, geen tekst. Kopieer de caption handmatig en plak die als tekst bij het delen.

**"Unauthorized"** → Check je `SECRET_KEY` in Cloudflare én in de Shortcut.

**"GitHub fout: 422"** → Token heeft geen schrijfrechten. Maak nieuw token aan (zie stap C).

**Recipe ziet er raar uit** → Claude Haiku heeft te weinig info gekregen. Zorg dat de caption volledig is (ingrediënten + stappen).

---

## Kosten

- Cloudflare Workers: **gratis** (100.000 requests/dag)
- Claude Haiku: **~$0.002 per recept** (bijna gratis)
- GitHub API: **gratis**
