/* ==========================================================================
   Data layer — every read/write of products and orders goes through here.

   SERVER MODE (npm start): talks to server.js. Everyone shares one catalogue,
   admin edits go live for all visitors, orders are stored on the server.
   The server marks itself by setting window.TFS_BACKEND in /js/products.js.

   STATIC MODE (site opened as plain files): the shop still works from
   js/products.js and orders are kept in the visitor's browser, but the admin
   is unavailable because there is nowhere shared to save changes.
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
      try { localStorage.setItem(ORDERS_KEY, JSON.stringify([saved].concat(localOrders()).slice(0, 20))); } catch (e) {}
      return new Promise(function (resolve) { setTimeout(function () { resolve(saved); }, 700); });
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
      return Promise.resolve(localOrders().find(function (o) { return o.ref === ref; }) || null);
    },

    /* ---------- Customer accounts (optional, server only) ---------- */
    account: {
      available: SERVER,

      // Signed-in customer, or null
      me: function () {
        return SERVER ? request("GET", "/api/account").catch(function () { return null; }) : Promise.resolve(null);
      },

      // Turn the order just placed into an account (token comes from placeOrder)
      claim: function (ref, token, password) {
        return SERVER ? request("POST", "/api/account/claim", { ref: ref, token: token, password: password }) : noServer();
      },

      // login: phone number or email
      signIn: function (login, password) {
        return SERVER ? request("POST", "/api/account/login", { login: login, password: password }) : noServer();
      },

      signOut: function () {
        return SERVER ? request("POST", "/api/account/logout").catch(function () {}) : Promise.resolve();
      },

      orders: function () {
        return SERVER ? request("GET", "/api/account/orders") : noServer();
      },

      // changes: { name?, email?, address?, currentPassword + newPassword? }
      update: function (changes) {
        return SERVER ? request("PATCH", "/api/account", changes) : noServer();
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
