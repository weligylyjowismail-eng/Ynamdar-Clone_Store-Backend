const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { getDb, saveDb } = require('../db/init');

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  },
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

/**
 * @swagger
 * /brands:
 *   get:
 *     summary: Get all brands with pagination & search
 *     tags: [Brands]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10 }
 *       - in: query
 *         name: offset
 *         schema: { type: integer, default: 0 }
 *       - in: query
 *         name: market_category_id
 *         schema: { type: integer }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Brend ady boýunça gözleg
 *       - in: query
 *         name: vip
 *         schema: { type: integer, enum: [0, 1] }
 *         description: 1 = diňe VIP markalar
 *       - in: query
 *         name: is_new
 *         schema: { type: integer, enum: [0, 1] }
 *         description: 1 = diňe täze markalar
 *     responses:
 *       200:
 *         description: List of brands
 */
router.get('/', async (req, res) => {
  try {
    const db = await getDb();
    const limit = parseInt(req.query.limit) || 10;
    const offset = parseInt(req.query.offset) || 0;
    const { market_category_id, search } = req.query;

    const conditions = [];
    const whereParams = [];

    if (market_category_id) {
      conditions.push('market_category_id = ?');
      whereParams.push(parseInt(market_category_id, 10));
    }

    if (search) {
      conditions.push('name LIKE ?');
      whereParams.push(`%${search}%`);
    }

    if (req.query.vip === '1') conditions.push('vip = 1');
    if (req.query.is_new === '1') conditions.push('is_new = 1');

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const stmt = db.prepare(
      `SELECT * FROM brands ${whereClause} ORDER BY id ASC LIMIT ? OFFSET ?`
    );
    stmt.bind([...whereParams, limit, offset]);
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();

    const countStmt = db.prepare(`SELECT COUNT(*) as count FROM brands ${whereClause}`);
    countStmt.bind(whereParams);
    countStmt.step();
    const total = countStmt.getAsObject().count;
    countStmt.free();

    res.json({ data: rows, total, limit, offset });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /brands/{id}:
 *   get:
 *     summary: Get a single brand
 *     tags: [Brands]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Brand object
 */
router.get('/:id', async (req, res) => {
  try {
    const db = await getDb();
    const stmt = db.prepare(`SELECT * FROM brands WHERE id = ?`);
    stmt.bind([req.params.id]);
    const row = stmt.step() ? stmt.getAsObject() : null;
    stmt.free();
    if (!row) return res.status(404).json({ error: 'Brand not found' });
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /brands:
 *   post:
 *     summary: Create a brand
 *     tags: [Brands]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [name, market_category_id]
 *             properties:
 *               name:
 *                 type: string
 *               market_category_id:
 *                 type: integer
 *               image:
 *                 type: string
 *                 format: binary
 *               vip:
 *                 type: integer
 *                 enum: [0, 1]
 *                 description: 1 = VIP dükanlar bölümünde göster
 *               is_new:
 *                 type: integer
 *                 enum: [0, 1]
 *                 description: 1 = Täze dükanlar bölümünde göster
 *     responses:
 *       201:
 *         description: Created
 */
router.post('/', upload.single('image'), async (req, res) => {
  try {
    const db = await getDb();
    const { name, market_category_id } = req.body;

    if (!name || !market_category_id) {
      return res.status(400).json({
        error: 'name we market_category_id meýdançalary hökmanydyr!',
      });
    }

    const catId = parseInt(market_category_id, 10);

    const catStmt = db.prepare('SELECT id FROM market_categories WHERE id = ?');
    catStmt.bind([catId]);
    const categoryExists = catStmt.step();
    catStmt.free();

    if (!categoryExists) {
      return res.status(400).json({
        error: 'Berlen market_category_id boýunça kategoriýa tapylmady',
      });
    }

    const image = req.file ? `/uploads/${req.file.filename}` : null;
    const vip = req.body.vip === '1' || req.body.vip === 'true' ? 1 : 0;
    const isNew = req.body.is_new === '1' || req.body.is_new === 'true' ? 1 : 0;
    db.run(
      `INSERT INTO brands (name, image, market_category_id, vip, is_new) VALUES (?, ?, ?, ?, ?)`,
      [name, image, catId, vip, isNew]
    );

    const stmt = db.prepare(`SELECT last_insert_rowid() as id`);
    stmt.step();
    const { id } = stmt.getAsObject();
    stmt.free();

    const stmt2 = db.prepare(`SELECT * FROM brands WHERE id = ?`);
    stmt2.bind([id]);
    const row = stmt2.step() ? stmt2.getAsObject() : null;
    stmt2.free();

    saveDb();

    res.status(201).json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /brands/{id}:
 *   put:
 *     summary: Update a brand
 *     tags: [Brands]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               market_category_id:
 *                 type: integer
 *               image:
 *                 type: string
 *                 format: binary
 *               vip:
 *                 type: integer
 *                 enum: [0, 1]
 *                 description: 1 = VIP dükanlar bölümünde göster
 *               is_new:
 *                 type: integer
 *                 enum: [0, 1]
 *                 description: 1 = Täze dükanlar bölümünde göster
 *     responses:
 *       200:
 *         description: Updated
 */
router.put('/:id', upload.single('image'), async (req, res) => {
  try {
    const db = await getDb();
    const stmt = db.prepare(`SELECT * FROM brands WHERE id = ?`);
    stmt.bind([req.params.id]);
    const existing = stmt.step() ? stmt.getAsObject() : null;
    stmt.free();

    if (!existing) return res.status(404).json({ error: 'Brand not found' });

    const name = req.body.name || existing.name;
    const image = req.file ? `/uploads/${req.file.filename}` : existing.image;
    const market_category_id =
      req.body.market_category_id !== undefined
        ? parseInt(req.body.market_category_id, 10)
        : existing.market_category_id;

    if (req.body.market_category_id !== undefined) {
      const catStmt = db.prepare('SELECT id FROM market_categories WHERE id = ?');
      catStmt.bind([market_category_id]);
      const categoryExists = catStmt.step();
      catStmt.free();

      if (!categoryExists) {
        return res.status(400).json({
          error: 'Berlen market_category_id boýunça kategoriýa tapylmady',
        });
      }
    }

    const vip =
      req.body.vip !== undefined
        ? (req.body.vip === '1' || req.body.vip === 'true' ? 1 : 0)
        : existing.vip;
    const isNew =
      req.body.is_new !== undefined
        ? (req.body.is_new === '1' || req.body.is_new === 'true' ? 1 : 0)
        : existing.is_new;

    db.run(
      `UPDATE brands SET name=?, image=?, market_category_id=?, vip=?, is_new=? WHERE id=?`,
      [name, image, market_category_id, vip, isNew, req.params.id]
    );
    saveDb();

    const stmt2 = db.prepare(`SELECT * FROM brands WHERE id = ?`);
    stmt2.bind([req.params.id]);
    const updated = stmt2.step() ? stmt2.getAsObject() : null;
    stmt2.free();

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /brands/{id}:
 *   delete:
 *     summary: Delete a brand
 *     tags: [Brands]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Deleted
 */
router.delete('/:id', async (req, res) => {
  try {
    const db = await getDb();

    const checkStmt = db.prepare(`SELECT id FROM brands WHERE id = ?`);
    checkStmt.bind([req.params.id]);
    const exists = checkStmt.step();
    checkStmt.free();

    if (!exists) return res.status(404).json({ error: 'Brand not found' });

    db.run(`DELETE FROM brands WHERE id = ?`, [req.params.id]);
    saveDb();
    res.json({ message: 'Brand deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ==========================================================================
   MARKA REKLAM / BANNER BÖLÜMÜ (Brand Banners)
   ========================================================================== */

/**
 * @swagger
 * /brands/{id}/banners:
 *   get:
 *     summary: Marka degişli dönüniz reklam/banner suratlaryny al
 *     tags: [Brands - Banners]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Marka bannerler sanawy
 */
router.get('/:id/banners', async (req, res) => {
  try {
    const db = await getDb();
    const stmt = db.prepare(`SELECT * FROM brand_banners WHERE brand_id = ? ORDER BY id DESC`);
    stmt.bind([req.params.id]);

    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /brands/{id}/banners:
 *   post:
 *     summary: Marka täze dönüniz reklam/banner suraty goş
 *     tags: [Brands - Banners]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [image]
 *             properties:
 *               image:
 *                 type: string
 *                 format: binary
 *               link:
 *                 type: string
 *               title:
 *                 type: string
 *     responses:
 *       201:
 *         description: Banner goşuldy
 */
router.post('/:id/banners', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Surat ýükläň!' });
    }

    const db = await getDb();
    const brandId = parseInt(req.params.id, 10);
    const image = `/uploads/${req.file.filename}`;
    const { link, title } = req.body;

    db.run(
      `INSERT INTO brand_banners (brand_id, image, link, title) VALUES (?, ?, ?, ?)`,
      [brandId, image, link || null, title || null]
    );

    const stmt = db.prepare(`SELECT last_insert_rowid() as id`);
    stmt.step();
    const { id } = stmt.getAsObject();
    stmt.free();

    saveDb();

    res.status(201).json({ id, brand_id: brandId, image, link, title });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /brands/banners/{banner_id}:
 *   delete:
 *     summary: Garaşylmadyk ýa-da gabat gelmedik reklam suratyny poz (sil)
 *     tags: [Brands - Banners]
 *     parameters:
 *       - in: path
 *         name: banner_id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Banner pozuldy
 */
router.delete('/banners/:banner_id', async (req, res) => {
  try {
    const db = await getDb();
    const bannerId = req.params.banner_id;

    const checkStmt = db.prepare(`SELECT id FROM brand_banners WHERE id = ?`);
    checkStmt.bind([bannerId]);
    const exists = checkStmt.step();
    checkStmt.free();

    if (!exists) return res.status(404).json({ error: 'Banner tapylmady' });

    db.run(`DELETE FROM brand_banners WHERE id = ?`, [bannerId]);
    saveDb();

    res.json({ message: 'Banner üstünlikli pozuldy' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;