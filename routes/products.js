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
// image_small, image_medium, image_big = aynı fotoğrafın 3 boyutu
// images = ürün galerisi için ek fotoğraflar (en fazla MAX_GALLERY tane)
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });
const MAX_GALLERY = 4;

const productUploads = upload.fields([
  { name: 'image_small', maxCount: 1 },
  { name: 'image_medium', maxCount: 1 },
  { name: 'image_big', maxCount: 1 },
  { name: 'images', maxCount: MAX_GALLERY },
]);

// product_images tablosunu ilk kullanımda oluşturur
let imagesTableReady = false;
async function getDbReady() {
  const db = await getDb();
  if (!imagesTableReady) {
    db.run(`CREATE TABLE IF NOT EXISTS product_images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      image TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0
    )`);
    saveDb();
    imagesTableReady = true;
  }
  return db;
}

function getProductImages(db, productId) {
  const stmt = db.prepare(
    `SELECT id, image FROM product_images WHERE product_id = ? ORDER BY sort_order ASC, id ASC`
  );
  stmt.bind([productId]);
  const list = [];
  while (stmt.step()) list.push(stmt.getAsObject());
  stmt.free();
  return list;
}

function addProductImages(db, productId, fileList) {
  (fileList || []).slice(0, MAX_GALLERY).forEach((file, index) => {
    db.run(
      `INSERT INTO product_images (product_id, image, sort_order) VALUES (?, ?, ?)`,
      [productId, `/uploads/${file.filename}`, index]
    );
  });
}

function withImages(db, product) {
  if (!product) return product;
  return { ...product, images: getProductImages(db, product.id) };
}

