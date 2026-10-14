const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { getDb, saveDb } = require('../db/init');

/**
 * @swagger
 * /addresses:
 *   get:
 *     summary: Get all addresses for logged in user
 *     tags: [Addresses]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of addresses
 */
router.get('/', auth, async (req, res) => {
  try {
    const db = await getDb();
    const stmt = db.prepare(`SELECT * FROM addresses WHERE user_id = ? ORDER BY id ASC`);
    stmt.bind([req.user.id]);
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
 * /addresses/{id}:
 *   get:
 *     summary: Get a single address
 *     tags: [Addresses]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Address object
 */
router.get('/:id', auth, async (req, res) => {
  try {
    const db = await getDb();
    const stmt = db.prepare(`SELECT * FROM addresses WHERE id = ? AND user_id = ?`);
    stmt.bind([req.params.id, req.user.id]);
    const row = stmt.step() ? stmt.getAsObject() : null;
    stmt.free();

    if (!row) return res.status(404).json({ error: 'Address not found' });
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /addresses:
 *   post:
 *     summary: Add a new address
 *     tags: [Addresses]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, username, phone, body]
 *             properties:
 *               name: { type: string }
 *               username: { type: string }
 *               phone: { type: string }
 *               body: { type: string }
 *               active: { type: boolean }
 *     responses:
 *       201:
 *         description: Created
 */
router.post('/', auth, async (req, res) => {
  try {
    const db = await getDb();
    const { name, username, phone, body, active } = req.body;

    if (!name || !username || !phone || !body) {
      return res.status(400).json({ error: 'name, username, phone, body are required' });
    }

    db.run(
      `INSERT INTO addresses (user_id, name, username, phone, body, active) VALUES (?, ?, ?, ?, ?, ?)`,
      [req.user.id, name, username, phone, body, active !== undefined ? (active ? 1 : 0) : 1]
    );
    saveDb();

    const stmt = db.prepare(`SELECT last_insert_rowid() as id`);
    stmt.step();
    const { id } = stmt.getAsObject();
    stmt.free();

    const stmt2 = db.prepare(`SELECT * FROM addresses WHERE id = ?`);
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
 * /addresses/{id}:
 *   put:
 *     summary: Update an address
 *     tags: [Addresses]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Updated
 */
router.put('/:id', auth, async (req, res) => {
  try {
    const db = await getDb();
    const stmt = db.prepare(`SELECT * FROM addresses WHERE id = ? AND user_id = ?`);
    stmt.bind([req.params.id, req.user.id]);
    const existing = stmt.step() ? stmt.getAsObject() : null;
    stmt.free();

    if (!existing) return res.status(404).json({ error: 'Address not found' });

    const { name, username, phone, body, active } = req.body;

    db.run(
      `UPDATE addresses SET name=?, username=?, phone=?, body=?, active=? WHERE id=?`,
      [
        name || existing.name,
        username || existing.username,
        phone || existing.phone,
        body || existing.body,
        active !== undefined ? (active ? 1 : 0) : existing.active,
        req.params.id,
      ]
    );
    saveDb();

    const stmt2 = db.prepare(`SELECT * FROM addresses WHERE id = ?`);
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
 * /addresses/{id}:
 *   delete:
 *     summary: Delete an address
 *     tags: [Addresses]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Deleted
 */
router.delete('/:id', auth, async (req, res) => {
  try {
    const db = await getDb();
    db.run(`DELETE FROM addresses WHERE id = ? AND user_id = ?`, [req.params.id, req.user.id]);
    saveDb();
    res.json({ message: 'Address deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
