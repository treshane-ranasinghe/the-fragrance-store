(function () {
  "use strict";

  var STORE = window.STORE || {};
  var accounts = window.TFS.api.account;
  var money = window.TFS.cart.money;
  var $ = function (id) { return document.getElementById(id); };

  // Only allow redirects back to our own pages
  var NEXT_OK = ["checkout.html", "index.html"];
  var next = new URLSearchParams(location.search).get("next");
  if (NEXT_OK.indexOf(next) === -1) next = null;

  // What customers see for each order status
  var STATUS = {
    pending: "Order received",
    confirmed: "Confirmed",
    dispatched: "On its way",
    ready: "Ready to collect",
    delivered: "Delivered",
    cancelled: "Cancelled",
  };
  var PAYMENT = { card: "Card", cod: "Cash on delivery", bank: "Bank transfer" };

  function escapeHtml(str) {
    return String(str == null ? "" : str).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function waLink(msg) { return "https://wa.me/" + STORE.whatsapp + "?text=" + encodeURIComponent(msg); }

  $("year").textContent = new Date().getFullYear();
  document.querySelectorAll(".js-whatsapp").forEach(function (a) {
    a.href = waLink(a.dataset.msg || "Hello!");
    a.target = "_blank";
    a.rel = "noopener";
  });
  $("dDistrict").insertAdjacentHTML("beforeend", (STORE.districts || []).map(function (d) {
    return "<option>" + escapeHtml(d) + "</option>";
  }).join(""));

  // Show / hide password buttons
  document.addEventListener("click", function (e) {
    var t = e.target.closest(".co__pwtoggle");
    if (!t) return;
    var inp = t.parentNode.querySelector("input");
    var show = inp.type === "password";
    inp.type = show ? "text" : "password";
    t.textContent = show ? "Hide" : "Show";
    t.setAttribute("aria-pressed", String(show));
    t.setAttribute("aria-label", show ? "Hide password" : "Show password");
  });

  var toastTimer;
  function toast(msg) {
    var t = $("acToast");
    t.textContent = msg;
    t.classList.add("is-on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove("is-on"); }, 3000);
  }
  function showError(id, msg) { $(id).textContent = msg; $(id).hidden = !msg; }

  function show(view) {
    ["acLoading", "acSignin", "acHome", "acUnavailable"].forEach(function (id) { $(id).hidden = id !== view; });
  }

  /* ---------- Sign in ---------- */
  function showSignin() {
    show("acSignin");
    document.title = "Sign in — The Fragrance Store";
    $("siLogin").focus();
  }

  $("signinForm").addEventListener("submit", function (e) {
    e.preventDefault();
    showError("siError", "");
    var login = $("siLogin").value.trim();
    var pw = $("siPassword").value;
    if (!login || !pw) { showError("siError", "Enter your phone number or email, and your password."); return; }
    var btn = $("siBtn");
    btn.disabled = true;
    btn.textContent = "Signing in…";
    accounts.signIn(login, pw).then(function (me) {
      $("siPassword").value = "";
      if (next) { location.href = next; return; }
      showHome(me);
    }, function (ex) {
      showError("siError", ex.message);
      $("siPassword").select();
    }).then(function () { btn.disabled = false; btn.textContent = "Sign in"; });
  });

  /* ---------- Signed in ---------- */
  var me = null;

  function showHome(account) {
    me = account;
    show("acHome");
    document.title = "My Account — The Fragrance Store";
    $("acName").textContent = me.name.split(" ")[0];
    fillDetails();
    loadOrders();
  }

  function fillDetails() {
    var f = $("detailsForm").elements;
    f.name.value = me.name;
    $("dPhone").value = me.phone;
    f.email.value = me.email || "";
    var a = me.address || {};
    f.address1.value = a.address1 || "";
    f.address2.value = a.address2 || "";
    f.city.value = a.city || "";
    f.district.value = a.district || "";
  }

  function fmtDate(iso) {
    return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  }

  function orderCard(o) {
    var pickup = o.delivery.method === "pickup";
    var steps = pickup
      ? [["pending", "Received"], ["confirmed", "Confirmed"], ["ready", "Ready"], ["delivered", "Collected"]]
      : [["pending", "Received"], ["confirmed", "Confirmed"], ["dispatched", "On its way"], ["delivered", "Delivered"]];
    var at = steps.findIndex(function (s) { return s[0] === o.status; });
    var label = o.status === "delivered" && pickup ? "Collected" : STATUS[o.status] || STATUS.pending;
    var tone = o.status === "delivered" ? "good" : o.status === "cancelled" ? "bad" : "info";

    return (
      '<article class="ac__order">' +
        '<header class="ac__order-head">' +
          "<div><p class=\"ac__ref\">" + escapeHtml(o.ref) + "</p><p class=\"ac__date\">" + fmtDate(o.createdAt) + "</p></div>" +
          '<span class="ac__status ac__status--' + tone + '">' + escapeHtml(label) + "</span>" +
        "</header>" +
        (o.status === "cancelled" ? "" :
          '<ol class="ac__steps" aria-label="Order progress">' + steps.map(function (s, i) {
            return '<li class="' + (i < at ? "is-done" : i === at ? "is-now" : "") + '"' + (i === at ? ' aria-current="step"' : "") + "><span>" + s[1] + "</span></li>";
          }).join("") + "</ol>") +
        '<ul class="ac__items">' + o.items.map(function (i) {
          var p = (window.PRODUCTS || []).find(function (x) { return x.id === i.id; });
          return "<li>" +
            '<div class="ac__thumb">' + (p ? '<img src="' + escapeHtml(window.TFS.img(p)) + '" alt="" loading="lazy" onerror="imgFallback(this)" />' : "") + "</div>" +
            "<span>" + escapeHtml(i.name) + "<small>" + i.ml + " ml · Qty " + i.qty + "</small></span>" +
            "<b>" + money(i.price * i.qty) + "</b></li>";
        }).join("") + "</ul>" +
        '<footer class="ac__order-foot">' +
          "<span>" + escapeHtml(PAYMENT[o.payment.method]) + (o.payment.paid ? " · Paid" : "") + " · " +
            (pickup ? "Boutique pickup" : escapeHtml(o.delivery.city)) + "</span>" +
          "<b>" + money(o.totals.total) + "</b>" +
        "</footer>" +
        '<a class="co__link ac__help" target="_blank" rel="noopener" href="' + escapeHtml(waLink("Hello, I have a question about my order " + o.ref + ".")) + '">Question about this order?</a>' +
      "</article>"
    );
  }

  function loadOrders() {
    $("acOrders").innerHTML = '<p class="ac__small">Loading your orders…</p>';
    accounts.orders().then(function (list) {
      $("acOrders").innerHTML = list.length
        ? list.map(orderCard).join("")
        : '<div class="ac__empty"><p>No orders yet.</p><a href="index.html#signatures" class="btn btn--ghost btn--sm">Explore the Signatures</a></div>';
    }, handleError);
  }

  function handleError(ex) {
    if (ex.status === 401) { showSignin(); showError("siError", "Please sign in again."); return; }
    toast(ex.message);
  }

  $("detailsForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var f = this.elements;
    showError("dError", "");
    if (!f.name.value.trim()) { showError("dError", "Please enter your name."); f.name.focus(); return; }
    var btn = $("dSave");
    btn.disabled = true;
    accounts.update({
      name: f.name.value,
      email: f.email.value,
      address: { address1: f.address1.value, address2: f.address2.value, city: f.city.value, district: f.district.value },
    }).then(function (updated) {
      me = updated;
      $("acName").textContent = me.name.split(" ")[0];
      fillDetails();
      toast("Your details are saved");
    }, function (ex) {
      if (ex.status === 401) handleError(ex); else showError("dError", ex.message);
    }).then(function () { btn.disabled = false; });
  });

  $("pwForm").addEventListener("submit", function (e) {
    e.preventDefault();
    showError("pError", "");
    var cur = $("pCurrent").value, nw = $("pNew").value;
    if (!cur) { showError("pError", "Enter your current password."); $("pCurrent").focus(); return; }
    if (nw.length < 8) { showError("pError", "Choose a new password of at least 8 characters."); $("pNew").focus(); return; }
    var btn = $("pSave");
    btn.disabled = true;
    accounts.update({ currentPassword: cur, newPassword: nw }).then(function () {
      $("pCurrent").value = "";
      $("pNew").value = "";
      toast("Password updated");
    }, function (ex) {
      if (ex.status === 401) handleError(ex); else showError("pError", ex.message);
    }).then(function () { btn.disabled = false; });
  });

  $("acSignOut").addEventListener("click", function () {
    accounts.signOut().then(function () { me = null; showSignin(); toast("You're signed out"); });
  });

  /* ---------- Boot ---------- */
  if (!accounts.available) {
    show("acUnavailable");
  } else {
    accounts.me().then(function (account) {
      if (account && next) { location.href = next; return; }
      if (account) showHome(account); else showSignin();
    });
  }
})();
