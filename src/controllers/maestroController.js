const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/database');

// Registro de usuario
const register = async (req, res) => {
  try {
    const { num_control_prof, nombre, apellidoP, apellidoM, correo, contrasena } = req.body;

    // Validar datos de entrada
    if (!num_control_prof || !nombre || !apellidoP || !apellidoM || !correo || !contrasena) {
      return res.status(400).json({ 
        success: false, 
        message: 'Los campos son obligatorios' 
      });
    }

    // Verificar si el usuario ya existe
    const [existingUser] = await pool.query(
      'SELECT * FROM profesores WHERE num_control_prof = ?',
      [num_control_prof]
    );

    if (existingUser.length > 0) {
      return res.status(409).json({ 
        success: false, 
        message: 'El profesor ya está registrado' 
      });
    }

    // Encriptar contraseña
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(contrasena, saltRounds);

    // Insertar usuario en la base de datos
    const [result] = await pool.query(
      'Insert into profesores (num_control_prof, nombre, apellidoP, apellidoM, correo, contrasena) values (?,?,?,?,?,?)',
      [num_control_prof, nombre, apellidoP, apellidoM, correo, hashedPassword]
    );
    

    res.status(201).json({
      success: true,
      message: 'Profesor registrado exitosamente',
      data: {
        num_control_prof: num_control_prof,
        nombre: nombre + ' ' + apellidoP + ' ' + apellidoM
      }
    });

  } catch (error) {
    console.error('Error en registro:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error al registrar profesor',
      error: error.message 
    });
  }
};

// Inicio de sesión
const login = async (req, res) => {
  try {
    const { correo, contraseña } = req.body;

    // Validar datos de entrada
    if (!correo|| !contraseña) {
      return res.status(400).json({ 
        success: false, 
        message: 'El correo y la contraseña son obligatorios' 
      });
    }

    // Buscar usuario en la base de datos
    const [users] = await pool.query(
      'SELECT * FROM profesores WHERE correo = ?',
      [correo]
    );

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
        id_usuario: user.correo, 
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
          id_usuario: user.correo,
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