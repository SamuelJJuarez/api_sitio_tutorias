const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/database');

// Registro de usuario
const register = async (req, res) => {
  try {
    const { identificador_admin, nombre, apellidoP, apellidoM, correo, contrasena } = req.body;

    // Validar datos de entrada
    if (!nombre || !contrasena || !identificador_admin || !apellidoP || !apellidoM || !correo ) {
      return res.status(400).json({ 
        success: false, 
        message: 'Los campos son obligatorios' 
      });
    }

    // Verificar si el usuario ya existe
    const [existingUser] = await pool.query(
      'SELECT * FROM administrativo WHERE identificador_admin = ?',
      [identificador_admin]
    );

    if (existingUser.length > 0) {
      return res.status(409).json({ 
        success: false, 
        message: 'El administrativo ya está registrado' 
      });
    }

    // Encriptar contraseña
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(contrasena, saltRounds);

    // Insertar usuario en la base de datos
    const [result] = await pool.query(
      'Insert into administrativo (identificador_admin, nombre, apellidoP, apellidoM, correo, contrasena) values (?,?,?,?,?,?)',
      [identificador_admin, nombre, apellidoP, apellidoM, correo, hashedPassword]
    );
    

    res.status(201).json({
      success: true,
      message: 'Administrativo registrado exitosamente',
      data: {
        administrativo: identificador_admin,
        nombre: nombre + ' ' + apellidoP + ' ' + apellidoM
      }
    });

  } catch (error) {
    console.error('Error en registro:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error al registrar administrativo',
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
      'SELECT * FROM administrativo WHERE correo = ?',
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
        id_usuario: user.identificador_admin, 
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
          id_usuario: user.identificador_admin,
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

// ─── Función auxiliar para calcular frecuencias ─────────────────────────────
// Recibe un array de num_control_alum y devuelve la estructura:
// [{ id_seccion, nombre, preguntas: [{ id_pregunta, pregunta, opciones: [{ id_opcion, opcion, cantidad }] }] }]
const buildFrecuencias = async (numControles) => {
  if (!numControles || numControles.length === 0) return [];

  // 1. Traer todas las secciones
  const [secciones] = await pool.query('SELECT * FROM secciones_cuestionario ORDER BY id_seccion ASC');

  // 2. Traer todas las respuestas guardadas de los alumnos en cuestión
  const placeholders = numControles.map(() => '?').join(',');
  const [respuestasRows] = await pool.query(
    `SELECT * FROM alumnos_secciones WHERE num_control_alum IN (${placeholders})`,
    numControles
  );

  // 3. Procesar por sección
  const resultado = await Promise.all(secciones.map(async (sec) => {
    // Respuestas de esta sección de todos los alumnos
    const respuestasSec = respuestasRows.filter(r => r.id_seccion === sec.id_seccion);
    if (respuestasSec.length === 0) return null;

    // Preguntas de la sección
    const [preguntas] = await pool.query(
      'SELECT id_pregunta, pregunta FROM preguntas WHERE id_seccion = ? ORDER BY id_pregunta ASC',
      [sec.id_seccion]
    );

    // Todas las opciones posibles de la sección, incluyendo id_pregunta para filtrar correctamente
    const [opcionesTextos] = await pool.query(`
      SELECT p.id_pregunta, o.id_opcion, o.opcion
      FROM opciones o
      JOIN respuestas r ON o.id_respuesta = r.id_respuesta
      JOIN preguntas p ON r.id_pregunta = p.id_pregunta
      WHERE p.id_seccion = ?
      ORDER BY p.id_pregunta ASC, o.id_opcion ASC
    `, [sec.id_seccion]);

    // Construir conteos: { id_pregunta: { id_opcion: cantidad } }
    const conteos = {};
    for (const respRow of respuestasSec) {
      let detalle = [];
      try { detalle = JSON.parse(respRow.contenido); } catch (e) { continue; }
      for (const item of detalle) {
        const idP = parseInt(item.id_pregunta);
        const idO = item.id_opcion;
        if (!idP || !idO) continue;
        if (!conteos[idP]) conteos[idP] = {};
        conteos[idP][idO] = (conteos[idP][idO] || 0) + 1;
      }
    }

    // Mapear preguntas con TODAS sus opciones posibles y sus cantidades (0 si nadie eligió)
    const preguntasConFrecuencia = preguntas.map(p => {
      // Filtramos las opciones que pertenecen exactamente a esta pregunta
      const opcionesFinales = opcionesTextos
        .filter(o => o.id_pregunta === p.id_pregunta)
        .map(o => ({
          id_opcion: o.id_opcion,
          opcion: o.opcion,
          cantidad: (conteos[p.id_pregunta] || {})[o.id_opcion] || 0
        }));

      return {
        id_pregunta: p.id_pregunta,
        pregunta: p.pregunta,
        opciones: opcionesFinales
      };
    });

    return {
      id_seccion: sec.id_seccion,
      nombre: sec.nom_seccion,
      preguntas: preguntasConFrecuencia
    };
  }));

  return resultado.filter(item => item !== null);
};

// ─── 1. Obtener carreras y periodos disponibles (para los dropdowns) ──────────
// GET /api/administrativos/filtros
const getCarrerasYPeriodos = async (req, res) => {
  try {
    const [carreras] = await pool.query('SELECT DISTINCT carrera FROM grupos ORDER BY carrera ASC');
    const [periodos] = await pool.query('SELECT DISTINCT periodo FROM grupos ORDER BY periodo DESC');

    res.status(200).json({
      success: true,
      data: {
        carreras: carreras.map(r => r.carrera),
        periodos: periodos.map(r => r.periodo)
      }
    });
  } catch (error) {
    console.error('Error al obtener filtros:', error);
    res.status(500).json({ success: false, message: 'Error al obtener filtros' });
  }
};

// ─── 2. Obtener grupos por carrera y periodo ──────────────────────────────────
// GET /api/administrativos/grupos?carrera=X&periodo=Y
const getGruposPorCarreraYPeriodo = async (req, res) => {
  try {
    const { carrera, periodo } = req.query;

    if (!carrera || !periodo) {
      return res.status(400).json({ success: false, message: 'Los parámetros carrera y periodo son obligatorios' });
    }

    const [grupos] = await pool.query(
      'SELECT indice_grupo, letra_grupo, periodo FROM grupos WHERE carrera = ? AND periodo = ? ORDER BY letra_grupo ASC',
      [carrera, periodo]
    );

    res.status(200).json({ success: true, data: grupos });
  } catch (error) {
    console.error('Error al obtener grupos:', error);
    res.status(500).json({ success: false, message: 'Error al obtener grupos' });
  }
};

// ─── 3. Resultados generales por carrera y periodo ────────────────────────────
// GET /api/administrativos/resultados/generales?carrera=X&periodo=Y
const getResultadosGenerales = async (req, res) => {
  try {
    const { carrera, periodo } = req.query;

    if (!carrera || !periodo) {
      return res.status(400).json({ success: false, message: 'Los parámetros carrera y periodo son obligatorios' });
    }

    // Obtener todos los grupos del filtro
    const [grupos] = await pool.query(
      'SELECT indice_grupo FROM grupos WHERE carrera = ? AND periodo = ?',
      [carrera, periodo]
    );

    if (grupos.length === 0) {
      return res.status(200).json({ success: true, data: [] });
    }

    const indicesGrupo = grupos.map(g => g.indice_grupo);
    const placeholders = indicesGrupo.map(() => '?').join(',');

    // Obtener todos los alumnos de esos grupos
    const [alumnos] = await pool.query(
      `SELECT num_control_alum FROM alumnos WHERE indice_grupo IN (${placeholders})`,
      indicesGrupo
    );

    if (alumnos.length === 0) {
      return res.status(200).json({ success: true, data: [] });
    }

    const numControles = alumnos.map(a => a.num_control_alum);
    const dataFinal = await buildFrecuencias(numControles);

    res.status(200).json({ success: true, data: dataFinal });
  } catch (error) {
    console.error('Error al obtener resultados generales:', error);
    res.status(500).json({ success: false, message: 'Error al obtener resultados generales' });
  }
};

// ─── 4. Resultados por grupo específico ──────────────────────────────────────
// GET /api/administrativos/resultados/grupo?carrera=X&periodo=Y&indice_grupo=Z
const getResultadosPorGrupo = async (req, res) => {
  try {
    const { carrera, periodo, indice_grupo } = req.query;

    if (!carrera || !periodo || !indice_grupo) {
      return res.status(400).json({ success: false, message: 'Los parámetros carrera, periodo e indice_grupo son obligatorios' });
    }

    // Verificar que el grupo exista y pertenezca al filtro
    const [grupoCheck] = await pool.query(
      'SELECT indice_grupo FROM grupos WHERE indice_grupo = ? AND carrera = ? AND periodo = ?',
      [indice_grupo, carrera, periodo]
    );

    if (grupoCheck.length === 0) {
      return res.status(404).json({ success: false, message: 'Grupo no encontrado con los filtros indicados' });
    }

    // Obtener alumnos del grupo
    const [alumnos] = await pool.query(
      'SELECT num_control_alum FROM alumnos WHERE indice_grupo = ?',
      [indice_grupo]
    );

    if (alumnos.length === 0) {
      return res.status(200).json({ success: true, data: [] });
    }

    const numControles = alumnos.map(a => a.num_control_alum);
    const dataFinal = await buildFrecuencias(numControles);

    res.status(200).json({ success: true, data: dataFinal });
  } catch (error) {
    console.error('Error al obtener resultados por grupo:', error);
    res.status(500).json({ success: false, message: 'Error al obtener resultados por grupo' });
  }
};

module.exports = {
  register,
  login,
  logout,
  verifyToken,
  getCarrerasYPeriodos,
  getGruposPorCarreraYPeriodo,
  getResultadosGenerales,
  getResultadosPorGrupo
};