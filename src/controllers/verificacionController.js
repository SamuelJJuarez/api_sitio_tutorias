const jwt = require('jsonwebtoken');
const { pool } = require('../config/database');
const pendingRegistrations = require('../utils/emailStore');
const { sendEmail } = require('../config/mailer');

const verifyRegistration = async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ success: false, message: 'Token no proporcionado' });

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      return res.status(400).json({ success: false, message: 'Token inválido o expirado' });
    }

    const { registroId, tipo, formData, hashedPassword } = decoded;

    // Verificar en db si ya existe para evitar duplicados en clicks múltiples
    if (tipo === 'alumno') {
      const existing = await pool`SELECT * FROM alumnos WHERE num_control_alum = ${formData.num_control_alum}`;
      if (existing.length > 0) {
        pendingRegistrations.set(registroId, 'verified');
        return res.status(200).json({ success: true, message: 'Usuario verificado exitosamente' });
      }
      
      await pool`
        INSERT INTO alumnos (num_control_alum, nombre, "apellidoP", "apellidoM", semestre, correo, contrasena, estado_civil, carrera, indice_grupo)
        VALUES (${formData.num_control_alum}, ${formData.nombre}, ${formData.apellidoP}, ${formData.apellidoM}, ${formData.semestre}, ${formData.correo}, ${hashedPassword}, ${formData.estado_civil}, ${formData.carrera}, ${formData.indice_grupo})
      `;
    } else if (tipo === 'maestro') {
      const existing = await pool`SELECT * FROM profesores WHERE num_control_prof = ${formData.num_control_prof}`;
      if (existing.length > 0) {
        pendingRegistrations.set(registroId, 'verified');
        return res.status(200).json({ success: true, message: 'Usuario verificado exitosamente' });
      }

      await pool`
        INSERT INTO profesores (num_control_prof, nombre, "apellidoP", "apellidoM", correo, contrasena)
        VALUES (${formData.num_control_prof}, ${formData.nombre}, ${formData.apellidoP}, ${formData.apellidoM}, ${formData.correo}, ${hashedPassword})
      `;
    } else if (tipo === 'administrativo') {
      const existing = await pool`SELECT * FROM administrativo WHERE identificador_admin = ${formData.identificador_admin}`;
      if (existing.length > 0) {
        pendingRegistrations.set(registroId, 'verified');
        return res.status(200).json({ success: true, message: 'Usuario verificado exitosamente' });
      }

      await pool`
        INSERT INTO administrativo (identificador_admin, nombre, "apellidoP", "apellidoM", correo, contrasena)
        VALUES (${formData.identificador_admin}, ${formData.nombre}, ${formData.apellidoP}, ${formData.apellidoM}, ${formData.correo}, ${hashedPassword})
      `;
    } else {
      return res.status(400).json({ success: false, message: 'Tipo de usuario desconocido' });
    }

    pendingRegistrations.set(registroId, 'verified');

    res.status(200).json({ success: true, message: 'Usuario verificado exitosamente' });

  } catch (error) {
    console.error('Error verificando registro:', error);
    res.status(500).json({ success: false, message: 'Error interno del servidor', error: error.message });
  }
};

const checkRegistrationStatus = async (req, res) => {
  const { registroId } = req.params;
  const status = pendingRegistrations.get(registroId);
  
  if (!status) {
    return res.status(404).json({ success: false, message: 'Registro no encontrado o expirado', status: 'not_found' });
  }

  res.status(200).json({ success: true, status });
};

