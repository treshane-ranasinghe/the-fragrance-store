/* ==========================================================================
   The Fragrance Store — server (Node.js, no dependencies)

   Serves the website and a small JSON API so every visitor shares one
   catalogue, the admin has a real login, and orders are stored centrally.

     npm start                 start the store on http://localhost:3000
     npm run create-admin      add or update an admin login

   Data lives in ./data (products.json, orders.json, admins.json) and uploaded
   images in ./images/uploads. Both must be on persistent disk when hosted.
   ========================================================================== */
"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const vm = require("vm");
const readline = require("readline");

const ROOT = __dirname;
const DATA = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, "data");
const UPLOADS = path.join(ROOT, "images", "uploads");
const PORT = Number(process.env.PORT) || 3000;
const SESSION_HOURS = 12;
const MAX_BODY = 8 * 1024 * 1024; // JSON bodies (product + image)
const MAX_IMAGE = 5 * 1024 * 1024;

const FILES = {
  products: path.join(DATA, "products.json"),
  orders: path.join(DATA, "orders.json"),
  admins: path.join(DATA, "admins.json"),
  customers: path.join(DATA, "customers.json"),
  customerSessions: path.join(DATA, "customer-sessions.json"),
};

/* ---------- Storage (JSON files, atomic writes) ---------- */
function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch (e) { return fallback; }
}
function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
  fs.renameSync(tmp, file);
}

// js/settings.js and js/products.js are browser scripts; run them in a sandbox to read their data
function loadBrowserScript(rel) {
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, rel), "utf8"), sandbox, { filename: rel });
  return sandbox.window;
}
function settings() { return loadBrowserScript("js/settings.js").STORE || {}; }

function products() {
  let list = readJson(FILES.products, null);
  if (!Array.isArray(list)) {
    // First run: seed the database from the catalogue file
    list = loadBrowserScript("js/products.js").PRODUCTS || [];
    writeJson(FILES.products, list);
  }
  return list;
}

/* ---------- Admin accounts ---------- */
function hashPassword(password, salt) {
  salt = salt || crypto.randomBytes(16).toString("hex");
  return { salt, hash: crypto.scryptSync(password, salt, 64).toString("hex") };
}
function saveAdmin(email, password) {
  const admins = readJson(FILES.admins, []).filter((a) => a.email !== email);
  admins.push(Object.assign({ email }, hashPassword(password)));
  writeJson(FILES.admins, admins);
}
function checkAdmin(email, password) {
  const admin = readJson(FILES.admins, []).find((a) => a.email === email);
  // Hash even when the email is unknown so timing doesn't reveal which emails exist
  const { hash } = hashPassword(password, admin ? admin.salt : "0".repeat(32));
  if (!admin) return false;
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(admin.hash, "hex"));
}

/* ---------- Sessions (in memory; a restart signs admins out) ---------- */
const sessions = new Map();
function newSession(email) {
  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, { email, expires: Date.now() + SESSION_HOURS * 3600e3 });
  return token;
}
function getSession(req) {
  const m = /(?:^|;\s*)tfs_admin=([a-f0-9]{64})/.exec(req.headers.cookie || "");
  const s = m && sessions.get(m[1]);
  if (!s) return null;
  if (s.expires < Date.now()) { sessions.delete(m[1]); return null; }
  return Object.assign({ token: m[1] }, s);
}
function cookie(req, name, token, maxAge) {
  const secure = req.headers["x-forwarded-proto"] === "https" || req.socket.encrypted ? "; Secure" : "";
  return name + "=" + token + "; HttpOnly; SameSite=Strict; Path=/; Max-Age=" + maxAge + secure;
}
function sessionCookie(req, token, maxAge) { return cookie(req, "tfs_admin", token, maxAge); }

