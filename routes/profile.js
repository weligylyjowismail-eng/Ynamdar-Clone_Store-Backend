const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const auth = require('../middleware/auth');
const { getDb, saveDb } = require('../db/init');

/**
 * @swagger
 * /profile:
 *   get:
 *     summary: Get current user profile
 *     tags: [Profile]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User profile
 */
router.get('/', auth, async (req, res) => {
  try {
    const db = await getDb();
    const stmt = db.prepare(`SELECT id, username, phone, email, gender, birth_date, cash_back, address, created_at FROM users WHERE id = ?`);
    stmt.bind([req.user.id]);
    const user = stmt.step() ? stmt.getAsObject() : null;
    stmt.free();

    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /profile:
 *   put:
 *     summary: Update user profile
 *     tags: [Profile]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               phone: { type: string }
 *               username: { type: string }
 *               address: { type: string }
 *               gender: { type: string }
 *               birth_date: { type: string }
 *               cash_back: { type: number }
 *     responses:
 *       200:
 *         description: Updated profile
 */
router.put('/', auth, async (req, res) => {
  try {
    const db = await getDb();
    const stmt = db.prepare(`SELECT * FROM users WHERE id = ?`);
    stmt.bind([req.user.id]);
    const existing = stmt.step() ? stmt.getAsObject() : null;
    stmt.free();

    if (!existing) return res.status(404).json({ error: 'User not found' });

    const { phone, username, address, gender, birth_date, cash_back } = req.body;

    db.run(
      `UPDATE users SET phone=?, username=?, address=?, gender=?, birth_date=?, cash_back=? WHERE id=?`,
      [
        phone ?? existing.phone,
        username || existing.username,
        address ?? existing.address,
        gender ?? existing.gender,
        birth_date ?? existing.birth_date,
        cash_back ?? existing.cash_back,
        req.user.id,
      ]
    );
    saveDb();

    const stmt2 = db.prepare(`SELECT id, username, phone, email, gender, birth_date, cash_back, address FROM users WHERE id = ?`);
    stmt2.bind([req.user.id]);
    const updated = stmt2.step() ? stmt2.getAsObject() : null;
    stmt2.free();

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /profile/password:
 *   put:
 *     summary: Change password
 *     tags: [Profile]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [old_password, new_password]
 *             properties:
 *               old_password: { type: string }
 *               new_password: { type: string }
 *     responses:
 *       200:
 *         description: Password changed
 */
router.put('/password', auth, async (req, res) => {
  try {
    const db = await getDb();
    const { old_password, new_password } = req.body;

    if (!old_password || !new_password) {
      return res.status(400).json({ error: 'old_password and new_password are required' });
    }

    const stmt = db.prepare(`SELECT * FROM users WHERE id = ?`);
    stmt.bind([req.user.id]);
    const user = stmt.step() ? stmt.getAsObject() : null;
    stmt.free();

    if (!user || !bcrypt.compareSync(old_password, user.password)) {
      return res.status(401).json({ error: 'Incorrect old password' });
    }

    const hashed = bcrypt.hashSync(new_password, 10);
    db.run(`UPDATE users SET password=? WHERE id=?`, [hashed, req.user.id]);
    saveDb();

    res.json({ message: 'Password updated successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /profile/delete:
 *   delete:
 *     summary: Delete user account
 *     tags: [Profile]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Account deleted
 */
router.delete('/delete', auth, async (req, res) => {
  try {
    const db = await getDb();
    db.run(`DELETE FROM users WHERE id = ?`, [req.user.id]);
    saveDb();
    res.json({ message: 'Account deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
