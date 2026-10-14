const express = require('express');
const router = express.Router();
const { getDb, saveDb } = require('../db/init');

function listBrands(db, where, limit, order) {
  const stmt = db.prepare(
    `SELECT id, name, image, vip, is_new FROM brands WHERE ${where} ORDER BY ${order} LIMIT ?`
  );
  stmt.bind([limit]);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

function getBrand(db, id) {
  const stmt = db.prepare(`SELECT id, name, image, vip, is_new FROM brands WHERE id = ?`);
  stmt.bind([id]);
  const row = stmt.step() ? stmt.getAsObject() : null;
  stmt.free();
  return row;
}

const toFlag = (v) => (v === '1' || v === 'true' || v === 1 || v === true ? 1 : 0);

/**
 * @swagger
 * /brand-flags/vip:
 *   get:
 *     summary: Get VIP brands (VIP dükanlar section)
 *     tags: [Brand Flags]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: List of VIP brands
 */
router.get('/vip', async (req, res) => {
  try {
    const db = await getDb();
    const limit = parseInt(req.query.limit) || 20;
    res.json(listBrands(db, 'vip = 1', limit, 'id ASC'));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /brand-flags/new:
 *   get:
 *     summary: Get new brands (Täze dükanlar section)
 *     tags: [Brand Flags]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: List of new brands
 */
router.get('/new', async (req, res) => {
  try {
    const db = await getDb();
    const limit = parseInt(req.query.limit) || 20;
    res.json(listBrands(db, 'is_new = 1', limit, 'id DESC'));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /brand-flags/{id}:
 *   put:
 *     summary: Mark a brand as VIP and/or new
 *     tags: [Brand Flags]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *       - in: query
 *         name: vip
 *         schema: { type: integer, enum: [0, 1] }
 *       - in: query
 *         name: is_new
 *         schema: { type: integer, enum: [0, 1] }
 *     responses:
 *       200:
 *         description: Updated brand
 */
router.put('/:id', async (req, res) => {
  try {
    const db = await getDb();
    const brand = getBrand(db, req.params.id);
    if (!brand) return res.status(404).json({ error: 'Brand not found' });

    const vip = req.query.vip !== undefined ? toFlag(req.query.vip) : brand.vip;
    const isNew = req.query.is_new !== undefined ? toFlag(req.query.is_new) : brand.is_new;

    db.run(`UPDATE brands SET vip = ?, is_new = ? WHERE id = ?`, [vip, isNew, req.params.id]);
    saveDb();

    res.json(getBrand(db, req.params.id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;