// Slow down password guessing: 5 failures per IP per 15 minutes
const failures = new Map();
function clientIp(req) {
  return (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket.remoteAddress;
}
function isLockedOut(key) {
  const f = failures.get(key);
  return f && f.count >= 5 && f.until > Date.now();
}
function noteFailure(key) {
  const f = failures.get(key);
  if (!f || f.until < Date.now()) failures.set(key, { count: 1, until: Date.now() + 15 * 60e3 });
  else f.count++;
}

/* ---------- Customer accounts (optional) ----------
   Guests can always check out. After ordering, the confirmation page can turn
   the order into an account: the server hands a one-time claim token only to
   the browser that placed the order, valid for 30 minutes. Orders are linked
   to an account only through that claim or by ordering while signed in —
   never by matching phone numbers.                                          */
const CUSTOMER_DAYS = 30;
const CLAIM_MINUTES = 30;
const MIN_CUSTOMER_PASSWORD = 8;

function sha256(text) { return crypto.createHash("sha256").update(text).digest("hex"); }
function sameHex(a, b) {
  const x = Buffer.from(String(a), "hex"), y = Buffer.from(String(b), "hex");
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
}
function normalisePhone(raw) {
  const m = String(raw || "").replace(/[\s\-()]/g, "").match(/^(?:\+94|94|0)(\d{9})$/);
  return m ? "+94" + m[1] : null;
}
function customers() { return readJson(FILES.customers, []); }
function publicCustomer(c) {
  return { name: c.name, phone: c.phone, email: c.email || null, address: c.address || null, createdAt: c.createdAt };
}
function checkCustomerPassword(c, password) {
  const { hash } = hashPassword(String(password || ""), c ? c.salt : "0".repeat(32));
  return !!c && sameHex(hash, c.hash);
}

// Customer sessions are kept on disk (token hashed) so restarts don't sign shoppers out
function newCustomerSession(customerId) {
  const token = crypto.randomBytes(32).toString("hex");
  const now = Date.now();
  const all = readJson(FILES.customerSessions, {});
  Object.keys(all).forEach((k) => { if (all[k].expires < now) delete all[k]; });
  all[sha256(token)] = { customerId, expires: now + CUSTOMER_DAYS * 864e5 };
  writeJson(FILES.customerSessions, all);
  return token;
}
function customerToken(req) {
  const m = /(?:^|;\s*)tfs_customer=([a-f0-9]{64})/.exec(req.headers.cookie || "");
  return m && m[1];
}
function getCustomer(req) {
  const token = customerToken(req);
  if (!token) return null;
  const s = readJson(FILES.customerSessions, {})[sha256(token)];
  if (!s || s.expires < Date.now()) return null;
  return customers().find((c) => c.id === s.customerId) || null;
}
function endCustomerSession(req) {
  const token = customerToken(req);
  if (!token) return;
  const all = readJson(FILES.customerSessions, {});
  if (all[sha256(token)]) { delete all[sha256(token)]; writeJson(FILES.customerSessions, all); }
}
function customerCookie(req, token, maxAge) { return cookie(req, "tfs_customer", token, maxAge); }

function cleanAddress(a) {
  if (!a) return null;
  const out = {
    address1: str(a.address1, 200, false, "Address"),
    address2: str(a.address2, 200, false, "Address line 2") || null,
    city: str(a.city, 80, false, "City"),
    district: str(a.district, 40, false, "District"),
  };
  return out.address1 || out.city ? out : null;
}

// What customers (and the order-lookup link) may see of an order
function publicOrder(o) {
  const copy = Object.assign({}, o);
  delete copy.claim;
  delete copy.customerId;
  return copy;
}

/* ---------- Validation ---------- */
class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const TAGS = ["him", "her", "arabian"];
function str(v, max, required, label) {
  const s = typeof v === "string" ? v.trim() : "";
  if (required && !s) throw new HttpError(400, label + " is required.");
  if (s.length > max) throw new HttpError(400, label + " is too long.");
  return s;
}

function cleanProduct(body, existing) {
  const id = str(body.id, 60, true, "Product ID");
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) throw new HttpError(400, "Product ID may only use lowercase letters, numbers and dashes.");
  const sizes = Array.isArray(body.sizes) ? body.sizes : [];
  if (!sizes.length || sizes.length > 10) throw new HttpError(400, "Add between 1 and 10 sizes.");
  const cleanSizes = sizes.map((s) => {
    const ml = Number(s && s.ml);
    const price = s && s.price != null && s.price !== "" ? Number(s.price) : null;
    if (!Number.isInteger(ml) || ml <= 0 || ml > 5000) throw new HttpError(400, "Each size needs a whole number of ml.");
    if (price != null && (!Number.isFinite(price) || price < 0 || price > 10000000)) throw new HttpError(400, "Prices must be positive numbers.");
    return { ml, price };
  }).sort((a, b) => a.ml - b.ml);
  if (new Set(cleanSizes.map((s) => s.ml)).size !== cleanSizes.length) throw new HttpError(400, "Sizes must be different.");
  const notes = body.notes || {};
  return {
    id,
    house: str(body.house, 80, true, "Brand"),
    name: str(body.name, 120, true, "Name"),
    type: str(body.type, 60, true, "Concentration"),
    tags: (Array.isArray(body.tags) ? body.tags : []).filter((t) => TAGS.includes(t)),
    badge: str(body.badge, 18, false, "Badge") || null,
    description: str(body.description, 1200, true, "Description"),
    notes: { top: str(notes.top, 200, false, "Top notes"), heart: str(notes.heart, 200, false, "Heart notes"), base: str(notes.base, 200, false, "Base notes") },
    sizes: cleanSizes,
    inStock: body.inStock !== false,
    image: existing && existing.image ? existing.image : undefined,
  };
}

