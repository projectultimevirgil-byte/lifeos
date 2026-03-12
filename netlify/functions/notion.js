// LifeOS Backend — Netlify Function
// Routes: workouts, dagen, metrics, financien, kpi, ai

async function resetWorkouts(WORKOUTS_DB, nh, notionFetch) {
  try {
    const data = await notionFetch(
      `https://api.notion.com/v1/databases/${WORKOUTS_DB}/query`,
      'POST',
      JSON.stringify({ filter: { property: 'Gedaan', checkbox: { equals: true } } })
    );
    if (!data.results || data.results.length === 0) return 0;
    await Promise.all(data.results.map(w =>
      notionFetch(`https://api.notion.com/v1/pages/${w.id}`, 'PATCH',
        JSON.stringify({ properties: { 'Gedaan': { checkbox: false } } }))
    ));
    return data.results.length;
  } catch (e) { return 0; }
}

exports.handler = async (event) => {
  const NOTION_TOKEN = process.env.NOTION_TOKEN;
  const WORKOUTS_DB = process.env.WORKOUTS_DB_ID;
  const DAGEN_DB = process.env.DAGEN_DB_ID;
  const METRICS_DB = process.env.METRICS_DB_ID;
  const FINANCIEN_DB = process.env.FINANCIEN_DB_ID;
  const KPI_DB = process.env.KPI_DB_ID;
  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  const path = event.path.replace('/.netlify/functions/notion', '');
  const body = event.body ? JSON.parse(event.body) : {};

  const nh = {
    'Authorization': `Bearer ${NOTION_TOKEN}`,
    'Notion-Version': '2022-06-28',
    'Content-Type': 'application/json',
  };

  const notionFetch = async (url, method, nb) => {
    const res = await fetch(url, { method, headers: nh, body: nb });
    return await res.json();
  };

  try {
    const today = new Date().toISOString().split('T')[0];

    if (path === '/dagen' && event.httpMethod === 'GET') {
      const dagData = await notionFetch(
        `https://api.notion.com/v1/databases/${DAGEN_DB}/query`, 'POST',
        JSON.stringify({ filter: { property: 'Datum', date: { equals: today } } })
      );
      if (dagData.results && dagData.results.length > 0) {
        const trainingVoltooid = dagData.results[0].properties?.['Training voltooid']?.checkbox;
        if (!trainingVoltooid) await resetWorkouts(WORKOUTS_DB, nh, notionFetch);
      }
      return { statusCode: 200, headers, body: JSON.stringify(dagData) };
    }

    else if (path === '/dagen' && event.httpMethod === 'POST') {
      const days = ['Zondag','Maandag','Dinsdag','Woensdag','Donderdag','Vrijdag','Zaterdag'];
      const data = await notionFetch('https://api.notion.com/v1/pages', 'POST',
        JSON.stringify({
          parent: { database_id: DAGEN_DB },
          properties: {
            'Naam': { title: [{ text: { content: days[new Date().getDay()] } }] },
            'Datum': { date: { start: today } },
            'Dag type': { select: { name: body.dag_type || 'Werkdag licht' } },
            'Fase': { select: { name: 'Fundament' } },
            'Intensiteit toegestaan': { select: { name: body.intensiteit || 'Normaal' } },
          }
        })
      );
      await resetWorkouts(WORKOUTS_DB, nh, notionFetch);
      return { statusCode: 200, headers, body: JSON.stringify(data) };
    }

    else if (path.startsWith('/dagen/') && event.httpMethod === 'PATCH') {
      const data = await notionFetch(
        `https://api.notion.com/v1/pages/${path.replace('/dagen/', '')}`, 'PATCH',
        JSON.stringify({ properties: body.properties })
      );
      return { statusCode: 200, headers, body: JSON.stringify(data) };
    }

    else if (path === '/workouts' && event.httpMethod === 'GET') {
      const data = await notionFetch(
        `https://api.notion.com/v1/databases/${WORKOUTS_DB}/query`, 'POST',
        JSON.stringify({ sorts: [{ property: 'Benodigde capaciteit', direction: 'ascending' }] })
      );
      return { statusCode: 200, headers, body: JSON.stringify(data) };
    }

    else if (path.startsWith('/workouts/') && event.httpMethod === 'PATCH') {
      const data = await notionFetch(
        `https://api.notion.com/v1/pages/${path.replace('/workouts/', '')}`, 'PATCH',
        JSON.stringify({ properties: body.properties })
      );
      return { statusCode: 200, headers, body: JSON.stringify(data) };
    }

    else if (path === '/reset' && event.httpMethod === 'POST') {
      const count = await resetWorkouts(WORKOUTS_DB, nh, notionFetch);
      return { statusCode: 200, headers, body: JSON.stringify({ reset: count }) };
    }

    else if (path === '/metrics' && event.httpMethod === 'POST') {
      if (!METRICS_DB) return { statusCode: 200, headers, body: JSON.stringify({ ok: true, skipped: 'no db' }) };
      const existing = await notionFetch(
        `https://api.notion.com/v1/databases/${METRICS_DB}/query`, 'POST',
        JSON.stringify({ filter: { property: 'Datum', title: { equals: today } }, page_size: 1 })
      );
      const props = {
        'Datum': { title: [{ text: { content: today } }] },
        ...(body.gewicht && { 'Gewicht (kg)': { number: parseFloat(body.gewicht) } }),
        ...(body.energie && { 'Energie (1-10)': { number: parseInt(body.energie) } }),
        ...(body.slaap && { 'Slaap (uren)': { number: parseFloat(body.slaap) } }),
        ...(body.stappen && { 'Stappen': { number: parseInt(body.stappen) } }),
        ...(body.stemming && { 'Stemming': { select: { name: body.stemming } } }),
        ...(body.dagelijksMinimum && { 'Dagelijkse minimum gedaan?': { select: { name: body.dagelijksMinimum } } }),
        ...(body.freelanceUren && { 'Freelance uren vandaag': { number: parseFloat(body.freelanceUren) } }),
      };
      let data;
      if (existing.results && existing.results.length > 0) {
        data = await notionFetch(
          `https://api.notion.com/v1/pages/${existing.results[0].id}`, 'PATCH',
          JSON.stringify({ properties: props })
        );
      } else {
        data = await notionFetch('https://api.notion.com/v1/pages', 'POST',
          JSON.stringify({ parent: { database_id: METRICS_DB }, properties: props })
        );
      }
      return { statusCode: 200, headers, body: JSON.stringify(data) };
    }

    else if (path === '/metrics/history' && event.httpMethod === 'GET') {
      if (!METRICS_DB) return { statusCode: 200, headers, body: JSON.stringify({ results: [] }) };
      const data = await notionFetch(
        `https://api.notion.com/v1/databases/${METRICS_DB}/query`, 'POST',
        JSON.stringify({ sorts: [{ property: 'Datum', direction: 'descending' }], page_size: 30 })
      );
      return { statusCode: 200, headers, body: JSON.stringify(data) };
    }

    else if (path === '/financien' && event.httpMethod === 'POST') {
      if (!FINANCIEN_DB) return { statusCode: 200, headers, body: JSON.stringify({ ok: true, skipped: 'no db' }) };
      const data = await notionFetch('https://api.notion.com/v1/pages', 'POST',
        JSON.stringify({
          parent: { database_id: FINANCIEN_DB },
          properties: {
            'Omschrijving': { title: [{ text: { content: body.omschrijving || 'Uitgave' } }] },
            'Bedrag': { number: parseFloat(body.bedrag) || 0 },
            'Categorie': { select: { name: body.categorie || '⚠️ Overig' } },
            'Type': { select: { name: body.type || 'Uitgave' } },
            'Datum': { date: { start: today } },
          }
        })
      );
      return { statusCode: 200, headers, body: JSON.stringify(data) };
    }

    else if (path === '/financien/week' && event.httpMethod === 'GET') {
      if (!FINANCIEN_DB) return { statusCode: 200, headers, body: JSON.stringify({ results: [] }) };
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      const data = await notionFetch(
        `https://api.notion.com/v1/databases/${FINANCIEN_DB}/query`, 'POST',
        JSON.stringify({
          filter: { property: 'Datum', date: { on_or_after: weekAgo.toISOString().split('T')[0] } },
          sorts: [{ property: 'Datum', direction: 'descending' }],
          page_size: 50
        })
      );
      return { statusCode: 200, headers, body: JSON.stringify(data) };
    }

    else if (path === '/kpi' && event.httpMethod === 'POST') {
      if (!KPI_DB) return { statusCode: 200, headers, body: JSON.stringify({ ok: true, skipped: 'no db' }) };
      const weekLabel = body.week || `Week ${getWeekNumber(new Date())} - ${new Date().getFullYear()}`;
      const existing = await notionFetch(
        `https://api.notion.com/v1/databases/${KPI_DB}/query`, 'POST',
        JSON.stringify({ filter: { property: 'Week', title: { equals: weekLabel } }, page_size: 1 })
      );
      const props = {
        'Week': { title: [{ text: { content: weekLabel } }] },
        ...(body.leeruren !== undefined && { 'Freelance leeruren': { number: parseFloat(body.leeruren) } }),
        ...(body.linkedinPosts !== undefined && { 'LinkedIn posts gepubliceerd': { number: parseInt(body.linkedinPosts) } }),
        ...(body.klantgesprekken !== undefined && { 'Gesprekken met potentiële klanten': { number: parseInt(body.klantgesprekken) } }),
        ...(body.automations !== undefined && { 'Make.com / n8n automations gebouwd': { number: parseInt(body.automations) } }),
        ...(body.opSchema && { 'Op schema?': { select: { name: body.opSchema } } }),
      };
      let data;
      if (existing.results && existing.results.length > 0) {
        data = await notionFetch(
          `https://api.notion.com/v1/pages/${existing.results[0].id}`, 'PATCH',
          JSON.stringify({ properties: props })
        );
      } else {
        data = await notionFetch('https://api.notion.com/v1/pages', 'POST',
          JSON.stringify({ parent: { database_id: KPI_DB }, properties: props })
        );
      }
      return { statusCode: 200, headers, body: JSON.stringify(data) };
    }

    else if (path === '/ai' && event.httpMethod === 'POST') {
      if (!ANTHROPIC_KEY) {
        return { statusCode: 200, headers, body: JSON.stringify({ advies: getFallbackAdvies(body) }) };
      }
      const context = buildContext(body);
      const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 300,
          system: `Je bent de persoonlijke AI coach van Virgil Rigters, 31 jaar, Nederland.
Virgil's situatie: schuldsanering tot december 2026, leefgeld €80/week, 2 kinderen (Neyla 7, Diego 5).
Zijn 3 prioriteiten: geloof (dagelijks), lichaam (96kg → 77kg), freelance leren (AI automation, €15k/maand in 2027).
Hij is net uit een relatie (Kaylee, 10 maart 2026). Hij is christen.
Mentoren: Goggins (discipline), Dan Pena (business), Jordan Peterson (mindset), Jezus (fundament).

Geef ALTIJD een kort, direct, persoonlijk advies in het Nederlands.
Formaat: JSON met precies deze velden:
{"type": "go|warn|wait|advice|faith", "title": "korte titel", "body": "2-3 zinnen advies"}
Type "go" = positief/actie, "warn" = waarschuwing, "wait" = rem jezelf, "advice" = neutraal advies, "faith" = geloof/spiritueel.
Wees direct zoals Goggins maar warm. Max 60 woorden in body. Geen markdown, gewoon tekst.`,
          messages: [{ role: 'user', content: context }]
        })
      });
      const aiData = await aiRes.json();
      let advies;
      try {
        advies = JSON.parse(aiData.content[0].text);
      } catch(e) {
        advies = getFallbackAdvies(body);
      }
      return { statusCode: 200, headers, body: JSON.stringify({ advies }) };
    }

    else {
      return { statusCode: 404, headers, body: JSON.stringify({ error: 'Not found' }) };
    }

  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};

