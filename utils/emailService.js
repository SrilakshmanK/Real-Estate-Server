const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: process.env.EMAIL_PORT,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const sendEmail = async ({ to, subject, html }) => {
  try {
    await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to,
      subject,
      html,
    });
  } catch (err) {
    console.error('Email send error:', err.message);
  }
};

const sendWelcomeEmail = (user) =>
  sendEmail({
    to: user.email,
    subject: '🏠 Welcome to Real Estate Auction Platform!',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;">
        <h2 style="color:#6c47ff;">Welcome, ${user.name}!</h2>
        <p>Your account has been successfully created on the <strong>Real Estate Auction Platform</strong>.</p>
        <p>You can now list properties, participate in live auctions, and track your bids.</p>
        <br/>
        <p style="color:#888;">If you did not register, please ignore this email.</p>
      </div>
    `,
  });

const sendPropertyStatusEmail = (user, property, status, adminNote = '') =>
  sendEmail({
    to: user.email,
    subject: `🏡 Your Property "${property.title}" is ${status}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;">
        <h2 style="color:${status === 'APPROVED' ? '#22c55e' : '#ef4444'};">
          Property ${status === 'APPROVED' ? 'Approved ✅' : 'Rejected ❌'}
        </h2>
        <p>Your property <strong>${property.title}</strong> has been <strong>${status}</strong> by an admin.</p>
        ${adminNote ? `<p><strong>Admin Note:</strong> ${adminNote}</p>` : ''}
        <br/>
        <p style="color:#888;">Log in to view your listing status.</p>
      </div>
    `,
  });

const sendAuctionWonEmail = (winner, property) =>
  sendEmail({
    to: winner.email,
    subject: `🎉 Congratulations! You won the auction for "${property.title}"`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;">
        <h2 style="color:#6c47ff;">You Won! 🎉</h2>
        <p>Congratulations <strong>${winner.name}</strong>! You are the highest bidder for:</p>
        <h3>${property.title}</h3>
        <p><strong>Your Bid:</strong> $${property.currentHighestBid.toLocaleString()}</p>
        <p>The property owner will review and contact you shortly.</p>
      </div>
    `,
  });

const sendDealClosedEmail = (owner, winner, property, accepted) => {
  const ownerEmail = sendEmail({
    to: owner.email,
    subject: `Deal ${accepted ? 'Accepted' : 'Rejected'} — ${property.title}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;">
        <h2>Deal ${accepted ? 'Accepted ✅' : 'Rejected ❌'}</h2>
        <p>You have ${accepted ? 'accepted' : 'rejected'} the highest bid for <strong>${property.title}</strong>.</p>
        ${accepted ? `
          <p>The winning bidder's contact:</p>
          <p><strong>Name:</strong> ${winner.name}</p>
          <p><strong>Email:</strong> ${winner.email}</p>
          <p><strong>Phone:</strong> ${winner.phone || 'Not provided'}</p>
        ` : ''}
      </div>
    `,
  });

  const winnerEmail = accepted
    ? sendEmail({
      to: winner.email,
      subject: `📞 Deal Accepted — Contact Details for "${property.title}"`,
      html: `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;">
            <h2 style="color:#22c55e;">Deal Accepted! ✅</h2>
            <p>The owner has accepted your bid for <strong>${property.title}</strong>.</p>
            <p>Owner Contact:</p>
            <p><strong>Name:</strong> ${owner.name}</p>
            <p><strong>Email:</strong> ${owner.email}</p>
            <p><strong>Phone:</strong> ${owner.phone || 'Not provided'}</p>
          </div>
        `,
    })
    : null;

  return Promise.all([ownerEmail, winnerEmail]);
};

module.exports = {
  sendWelcomeEmail,
  sendPropertyStatusEmail,
  sendAuctionWonEmail,
  sendDealClosedEmail,
};