function getProducts(db, where = '1=1', params = [], limit = 20, offset = 0, order = 'p.id ASC') {
  const sql = `
    SELECT p.*, b.name as brand_name, b.image as brand_image,
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

// Category + sub-categorylaryn ID-lerini recursive tapyar
function getAllSubCategoryIds(db, categoryId) {
  const ids = [];
  const stack = [categoryId];
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
 * /products:
 *   get:
 *     summary: Get all products with pagination and filtering
 *     tags: [Products]
 *     parameters:
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
 *         name: is_new
 *         schema: { type: integer, enum: [0, 1] }
 *       - in: query
 *         name: brand_id
 *         schema: { type: integer }
 *       - in: query
 *         name: has_discount
 *         schema: { type: integer, enum: [0, 1] }
 *       - in: query
 *         name: sort
 *         schema: { type: string, enum: [newest, oldest, price_asc, price_desc] }
 *     responses:
 *       200:
 *         description: List of products
 */
router.get('/', async (req, res) => {
  try {
    const db = await getDb();
    const limit = parseInt(req.query.limit) || 20;
    const offset = parseInt(req.query.offset) || 0;

    let order = 'p.id ASC';
    if (req.query.sort === 'newest') order = 'p.created_at DESC';
    else if (req.query.sort === 'oldest') order = 'p.created_at ASC';
    else if (req.query.sort === 'price_asc' || req.query.price === 'asc') order = 'p.price ASC';
    else if (req.query.sort === 'price_desc' || req.query.price === 'desc') order = 'p.price DESC';

    let where = '1=1';
    let params = [];
    if (req.query.brand_id) {
      where += ' AND p.brand_id = ?';
      params.push(req.query.brand_id);
    }
    if (req.query.category_id) {
      where += ' AND p.category_id = ?';
      params.push(req.query.category_id);
    }
    if (req.query.is_new !== undefined) {
      where += ' AND p.is_new = ?';
      params.push(parseInt(req.query.is_new));
    }
    if (req.query.has_discount !== undefined && (req.query.has_discount === '1' || req.query.has_discount === 'true')) {
      where += ' AND p.discount > 0';
    }

    const rows = getProducts(db, where, params, limit, offset, order);

    const countStmt = db.prepare(`SELECT COUNT(*) as count FROM products p WHERE ${where}`);
    countStmt.bind(params);
    countStmt.step();
    const total = countStmt.getAsObject().count;
    countStmt.free();

    res.json({ data: rows, total, limit, offset });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /products/discount:
 *   get:
 *     summary: Get products with discount
 *     tags: [Products]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *       - in: query
 *         name: offset
 *         schema: { type: integer, default: 0 }
 *     responses:
 *       200:
 *         description: List of discounted products
 */
router.get('/discount', async (req, res) => {
  try {
    const db = await getDb();
    const limit = parseInt(req.query.limit) || 20;
    const offset = parseInt(req.query.offset) || 0;

    const where = 'p.discount > 0';
    const rows = getProducts(db, where, [], limit, offset, 'p.id ASC');

    const countStmt = db.prepare(`SELECT COUNT(*) as count FROM products p WHERE ${where}`);
    countStmt.step();
    const total = countStmt.getAsObject().count;
    countStmt.free();

    res.json({ data: rows, total, limit, offset });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /products/vip:
 *   get:
 *     summary: Get VIP products
 *     tags: [Products]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *       - in: query
 *         name: offset
 *         schema: { type: integer, default: 0 }
 *     responses:
 *       200:
 *         description: List of VIP products
 */
router.get('/vip', async (req, res) => {
  try {
    const db = await getDb();
    const limit = parseInt(req.query.limit) || 20;
    const offset = parseInt(req.query.offset) || 0;

    const where = 'p.vip = 1';
    const rows = getProducts(db, where, [], limit, offset, 'p.id ASC');

    const countStmt = db.prepare(`SELECT COUNT(*) as count FROM products p WHERE ${where}`);
    countStmt.step();
    const total = countStmt.getAsObject().count;
    countStmt.free();

    res.json({ data: rows, total, limit, offset });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /products/new:
 *   get:
 *     summary: Get latest products
 *     tags: [Products]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10 }
 *     responses:
 *       200:
 *         description: List of new products
 */
router.get('/new', async (req, res) => {
  try {
    const db = await getDb();
    const limit = parseInt(req.query.limit) || 10;
    const rows = getProducts(db, 'p.is_new = 1', [], limit, 0, 'p.created_at DESC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /products/by-category/{categoryId}:
 *   get:
 *     summary: Get products by category including all subcategory products
 *     tags: [Products]
 *     parameters:
 *       - in: path
 *         name: categoryId
 *         required: true
 *         schema: { type: integer }
 *         description: Category ID (returns products from this category AND all its subcategories)
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *       - in: query
 *         name: offset
 *         schema: { type: integer, default: 0 }
 *       - in: query
 *         name: sort
 *         schema: { type: string, enum: [newest, oldest, price_asc, price_desc] }
 *       - in: query
 *         name: brand_id
 *         schema: { type: integer }
 *       - in: query
 *         name: has_discount
 *         schema: { type: integer, enum: [0, 1] }
 *     responses:
 *       200:
 *         description: Products with category and subcategory info
 */
router.get('/by-category/:categoryId', async (req, res) => {
  try {
    const db = await getDb();
    const { categoryId } = req.params;
    const limit = parseInt(req.query.limit) || 20;
    const offset = parseInt(req.query.offset) || 0;

    // Category barmy?
    const catStmt = db.prepare(`SELECT * FROM categories WHERE id = ?`);
    catStmt.bind([categoryId]);
    const category = catStmt.step() ? catStmt.getAsObject() : null;
    catStmt.free();

    if (!category) return res.status(404).json({ error: 'Category not found' });

    // Sub-categorylar
    const subStmt = db.prepare(`SELECT * FROM categories WHERE parent_id = ? ORDER BY order_num ASC, id ASC`);
    subStmt.bind([categoryId]);
    const subCategories = [];
    while (subStmt.step()) subCategories.push(subStmt.getAsObject());
    subStmt.free();

    // Bu category + hemme sub-categorylaryn ID-leri (recursive)
    const allIds = getAllSubCategoryIds(db, parseInt(categoryId));
    const placeholders = allIds.map(() => '?').join(',');

    // Sort (indirimli fiyata göre)
    const discounted = '(p.price - p.price * p.discount / 100)';
    let order = 'p.id ASC';
    if (req.query.sort === 'newest') order = 'p.created_at DESC';
    else if (req.query.sort === 'oldest') order = 'p.created_at ASC';
    else if (req.query.sort === 'price_asc') order = `${discounted} ASC`;
    else if (req.query.sort === 'price_desc') order = `${discounted} DESC`;

    // Goşmaça filtrlar
    let extraWhere = '';
    let extraParams = [];
    if (req.query.brand_id) {
      extraWhere += ' AND p.brand_id = ?';
      extraParams.push(req.query.brand_id);
    }
    if (req.query.has_discount === '1' || req.query.has_discount === 'true') {
      extraWhere += ' AND p.discount > 0';
    }
        // Birden fazla marka: ?brand_ids=1,2,3
    if (req.query.brand_ids) {
      const ids = String(req.query.brand_ids)
        .split(',')
        .map((n) => parseInt(n, 10))
        .filter((n) => !isNaN(n));
      if (ids.length > 0) {
        extraWhere += ` AND p.brand_id IN (${ids.map(() => '?').join(',')})`;
        extraParams.push(...ids);
      }
    }
    // Fiyat aralığı: ?min_price=100&max_price=200
    if (req.query.min_price) {
      extraWhere += ` AND ${discounted} >= ?`;
      extraParams.push(parseFloat(req.query.min_price));
    }
    if (req.query.max_price) {
      extraWhere += ` AND ${discounted} <= ?`;
      extraParams.push(parseFloat(req.query.max_price));
    }

    const where = `p.category_id IN (${placeholders})${extraWhere}`;
    const params = [...allIds, ...extraParams];

    const rows = getProducts(db, where, params, limit, offset, order);

    // Umumy san
    const countStmt = db.prepare(`SELECT COUNT(*) as count FROM products p WHERE ${where}`);
    countStmt.bind(params);
    countStmt.step();
    const total = countStmt.getAsObject().count;
    countStmt.free();

    res.json({
      category,
      subCategories,
      data: rows,
      total,
      limit,
      offset,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router.get('/by-category/:categoryId/brands', async (req, res) => {
  try {
    const db = await getDb();
    const allIds = getAllSubCategoryIds(db, parseInt(req.params.categoryId));
    const placeholders = allIds.map(() => '?').join(',');
    const stmt = db.prepare(
      `SELECT DISTINCT b.id, b.name, b.image
       FROM products p
       JOIN brands b ON p.brand_id = b.id
       WHERE p.category_id IN (${placeholders})
       ORDER BY b.name ASC`
    );
    stmt.bind(allIds);
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
 * /products/{id}:
 *   get:
 *     summary: Get a single product (includes the images gallery)
 *     tags: [Products]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Product object
 */
router.get('/:id', async (req, res) => {
  try {
    const db = await getDbReady();
    const rows = getProducts(db, 'p.id = ?', [req.params.id], 1, 0);
    if (!rows[0]) return res.status(404).json({ error: 'Product not found' });
    res.json(withImages(db, rows[0]));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /products:
 *   post:
 *     summary: Create a product
 *     tags: [Products]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [name_tm, name_ru, name_en, kode, price]
 *             properties:
 *               name_tm: { type: string }
 *               name_ru: { type: string }
 *               name_en: { type: string }
 *               kode: { type: string }
 *               price: { type: number }
 *               discount: { type: number }
 *               is_new: { type: boolean }
 *               body_tm: { type: string }
 *               body_ru: { type: string }
 *               body_en: { type: string }
 *               minibody_tm: { type: string }
 *               minibody_ru: { type: string }
 *               minibody_en: { type: string }
 *               brand_id: { type: integer }
 *               product_brand: { type: string, description: "Brand name typed manually, shown in the Brend row under the product code" }
 *               category_id: { type: integer }
 *               quantity: { type: integer }
 *               vip: { type: boolean }
 *               image_small: { type: string, format: binary }
 *               image_medium: { type: string, format: binary }
 *               image_big: { type: string, format: binary }
 *               images:
 *                 type: array
 *                 description: Extra gallery photos (max 4)
 *                 items: { type: string, format: binary }
 *     responses:
 *       201:
 *         description: Created
 */
router.post('/', productUploads, async (req, res) => {
  try {
    const db = await getDbReady();
    const {
      name_tm, name_ru, name_en, kode, price, discount, is_new,
      body_tm, body_ru, body_en, minibody_tm, minibody_ru, minibody_en,
      brand_id, product_brand, category_id, quantity, vip,
    } = req.body;

    if (!name_tm || !name_ru || !name_en || !kode || !price) {
      return res.status(400).json({ error: 'name_tm, name_ru, name_en, kode, price are required' });
    }

    const files = req.files || {};
    const image_small  = files.image_small  ? `/uploads/${files.image_small[0].filename}`  : null;
    const image_medium = files.image_medium ? `/uploads/${files.image_medium[0].filename}` : null;
    const image_big    = files.image_big    ? `/uploads/${files.image_big[0].filename}`    : null;

    db.run(
      `INSERT INTO products (name_tm, name_ru, name_en, kode, price, discount, is_new,
        body_tm, body_ru, body_en, minibody_tm, minibody_ru, minibody_en,
        brand_id, category_id, quantity, vip, image_small, image_medium, image_big, product_brand)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        name_tm, name_ru, name_en, kode, price, discount || 0,
        is_new === 'true' || is_new === true ? 1 : 0,
        body_tm || null, body_ru || null, body_en || null,
        minibody_tm || null, minibody_ru || null, minibody_en || null,
        brand_id || null, category_id || null, quantity || 0,
        vip === 'true' || vip === true ? 1 : 0,
        image_small, image_medium, image_big,
        product_brand || null,
      ]
    );

    const stmt = db.prepare(`SELECT last_insert_rowid() as id`);
    stmt.step();
    const { id } = stmt.getAsObject();
    stmt.free();

    // Galeri fotoğrafları
    addProductImages(db, id, files.images);
    saveDb();

    const rows = getProducts(db, 'p.id = ?', [id], 1, 0);
    res.status(201).json(withImages(db, rows[0]));
  } catch (err) {
    if (err.message.includes('UNIQUE')) return res.status(409).json({ error: 'Product code already exists' });
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /products/{id}:
 *   put:
 *     summary: Update a product (sending "images" replaces the whole gallery)
 *     tags: [Products]
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
 *               name_tm: { type: string }
 *               name_ru: { type: string }
 *               name_en: { type: string }
 *               price: { type: number }
 *               brand_id: { type: integer }
 *               product_brand: { type: string }
 *               image_small: { type: string, format: binary }
 *               image_medium: { type: string, format: binary }
 *               image_big: { type: string, format: binary }
 *               images:
 *                 type: array
 *                 description: Extra gallery photos (max 4). Replaces the existing gallery.
 *                 items: { type: string, format: binary }
 *     responses:
 *       200:
 *         description: Updated
 */
router.put('/:id', productUploads, async (req, res) => {
  try {
    const db = await getDbReady();
    const stmt = db.prepare(`SELECT * FROM products WHERE id = ?`);
    stmt.bind([req.params.id]);
    const existing = stmt.step() ? stmt.getAsObject() : null;
    stmt.free();
    if (!existing) return res.status(404).json({ error: 'Product not found' });

    const files = req.files || {};
    const textFields = [
      'name_tm', 'name_ru', 'name_en', 'kode', 'price', 'discount', 'is_new',
      'body_tm', 'body_ru', 'body_en', 'minibody_tm', 'minibody_ru', 'minibody_en',
      'brand_id', 'product_brand', 'category_id', 'quantity', 'vip',
    ];

    const values = textFields.map(f => req.body[f] !== undefined ? req.body[f] : existing[f]);
    const image_small  = files.image_small  ? `/uploads/${files.image_small[0].filename}`  : existing.image_small;
    const image_medium = files.image_medium ? `/uploads/${files.image_medium[0].filename}` : existing.image_medium;
    const image_big    = files.image_big    ? `/uploads/${files.image_big[0].filename}`    : existing.image_big;

    const setClause = [...textFields, 'image_small', 'image_medium', 'image_big'].map(f => `${f}=?`).join(', ');
    db.run(`UPDATE products SET ${setClause} WHERE id=?`, [...values, image_small, image_medium, image_big, req.params.id]);

    // Yeni galeri fotoğrafları geldiyse eski galeriyi değiştir
    if (files.images && files.images.length > 0) {
      db.run(`DELETE FROM product_images WHERE product_id = ?`, [req.params.id]);
      addProductImages(db, req.params.id, files.images);
    }
    saveDb();

    const rows = getProducts(db, 'p.id = ?', [req.params.id], 1, 0);
    res.json(withImages(db, rows[0]));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /products/{id}/images/{imageId}:
 *   delete:
 *     summary: Delete one gallery photo of a product
 *     tags: [Products]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *       - in: path
 *         name: imageId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Deleted
 */
router.delete('/:id/images/:imageId', async (req, res) => {
  try {
    const db = await getDbReady();
    db.run(`DELETE FROM product_images WHERE id = ? AND product_id = ?`, [
      req.params.imageId,
      req.params.id,
    ]);
    saveDb();
    res.json({ message: 'Image deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /products/{id}:
 *   delete:
 *     summary: Delete a product
 *     tags: [Products]
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
    const db = await getDbReady();
    db.run(`DELETE FROM product_images WHERE product_id = ?`, [req.params.id]);
    db.run(`DELETE FROM products WHERE id = ?`, [req.params.id]);
    saveDb();
    res.json({ message: 'Product deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /products/clone/{id}:
 *   post:
 *     summary: Bir ürünü ID kullanarak başka bir kategoriye otomatik kopyalar (Nedim'in Clone Sistemi)
 *     tags: [Products]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *         description: Kopyalanacak eski ürünün ID'si
 *       - in: query
 *         name: target_category_id
 *         required: true
 *         schema: { type: integer }
 *         description: Ürünün kopyalanacağı yeni kategorinin ID'si (Örn Elektronika için 1, Giyim için 2)
 *     responses:
 *       201:
 *         description: Ürün başarıyla kopyalandı!
 */
router.post('/clone/:id', async (req, res) => {
  try {
    const db = await getDbReady();
    const targetCategoryId = parseInt(req.query.target_category_id);

    if (!targetCategoryId) {
      return res.status(400).json({ error: 'target_category_id parametresi zorunludur!' });
    }

    const stmtFind = db.prepare(`SELECT * FROM products WHERE id = ?`);
    stmtFind.bind([req.params.id]);
    const existing = stmtFind.step() ? stmtFind.getAsObject() : null;
    stmtFind.free();

    if (!existing) {
      return res.status(404).json({ error: 'Kopyalanacak ürün bulunamadı!' });
    }

    const newKode = `${existing.kode}_${Math.round(Math.random() * 1000)}`;

    db.run(
      `INSERT INTO products (name_tm, name_ru, name_en, kode, price, discount, is_new,
        body_tm, body_ru, body_en, minibody_tm, minibody_ru, minibody_en,
        brand_id, category_id, quantity, vip, image_small, image_medium, image_big, product_brand)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        existing.name_tm, existing.name_ru, existing.name_en, newKode, existing.price, existing.discount,
        existing.is_new, existing.body_tm, existing.body_ru, existing.body_en,
        existing.minibody_tm, existing.minibody_ru, existing.minibody_en,
        existing.brand_id, targetCategoryId, existing.quantity, existing.vip,
        existing.image_small, existing.image_medium, existing.image_big,
        existing.product_brand
      ]
    );

    const stmtId = db.prepare(`SELECT last_insert_rowid() as id`);
    stmtId.step();
    const { id } = stmtId.getAsObject();
    stmtId.free();

    // Galeri fotoğraflarını da kopyala
    getProductImages(db, existing.id).forEach((img, index) => {
      db.run(
        `INSERT INTO product_images (product_id, image, sort_order) VALUES (?, ?, ?)`,
        [id, img.image, index]
      );
    });
    saveDb();

    const rows = getProducts(db, 'p.id = ?', [id], 1, 0);
    res.status(201).json({ message: "Ürün başarıyla kopyalandı!", product: withImages(db, rows[0]) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;