function buildContext(data) {
  const parts = [];
  if (data.energie) parts.push(`Energie vandaag: ${data.energie}% (${data.energieLabel})`);
  if (data.gewicht) parts.push(`Gewicht: ${data.gewicht}kg (doel: 77kg, nog ${(data.gewicht - 77).toFixed(1)}kg te gaan)`);
  if (data.budgetResterend !== undefined) parts.push(`Budget resterend deze week: €${data.budgetResterend} van €80`);
  if (data.streakScore !== undefined) parts.push(`Streak deze week: ${data.streakScore}/7 dagen dagelijks minimum gehaald`);
  if (data.freelanceUrenWeek !== undefined) parts.push(`Freelance leeruren deze week: ${data.freelanceUrenWeek}u (doel: 14u/week)`);
  if (data.slaap) parts.push(`Slaap afgelopen nacht: ${data.slaap}u`);
  if (data.reflectie) parts.push(`Reflectie van gisteren: "${data.reflectie.substring(0, 150)}"`);
  if (data.gewichtTrend) parts.push(`Gewichtstrend (7 dagen): ${data.gewichtTrend > 0 ? '+' : ''}${data.gewichtTrend}kg`);
  parts.push(`Dag van de week: ${['Zondag','Maandag','Dinsdag','Woensdag','Donderdag','Vrijdag','Zaterdag'][new Date().getDay()]}`);
  return `Geef gepersonaliseerd dagadvies voor Virgil op basis van:\n${parts.join('\n')}\n\nWat is het meest relevante advies voor vandaag?`;
}

