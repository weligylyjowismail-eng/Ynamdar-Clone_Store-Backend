const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { getDb } = require('../db/init');

/**
 * @swagger
 * /orders:
 *   get:
 *     summary: Get all orders for logged in user
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of orders
 */
router.get('/', auth, async (req, res) => {
  try {
    const db = await getDb();
    const sql = `
      SELECT o.*, 
        json_group_array(json_object(
          'id', oi.id,
          'product_id', oi.product_id,
          'quantity', oi.quantity,
          'price', oi.price,
          'product_name_tm', p.name_tm,
          'product_name_ru', p.name_ru,
          'product_name_en', p.name_en
        )) as items
      FROM orders o
      LEFT JOIN order_items oi ON o.id = oi.order_id
      LEFT JOIN products p ON oi.product_id = p.id
      WHERE o.user_id = ?
      GROUP BY o.id
      ORDER BY o.created_at DESC
    `;
    const stmt = db.prepare(sql);
    stmt.bind([req.user.id]);
    const rows = [];
    while (stmt.step()) {
      const row = stmt.getAsObject();
      try { row.items = JSON.parse(row.items); } catch {}
      rows.push(row);
    }
    stmt.free();

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
