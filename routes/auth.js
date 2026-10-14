const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getDb, saveDb } = require('../db/init');

const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkey123';

/**
 * @swagger
 * /register:
 *   post:
 *     summary: Register a new user
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [username, password]
 *             properties:
 *               username: { type: string }
 *               phone: { type: string }
 *               email: { type: string }
 *               password: { type: string }
 *     responses:
 *       201:
 *         description: User registered
 */
router.post('/register', async (req, res) => {
  try {
    const db = await getDb();
    const { username, phone, email, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'username and password are required' });
    }
    if (!phone && !email) {
      return res.status(400).json({ error: 'phone or email is required' });
    }

    const hashedPassword = bcrypt.hashSync(password, 10);
    db.run(
      `INSERT INTO users (username, phone, email, password) VALUES (?, ?, ?, ?)`,
      [username, phone || null, email || null, hashedPassword]
    );
    saveDb();

    const stmt = db.prepare(`SELECT last_insert_rowid() as id`);
    stmt.step();
    const { id } = stmt.getAsObject();
    stmt.free();

    const token = jwt.sign({ id, username }, JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({ token, user: { id, username, phone, email } });
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'Phone or email already in use' });
    }
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /login:
 *   post:
 *     summary: Login with phone/email and password
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [password]
 *             properties:
 *               phone: { type: string }
 *               email: { type: string }
 *               password: { type: string }
 *     responses:
 *       200:
 *         description: Login successful
 *       401:
 *         description: Invalid credentials
 */
router.post('/login', async (req, res) => {
  try {
    const db = await getDb();
    const { phone, email, password } = req.body;

    if (!password || (!phone && !email)) {
      return res.status(400).json({ error: 'phone or email and password are required' });
    }

    let user = null;
    if (phone) {
      const stmt = db.prepare(`SELECT * FROM users WHERE phone = ?`);
      stmt.bind([phone]);
      user = stmt.step() ? stmt.getAsObject() : null;
      stmt.free();
    } else {
      const stmt = db.prepare(`SELECT * FROM users WHERE email = ?`);
      stmt.bind([email]);
      user = stmt.step() ? stmt.getAsObject() : null;
      stmt.free();
    }

    if (!user || !bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
    const { password: _, ...userData } = user;
    res.json({ token, user: userData });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
