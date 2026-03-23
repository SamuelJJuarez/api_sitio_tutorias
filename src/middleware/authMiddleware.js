const jwt = require('jsonwebtoken');

// Le cambiamos el nombre a verifyToken para coincidir con tus rutas
const verifyToken = (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ 
        success: false, 
        message: 'Acceso denegado. Token no proporcionado' 
      });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
      if (err) {
        return res.status(403).json({ 
          success: false, 
          message: 'Token inválido o expirado' 
        });
      }

      req.user = user; // Esto es perfecto, aquí se guardará id_usuario
      next();
    });

  } catch (error) {
    return res.status(500).json({ 
      success: false, 
      message: 'Error al verificar el token' 
    });
  }
};

// Exportamos con el nombre correcto
module.exports = { verifyToken };