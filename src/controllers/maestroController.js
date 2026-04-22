const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/database');
const { sendEmail } = require('../config/mailer');
const crypto = require('crypto');
const pendingRegistrations = require('../utils/emailStore');
const { sendVerificationEmail } = require('../utils/emailService');

// Registro de usuario
const register = async (req, res) => {
  try {
    const { num_control_prof, nombre, apellidoP, apellidoM, correo, contrasena, frontendUrl } = req.body;

    // Validar datos de entrada
    if (!num_control_prof || !nombre || !apellidoP || !apellidoM || !correo || !contrasena || !frontendUrl) {
      return res.status(400).json({ 
        success: false, 
        message: 'Los campos son obligatorios' 
      });
    }

    // Verificar si el usuario ya existe
    const existingUser = await pool`
      SELECT * FROM profesores WHERE num_control_prof = ${num_control_prof}
    `;

    if (existingUser.length > 0) {
      return res.status(409).json({ 
        success: false, 
        message: 'El profesor ya está registrado' 
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
        tipo: 'maestro',
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
    if (!correo || !contraseña) {
      return res.status(400).json({ 
        success: false, 
        message: 'El correo y la contraseña son obligatorios' 
      });
    }

    // Buscar usuario en la base de datos
    const users = await pool`
      SELECT * FROM profesores WHERE correo = ${correo}
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
        id_usuario: user.num_control_prof, 
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
          id_usuario: user.num_control_prof,
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

// 1. Obtener grupos del profesor
const getGrupos = async (req, res) => {
  try {
    const num_control_prof = req.user.id_usuario;
    const grupos = await pool`
      SELECT indice_grupo, letra_grupo, periodo 
      FROM grupos 
      WHERE num_control_prof = ${num_control_prof}
      ORDER BY periodo DESC, letra_grupo ASC
    `;
    res.json({ success: true, data: grupos });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error al obtener grupos' });
  }
};

// 2. Obtener alumnos de un grupo específico
const getAlumnosPorGrupo = async (req, res) => {
  try {
    const { indice_grupo } = req.params;
    const alumnos = await pool`
      SELECT num_control_alum, nombre, "apellidoP", "apellidoM", correo 
      FROM alumnos 
      WHERE indice_grupo = ${indice_grupo}
      ORDER BY "apellidoP" ASC
    `;
    res.json({ success: true, data: alumnos });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error al obtener alumnos' });
  }
};

// 3. Obtener entrevistas de un alumno con este profesor
const getEntrevistasAlumno = async (req, res) => {
  try {
    const { num_control_alum } = req.params;
    const num_control_prof = req.user.id_usuario;

    const entrevistas = await pool`
      SELECT * FROM entrevistas 
      WHERE num_control_alum = ${num_control_alum} AND num_control_prof = ${num_control_prof}
      ORDER BY fecha DESC, hora DESC
    `;
    res.json({ success: true, data: entrevistas });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error cargando entrevistas' });
  }
};

// 4. Crear Entrevista (Con envío de correo)
const createEntrevista = async (req, res) => {
  try {
    const num_control_prof = req.user.id_usuario;
    const { num_control_alum, fecha, hora, lugar } = req.body;

    // a) Insertar entrevista (resumen inicia vacío o NULL)
    await pool`
      INSERT INTO entrevistas (fecha, hora, lugar, num_control_alum, num_control_prof)
      VALUES (${fecha}, ${hora}, ${lugar}, ${num_control_alum}, ${num_control_prof})
    `;

    // b) Obtener correo del alumno para notificar
    const alumData = await pool`
      SELECT correo, nombre FROM alumnos WHERE num_control_alum = ${num_control_alum}
    `;
    
    if (alumData.length > 0) {
      const { correo, nombre } = alumData[0];
      const html = `
        <h3>Hola ${nombre},</h3>
        <p>Se ha programado una nueva entrevista de tutoría.</p>
        <ul>
            <li><b>Fecha:</b> ${fecha}</li>
            <li><b>Hora:</b> ${hora}</li>
            <li><b>Lugar:</b> ${lugar}</li>
        </ul>
        <p>Favor de asistir puntualmente.</p>
      `;
      await sendEmail(correo, 'Nueva Entrevista Programada - Tutorías ITL', html);
    }

    res.json({ success: true, message: 'Entrevista creada y notificada' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Error al crear entrevista' });
  }
};

// 5. Editar Resumen (Solo modifica el campo resumen)
const updateResumen = async (req, res) => {
  try {
    const { id_entrevista, resumen } = req.body;
    await pool`
      UPDATE entrevistas SET resumen = ${resumen} WHERE id_entrevista = ${id_entrevista}
    `;
    res.json({ success: true, message: 'Resumen actualizado' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error actualizando resumen' });
  }
};

// 6. Reprogramar Entrevista (Modifica fecha/hora/lugar y avisa por correo)
const reprogramarEntrevista = async (req, res) => {
  try {
    const { id_entrevista, fecha, hora, lugar, num_control_alum } = req.body;

    await pool`
      UPDATE entrevistas SET fecha = ${fecha}, hora = ${hora}, lugar = ${lugar}
      WHERE id_entrevista = ${id_entrevista}
    `;

    // Notificar cambio
    const alumData = await pool`
      SELECT correo, nombre FROM alumnos WHERE num_control_alum = ${num_control_alum}
    `;
    if (alumData.length > 0) {
        const { correo, nombre } = alumData[0];
        const html = `
          <h3>Hola ${nombre},</h3>
          <p>Tu entrevista de tutoría ha sido <b>reprogramada</b>.</p>
          <ul>
              <li><b>Nueva Fecha:</b> ${fecha}</li>
              <li><b>Nueva Hora:</b> ${hora}</li>
              <li><b>Nuevo Lugar:</b> ${lugar}</li>
          </ul>
        `;
        await sendEmail(correo, 'Cambio de Horario Entrevista - Tutorías ITL', html);
    }

    res.json({ success: true, message: 'Entrevista reprogramada' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error reprogramando' });
  }
};

// 7. Eliminar Entrevista
const deleteEntrevista = async (req, res) => {
  try {
    const { id_entrevista } = req.params;
    await pool`DELETE FROM entrevistas WHERE id_entrevista = ${id_entrevista}`;
    res.json({ success: true, message: 'Entrevista eliminada correctamente' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Error al eliminar la entrevista' });
  }
};

module.exports = {
  register,
  login,
  logout,
  verifyToken,
  getGrupos,
  getAlumnosPorGrupo,
  getEntrevistasAlumno,
  createEntrevista,
  updateResumen,
  reprogramarEntrevista,
  deleteEntrevista
};