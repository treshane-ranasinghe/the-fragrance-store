/* ==========================================================================
   Data layer — every read/write of products and orders goes through here.

   SERVER MODE (npm start): talks to server.js. Everyone shares one catalogue,
   admin edits go live for all visitors, orders are stored on the server.
   The server marks itself by setting window.TFS_BACKEND in /js/products.js.

   STATIC MODE (prototype — plain files, Live Server, GitHub Pages): the shop
   works from js/products.js, and orders and customer accounts are kept in the
   visitor's own browser so every screen can be tried out. Nothing is shared
   between devices and it is not secure; the admin needs the server.
   ========================================================================== */
(function () {
  "use strict";

  var SERVER = !!window.TFS_BACKEND;
  var ORDERS_KEY = "tfs-orders";

  function request(method, url, body) {
    return fetch(url, {
      method: method,
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
      credentials: "same-origin",
      cache: "no-store",
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) {
          var err = new Error(data.error || "Something went wrong. Please try again.");
          err.status = res.status;
          throw err;
        }
        return data;
      });
    }, function () {
      throw new Error("Can't reach the store. Check your connection and try again.");
    });
  }

  function localOrders() {
    try { return JSON.parse(localStorage.getItem(ORDERS_KEY)) || []; } catch (e) { return []; }
  }
  function orderRef() {
    var chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    var out = "";
    for (var i = 0; i < 6; i++) out += chars[Math.floor(Math.random() * chars.length)];
    return "TFS-" + out;
  }
  /* ---------- Prototype accounts (static mode only) ----------
     Stored in this browser's localStorage. Passwords are salted + SHA-256
     hashed so they aren't sitting in plain text, but this is a demo, not
     security — real accounts live on the server.                           */
  var CUSTOMERS_KEY = "tfs-local-customers";
  var CUSTOMER_SESSION_KEY = "tfs-local-customer";

  function readLocal(key, fallback) {
    try { var v = JSON.parse(localStorage.getItem(key)); return v == null ? fallback : v; } catch (e) { return fallback; }
  }
  function writeLocal(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
  }
  function wait(value) {
    return new Promise(function (resolve) { setTimeout(function () { resolve(value); }, 350); });
  }
  function fail(message, status) {
    var err = new Error(message);
    err.status = status;
    return wait().then(function () { throw err; });
  }
  function randomHex(bytes) {
    var arr = new Uint8Array(bytes);
    (window.crypto || {}).getRandomValues ? window.crypto.getRandomValues(arr) : arr.forEach(function (_, i) { arr[i] = Math.random() * 256; });
    return Array.prototype.map.call(arr, function (b) { return ("0" + b.toString(16)).slice(-2); }).join("");
  }
  function hash(password, salt) {
    var text = salt + ":" + password;
    if (window.crypto && crypto.subtle && window.TextEncoder) {
      return crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)).then(function (buf) {
        return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ("0" + b.toString(16)).slice(-2); }).join("");
      });
    }
    // Very old browsers / insecure contexts: a simple non-cryptographic fallback
    var h = 5381;
    for (var i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
    return Promise.resolve("x" + (h >>> 0).toString(16));
  }
  function localPhone(raw) {
    var m = String(raw || "").replace(/[\s\-()]/g, "").match(/^(?:\+94|94|0)(\d{9})$/);
    return m ? "+94" + m[1] : null;
  }
  function publicCustomer(c) {
    return { name: c.name, phone: c.phone, email: c.email || null, address: c.address || null, createdAt: c.createdAt };
  }
  function currentCustomer() {
    var id = readLocal(CUSTOMER_SESSION_KEY, null);
    return id ? readLocal(CUSTOMERS_KEY, []).find(function (c) { return c.id === id; }) || null : null;
  }
  function cleanAddress(a) {
    if (!a) return null;
    var out = {
      address1: String(a.address1 || "").trim(), address2: String(a.address2 || "").trim() || null,
      city: String(a.city || "").trim(), district: String(a.district || "").trim(),
    };
    return out.address1 || out.city ? out : null;
  }
  function stripOrder(o) {
    var copy = Object.assign({}, o);
    delete copy.claimToken;
    delete copy.customerId;
    return copy;
  }

  var localAccount = {
    me: function () {
      var c = currentCustomer();
      return Promise.resolve(c ? publicCustomer(c) : null);
    },

    claim: function (ref, token, password) {
      if (String(password).length < 8) return fail("Choose a password of at least 8 characters.", 400);
      var orders = localOrders();
      var order = orders.find(function (o) { return o.ref === ref; });
      if (!order || !order.claimToken || order.claimToken !== token) return fail("This offer has expired. You can still create an account from your next order.", 410);
      var list = readLocal(CUSTOMERS_KEY, []);
      if (list.some(function (c) { return c.phone === order.customer.phone; })) return fail("There's already an account for " + order.customer.phone + ". Sign in to use it.", 409);
      var salt = randomHex(16);
      return hash(password, salt).then(function (h) {
        var customer = {
          id: randomHex(12),
          name: order.customer.name,
          phone: order.customer.phone,
          email: order.customer.email ? String(order.customer.email).toLowerCase() : null,
          address: order.delivery.method === "delivery" ? cleanAddress(order.delivery) : null,
          createdAt: new Date().toISOString(),
          salt: salt,
          hash: h,
        };
        list.push(customer);
        writeLocal(CUSTOMERS_KEY, list);
        order.customerId = customer.id;
        delete order.claimToken;
        writeLocal(ORDERS_KEY, orders);
        writeLocal(CUSTOMER_SESSION_KEY, customer.id);
        return wait(publicCustomer(customer));
      });
    },

    register: function (details) {
      var name = String(details.name || "").trim();
      var phone = localPhone(details.phone);
      var email = String(details.email || "").trim().toLowerCase();
      var password = String(details.password || "");
      if (!name) return fail("Please enter your name.", 400);
      if (!phone) return fail("Enter a valid Sri Lankan mobile number, e.g. 077 123 4567.", 400);
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail("That email doesn't look right.", 400);
      if (password.length < 8) return fail("Choose a password of at least 8 characters.", 400);
      var list = readLocal(CUSTOMERS_KEY, []);
      if (list.some(function (c) { return c.phone === phone; })) return fail("There's already an account for this number. Sign in instead.", 409);
      if (email && list.some(function (c) { return c.email === email; })) return fail("That email is already used by another account.", 409);
      var salt = randomHex(16);
      return hash(password, salt).then(function (h) {
        var customer = { id: randomHex(12), name: name, phone: phone, email: email || null, address: null, createdAt: new Date().toISOString(), salt: salt, hash: h };
        list.push(customer);
        writeLocal(CUSTOMERS_KEY, list);
        writeLocal(CUSTOMER_SESSION_KEY, customer.id);
        return wait(publicCustomer(customer));
      });
    },

    signIn: function (login, password) {
      login = String(login || "").trim().toLowerCase();
      var phone = login.indexOf("@") > -1 ? null : localPhone(login);
      var c = readLocal(CUSTOMERS_KEY, []).find(function (x) { return phone ? x.phone === phone : x.email && x.email === login; });
      var bad = "That phone number or email and password don't match.";
      if (!c) return fail(bad, 401);
      return hash(String(password || ""), c.salt).then(function (h) {
        if (h !== c.hash) return fail(bad, 401);
        writeLocal(CUSTOMER_SESSION_KEY, c.id);
        return wait(publicCustomer(c));
      });
    },

    signOut: function () {
      try { localStorage.removeItem(CUSTOMER_SESSION_KEY); } catch (e) {}
      return Promise.resolve();
    },

    orders: function () {
      var c = currentCustomer();
      if (!c) return fail("Please sign in again.", 401);
      return wait(localOrders().filter(function (o) { return o.customerId === c.id; }).map(stripOrder));
    },

    update: function (changes) {
      var list = readLocal(CUSTOMERS_KEY, []);
      var c = currentCustomer();
      var me = c && list.find(function (x) { return x.id === c.id; });
      if (!me) return fail("Please sign in again.", 401);
      if (changes.name !== undefined) {
        if (!String(changes.name).trim()) return fail("Please enter your name.", 400);
        me.name = String(changes.name).trim();
      }
      if (changes.email !== undefined) {
        var email = String(changes.email || "").trim().toLowerCase();
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail("That email doesn't look right.", 400);
        if (email && list.some(function (x) { return x.id !== me.id && x.email === email; })) return fail("That email is already used by another account.", 409);
        me.email = email || null;
      }
      if (changes.address !== undefined) me.address = cleanAddress(changes.address);
      var save = function () { writeLocal(CUSTOMERS_KEY, list); return wait(publicCustomer(me)); };
      if (changes.newPassword === undefined) return save();
      return hash(String(changes.currentPassword || ""), me.salt).then(function (h) {
        if (h !== me.hash) return fail("Your current password isn't right.", 400);
        if (String(changes.newPassword).length < 8) return fail("Choose a new password of at least 8 characters.", 400);
        me.salt = randomHex(16);
        return hash(String(changes.newPassword), me.salt).then(function (nh) { me.hash = nh; return save(); });
      });
    },
  };

  function noServer() {
    return Promise.reject(new Error("This needs the store server. Start it with “npm start” and open the site from there."));
  }

  window.TFS = window.TFS || {};

  // Image for a product: its uploaded image if set, otherwise images/products/<id>.jpg
  window.TFS.img = function (p) {
    return (p && p.image) || "images/products/" + (p && p.id) + ".jpg";
  };

  window.TFS.api = {
    mode: SERVER ? "server" : "static",

    getProducts: function () {
      return SERVER ? request("GET", "/api/products") : Promise.resolve(window.PRODUCTS || []);
    },

    /*
      order = { customer, delivery, payment, items: [{ id, ml, qty }], ... }
      The server re-prices every item from the catalogue and returns the saved
      order with its own totals.
    */
    placeOrder: function (order) {
      if (SERVER) return request("POST", "/api/orders", order);
      var saved = Object.assign({}, order, {
        ref: orderRef(),
        createdAt: new Date().toISOString(),
        status: "pending",
        payment: { method: order.payment.method, paid: false },
      });
      // Same account rules as the server: file it under the signed-in customer, or offer a claim
      var me = currentCustomer();
      var extra;
      if (me) {
        saved.customerId = me.id;
        extra = { signedIn: true };
      } else {
        saved.claimToken = randomHex(24);
        var phone = localPhone(order.customer.phone);
        extra = {
          claimToken: saved.claimToken,
          accountExists: readLocal(CUSTOMERS_KEY, []).some(function (c) { return c.phone === phone; }),
        };
      }
      writeLocal(ORDERS_KEY, [saved].concat(localOrders()).slice(0, 50));
      return new Promise(function (resolve) {
        setTimeout(function () { resolve(Object.assign(stripOrder(saved), extra)); }, 700);
      });
    },

    /*
      Online card payment. With PayHere (Sri Lanka) this becomes:
        1. the server signs the order (hash uses the merchant secret)
        2. payhere.startPayment({...}) opens the hosted payment form
        3. PayHere calls the server's notify URL, which marks the order paid
      Not connected yet, so no money moves.
    */
    startOnlinePayment: function (order) {
      return Promise.resolve({ demo: true, ref: order.ref });
    },

    getOrder: function (ref) {
      if (SERVER) return request("GET", "/api/orders/" + encodeURIComponent(ref)).catch(function () { return null; });
      var found = localOrders().find(function (o) { return o.ref === ref; });
      return Promise.resolve(found ? stripOrder(found) : null);
    },

    /* ---------- Customer accounts (optional) ----------
       Server mode: real accounts. Static mode: the in-browser prototype above. */
    account: {
      available: true,

      // Signed-in customer, or null
      me: function () {
        return SERVER ? request("GET", "/api/account").catch(function () { return null; }) : localAccount.me();
      },

      // Turn the order just placed into an account (token comes from placeOrder)
      claim: function (ref, token, password) {
        return SERVER ? request("POST", "/api/account/claim", { ref: ref, token: token, password: password }) : localAccount.claim(ref, token, password);
      },

      // details: { name, phone, email?, password }
      register: function (details) {
        return SERVER ? request("POST", "/api/account/register", details) : localAccount.register(details);
      },

      // login: phone number or email
      signIn: function (login, password) {
        return SERVER ? request("POST", "/api/account/login", { login: login, password: password }) : localAccount.signIn(login, password);
      },

      signOut: function () {
        return SERVER ? request("POST", "/api/account/logout").catch(function () {}) : localAccount.signOut();
      },

      orders: function () {
        return SERVER ? request("GET", "/api/account/orders") : localAccount.orders();
      },

      // changes: { name?, email?, address?, currentPassword + newPassword? }
      update: function (changes) {
        return SERVER ? request("PATCH", "/api/account", changes) : localAccount.update(changes);
      },
    },

    /* ---------- Admin (server only) ---------- */
    admin: {
      available: SERVER,

      session: function () {
        if (!SERVER) return Promise.resolve(null);
        return request("GET", "/api/admin/session").catch(function () { return null; }); // null = signed out
      },

      signIn: function (email, password) {
        return SERVER ? request("POST", "/api/admin/login", { email: email, password: password }) : noServer();
      },

      signOut: function () {
        return SERVER ? request("POST", "/api/admin/logout").catch(function () {}) : Promise.resolve();
      },

      listProducts: function () {
        return SERVER ? request("GET", "/api/products") : noServer();
      },

      /*
        isNew: create (fails if the ID is taken) vs update.
        product.image: a data: URL uploads a new image, null removes the
        uploaded one, anything else keeps the current image.
      */
      saveProduct: function (product, isNew) {
        if (!SERVER) return noServer();
        return isNew
          ? request("POST", "/api/admin/products", product)
          : request("PUT", "/api/admin/products/" + encodeURIComponent(product.id), product);
      },

      deleteProduct: function (id) {
        return SERVER ? request("DELETE", "/api/admin/products/" + encodeURIComponent(id)) : noServer();
      },

      reorder: function (ids) {
        return SERVER ? request("PUT", "/api/admin/order", { ids: ids }) : noServer();
      },

      listOrders: function () {
        return SERVER ? request("GET", "/api/admin/orders") : noServer();
      },

      // changes: { status?: "confirmed" | ..., paid?: true | false }
      updateOrder: function (ref, changes) {
        return SERVER ? request("PATCH", "/api/admin/orders/" + encodeURIComponent(ref), changes) : noServer();
      },
    },
  };
})();
