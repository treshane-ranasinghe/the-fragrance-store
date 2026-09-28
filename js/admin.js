(function () {
  "use strict";

  var STORE = window.STORE || {};
  var api = window.TFS.api;
  var admin = api.admin;
  var TAG_LABELS = { him: "For Him", her: "For Her", arabian: "Arabian" };
  var IMAGE_MAX = 900; // px, longest side of uploaded images

  var $ = function (id) { return document.getElementById(id); };
  var products = [];
  var view = { q: "", stock: "all" };

  function escapeHtml(str) {
    return String(str == null ? "" : str).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function money(n) {
    return (STORE.currency || "LKR") + " " + Math.round(n).toLocaleString("en-US");
  }
  function slugify(s) {
    return String(s).toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
      .replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  }

  /* ---------- Toast ---------- */
  var toastTimer;
  function toast(msg, isError) {
    var t = $("toast");
    t.textContent = msg;
    t.classList.toggle("is-error", !!isError);
    t.classList.add("is-on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove("is-on"); }, 3200);
  }

  /* ---------- Confirm dialog ---------- */
  function confirmDialog(opts) {
    var dlg = $("confirm");
    $("confirmTitle").textContent = opts.title;
    $("confirmBody").innerHTML = opts.body || "";
    $("confirmOk").textContent = opts.ok || "Confirm";
    $("confirmOk").className = "ad-btn " + (opts.danger === false ? "ad-btn--gold" : "ad-btn--danger");
    $("confirmCancel").hidden = opts.cancel === false;
    return new Promise(function (resolve) {
      dlg.addEventListener("close", function onClose() {
        dlg.removeEventListener("close", onClose);
        resolve(dlg.returnValue === "ok");
      });
      dlg.returnValue = "cancel";
      dlg.showModal();
    });
  }

  // Session expired (or server restarted): back to the sign-in screen
  function fail(ex) {
    if (ex && ex.status === 401) {
      closeEditor(true);
      showLogin("Your session has ended. Please sign in again.");
    } else {
      toast(ex.message, true);
    }
  }

  /* ==========================================================================
     Sign in
     ========================================================================== */
  function showLogin(message) {
    $("app").hidden = true;
    $("login").hidden = false;
    $("loginError").textContent = message || "";
    $("loginError").hidden = !message;
    if (!admin.available) {
      $("loginError").innerHTML = "The admin needs the store server. In the project folder run <code>npm start</code>, then open <code>http://localhost:3000/admin.html</code>.";
      $("loginError").hidden = false;
      $("loginBtn").disabled = true;
      return;
    }
    $("loginEmail").focus();
  }

  function showApp(session) {
    $("login").hidden = true;
    $("app").hidden = false;
    $("userEmail").textContent = session.email;
    admin.listProducts().then(function (list) { products = list; render(); }, fail);
    route();
  }

  /* ---------- Tabs: #dashboard, #orders, #products ---------- */
  var VIEWS = ["dashboard", "orders", "products"];
  var views = {}; // show() hooks registered by other admin scripts

  function route() {
    if ($("app").hidden) return;
    var name = location.hash.slice(1);
    if (VIEWS.indexOf(name) === -1) name = "dashboard";
    VIEWS.forEach(function (v) { $("view-" + v).hidden = v !== name; });
    document.querySelectorAll(".ad-top__nav a").forEach(function (a) {
      var on = a.dataset.view === name;
      a.classList.toggle("is-active", on);
      if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
    document.title = name.charAt(0).toUpperCase() + name.slice(1) + " — Admin — The Fragrance Store";
    if (views[name]) views[name]();
    window.scrollTo(0, 0);
  }
  window.addEventListener("hashchange", route);

  $("loginForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var err = $("loginError");
    var btn = $("loginBtn");
    err.hidden = true;
    if (!$("loginEmail").value.trim() || !$("loginPassword").value) {
      err.textContent = "Enter your email and password.";
      err.hidden = false;
      return;
    }
    btn.disabled = true;
    btn.textContent = "Signing in…";
    admin.signIn($("loginEmail").value, $("loginPassword").value)
      .then(function (s) { $("loginPassword").value = ""; showApp(s); })
      .catch(function (ex) {
        err.textContent = ex.message;
        err.hidden = false;
        $("loginPassword").select();
      })
      .then(function () { btn.disabled = false; btn.textContent = "Sign in"; });
  });

  $("pwToggle").addEventListener("click", function () {
    var inp = $("loginPassword");
    var show = inp.type === "password";
    inp.type = show ? "text" : "password";
    this.textContent = show ? "Hide" : "Show";
    this.setAttribute("aria-pressed", String(show));
    this.setAttribute("aria-label", show ? "Hide password" : "Show password");
  });

  $("signOut").addEventListener("click", function () {
    admin.signOut().then(showLogin);
  });

  /* ==========================================================================
     Product list
     ========================================================================== */
  function priceRange(p) {
    var prices = (p.sizes || []).map(function (s) { return s.price; }).filter(function (x) { return x != null; });
    if (!prices.length) return "Price on request";
    var lo = Math.min.apply(null, prices), hi = Math.max.apply(null, prices);
    return lo === hi ? money(lo) : money(lo) + " – " + Math.round(hi).toLocaleString("en-US");
  }

  function visible() {
    var words = view.q.toLowerCase().split(/\s+/).filter(Boolean);
    return products.filter(function (p) {
      var text = [p.house, p.name, p.type, p.id, p.badge].join(" ").toLowerCase();
      var stockOk = view.stock === "all" || (view.stock === "in") === (p.inStock !== false);
      return stockOk && words.every(function (w) { return text.indexOf(w) > -1; });
    });
  }

  function render() {
    var list = visible();
    var sold = products.filter(function (p) { return p.inStock === false; }).length;
    $("productStats").textContent = products.length + (products.length === 1 ? " product" : " products") +
      (sold ? " · " + sold + " sold out" : "");

    // Reordering only makes sense on the full, unfiltered list
    var canMove = !view.q && view.stock === "all";

    if (!products.length) {
      $("list").innerHTML = '<div class="ad-empty"><p class="ad-empty__title">No products yet</p><p>Add your first fragrance to start selling.</p></div>';
      return;
    }
    if (!list.length) {
      $("list").innerHTML = '<div class="ad-empty"><p class="ad-empty__title">No matches</p><p>Try a different search or filter.</p></div>';
      return;
    }

    $("list").innerHTML = list.map(function (p) {
      var i = products.indexOf(p);
      var sizes = (p.sizes || []).map(function (s) { return s.ml + " ml"; }).join(" · ");
      var inStock = p.inStock !== false;
      return (
        '<article class="ad-row' + (inStock ? "" : " is-out") + '" data-id="' + escapeHtml(p.id) + '">' +
          '<div class="ad-row__img"><img src="' + escapeHtml(window.TFS.img(p)) + '" alt="" loading="lazy" onerror="imgFallback(this)" /></div>' +
          '<div class="ad-row__main">' +
            '<p class="ad-row__house">' + escapeHtml(p.house) + (p.badge ? ' <span class="ad-chip ad-chip--gold">' + escapeHtml(p.badge) + "</span>" : "") + "</p>" +
            '<h2 class="ad-row__name"><button type="button" data-edit>' + escapeHtml(p.name) + "</button></h2>" +
            '<p class="ad-row__meta">' + escapeHtml(p.type) + (p.tags || []).map(function (t) {
              return ' <span class="ad-chip">' + escapeHtml(TAG_LABELS[t] || t) + "</span>";
            }).join("") + "</p>" +
          "</div>" +
          '<div class="ad-row__price"><b>' + escapeHtml(priceRange(p)) + "</b><span>" + escapeHtml(sizes || "No sizes") + "</span></div>" +
          '<label class="ad-switch ad-switch--sm" title="In stock">' +
            '<input type="checkbox" data-stock' + (inStock ? " checked" : "") + ' aria-label="In stock: ' + escapeHtml(p.name) + '" />' +
            '<span class="ad-switch__track" aria-hidden="true"></span>' +
            '<span class="ad-row__stock">' + (inStock ? "In stock" : "Sold out") + "</span>" +
          "</label>" +
          '<div class="ad-row__actions">' +
            (canMove
              ? '<button type="button" class="ad-icon" data-move="-1" aria-label="Move ' + escapeHtml(p.name) + ' up"' + (i === 0 ? " disabled" : "") + '><svg viewBox="0 0 24 24"><path d="M6 15l6-6 6 6"/></svg></button>' +
                '<button type="button" class="ad-icon" data-move="1" aria-label="Move ' + escapeHtml(p.name) + ' down"' + (i === products.length - 1 ? " disabled" : "") + '><svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg></button>'
              : "") +
            '<button type="button" class="ad-icon" data-edit aria-label="Edit ' + escapeHtml(p.name) + '"><svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16zM14 6l4 4"/></svg></button>' +
            '<button type="button" class="ad-icon ad-icon--danger" data-delete aria-label="Delete ' + escapeHtml(p.name) + '"><svg viewBox="0 0 24 24"><path d="M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13"/></svg></button>' +
          "</div>" +
        "</article>"
      );
    }).join("");
  }

  function byId(id) { return products.find(function (p) { return p.id === id; }); }

  $("list").addEventListener("click", function (e) {
    var row = e.target.closest(".ad-row");
    if (!row) return;
    var p = byId(row.dataset.id);
    if (e.target.closest("[data-edit]")) openEditor(p);
    else if (e.target.closest("[data-delete]")) removeProduct(p);
    else if (e.target.closest("[data-move]")) move(p, +e.target.closest("[data-move]").dataset.move);
  });

  $("list").addEventListener("change", function (e) {
    if (!e.target.matches("[data-stock]")) return;
    var p = byId(e.target.closest(".ad-row").dataset.id);
    var next = Object.assign({}, p, { inStock: e.target.checked });
    admin.saveProduct(next, false)
      .then(function () { return admin.listProducts(); })
      .then(function (list) {
        products = list;
        render();
        toast(p.name + (next.inStock ? " is back in stock" : " marked as sold out"));
      })
      .catch(function (ex) { render(); fail(ex); });
  });

  function move(p, dir) {
    var ids = products.map(function (x) { return x.id; });
    var i = ids.indexOf(p.id), j = i + dir;
    if (j < 0 || j >= ids.length) return;
    ids.splice(j, 0, ids.splice(i, 1)[0]);
    admin.reorder(ids).then(function (list) {
      products = list;
      render();
      var btn = document.querySelector('.ad-row[data-id="' + CSS.escape(p.id) + '"] [data-move="' + dir + '"]');
      if (btn && !btn.disabled) btn.focus();
    }, fail);
  }

  function removeProduct(p) {
    return confirmDialog({
      title: "Delete " + p.name + "?",
      body: "<p>" + escapeHtml(p.house + " " + p.name) + " will be removed from the store. This can't be undone.</p>",
      ok: "Delete product",
    }).then(function (ok) {
      if (!ok) return false;
      return admin.deleteProduct(p.id)
        .then(function (list) {
          products = list;
          render();
          toast(p.name + " deleted");
          return true;
        }, function (ex) { fail(ex); return false; });
    });
  }

  var searchTimer;
  $("adSearch").addEventListener("input", function (e) {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(function () { view.q = e.target.value.trim(); render(); }, 120);
  });
  document.querySelectorAll('input[name="stock"]').forEach(function (r) {
    r.addEventListener("change", function () { view.stock = r.value; render(); });
  });

  /* ==========================================================================
     Editor
     ========================================================================== */
  var editor = $("editor");
  var form = $("editorForm");
  var editing = null;     // { originalId, image: current path | new data: URL | null = none }
  var idTouched = false;
  var snapshot = "";
  var lastFocus = null;

  function sizeRow(s) {
    return (
      '<div class="ad-size">' +
        '<div class="field"><label>Size (ml)</label><input type="number" inputmode="numeric" min="1" step="1" data-ml value="' + (s && s.ml != null ? s.ml : "") + '" /></div>' +
        '<div class="field"><label>Price (' + escapeHtml(STORE.currency || "LKR") + ')</label><input type="number" inputmode="numeric" min="0" step="50" data-price placeholder="On request" value="' + (s && s.price != null ? s.price : "") + '" /></div>' +
        '<button type="button" class="ad-icon ad-icon--danger" data-remove-size aria-label="Remove size"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button>' +
      "</div>"
    );
  }

  function paintImage() {
    var src = editing.image || (editing.originalId ? "images/products/" + editing.originalId + ".jpg" : "");
    $("imgPreview").innerHTML = src
      ? '<img src="' + escapeHtml(src) + '" alt="" onerror="imgFallback(this)" />'
      : '<span>No image</span>';
    $("imgRemove").hidden = !editing.image;
    var id = form.elements.id.value || "product-id";
    $("imgHint").textContent = !editing.image
      ? "No upload — the store uses images/products/" + id + ".jpg if it exists."
      : editing.image.indexOf("data:") === 0 ? "New image — it's saved when you save the product." : "Uploaded image.";
  }

  function serialize() {
    return JSON.stringify([Array.from(new FormData(form).entries()), collectSizes(), editing && editing.image]);
  }

  function openEditor(p) {
    lastFocus = document.activeElement;
    var isNew = !p;
    p = p || { id: "", house: "", name: "", type: "Eau de Parfum", tags: [], badge: null, description: "", notes: { top: "", heart: "", base: "" }, sizes: [{ ml: 100, price: null }], inStock: true };
    editing = { originalId: isNew ? null : p.id, image: p.image || null };
    idTouched = !isNew;

    form.reset();
    form.querySelectorAll(".is-invalid").forEach(function (el) { el.classList.remove("is-invalid"); });
    $("editorTitle").textContent = isNew ? "Add product" : "Edit product";
    $("saveBtn").textContent = isNew ? "Add product" : "Save changes";
    $("deleteBtn").hidden = isNew;

    var el = form.elements;
    el.house.value = p.house || "";
    el.name.value = p.name || "";
    el.type.value = p.type || "";
    el.badge.value = p.badge || "";
    el.id.value = p.id || "";
    el.id.readOnly = !isNew;  // the ID is the image filename + link, so it's fixed once created
    $("eIdNote").textContent = isNew ? "used in links and as the image filename" : "can't be changed after creation";
    el.description.value = p.description || "";
    el.top.value = (p.notes && p.notes.top) || "";
    el.heart.value = (p.notes && p.notes.heart) || "";
    el.base.value = (p.notes && p.notes.base) || "";
    el.inStock.checked = p.inStock !== false;
    form.querySelectorAll('input[name="tags"]').forEach(function (c) { c.checked = (p.tags || []).indexOf(c.value) > -1; });
    $("sizes").innerHTML = (p.sizes && p.sizes.length ? p.sizes : [{}]).map(sizeRow).join("");
    $("sizesErr").style.display = "";

    // Brand suggestions from the existing catalogue
    $("houseList").innerHTML = Array.from(new Set(products.map(function (x) { return x.house; }))).map(function (h) {
      return "<option>" + escapeHtml(h) + "</option>";
    }).join("");

    paintImage();
    editor.classList.add("is-open");
    editor.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    form.querySelector(".ad-sheet__body").scrollTop = 0;
    snapshot = serialize();
    setTimeout(function () { el.house.focus({ preventScroll: true }); }, 60);
  }

  function closeEditor(force) {
    if (!editor.classList.contains("is-open")) return Promise.resolve();
    var go = force || serialize() === snapshot
      ? Promise.resolve(true)
      : confirmDialog({ title: "Discard changes?", body: "<p>Your edits to this product haven't been saved.</p>", ok: "Discard" });
    return go.then(function (ok) {
      if (!ok) return;
      editor.classList.remove("is-open");
      editor.setAttribute("aria-hidden", "true");
      document.body.style.overflow = "";
      editing = null;
      if (lastFocus && document.body.contains(lastFocus)) lastFocus.focus();
    });
  }

  $("addBtn").addEventListener("click", function () { openEditor(null); });
  editor.addEventListener("click", function (e) {
    if (e.target.closest("[data-close-editor]")) closeEditor();
    else if (e.target.closest("[data-remove-size]")) {
      e.target.closest(".ad-size").remove();
      if (!$("sizes").children.length) $("sizes").insertAdjacentHTML("beforeend", sizeRow({}));
    }
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && editor.classList.contains("is-open") && !$("confirm").open) {
      e.preventDefault(); // otherwise this same key press cancels the "discard?" dialog it opens
      closeEditor();
    }
  });

  $("addSize").addEventListener("click", function () {
    $("sizes").insertAdjacentHTML("beforeend", sizeRow({}));
    var inputs = $("sizes").querySelectorAll("[data-ml]");
    inputs[inputs.length - 1].focus();
  });

  // New products: the ID follows brand + name until edited by hand
  function syncId() {
    if (idTouched || !editing || editing.originalId) return;
    form.elements.id.value = slugify(form.elements.house.value + " " + form.elements.name.value);
    paintImage();
  }
  form.elements.house.addEventListener("input", syncId);
  form.elements.name.addEventListener("input", syncId);
  form.elements.id.addEventListener("input", function () {
    idTouched = true;
    form.elements.id.value = form.elements.id.value.toLowerCase().replace(/[^a-z0-9-]/g, "-");
    paintImage();
  });

  /* Image upload: downscale in the browser so it fits in storage */
  $("imgInput").addEventListener("change", function (e) {
    var file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    if (!/^image\//.test(file.type)) { toast("Please choose an image file.", true); return; }
    var url = URL.createObjectURL(file);
    var img = new Image();
    img.onload = function () {
      var scale = Math.min(1, IMAGE_MAX / Math.max(img.width, img.height));
      var c = document.createElement("canvas");
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      var ctx = c.getContext("2d");
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      editing.image = c.toDataURL("image/jpeg", 0.85);
      URL.revokeObjectURL(url);
      paintImage();
    };
    img.onerror = function () { URL.revokeObjectURL(url); toast("That image couldn't be read.", true); };
    img.src = url;
  });
  $("imgRemove").addEventListener("click", function () { editing.image = null; paintImage(); });

  function collectSizes() {
    return Array.prototype.map.call($("sizes").querySelectorAll(".ad-size"), function (row) {
      var ml = row.querySelector("[data-ml]").value.trim();
      var price = row.querySelector("[data-price]").value.trim();
      return { ml: ml === "" ? null : Number(ml), price: price === "" ? null : Number(price) };
    }).filter(function (s) { return s.ml != null || s.price != null; });
  }

  function invalid(name, bad) {
    var el = form.elements[name];
    el.closest(".field").classList.toggle("is-invalid", bad);
    el.setAttribute("aria-invalid", String(bad));
    return bad ? el : null;
  }

  form.addEventListener("input", function (e) {
    var f = e.target.closest(".field.is-invalid");
    if (f && e.target.value.trim()) f.classList.remove("is-invalid");
  });

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var el = form.elements;
    var sizes = collectSizes();
    var mls = sizes.map(function (s) { return s.ml; });
    var sizesBad = !sizes.length || sizes.some(function (s) {
      return !(s.ml > 0) || (s.price != null && !(s.price >= 0));
    }) || new Set(mls).size !== mls.length;
    $("sizesErr").style.display = sizesBad ? "block" : "";

    var firstBad = [
      invalid("house", !el.house.value.trim()),
      invalid("name", !el.name.value.trim()),
      invalid("type", !el.type.value.trim()),
      invalid("id", !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(el.id.value)),
      invalid("description", !el.description.value.trim()),
    ].filter(Boolean)[0] || (sizesBad ? $("sizes").querySelector("input") : null);
    if (firstBad) { firstBad.focus(); return; }

    var product = {
      id: el.id.value,
      house: el.house.value.trim(),
      name: el.name.value.trim(),
      type: el.type.value.trim(),
      tags: Array.prototype.filter.call(form.querySelectorAll('input[name="tags"]'), function (c) { return c.checked; }).map(function (c) { return c.value; }),
      badge: el.badge.value.trim() || null,
      description: el.description.value.trim(),
      notes: { top: el.top.value.trim(), heart: el.heart.value.trim(), base: el.base.value.trim() },
      sizes: sizes.sort(function (a, b) { return a.ml - b.ml; }),
      inStock: el.inStock.checked,
    };
    product.image = editing.image; // path = keep, data: URL = upload, null = remove

    var btn = $("saveBtn");
    var label = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Saving…";
    var isNew = !editing.originalId;
    admin.saveProduct(product, isNew)
      .then(function () { return admin.listProducts(); })
      .then(function (list) {
        products = list;
        render();
        closeEditor(true);
        toast(isNew ? product.name + " added" : "Changes saved");
      })
      .catch(function (ex) {
        if (ex.status === 409) { invalid("id", true); el.id.focus(); }
        fail(ex);
      })
      .then(function () { btn.disabled = false; btn.textContent = label; });
  });

  $("deleteBtn").addEventListener("click", function () {
    var p = byId(editing.originalId);
    removeProduct(p).then(function (deleted) { if (deleted) closeEditor(true); });
  });

  // Shared with js/admin-orders.js
  window.TFSAdmin = {
    escapeHtml: escapeHtml,
    money: money,
    toast: toast,
    confirmDialog: confirmDialog,
    fail: fail,
    onView: function (name, fn) { views[name] = fn; },
    isOpen: function () { return !$("app").hidden; },
  };

  /* ---------- Boot ---------- */
  admin.session().then(function (s) { if (s) showApp(s); else showLogin(); });
})();
