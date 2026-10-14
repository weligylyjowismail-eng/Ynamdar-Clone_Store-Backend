const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, 'database.sqlite');

let db = null;

async function getDb() {
  if (db) return db;

  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
    // Veritabanı önceden var olsa bile eksik tabloları oluştur
    createSchema();
    saveDb();
  } else {
    db = new SQL.Database();
    createSchema();
    seedData();
    saveDb();
  }

  return db;
}

function saveDb() {
  if (!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}

function run(sql, params = []) {
  db.run(sql, params);
  saveDb();
}

function all(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

function get(sql, params = []) {
  const rows = all(sql, params);
  return rows[0] || null;
}

function createSchema() {
  db.run(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      parent_id INTEGER,
      name_tm TEXT NOT NULL,
      name_ru TEXT NOT NULL,
      name_en TEXT NOT NULL,
      image TEXT,
      order_num INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (parent_id) REFERENCES categories(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS brands (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      image TEXT,
      market_category_id INTEGER REFERENCES market_categories(id),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  try {
    db.run(`ALTER TABLE brands ADD COLUMN market_category_id INTEGER REFERENCES market_categories(id)`);
  } catch (e) {
  }
  // VIP marka sütunu ekleme (Eğer veritabanı önceden varsa çökmeyi önler)
  try {
    db.run(`ALTER TABLE brands ADD COLUMN vip INTEGER DEFAULT 0`);
  } catch (e) {}

  // Yeni (Täze) marka sütunu ekleme
  try {
    db.run(`ALTER TABLE brands ADD COLUMN is_new INTEGER DEFAULT 0`);
  } catch (e) {}

  /* ==========================================================================
     MARKA REKLAM / BANNER TABLOSU (BRAND BANNERS)
     ========================================================================== */
  db.run(`
    CREATE TABLE IF NOT EXISTS brand_banners (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      brand_id INTEGER NOT NULL,
      image TEXT NOT NULL,
      link TEXT,
      title TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE CASCADE
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL,
      phone TEXT UNIQUE,
      email TEXT UNIQUE,
      password TEXT NOT NULL,
      gender TEXT,
      birth_date TEXT,
      cash_back REAL DEFAULT 0,
      address TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS banners (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      image TEXT,
      link TEXT,
      active INTEGER DEFAULT 1,
      body TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name_tm TEXT NOT NULL,
      name_ru TEXT NOT NULL,
      name_en TEXT NOT NULL,
      kode TEXT UNIQUE NOT NULL,
      price REAL NOT NULL,
      discount REAL DEFAULT 0,
      is_new INTEGER DEFAULT 0,
      body_tm TEXT,
      body_ru TEXT,
      body_en TEXT,
      minibody_tm TEXT,
      minibody_ru TEXT,
      minibody_en TEXT,
      brand_id INTEGER,
      brand_name TEXT DEFAULT NULL,
      category_id INTEGER,
      quantity INTEGER DEFAULT 0,
      vip INTEGER DEFAULT 0,
      image_small TEXT,
      image_medium TEXT,
      image_big TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (brand_id) REFERENCES brands(id),
      FOREIGN KEY (category_id) REFERENCES categories(id)
    )
  `);
  try {
    db.run(`ALTER TABLE products ADD COLUMN brand_name TEXT DEFAULT NULL`);
  } catch (e) {
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      address_id INTEGER,
      status TEXT DEFAULT 'pending',
      total REAL NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS market_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title_tm TEXT NOT NULL,
      title_ru TEXT NOT NULL,
      image TEXT,
      order_number INTEGER DEFAULT 0
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL,
      price REAL NOT NULL,
      FOREIGN KEY (order_id) REFERENCES orders(id),
      FOREIGN KEY (product_id) REFERENCES products(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS addresses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      username TEXT NOT NULL,
      phone TEXT NOT NULL,
      body TEXT NOT NULL,
      active INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS stories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      image TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

async function seedData() {
  const categories = [
    [null, 'Elektronika', 'Электроника', 'Electronics', 'electronics.jpg', 1],
    [null, 'Egin-eşik', 'Одежда', 'Clothing', 'clothing.jpg', 2],
    [null, 'Öý enjamlary', 'Бытовая техника', 'Home Appliances', 'appliances.jpg', 3],
    [1, 'Telefonlar', 'Телефоны', 'Phones', 'phones.jpg', 1],
    [1, 'Noutbuklar', 'Ноутбуки', 'Laptops', 'laptops.jpg', 2],
    [2, 'Erkek eşikleri', 'Мужская одежда', 'Men Clothing', 'men.jpg', 1],
    [2, 'Aýal eşikleri', 'Женская одежда', 'Women Clothing', 'women.jpg', 2],
    [3, 'Sowadyjylar', 'Холодильники', 'Refrigerators', 'fridges.jpg', 1],
    [3, 'Ýuwujy maşynlar', 'Стиральные машины', 'Washing Machines', 'washers.jpg', 2],
    [4, 'Smartfonlar', 'Смартфоны', 'Smartphones', 'smartphones.jpg', 1],
  ];

  for (const c of categories) {
    db.run(
      `INSERT INTO categories (parent_id, name_tm, name_ru, name_en, image, order_num) VALUES (?, ?, ?, ?, ?, ?)`,
      c
    );
  }

  const brands = [
    ['Samsung', 'samsung.jpg'],
    ['Apple', 'apple.jpg'],
    ['Nike', 'nike.jpg'],
    ['Adidas', 'adidas.jpg'],
    ['LG', 'lg.jpg'],
    ['Sony', 'sony.jpg'],
    ['Xiaomi', 'xiaomi.jpg'],
    ['Bosch', 'bosch.jpg'],
    ['Huawei', 'huawei.jpg'],
    ['Reebok', 'reebok.jpg'],
  ];

  for (const b of brands) {
    db.run(`INSERT INTO brands (name, image, market_category_id, vip, is_new) VALUES (?, ?, ?, ?, ?)`, b);
  }

  const hash = bcrypt.hashSync('password123', 10);
  const users = [
    ['Oraz Durdyýew', '+99361100001', 'oraz@mail.com', hash],
    ['Aýna Meredowa', '+99361100002', 'ayna@mail.com', hash],
    ['Merdan Atamyradow', '+99361100003', 'merdan@mail.com', hash],
    ['Gülälek Hojamyradowa', '+99361100004', 'gulalek@mail.com', hash],
    ['Döwlet Nurlyýew', '+99361100005', 'dowlet@mail.com', hash],
    ['Maral Altyýewa', '+99361100006', 'maral@mail.com', hash],
    ['Serdar Sähedow', '+99361100007', 'serdar@mail.com', hash],
    ['Ogulgerek Annamuradowa', '+99361100008', 'ogul@mail.com', hash],
    ['Bagtygül Myradowa', '+99361100009', 'bagty@mail.com', hash],
    ['Röwşen Jumaýew', '+99361100010', 'rowsen@mail.com', hash],
  ];

  for (const u of users) {
    db.run(`INSERT INTO users (username, phone, email, password) VALUES (?, ?, ?, ?)`, u);
  }

  const banners = [
    ['Summer Sale', 'banner1.jpg', '/sale', 1, 'Big discounts on all products'],
    ['New Arrivals', 'banner2.jpg', '/new', 1, 'Check out the latest items'],
    ['Electronics Week', 'banner3.jpg', '/electronics', 1, 'Best deals on gadgets'],
    ['Fashion Season', 'banner4.jpg', '/clothing', 1, 'New fashion collection'],
    ['Home Deals', 'banner5.jpg', '/home', 0, 'Upgrade your home'],
    ['Brand Festival', 'banner6.jpg', '/brands', 1, 'Top brands on discount'],
    ['Flash Sale', 'banner7.jpg', '/flash', 1, '24h flash sale event'],
    ['VIP Members', 'banner8.jpg', '/vip', 0, 'Exclusive offers for VIP'],
    ['Free Shipping', 'banner9.jpg', '/shipping', 1, 'Free shipping this week'],
    ['Clearance', 'banner10.jpg', '/clearance', 1, 'Last chance items'],
  ];

  for (const b of banners) {
    db.run(`INSERT INTO banners (name, image, link, active, body) VALUES (?, ?, ?, ?, ?)`, b);
  }

  const products = [
    ['Samsung Galaxy S24', 'Samsung Galaxy S24 (Rus)', 'Samsung Galaxy S24 (Eng)', 'PRD001', 1299.99, 10, 1, 'Ajaýyp smartfon', 'Отличный смартфон', 'Amazing smartphone', 'Güýçli', 'Мощный', 'Powerful', 1, 10, 50, 1, 's24_s.jpg', 's24_m.jpg', 's24_b.jpg'],
    ['Apple iPhone 15', 'Apple iPhone 15 (Rus)', 'Apple iPhone 15', 'PRD002', 1499.99, 5, 1, 'Iň gowy telefon', 'Лучший телефон', 'Best phone', 'Täze model', 'Новая модель', 'New model', 2, 10, 30, 1, 'iphone_s.jpg', 'iphone_m.jpg', 'iphone_b.jpg'],
    ['Nike Air Max', 'Nike Air Max (Rus)', 'Nike Air Max', 'PRD003', 199.99, 15, 0, 'Rahat aýakgap', 'Удобная обувь', 'Comfortable shoes', 'Sport', 'Спорт', 'Sport', 3, 6, 100, 0, 'airmax_s.jpg', 'airmax_m.jpg', 'airmax_b.jpg'],
    ['LG Refrigerator', 'Холодильник LG', 'LG Refrigerator', 'PRD004', 899.99, 20, 0, 'Uly sowadyjy', 'Большой холодильник', 'Large refrigerator', 'Energiýa tygşytly', 'Энергоэффективный', 'Energy efficient', 5, 8, 20, 0, 'lg_fridge_s.jpg', 'lg_fridge_m.jpg', 'lg_fridge_b.jpg'],
    ['Sony WH-1000XM5', 'Sony WH-1000XM5 (Rus)', 'Sony WH-1000XM5', 'PRD005', 349.99, 0, 1, 'Ses geçirmeýän gulaklyk', 'Наушники с шумоподавлением', 'Noise cancelling headphones', 'Premium ses', 'Премиум звук', 'Premium sound', 6, 5, 45, 0, 'sony_s.jpg', 'sony_m.jpg', 'sony_b.jpg'],
    ['Xiaomi Redmi Note 13', 'Xiaomi Redmi Note 13 (Rus)', 'Xiaomi Redmi Note 13', 'PRD006', 299.99, 0, 1, 'Arzan we güýçli', 'Доступный и мощный', 'Affordable and powerful', 'Köp funksiýaly', 'Многофункциональный', 'Multifunctional', 7, 10, 80, 0, 'xiaomi_s.jpg', 'xiaomi_m.jpg', 'xiaomi_b.jpg'],
    ['Adidas Ultraboost', 'Adidas Ultraboost (Rus)', 'Adidas Ultraboost', 'PRD007', 179.99, 10, 0, 'Ylgamak üçin', 'Для бега', 'For running', 'Ýeňil', 'Лёгкий', 'Lightweight', 4, 6, 60, 0, 'adidas_s.jpg', 'adidas_m.jpg', 'adidas_b.jpg'],
    ['Bosch Washing Machine', 'Стиральная машина Bosch', 'Bosch Washing Machine', 'PRD008', 699.99, 5, 0, 'Awtomatik ýuwujy', 'Автоматическая стирка', 'Automatic washing', 'Köp programmaly', 'Многопрограммный', 'Multi-program', 8, 9, 15, 0, 'bosch_s.jpg', 'bosch_m.jpg', 'bosch_b.jpg'],
    ['Huawei MatePad Pro', 'Huawei MatePad Pro (Rus)', 'Huawei MatePad Pro', 'PRD009', 599.99, 8, 1, 'Güýçli planşet', 'Мощный планшет', 'Powerful tablet', 'Işewürlik', 'Бизнес', 'Business', 9, 5, 25, 1, 'huawei_s.jpg', 'huawei_m.jpg', 'huawei_b.jpg'],
    ['Samsung QLED TV 55"', 'Samsung QLED TV 55" (Rus)', 'Samsung QLED TV 55"', 'PRD010', 1099.99, 12, 0, '4K telewizor', '4K телевизор', '4K television', 'Ajaýyp surat', 'Отличная картинка', 'Excellent picture', 1, 3, 10, 1, 'tv_s.jpg', 'tv_m.jpg', 'tv_b.jpg'],
  ];

  for (const p of products) {
    db.run(
      `INSERT INTO products (name_tm, name_ru, name_en, kode, price, discount, is_new, body_tm, body_ru, body_en, minibody_tm, minibody_ru, minibody_en, brand_id, brand_name, category_id, quantity, vip, image_small, image_medium, image_big)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      p
    );
  }

  const addresses = [
    [1, 'Home', 'Oraz Durdyýew', '+99361100001', 'Aşgabat, Köçe 1, Jaý 2'],
    [2, 'Work', 'Aýna Meredowa', '+99361100002', 'Aşgabat, Köçe 3, Jaý 4'],
    [3, 'Home', 'Merdan Atamyradow', '+99361100003', 'Mary, Köçe 5, Jaý 6'],
    [4, 'Home', 'Gülälek Hojamyradowa', '+99361100004', 'Balkanabat, Köçe 7, Jaý 8'],
    [5, 'Work', 'Döwlet Nurlyýew', '+99361100005', 'Türkmenabat, Köçe 9, Jaý 10'],
    [6, 'Home', 'Maral Altyýewa', '+99361100006', 'Daşoguz, Köçe 11, Jaý 12'],
    [7, 'Home', 'Serdar Sähedow', '+99361100007', 'Aşgabat, Köçe 13, Jaý 14'],
    [8, 'Home', 'Ogulgerek Annamuradowa', '+99361100008', 'Aşgabat, Köçe 15, Jaý 16'],
    [9, 'Work', 'Bagtygül Myradowa', '+99361100009', 'Mary, Köçe 17, Jaý 18'],
    [10, 'Home', 'Röwşen Jumaýew', '+99361100010', 'Aşgabat, Köçe 19, Jaý 20'],
  ];

  for (const a of addresses) {
    db.run(`INSERT INTO addresses (user_id, name, username, phone, body) VALUES (?, ?, ?, ?, ?)`, a);
  }

  for (let i = 1; i <= 10; i++) {
    db.run(
      `INSERT INTO orders (user_id, address_id, status, total) VALUES (?, ?, ?, ?)`,
      [i, i, 'delivered', (Math.random() * 1000 + 100).toFixed(2)]
    );
    db.run(
      `INSERT INTO order_items (order_id, product_id, quantity, price) VALUES (?, ?, ?, ?)`,
      [i, i, Math.ceil(Math.random() * 3), (Math.random() * 500 + 50).toFixed(2)]
    );
  }
}

module.exports = {
  getDb,
  saveDb,
  run: (...a) => { run(...a); },
  all: (...a) => all(...a),
  get: (...a) => get(...a)
};