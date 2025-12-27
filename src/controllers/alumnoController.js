const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/database');

// Registro de usuario
const register = async (req, res) => {
  try {
    const { num_control_alum, nombre, apellidoP, apellidoM, semestre, correo, contrasena, estado_civil, carrera, indice_grupo } = req.body;

    // Validar datos de entrada
    if (!nombre || !contrasena || !num_control_alum || !apellidoP || !apellidoM || !semestre || !correo || !estado_civil || !carrera || !indice_grupo) {
      return res.status(400).json({ 
        success: false, 
        message: 'Los campos son obligatorios' 
      });
    }

    // Verificar si el usuario ya existe
    const [existingUser] = await pool.query(
      'SELECT * FROM alumnos WHERE num_control_alum = ?',
      [num_control_alum]
    );

    if (existingUser.length > 0) {
      return res.status(409).json({ 
        success: false, 
        message: 'El alumno ya está registrado' 
      });
    }

    // Encriptar contraseña
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(contrasena, saltRounds);

    // Insertar usuario en la base de datos
    const [result] = await pool.query(
      'Insert into alumnos (num_control_alum, nombre, apellidoP, apellidoM, semestre, correo, contrasena, estado_civil, carrera, indice_grupo) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [num_control_alum, nombre, apellidoP, apellidoM, semestre, correo, hashedPassword, estado_civil, carrera, indice_grupo]
    );
    

    res.status(201).json({
      success: true,
      message: 'Alumno registrado exitosamente',
      data: {
        num_control_alum: num_control_alum,
        nombre: nombre + ' ' + apellidoP + ' ' + apellidoM
      }
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
    const [users] = await pool.query(
      'SELECT * FROM alumnos WHERE correo = ?',
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