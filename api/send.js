// api/send.js
// Серверная функция Vercel для отправки писем через SendGrid

const sgMail = require('@sendgrid/mail');

const REQUIRED = ['name', 'email']; // что минимум ожидаем
const {
  SENDGRID_API_KEY,
  MAIL_TO,
  MAIL_CC,
  MAIL_FROM,
  MAIL_SUBJECT_PREFIX = '[Only Yachts FL]',
  ALLOWED_ORIGIN,
} = process.env;

sgMail.setApiKey(SENDGRID_API_KEY);

// Простейшая проверка домена-источника (CORS)
function cors(res) {
  if (ALLOWED_ORIGIN) {
    res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*'); // если не указан ALLOWED_ORIGIN
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

module.exports = async (req, res) => {
  cors(res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
  }

  try {
    const data = req.body || {};

    // Антиспам «мёд»: если поле hidden заполнено — игнорируем
    if (data.hidden && String(data.hidden).trim() !== '') {
      return res.status(200).json({ ok: true, spam: true });
    }

    // Минимальная валидация
    for (const f of REQUIRED) {
      if (!data[f]) {
        return res.status(400).json({ ok: false, error: `Missing field: ${f}` });
      }
    }

    const {
      name,
      email,
      phone = '',
      location = '',
      budget = '',
      start = '',
      use = '',
      message = '',
    } = data;

    const subject = `${MAIL_SUBJECT_PREFIX} New Inquiry from ${name}`;
    const html = `
      <h2>New Ownership Inquiry</h2>
      <p><b>Name:</b> ${escapeHtml(name)}</p>
      <p><b>Email:</b> ${escapeHtml(email)}</p>
      <p><b>Phone:</b> ${escapeHtml(phone)}</p>
      <p><b>Preferred Location:</b> ${escapeHtml(location)}</p>
      <p><b>Comfortable Budget:</b> ${escapeHtml(budget)}</p>
      <p><b>Start Window:</b> ${escapeHtml(start)}</p>
      <p><b>Primary Use:</b> ${escapeHtml(use)}</p>
      <p><b>Message:</b><br>${nl2br(escapeHtml(message))}</p>
      <hr>
      <small>Sent from Only Yachts FL website form</small>
    `;

    const msg = {
      to: MAIL_TO,
      from: MAIL_FROM, // должен быть с верифицированного домена в SendGrid
      subject,
      html,
    };

    if (MAIL_CC) {
      msg.cc = MAIL_CC;
    }

    await sgMail.send(msg);

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Send error:', err?.response?.body || err);
    return res
      .status(500)
      .json({ ok: false, error: 'Email sending failed', detail: err?.message });
  }
};

// helpers
function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
function nl2br(str = '') {
  return String(str).replace(/\n/g, '<br>');
}
