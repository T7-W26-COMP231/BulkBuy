// nodemailerGmail.js
const nodemailer = require('nodemailer');

function createGmailTransporter({ user, appPassword, logger = console } = {}) {
  if (!user || !appPassword) throw new Error('user and appPassword required');

  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true, // use TLS
    auth: {
      user,
      pass: appPassword
    }
  });

  // optional verify at startup
  async function verify() {
    try {
      await transporter.verify();
      logger.info('Gmail transporter verified');
    } catch (err) {
      logger.error({ err: err && err.message }, 'Gmail transporter verification failed');
      throw err;
    }
  }

  async function sendMail(mailPayload = {}, opts = {}) {
    // mailPayload: { to, cc, bcc, subject, html, text, attachments }
    const msg = {
      from: mailPayload.from || user,
      to: mailPayload.to,
      cc: mailPayload.cc,
      bcc: mailPayload.bcc,
      subject: mailPayload.subject || '',
      html: mailPayload.html || undefined,
      text: mailPayload.text || undefined,
      attachments: mailPayload.attachments || undefined
    };
    return transporter.sendMail(msg, opts);
  }

  return { transporter, verify, sendMail };
}

module.exports = createGmailTransporter;
