const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { pool } = require('../config/database');
const pendingRegistrations = require('../utils/emailStore');

const requestPasswordReset = async (req, res) => {
  try {
    const { correo, rol, nueva_contrasena, frontendUrl } = req.body;

    if (!correo || !rol || !nueva_contrasena || !frontendUrl) {
      return res.status(400).json({ success: false, message: 'Faltan campos obligatorios' });
    }

    // Verificar que el correo existe según el rol
    let exists = false;
    if (rol === 'alumno') {
      const result = await pool`SELECT * FROM alumnos WHERE correo = ${correo}`;
      exists = result.length > 0;
    } else if (rol === 'maestro') {
      const result = await pool`SELECT * FROM profesores WHERE correo = ${correo}`;
      exists = result.length > 0;
    } else if (rol === 'admin') {
      const result = await pool`SELECT * FROM administrativo WHERE correo = ${correo}`;
      exists = result.length > 0;
    } else {
      return res.status(400).json({ success: false, message: 'Rol inválido' });
    }

    if (!exists) {
      return res.status(404).json({ success: false, message: 'No se encontró ninguna cuenta con ese correo' });
    }

    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(nueva_contrasena, saltRounds);
    const registroId = crypto.randomUUID();

    const token = jwt.sign(
      {
        registroId,
        correo,
        rol,
        hashedPassword
      },
      process.env.JWT_SECRET,
      { expiresIn: '10m' }
    );

    pendingRegistrations.set(registroId, 'pending');

    const link = `${frontendUrl}/verificar-password?token=${token}`;
    
    const transporter = require('nodemailer').createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: correo,
      subject: 'Cambio de Contraseña - Sistema de Tutorías',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 5px;">
          <h2 style="color: #1b396a; text-align: center;">Cambio de Contraseña</h2>
          <p>Hola,</p>
          <p>Has solicitado cambiar tu contraseña en el Sistema de Tutorías del Tec de León. Para confirmar este cambio, haz clic en el siguiente botón:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${link}" style="background-color: #1b396a; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">Confirmar Cambio</a>
          </div>
          <p style="color: #d9534f; font-weight: bold; text-align: center;">Atención: Este enlace expirará en 10 minutos.</p>
          <p>Si no solicitaste este cambio, puedes ignorar este correo de forma segura.</p>
          <hr style="border-top: 1px solid #eee; margin-top: 30px;" />
          <p style="font-size: 12px; color: #888; text-align: center;">Instituto Tecnológico de León<br>Sistema de Tutorías</p>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);

    res.status(200).json({
      success: true,
      message: 'Correo de cambio de contraseña enviado',
      status: 'pending',
      registroId
    });

  } catch (error) {
    console.error('Error enviando correo de cambio de contraseña:', error);
    res.status(500).json({ success: false, message: 'Error interno del servidor', error: error.message });
  }
};

const verifyPasswordReset = async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ success: false, message: 'Token no proporcionado' });

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      return res.status(400).json({ success: false, message: 'Token inválido o expirado' });
    }

    const { registroId, correo, rol, hashedPassword } = decoded;

    if (rol === 'alumno') {
      await pool`UPDATE alumnos SET contrasena = ${hashedPassword} WHERE correo = ${correo}`;
    } else if (rol === 'maestro') {
      await pool`UPDATE profesores SET contrasena = ${hashedPassword} WHERE correo = ${correo}`;
    } else if (rol === 'admin') {
      await pool`UPDATE administrativo SET contrasena = ${hashedPassword} WHERE correo = ${correo}`;
    }

    pendingRegistrations.set(registroId, 'verified');

    res.status(200).json({ success: true, message: 'Contraseña actualizada exitosamente' });

  } catch (error) {
    console.error('Error verificando cambio de contraseña:', error);
    res.status(500).json({ success: false, message: 'Error interno del servidor', error: error.message });
  }
};

module.exports = {
  requestPasswordReset,
  verifyPasswordReset
};
