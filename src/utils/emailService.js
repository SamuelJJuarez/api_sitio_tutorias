const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

const sendVerificationEmail = async (correo, link) => {
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: correo,
    subject: 'Verificación de Registro - Sistema de Tutorías',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 5px;">
        <h2 style="color: #1b396a; text-align: center;">Confirma tu registro</h2>
        <p>Hola,</p>
        <p>Has solicitado registrarte en el Sistema de Tutorías del Tec de León. Para completar tu registro y verificar tu correo electrónico, haz clic en el siguiente botón:</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${link}" style="background-color: #1b396a; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">Verificar Correo</a>
        </div>
        <p style="color: #d9534f; font-weight: bold; text-align: center;">Atención: Este enlace expirará en 10 minutos.</p>
        <p>Si no solicitaste este registro, puedes ignorar este correo.</p>
        <hr style="border-top: 1px solid #eee; margin-top: 30px;" />
        <p style="font-size: 12px; color: #888; text-align: center;">Instituto Tecnológico de León<br>Sistema de Tutorías</p>
      </div>
    `
  };

  return transporter.sendMail(mailOptions);
};

module.exports = { sendVerificationEmail };