/* Uploaded images: data URL in, file in images/uploads out */
function saveImage(id, dataUrl) {
  const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl || "");
  if (!m) throw new HttpError(400, "Images must be JPEG, PNG or WebP.");
  const buf = Buffer.from(m[2], "base64");
  if (buf.length > MAX_IMAGE) throw new HttpError(413, "That image is too large (max 5 MB).");
  fs.mkdirSync(UPLOADS, { recursive: true });
  const name = id + "-" + Date.now().toString(36) + "." + (m[1] === "jpeg" ? "jpg" : m[1]);
  fs.writeFileSync(path.join(UPLOADS, name), buf);
  return "images/uploads/" + name;
}
function deleteImage(rel) {
  if (!rel || !rel.startsWith("images/uploads/")) return;
  fs.rm(path.join(ROOT, rel), { force: true }, () => {});
}

/* ---------- Orders ----------
   status:  pending → confirmed → dispatched → delivered   (or cancelled)
            pickup orders use "ready" instead of "dispatched"
   payment: { method, paid } — paid is set by the gateway (card) or the admin
   history: [{ at, status?, paid?, by }] audit trail of every change        */
const ORDER_STATUSES = ["pending", "confirmed", "dispatched", "ready", "delivered", "cancelled"];

function orderRef() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 6; i++) out += chars[crypto.randomInt(chars.length)];
  return "TFS-" + out;
}

function createOrder(body, account) {
  const store = settings();
  const catalogue = products();
  const c = body.customer || {};
  const d = body.delivery || {};
  const method = body.payment && body.payment.method;
  if (!["card", "cod", "bank"].includes(method)) throw new HttpError(400, "Choose a payment method.");
  if (!["delivery", "pickup"].includes(d.method)) throw new HttpError(400, "Choose delivery or collection.");
  if (d.method === "pickup" && !store.pickup) throw new HttpError(400, "Collection isn't available.");

  const phone = normalisePhone(c.phone);
  if (!phone) throw new HttpError(400, "Enter a valid Sri Lankan phone number.");
  const email = str(c.email, 160, false, "Email");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, "That email doesn't look right.");

  // Re-price every line from the catalogue — never trust prices sent by the browser
  const lines = (Array.isArray(body.items) ? body.items : []).map((it) => {
    const p = catalogue.find((x) => x.id === it.id);
    const size = p && p.sizes.find((s) => s.ml === Number(it.ml));
    const qty = Number(it.qty);
    if (!p || !size || size.price == null) throw new HttpError(409, "An item in your bag is no longer available. Please review your bag.");
    if (p.inStock === false) throw new HttpError(409, p.name + " has just sold out. Please review your bag.");
    if (!Number.isInteger(qty) || qty < 1 || qty > 10) throw new HttpError(400, "Invalid quantity.");
    return { id: p.id, name: p.house + " " + p.name, ml: size.ml, qty, price: size.price };
  });
  if (!lines.length) throw new HttpError(400, "Your bag is empty.");

  const subtotal = lines.reduce((n, l) => n + l.price * l.qty, 0);
  const pickup = d.method === "pickup";
  const free = store.freeDeliveryOver > 0 && subtotal >= store.freeDeliveryOver;
  const delivery = pickup || free ? 0 : store.deliveryFee || 0;
  const cod = method === "cod" && !pickup ? store.codFee || 0 : 0;
  const total = subtotal + delivery + cod;
  if (method === "cod" && store.codLimit > 0 && total > store.codLimit) throw new HttpError(400, "Cash on delivery isn't available for this amount.");

  const order = {
    ref: orderRef(),
    createdAt: new Date().toISOString(),
    status: "pending",
    customer: { name: str(c.name, 120, true, "Name"), phone, email: email || null },
    delivery: pickup ? { method: "pickup" } : {
      method: "delivery",
      address1: str(d.address1, 200, true, "Address"),
      address2: str(d.address2, 200, false, "Address line 2") || null,
      city: str(d.city, 80, true, "City"),
      district: str(d.district, 40, true, "District"),
    },
    notes: str(body.notes, 500, false, "Notes") || null,
    payment: { method, paid: false },
    items: lines,
    totals: { subtotal, delivery, cod, total },
    history: [{ at: new Date().toISOString(), status: "pending", by: "customer" }],
  };

  // Signed in: file the order under the account. Guest: offer a one-time account claim.
  let claimToken = null;
  if (account) {
    order.customerId = account.id;
  } else {
    claimToken = crypto.randomBytes(24).toString("hex");
    order.claim = { hash: sha256(claimToken), expires: Date.now() + CLAIM_MINUTES * 60e3 };
  }

  const orders = readJson(FILES.orders, []);
  orders.unshift(order);
  writeJson(FILES.orders, orders);

  return Object.assign(publicOrder(order), account
    ? { signedIn: true }
    : { claimToken, accountExists: customers().some((x) => x.phone === phone) });
}

