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
    const resumenValor = resumen !== undefined && resumen !== null && resumen.trim() !== '' ? resumen.trim() : null;
    await pool`
      UPDATE entrevistas SET resumen = ${resumenValor} WHERE id_entrevista = ${id_entrevista}
    `;
    res.json({ success: true, message: 'Resumen actualizado' });
  } catch (error) {
    console.error('Error actualizando resumen:', error);
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

// 6. Notificar a todos los alumnos de un grupo para que llenen su cuestionario
const notificarCuestionario = async (req, res) => {
  try {
    const { indice_grupo } = req.params;
    const num_control_prof = req.user.id_usuario;

    // Verificar que el grupo pertenezca al maestro o exista
    const grupoData = await pool`
      SELECT g.indice_grupo, g.letra_grupo, g.periodo, g.carrera,
             p.nombre, p."apellidoP", p."apellidoM"
      FROM grupos g
      LEFT JOIN profesores p ON g.num_control_prof = p.num_control_prof
      WHERE g.indice_grupo = ${indice_grupo} AND g.num_control_prof = ${num_control_prof}
    `;

    if (grupoData.length === 0) {
      return res.status(404).json({ success: false, message: 'Grupo no encontrado o no asignado a este docente' });
    }

    const grupo = grupoData[0];

    // Obtener todos los alumnos del grupo
    const alumnos = await pool`
      SELECT num_control_alum, nombre, "apellidoP", "apellidoM", correo
      FROM alumnos
      WHERE indice_grupo = ${indice_grupo} AND correo IS NOT NULL
    `;

    if (alumnos.length === 0) {
      return res.status(400).json({ success: false, message: 'No hay alumnos registrados en este grupo' });
    }

    const frontendUrl = process.env.FRONTEND_URL;
    const nombreTutor = `${grupo.nombre || ''} ${grupo.apellidoP || ''} ${grupo.apellidoM || ''}`.trim() || 'Tutor Asignado';

    // Enviar correos a cada alumno
    const emailPromises = alumnos.map(alum => {
      const html = `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 25px; border: 1px solid #e2e8f0; border-radius: 10px; background-color: #ffffff;">
          <div style="text-align: center; border-bottom: 2px solid #1B396A; padding-bottom: 15px; margin-bottom: 20px;">
            <h2 style="color: #1B396A; margin: 0; font-size: 22px;">Recordatorio: Llenado de Cuestionario Diagnóstico</h2>
            <p style="color: #64748b; font-size: 13px; margin: 5px 0 0 0;">Instituto Tecnológico de León • Sistema de Tutorías</p>
          </div>
          
          <p style="font-size: 15px; color: #334155;">Hola <b>${alum.nombre} ${alum.apellidoP}</b>,</p>
          <p style="font-size: 14px; color: #475569; line-height: 1.6;">
            Se te recuerda que debes ingresar al Sistema de Tutorías y contestar en su totalidad el <b>cuestionario diagnóstico</b> correspondiente a tu periodo escolar.
          </p>
          
          <div style="background-color: #f1f5f9; border-left: 4px solid #1B396A; padding: 12px 16px; margin: 20px 0; border-radius: 4px;">
            <p style="margin: 0; font-size: 13px; color: #1e293b;"><b>Grupo:</b> ${grupo.letra_grupo} &nbsp;|&nbsp; <b>Carrera:</b> ${grupo.carrera}</p>
            <p style="margin: 4px 0 0 0; font-size: 13px; color: #1e293b;"><b>Periodo:</b> ${grupo.periodo}</p>
            <p style="margin: 4px 0 0 0; font-size: 13px; color: #1e293b;"><b>Tutor:</b> ${nombreTutor}</p>
          </div>
          
          <div style="text-align: center; margin: 25px 0;">
            <a href="${frontendUrl}" style="background-color: #1B396A; color: #ffffff; padding: 12px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px; display: inline-block;">
              Acceder al Sistema de Tutorías
            </a>
          </div>
          
          <div style="background-color: #fef9c3; border: 1px solid #fde047; border-radius: 6px; padding: 12px 16px; margin-top: 20px; color: #854d0e; font-size: 13px; line-height: 1.5;">
            <strong>Nota:</strong> Si ya contestaste y concluiste tu cuestionario en su totalidad, por favor haz caso omiso a este correo.
          </div>
          
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin-top: 25px;" />
          <p style="font-size: 11px; color: #94a3b8; text-align: center; margin: 0;">
            Este es un correo automático del Sistema de Tutorías del Instituto Tecnológico de León. Por favor no respondas a este mensaje.
          </p>
        </div>
      `;

      return sendEmail(alum.correo, 'Recordatorio: Llenado de Cuestionario - Tutorías ITL', html);
    });

    await Promise.allSettled(emailPromises);

    res.json({
      success: true,
      message: `Se envió el recordatorio a los ${alumnos.length} alumno(s) del grupo.`
    });
  } catch (error) {
    console.error('Error enviando notificaciones de cuestionario:', error);
    res.status(500).json({ success: false, message: 'Error al enviar notificaciones' });
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
  deleteEntrevista,
  notificarCuestionario
};