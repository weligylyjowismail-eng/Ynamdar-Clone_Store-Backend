const express = require('express');
const router = express.Router();
const { getDb } = require('../db/init');

function productQuery(db, where, params, limit, offset, order) {
  const sql = `
    SELECT p.*, b.name as brand_name,
           c.name_tm as category_name_tm, c.name_ru as category_name_ru, c.name_en as category_name_en
    FROM products p
    LEFT JOIN brands b ON p.brand_id = b.id
    LEFT JOIN categories c ON p.category_id = c.id
    WHERE ${where}
    ORDER BY ${order}
    LIMIT ? OFFSET ?
  `;
  const stmt = db.prepare(sql);
  stmt.bind([...params, limit, offset]);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

function countQuery(db, where, params) {
  const sql = `SELECT COUNT(*) as cnt FROM products p WHERE ${where}`;
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const total = stmt.step() ? stmt.getAsObject().cnt : 0;
  stmt.free();
  return total;
}

/**
 * @swagger
 * /similar-products/{id}:
 *   get:
 *     summary: Get similar products (same category)
 *     tags: [Products]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: List of similar products
 */
router.get('/similar-products/:id', async (req, res) => {
  try {
    const db = await getDb();

    const stmt = db.prepare(`SELECT category_id FROM products WHERE id = ?`);
    stmt.bind([req.params.id]);
    const product = stmt.step() ? stmt.getAsObject() : null;
    stmt.free();

    if (!product) return res.status(404).json({ error: 'Product not found' });

    const rows = productQuery(
      db,
      'p.category_id = ? AND p.id != ?',
      [product.category_id, req.params.id],
      10, 0, 'p.id ASC'
    );

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /category/{id}:
 *   get:
 *     summary: Get products by category
 *     tags: [Products]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *       - in: query
 *         name: offset
 *         schema: { type: integer, default: 0 }
 *       - in: query
 *         name: price
 *         schema: { type: string, enum: [asc, desc] }
 *       - in: query
 *         name: brand_id
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Products list
 */
router.get('/category/:id', async (req, res) => {
  try {
    const db = await getDb();
    const limit = parseInt(req.query.limit) || 20;
    const offset = parseInt(req.query.offset) || 0;
    const order = req.query.price === 'desc' ? 'p.price DESC' : req.query.price === 'asc' ? 'p.price ASC' : 'p.id ASC';

    let where = 'p.category_id = ?';
    let params = [req.params.id];

    if (req.query.brand_id) {
      where += ' AND p.brand_id = ?';
      params.push(req.query.brand_id);
    }

    const rows = productQuery(db, where, params, limit, offset, order);
    const total = countQuery(db, where, params);

    res.json({ data: rows, total, limit, offset });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /brand/{id}:
 *   get:
 *     summary: Get products by brand
 *     tags: [Products]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *       - in: query
 *         name: offset
 *         schema: { type: integer, default: 0 }
 *       - in: query
 *         name: price
 *         schema: { type: string, enum: [asc, desc] }
 *     responses:
 *       200:
 *         description: Products list
 */
router.get('/brand/:id', async (req, res) => {
  try {
    const db = await getDb();
    const limit = parseInt(req.query.limit) || 20;
    const offset = parseInt(req.query.offset) || 0;
    const order = req.query.price === 'desc' ? 'p.price DESC' : req.query.price === 'asc' ? 'p.price ASC' : 'p.id ASC';

    const rows = productQuery(db, 'p.brand_id = ?', [req.params.id], limit, offset, order);
    const total = countQuery(db, 'p.brand_id = ?', [req.params.id]);

    res.json({ data: rows, total, limit, offset });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /search/{keyword}:
 *   get:
 *     summary: Search products by keyword
 *     tags: [Products]
 *     parameters:
 *       - in: path
 *         name: keyword
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *       - in: query
 *         name: offset
 *         schema: { type: integer, default: 0 }
 *       - in: query
 *         name: price
 *         schema: { type: string, enum: [asc, desc] }
 *       - in: query
 *         name: brand_id
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Search results
 */
router.get('/search/:keyword', async (req, res) => {
  try {
    const db = await getDb();
    const limit = parseInt(req.query.limit) || 20;
    const offset = parseInt(req.query.offset) || 0;
    const order = req.query.price === 'desc' ? 'p.price DESC' : req.query.price === 'asc' ? 'p.price ASC' : 'p.id ASC';
    const like = `%${req.params.keyword}%`;

    let where = '(p.name_tm LIKE ? OR p.name_ru LIKE ? OR p.name_en LIKE ? OR p.kode LIKE ?)';
    let params = [like, like, like, like];

    if (req.query.brand_id) {
      where += ' AND p.brand_id = ?';
      params.push(req.query.brand_id);
    }

    const rows = productQuery(db, where, params, limit, offset, order);
    const total = countQuery(db, where, params);

    res.json({ data: rows, total, limit, offset });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
