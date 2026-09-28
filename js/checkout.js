(function () {
  "use strict";

  var STORE = window.STORE || {};
  var cart = window.TFS.cart;
  var api = window.TFS.api;
  var accounts = api.account;
  var money = cart.money;
  var CUSTOMER_KEY = "tfs-customer";

  var DISTRICTS = STORE.districts || [];

  var PAYMENT_LABELS = { card: "Paid online (card)", cod: "Cash on delivery", bank: "Bank transfer" };

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function waLink(msg) {
    return "https://wa.me/" + STORE.whatsapp + "?text=" + encodeURIComponent(msg);
  }

  var form = document.getElementById("coForm");
  var main = document.getElementById("coMain");
  var empty = document.getElementById("coEmpty");
  var done = document.getElementById("coDone");
  var submitBtn = document.getElementById("coSubmit");
  var errorBox = document.getElementById("coError");
  var codInput = form.querySelector('input[name="payment"][value="cod"]');

  document.getElementById("year").textContent = new Date().getFullYear();
  document.querySelectorAll(".js-whatsapp").forEach(function (a) {
    a.href = waLink(a.dataset.msg || "Hello!");
    a.target = "_blank";
    a.rel = "noopener";
  });

  document.getElementById("fDistrict").insertAdjacentHTML("beforeend", DISTRICTS.map(function (d) {
    return "<option>" + d + "</option>";
  }).join(""));
  if (!STORE.pickup) document.getElementById("coPickupChoice").remove();

  /* ---------- Form state ---------- */
  function val(name) {
    var el = form.elements[name];
    return el ? String(el.value).trim() : "";
  }
  function choice() {
    return { fulfilment: val("fulfilment") || "delivery", payment: val("payment") || "card" };
  }

  // Accepts 0771234567, 077 123 4567, +94 77 123 4567, 94771234567
  function normalisePhone(raw) {
    var digits = raw.replace(/[\s\-()]/g, "");
    var m = digits.match(/^(?:\+94|94|0)(\d{9})$/);
    return m ? "+94" + m[1] : null;
  }

  /* ---------- Summary + options ---------- */
  function renderSummary() {
    var lines = cart.lines();
    var c = choice();
    var pickup = c.fulfilment === "pickup";

    // COD is not offered above the limit
    var preTotal = cart.totals({ fulfilment: c.fulfilment, payment: "cod" }).total;
    var codBlocked = STORE.codLimit > 0 && preTotal > STORE.codLimit;
    codInput.disabled = codBlocked;
    if (codBlocked && codInput.checked) form.querySelector('input[name="payment"][value="card"]').checked = true;
    c = choice();

    var t = cart.totals(c);

    document.getElementById("coDeliveryFee").textContent = t.freeDelivery ? "Free" : money(STORE.deliveryFee || 0);
    document.getElementById("coCodTitle").textContent = pickup ? "Pay at the boutique" : "Cash on delivery";
    document.getElementById("coCodFee").textContent = !pickup && STORE.codFee ? "+ " + money(STORE.codFee) : "";
    document.getElementById("coCodSub").textContent = codBlocked
      ? "Available on orders up to " + money(STORE.codLimit)
      : pickup ? "Cash or card when you collect" : "Pay in cash when your order arrives";

    // Address is only needed for delivery (hidden fields are skipped by validation)
    document.getElementById("coAddress").hidden = pickup;

    var notes = {
      card: "You'll be taken to PayHere's secure page to complete your payment.",
      cod: pickup ? "We'll message you when your order is ready to collect." : "We'll call to confirm your order before dispatch. Please keep the exact amount ready.",
      bank: "Our bank details will appear after you place your order. We'll hold your fragrance for 48 hours.",
    };
    document.getElementById("coPayNote").textContent = notes[c.payment];

    document.getElementById("coItems").innerHTML = lines.map(function (l) {
      var p = l.product;
      return (
        '<li class="co__item">' +
          '<div class="co__thumb"><img src="' + escapeHtml(window.TFS.img(p)) + '" alt="" onerror="imgFallback(this)" /><b>' + l.qty + "</b></div>" +
          '<div class="co__iteminfo"><p class="co__itemhouse">' + escapeHtml(p.house) + '</p><p class="co__itemname">' + escapeHtml(p.name) + '</p><p class="co__itemmeta">' + l.ml + " ml</p></div>" +
          '<p class="co__itemprice">' + money(l.total) + "</p>" +
        "</li>"
      );
    }).join("");

    document.getElementById("coTotals").innerHTML =
      row("Subtotal", money(t.subtotal)) +
      row(pickup ? "Boutique collection" : "Delivery", t.delivery ? money(t.delivery) : "Free") +
      (t.cod ? row("Cash on delivery fee", money(t.cod)) : "") +
      '<div class="co__total"><dt>Total</dt><dd>' + money(t.total) + "</dd></div>";

    submitBtn.textContent = c.payment === "card" ? "Pay " + money(t.total) : "Place order · " + money(t.total);
  }
  function row(k, v) { return "<div><dt>" + k + "</dt><dd>" + v + "</dd></div>"; }

  /* ---------- Validation ---------- */
  var checks = {
    name: function (v) { return v.length >= 2; },
    phone: function (v) { return !!normalisePhone(v); },
    email: function (v) { return !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); },
    address1: function (v) { return v.length >= 3; },
    city: function (v) { return v.length >= 2; },
    district: function (v) { return !!v; },
  };

  function checkField(el) {
    var fn = checks[el.name];
    if (!fn || el.closest("[hidden]")) return true;
    var ok = fn(el.value.trim());
    var field = el.closest(".field");
    field.classList.toggle("is-invalid", !ok);
    el.setAttribute("aria-invalid", String(!ok));
    var err = field.querySelector(".field__err");
    if (err) {
      if (!ok) el.setAttribute("aria-describedby", err.id);
      else el.removeAttribute("aria-describedby");
    }
    return ok;
  }

  // Validate once someone leaves a field, then live while they fix it
  form.addEventListener("focusout", function (e) {
    if (checks[e.target.name] && e.target.value) { e.target.dataset.touched = "1"; checkField(e.target); }
  });
  form.addEventListener("input", function (e) {
    if (e.target.dataset.touched || e.target.closest(".is-invalid")) checkField(e.target);
  });
  form.addEventListener("change", function (e) {
    if (e.target.name === "fulfilment" || e.target.name === "payment") renderSummary();
    else if (checks[e.target.name]) checkField(e.target);
  });

  /* ---------- Returning customers ---------- */
  function fill(values) {
    Object.keys(values).forEach(function (k) { if (form.elements[k] && values[k]) form.elements[k].value = values[k]; });
  }
  try {
    var saved = JSON.parse(localStorage.getItem(CUSTOMER_KEY));
    if (saved) fill(saved);
  } catch (e) {}

  // Signed in: use the account's details. Otherwise offer sign-in, but never require it.
  var accountBar = document.getElementById("coAccount");
  accounts.me().then(function (me) {
    if (me) {
      fill({ name: me.name, phone: me.phone.replace(/^\+94/, "0"), email: me.email });
      if (me.address) fill(me.address);
      accountBar.innerHTML = "Signed in as <b>" + escapeHtml(me.name) + '</b> · <button type="button" class="co__link" id="coSignOut">Not you? Sign out</button>';
      accountBar.hidden = false;
      document.getElementById("coSignOut").addEventListener("click", function () {
        accounts.signOut().then(function () { location.reload(); });
      });
    } else if (accounts.available) {
      accountBar.innerHTML = 'Returning customer? <a class="co__link" href="account.html?next=checkout.html">Sign in</a> for faster checkout — or simply continue as a guest.';
      accountBar.hidden = false;
    }
  });

  /* ---------- Submit ---------- */
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    errorBox.hidden = true;

    var firstBad = null;
    Array.prototype.forEach.call(form.elements, function (el) {
      if (!checkField(el) && !firstBad) firstBad = el;
    });
    if (firstBad) { firstBad.focus(); return; }
    if (!cart.lines().length) { showEmpty(); return; }

    var c = choice();
    var t = cart.totals(c);
    var customer = { name: val("name"), phone: normalisePhone(val("phone")), email: val("email") || null };
    var delivery = c.fulfilment === "pickup"
      ? { method: "pickup" }
      : { method: "delivery", address1: val("address1"), address2: val("address2") || null, city: val("city"), district: val("district") };
    var order = {
      customer: customer,
      delivery: delivery,
      notes: val("notes") || null,
      payment: { method: c.payment },
      items: cart.lines().map(function (l) {
        return { id: l.id, name: l.product.house + " " + l.product.name, ml: l.ml, qty: l.qty, price: l.price };
      }),
      totals: { subtotal: t.subtotal, delivery: t.delivery, cod: t.cod, total: t.total },
    };

    try {
      localStorage.setItem(CUSTOMER_KEY, JSON.stringify({
        name: val("name"), phone: val("phone"), email: val("email"),
        address1: val("address1"), address2: val("address2"), city: val("city"), district: val("district"),
      }));
    } catch (err) {}

    submitBtn.disabled = true;
    submitBtn.classList.add("is-busy");
    submitBtn.textContent = c.payment === "card" ? "Connecting to payment…" : "Placing your order…";

    api.placeOrder(order)
      .then(function (saved) {
        if (c.payment !== "card") return { order: saved };
        // Real gateway: this redirects to PayHere and the customer returns to ?order=<ref>
        return api.startOnlinePayment(saved).then(function () { return { order: saved }; });
      })
      .then(function (res) {
        cart.clear();
        history.replaceState(null, "", "checkout.html?order=" + encodeURIComponent(res.order.ref));
        showDone(res.order, res.order);
      })
      .catch(function (ex) {
        errorBox.textContent = (ex && ex.message ? ex.message + " " : "We couldn't place your order. ") +
          "If it keeps happening, message us on WhatsApp.";
        errorBox.hidden = false;
        submitBtn.disabled = false;
        submitBtn.classList.remove("is-busy");
        renderSummary();
      });
  });

  /* ---------- Confirmation ---------- */
  function orderMessage(o) {
    var lines = ["Hello, I've placed order " + o.ref + ":"];
    o.items.forEach(function (i) { lines.push("• " + i.qty + " × " + i.name + " " + i.ml + "ml"); });
    lines.push("Total: " + money(o.totals.total));
    lines.push("Payment: " + PAYMENT_LABELS[o.payment.method]);
    lines.push(o.delivery.method === "pickup" ? "Collecting from the boutique" :
      "Deliver to: " + [o.delivery.address1, o.delivery.address2, o.delivery.city, o.delivery.district].filter(Boolean).join(", "));
    lines.push("Name: " + o.customer.name + " (" + o.customer.phone + ")");
    return lines.join("\n");
  }

  /* Optional account, offered only right after a guest order */
  function accountOffer(o, placed) {
    if (!placed || !accounts.available) return "";
    if (placed.signedIn) {
      return '<div class="co__offer co__offer--done"><p>This order is saved in your account. <a class="co__link" href="account.html">View my orders</a></p></div>';
    }
    if (placed.accountExists) {
      return '<div class="co__offer co__offer--done"><p>You already have an account for ' + escapeHtml(o.customer.phone) +
        '. <a class="co__link" href="account.html">Sign in</a> next time and your orders will be saved there.</p></div>';
    }
    if (!placed.claimToken) return "";
    return (
      '<form class="co__offer" id="claimForm" data-ref="' + escapeHtml(o.ref) + '" data-token="' + escapeHtml(placed.claimToken) + '" novalidate>' +
        "<h2>Save your details for next time?</h2>" +
        "<p>Choose a password to track this order and check out faster next time. You'll sign in with <b>" + escapeHtml(o.customer.phone) + "</b>.</p>" +
        '<div class="co__offer-row">' +
          '<div class="field"><label for="claimPw" class="sr-only">Choose a password</label>' +
            '<div class="co__pw"><input id="claimPw" type="password" autocomplete="new-password" minlength="8" placeholder="Password, 8+ characters" />' +
            '<button type="button" class="co__pwtoggle" aria-label="Show password" aria-pressed="false">Show</button></div></div>' +
          '<button type="submit" class="btn btn--gold">Create account</button>' +
        "</div>" +
        '<p class="co__error" role="alert" hidden></p>' +
        '<button type="button" class="co__link co__dismiss">No thanks</button>' +
      "</form>"
    );
  }

  done.addEventListener("click", function (e) {
    var form = e.target.closest("#claimForm");
    if (!form) return;
    if (e.target.closest(".co__dismiss")) { form.remove(); return; }
    var t = e.target.closest(".co__pwtoggle");
    if (t) {
      var inp = form.querySelector("#claimPw");
      var show = inp.type === "password";
      inp.type = show ? "text" : "password";
      t.textContent = show ? "Hide" : "Show";
      t.setAttribute("aria-pressed", String(show));
      t.setAttribute("aria-label", show ? "Hide password" : "Show password");
    }
  });
  done.addEventListener("submit", function (e) {
    var form = e.target.closest("#claimForm");
    if (!form) return;
    e.preventDefault();
    var pw = form.querySelector("#claimPw").value;
    var err = form.querySelector(".co__error");
    var btn = form.querySelector('button[type="submit"]');
    err.hidden = true;
    if (pw.length < 8) {
      err.textContent = "Choose a password of at least 8 characters.";
      err.hidden = false;
      form.querySelector("#claimPw").focus();
      return;
    }
    btn.disabled = true;
    btn.textContent = "Creating…";
    accounts.claim(form.dataset.ref, form.dataset.token, pw).then(function (me) {
      form.outerHTML = '<div class="co__offer co__offer--done" tabindex="-1" id="claimDone"><h2>You\'re all set, ' + escapeHtml(me.name.split(" ")[0]) +
        '</h2><p>Your account is ready and you\'re signed in. <a class="co__link" href="account.html">View my account</a></p></div>';
      document.getElementById("claimDone").focus();
    }, function (ex) {
      err.textContent = ex.message;
      err.hidden = false;
      btn.disabled = false;
      btn.textContent = "Create account";
    });
  });

  function showDone(o, placed) {
    var first = o.customer.name.split(" ")[0];
    var pickup = o.delivery.method === "pickup";
    var method = o.payment.method;
    var next;

    if (method === "card" && !o.payment.paid) {
      next = '<div class="co__notice"><h3>Online payment is not live yet</h3><p>No charge was made. We\'ve reserved your order and will contact you on ' +
        escapeHtml(o.customer.phone) + " to complete payment.</p></div>";
    } else if (method === "card") {
      next = "<p>Your payment was received. A receipt is on its way" + (o.customer.email ? " to " + escapeHtml(o.customer.email) : "") + ".</p>";
    } else if (method === "bank") {
      var b = STORE.bank || {};
      next =
        '<div class="co__notice"><h3>Complete your bank transfer</h3>' +
        "<p>Transfer <b>" + money(o.totals.total) + "</b> using <b>" + escapeHtml(o.ref) + "</b> as the reference, then send us the slip on WhatsApp.</p>" +
        '<dl class="co__bank">' +
          row("Bank", escapeHtml(b.name || "")) + row("Branch", escapeHtml(b.branch || "")) +
          row("Account name", escapeHtml(b.accountName || "")) + row("Account no.", escapeHtml(b.accountNumber || "")) +
        "</dl></div>";
    } else {
      next = "<p>" + (pickup
        ? "We'll message you when it's ready to collect. Pay at the boutique."
        : "We'll call " + escapeHtml(o.customer.phone) + " to confirm, then dispatch within 1 working day. Please have <b>" + money(o.totals.total) + "</b> ready in cash.") + "</p>";
    }

    done.innerHTML =
      '<div class="co__done-inner">' +
        '<span class="co__tick" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span>' +
        '<p class="eyebrow">Order ' + escapeHtml(o.ref) + "</p>" +
        '<h1 class="section__title">Thank you, <em>' + escapeHtml(first) + "</em></h1>" +
        next +
        accountOffer(o, placed) +
        '<div class="co__recap">' +
          "<ul>" + o.items.map(function (i) {
            return "<li><span>" + i.qty + " × " + escapeHtml(i.name) + " <small>" + i.ml + " ml</small></span><span>" + money(i.price * i.qty) + "</span></li>";
          }).join("") + "</ul>" +
          '<dl class="co__totals">' +
            row("Subtotal", money(o.totals.subtotal)) +
            row(pickup ? "Boutique collection" : "Delivery", o.totals.delivery ? money(o.totals.delivery) : "Free") +
            (o.totals.cod ? row("Cash on delivery fee", money(o.totals.cod)) : "") +
            '<div class="co__total"><dt>Total</dt><dd>' + money(o.totals.total) + "</dd></div>" +
          "</dl>" +
          '<p class="co__recap-meta"><b>' + (pickup ? "Collection" : "Delivering to") + "</b> " +
            (pickup ? "The Fragrance Store boutique, Colombo" : escapeHtml([o.delivery.address1, o.delivery.address2, o.delivery.city, o.delivery.district].filter(Boolean).join(", "))) +
            "<br /><b>Payment</b> " + PAYMENT_LABELS[method] + "</p>" +
        "</div>" +
        '<div class="co__done-cta">' +
          '<a class="btn btn--gold" target="_blank" rel="noopener" href="' + escapeHtml(waLink(orderMessage(o))) + '">Send order on WhatsApp</a>' +
          '<a class="btn btn--ghost" href="index.html#signatures">Continue shopping</a>' +
        "</div>" +
      "</div>";

    main.hidden = true;
    empty.hidden = true;
    done.hidden = false;
    window.scrollTo(0, 0);
    done.focus({ preventScroll: true });
  }

  function showEmpty() {
    main.hidden = true;
    done.hidden = true;
    empty.hidden = false;
  }

  /* ---------- Boot ---------- */
  var ref = new URLSearchParams(location.search).get("order");
  if (ref) {
    api.getOrder(ref).then(function (o) {
      if (o) showDone(o);
      else if (cart.lines().length) { main.hidden = false; renderSummary(); }
      else showEmpty();
    });
  } else if (!cart.lines().length) {
    showEmpty();
  } else {
    main.hidden = false;
    renderSummary();
  }

  // Bag edited in another tab
  cart.onChange(function () {
    if (!done.hidden) return;
    if (!cart.lines().length) showEmpty();
    else { main.hidden = false; empty.hidden = true; renderSummary(); }
  });
})();