function getFallbackAdvies(data) {
  const energie = data.energie || 60;
  const budget = data.budgetResterend;
  const streak = data.streakScore || 0;
  if (budget !== undefined && budget < 20) {
    return { type: 'warn', title: '⚠️ Budget alert', body: `Je hebt nog €${budget} over deze week. Houd het bij boodschappen en vermijd onnodige uitgaven. Elke euro die je nu spaart is een stap dichter bij vrijheid in december.` };
  }
  if (streak <= 2) {
    return { type: 'wait', title: '🔄 Reset moment', body: 'Deze week was wisselvallig. Geen oordeel — maar vandaag begin je opnieuw. Gebed + fundamentals + wandeling. Drie dingen. Dat is alles.' };
  }
  if (energie >= 80) {
    return { type: 'go', title: '⚡ On fire', body: 'Energie is hoog. Dit is jouw dag. Gym vandaag, freelance uren maken, en eindig sterk. Goggins zou zeggen: je bent nog niet op je limiet.' };
  }
  if (energie <= 40) {
    return { type: 'advice', title: '🌿 Hersteldag', body: 'Energie laag — luister naar je lichaam. Fundamentals + wandeling is genoeg vandaag. Een goede hersteldag is ook productief.' };
  }
  return { type: 'advice', title: '📍 Blijf gefocust', body: 'Normale dag, normale discipline. Jouw top 3: geloof, lichaam, freelance. Alles wat daar buiten valt is bonus. Maak vandaag tellen.' };
}

function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}