/* ---------- HTTP helpers ---------- */
function send(res, status, body, headers) {
  const isJson = typeof body !== "string" && !Buffer.isBuffer(body);
  res.writeHead(status, Object.assign({
    "Content-Type": isJson ? "application/json; charset=utf-8" : "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
  }, headers));
  res.end(isJson ? JSON.stringify(body) : body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    if (!/^application\/json/.test(req.headers["content-type"] || "")) return reject(new HttpError(415, "Expected JSON."));
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(new HttpError(413, "Request too large.")); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}")); }
      catch (e) { reject(new HttpError(400, "Invalid JSON.")); }
    });
    req.on("error", reject);
  });
}

function requireAdmin(req) {
  const s = getSession(req);
  if (!s) throw new HttpError(401, "Please sign in again.");
  return s;
}

/* ---------- API ---------- */
async function api(req, res, url) {
  const route = req.method + " " + url.pathname;
  let m;

  if (route === "GET /api/products") return send(res, 200, products());

  if (route === "POST /api/orders") return send(res, 201, createOrder(await readBody(req), getCustomer(req)));

  if (req.method === "GET" && (m = /^\/api\/orders\/(TFS-[A-Z0-9]{6})$/.exec(url.pathname))) {
    const order = readJson(FILES.orders, []).find((o) => o.ref === m[1]);
    return order ? send(res, 200, publicOrder(order)) : send(res, 404, { error: "Order not found." });
  }

  /* ----- Customer accounts ----- */
  if (route === "GET /api/account") {
    const c = getCustomer(req);
    return send(res, 200, c ? publicCustomer(c) : null);
  }

  // Turn a just-placed guest order into an account
  if (route === "POST /api/account/claim") {
    const body = await readBody(req);
    const password = String(body.password || "");
    if (password.length < MIN_CUSTOMER_PASSWORD) throw new HttpError(400, "Choose a password of at least " + MIN_CUSTOMER_PASSWORD + " characters.");
    const orders = readJson(FILES.orders, []);
    const order = orders.find((o) => o.ref === body.ref);
    if (!order || !order.claim || order.claim.expires < Date.now() || !sameHex(sha256(String(body.token || "")), order.claim.hash)) {
      throw new HttpError(410, "This offer has expired. You can still create an account from your next order.");
    }
    const list = customers();
    if (list.some((x) => x.phone === order.customer.phone)) throw new HttpError(409, "There's already an account for " + order.customer.phone + ". Sign in to use it.");
    const email = order.customer.email && !list.some((x) => x.email === order.customer.email) ? order.customer.email : null;
    const customer = Object.assign({
      id: crypto.randomUUID(),
      name: order.customer.name,
      phone: order.customer.phone,
      email,
      address: order.delivery.method === "delivery" ? cleanAddress(order.delivery) : null,
      createdAt: new Date().toISOString(),
    }, hashPassword(password));
    list.push(customer);
    writeJson(FILES.customers, list);
    order.customerId = customer.id;
    delete order.claim;
    writeJson(FILES.orders, orders);
    const token = newCustomerSession(customer.id);
    return send(res, 201, publicCustomer(customer), { "Set-Cookie": customerCookie(req, token, CUSTOMER_DAYS * 86400) });
  }

  if (route === "POST /api/account/login") {
    const key = "customer:" + clientIp(req);
    if (isLockedOut(key)) throw new HttpError(429, "Too many attempts. Try again in 15 minutes.");
    const body = await readBody(req);
    const login = String(body.login || "").trim().toLowerCase();
    const phone = login.includes("@") ? null : normalisePhone(login);
    const c = customers().find((x) => (phone ? x.phone === phone : x.email && x.email === login));
    if (!checkCustomerPassword(c, body.password)) {
      noteFailure(key);
      throw new HttpError(401, "That phone number or email and password don't match.");
    }
    failures.delete(key);
    const token = newCustomerSession(c.id);
    return send(res, 200, publicCustomer(c), { "Set-Cookie": customerCookie(req, token, CUSTOMER_DAYS * 86400) });
  }

  if (route === "POST /api/account/logout") {
    endCustomerSession(req);
    return send(res, 200, { ok: true }, { "Set-Cookie": customerCookie(req, "", 0) });
  }

  if (url.pathname.startsWith("/api/account")) {
    const c = getCustomer(req);
    if (!c) throw new HttpError(401, "Please sign in again.");

    if (route === "GET /api/account/orders") {
      return send(res, 200, readJson(FILES.orders, []).filter((o) => o.customerId === c.id).map(publicOrder));
    }

    if (route === "PATCH /api/account") {
      const body = await readBody(req);
      const list = customers();
      const me = list.find((x) => x.id === c.id);
      if (body.name !== undefined) me.name = str(body.name, 120, true, "Name");
      if (body.email !== undefined) {
        const email = str(body.email, 160, false, "Email").toLowerCase();
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, "That email doesn't look right.");
        if (email && list.some((x) => x.id !== me.id && x.email === email)) throw new HttpError(409, "That email is already used by another account.");
        me.email = email || null;
      }
      if (body.address !== undefined) me.address = cleanAddress(body.address);
      if (body.newPassword !== undefined) {
        if (!checkCustomerPassword(me, body.currentPassword)) throw new HttpError(400, "Your current password isn't right.");
        if (String(body.newPassword).length < MIN_CUSTOMER_PASSWORD) throw new HttpError(400, "Choose a new password of at least " + MIN_CUSTOMER_PASSWORD + " characters.");
        Object.assign(me, hashPassword(String(body.newPassword)));
      }
      writeJson(FILES.customers, list);
      return send(res, 200, publicCustomer(me));
    }
  }

  if (route === "POST /api/admin/login") {
    const ip = clientIp(req);
    if (isLockedOut(ip)) throw new HttpError(429, "Too many attempts. Try again in 15 minutes.");
    const body = await readBody(req);
    const email = String(body.email || "").trim().toLowerCase();
    if (!readJson(FILES.admins, []).length) throw new HttpError(503, "No admin account yet. Run: npm run create-admin");
    if (!checkAdmin(email, String(body.password || ""))) {
      noteFailure(ip);
      throw new HttpError(401, "Incorrect email or password.");
    }
    failures.delete(ip);
    const token = newSession(email);
    return send(res, 200, { email }, { "Set-Cookie": sessionCookie(req, token, SESSION_HOURS * 3600) });
  }

  if (route === "POST /api/admin/logout") {
    const s = getSession(req);
    if (s) sessions.delete(s.token);
    return send(res, 200, { ok: true }, { "Set-Cookie": sessionCookie(req, "", 0) });
  }

  if (route === "GET /api/admin/session") {
    const s = getSession(req);
    return send(res, 200, s ? { email: s.email } : null);
  }

  /* Everything below needs an admin session */
  if (url.pathname.startsWith("/api/admin/")) requireAdmin(req);

  if (route === "GET /api/admin/orders") {
    return send(res, 200, readJson(FILES.orders, []).map((o) => {
      const copy = Object.assign({}, o, { hasAccount: !!o.customerId });
      delete copy.claim;
      return copy;
    }));
  }

  // Update an order's status and/or payment-received flag
  if (req.method === "PATCH" && (m = /^\/api\/admin\/orders\/(TFS-[A-Z0-9]{6})$/.exec(url.pathname))) {
    const s = requireAdmin(req);
    const body = await readBody(req);
    const orders = readJson(FILES.orders, []);
    const order = orders.find((o) => o.ref === m[1]);
    if (!order) throw new HttpError(404, "Order not found.");
    const change = { at: new Date().toISOString(), by: s.email };
    if (body.status !== undefined) {
      if (!ORDER_STATUSES.includes(body.status)) throw new HttpError(400, "Unknown status.");
      if (body.status !== order.status) { order.status = body.status; change.status = body.status; }
    }
    if (body.paid !== undefined) {
      if (typeof body.paid !== "boolean") throw new HttpError(400, "Invalid payment flag.");
      if (body.paid !== !!order.payment.paid) { order.payment.paid = body.paid; change.paid = body.paid; }
    }
    if (change.status !== undefined || change.paid !== undefined) {
      order.history = (order.history || []).concat(change);
      writeJson(FILES.orders, orders);
    }
    return send(res, 200, order);
  }

  if (route === "PUT /api/admin/order") {
    const ids = (await readBody(req)).ids;
    const list = products();
    if (!Array.isArray(ids) || ids.length !== list.length) throw new HttpError(400, "Refresh and try again.");
    const byId = new Map(list.map((p) => [p.id, p]));
    const next = ids.map((id) => byId.get(id));
    if (next.some((p) => !p)) throw new HttpError(400, "Refresh and try again.");
    writeJson(FILES.products, next);
    return send(res, 200, next);
  }

  // Create (POST) never overwrites; update (PUT) never creates
  if (route === "POST /api/admin/products" ||
      (req.method === "PUT" && (m = /^\/api\/admin\/products\/([a-z0-9-]{1,60})$/.exec(url.pathname)))) {
    const body = await readBody(req);
    const list = products();
    const creating = req.method === "POST";
    const at = list.findIndex((p) => p.id === (creating ? body.id : m[1]));
    if (creating && at > -1) throw new HttpError(409, "Another product already uses the ID “" + body.id + "”.");
    if (!creating && at === -1) throw new HttpError(404, "This product no longer exists. Refresh the page.");
    if (!creating && body.id !== m[1]) throw new HttpError(400, "A product's ID can't be changed.");
    const existing = creating ? null : list[at];
    const product = cleanProduct(body, existing);

    // image: data URL = new upload, null = remove the upload, otherwise keep
    if (typeof body.image === "string" && body.image.startsWith("data:")) {
      product.image = saveImage(product.id, body.image);
      if (existing) deleteImage(existing.image);
    } else if (body.image === null) {
      if (existing) deleteImage(existing.image);
      delete product.image;
    }
    if (!product.image) delete product.image;

    if (existing) list[at] = product;
    else list.unshift(product);
    writeJson(FILES.products, list);
    return send(res, existing ? 200 : 201, product);
  }

  if (req.method === "DELETE" && (m = /^\/api\/admin\/products\/([a-z0-9-]{1,60})$/.exec(url.pathname))) {
    const list = products();
    const at = list.findIndex((p) => p.id === m[1]);
    if (at === -1) throw new HttpError(404, "Product not found.");
    deleteImage(list[at].image);
    list.splice(at, 1);
    writeJson(FILES.products, list);
    return send(res, 200, list);
  }

  throw new HttpError(404, "Not found.");
}

