require('dotenv').config();
const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const config = require('./config.json');

const app = express();
app.use(express.json());

const VERIFY_TOKEN = process.env.META_VERIFY_TOKEN;
const PAGE_ACCESS_TOKEN = process.env.META_PAGE_ACCESS_TOKEN;
const CREATIO_LOGIN = process.env.CREATIO_LOGIN;
const CREATIO_PASSWORD = process.env.CREATIO_PASSWORD;

// Верификация webhook от Meta
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('Webhook verified');
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// Приём лидов от Meta
app.post('/webhook', async (req, res) => {
  const body = req.body;
  if (body.object === 'page') {
    for (const entry of body.entry) {
      const pageId = entry.id;
      for (const change of entry.changes) {
        if (change.field === 'leadgen') {
          const leadgenId = change.value.leadgen_id;
          console.log(`New lead: ${leadgenId} from page: ${pageId}`);
          await processLead(leadgenId, pageId);
        }
      }
    }
    res.status(200).send('EVENT_RECEIVED');
  } else {
    res.sendStatus(404);
  }
});

async function processLead(leadgenId, pageId) {
  try {
    const metaRes = await axios.get(
      `https://graph.facebook.com/v19.0/${leadgenId}`,
      { params: { access_token: PAGE_ACCESS_TOKEN } }
    );
    const fields = metaRes.data.field_data;
    const lead = {};
    for (const f of fields) {
      lead[f.name] = f.values[0];
    }

    const pageInfo = config.pages[pageId] || {};
    const dealershipName = pageInfo.dealership_name || null;

    const rawModel = lead['model'] || lead['car_model'] || lead['автомобиль'] || null;
    const model = rawModel ? (config.models[rawModel] || null) : null;

    const payload = {
      name: lead['full_name'] || lead['имя'] || null,
      phone: lead['phone_number'] || lead['телефон'] || null,
      utm_source: 'meta',
      utm_medium: 'leadform',
      request_source: config.request_source,
      dealership_name: dealershipName,
      model: model,
      comment: lead['comment'] || lead['комментарий'] || null
    };

    console.log('Sending to Creatio:', JSON.stringify(payload));

    const crmRes = await axios.post(config.creatio_url, payload, {
      auth: {
        username: CREATIO_LOGIN,
        password: CREATIO_PASSWORD
      },
      headers: { 'Content-Type': 'application/json' }
    });

    console.log('Creatio response:', crmRes.status, crmRes.data);
  } catch (err) {
    console.error('Error processing lead:', err.message);
  }
}

app.get('/test-lead', async (req, res) => {
  const testPayload = {
    name: 'Тест Тестов',
    phone: '+77001234567',
    utm_source: 'meta',
    utm_medium: 'leadform',
    request_source: config.request_source,
    dealership_name: 'Hyundai Premium Almaty',
    model: 'Tucson',
    comment: null
  };
  res.json({ status: 'test payload', data: testPayload });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
