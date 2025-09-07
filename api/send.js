// api/send.js  — Vercel Serverless Function (Node.js, CommonJS)
// Отправляет письма на info@ + CC на yan@, с поддержкой CORS для фронта на другом домене.

const nodemailer = require("nodemailer");

// --- утилита чтения JSON тела (на случай отсутствия автопарсинга)
async function readJson(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch { resolve({ raw: data }); }
    });
  });
}

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

module.exports = async (req, res) => {
  cors(res);

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }
  if (req.method !== "POST") {
    res.statusCode = 405;
    return res.end("Method not allowed");
  }

  // читаем данные формы (любые поля)
  const body = req.body && typeof req.body === "object" ? req.body : await readJson(req);

  // подготовим человекочитаемый HTML-столбик со всеми полями
  const rows = Object.entries(body).map(([k, v]) => {
    const safeV = (v ?? "").toString().replace(/[<>&]/g, s => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[s]));
    const safeK = k.replace(/[<>&]/g, s => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[s]));
    return `<tr><td style="padding:6px 10px;border:1px solid #e5e7eb;"><b>${safeK}</b></td><td style="padding:6px 10px;border:1px solid #e5e7eb;">${safeV}</td></tr>`;
  }).join("");

  const html = `
    <div style="font-family:system-ui,Segoe UI,Roboto,Arial">
      <h2 style="margin:0 0 10px">New Form Submission — Only Yachts FL</h2>
      <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #e5e7eb">
        ${rows || '<tr><td style="padding:10px">Empty body</td></tr>'}
      </table>
    </div>
  `;

  // SMTP из переменных окружения (см. Часть C)
  const {
    SMTP_HOST,
    SMTP_PORT = "465",
    SMTP_USER,
    SMTP_PASS,
    SMTP_SECURE = "true",
    MAIL_TO = "info@onlyyachtsfl.com",
    MAIL_CC = "yan.polianchev@gmail.com",
    MAIL_FROM = `"Only Yachts FL" <${SMTP_USER || "no-reply@onlyyachtsfl.com"}>`
  } = process.env;

  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    res.statusCode = 500;
    return res.end("SMTP is not configured");
  }

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: String(SMTP_SECURE).toLowerCase() === "true",
    auth: { user: SMTP_USER, pass: SMTP_PASS }
  });

  try {
    await transporter.sendMail({
      from: MAIL_FROM,
      to: MAIL_TO,
      cc: MAIL_CC,
      subject: "Only Yachts FL — New Form Submission",
      html,
    });

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({ ok: true }));
  } catch (err) {
    console.error("Mail error:", err);
    res.statusCode = 500;
    return res.end("Failed to send email");
  }
};
