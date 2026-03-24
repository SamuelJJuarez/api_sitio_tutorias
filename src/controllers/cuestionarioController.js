const { pool } = require('../config/database');
const { get } = require('../routes/maestroRoutes');

// 1. Verificar estatus (Usando el token para saber quién es)
const getEstatusCuestionario = async (req, res) => {
  try {
    // CAMBIO: Obtenemos el ID del usuario directamente del token decodificado
    const num_control = req.user.id_usuario; 

    const [secciones] = await pool.query('SELECT * FROM secciones_cuestionario ORDER BY id_seccion ASC');
    
    const [contestadas] = await pool.query(
      'SELECT id_seccion FROM alumnos_secciones WHERE num_control_alum = ?',
      [num_control]
    );

    const idsContestados = contestadas.map(c => c.id_seccion);

    res.status(200).json({
      success: true,
      data: {
        totalSecciones: secciones,
        completadas: idsContestados
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Error al obtener estatus' });
  }
};

// 2. Obtener preguntas (Igual que antes, pero protegido)
const getPreguntasPorSeccion = async (req, res) => {
  try {
    const { id_seccion } = req.params;

    // Obtener el nombre de la sección
    const [seccionRows] = await pool.query('SELECT nom_seccion FROM secciones_cuestionario WHERE id_seccion = ?', [id_seccion]);
    const nom_seccion = seccionRows.length > 0 ? seccionRows[0].nom_seccion : '';

    const [preguntasRows] = await pool.query(
      'SELECT * FROM preguntas WHERE id_seccion = ? ORDER BY id_pregunta ASC', 
      [id_seccion]
    );

    // Obtener todas las opciones para todas las preguntas de esta sección
    const [opcionesRows] = await pool.query(`
      SELECT r.id_pregunta, o.id_opcion, o.opcion 
      FROM opciones o
      JOIN respuestas r ON o.id_respuesta = r.id_respuesta
      JOIN preguntas p ON r.id_pregunta = p.id_pregunta
      WHERE p.id_seccion = ?
      ORDER BY o.id_opcion ASC
    `, [id_seccion]);

    // Mapear cada pregunta con sus respectivas opciones
    const preguntas = preguntasRows.map(p => {
      return {
        ...p,
        opciones: opcionesRows
          .filter(o => o.id_pregunta === p.id_pregunta)
          .map(o => ({ id_opcion: o.id_opcion, opcion: o.opcion }))
      };
    });

    res.status(200).json({
      success: true,
      data: {
        nom_seccion,
        preguntas 
      }
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Error al obtener preguntas' });
  }
};

// 3. Guardar respuestas
const saveSeccion = async (req, res) => {
  try {
    // CAMBIO: El alumno no se envía en el body, se saca del token por seguridad
    const num_control_alum = req.user.id_usuario; 
    
    // Ahora esperamos un arreglo con el detalle de cada respuesta elegida
    // Ej: respuestasDetalle = [{ id_pregunta: 1, id_opcion: 5 }, { id_pregunta: 2, id_opcion: 12 }]
    const { id_seccion, respuestasDetalle } = req.body;

    // Guardamos el JSON como string en la base de datos para no alterar el esquema
    const contenidoString = JSON.stringify(respuestasDetalle || []);

    await pool.query(
      'INSERT INTO alumnos_secciones (id_seccion, num_control_alum, contenido) VALUES (?, ?, ?)',
      [id_seccion, num_control_alum, contenidoString]
    );

    res.status(200).json({ success: true, message: 'Sección guardada correctamente' });

  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Error al guardar respuestas' });
  }
};

// 4. Obtener resultados procesados para gráficas
// Función auxiliar para construir el desglose de preguntas y opciones respondidas
const buildResultadosPorSeccion = async (respuestas, secciones) => {
  const resultadosProcesados = await Promise.all(secciones.map(async (sec) => {
    const respuestaSeccion = respuestas.find(r => r.id_seccion === sec.id_seccion);
    if (!respuestaSeccion) return null;

    let respuestasDetalle = [];
    try {
      // Intentamos parsear el JSON guardado
      respuestasDetalle = JSON.parse(respuestaSeccion.contenido);
    } catch (e) {
      console.warn('El contenido en la BD no es un JSON válido para ID:', respuestaSeccion.num_control_alum);
      respuestasDetalle = []; // Ignorar si son testings pasados con el formato 6%4%2
    }

    // Buscamos las preguntas de esta sección
    const [preguntas] = await pool.query('SELECT id_pregunta, pregunta FROM preguntas WHERE id_seccion = ? ORDER BY id_pregunta ASC', [sec.id_seccion]);

    // Consultamos todas las opciones posibles para esta sección
    const [opcionesTextos] = await pool.query(`
      SELECT o.id_opcion, o.opcion 
      FROM opciones o
      JOIN respuestas r ON o.id_respuesta = r.id_respuesta
      JOIN preguntas p ON r.id_pregunta = p.id_pregunta
      WHERE p.id_seccion = ?
    `, [sec.id_seccion]);

    const detalleRespuestas = preguntas.map(p => {
      // Ubicamos qué opción eligió este alumno en particular
      const respuestaAlum = respuestasDetalle.find(r => parseInt(r.id_pregunta) === p.id_pregunta);
      let opcionTexto = "Sin responder";
      let id_opcion_elegida = null;

      if (respuestaAlum && respuestaAlum.id_opcion) {
        id_opcion_elegida = respuestaAlum.id_opcion;
        // Buscamos el texto de la opción elegida
        const encontrada = opcionesTextos.find(o => o.id_opcion === respuestaAlum.id_opcion);
        if (encontrada) opcionTexto = encontrada.opcion;
      }

      return {
        id_pregunta: p.id_pregunta,
        pregunta: p.pregunta,
        id_opcion_elegida,
        respuesta_elegida: opcionTexto
      };
    });

    return {
      id_seccion: sec.id_seccion,
      nombre: sec.nom_seccion,
      respuestas: detalleRespuestas
    };
  }));

  return resultadosProcesados.filter(item => item !== null);
};

// 4. Obtener resultados de UN alumno (Su reporte general)
const getResultadosAlumno = async (req, res) => {
  try {
    const num_control = req.user.id_usuario; 

    const [secciones] = await pool.query('SELECT * FROM secciones_cuestionario ORDER BY id_seccion ASC');
    const [respuestas] = await pool.query('SELECT * FROM alumnos_secciones WHERE num_control_alum = ?', [num_control]);

    if (respuestas.length === 0) {
      return res.status(200).json({ success: true, data: [] });
    }

    const dataFinal = await buildResultadosPorSeccion(respuestas, secciones);

    res.status(200).json({
      success: true,
      data: dataFinal
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Error al obtener resultados' });
  }
};

// 5. Obtener resultados de UN alumno específico (Para el maestro visualizando a sus alumnos)
const getResultadosPorAlumnoId = async (req, res) => {
  try {
    const { num_control } = req.params; 

    const [secciones] = await pool.query('SELECT * FROM secciones_cuestionario ORDER BY id_seccion ASC');
    const [respuestas] = await pool.query('SELECT * FROM alumnos_secciones WHERE num_control_alum = ?', [num_control]);

    if (respuestas.length === 0) return res.status(200).json({ success: true, data: [] });

    const dataFinal = await buildResultadosPorSeccion(respuestas, secciones);
    
    res.status(200).json({ success: true, data: dataFinal });

  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Error al extraer reporte del alumno' });
  }
};

module.exports = { getEstatusCuestionario, getPreguntasPorSeccion, saveSeccion, getResultadosAlumno, getResultadosPorAlumnoId };