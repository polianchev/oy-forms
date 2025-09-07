// api/send.js — Vercel Serverless Function (Node.js, CommonJS)

const nodemailer = require("nodemailer");

// Утилита чтения JSON (если req.body не распарсился)
async function readJson(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch { resolve({ raw: data }); }
    });
  });
}

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

module.exports = async (req, res) => {
  try {
    setCors(res);

    // Preflight
    if (req.method === "OPTIONS") {
      res.statusCode = 204;
      return res.end();
    }

    // ПРОСТОЙ ПИНГ ДЛЯ GET — больше не 500
    if (req.method === "GET") {
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify({ ok: true, route: "api/send" }));
    }

    if (req.method !== "POST") {
      res.statusCode = 405;
      return res.end("Method not allowed");
    }

    // Читаем тело формы
    const body = (req.body && typeof req.body === "object") ? req.body : await readJson(req);

    // Собираем HTML-таблицу по всем полям
    const esc = (s) => String(s ?? "").replace(/[<>&]/g, m => ({ "<":"&lt;", ">":"&gt;", "&":"&amp;" }[m]));
    const rows = Object.entries(body).map(([k,v]) =>
      `<tr><td style="padding:6px 10px;border:1px solid #e5e7eb;"><b>${esc(k)}</b></td><td style="padding:6px 10px;border:1px solid #e5e7eb;">${esc(v)}</td></tr>`
    ).join("") || '<tr><td style="padding:10px">Empty body</td></tr>';

    const html = `
      <div style="font-family:system-ui,Segoe UI,Roboto,Arial">
        <h2 style="margin:0 0 10px">New Form Submission — Only Yachts FL</h2>
        <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #e5e7eb">
          ${rows}
        </table>
      </div>
    `;

    // SMTP — читаем ТОЛЬКО при POST
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
      console.error("SMTP is not configured", { SMTP_HOST, SMTP_USER: !!SMTP_USER, SMTP_PASS: !!SMTP_PASS });
      res.statusCode = 500;
      return res.end("SMTP is not configured");
    }

    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(SMTP_PORT),
      secure: String(SMTP_SECURE).toLowerCase() === "true",
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });

    // Тест транспорта (полезно для диагностики)
    try {
      await transporter.verify();
    } catch (e) {
      console.error("SMTP verify failed:", e);
      res.statusCode = 500;
      return res.end("SMTP verify failed");
    }

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
    console.error("Handler crashed:", err);
    res.statusCode = 500;
    return res.end("Internal error");
  }
};
