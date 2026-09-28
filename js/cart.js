/* ==========================================================================
   Shopping bag — state (saved in localStorage) + the slide-out bag panel.
   Only { id, ml, qty } is stored; prices are always looked up from the
   catalogue so a price change never leaves stale totals in someone's bag.
   ========================================================================== */
(function () {
  "use strict";

  var STORE = window.STORE || {};
  var KEY = "tfs-bag";
  var MAX_QTY = 10;
  var items = load();
  var listeners = [];

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function money(n) {
    return (STORE.currency || "LKR") + " " + Math.round(n).toLocaleString("en-US");
  }

  function product(id) {
    return (window.PRODUCTS || []).find(function (p) { return p.id === id; }) || null;
  }
  function size(p, ml) {
    return p && (p.sizes || []).find(function (s) { return s.ml === ml; }) || null;
  }

  // Drop anything that is no longer sold (removed product, size or price)
  function sanitize(list) {
    return (Array.isArray(list) ? list : []).filter(function (it) {
      if (!it) return false;
      var p = product(it.id), s = size(p, it.ml);
      return p && p.inStock !== false && s && s.price != null && it.qty > 0;
    }).map(function (it) {
      return { id: it.id, ml: it.ml, qty: Math.min(MAX_QTY, Math.floor(it.qty)) };
    });
  }

  function load() {
    try { return sanitize(JSON.parse(localStorage.getItem(KEY))); } catch (e) { return []; }
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(items)); } catch (e) {}
    listeners.forEach(function (fn) { fn(); });
  }

  function find(id, ml) {
    return items.find(function (it) { return it.id === id && it.ml === ml; });
  }

  /* Lines with product details + prices resolved */
  function lines() {
    return items.map(function (it) {
      var p = product(it.id), s = size(p, it.ml);
      return { id: it.id, ml: it.ml, qty: it.qty, price: s.price, total: s.price * it.qty, product: p };
    });
  }

  function count() {
    return items.reduce(function (n, it) { return n + it.qty; }, 0);
  }
  function subtotal() {
    return lines().reduce(function (n, l) { return n + l.total; }, 0);
  }

  /* opts: { fulfilment: "delivery" | "pickup", payment: "card" | "cod" | "bank" } */
  function totals(opts) {
    opts = opts || {};
    var sub = subtotal();
    var free = STORE.freeDeliveryOver > 0 && sub >= STORE.freeDeliveryOver;
    var delivery = opts.fulfilment === "pickup" || free || !sub ? 0 : (STORE.deliveryFee || 0);
    var cod = opts.payment === "cod" && opts.fulfilment !== "pickup" ? (STORE.codFee || 0) : 0;
    return { subtotal: sub, delivery: delivery, cod: cod, total: sub + delivery + cod, freeDelivery: free };
  }

  var cart = {
    MAX_QTY: MAX_QTY,
    money: money,
    product: product,
    lines: lines,
    count: count,
    subtotal: subtotal,
    totals: totals,
    add: function (id, ml, qty) {
      var p = product(id), s = size(p, ml);
      if (!p || !s || s.price == null || p.inStock === false) return false;
      var existing = find(id, ml);
      if (existing) existing.qty = Math.min(MAX_QTY, existing.qty + (qty || 1));
      else items.push({ id: id, ml: ml, qty: Math.min(MAX_QTY, qty || 1) });
      save();
      return true;
    },
    setQty: function (id, ml, qty) {
      var it = find(id, ml);
      if (!it) return;
      if (qty <= 0) items.splice(items.indexOf(it), 1);
      else it.qty = Math.min(MAX_QTY, qty);
      save();
    },
    remove: function (id, ml) { cart.setQty(id, ml, 0); },
    clear: function () { items = []; save(); },
    onChange: function (fn) { listeners.push(fn); },
  };

  // Keep several open tabs in step
  window.addEventListener("storage", function (e) {
    if (e.key !== KEY) return;
    items = load();
    listeners.forEach(function (fn) { fn(); });
  });

  window.TFS = window.TFS || {};
  window.TFS.cart = cart;

  /* ---------- Nav badge ---------- */
  function paintBadges(bump) {
    var n = count();
    document.querySelectorAll("[data-bag-count]").forEach(function (el) {
      el.textContent = n;
      var btn = el.closest("[data-bag-open]");
      if (btn) {
        btn.classList.toggle("has-items", n > 0);
        btn.setAttribute("aria-label", "Open bag, " + n + (n === 1 ? " item" : " items"));
      }
      if (bump) {
        el.classList.remove("is-bump");
        void el.offsetWidth;
        el.classList.add("is-bump");
      }
    });
  }

  /* ---------- Bag panel (not shown on the checkout page) ---------- */
  var bag = null;
  var lastFocus = null;

  function buildBag() {
    bag = document.createElement("div");
    bag.className = "bag";
    bag.id = "bag";
    bag.setAttribute("aria-hidden", "true");
    bag.innerHTML =
      '<div class="bag__backdrop" data-bag-close></div>' +
      '<aside class="bag__panel" role="dialog" aria-modal="true" aria-labelledby="bagTitle">' +
        '<header class="bag__head">' +
          '<h2 id="bagTitle">Your Bag <span class="bag__n"></span></h2>' +
          '<button type="button" class="bag__close" data-bag-close aria-label="Close bag">&times;</button>' +
        "</header>" +
        '<div class="bag__ship" aria-live="polite"></div>' +
        '<ul class="bag__items"></ul>' +
        '<div class="bag__empty">' +
          '<p class="bag__empty-title">Your bag is empty</p>' +
          "<p>Discover a scent that feels unmistakably yours.</p>" +
          '<a href="index.html#signatures" class="btn btn--ghost" data-bag-close>Explore the Signatures</a>' +
        "</div>" +
        '<footer class="bag__foot">' +
          '<div class="bag__row"><span>Subtotal</span><strong class="bag__sub"></strong></div>' +
          '<p class="bag__hint">Delivery and payment options are chosen at checkout.</p>' +
          '<a href="checkout.html" class="btn btn--gold btn--block">Checkout</a>' +
          '<button type="button" class="bag__continue" data-bag-close>Continue shopping</button>' +
        "</footer>" +
      "</aside>";
    document.body.appendChild(bag);

    bag.addEventListener("click", function (e) {
      if (e.target.closest("[data-bag-close]")) { close(); return; }
      var row = e.target.closest("[data-line]");
      if (!row) return;
      var id = row.dataset.id, ml = +row.dataset.ml, it = find(id, ml);
      if (!it) return;
      if (e.target.closest("[data-inc]")) cart.setQty(id, ml, it.qty + 1);
      else if (e.target.closest("[data-dec]")) cart.setQty(id, ml, it.qty - 1);
      else if (e.target.closest("[data-remove]")) cart.remove(id, ml);
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && bag.classList.contains("is-open")) close();
    });
    renderBag();
  }

  function renderBag() {
    if (!bag) return;
    var ls = lines();
    var t = totals();
    var n = count();
    bag.classList.toggle("is-empty", !ls.length);
    bag.querySelector(".bag__n").textContent = n ? "(" + n + ")" : "";
    bag.querySelector(".bag__sub").textContent = money(t.subtotal);

    var ship = bag.querySelector(".bag__ship");
    if (!ls.length || !(STORE.freeDeliveryOver > 0)) {
      ship.hidden = true;
    } else {
      ship.hidden = false;
      var pct = Math.min(100, (t.subtotal / STORE.freeDeliveryOver) * 100);
      ship.innerHTML =
        "<p>" + (t.freeDelivery
          ? "You've unlocked <b>complimentary island-wide delivery</b>"
          : "Add <b>" + money(STORE.freeDeliveryOver - t.subtotal) + "</b> more for complimentary delivery") + "</p>" +
        '<span class="bag__meter"><i style="transform:scaleX(' + (pct / 100).toFixed(3) + ')"></i></span>';
    }

    bag.querySelector(".bag__items").innerHTML = ls.map(function (l) {
      var p = l.product;
      return (
        '<li class="bag__item" data-line data-id="' + escapeHtml(l.id) + '" data-ml="' + l.ml + '">' +
          '<div class="bag__img"><img src="' + escapeHtml(window.TFS.img(p)) + '" alt="" loading="lazy" onerror="imgFallback(this)" /></div>' +
          '<div class="bag__info">' +
            '<p class="bag__house">' + escapeHtml(p.house) + "</p>" +
            '<p class="bag__name">' + escapeHtml(p.name) + "</p>" +
            '<p class="bag__meta">' + escapeHtml(p.type) + " &middot; " + l.ml + " ml</p>" +
            '<div class="bag__controls">' +
              '<div class="qty" role="group" aria-label="Quantity">' +
                '<button type="button" data-dec aria-label="Decrease quantity">&minus;</button>' +
                '<span aria-live="polite">' + l.qty + "</span>" +
                '<button type="button" data-inc aria-label="Increase quantity"' + (l.qty >= MAX_QTY ? " disabled" : "") + ">+</button>" +
              "</div>" +
              '<button type="button" class="bag__remove" data-remove>Remove</button>' +
            "</div>" +
          "</div>" +
          '<p class="bag__price">' + money(l.total) + "</p>" +
        "</li>"
      );
    }).join("");
  }

  function open() {
    if (!bag) return;
    lastFocus = document.activeElement;
    bag.classList.add("is-open");
    bag.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    setTimeout(function () { bag.querySelector(".bag__close").focus({ preventScroll: true }); }, 50);
  }
  function close() {
    if (!bag || !bag.classList.contains("is-open")) return;
    bag.classList.remove("is-open");
    bag.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }
  cart.open = open;
  cart.close = close;

  var lastCount = count();
  cart.onChange(function () {
    var n = count();
    paintBadges(n > lastCount);
    lastCount = n;
    renderBag();
  });

  function init() {
    // Only pages with a bag button get the slide-out bag
    if (document.querySelector("[data-bag-open]")) buildBag();
    paintBadges(false);
    document.addEventListener("click", function (e) {
      var trigger = e.target.closest("[data-bag-open]");
      if (trigger && bag) { e.preventDefault(); open(); }
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
