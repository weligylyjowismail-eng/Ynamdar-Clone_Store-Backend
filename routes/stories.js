const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { getDb, saveDb } = require('../db/init');

// Multer Ayarları (Yüklenen görselleri uploads/ klasörüne kaydeder)
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  },
});

const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

// Yardımcı Fonksiyon: Story'leri getiren SQL sorgusu
function getStories(db, where = '1=1', params = [], limit = 20, offset = 0, order = 'id DESC') {
  const sql = `
    SELECT * FROM stories
    WHERE ${where}
    ORDER BY ${order}
    LIMIT ? OFFSET ?
  `;
  const stmt = db.prepare(sql);
  stmt.bind([...params, limit, offset]);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

/**
 * @swagger
 * /stories:
 *   get:
 *     summary: Tüm story listesini getirir
 *     tags: [Stories]
 *     responses:
 *       200:
 *         description: Story listesi başarıyla getirildi
 */
router.get('/', async (req, res) => {
  try {
    const db = await getDb();
    const rows = getStories(db);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /stories:
 *   post:
 *     summary: Yeni Story Kaydet
 *     tags: [Stories]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [title]
 *             properties:
 *               title:
 *                 type: string
 *               image:
 *                 type: string
 *                 format: binary
 *     responses:
 *       201:
 *         description: Story başarıyla kaydedildi
 */
router.post('/', upload.single('image'), async (req, res) => {
  try {
    const db = await getDb();
    const { title } = req.body;

    if (!title) {
      return res.status(400).json({ error: 'title alani zorunludur' });
    }

    // Yüklenen resim yolunu belirle
    const image = req.file ? `/uploads/${req.file.filename}` : null;

    // Veritabanına Ekle
    db.run(`INSERT INTO stories (title, image) VALUES (?, ?)`, [title, image]);

    // Değişikliği dosyaya kaydet
    saveDb();

    // Son eklenen kaydın ID'sini çek
    const stmt = db.prepare(`SELECT last_insert_rowid() as id`);
    stmt.step();
    const { id } = stmt.getAsObject();
    stmt.free();

    // Eklenen yeni veriyi çek
    const rows = getStories(db, 'id = ?', [id], 1, 0);

    // Başarı mesajı ve veriyi geri dön
    res.status(201).json({
      message: 'Story başarıyla eklendi',
      data: rows[0]
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /stories/{id}:
 *   delete:
 *     summary: Story sil
 *     tags: [Stories]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Story silindi
 */
router.delete('/:id', async (req, res) => {
  try {
    const db = await getDb();
    db.run(`DELETE FROM stories WHERE id = ?`, [req.params.id]);
    saveDb();
    res.json({ message: 'Story başarıyla silindi' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;