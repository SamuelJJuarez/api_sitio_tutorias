const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/database');
const crypto = require('crypto');
const pendingRegistrations = require('../utils/emailStore');
const { sendVerificationEmail } = require('../utils/emailService');

// Registro de usuario
const register = async (req, res) => {
  try {
    const { num_control_alum, nombre, apellidoP, apellidoM, semestre, correo, contrasena, estado_civil, carrera, indice_grupo, frontendUrl } = req.body;

    // Validar datos de entrada
    if (!nombre || !contrasena || !num_control_alum || !apellidoP || !apellidoM || !semestre || !correo || !estado_civil || !carrera || !indice_grupo || !frontendUrl) {
      return res.status(400).json({ 
        success: false, 
        message: 'Los campos son obligatorios' 
      });
    }

    // Verificar si el usuario ya existe
    const existingUser = await pool`
      SELECT * FROM alumnos WHERE num_control_alum = ${num_control_alum}
    `;

    if (existingUser.length > 0) {
      return res.status(409).json({ 
        success: false, 
        message: 'El alumno ya está registrado' 
      });
    }

    // Encriptar contraseña
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(contrasena, saltRounds);

    const registroId = crypto.randomUUID();
    
    // Generar token JWT con 10 mins de expiración
    const token = jwt.sign(
      { 
        registroId,
        tipo: 'alumno',
        formData: req.body,
        hashedPassword
      },
      process.env.JWT_SECRET,
      { expiresIn: '10m' }
    );

    // Guardar en el store temporal
    pendingRegistrations.set(registroId, 'pending');

    // Enviar el correo
    const link = `${frontendUrl}/verificar-correo?token=${token}`;
    await sendVerificationEmail(correo, link);

    res.status(200).json({
      success: true,
      message: 'Correo de verificación enviado',
      status: 'pending',
      registroId: registroId
    });

  } catch (error) {
    console.error('Error en registro:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error al registrar alumno',
      error: error.message 
    });
  }
};

// Inicio de sesión
const login = async (req, res) => {
  try {
    const { correo, contraseña } = req.body;

    // Validar datos de entrada
    if (!correo || !contraseña) {
      return res.status(400).json({ 
        success: false, 
        message: 'El correo y la contraseña son obligatorios' 
      });
    }

    // Buscar usuario en la base de datos
    const users = await pool`
      SELECT * FROM alumnos WHERE correo = ${correo}
    `;

    if (users.length === 0) {
      return res.status(401).json({ 
        success: false, 
        message: 'Credenciales incorrectas' 
      });
    }

    const user = users[0];

    // Verificar contraseña
    const isPasswordValid = await bcrypt.compare(contraseña, user.contrasena);

    if (!isPasswordValid) {
      return res.status(401).json({ 
        success: false, 
        message: 'Credenciales incorrectas' 
      });
    }

    // Generar token JWT
    const token = jwt.sign(
      { 
        id_usuario: user.num_control_alum, 
        nombre: user.nombre 
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.status(200).json({
      success: true,
      message: 'Inicio de sesión exitoso',
      data: {
        token: token,
        usuario: {
          id_usuario: user.num_control_alum,
          nombre: user.nombre
        }
      }
    });

  } catch (error) {
    console.error('Error en login:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error al iniciar sesión',
      error: error.message 
    });
  }
};

// Cerrar sesión
const logout = async (req, res) => {
  try {
    res.status(200).json({
      success: true,
      message: 'Sesión cerrada exitosamente'
    });
  } catch (error) {
    console.error('Error en logout:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error al cerrar sesión',
      error: error.message 
    });
  }
};

// Verificar token
const verifyToken = async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
      return res.status(401).json({ 
        success: false, 
        message: 'Token no proporcionado' 
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    res.status(200).json({
      success: true,
      message: 'Token válido',
      data: {
        usuario: decoded
      }
    });

  } catch (error) {
    res.status(401).json({ 
      success: false, 
      message: 'Token inválido o expirado' 
    });
  }
};

module.exports = {
  register,
  login,
  logout,
  verifyToken
};