/* ---------- Static files ---------- */
const TYPES = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".json": "application/json", ".svg": "image/svg+xml", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".png": "image/png", ".webp": "image/webp", ".ico": "image/x-icon", ".woff2": "font/woff2", ".txt": "text/plain; charset=utf-8",
};
// Never serve data, server code or tooling
const PRIVATE = /^\/(data|node_modules|\.git|\.vscode)(\/|$)|^\/(server\.js|package(-lock)?\.json)$|\/\./;

function serveStatic(req, res, url) {
  let pathname;
  try { pathname = decodeURIComponent(url.pathname); } catch (e) { return send(res, 400, "Bad request"); }
  if (pathname === "/") pathname = "/index.html";
  if (PRIVATE.test(pathname)) return send(res, 404, "Not found");

  // The storefront reads the live catalogue from here, so it always matches the database
  if (pathname === "/js/products.js") {
    return send(res, 200,
      "/* Live catalogue, generated by server.js */\nwindow.PRODUCTS = " + JSON.stringify(products()) + ";\nwindow.TFS_BACKEND = true;\n",
      { "Content-Type": TYPES[".js"], "Cache-Control": "no-cache" });
  }

  const file = path.join(ROOT, pathname);
  if (!file.startsWith(ROOT + path.sep)) return send(res, 404, "Not found");
  fs.stat(file, (err, stat) => {
    if (err || !stat.isFile()) return send(res, 404, "Not found");
    const ext = path.extname(file).toLowerCase();
    const headers = {
      "Content-Type": TYPES[ext] || "application/octet-stream",
      "Content-Length": stat.size,
      "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=3600",
    };
    if (pathname === "/admin.html") Object.assign(headers, { "X-Frame-Options": "DENY", "Cache-Control": "no-store" });
    res.writeHead(200, headers);
    if (req.method === "HEAD") return res.end();
    fs.createReadStream(file).pipe(res);
  });
}

