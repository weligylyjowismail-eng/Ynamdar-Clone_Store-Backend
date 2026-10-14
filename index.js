require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');

const app = express();
const PORT = process.env.PORT || 5000;

// ─── Uploads folder ───────────────────────────────────────────────────────────
fs.mkdirSync('uploads', { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp/;
    const ext = allowed.test(path.extname(file.originalname).toLowerCase());
    const mime = allowed.test(file.mimetype);
    if (ext && mime) return cb(null, true);
    cb(new Error('Only image files are allowed'));
  },
});

// Export so routes can use it
app.locals.upload = upload;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── Serve uploaded images as static files ────────────────────────────────────
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ─── Swagger ──────────────────────────────────────────────────────────────────
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'E-Commerce API',
      version: '1.0.0',
      description: 'Full-featured e-commerce REST API with SQLite (no install required)',
    },
    servers: [{ url: `http://localhost:${PORT}`, description: 'Local server' }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
    security: [],
  },
  apis: ['./routes/*.js'],
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'E-Commerce API Docs',
}));

// ─── Routes ───────────────────────────────────────────────────────────────────
const storiesRouter         = require('./routes/stories');
const authRoutes            = require('./routes/auth');
const categoryRoutes        = require('./routes/categories');
const brandRoutes           = require('./routes/brands');
const bannerRoutes          = require('./routes/banners');
const productRoutes         = require('./routes/products');
const searchRoutes          = require('./routes/search');
const orderRoutes           = require('./routes/orders');
const addressRoutes         = require('./routes/addresses');
const profileRoutes         = require('./routes/profile');
const marketCategoriesRouter = require('./routes/marketCategories'); // 👈 TÄZE GOŞULDY

app.use('/stories', storiesRouter);
app.use('/', authRoutes);
app.use('/categories', categoryRoutes);
app.use('/brands', brandRoutes);
app.use('/banners', bannerRoutes);
app.use('/products', productRoutes);
app.use('/', searchRoutes);   // /similar-products/:id  /category/:id  /brand/:id  /search/:keyword
app.use('/orders', orderRoutes);
app.use('/addresses', addressRoutes);
app.use('/profile', profileRoutes);
app.use('/api', marketCategoriesRouter); // 👈 TÄZE GOŞULDY (/api/market-categories)

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({
    message: 'E-Commerce API is running',
    docs: `http://localhost:${PORT}/api-docs`,
    uploads: `http://localhost:${PORT}/uploads/<filename>`,
    version: '1.0.0',
  });
});

// ─── Error handler ────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: `Upload error: ${err.message}` });
  }
  if (err.message === 'Only image files are allowed') {
    return res.status(400).json({ error: err.message });
  }
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

// ─── Start ────────────────────────────────────────────────────────────────────
const { getDb } = require('./db/init');
getDb().then(() => {
  app.listen(PORT, () => {
    console.log(`✅ Server running on http://localhost:${PORT}`);
    console.log(`📚 Swagger docs: http://localhost:${PORT}/api-docs`);
    console.log(`🖼️  Uploads: http://localhost:${PORT}/uploads/<filename>`);
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});