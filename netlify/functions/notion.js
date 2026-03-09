// Reset alle Gedaan checkboxes naar false
async function resetWorkouts(WORKOUTS_DB, nh, notionFetch) {
  try {
    const data = await notionFetch(
      `https://api.notion.com/v1/databases/${WORKOUTS_DB}/query`,
      'POST',
      JSON.stringify({ filter: { property: 'Gedaan', checkbox: { equals: true } } })
    );
    if (!data.results || data.results.length === 0) return 0;
    await Promise.all(data.results.map(workout =>
      notionFetch(
        `https://api.notion.com/v1/pages/${workout.id}`,
        'PATCH',
        JSON.stringify({ properties: { 'Gedaan': { checkbox: false } } })
      )
    ));
    return data.results.length;
  } catch (e) {
    return 0;
  }
}

exports.handler = async (event) => {
  const NOTION_TOKEN = process.env.NOTION_TOKEN;
  const WORKOUTS_DB = process.env.WORKOUTS_DB_ID;
  const DAGEN_DB = process.env.DAGEN_DB_ID;

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

    // GET /dagen — laad vandaag, reset workouts als nieuwe dag
    if (path === '/dagen' && event.httpMethod === 'GET') {
      const dagData = await notionFetch(
        `https://api.notion.com/v1/databases/${DAGEN_DB}/query`,
        'POST',
        JSON.stringify({ filter: { property: 'Datum', date: { equals: today } } })
      );
      // Als dag bestaat maar training nog niet voltooid = nieuwe dag = reset workouts
      if (dagData.results && dagData.results.length > 0) {
        const trainingVoltooid = dagData.results[0].properties?.['Training voltooid']?.checkbox;
        if (!trainingVoltooid) {
          await resetWorkouts(WORKOUTS_DB, nh, notionFetch);
        }
      }
      return { statusCode: 200, headers, body: JSON.stringify(dagData) };
    }

    // POST /reset — handmatige reset
    else if (path === '/reset' && event.httpMethod === 'POST') {
      const count = await resetWorkouts(WORKOUTS_DB, nh, notionFetch);
      return { statusCode: 200, headers, body: JSON.stringify({ reset: count }) };
    }

    // POST /dagen — nieuwe dag aanmaken
    else if (path === '/dagen' && event.httpMethod === 'POST') {
      const days = ['Zondag','Maandag','Dinsdag','Woensdag','Donderdag','Vrijdag','Zaterdag'];
      const data = await notionFetch(
        `https://api.notion.com/v1/pages`,
        'POST',
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

    // PATCH /dagen/:id
    else if (path.startsWith('/dagen/') && event.httpMethod === 'PATCH') {
      const data = await notionFetch(
        `https://api.notion.com/v1/pages/${path.replace('/dagen/', '')}`,
        'PATCH',
        JSON.stringify({ properties: body.properties })
      );
      return { statusCode: 200, headers, body: JSON.stringify(data) };
    }

    // GET /workouts
    else if (path === '/workouts' && event.httpMethod === 'GET') {
      const data = await notionFetch(
        `https://api.notion.com/v1/databases/${WORKOUTS_DB}/query`,
        'POST',
        JSON.stringify({ sorts: [{ property: 'Benodigde capaciteit', direction: 'ascending' }] })
      );
      return { statusCode: 200, headers, body: JSON.stringify(data) };
    }

    // PATCH /workouts/:id
    else if (path.startsWith('/workouts/') && event.httpMethod === 'PATCH') {
      const data = await notionFetch(
        `https://api.notion.com/v1/pages/${path.replace('/workouts/', '')}`,
        'PATCH',
        JSON.stringify({ properties: body.properties })
      );
      return { statusCode: 200, headers, body: JSON.stringify(data) };
    }

    else {
      return { statusCode: 404, headers, body: JSON.stringify({ error: 'Not found' }) };
    }

  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
