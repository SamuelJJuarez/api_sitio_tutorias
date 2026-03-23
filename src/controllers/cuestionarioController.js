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

    const [preguntas] = await pool.query(
      'SELECT * FROM preguntas WHERE id_seccion = ?', 
      [id_seccion]
    );

    let opciones = [];
    if(preguntas.length > 0) {
        const [respuestaLink] = await pool.query(
            'SELECT id_respuesta FROM respuestas WHERE id_pregunta = ? LIMIT 1',
            [preguntas[0].id_pregunta]
        );

        if(respuestaLink.length > 0) {
            const [opts] = await pool.query(
                'SELECT * FROM opciones WHERE id_respuesta = ? ORDER BY id_opcion ASC',
                [respuestaLink[0].id_respuesta]
            );
            opciones = opts;
        }
    }

    res.status(200).json({
      success: true,
      data: { preguntas, opciones }
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
    const { id_seccion, respuestasIndices, totalOpciones } = req.body;

    let contadores = new Array(totalOpciones).fill(0);
    respuestasIndices.forEach(indice => {
        if (contadores[indice] !== undefined) {
            contadores[indice]++;
        }
    });
    const contenidoString = contadores.join('%');

    await pool.query(
      'INSERT INTO alumnos_secciones (id_seccion, num_control_alum, contenido) VALUES (?, ?, ?)',
      [id_seccion, num_control_alum, contenidoString]
    );

    res.status(200).json({ success: true, message: 'Sección guardada' });

  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Error al guardar respuestas' });
  }
};

// 4. Obtener resultados procesados para gráficas
const getResultadosAlumno = async (req, res) => {
  try {
    const num_control = req.user.id_usuario; // Del token

    // 1. Obtener todas las secciones
    const [secciones] = await pool.query('SELECT * FROM secciones_cuestionario ORDER BY id_seccion ASC');
    
    // 2. Obtener las respuestas del alumno
    const [respuestas] = await pool.query(
      'SELECT * FROM alumnos_secciones WHERE num_control_alum = ?',
      [num_control]
    );

    // Si no ha contestado nada, devolvemos array vacío
    if (respuestas.length === 0) {
      return res.status(200).json({ success: true, data: [] });
    }

    // 3. Construir el objeto de datos para el frontend
    const resultadosProcesados = await Promise.all(secciones.map(async (sec) => {
      // Buscar si el alumno contestó esta sección
      const respuestaSeccion = respuestas.find(r => r.id_seccion === sec.id_seccion);
      
      if (!respuestaSeccion) return null; // Si falta alguna (aunque el front lo valida), la ignoramos

      // Obtener las etiquetas (Opciones) para esta sección
      // Lógica: Buscamos la primera pregunta de la sección -> su respuesta -> sus opciones
      // Asumimos que todas las preguntas de la sección tienen las mismas opciones
      const [opciones] = await pool.query(`
        SELECT o.opcion 
        FROM opciones o
        JOIN respuestas r ON o.id_respuesta = r.id_respuesta
        JOIN preguntas p ON r.id_pregunta = p.id_pregunta
        WHERE p.id_seccion = ?
        LIMIT 20 
      `, [sec.id_seccion]);
      // NOTA: El LIMIT es por seguridad, ajusta la consulta si tus opciones no vienen limpias.
      // Lo ideal es: SELECT DISTINCT o.opcion... pero dependerá de si los textos son idénticos.
      // Para tu caso específico donde "las opciones son iguales en todas las preguntas":
      // Tomamos las opciones asociadas a la PRIMERA pregunta de esa sección.
      
      const [primeraPregunta] = await pool.query('SELECT id_pregunta FROM preguntas WHERE id_seccion = ? LIMIT 1', [sec.id_seccion]);
      let labels = [];
      if(primeraPregunta.length > 0) {
         const [opts] = await pool.query(`
            SELECT o.opcion 
            FROM opciones o
            JOIN respuestas r ON o.id_respuesta = r.id_respuesta
            WHERE r.id_pregunta = ?
            ORDER BY o.id_opcion ASC
         `, [primeraPregunta[0].id_pregunta]);
         labels = opts.map(o => o.opcion);
      }

      // Procesar el string "6%4%2..."
      const contadores = respuestaSeccion.contenido.split('%').map(Number);

      // Crear estructura para Recharts: [{ name: 'Opción A', valor: 6 }, { name: 'Opción B', valor: 4 }]
      const dataGrafica = labels.map((label, index) => ({
        name: label,
        cantidad: contadores[index] || 0
      }));

      return {
        id_seccion: sec.id_seccion,
        nombre: sec.nom_seccion,
        datos: dataGrafica
      };
    }));

    // Filtramos nulos por si hubo secciones sin contestar
    const dataFinal = resultadosProcesados.filter(item => item !== null);

    res.status(200).json({
      success: true,
      data: dataFinal
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Error al obtener resultados' });
  }
};

// 5. Obtener resultados de UN alumno específico (Para el maestro)
const getResultadosPorAlumnoId = async (req, res) => {
  try {
    const { num_control } = req.params; // Recibimos el ID por URL

    // ... (COPIA Y PEGA LA LÓGICA DE getResultadosAlumno QUE HICIMOS ANTES) ...
    // ... PERO USA 'num_control' directo del params, NO del req.user ...
    
    // 1. Secciones
    const [secciones] = await pool.query('SELECT * FROM secciones_cuestionario ORDER BY id_seccion ASC');
    // 2. Respuestas
    const [respuestas] = await pool.query('SELECT * FROM alumnos_secciones WHERE num_control_alum = ?', [num_control]);

    if (respuestas.length === 0) return res.status(200).json({ success: true, data: [] });

    // 3. Procesamiento (IGUAL QUE ANTES)
    const resultadosProcesados = await Promise.all(secciones.map(async (sec) => {
        const respuestaSeccion = respuestas.find(r => r.id_seccion === sec.id_seccion);
        if (!respuestaSeccion) return null;

        // ... lógica de labels y opciones (igual que en getResultadosAlumno) ...
        const [primeraPregunta] = await pool.query('SELECT id_pregunta FROM preguntas WHERE id_seccion = ? LIMIT 1', [sec.id_seccion]);
        let labels = [];
        if(primeraPregunta.length > 0) {
             const [opts] = await pool.query(`SELECT o.opcion FROM opciones o JOIN respuestas r ON o.id_respuesta = r.id_respuesta WHERE r.id_pregunta = ? ORDER BY o.id_opcion ASC`, [primeraPregunta[0].id_pregunta]);
             labels = opts.map(o => o.opcion);
        }
        const contadores = respuestaSeccion.contenido.split('%').map(Number);
        const dataGrafica = labels.map((label, index) => ({ name: label, cantidad: contadores[index] || 0 }));

        return { id_seccion: sec.id_seccion, nombre: sec.nom_seccion, datos: dataGrafica };
    }));

    const dataFinal = resultadosProcesados.filter(item => item !== null);
    res.status(200).json({ success: true, data: dataFinal });

  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Error' });
  }
};

module.exports = { getEstatusCuestionario, getPreguntasPorSeccion, saveSeccion, getResultadosAlumno, getResultadosPorAlumnoId };