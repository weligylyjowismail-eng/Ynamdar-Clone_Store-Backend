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

function buildTree(categories, parentId = null) {
  return categories
    .filter(c => c.parent_id === parentId)
    .map(c => ({ ...c, children: buildTree(categories, c.id) }));
}

// Sub-category ID-lerini recursive tapyar
function getAllSubCategoryIds(db, parentId) {
  const ids = [];
  const stack = [parentId];
  while (stack.length > 0) {
    const currentId = stack.pop();
    ids.push(currentId);
    const stmt = db.prepare(`SELECT id FROM categories WHERE parent_id = ?`);
    stmt.bind([currentId]);
    while (stmt.step()) {
      stack.push(stmt.getAsObject().id);
    }
    stmt.free();
  }
  return ids;
}

/**
 * @swagger
 * /categories:
 *   get:
 *     summary: Get all categories as recursive tree
 *     tags: [Categories]
 *     parameters:
 *       - in: query
 *         name: name
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Category tree
 */
router.get('/', async (req, res) => {
  try {
    const db = await getDb();
    const { name } = req.query;
    let sql = `SELECT * FROM categories`;
    let params = [];
    if (name) {
      sql += ` WHERE name_tm LIKE ? OR name_ru LIKE ? OR name_en LIKE ?`;
      const like = `%${name}%`;
      params = [like, like, like];
    }
    sql += ` ORDER BY order_num ASC, id ASC`;
    const stmt = db.prepare(sql);
    stmt.bind(params);
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
    res.json(buildTree(rows));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /categories/homepage:
 *   get:
 *     summary: Get all root categories with max 4 products each (for homepage)
 *     tags: [Categories]
 *     responses:
 *       200:
 *         description: List of root categories, each with up to 4 products (including subcategory products)
 */
router.get('/homepage', async (req, res) => {
  try {
    const db = await getDb();

    // Diňe root (parent_id NULL) categorylar
    const catStmt = db.prepare(`SELECT * FROM categories WHERE parent_id IS NULL ORDER BY order_num ASC, id ASC`);
    const categories = [];
    while (catStmt.step()) categories.push(catStmt.getAsObject());
    catStmt.free();

    const result = categories.map(category => {
      // Bu category + sub-categorylaryn ID-lerini topla
      const allIds = getAllSubCategoryIds(db, category.id);
      const placeholders = allIds.map(() => '?').join(',');

      // Max 4 haryt getir
      const prodStmt = db.prepare(`
        SELECT p.*, b.name as brand_name,
               c.name_tm as category_name_tm, c.name_ru as category_name_ru, c.name_en as category_name_en
        FROM products p
        LEFT JOIN brands b ON p.brand_id = b.id
        LEFT JOIN categories c ON p.category_id = c.id
        WHERE p.category_id IN (${placeholders})
        ORDER BY p.id ASC
        LIMIT 4
      `);
      prodStmt.bind(allIds);
      const products = [];
      while (prodStmt.step()) products.push(prodStmt.getAsObject());
      prodStmt.free();

      return { ...category, products };
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /categories/{id}:
 *   get:
 *     summary: Get a single category
 *     tags: [Categories]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Category object
 */
router.get('/:id', async (req, res) => {
  try {
    const db = await getDb();
    const stmt = db.prepare(`SELECT * FROM categories WHERE id = ?`);
    stmt.bind([req.params.id]);
    const row = stmt.step() ? stmt.getAsObject() : null;
    stmt.free();
    if (!row) return res.status(404).json({ error: 'Category not found' });
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /categories:
 *   post:
 *     summary: Create a category
 *     tags: [Categories]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [name_tm, name_ru, name_en]
 *             properties:
 *               parent_id: { type: integer }
 *               name_tm: { type: string }
 *               name_ru: { type: string }
 *               name_en: { type: string }
 *               order_num: { type: integer }
 *               image: { type: string, format: binary }
 *     responses:
 *       201:
 *         description: Created
 */
router.post('/', upload.single('image'), async (req, res) => {
  try {
    const db = await getDb();
    const { parent_id, name_tm, name_ru, name_en, order_num } = req.body;
    if (!name_tm || !name_ru || !name_en) {
      return res.status(400).json({ error: 'name_tm, name_ru, name_en are required' });
    }
    const image = req.file ? `/uploads/${req.file.filename}` : null;
    db.run(
      `INSERT INTO categories (parent_id, name_tm, name_ru, name_en, image, order_num) VALUES (?, ?, ?, ?, ?, ?)`,
      [parent_id || null, name_tm, name_ru, name_en, image, order_num || 0]
    );
    saveDb();
    const stmt = db.prepare(`SELECT last_insert_rowid() as id`);
    stmt.step();
    const { id } = stmt.getAsObject();
    stmt.free();
    const stmt2 = db.prepare(`SELECT * FROM categories WHERE id = ?`);
    stmt2.bind([id]);
    const row = stmt2.step() ? stmt2.getAsObject() : null;
    stmt2.free();
    res.status(201).json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /categories/{id}:
 *   put:
 *     summary: Update a category
 *     tags: [Categories]
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
 *               parent_id: { type: integer }
 *               name_tm: { type: string }
 *               name_ru: { type: string }
 *               name_en: { type: string }
 *               order_num: { type: integer }
 *               image: { type: string, format: binary }
 *     responses:
 *       200:
 *         description: Updated
 */
router.put('/:id', upload.single('image'), async (req, res) => {
  try {
    const db = await getDb();
    const stmt = db.prepare(`SELECT * FROM categories WHERE id = ?`);
    stmt.bind([req.params.id]);
    const existing = stmt.step() ? stmt.getAsObject() : null;
    stmt.free();
    if (!existing) return res.status(404).json({ error: 'Category not found' });

    const image = req.file ? `/uploads/${req.file.filename}` : existing.image;
    db.run(
      `UPDATE categories SET parent_id=?, name_tm=?, name_ru=?, name_en=?, image=?, order_num=? WHERE id=?`,
      [
        req.body.parent_id ?? existing.parent_id,
        req.body.name_tm || existing.name_tm,
        req.body.name_ru || existing.name_ru,
        req.body.name_en || existing.name_en,
        image,
        req.body.order_num ?? existing.order_num,
        req.params.id,
      ]
    );
    saveDb();
    const stmt2 = db.prepare(`SELECT * FROM categories WHERE id = ?`);
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
 * /categories/{id}:
 *   delete:
 *     summary: Delete a category
 *     tags: [Categories]
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
    db.run(`DELETE FROM categories WHERE id = ?`, [req.params.id]);
    saveDb();
    res.json({ message: 'Category deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /categories/{id}/order:
 *   put:
 *     summary: Change order number of a category
 *     tags: [Categories]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [order_num]
 *             properties:
 *               order_num: { type: integer }
 *     responses:
 *       200:
 *         description: Order updated
 */
router.put('/:id/order', async (req, res) => {
  try {
    const db = await getDb();
    const { order_num } = req.body;

    if (order_num === undefined) {
      return res.status(400).json({ error: 'order_num is required' });
    }

    const stmt = db.prepare(`SELECT * FROM categories WHERE id = ?`);
    stmt.bind([req.params.id]);
    const existing = stmt.step() ? stmt.getAsObject() : null;
    stmt.free();

    if (!existing) {
      return res.status(404).json({ error: 'Category not found' });
    }

    db.run(`UPDATE categories SET order_num = ? WHERE id = ?`, [order_num, req.params.id]);
    saveDb();

    res.json({ message: 'Category order updated', id: req.params.id, order_num });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /categories/{parentId}/subcategories:
 *   get:
 *     summary: Get subcategories by parent ID
 *     tags: [Categories]
 *     parameters:
 *       - in: path
 *         name: parentId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: List of subcategories
 */
router.get('/:parentId/subcategories', async (req, res) => {
  try {
    const db = await getDb();
    const stmt = db.prepare(`SELECT * FROM categories WHERE parent_id = ? ORDER BY order_num ASC, id ASC`);
    stmt.bind([req.params.parentId]);
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;