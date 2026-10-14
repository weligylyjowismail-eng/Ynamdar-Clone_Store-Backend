const express = require('express');
const router = express.Router();
const { getDb, saveDb } = require('../db/init');

/**
 * @swagger
 * tags:
 *   name: Market Categories
 *   description: Market kategoriýalaryny dolandyrmak (CRUD)
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     MarketCategory:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           example: 1
 *         title_tm:
 *           type: string
 *           example: "Azyk harytlar"
 *         title_ru:
 *           type: string
 *           example: "Продукты питания"
 *         image:
 *           type: string
 *           example: "/uploads/1700000000000.jpg"
 *         order_number:
 *           type: integer
 *           example: 1
 */

/**
 * @swagger
 * /api/market-categories:
 *   get:
 *     summary: Ähli market kategoriýalaryny getirmek
 *     tags: [Market Categories]
 *     responses:
 *       200:
 *         description: Ustünlikli
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/MarketCategory'
 *       500:
 *         description: Serwer ýalňyşlygy
 */
router.get('/market-categories', async (req, res) => {
  try {
    const db = await getDb();
    const stmt = db.prepare('SELECT * FROM market_categories ORDER BY order_number ASC, id DESC');
    const categories = [];
    while (stmt.step()) categories.push(stmt.getAsObject());
    stmt.free();

    res.json({ success: true, data: categories });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @swagger
 * /api/market-categories/{id}:
 *   get:
 *     summary: ID boýunça kategoriýa getirmek
 *     tags: [Market Categories]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Kategoriýa tapyldy
 *       404:
 *         description: Kategoriýa tapylmady
 */
router.get('/market-categories/:id', async (req, res) => {
  try {
    const db = await getDb();
    const { id } = req.params;

    const stmt = db.prepare('SELECT * FROM market_categories WHERE id = ?');
    stmt.bind([id]);
    const category = stmt.step() ? stmt.getAsObject() : null;
    stmt.free();

    if (!category) {
      return res.status(404).json({ success: false, message: 'Kategoriýa tapylmady' });
    }

    res.json({ success: true, data: category });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @swagger
 * /api/market-categories:
 *   post:
 *     summary: Täze market kategoriýasyny goşmak (Surat ýüklemek bilen)
 *     tags: [Market Categories]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - title_tm
 *               - title_ru
 *             properties:
 *               title_tm:
 *                 type: string
 *                 example: "Azyk harytlar"
 *               title_ru:
 *                 type: string
 *                 example: "Продукты питания"
 *               order_number:
 *                 type: integer
 *                 example: 1
 *               image:
 *                 type: string
 *                 format: binary
 *                 description: Kategoriýanyň suraty
 *     responses:
 *       201:
 *         description: Ustünlikli döredildi
 *       400:
 *         description: Meýdançalar kem
 */
router.post(
  '/market-categories',
  (req, res, next) => {
    const upload = req.app.locals.upload;
    if (upload && typeof upload.single === 'function') {
      return upload.single('image')(req, res, next);
    }
    next();
  },
  async (req, res) => {
    try {
      const db = await getDb();
      const { title_tm, title_ru, order_number } = req.body;

      if (!title_tm || !title_ru) {
        return res.status(400).json({
          success: false,
          message: 'title_tm we title_ru meýdançalary hökmanydyr!',
        });
      }

      const imagePath = req.file ? `/uploads/${req.file.filename}` : null;

      db.run(
        `INSERT INTO market_categories (title_tm, title_ru, image, order_number) VALUES (?, ?, ?, ?)`,
        [title_tm, title_ru, imagePath, order_number || 0]
      );

      // IMPORTANT: last_insert_rowid() must be read BEFORE saveDb()/db.export(),
      // otherwise sql.js loses track of it and returns 0.
      const idStmt = db.prepare('SELECT last_insert_rowid() as id');
      idStmt.step();
      const { id } = idStmt.getAsObject();
      idStmt.free();

      const stmt = db.prepare('SELECT * FROM market_categories WHERE id = ?');
      stmt.bind([id]);
      const lastItem = stmt.step() ? stmt.getAsObject() : null;
      stmt.free();

      saveDb();

      res.status(201).json({
        success: true,
        message: 'Market kategoriýasy üstünlikli goşuldy',
        data: lastItem,
      });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

/**
 * @swagger
 * /api/market-categories/{id}:
 *   put:
 *     summary: Market kategoriýasyny täzelemek (Surat / Tekst)
 *     tags: [Market Categories]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               title_tm:
 *                 type: string
 *                 example: "Azyk harytlar"
 *               title_ru:
 *                 type: string
 *                 example: "Продукты питания"
 *               order_number:
 *                 type: integer
 *                 example: 1
 *               image:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Ustünlikli täzelendi
 *       404:
 *         description: Kategoriýa tapylmady
 */
router.put(
  '/market-categories/:id',
  (req, res, next) => {
    const upload = req.app.locals.upload;
    if (upload && typeof upload.single === 'function') {
      return upload.single('image')(req, res, next);
    }
    next();
  },
  async (req, res) => {
    try {
      const db = await getDb();
      const { id } = req.params;
      const { title_tm, title_ru, order_number } = req.body;

      const existingStmt = db.prepare('SELECT * FROM market_categories WHERE id = ?');
      existingStmt.bind([id]);
      const existing = existingStmt.step() ? existingStmt.getAsObject() : null;
      existingStmt.free();

      if (!existing) {
        return res.status(404).json({ success: false, message: 'Kategoriýa tapylmady' });
      }

      const imagePath = req.file ? `/uploads/${req.file.filename}` : existing.image;

      db.run(
        `UPDATE market_categories 
         SET title_tm = ?, title_ru = ?, image = ?, order_number = ? 
         WHERE id = ?`,
        [
          title_tm !== undefined ? title_tm : existing.title_tm,
          title_ru !== undefined ? title_ru : existing.title_ru,
          imagePath,
          order_number !== undefined ? order_number : existing.order_number,
          id,
        ]
      );
      saveDb();

      const stmt = db.prepare('SELECT * FROM market_categories WHERE id = ?');
      stmt.bind([id]);
      const updatedCategory = stmt.step() ? stmt.getAsObject() : null;
      stmt.free();

      res.json({
        success: true,
        message: 'Market kategoriýasy täzelendi',
        data: updatedCategory,
      });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

/**
 * @swagger
 * /api/market-categories/{id}:
 *   delete:
 *     summary: Market kategoriýasyny pozmak
 *     tags: [Market Categories]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Ustünlikli pozuldy
 *       404:
 *         description: Kategoriýa tapylmady
 */
router.delete('/market-categories/:id', async (req, res) => {
  try {
    const db = await getDb();
    const { id } = req.params;

    const existingStmt = db.prepare('SELECT * FROM market_categories WHERE id = ?');
    existingStmt.bind([id]);
    const existing = existingStmt.step() ? existingStmt.getAsObject() : null;
    existingStmt.free();

    if (!existing) {
      return res.status(404).json({ success: false, message: 'Kategoriýa tapylmady' });
    }

    db.run('DELETE FROM market_categories WHERE id = ?', [id]);
    saveDb();

    res.json({
      success: true,
      message: 'Market kategoriýasy üstünlikli pozuldy',
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;