/* ---------- Server ---------- */
function start() {
  products(); // seed on first run
  if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
    // Handy on hosts without a shell: set these env vars once to create/update the admin
    saveAdmin(process.env.ADMIN_EMAIL.trim().toLowerCase(), process.env.ADMIN_PASSWORD);
  }
  if (!readJson(FILES.admins, []).length) console.warn("No admin account yet. Run: npm run create-admin");

  http.createServer((req, res) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    const url = new URL(req.url, "http://localhost");
    if (url.pathname.startsWith("/api/")) {
      api(req, res, url).catch((err) => {
        if (!(err instanceof HttpError)) console.error(err);
        if (!res.headersSent) send(res, err.status || 500, { error: err.status ? err.message : "Something went wrong." });
      });
    } else if (req.method === "GET" || req.method === "HEAD") {
      serveStatic(req, res, url);
    } else {
      send(res, 405, "Method not allowed");
    }
  }).listen(PORT, () => console.log("The Fragrance Store is running on http://localhost:" + PORT));
}

/* ---------- npm run create-admin ---------- */
function createAdminPrompt() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  let muted = false;
  rl._writeToOutput = (s) => { if (!muted || s.includes("\n")) rl.output.write(muted ? "\n" : s); };
  rl.question("Admin email: ", (email) => {
    email = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { console.error("That email doesn't look right."); rl.close(); process.exitCode = 1; return; }
    rl.question("Password (min 10 characters): ", (pw) => {
      muted = false;
      rl.close();
      if (pw.length < 10) { console.error("Password must be at least 10 characters."); process.exitCode = 1; return; }
      saveAdmin(email, pw);
      console.log("Saved. " + email + " can now sign in at /admin.html");
    });
    muted = true;
  });
}

