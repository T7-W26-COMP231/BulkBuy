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

// ============================================================
// ✅ QUOTE APPROVED EMAIL
// ============================================================

const sendQuoteApproved = async (supplierEmail, supplierName, quoteDetails) => {
  await sendEmail({
    to: supplierEmail,
    subject: '✅ Your Quote Has Been Approved - BulkBuy',
    html: `
      <h2>Quote Approved 🎉</h2>
      <p>Hi ${supplierName},</p>
      <p>Your quote has been <strong style="color:green">approved</strong> by our team.</p>
      ${quoteDetails?.productName ? `<p><strong>Product:</strong> ${quoteDetails.productName}</p>` : ''}
      ${quoteDetails?.pricePerBulkUnit ? `<p><strong>Price per unit:</strong> $${quoteDetails.pricePerBulkUnit}</p>` : ''}
      ${quoteDetails?.numberOfBulkUnits ? `<p><strong>Units:</strong> ${quoteDetails.numberOfBulkUnits}</p>` : ''}
      <p>Your listing is now available in the active aggregation window.</p>
      <p>— BulkBuy Team</p>
    `
  });
};

// ============================================================
// ❌ QUOTE REJECTED EMAIL
// ============================================================

const sendQuoteRejected = async (supplierEmail, supplierName, quoteDetails, reason) => {
  await sendEmail({
    to: supplierEmail,
    subject: '❌ Your Quote Has Been Rejected - BulkBuy',
    html: `
      <h2>Quote Rejected</h2>
      <p>Hi ${supplierName},</p>
      <p>Unfortunately your quote has been <strong style="color:red">rejected</strong>.</p>
      ${quoteDetails?.productName ? `<p><strong>Product:</strong> ${quoteDetails.productName}</p>` : ''}
      <p><strong>Reason:</strong> ${reason || 'No reason provided'}</p>
      <p>Please review your submission and resubmit if needed.</p>
      <p>— BulkBuy Team</p>
    `
  });
};

module.exports = {
  sendEmail,
  sendOrderConfirmation,
  sendQuoteApproved,   // 👈 add
  sendQuoteRejected    // 👈 add
};
