/**
 * Lean & Loaded — Instagram Import Worker
 * Deploy to Cloudflare Workers (Free tier)
 *
 * Environment variables (set in Cloudflare dashboard):
 *   ANTHROPIC_API_KEY   — from console.anthropic.com
 *   GITHUB_TOKEN        — Personal Access Token (repo scope)
 *   GITHUB_OWNER        — arno-maesterplan
 *   GITHUB_REPO         — Lean---Loaded   (note: spaces → ---)
 *   SECRET_KEY          — any random string you set, used in Shortcut
 */

export default {
  async fetch(request, env) {

    // ── CORS preflight ──────────────────────────────────────────
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
      });
    }

    if (request.method !== 'POST') {
      return json({ error: 'POST only' }, 405);
    }

    // ── Auth check ──────────────────────────────────────────────
    const auth = request.headers.get('Authorization') || '';
    if (auth !== `Bearer ${env.SECRET_KEY}`) {
      return json({ error: 'Unauthorized' }, 401);
    }

    // ── Parse body ──────────────────────────────────────────────
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'Invalid JSON' }, 400);
    }

    const caption = (body.caption || '').trim();
    const sourceUrl = (body.url || '').trim();

    if (!caption) {
      return json({ error: 'Geen caption gevonden. Kopieer de volledige tekst van het Instagram-recept.' }, 400);
    }

    // ── Stap 1: Haal huidige index.html op van GitHub ───────────
    const ghBase = `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/index.html`;
    const ghHeaders = {
      'Authorization': `Bearer ${env.GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'LeanLoaded-Worker/1.0',
    };

    let fileResp, fileMeta;
    try {
      fileResp = await fetch(ghBase, { headers: ghHeaders });
      fileMeta = await fileResp.json();
    } catch (e) {
      return json({ error: `GitHub fetch mislukt: ${e.message}` }, 500);
    }

    if (fileMeta.message) {
      return json({ error: `GitHub fout: ${fileMeta.message}` }, 500);
    }

    const html = atob(fileMeta.content.replace(/\n/g, ''));
    const sha = fileMeta.sha;

    // ── Stap 2: Bepaal volgend recept-ID ────────────────────────
    const idMatches = [...html.matchAll(/\{id:(\d+),/g)];
    const maxId = idMatches.reduce((max, m) => Math.max(max, parseInt(m[1])), 0);
    const newId = maxId + 1;

    // ── Stap 3: Vraag Claude het recept te formatteren ──────────
    const systemPrompt = `Je bent een recept-parser voor de Lean & Loaded app — een Belgische high-protein cookbook PWA.
Je taak: extraheer en formatteer recepten naar een exact JavaScript object.

Regels:
- Alle tekst in het Nederlands (vertaal van Engels/Frans indien nodig)
- Calorieën en macro's zijn PER PORTIE
- Als macros niet vermeld zijn, schat realistisch op basis van ingrediënten
- cat: kies uit "maaltijd", "ontbijt", "snack", "zoet", "saus", "thermomix"
- lbl: korte Engelse tag (1-2 woorden, lowercase, geen spaties), bv: "chicken-bowl"
- emoji: één passend emoji
- bg: een mooie CSS gradient als string, bv: "linear-gradient(135deg,#667eea,#764ba2)"
  - Gebruik warme kleuren voor warme gerechten, fris voor salade/vis, paars/roze voor zoet
- tags: array van strings, bv: ["kip","rijst","snel"]
- srv: aantal porties als getal
- time: totale bereidingstijd in minuten
- prep: actieve bereidingstijd in minuten
- img: altijd ""
- note: optionele korte tip (of "")
- btip: optionele macro breakdown tip (of "")
- warn: optionele allergie-waarschuwing (of "")
- ings: array van strings (ingrediënten)
- steps: array van strings (bereidingsstappen)
- link: de opgegeven bron-URL (of "")

Geef ALLEEN het JavaScript object terug, zonder \`\`\` of extra tekst.
Start met { en eindig met }.
Gebruik geen trailing comma na het laatste veld.`;

    const userPrompt = `Recept-ID: ${newId}
Bron-URL: ${sourceUrl || 'onbekend'}

Instagram caption:
${caption}

Maak het JavaScript object aan voor dit recept.`;

    let recipeObj;
    try {
      const aiResp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5',
          max_tokens: 2000,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
        }),
      });

      const aiData = await aiResp.json();
      if (aiData.error) {
        return json({ error: `Claude API fout: ${aiData.error.message}` }, 500);
      }

      recipeObj = aiData.content[0].text.trim();
    } catch (e) {
      return json({ error: `Claude call mislukt: ${e.message}` }, 500);
    }

    // ── Stap 4: Valideer dat het een object is ──────────────────
    if (!recipeObj.startsWith('{') || !recipeObj.endsWith('}')) {
      return json({
        error: 'Claude gaf geen geldig object terug.',
        raw: recipeObj.substring(0, 200)
      }, 500);
    }

    // ── Stap 5: Bepaal health-score ─────────────────────────────
    // Laat Claude ook een health score geven (0=nvt, 1=clean, 2=goed, 3=treat)
    const healthPrompt = `Geef ALLEEN een getal (0, 1, 2 of 3) terug voor dit recept:
0 = saus/condiment (geen zelfstandig gerecht)
1 = 💚 Clean (heel gezond, weinig bewerkt, lage cal)
2 = 🟡 Goed (gezond maar iets rijker of bewerkt)
3 = 🔴 Treat (lekkere cheat, hogere cal of suiker)

Recept: ${caption.substring(0, 500)}`;

    let healthScore = 2; // default: goed
    try {
      const healthResp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5',
          max_tokens: 5,
          messages: [{ role: 'user', content: healthPrompt }],
        }),
      });
      const healthData = await healthResp.json();
      const scoreStr = healthData.content[0].text.trim();
      const parsed = parseInt(scoreStr);
      if ([0, 1, 2, 3].includes(parsed)) healthScore = parsed;
    } catch {
      // keep default
    }

    // ── Stap 6: Patch index.html ────────────────────────────────
    // 6a. Voeg recept in vóór de sluitende ]; van de R array
    const insertMarker = '];\n// ── STATE';
    const insertPos = html.indexOf(insertMarker);
    if (insertPos === -1) {
      return json({ error: 'Kon de recepten-array niet vinden in index.html' }, 500);
    }

    const newEntry = `,\n  ${recipeObj}`;
    let newHtml = html.slice(0, insertPos) + newEntry + html.slice(insertPos);

    // 6b. Update HEALTH map — voeg nieuwe entry toe
    // Zoek de laatste entry in HEALTH map en voeg toe na de laatste komma-regel
    const healthMapEnd = newHtml.indexOf('\n};\n// ── RENDER');
    if (healthMapEnd !== -1) {
      // Zoek de laatste getallen-regel in de HEALTH map
      const healthSection = newHtml.substring(0, healthMapEnd);
      const lastHealthEntry = healthSection.lastIndexOf('\n  ');
      if (lastHealthEntry !== -1) {
        const insertHealthPos = healthMapEnd; // voor de sluitende }
        newHtml = newHtml.slice(0, insertHealthPos) +
          `\n  ${newId}:${healthScore}` +
          newHtml.slice(insertHealthPos);
      }
    }

    // 6c. Update recepten-teller in de header
    newHtml = newHtml.replace(
      /(<span class="hstat" id="hcount">)(\d+)( recepten<\/span>)/,
      `$1${newId}$3`
    );

    // ── Stap 7: Push naar GitHub ────────────────────────────────
    const commitBody = JSON.stringify({
      message: `✨ Recept #${newId} toegevoegd via Instagram import`,
      content: btoa(unescape(encodeURIComponent(newHtml))),
      sha: sha,
    });

    let commitResp, commitData;
    try {
      commitResp = await fetch(ghBase, {
        method: 'PUT',
        headers: { ...ghHeaders, 'Content-Type': 'application/json' },
        body: commitBody,
      });
      commitData = await commitResp.json();
    } catch (e) {
      return json({ error: `GitHub commit mislukt: ${e.message}` }, 500);
    }

    if (commitData.message && !commitData.content) {
      return json({ error: `GitHub commit fout: ${commitData.message}` }, 500);
    }

    // ── Succes ──────────────────────────────────────────────────
    // Extract title from recipe object for the response
    const titleMatch = recipeObj.match(/title:'([^']+)'/);
    const title = titleMatch ? titleMatch[1] : `Recept #${newId}`;

    return json({
      success: true,
      id: newId,
      title,
      health: healthScore,
      message: `✅ "${title}" (ID ${newId}) is opgeslagen! Live in ~2 min op Lean & Loaded.`,
    });
  }
};

// Helper
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
