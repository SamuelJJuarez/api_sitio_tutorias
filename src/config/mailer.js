const nodemailer = require('nodemailer');

// Configuración del transporte 
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

const sendEmail = async (to, subject, htmlContent) => {
  try {
    await transporter.sendMail({
      from: `"Sistema de Tutorías ITL" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html: htmlContent
    });
    console.log(`Correo enviado a ${to}`);
  } catch (error) {
    console.error('Error enviando correo:', error);
  }
};

module.exports = { sendEmail };