const jwt = require('jsonwebtoken');
const { pool } = require('../config/database');
const pendingRegistrations = require('../utils/emailStore');

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

module.exports = {
  verifyRegistration,
  checkRegistrationStatus
};