/* ---------- npm run reset-customer-password ----------
   No email/SMS service yet, so a customer who forgets their password asks the
   store (e.g. on WhatsApp) and the owner sets a temporary one here.        */
function resetCustomerPrompt() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  let muted = false;
  rl._writeToOutput = (s) => { if (!muted || s.includes("\n")) rl.output.write(muted ? "\n" : s); };
  rl.question("Customer phone number: ", (raw) => {
    const phone = normalisePhone(raw);
    const list = customers();
    const c = phone && list.find((x) => x.phone === phone);
    if (!c) { console.error("No account for that number."); rl.close(); process.exitCode = 1; return; }
    rl.question("New temporary password for " + c.name + " (min " + MIN_CUSTOMER_PASSWORD + " characters): ", (pw) => {
      muted = false;
      rl.close();
      if (pw.length < MIN_CUSTOMER_PASSWORD) { console.error("Too short."); process.exitCode = 1; return; }
      Object.assign(c, hashPassword(pw));
      writeJson(FILES.customers, list);
      // Sign them out everywhere
      const sessions = readJson(FILES.customerSessions, {});
      Object.keys(sessions).forEach((k) => { if (sessions[k].customerId === c.id) delete sessions[k]; });
      writeJson(FILES.customerSessions, sessions);
      console.log("Password reset. Share it with " + c.name + " privately and ask them to change it in My account.");
    });
    muted = true;
  });
}

if (process.argv[2] === "create-admin") createAdminPrompt();
else if (process.argv[2] === "reset-customer-password") resetCustomerPrompt();
else start();
