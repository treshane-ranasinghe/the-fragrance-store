(function () {
  "use strict";

  var STORE = window.STORE || {};
  var PRODUCTS = window.PRODUCTS || [];
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  var root = document.documentElement;

  function waLink(msg) {
    return "https://wa.me/" + STORE.whatsapp + "?text=" + encodeURIComponent(msg);
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  /* ---------- Intro ---------- */
  var preloader = document.getElementById("preloader");

  function finishIntro() {
    root.classList.add("is-loaded");
    if (preloader) preloader.classList.add("is-done");
  }

  var seenIntro = false;
  try { seenIntro = sessionStorage.getItem("tfs-intro") === "1"; } catch (e) {}

  if (!preloader || reduceMotion || seenIntro) {
    if (preloader) preloader.classList.add("is-skipped");
    requestAnimationFrame(finishIntro);
  } else {
    try { sessionStorage.setItem("tfs-intro", "1"); } catch (e) {}
    document.body.style.overflow = "hidden";
    setTimeout(function () {
      finishIntro();
      document.body.style.overflow = "";
    }, 2600);
    preloader.addEventListener("transitionend", function () { preloader.remove(); }, { once: true });
  }

  /* ---------- Contact links ---------- */
  document.querySelectorAll(".js-whatsapp").forEach(function (a) {
    a.href = waLink(a.dataset.msg || "Hello!");
    a.target = "_blank";
    a.rel = "noopener";
  });
  document.querySelectorAll(".js-phone").forEach(function (a) {
    a.href = "tel:" + (STORE.phone || "").replace(/\s/g, "");
    a.textContent = STORE.phone;
  });
  document.querySelectorAll(".js-email").forEach(function (a) {
    a.href = "mailto:" + STORE.email;
    a.textContent = STORE.email;
  });
  [["js-instagram", "instagram"], ["js-facebook", "facebook"], ["js-tiktok", "tiktok"], ["js-maps", "maps"]].forEach(function (pair) {
    document.querySelectorAll("." + pair[0]).forEach(function (a) {
      a.href = STORE[pair[1]];
      a.target = "_blank";
      a.rel = "noopener";
    });
  });
  document.getElementById("year").textContent = new Date().getFullYear();

  /* ---------- Nav: scroll state, progress, mobile drawer ---------- */
  var nav = document.getElementById("nav");
  var progress = document.getElementById("progress");
  var toggle = document.getElementById("navToggle");
  var drawer = document.getElementById("drawer");

  function setDrawer(open) {
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    drawer.classList.toggle("is-open", open);
    document.body.style.overflow = open ? "hidden" : "";
  }
  toggle.addEventListener("click", function () {
    setDrawer(toggle.getAttribute("aria-expanded") !== "true");
  });
  drawer.querySelectorAll("a").forEach(function (a) {
    a.addEventListener("click", function () { setDrawer(false); });
  });

  /* ---------- Scroll-driven effects (one rAF loop) ---------- */
  var parallaxText = document.querySelectorAll("[data-parallax]");
  var parallaxImgs = document.querySelectorAll("[data-parallax-img]");
  var ticking = false;

  function onScroll() {
    var y = window.scrollY;
    var vh = window.innerHeight;
    nav.classList.toggle("is-scrolled", y > 30);

    var max = document.documentElement.scrollHeight - vh;
    progress.style.transform = "scaleX(" + (max > 0 ? y / max : 0) + ")";

    if (!reduceMotion) {
      parallaxText.forEach(function (el) {
        el.style.transform = "translate3d(0," + (y * parseFloat(el.dataset.parallax)) + "px,0)";
      });
      parallaxImgs.forEach(function (el) {
        var r = el.getBoundingClientRect();
        if (r.bottom < 0 || r.top > vh) return;
        var offset = ((r.top + r.height / 2) - vh / 2) / vh; // -1 … 1
        el.style.setProperty("--py", (offset * -40).toFixed(1) + "px");
      });
    }
    ticking = false;
  }
  window.addEventListener("scroll", function () {
    if (!ticking) { requestAnimationFrame(onScroll); ticking = true; }
  }, { passive: true });
  onScroll();

  /* ---------- Products ---------- */
  var grid = document.getElementById("products");

  grid.innerHTML = PRODUCTS.map(function (p, i) {
    return (
      '<article class="product reveal" data-id="' + p.id + '" data-tags="' + p.tags.join(" ") + '" tabindex="0" role="button" aria-label="View ' + escapeHtml(p.name) + '">' +
        '<div class="product__media">' +
          (p.badge ? '<span class="product__tag">' + escapeHtml(p.badge) + "</span>" : "") +
          '<img src="images/products/' + p.id + '.jpg" alt="' + escapeHtml(p.house + " " + p.name) + '" loading="lazy" onerror="imgFallback(this)" />' +
        "</div>" +
        '<div class="product__body">' +
          '<p class="product__house">' + escapeHtml(p.house) + "</p>" +
          '<h3 class="product__name">' + escapeHtml(p.name) + "</h3>" +
          '<p class="product__notes">' + escapeHtml(p.notes.top + " · " + p.notes.base) + "</p>" +
          '<div class="product__foot">' +
            '<span class="product__price">' + (p.price ? escapeHtml(p.price) : "<small>Price on request</small>") + "</span>" +
            '<span class="link-arrow">Discover</span>' +
          "</div>" +
        "</div>" +
      "</article>"
    );
  }).join("") + '<div class="products__empty" hidden><h3>Arriving soon</h3><p>New additions are on their way. <a class="js-wa-empty" href="' + waLink("Hello, I'm looking for a fragrance.") + '" target="_blank" rel="noopener">Ask us what\'s in store</a>.</p></div>';

  /* Filters */
  var filterBtns = document.querySelectorAll(".filter");
  var emptyState = grid.querySelector(".products__empty");

  function applyFilter(tag) {
    var shown = 0;
    filterBtns.forEach(function (b) {
      var on = b.dataset.filter === tag;
      b.classList.toggle("is-active", on);
      b.setAttribute("aria-selected", String(on));
    });
    grid.querySelectorAll(".product").forEach(function (card) {
      var match = tag === "all" || card.dataset.tags.split(" ").indexOf(tag) > -1;
      card.classList.toggle("is-hidden", !match);
      if (match) {
        shown++;
        card.classList.remove("is-visible");
        void card.offsetWidth; // restart reveal animation
        card.classList.add("is-visible");
      }
    });
    emptyState.hidden = shown > 0;
  }
  filterBtns.forEach(function (b) {
    b.addEventListener("click", function () { applyFilter(b.dataset.filter); });
  });
  document.querySelectorAll(".collection[data-filter]").forEach(function (c) {
    c.addEventListener("click", function () { applyFilter(c.dataset.filter); });
  });

  /* Tilt + shine */
  if (finePointer && !reduceMotion) {
    grid.querySelectorAll(".product").forEach(function (card) {
      card.addEventListener("mousemove", function (e) {
        var r = card.getBoundingClientRect();
        var x = (e.clientX - r.left) / r.width;
        var y = (e.clientY - r.top) / r.height;
        card.classList.add("is-tilting");
        card.style.transform = "translateY(-6px) rotateX(" + ((0.5 - y) * 7).toFixed(2) + "deg) rotateY(" + ((x - 0.5) * 9).toFixed(2) + "deg)";
        card.style.setProperty("--mx", (x * 100).toFixed(1) + "%");
        card.style.setProperty("--my", (y * 100).toFixed(1) + "%");
      });
      card.addEventListener("mouseleave", function () {
        card.classList.remove("is-tilting");
        card.style.transform = "";
      });
    });
  }

  /* ---------- Product modal ---------- */
  var modal = document.getElementById("modal");
  var lastFocus = null;

  function openModal(id) {
    var p = PRODUCTS.find(function (x) { return x.id === id; });
    if (!p) return;
    lastFocus = document.activeElement;
    document.getElementById("modalHouse").textContent = p.house;
    document.getElementById("modalTitle").textContent = p.name;
    document.getElementById("modalMeta").textContent = p.type;
    document.getElementById("modalDesc").textContent = p.description;
    document.getElementById("modalPrice").textContent = p.price || "Price on request";
    document.getElementById("modalNotes").innerHTML =
      [["Top", p.notes.top], ["Heart", p.notes.heart], ["Base", p.notes.base]].map(function (n) {
        return "<div><dt>" + n[0] + "</dt><dd>" + escapeHtml(n[1]) + "</dd></div>";
      }).join("");
    document.getElementById("modalMedia").innerHTML =
      '<img src="images/products/' + p.id + '.jpg" alt="' + escapeHtml(p.house + " " + p.name) + '" onerror="imgFallback(this)" />';
    document.getElementById("modalEnquire").href =
      waLink("Hello, I'd like to enquire about " + p.house + " " + p.name + ".");

    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    modal.querySelector(".modal__close").focus();
  }

  function closeModal() {
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    if (lastFocus) lastFocus.focus();
  }

  grid.addEventListener("click", function (e) {
    var card = e.target.closest(".product");
    if (card) openModal(card.dataset.id);
  });
  grid.addEventListener("keydown", function (e) {
    var card = e.target.closest(".product");
    if (card && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); openModal(card.dataset.id); }
  });
  modal.querySelectorAll("[data-close]").forEach(function (el) { el.addEventListener("click", closeModal); });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && modal.classList.contains("is-open")) closeModal();
  });

  /* ---------- Reveal on scroll + counters ---------- */
  function countUp(el) {
    var target = parseInt(el.dataset.count, 10);
    var start = performance.now();
    var dur = 1800;
    (function step(now) {
      var t = Math.min((now - start) / dur, 1);
      el.textContent = Math.round(target * (1 - Math.pow(1 - t, 3)));
      if (t < 1) requestAnimationFrame(step);
    })(start);
  }

  if ("IntersectionObserver" in window && !reduceMotion) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        if (el.dataset.count) countUp(el);
        else el.classList.add("is-visible");
        io.unobserve(el);
      });
    }, { threshold: 0.15, rootMargin: "0px 0px -40px 0px" });
    document.querySelectorAll(".reveal, [data-count]").forEach(function (el) { io.observe(el); });
  } else {
    document.querySelectorAll(".reveal").forEach(function (el) { el.classList.add("is-visible"); });
    document.querySelectorAll("[data-count]").forEach(function (el) { el.textContent = el.dataset.count; });
  }

  /* ---------- Testimonials ---------- */
  var quotes = document.querySelectorAll(".quote");
  var dotsWrap = document.getElementById("quoteDots");
  var current = 0;
  var timer;

  quotes.forEach(function (_, i) {
    var b = document.createElement("button");
    b.setAttribute("role", "tab");
    b.setAttribute("aria-label", "Testimonial " + (i + 1));
    b.setAttribute("aria-selected", String(i === 0));
    b.addEventListener("click", function () { showQuote(i); restart(); });
    dotsWrap.appendChild(b);
  });
  var dots = dotsWrap.querySelectorAll("button");

  function showQuote(i) {
    quotes[current].classList.remove("is-active");
    dots[current].setAttribute("aria-selected", "false");
    current = i;
    quotes[current].classList.add("is-active");
    dots[current].setAttribute("aria-selected", "true");
  }
  function restart() {
    clearInterval(timer);
    timer = setInterval(function () { showQuote((current + 1) % quotes.length); }, 6000);
  }
  restart();

  /* ---------- Custom cursor ---------- */
  if (finePointer && !reduceMotion) {
    var dot = document.getElementById("cursor");
    var ring = document.getElementById("cursorRing");
    var mx = -100, my = -100, rx = -100, ry = -100;

    document.addEventListener("mousemove", function (e) {
      mx = e.clientX; my = e.clientY;
      dot.style.transform = "translate3d(" + mx + "px," + my + "px,0)";
      document.body.classList.add("has-cursor");
    });
    document.addEventListener("mouseleave", function () { document.body.classList.remove("has-cursor"); });
    document.addEventListener("mouseover", function (e) {
      ring.classList.toggle("is-hover", !!e.target.closest("a, button, .product, .filter"));
    });
    (function follow() {
      rx += (mx - rx) * 0.16;
      ry += (my - ry) * 0.16;
      ring.style.transform = "translate3d(" + rx + "px," + ry + "px,0)";
      requestAnimationFrame(follow);
    })();
  }

  /* ---------- Hero: cinematic slideshow (4s per slide) ---------- */
  var SLIDE_MS = 4000;
  var WIPE_MS = 1250;
  var hero = document.getElementById("hero");
  var slides = hero.querySelectorAll(".hero__slide");
  var wipe = hero.querySelector(".hero__wipe");
  var ghost = document.getElementById("heroGhost");
  var rail = document.getElementById("heroRail");
  var featureBody = document.getElementById("heroFeatureBody");
  var slideAt = 0;
  var slideTimer = null;
  var busy = false;

  hero.style.setProperty("--slide-ms", SLIDE_MS + "ms");

  function productFor(slide) {
    return PRODUCTS.find(function (p) { return p.id === slide.dataset.product; }) || {};
  }

  function setGhost(word) {
    ghost.innerHTML = word.split("").map(function (ch, i) {
      return '<span class="ch" style="--i:' + i + '">' + escapeHtml(ch) + "</span>";
    }).join("");
  }

  function setFeature(i) {
    var p = productFor(slides[i]);
    document.getElementById("heroIndex").textContent = String(i + 1).padStart(2, "0");
    document.getElementById("heroHouse").textContent = p.house || "";
    document.getElementById("heroName").textContent = p.name || "";
    var notes = p.notes ? [p.notes.top, p.notes.heart, p.notes.base].join(", ").split(/\s*,\s*/).slice(0, 5) : [];
    document.getElementById("heroNotes").innerHTML = notes.map(function (n, k) {
      return '<li style="--i:' + k + '">' + escapeHtml(n) + "</li>";
    }).join("");
  }

  // Thumbnail rail mirrors the slides
  rail.innerHTML = Array.prototype.map.call(slides, function (sl, i) {
    var p = productFor(sl);
    return '<button type="button" class="hero__thumb' + (i === 0 ? " is-active" : "") + '" aria-label="Show ' + escapeHtml((p.house || "") + " " + (p.name || "")) + '">' +
      '<img src="' + sl.querySelector("img").getAttribute("src") + '" alt="" loading="lazy" /><i></i></button>';
  }).join("");
  var thumbs = rail.querySelectorAll(".hero__thumb");

  function markThumb(i) {
    thumbs.forEach(function (t) { t.classList.remove("is-active"); });
    void thumbs[i].offsetWidth; // restart progress bar
    thumbs[i].classList.add("is-active");
  }

  function goToSlide(n) {
    if (busy) return;
    var next = (n + slides.length) % slides.length;
    if (next === slideAt) { scheduleSlide(); return; }
    busy = true;
    var prev = slides[slideAt];
    var incoming = slides[next];
    slideAt = next;

    hero.style.setProperty("--tint", incoming.dataset.tint);
    markThumb(next);

    // image wipe + light line
    incoming.classList.add("is-entering");
    wipe.classList.remove("is-running");
    void wipe.offsetWidth;
    wipe.classList.add("is-running");

    // ghost letters out → in
    ghost.classList.add("is-out");
    featureBody.classList.add("is-swapping");
    setTimeout(function () {
      setGhost(incoming.dataset.ghost);
      ghost.classList.remove("is-out");
      ghost.classList.add("is-pre");
      void ghost.offsetWidth;
      ghost.classList.remove("is-pre");
      setFeature(next);
      featureBody.classList.remove("is-swapping");
    }, 520);

    setTimeout(function () {
      prev.classList.remove("is-active");
      incoming.classList.remove("is-entering");
      incoming.classList.add("is-active");
      busy = false;
    }, reduceMotion ? 0 : WIPE_MS);

    scheduleSlide();
  }

  function scheduleSlide() {
    clearTimeout(slideTimer);
    slideTimer = setTimeout(function () { goToSlide(slideAt + 1); }, SLIDE_MS);
  }

  setGhost(slides[0].dataset.ghost);
  setFeature(0);

  thumbs.forEach(function (t, i) {
    t.addEventListener("click", function () { goToSlide(i); });
  });
  document.getElementById("heroView").addEventListener("click", function () {
    openModal(slides[slideAt].dataset.product);
  });

  // Start once the intro has lifted, so the first slide gets its full 4s
  (function waitForIntro() {
    if (root.classList.contains("is-loaded")) { markThumb(0); scheduleSlide(); }
    else setTimeout(waitForIntro, 100);
  })();

  // Pause while the tab is hidden
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) { clearTimeout(slideTimer); hero.classList.add("is-paused"); }
    else { hero.classList.remove("is-paused"); markThumb(slideAt); scheduleSlide(); }
  });

  // Mouse depth + cursor spotlight
  if (finePointer && !reduceMotion) {
    var depthEls = hero.querySelectorAll("[data-depth]");
    hero.addEventListener("mousemove", function (e) {
      var r = hero.getBoundingClientRect();
      var x = (e.clientX - r.left) / r.width - 0.5;
      var y = (e.clientY - r.top) / r.height - 0.5;
      hero.style.setProperty("--sx", ((x + 0.5) * 100).toFixed(1) + "%");
      hero.style.setProperty("--sy", ((y + 0.5) * 100).toFixed(1) + "%");
      depthEls.forEach(function (el) {
        var d = parseFloat(el.dataset.depth);
        el.style.setProperty("--dx", (x * d).toFixed(1) + "px");
        el.style.setProperty("--dy", (y * d).toFixed(1) + "px");
      });
    });
    hero.addEventListener("mouseleave", function () {
      depthEls.forEach(function (el) { el.style.setProperty("--dx", "0px"); el.style.setProperty("--dy", "0px"); });
    });
  }

  /* ---------- Hero particles: drifting gold "scent" motes ---------- */
  var canvas = document.getElementById("particles");
  if (canvas && !reduceMotion) {
    var ctx = canvas.getContext("2d");
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var W, H, motes = [];
    var running = true;

    function resize() {
      W = canvas.offsetWidth; H = canvas.offsetHeight;
      canvas.width = W * dpr; canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    function spawn(initial) {
      return {
        x: W * (0.35 + Math.random() * 0.65),
        y: initial ? Math.random() * H : H + 10,
        r: 0.6 + Math.random() * 2.2,
        vy: 0.15 + Math.random() * 0.45,
        sway: Math.random() * Math.PI * 2,
        a: 0.15 + Math.random() * 0.55,
      };
    }
    resize();
    var count = W < 700 ? 34 : 70;
    for (var i = 0; i < count; i++) motes.push(spawn(true));
    window.addEventListener("resize", resize);

    new IntersectionObserver(function (entries) {
      running = entries[0].isIntersecting;
      if (running) requestAnimationFrame(draw);
    }).observe(canvas);

    var tintRgb = "240,215,160";
    function readTint() {
      var hex = (hero.style.getPropertyValue("--tint") || "#F0D7A0").trim().replace("#", "");
      var n = parseInt(hex, 16);
      // lift toward white so motes stay luminous
      tintRgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(function (v) { return Math.round(v + (255 - v) * 0.45); }).join(",");
    }
    readTint();
    new MutationObserver(readTint).observe(hero, { attributes: true, attributeFilter: ["style"] });

    function draw() {
      if (!running) return;
      ctx.clearRect(0, 0, W, H);
      for (var i = 0; i < motes.length; i++) {
        var m = motes[i];
        m.y -= m.vy;
        m.sway += 0.01;
        m.x += Math.sin(m.sway) * 0.3;
        if (m.y < -10) motes[i] = m = spawn(false);
        var fade = Math.min(1, m.y / (H * 0.35)); // dissolve near the top
        var g = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, m.r * 4);
        g.addColorStop(0, "rgba(" + tintRgb + "," + (m.a * fade) + ")");
        g.addColorStop(1, "rgba(" + tintRgb + ",0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(m.x, m.y, m.r * 4, 0, Math.PI * 2);
        ctx.fill();
      }
      requestAnimationFrame(draw);
    }
    requestAnimationFrame(draw);
  }
})();
