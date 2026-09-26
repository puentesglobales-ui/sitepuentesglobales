import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';

import jobRoutes from './routes/jobs.js';
import atsRoutes from './routes/ats.js';
import psychometricRoutes from './routes/psychometric.js';
import talkmeRoutes from './routes/talkme.js';
import saasRoutes from './routes/saas.js';
import adminRoutes from './routes/admin.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 10000; // Puerto default en Render

// Middlewares
app.use(cors({ origin: '*' }));
app.use(express.json());

// Servir el Frontend completo de la web desde la carpeta 'public'
app.use(express.static('public'));

// Rate Limiter
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // Limite por IP
  message: { success: false, error: 'Demasiadas solicitudes. Intenta de nuevo más tarde.' }
});
app.use(limiter);

// Health check para Render
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', message: 'PuentesGlobales Backend Enterprise en Render Operativo', timestamp: new Date() });
});

// Rutas API v1
app.use('/api/v1/jobs', jobRoutes);
app.use('/api/v1/ats', atsRoutes);
app.use('/api/v1/psychometric', psychometricRoutes);
app.use('/api/v1/talkme', talkmeRoutes);
app.use('/api/v1/saas', saasRoutes);
app.use('/api/v1/admin', adminRoutes);

// Ruta fallback para 404
app.use((req, res) => {
  res.status(404).json({ success: false, error: 'Ruta no encontrada' });
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor PuentesGlobales corriendo en puerto ${PORT}`);
});
