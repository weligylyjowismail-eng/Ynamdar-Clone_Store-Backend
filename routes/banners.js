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
 * /banners:
 *   get:
 *     summary: Get all banners
 *     tags: [Banners]
 *     responses:
 *       200:
 *         description: List of banners
 */
router.get('/', async (req, res) => {
  try {
    const db = await getDb();
    const stmt = db.prepare(`SELECT * FROM banners ORDER BY id ASC`);
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
 * /banners/{id}:
 *   get:
 *     summary: Get a single banner
 *     tags: [Banners]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Banner object
 */
router.get('/:id', async (req, res) => {
  try {
    const db = await getDb();
    const stmt = db.prepare(`SELECT * FROM banners WHERE id = ?`);
    stmt.bind([req.params.id]);
    const row = stmt.step() ? stmt.getAsObject() : null;
    stmt.free();
    if (!row) return res.status(404).json({ error: 'Banner not found' });
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /banners:
 *   post:
 *     summary: Create a banner
 *     tags: [Banners]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: { type: string }
 *               image: { type: string, format: binary }
 *               link: { type: string }
 *               active: { type: boolean }
 *               body: { type: string }
 *     responses:
 *       201:
 *         description: Created
 */
router.post('/', upload.single('image'), async (req, res) => {
  try {
    const db = await getDb();
    const { name, link, active, body } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });
    const image = req.file ? `/uploads/${req.file.filename}` : null;
    db.run(
      `INSERT INTO banners (name, image, link, active, body) VALUES (?, ?, ?, ?, ?)`,
      [name, image, link || null, active !== undefined ? (active === 'true' || active === true ? 1 : 0) : 1, body || null]
    );
    const stmt = db.prepare(`SELECT last_insert_rowid() as id`);
    stmt.step();
    const { id } = stmt.getAsObject();
    stmt.free();
    const stmt2 = db.prepare(`SELECT * FROM banners WHERE id = ?`);
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
 * /banners/{id}:
 *   put:
 *     summary: Update a banner
 *     tags: [Banners]
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
 *               name: { type: string }
 *               image: { type: string, format: binary }
 *               link: { type: string }
 *               active: { type: boolean }
 *               body: { type: string }
 *     responses:
 *       200:
 *         description: Updated
 */
router.put('/:id', upload.single('image'), async (req, res) => {
  try {
    const db = await getDb();
    const stmt = db.prepare(`SELECT * FROM banners WHERE id = ?`);
    stmt.bind([req.params.id]);
    const existing = stmt.step() ? stmt.getAsObject() : null;
    stmt.free();
    if (!existing) return res.status(404).json({ error: 'Banner not found' });

    const image = req.file ? `/uploads/${req.file.filename}` : existing.image;
    const { name, link, active, body } = req.body;
    db.run(
      `UPDATE banners SET name=?, image=?, link=?, active=?, body=? WHERE id=?`,
      [
        name || existing.name,
        image,
        link ?? existing.link,
        active !== undefined ? (active === 'true' || active === true ? 1 : 0) : existing.active,
        body ?? existing.body,
        req.params.id,
      ]
    );
    saveDb();
    const stmt2 = db.prepare(`SELECT * FROM banners WHERE id = ?`);
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
 * /banners/{id}:
 *   delete:
 *     summary: Delete a banner
 *     tags: [Banners]
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
    db.run(`DELETE FROM banners WHERE id = ?`, [req.params.id]);
    saveDb();
    res.json({ message: 'Banner deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;