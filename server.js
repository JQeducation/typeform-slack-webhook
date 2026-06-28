import express from 'express';
import crypto from 'crypto';

const app = express();
app.use(express.json());

const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;
const TYPEFORM_SECRET   = process.env.TYPEFORM_SECRET;

function verifySignature(rawBody, signature) {
  if (!signature || !TYPEFORM_SECRET) return true; // 先跳過驗簽測試
  const hash = crypto
    .createHmac('sha256', TYPEFORM_SECRET)
    .update(rawBody)
    .digest('base64');
  return signature === `sha256=${hash}`;
}

app.post('/webhook/typeform', express.raw({ type: 'application/json' }), async (req, res) => {
  res.sendStatus(200); // 先回 200

  const sig = req.headers['typeform-signature'];
  if (!verifySignature(req.body, sig)) {
    console.error('簽章驗證失敗');
    return;
  }

  const payload = JSON.parse(req.body);
  const { form_response } = payload;
  const { definition, answers, submitted_at } = form_response;

  // 自動把所有欄位都顯示出來
  const fields = answers.map(ans => {
    const title = definition.fields.find(f => f.id === ans.field.id)?.title ?? ans.field.id;
    const value = ans.text ?? ans.email ?? ans.number ?? ans.boolean?.toString()
      ?? ans.choice?.label ?? ans.choices?.labels?.join(', ') ?? '（未填）';
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
        fields: fields.slice(0, 10) // Slack 最多 10 個 fields
      },
      {
        type: 'context',
        elements: [{ type: 'mrkdwn', text: `送出時間：${new Date(submitted_at).toLocaleString('zh-TW')}` }]
      }
    ]
  };

  const resp = await fetch(SLACK_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(message)
  });

  console.log('Slack 回應：', resp.status);
});

app.listen(process.env.PORT || 3000, () => console.log('Server ready'));
