/* ==========================================================================
   Admin: orders + analytics dashboard
   ========================================================================== */
(function () {
  "use strict";

  var A = window.TFSAdmin;
  var api = window.TFS.api.admin;
  var esc = A.escapeHtml;
  var money = A.money;
  var $ = function (id) { return document.getElementById(id); };
  var DAY = 864e5;
  var REFRESH_MS = 60e3;

  var orders = [];
  var loaded = false;
  var filter = { q: "", status: "open" };
  var period = "30";
  var current = null;   // order open in the sheet
  var lastFocus = null;

  /* ---------- Order model ---------- */
  var STATUS = {
    pending: { label: "New", tone: "warn" },
    confirmed: { label: "Confirmed", tone: "info" },
    dispatched: { label: "Dispatched", tone: "info" },
    ready: { label: "Ready for pickup", tone: "info" },
    delivered: { label: "Delivered", tone: "good" },
    cancelled: { label: "Cancelled", tone: "bad" },
  };
  var PAYMENT = { card: "Card", cod: "Cash on delivery", bank: "Bank transfer" };

  function isPickup(o) { return o.delivery && o.delivery.method === "pickup"; }
  function statusLabel(o) {
    if (o.status === "delivered" && isPickup(o)) return "Collected";
    return (STATUS[o.status] || STATUS.pending).label;
  }
  function paymentLabel(o) {
    return o.payment.method === "cod" && isPickup(o) ? "Pay at boutique" : PAYMENT[o.payment.method];
  }
  function isOpen(o) { return o.status !== "delivered" && o.status !== "cancelled"; }
  function isUnpaid(o) { return !o.payment.paid && o.status !== "cancelled"; }
  function itemCount(o) { return o.items.reduce(function (n, i) { return n + i.qty; }, 0); }

  // The one action that moves an order forward
  function nextStep(o) {
    var pickup = isPickup(o);
    if (o.status === "pending") return { status: "confirmed", label: "Confirm order" };
    if (o.status === "confirmed") return pickup
      ? { status: "ready", label: "Mark ready for pickup" }
      : { status: "dispatched", label: "Mark as dispatched" };
    if (o.status === "dispatched" || o.status === "ready") return { status: "delivered", label: pickup ? "Mark as collected" : "Mark as delivered" };
    return null;
  }

  function chip(label, tone) {
    return '<span class="ad-status ad-status--' + tone + '">' + esc(label) + "</span>";
  }
  function statusChip(o) { return chip(statusLabel(o), (STATUS[o.status] || STATUS.pending).tone); }
  function payChip(o) {
    if (o.status === "cancelled") return "";
    return o.payment.paid ? chip("Paid", "good") : chip("Unpaid", "muted");
  }

  function fmtDate(iso, withTime) {
    var d = new Date(iso);
    var opts = { day: "numeric", month: "short" };
    if (d.getFullYear() !== new Date().getFullYear()) opts.year = "numeric";
    if (withTime) { opts.hour = "2-digit"; opts.minute = "2-digit"; }
    return d.toLocaleString("en-GB", opts);
  }
  function compact(n) {
    if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, "") + "M";
    if (n >= 1e3) return (n / 1e3).toFixed(n >= 1e4 ? 0 : 1).replace(/\.0$/, "") + "K";
    return String(Math.round(n));
  }

  /* ---------- Loading ---------- */
  var loading = null;
  function load() {
    if (loading) return loading;
    loading = api.listOrders().then(function (list) {
      orders = list;
      loaded = true;
      var fresh = orders.filter(function (o) { return o.status === "pending"; }).length;
      $("newCount").textContent = fresh;
      $("newCount").hidden = !fresh;
      $("newCount").setAttribute("aria-label", fresh + " new");
    }, A.fail).then(function () { loading = null; });
    return loading;
  }

  function renderActive() {
    if (!$("view-orders").hidden) renderOrders();
    if (!$("view-dashboard").hidden) renderDashboard();
  }

  A.onView("orders", function () {
    if (loaded) renderOrders();
    load().then(renderOrders);
  });
  A.onView("dashboard", function () {
    if (loaded) renderDashboard();
    load().then(renderDashboard);
  });

  // Keep numbers fresh while the admin is open
  setInterval(function () {
    if (A.isOpen() && !document.hidden && !current) load().then(renderActive);
  }, REFRESH_MS);
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden && A.isOpen() && loaded) load().then(renderActive);
  });

  /* ==========================================================================
     Orders list
     ========================================================================== */
  function orderRow(o) {
    var where = isPickup(o) ? "Boutique pickup" : o.delivery.city + ", " + o.delivery.district;
    return (
      '<button type="button" class="ad-order' + (o.status === "cancelled" ? " is-cancelled" : "") + '" data-ref="' + esc(o.ref) + '">' +
        '<span class="ad-order__ref"><b>' + esc(o.ref) + "</b><small>" + fmtDate(o.createdAt, true) + "</small></span>" +
        '<span class="ad-order__cust"><b>' + esc(o.customer.name) + "</b><small>" + esc(where) + "</small></span>" +
        '<span class="ad-order__total"><b>' + money(o.totals.total) + "</b><small>" + itemCount(o) + (itemCount(o) === 1 ? " item" : " items") + " · " + esc(paymentLabel(o)) + "</small></span>" +
        '<span class="ad-order__chips">' + statusChip(o) + payChip(o) + "</span>" +
      "</button>"
    );
  }

  function matches(o) {
    var f = filter.status;
    var byStatus =
      f === "all" ? true :
      f === "open" ? isOpen(o) :
      f === "unpaid" ? isUnpaid(o) :
      o.status === f;
    if (!byStatus) return false;
    var q = filter.q.toLowerCase().replace(/\s+/g, "");
    if (!q) return true;
    var hay = (o.ref + o.customer.name + o.customer.phone + (o.customer.email || "")).toLowerCase().replace(/\s+/g, "");
    // let "0771234567" find "+94771234567"
    return hay.indexOf(q) > -1 || (q.charAt(0) === "0" && hay.indexOf("+94" + q.slice(1)) > -1);
  }

  function renderOrders() {
    var list = orders.filter(matches);
    var open = orders.filter(isOpen).length;
    $("orderStats").textContent = orders.length
      ? orders.length + (orders.length === 1 ? " order" : " orders") + " · " + open + " open"
      : "";
    if (!orders.length) {
      $("orderList").innerHTML = '<div class="ad-empty"><p class="ad-empty__title">No orders yet</p><p>New orders from the checkout will appear here.</p></div>';
      return;
    }
    $("orderList").innerHTML = list.length
      ? list.map(orderRow).join("")
      : '<div class="ad-empty"><p class="ad-empty__title">Nothing here</p><p>No orders match this filter.</p></div>';
  }

  var searchTimer;
  $("orderSearch").addEventListener("input", function (e) {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(function () { filter.q = e.target.value.trim(); renderOrders(); }, 120);
  });
  document.querySelectorAll('input[name="ostatus"]').forEach(function (r) {
    r.addEventListener("change", function () { filter.status = r.value; renderOrders(); });
  });
  $("refreshOrders").addEventListener("click", function () {
    var btn = this;
    btn.disabled = true;
    load().then(function () { renderOrders(); btn.disabled = false; A.toast("Orders updated"); });
  });

  function setFilter(status) {
    filter.status = status;
    document.querySelectorAll('input[name="ostatus"]').forEach(function (r) { r.checked = r.value === status; });
  }

  document.addEventListener("click", function (e) {
    var row = e.target.closest("[data-ref]");
    if (row && row.closest(".ad-app")) { openOrder(row.dataset.ref); return; }
    var go = e.target.closest("[data-goto-filter]");
    if (go) { e.preventDefault(); setFilter(go.dataset.gotoFilter); location.hash = "orders"; renderOrders(); }
  });

  /* ==========================================================================
     Order detail sheet
     ========================================================================== */
  var sheet = $("orderSheet");

  function waNumber(phone) { return String(phone).replace(/\D/g, ""); }

  function renderSheet() {
    var o = current;
    var pickup = isPickup(o);
    $("orderTitle").innerHTML = esc(o.ref) + " " + statusChip(o) + payChip(o);
    $("orderPlaced").textContent = "Placed " + fmtDate(o.createdAt, true);

    var steps = pickup
      ? [["pending", "New"], ["confirmed", "Confirmed"], ["ready", "Ready"], ["delivered", "Collected"]]
      : [["pending", "New"], ["confirmed", "Confirmed"], ["dispatched", "Dispatched"], ["delivered", "Delivered"]];
    var at = steps.findIndex(function (s) { return s[0] === o.status; });

    var history = (o.history || []).map(function (h, i) {
      var what = i === 0 ? "Order placed" :
        h.status ? "Marked " + (h.status === "delivered" && pickup ? "collected" : (STATUS[h.status] || {}).label.toLowerCase()) :
        h.paid ? "Payment received" : "Marked unpaid";
      if (i > 0 && h.status && h.paid !== undefined) what += h.paid ? " · payment received" : " · marked unpaid";
      return "<li><span>" + esc(what) + (h.by && h.by !== "customer" ? " <small>by " + esc(h.by) + "</small>" : "") + "</span><time>" + fmtDate(h.at, true) + "</time></li>";
    }).reverse().join("");

    var greeting = "Hello " + o.customer.name.split(" ")[0] + ", this is The Fragrance Store about your order " + o.ref + ".";

    $("orderBody").innerHTML =
      (o.status === "cancelled"
        ? '<p class="ad-note ad-note--bad">This order was cancelled.</p>'
        : '<ol class="ad-steps" aria-label="Progress">' + steps.map(function (s, i) {
            return '<li class="' + (i < at ? "is-done" : i === at ? "is-now" : "") + '"' + (i === at ? ' aria-current="step"' : "") + "><span>" + s[1] + "</span></li>";
          }).join("") + "</ol>") +

      (o.payment.method === "bank" && isUnpaid(o)
        ? '<p class="ad-note">Waiting for a bank transfer with reference <b>' + esc(o.ref) + "</b>. Mark it paid once the money arrives.</p>"
        : o.payment.method === "card" && isUnpaid(o)
          ? '<p class="ad-note">Online payment isn\'t connected yet, so this card order hasn\'t been charged. Contact the customer to arrange payment.</p>'
          : "") +

      '<section class="ad-group"><h3>Customer</h3>' +
        '<p class="ad-detail"><b>' + esc(o.customer.name) + "</b>" + (o.hasAccount ? " " + chip("Has an account", "good") : " " + chip("Guest", "muted")) + "</p>" +
        '<div class="ad-contact">' +
          '<a class="ad-btn ad-btn--ghost ad-btn--sm" href="tel:' + esc(o.customer.phone) + '">Call ' + esc(o.customer.phone) + "</a>" +
          '<a class="ad-btn ad-btn--ghost ad-btn--sm" target="_blank" rel="noopener" href="https://wa.me/' + waNumber(o.customer.phone) + "?text=" + encodeURIComponent(greeting) + '">WhatsApp</a>' +
          (o.customer.email ? '<a class="ad-btn ad-btn--ghost ad-btn--sm" href="mailto:' + esc(o.customer.email) + '">Email</a>' : "") +
        "</div>" +
      "</section>" +

      '<section class="ad-group"><h3>' + (pickup ? "Collection" : "Delivery address") + "</h3>" +
        '<p class="ad-detail">' + (pickup
          ? "Customer will collect from the boutique."
          : esc([o.delivery.address1, o.delivery.address2].filter(Boolean).join(", ")) + "<br />" + esc(o.delivery.city + ", " + o.delivery.district)) + "</p>" +
        (o.notes ? '<p class="ad-detail ad-detail--note"><b>Note from customer</b>' + esc(o.notes) + "</p>" : "") +
      "</section>" +

      '<section class="ad-group"><h3>Items</h3>' +
        '<ul class="ad-items">' + o.items.map(function (i) {
          return "<li><span>" + i.qty + " × " + esc(i.name) + " <small>" + i.ml + " ml · " + money(i.price) + " each</small></span><b>" + money(i.price * i.qty) + "</b></li>";
        }).join("") + "</ul>" +
        '<dl class="co__totals">' +
          "<div><dt>Subtotal</dt><dd>" + money(o.totals.subtotal) + "</dd></div>" +
          "<div><dt>" + (pickup ? "Collection" : "Delivery") + "</dt><dd>" + (o.totals.delivery ? money(o.totals.delivery) : "Free") + "</dd></div>" +
          (o.totals.cod ? "<div><dt>Cash on delivery fee</dt><dd>" + money(o.totals.cod) + "</dd></div>" : "") +
          '<div class="co__total"><dt>Total</dt><dd>' + money(o.totals.total) + "</dd></div>" +
        "</dl>" +
        '<p class="ad-detail">Payment: ' + esc(paymentLabel(o)) + (o.payment.paid ? " — received" : "") + "</p>" +
      "</section>" +

      '<section class="ad-group"><h3>History</h3><ul class="ad-history">' + history + "</ul></section>";

    var next = nextStep(o);
    $("orderFoot").innerHTML =
      (isOpen(o) ? '<button type="button" class="ad-btn ad-btn--danger" data-act="cancel">Cancel order</button>' : "") +
      (o.status === "cancelled" ? '<button type="button" class="ad-btn ad-btn--ghost" data-act="reopen">Restore order</button>' : "") +
      '<span class="ad-spacer"></span>' +
      (o.status !== "cancelled"
        ? '<button type="button" class="ad-btn ad-btn--ghost" data-act="paid">' + (o.payment.paid ? "Mark unpaid" : "Mark paid") + "</button>"
        : "") +
      (next ? '<button type="button" class="ad-btn ad-btn--gold" data-act="next">' + esc(next.label) + "</button>" : "");
  }

  function openOrder(ref) {
    current = orders.find(function (o) { return o.ref === ref; });
    if (!current) return;
    lastFocus = document.activeElement;
    renderSheet();
    sheet.classList.add("is-open");
    sheet.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    sheet.querySelector(".ad-sheet__body").scrollTop = 0;
    setTimeout(function () { sheet.querySelector(".bag__close").focus({ preventScroll: true }); }, 60);
  }

  function closeOrder() {
    if (!current) return;
    current = null;
    sheet.classList.remove("is-open");
    sheet.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    if (lastFocus && document.body.contains(lastFocus)) lastFocus.focus();
  }

  function update(changes, message) {
    var buttons = $("orderFoot").querySelectorAll("button");
    buttons.forEach(function (b) { b.disabled = true; });
    return api.updateOrder(current.ref, changes).then(function (saved) {
      orders = orders.map(function (o) { return o.ref === saved.ref ? saved : o; });
      current = saved;
      renderSheet();
      renderActive();
      var fresh = orders.filter(function (o) { return o.status === "pending"; }).length;
      $("newCount").textContent = fresh;
      $("newCount").hidden = !fresh;
      A.toast(message);
    }, function (ex) {
      buttons.forEach(function (b) { b.disabled = false; });
      if (ex.status === 401) closeOrder();
      A.fail(ex);
    });
  }

  sheet.addEventListener("click", function (e) {
    if (e.target.closest("[data-close-order]")) { closeOrder(); return; }
    var act = e.target.closest("[data-act]");
    if (!act || !current) return;
    var o = current;
    var kind = act.dataset.act;

    if (kind === "next") {
      var next = nextStep(o);
      var changes = { status: next.status };
      // Cash on delivery: completing the order means the cash was collected
      if (next.status === "delivered" && o.payment.method === "cod" && !o.payment.paid) changes.paid = true;
      update(changes, o.ref + " — " + next.label.replace(/^Mark (as )?/, "").replace(/^Confirm order$/, "confirmed").toLowerCase() + (changes.paid ? ", cash collected" : ""));
    } else if (kind === "paid") {
      update({ paid: !o.payment.paid }, o.payment.paid ? o.ref + " marked unpaid" : o.ref + " marked paid");
    } else if (kind === "reopen") {
      update({ status: "pending" }, o.ref + " restored");
    } else if (kind === "cancel") {
      A.confirmDialog({
        title: "Cancel " + o.ref + "?",
        body: "<p>The customer isn't notified automatically — let them know on WhatsApp or by phone." +
          (o.payment.paid ? " This order was paid, so arrange a refund." : "") + "</p>",
        ok: "Cancel order",
      }).then(function (ok) { if (ok) update({ status: "cancelled" }, o.ref + " cancelled"); });
    }
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && current && !$("confirm").open) closeOrder();
  });

  /* ==========================================================================
     Dashboard
     ========================================================================== */
  function startOfDay(t) { var d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); }

  function range() {
    var end = startOfDay(Date.now()) + DAY;
    var start;
    if (period === "all") {
      var first = orders.length ? Math.min.apply(null, orders.map(function (o) { return Date.parse(o.createdAt); })) : Date.now();
      start = startOfDay(first);
    } else {
      start = end - Number(period) * DAY;
    }
    return { start: start, end: end, prevStart: start - (end - start) };
  }

  function stats(list) {
    var valid = list.filter(function (o) { return o.status !== "cancelled"; });
    var sales = valid.reduce(function (n, o) { return n + o.totals.total; }, 0);
    return {
      sales: sales,
      orders: valid.length,
      aov: valid.length ? sales / valid.length : 0,
      items: valid.reduce(function (n, o) { return n + itemCount(o); }, 0),
      valid: valid,
    };
  }

  function between(a, b) {
    return orders.filter(function (o) { var t = Date.parse(o.createdAt); return t >= a && t < b; });
  }

  function delta(now, before) {
    if (period === "all") return "";
    if (!before) return now ? '<p class="ad-kpi__delta">No sales in the previous ' + period + " days</p>" : "";
    var pct = Math.round(((now - before) / before) * 100);
    var dir = pct > 0 ? "up" : pct < 0 ? "down" : "flat";
    var arrow = dir === "up" ? "▲" : dir === "down" ? "▼" : "";
    return '<p class="ad-kpi__delta ad-kpi__delta--' + dir + '"><span aria-hidden="true">' + arrow + "</span> " +
      (pct > 0 ? "+" : "") + pct + "% <span>vs previous " + period + " days</span></p>";
  }

  function renderDashboard() {
    var r = range();
    var now = between(r.start, r.end);
    var s = stats(now);
    var p = stats(between(r.prevStart, r.start));

    $("dashRange").textContent = fmtDate(new Date(r.start).toISOString()) + " – " + fmtDate(new Date(r.end - 1).toISOString());

    // Things that need someone to act
    var pending = orders.filter(function (o) { return o.status === "pending"; }).length;
    var toShip = orders.filter(function (o) { return o.status === "confirmed"; }).length;
    var awaitingBank = orders.filter(function (o) { return o.payment.method === "bank" && isUnpaid(o); }).length;
    var attn = [];
    if (pending) attn.push('<a href="#orders" data-goto-filter="pending" class="ad-attn__item ad-attn__item--warn"><b>' + pending + "</b> new " + (pending === 1 ? "order" : "orders") + " to confirm →</a>");
    if (toShip) attn.push('<a href="#orders" data-goto-filter="confirmed" class="ad-attn__item"><b>' + toShip + "</b> confirmed, ready to send →</a>");
    if (awaitingBank) attn.push('<a href="#orders" data-goto-filter="unpaid" class="ad-attn__item"><b>' + awaitingBank + "</b> awaiting bank transfer →</a>");
    $("attention").innerHTML = attn.join("");
    $("attention").hidden = !attn.length;

    // KPI tiles — label, value, delta vs the previous period of the same length
    $("kpis").innerHTML = [
      ["Sales", money(s.sales), delta(s.sales, p.sales)],
      ["Orders", s.orders.toLocaleString("en-US"), delta(s.orders, p.orders)],
      ["Average order", s.orders ? money(s.aov) : "—", s.orders && p.orders ? delta(s.aov, p.aov) : ""],
      ["Bottles sold", s.items.toLocaleString("en-US"), delta(s.items, p.items)],
    ].map(function (k) {
      return '<div class="ad-kpi"><p class="ad-kpi__label">' + k[0] + '</p><p class="ad-kpi__value">' + k[1] + "</p>" + k[2] + "</div>";
    }).join("");

    renderSalesChart(r, s.valid);

    // Top products by sales
    var byProduct = {};
    s.valid.forEach(function (o) {
      o.items.forEach(function (i) {
        var k = byProduct[i.id] || (byProduct[i.id] = { name: i.name, sales: 0, units: 0 });
        k.sales += i.price * i.qty;
        k.units += i.qty;
      });
    });
    var top = Object.keys(byProduct).map(function (k) { return byProduct[k]; })
      .sort(function (a, b) { return b.sales - a.sales; }).slice(0, 5);
    $("topProducts").innerHTML = bars(top.map(function (t) {
      return { label: t.name, value: t.sales, text: money(t.sales), sub: t.units + " sold" };
    }), "No sales in this period yet.");

    // Payment methods (share of orders)
    var total = s.valid.length;
    $("payments").innerHTML = bars(["cod", "card", "bank"].map(function (m) {
      var list = s.valid.filter(function (o) { return o.payment.method === m; });
      var sales = list.reduce(function (n, o) { return n + o.totals.total; }, 0);
      return { label: PAYMENT[m], value: list.length, text: total ? Math.round(list.length / total * 100) + "%" : "0%", sub: list.length + (list.length === 1 ? " order" : " orders") + " · " + money(sales) };
    }).filter(function (x) { return x.value; }), "No orders in this period yet.", total);

    // Districts (+ boutique pickups)
    var places = {};
    s.valid.forEach(function (o) {
      var k = isPickup(o) ? "Boutique pickup" : o.delivery.district;
      places[k] = (places[k] || 0) + 1;
    });
    var placeList = Object.keys(places).map(function (k) { return { label: k, value: places[k] }; })
      .sort(function (a, b) { return b.value - a.value; });
    if (placeList.length > 6) {
      var rest = placeList.slice(5).reduce(function (n, x) { return n + x.value; }, 0);
      placeList = placeList.slice(0, 5).concat({ label: "Other districts", value: rest });
    }
    $("districts").innerHTML = bars(placeList.map(function (x) {
      return { label: x.label, value: x.value, text: String(x.value), sub: "" };
    }), "No orders in this period yet.");

    // Status breakdown — every order in the period, including cancelled
    var order = ["pending", "confirmed", "dispatched", "ready", "delivered", "cancelled"];
    var counts = {};
    now.forEach(function (o) { counts[o.status] = (counts[o.status] || 0) + 1; });
    $("statuses").innerHTML = now.length
      ? '<ul class="ad-statlist">' + order.filter(function (k) { return counts[k]; }).map(function (k) {
          return "<li>" + chip(STATUS[k].label, STATUS[k].tone) + "<b>" + counts[k] + "</b></li>";
        }).join("") + "</ul>"
      : '<p class="ad-muted">No orders in this period yet.</p>';

    $("recentOrders").innerHTML = orders.length
      ? '<div class="ad-list ad-list--compact">' + orders.slice(0, 5).map(orderRow).join("") + "</div>"
      : '<p class="ad-muted">No orders yet. They\'ll appear here as soon as customers check out.</p>';
  }

  // Horizontal bars: one hue, value at the tip, label above
  function bars(rows, emptyText, of) {
    if (!rows.length) return '<p class="ad-muted">' + emptyText + "</p>";
    var max = of || Math.max.apply(null, rows.map(function (x) { return x.value; }));
    return '<ul class="ad-bars">' + rows.map(function (x) {
      var pct = max ? Math.max(2, (x.value / max) * 100) : 0;
      return '<li><div class="ad-bars__top"><span>' + esc(x.label) + "</span><b>" + esc(x.text) + "</b></div>" +
        '<span class="ad-bars__track"><i style="width:' + pct.toFixed(1) + '%"></i></span>' +
        (x.sub ? "<small>" + esc(x.sub) + "</small>" : "") + "</li>";
    }).join("") + "</ul>";
  }

  /* ---------- Sales chart (SVG columns, one series) ---------- */
  var chartData = null;

  function buckets(r, valid) {
    var days = Math.round((r.end - r.start) / DAY);
    var unit = days <= 31 ? "day" : days <= 180 ? "week" : "month";
    var list = [];
    var t = r.start;
    if (unit === "week") { var d = new Date(t); t -= ((d.getDay() + 6) % 7) * DAY; } // weeks start Monday
    if (unit === "month") { var m = new Date(t); m.setDate(1); t = m.getTime(); }
    while (t < r.end) {
      var next;
      if (unit === "day") next = t + DAY;
      else if (unit === "week") next = t + 7 * DAY;
      else { var n = new Date(t); n.setMonth(n.getMonth() + 1); next = n.getTime(); }
      var d0 = new Date(t);
      list.push({
        start: t, end: next, sales: 0, orders: 0,
        label: unit === "month" ? d0.toLocaleString("en-GB", { month: "short", year: "2-digit" }) : d0.toLocaleString("en-GB", { day: "numeric", month: "short" }),
        long: unit === "day" ? d0.toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short" })
          : unit === "week" ? "Week of " + d0.toLocaleString("en-GB", { day: "numeric", month: "short" })
          : d0.toLocaleString("en-GB", { month: "long", year: "numeric" }),
      });
      t = next;
    }
    valid.forEach(function (o) {
      var ts = Date.parse(o.createdAt);
      for (var i = 0; i < list.length; i++) {
        if (ts >= list[i].start && ts < list[i].end) { list[i].sales += o.totals.total; list[i].orders++; break; }
      }
    });
    return { unit: unit, list: list };
  }

  function niceMax(v) {
    if (v <= 0) return 1000;
    var p = Math.pow(10, Math.floor(Math.log10(v)));
    var steps = [1, 2, 2.5, 5, 10];
    for (var i = 0; i < steps.length; i++) if (steps[i] * p >= v) return steps[i] * p;
    return 10 * p;
  }

  function renderSalesChart(r, valid) {
    chartData = buckets(r, valid);
    var total = valid.reduce(function (n, o) { return n + o.totals.total; }, 0);
    $("salesSub").textContent = "LKR per " + chartData.unit + " · " + money(total) + " total";
    $("salesTable").innerHTML =
      '<table class="ad-table"><thead><tr><th scope="col">' + (chartData.unit === "day" ? "Day" : chartData.unit === "week" ? "Week" : "Month") +
      '</th><th scope="col">Orders</th><th scope="col">Sales</th></tr></thead><tbody>' +
      chartData.list.map(function (b) {
        return "<tr><td>" + esc(b.long) + "</td><td>" + b.orders + "</td><td>" + money(b.sales) + "</td></tr>";
      }).join("") + "</tbody></table>";
    drawChart();
  }

  function drawChart() {
    var box = $("salesChart");
    if (!chartData || !box.clientWidth) return;
    var list = chartData.list;
    var max = Math.max.apply(null, list.map(function (b) { return b.sales; }));
    if (!max) {
      box.innerHTML = '<p class="ad-muted ad-chart__empty">No sales in this period yet.</p>';
      return;
    }
    var W = box.clientWidth, H = 240;
    var m = { t: 12, r: 8, b: 28, l: 48 };
    var pw = W - m.l - m.r, ph = H - m.t - m.b;
    var top = niceMax(max);
    var band = pw / list.length;
    var bw = Math.max(2, Math.min(24, band * 0.64));
    var y = function (v) { return m.t + ph - (v / top) * ph; };

    var grid = [0, 0.25, 0.5, 0.75, 1].map(function (f) {
      var v = top * f, yy = y(v).toFixed(1);
      return '<line class="ad-chart__grid" x1="' + m.l + '" x2="' + (W - m.r) + '" y1="' + yy + '" y2="' + yy + '"/>' +
        '<text class="ad-chart__tick" x="' + (m.l - 8) + '" y="' + yy + '" dy="0.32em" text-anchor="end">' + compact(v) + "</text>";
    }).join("");

    // Label every k-th bucket so x labels never collide
    var every = Math.max(1, Math.ceil(list.length / Math.max(1, Math.floor(pw / 64))));
    var cols = list.map(function (b, i) {
      var cx = m.l + band * i + band / 2;
      var out = "";
      if (b.sales > 0) {
        var h = Math.max(2, ph - (y(b.sales) - m.t));
        var x0 = cx - bw / 2, y0 = m.t + ph - h, rr = Math.min(4, bw / 2, h);
        // 4px rounded data end, square at the baseline
        out += '<path class="ad-chart__bar" d="M' + x0.toFixed(1) + "," + (m.t + ph) + "V" + (y0 + rr).toFixed(1) +
          "Q" + x0.toFixed(1) + "," + y0.toFixed(1) + " " + (x0 + rr).toFixed(1) + "," + y0.toFixed(1) +
          "H" + (x0 + bw - rr).toFixed(1) + "Q" + (x0 + bw).toFixed(1) + "," + y0.toFixed(1) + " " + (x0 + bw).toFixed(1) + "," + (y0 + rr).toFixed(1) +
          "V" + (m.t + ph) + 'Z"/>';
      }
      if (i % every === 0) out += '<text class="ad-chart__tick" x="' + cx.toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle">' + esc(b.label) + "</text>";
      return out;
    }).join("");

    box.innerHTML =
      '<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Sales per ' + chartData.unit + ', peak ' + esc(money(max)) + '. Open the table below for exact values.">' +
        grid +
        '<rect class="ad-chart__hover" id="chartHover" x="0" y="' + m.t + '" width="' + band.toFixed(1) + '" height="' + ph + '" visibility="hidden"/>' +
        '<line class="ad-chart__axis" x1="' + m.l + '" x2="' + (W - m.r) + '" y1="' + (m.t + ph) + '" y2="' + (m.t + ph) + '"/>' +
        cols +
      "</svg>" +
      '<div class="ad-tip" id="chartTip" hidden></div>';

    var svg = box.querySelector("svg");
    var tip = $("chartTip");
    var hover = $("chartHover");
    function show(clientX) {
      var rect = svg.getBoundingClientRect();
      var i = Math.floor((clientX - rect.left - m.l) / band);
      if (i < 0 || i >= list.length) { hide(); return; }
      var b = list[i];
      hover.setAttribute("x", (m.l + band * i).toFixed(1));
      hover.setAttribute("visibility", "visible");
      tip.innerHTML = "<b>" + esc(b.long) + "</b><span>" + money(b.sales) + "</span><small>" + b.orders + (b.orders === 1 ? " order" : " orders") + "</small>";
      tip.hidden = false;
      var cx = m.l + band * i + band / 2;
      var left = Math.min(Math.max(cx - tip.offsetWidth / 2, 0), W - tip.offsetWidth);
      tip.style.transform = "translate(" + left.toFixed(0) + "px, 0)";
    }
    function hide() { tip.hidden = true; hover.setAttribute("visibility", "hidden"); }
    svg.addEventListener("pointermove", function (e) { show(e.clientX); });
    svg.addEventListener("pointerdown", function (e) { show(e.clientX); });
    svg.addEventListener("pointerleave", function (e) { if (e.pointerType === "mouse") hide(); });
  }

  if ("ResizeObserver" in window) {
    var lastW = 0;
    new ResizeObserver(function (entries) {
      var w = Math.round(entries[0].contentRect.width);
      if (w !== lastW) { lastW = w; drawChart(); }
    }).observe($("salesChart"));
  }

  document.querySelectorAll('input[name="period"]').forEach(function (r) {
    r.addEventListener("change", function () { period = r.value; renderDashboard(); });
  });
})();
