const { pool } = require('../config/database');

// Registro de grupo
const register = async (req, res) => {
  try {
    const { letra_grupo, periodo, carrera, num_control_prof } = req.body;

    // Validar datos de entrada
    if (!letra_grupo || !carrera || !periodo || !num_control_prof) {
      return res.status(400).json({ 
        success: false, 
        message: 'Los campos son obligatorios' 
      });
    }

    // Verificar si el grupo ya existe
    const [existingGroup] = await pool.query(
      'SELECT * FROM grupos WHERE letra_grupo = ? AND periodo = ? AND carrera = ? AND num_control_prof = ?',
      [letra_grupo, periodo, carrera, num_control_prof]
    );

    if (existingGroup.length > 0) {
      return res.status(409).json({ 
        success: false, 
        message: 'El grupo ya está registrado' 
      });
    }

    // Insertar usuario en la base de datos
    const [result] = await pool.query(
      'INSERT INTO grupos (letra_grupo, periodo, carrera, num_control_prof) VALUES (?, ?, ?, ?)',
      [letra_grupo, periodo, carrera, num_control_prof]
    );
    

    res.status(201).json({
      success: true,
      message: 'Grupo registrado exitosamente',
      data: {
        letra_grupo: letra_grupo,
        periodo: periodo,
        carrera: carrera,
        num_control_prof: num_control_prof
      }
    });

  } catch (error) {
    console.error('Error en registro:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error al registrar grupo',
      error: error.message 
    });
  }
};


module.exports = {
  register
};