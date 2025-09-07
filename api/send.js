// api/send.js — Vercel Serverless Function
// Транспорт: 1) SendGrid по API (если есть SENDGRID_API_KEY)  2) SMTP (nodemailer)  3) иначе 500.

const nodemailer = require("nodemailer");
let sgMail = null; // подключим @sendgrid/mail только при наличии ключа

function setCors(req, res) {
  const allowed = process.env.ALLOWED_ORIGIN || "*";
  res.setHeader("Access-Control-Allow-Origin", allowed);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST,GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

async function readJson(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch { resolve({ raw: data }); }
    });
  });
}

module.exports = async (req, res) => {
  setCors(req, res);

  if (req.method === "OPTIONS") {
    res.statusCode = 204; return res.end();
  }

  // Диагностика через GET
  if (req.method === "GET") {
    const hasSG = !!process.env.SENDGRID_API_KEY;
    const hasSMTP = !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
    const transport = hasSG ? "sendgrid" : (hasSMTP ? "smtp" : "none");
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({
      ok: true,
      route: "api/send",
      transport,
      // показываем только флаги наличия, без значений
      has: {
        SENDGRID_API_KEY: hasSG,
        SMTP_HOST: !!process.env.SMTP_HOST,
        SMTP_USER: !!process.env.SMTP_USER,
        SMTP_PASS: !!process.env.SMTP_PASS
      }
    }));
  }

  if (req.method !== "POST") {
    res.statusCode = 405; return res.end("Method not allowed");
  }

  // --- Подготовка письма ---
  const body = (req.body && typeof req.body === "object") ? req.body : await readJson(req);
  const esc = (s) => String(s ?? "").replace(/[<>&]/g, m => ({ "<":"&lt;", ">":"&gt;", "&":"&amp;" }[m]));
  const rows = Object.entries(body).map(([k,v]) =>
    `<tr><td style="padding:6px 10px;border:1px solid #e5e7eb;"><b>${esc(k)}</b></td><td style="padding:6px 10px;border:1px solid #e5e7eb;">${esc(v)}</td></tr>`
  ).join("") || '<tr><td style="padding:10px">Empty body</td></tr>';

  const html = `
    <div style="font-family:system-ui,Segoe UI,Roboto,Arial">
      <h2 style="margin:0 0 10px">${esc(process.env.MAIL_SUBJECT_PREFIX || "Only Yachts FL — Inquiry")}</h2>
      <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #e5e7eb">
        ${rows}
      </table>
    </div>
  `;

  const TO = process.env.MAIL_TO || "info@onlyyachtsfl.com";
  const CC = process.env.MAIL_CC || "yan.polianchev@gmail.com";
  const FROM = process.env.MAIL_FROM || "no-reply@onlyyachtsfl.com";
  const SUBJECT = (process.env.MAIL_SUBJECT_PREFIX || "Only Yachts FL — Inquiry");

  // --- 1) SendGrid по API ---
  if (process.env.SENDGRID_API_KEY) {
    try {
      if (!sgMail) {
        sgMail = require("@sendgrid/mail");
        sgMail.setApiKey(process.env.SENDGRID_API_KEY);
      }
      await sgMail.send({
        to: TO,
        cc: CC,
        from: FROM,          // ДОЛЖЕН быть подтверждён в SendGrid (Single Sender или доменная валидация)
        subject: SUBJECT,
        html
      });
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify({ ok: true, via: "sendgrid" }));
    } catch (e) {
      console.error("SendGrid error:", e?.response?.body || e);
      res.statusCode = 500; return res.end("SendGrid send failed");
    }
  }

  // --- 2) SMTP (nodemailer) ---
  const {
    SMTP_HOST, SMTP_PORT = "465", SMTP_USER, SMTP_PASS, SMTP_SECURE = "true"
  } = process.env;

  if (SMTP_HOST && SMTP_USER && SMTP_PASS) {
    try {
      const transporter = nodemailer.createTransport({
        host: SMTP_HOST,
        port: Number(SMTP_PORT),
        secure: String(SMTP_SECURE).toLowerCase() === "true",
        auth: { user: SMTP_USER, pass: SMTP_PASS },
      });
      await transporter.verify();
      await transporter.sendMail({ from: FROM, to: TO, cc: CC, subject: SUBJECT, html });
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify({ ok: true, via: "smtp" }));
    } catch (e) {
      console.error("SMTP error:", e);
      res.statusCode = 500; return res.end("SMTP send failed");
    }
  }

  // --- 3) Нечем отправлять ---
  console.error("No mail transport configured");
  res.statusCode = 500;
  return res.end("No mail transport configured");
};
