// src/services/email.service.js

const nodemailer = require('nodemailer');

// ============================================================
// 📧 CREATE TRANSPORTER (PRODUCTION SAFE)
// ============================================================

let transporter = null;

const getTransporter = () => {
  if (transporter) return transporter;

  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.warn('⚠ Email credentials missing — email disabled');
    return null;
  }

  transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: process.env.EMAIL_PORT || 465,
    secure: true,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });

  return transporter;
};

// ============================================================
// 📩 SEND EMAIL (GENERIC)
// ============================================================

const sendEmail = async ({ to, subject, html }) => {
  const transporter = getTransporter();

  if (!transporter) {
    console.warn('⚠ Email transporter not available');
    return;
  }

  try {
    await transporter.sendMail({
      from: `"BulkBuy" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html
    });

    console.log('📧 Email sent to:', to);
  } catch (err) {
    console.error('❌ Email send failed:', err.message);
  }
};

// ============================================================
// 🧾 ORDER EMAIL TEMPLATE
// ============================================================

const sendOrderConfirmation = async (userEmail, order) => {
  const subject = '🛒 Order Confirmation - BulkBuy';

  const html = `
    <h2>Order Confirmed 🎉</h2>
    <p>Your order has been successfully placed.</p>
    <p><strong>Order ID:</strong> ${order._id}</p>
    <p>Thank you for using BulkBuy!</p>
  `;

  await sendEmail({
    to: userEmail,
    subject,
    html
  });
};

module.exports = {
  sendEmail,
  sendOrderConfirmation
};