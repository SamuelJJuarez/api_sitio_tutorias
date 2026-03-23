const nodemailer = require('nodemailer');

// Configuración del transporte (Usando Gmail como ejemplo)
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'tucorreo@gmail.com', // <--- CAMBIA ESTO POR TU CORREO REAL
    pass: 'tu_contraseña_de_aplicacion' // <--- CAMBIA ESTO (App Password)
  }
});

const sendEmail = async (to, subject, htmlContent) => {
  try {
    await transporter.sendMail({
      from: '"Sistema de Tutorías ITL" <tucorreo@gmail.com>',
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