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

  try {
    let url, method, nb;
    const today = new Date().toISOString().split('T')[0];

    if (path === '/dagen' && event.httpMethod === 'GET') {
      url = `https://api.notion.com/v1/databases/${DAGEN_DB}/query`;
      method = 'POST';
      nb = JSON.stringify({ filter: { property: 'Datum', date: { equals: today } } });
    }
    else if (path === '/dagen' && event.httpMethod === 'POST') {
      const days = ['Zondag','Maandag','Dinsdag','Woensdag','Donderdag','Vrijdag','Zaterdag'];
      url = `https://api.notion.com/v1/pages`;
      method = 'POST';
      nb = JSON.stringify({
        parent: { database_id: DAGEN_DB },
        properties: {
          'Naam': { title: [{ text: { content: days[new Date().getDay()] } }] },
          'Datum': { date: { start: today } },
          'Dag type': { select: { name: body.dag_type || 'Werkdag licht' } },
          'Fase': { select: { name: 'Fundament' } },
          'Intensiteit toegestaan': { select: { name: body.intensiteit || 'Normaal' } },
        }
      });
    }
    else if (path.startsWith('/dagen/') && event.httpMethod === 'PATCH') {
      url = `https://api.notion.com/v1/pages/${path.replace('/dagen/', '')}`;
      method = 'PATCH';
      nb = JSON.stringify({ properties: body.properties });
    }
    else if (path === '/workouts' && event.httpMethod === 'GET') {
      url = `https://api.notion.com/v1/databases/${WORKOUTS_DB}/query`;
      method = 'POST';
      nb = JSON.stringify({ sorts: [{ property: 'Benodigde capaciteit', direction: 'ascending' }] });
    }
    else if (path.startsWith('/workouts/') && event.httpMethod === 'PATCH') {
      url = `https://api.notion.com/v1/pages/${path.replace('/workouts/', '')}`;
      method = 'PATCH';
      nb = JSON.stringify({ properties: body.properties });
    }
    else {
      return { statusCode: 404, headers, body: JSON.stringify({ error: 'Not found' }) };
    }

    const res = await fetch(url, { method, headers: nh, body: nb });
    const data = await res.json();
    return { statusCode: 200, headers, body: JSON.stringify(data) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