// Obtener datos de la entrevista por token público
const getEntrevistaPorToken = async (req, res) => {
  try {
    const { token } = req.params;
    if (!token) return res.status(400).json({ success: false, message: 'Token no proporcionado' });

    const entrevistaData = await pool`
      SELECT e.id_entrevista, e.fecha, e.hora, e.lugar, e.estado, e.motivo_rechazo, e.token_respuesta,
             a.nombre as alumno_nombre, a."apellidoP" as alumno_apellido_p, a."apellidoM" as alumno_apellido_m, a.num_control_alum,
             p.nombre as profesor_nombre, p."apellidoP" as profesor_apellido_p, p."apellidoM" as profesor_apellido_m
      FROM entrevistas e
      INNER JOIN alumnos a ON e.num_control_alum = a.num_control_alum
      INNER JOIN profesores p ON e.num_control_prof = p.num_control_prof
      WHERE e.token_respuesta = ${token}
    `;

    if (entrevistaData.length === 0) {
      return res.status(404).json({ success: false, message: 'Entrevista no encontrada o enlace caducado' });
    }

    res.json({ success: true, data: entrevistaData[0] });
  } catch (error) {
    console.error('Error obteniendo entrevista por token:', error);
    res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
};

// Responder a la entrevista (confirmar o rechazar con motivo)
const responderEntrevista = async (req, res) => {
  try {
    const { token, accion, motivo } = req.body;
    if (!token || !accion) {
      return res.status(400).json({ success: false, message: 'Datos incompletos' });
    }

    const entrevistaData = await pool`
      SELECT e.id_entrevista, e.fecha, e.hora, e.lugar, e.estado, e.num_control_prof, e.num_control_alum,
             a.nombre as alumno_nombre, a."apellidoP" as alumno_apellido_p, a."apellidoM" as alumno_apellido_m,
             p.correo as profesor_correo, p.nombre as profesor_nombre, p."apellidoP" as profesor_apellido_p, p."apellidoM" as profesor_apellido_m
      FROM entrevistas e
      INNER JOIN alumnos a ON e.num_control_alum = a.num_control_alum
      INNER JOIN profesores p ON e.num_control_prof = p.num_control_prof
      WHERE e.token_respuesta = ${token}
    `;

    if (entrevistaData.length === 0) {
      return res.status(404).json({ success: false, message: 'Entrevista no encontrada o enlace caducado' });
    }

    const entrevista = entrevistaData[0];

    // Verificar si ya fue respondida para evitar respuestas duplicadas
    if (entrevista.estado !== 'pendiente') {
      return res.status(400).json({
        success: false,
        message: `Esta entrevista ya fue respondida previamente con estado: ${entrevista.estado}.`,
        estado: entrevista.estado
      });
    }

    const nombreAlumno = `${entrevista.alumno_nombre} ${entrevista.alumno_apellido_p} ${entrevista.alumno_apellido_m}`.trim();
    const fechaFormato = new Date(entrevista.fecha).toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' });

    if (accion === 'confirmar') {
      await pool`
        UPDATE entrevistas 
        SET estado = 'confirmada' 
        WHERE token_respuesta = ${token}
      `;

      // Enviar correo de confirmación al profesor
      const htmlProfesor = `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 25px; border: 1px solid #e2e8f0; border-radius: 10px; background-color: #ffffff;">
          <div style="text-align: center; border-bottom: 2px solid #16a34a; padding-bottom: 15px; margin-bottom: 20px;">
            <h2 style="color: #16a34a; margin: 0; font-size: 22px;">✓ Asistencia a Entrevista Confirmada</h2>
            <p style="color: #64748b; font-size: 13px; margin: 5px 0 0 0;">Instituto Tecnológico de León • Sistema de Tutorías</p>
          </div>
          
          <p style="font-size: 15px; color: #334155;">Estimado(a) profesor(a) <b>${entrevista.profesor_nombre} ${entrevista.profesor_apellido_p}</b>,</p>
          <p style="font-size: 14px; color: #475569; line-height: 1.6;">
            El alumno <b>${nombreAlumno}</b> (No. Control: <b>${entrevista.num_control_alum}</b>) ha <b>CONFIRMADO</b> su asistencia a la sesión de entrevista de tutoría programada:
          </p>
          
          <div style="background-color: #f0fdf4; border-left: 4px solid #16a34a; padding: 15px 18px; margin: 20px 0; border-radius: 4px;">
            <p style="margin: 0; font-size: 14px; color: #1e293b;"><b>📅 Fecha:</b> ${fechaFormato}</p>
            <p style="margin: 6px 0 0 0; font-size: 14px; color: #1e293b;"><b>⏰ Hora:</b> ${entrevista.hora}</p>
            <p style="margin: 6px 0 0 0; font-size: 14px; color: #1e293b;"><b>📍 Lugar:</b> ${entrevista.lugar}</p>
          </div>
          
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin-top: 25px;" />
          <p style="font-size: 11px; color: #94a3b8; text-align: center; margin: 0;">
            Sistema de Tutorías del Instituto Tecnológico de León.
          </p>
        </div>
      `;

      if (entrevista.profesor_correo) {
        await sendEmail(entrevista.profesor_correo, `Asistencia Confirmada: ${nombreAlumno}`, htmlProfesor);
      }

      return res.json({
        success: true,
        message: '¡Asistencia a la entrevista confirmada con éxito!',
        estado: 'confirmada'
      });

    } else if (accion === 'rechazar') {
      const motivoTexto = motivo && motivo.trim() ? motivo.trim() : 'No se especificó motivo';

      await pool`
        UPDATE entrevistas 
        SET estado = 'rechazada', motivo_rechazo = ${motivoTexto}
        WHERE token_respuesta = ${token}
      `;

      // Enviar correo con motivo de inasistencia al profesor
      const htmlProfesor = `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 25px; border: 1px solid #e2e8f0; border-radius: 10px; background-color: #ffffff;">
          <div style="text-align: center; border-bottom: 2px solid #dc2626; padding-bottom: 15px; margin-bottom: 20px;">
            <h2 style="color: #dc2626; margin: 0; font-size: 22px;">✗ Inasistencia a Entrevista Notificada</h2>
            <p style="color: #64748b; font-size: 13px; margin: 5px 0 0 0;">Instituto Tecnológico de León • Sistema de Tutorías</p>
          </div>
          
          <p style="font-size: 15px; color: #334155;">Estimado(a) profesor(a) <b>${entrevista.profesor_nombre} ${entrevista.profesor_apellido_p}</b>,</p>
          <p style="font-size: 14px; color: #475569; line-height: 1.6;">
            El alumno <b>${nombreAlumno}</b> (No. Control: <b>${entrevista.num_control_alum}</b>) ha indicado que <b>NO PODRÁ ASISTIR</b> a la entrevista programada para el <b>${fechaFormato} a las ${entrevista.hora}</b> en <b>${entrevista.lugar}</b>.
          </p>
          
          <div style="background-color: #fef2f2; border-left: 4px solid #dc2626; padding: 15px 18px; margin: 20px 0; border-radius: 4px;">
            <h4 style="margin: 0 0 8px 0; color: #991b1b; font-size: 14px;">Motivo indicado por el alumno:</h4>
            <p style="margin: 0; font-size: 14px; color: #1e293b; font-style: italic;">"${motivoTexto}"</p>
          </div>
          
          <p style="font-size: 13px; color: #475569;">
            Puedes ingresar al sistema de tutorías para <b>reprogramar la entrevista</b> en una nueva fecha y horario.
          </p>
          
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin-top: 25px;" />
          <p style="font-size: 11px; color: #94a3b8; text-align: center; margin: 0;">
            Sistema de Tutorías del Instituto Tecnológico de León.
          </p>
        </div>
      `;

      if (entrevista.profesor_correo) {
        await sendEmail(entrevista.profesor_correo, `Inasistencia a Entrevista: ${nombreAlumno}`, htmlProfesor);
      }

      return res.json({
        success: true,
        message: 'Tu respuesta ha sido registrada y tu profesor ha sido notificado.',
        estado: 'rechazada'
      });

    } else {
      return res.status(400).json({ success: false, message: 'Acción no válida' });
    }

  } catch (error) {
    console.error('Error respondiendo entrevista:', error);
    res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
};

module.exports = {
  verifyRegistration,
  checkRegistrationStatus,
  getEntrevistaPorToken,
  responderEntrevista
};
