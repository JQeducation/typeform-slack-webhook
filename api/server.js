import crypto from 'crypto';

const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;
const TYPEFORM_SECRET   = process.env.TYPEFORM_SECRET;

function verifySignature(rawBody, signature) {
  if (!TYPEFORM_SECRET) return true;
  const hash = crypto
    .createHmac('sha256', TYPEFORM_SECRET)
    .update(rawBody)
    .digest('base64');
  return signature === `sha256=${hash}`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(200).send('Webhook server is running!');
  }

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const rawBody = Buffer.concat(chunks).toString();

  res.status(200).end(); // 先回 200

  const sig = req.headers['typeform-signature'];
  if (!verifySignature(rawBody, sig)) {
    console.error('簽章驗證失敗');
    return;
  }

  const { form_response } = JSON.parse(rawBody);
  const { definition, answers, submitted_at } = form_response;

  const fields = answers.map(ans => {
    const title = definition.fields.find(f => f.id === ans.field.id)?.title ?? ans.field.id;
    const value = ans.text ?? ans.email ?? ans.number?.toString()
      ?? ans.boolean?.toString() ?? ans.choice?.label
      ?? ans.choices?.labels?.join(', ') ?? '（未填）';
    return { type: 'mrkdwn', text: `*${title}*\n${value}` };
  });

  const message = {
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: '📋 新的 Typeform 回覆！' }
      },
      {
        type: 'section',
        fields: fields.slice(0, 10)
      },
      {
        type: 'context',
        elements: [{ type: 'mrkdwn', text: `送出時間：${new Date(submitted_at).toLocaleString('zh-TW')}` }]
      }
    ]
  };

  await fetch(SLACK_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(message)
  });
}
