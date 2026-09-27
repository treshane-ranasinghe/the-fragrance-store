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

  function setDrawer(open, viaKeyboard) {
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    drawer.classList.toggle("is-open", open);
    drawer.setAttribute("aria-hidden", String(!open));
    document.body.style.overflow = open ? "hidden" : "";
    // Move focus into the menu only for keyboard users (avoids a focus ring on tap)
    if (open && viaKeyboard) setTimeout(function () { drawer.querySelector("a").focus({ preventScroll: true }); }, 350);
  }
  toggle.addEventListener("click", function (e) {
    setDrawer(toggle.getAttribute("aria-expanded") !== "true", e.detail === 0);
  });
  drawer.querySelectorAll("a").forEach(function (a) {
    a.addEventListener("click", function () { setDrawer(false); });
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && drawer.classList.contains("is-open")) { setDrawer(false); toggle.focus(); }
  });
  window.matchMedia("(min-width: 1081px)").addEventListener("change", function (mq) {
    if (mq.matches) setDrawer(false);
  });

  /* ---------- Scroll-driven effects (one rAF loop, no layout reads per frame) ---------- */
  var parallaxImgs = Array.prototype.map.call(document.querySelectorAll("[data-parallax-img]"), function (el) {
    return { el: el, img: el.querySelector("img"), top: 0, h: 0 };
  });
  var ticking = false;
  var scrolled = null;
  var vh = window.innerHeight;
  var scrollMax = 1;

  function measure() {
    vh = window.innerHeight;
    scrollMax = Math.max(1, document.documentElement.scrollHeight - vh);
    var y = window.scrollY;
    parallaxImgs.forEach(function (p) {
      var r = p.el.getBoundingClientRect();
      p.top = r.top + y; p.h = r.height;
    });
  }

  function onScroll() {
    var y = window.scrollY;
    var isScrolled = y > 30;
    if (isScrolled !== scrolled) { nav.classList.toggle("is-scrolled", isScrolled); scrolled = isScrolled; }
    progress.style.transform = "scaleX(" + Math.min(1, y / scrollMax).toFixed(4) + ")";

    if (!reduceMotion) {
      parallaxImgs.forEach(function (p) {
        if (!p.img) return;
        var center = p.top + p.h / 2 - y;
        if (center < -p.h || center > vh + p.h) return; // off screen
        var offset = (center - vh / 2) / vh; // -1 … 1
        p.img.style.transform = "translate3d(0," + (offset * -40).toFixed(1) + "px,0) scale(1.14)";
      });
    }
    ticking = false;
  }
  function requestScroll() {
    if (!ticking) { requestAnimationFrame(onScroll); ticking = true; }
  }
  window.addEventListener("scroll", requestScroll, { passive: true });
  window.addEventListener("resize", function () { measure(); requestScroll(); });
  window.addEventListener("load", function () { measure(); requestScroll(); });
  if ("ResizeObserver" in window) new ResizeObserver(function () { measure(); }).observe(document.body);
  measure();
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
      var rect = null, px = 0, py = 0, frame = 0;
      function apply() {
        frame = 0;
        var x = (px - rect.left) / rect.width;
        var y = (py - rect.top) / rect.height;
        card.style.transform = "translate3d(0,-6px,0) rotateX(" + ((0.5 - y) * 7).toFixed(2) + "deg) rotateY(" + ((x - 0.5) * 9).toFixed(2) + "deg)";
        card.style.setProperty("--mx", (x * 100).toFixed(1) + "%");
        card.style.setProperty("--my", (y * 100).toFixed(1) + "%");
      }
      card.addEventListener("mouseenter", function () {
        rect = card.getBoundingClientRect(); // measure once per hover
        card.classList.add("is-tilting");
      });
      card.addEventListener("mousemove", function (e) {
        if (!rect) rect = card.getBoundingClientRect();
        px = e.clientX; py = e.clientY;
        if (!frame) frame = requestAnimationFrame(apply);
      });
      card.addEventListener("mouseleave", function () {
        if (frame) cancelAnimationFrame(frame);
        frame = 0; rect = null;
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

  /* ---------- Custom cursor (loop sleeps when the pointer is still) ---------- */
  if (finePointer && !reduceMotion) {
    var dot = document.getElementById("cursor");
    var ring = document.getElementById("cursorRing");
    var mx = -100, my = -100, rx = -100, ry = -100;
    var cursorFrame = 0, lastT = 0;

    function follow(t) {
      var dt = lastT ? Math.min(64, t - lastT) : 16;
      lastT = t;
      var k = 1 - Math.pow(1 - 0.16, dt / 16.67); // same feel at 60Hz and 120Hz
      rx += (mx - rx) * k;
      ry += (my - ry) * k;
      ring.style.transform = "translate3d(" + rx.toFixed(1) + "px," + ry.toFixed(1) + "px,0)";
      if (Math.abs(mx - rx) > 0.3 || Math.abs(my - ry) > 0.3) cursorFrame = requestAnimationFrame(follow);
      else { cursorFrame = 0; lastT = 0; }
    }
    document.addEventListener("mousemove", function (e) {
      mx = e.clientX; my = e.clientY;
      dot.style.transform = "translate3d(" + mx + "px," + my + "px,0)";
      if (!document.body.classList.contains("has-cursor")) document.body.classList.add("has-cursor");
      if (!cursorFrame) cursorFrame = requestAnimationFrame(follow);
    }, { passive: true });
    document.addEventListener("mouseleave", function () { document.body.classList.remove("has-cursor"); });
    var hoverOn = false;
    document.addEventListener("mouseover", function (e) {
      var on = !!e.target.closest("a, button, .product, .filter");
      if (on !== hoverOn) { ring.classList.toggle("is-hover", on); hoverOn = on; }
    });
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
    else if (heroVisible) { hero.classList.remove("is-paused"); markThumb(slideAt); scheduleSlide(); }
  });

  // Mouse depth + cursor spotlight (batched to one write per frame)
  if (finePointer && !reduceMotion) {
    var depthEls = Array.prototype.map.call(hero.querySelectorAll("[data-depth]"), function (el) {
      return { el: el, d: parseFloat(el.dataset.depth) };
    });
    var spot = hero.querySelector(".hero__spot");
    var heroRect = null, hx = 0, hy = 0, heroFrame = 0;
    function applyHero() {
      heroFrame = 0;
      var x = (hx - heroRect.left) / heroRect.width - 0.5;
      var y = (hy - heroRect.top) / heroRect.height - 0.5;
      spot.style.transform = "translate3d(" + (hx - heroRect.left).toFixed(0) + "px," + (hy - heroRect.top).toFixed(0) + "px,0)";
      depthEls.forEach(function (p) {
        p.el.style.translate = (x * p.d).toFixed(1) + "px " + (y * p.d).toFixed(1) + "px";
      });
    }
    hero.addEventListener("mouseenter", function () { heroRect = hero.getBoundingClientRect(); hero.classList.add("has-spot"); });
    hero.addEventListener("mousemove", function (e) {
      if (!heroRect) { heroRect = hero.getBoundingClientRect(); hero.classList.add("has-spot"); }
      hx = e.clientX; hy = e.clientY;
      if (!heroFrame) heroFrame = requestAnimationFrame(applyHero);
    });
    window.addEventListener("scroll", function () { heroRect = null; }, { passive: true });
    hero.addEventListener("mouseleave", function () {
      heroRect = null;
      hero.classList.remove("has-spot");
      depthEls.forEach(function (p) { p.el.style.translate = ""; });
    });
  }

  // Pause the hero (slides, shimmer, glow) while it is scrolled out of view
  var heroVisible = true;
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (entries) {
      heroVisible = entries[0].isIntersecting;
      hero.classList.toggle("is-offscreen", !heroVisible);
      hero.classList.toggle("is-paused", !heroVisible);
      if (!heroVisible) clearTimeout(slideTimer);
      else if (root.classList.contains("is-loaded") && !document.hidden) { markThumb(slideAt); scheduleSlide(); }
    }).observe(hero);
  }

  /* ---------- Hero particles: drifting "scent" motes (time-based, sprite-drawn) ---------- */
  var canvas = document.getElementById("particles");
  if (canvas && !reduceMotion) {
    var ctx = canvas.getContext("2d");
    // Soft glows don't need retina resolution — 1x keeps fill-rate low
    var dpr = 1;
    var W = 0, H = 0, motes = [];
    var loopId = 0, prevT = 0, inView = true;

    function resize() {
      W = canvas.offsetWidth; H = canvas.offsetHeight;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    function spawn(initial) {
      return {
        x: W * (0.35 + Math.random() * 0.65),
        y: initial ? Math.random() * H : H + 10,
        r: 0.6 + Math.random() * 2.2,
        vy: 9 + Math.random() * 27,          // px per second
        sway: Math.random() * Math.PI * 2,
        a: 0.15 + Math.random() * 0.55,
      };
    }

    // Pre-render one glowing dot per tint; drawing an image is far cheaper than a gradient per mote
    var sprite = document.createElement("canvas");
    sprite.width = sprite.height = 64;
    function paintSprite() {
      var hex = (hero.style.getPropertyValue("--tint") || "#F0D7A0").trim().replace("#", "");
      var n = parseInt(hex, 16);
      var rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(function (v) { return Math.round(v + (255 - v) * 0.45); }).join(",");
      var sc = sprite.getContext("2d");
      sc.clearRect(0, 0, 64, 64);
      var g = sc.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, "rgba(" + rgb + ",1)");
      g.addColorStop(1, "rgba(" + rgb + ",0)");
      sc.fillStyle = g;
      sc.fillRect(0, 0, 64, 64);
    }
    var lastTint = "";
    new MutationObserver(function () {
      var t = hero.style.getPropertyValue("--tint");
      if (t !== lastTint) { lastTint = t; paintSprite(); }
    }).observe(hero, { attributes: true, attributeFilter: ["style"] });

    resize();
    paintSprite();
    var count = W < 700 ? 26 : 60;
    for (var i = 0; i < count; i++) motes.push(spawn(true));
    window.addEventListener("resize", resize);

    function draw(t) {
      var dt = prevT ? Math.min(0.05, (t - prevT) / 1000) : 0.016;
      prevT = t;
      ctx.clearRect(0, 0, W, H);
      for (var i = 0; i < motes.length; i++) {
        var m = motes[i];
        m.y -= m.vy * dt;
        m.sway += 0.6 * dt;
        m.x += Math.sin(m.sway) * 18 * dt;
        if (m.y < -10) motes[i] = m = spawn(false);
        var fade = Math.min(1, m.y / (H * 0.35)); // dissolve near the top
        if (fade <= 0) continue;
        var size = m.r * 8;
        ctx.globalAlpha = m.a * fade;
        ctx.drawImage(sprite, m.x - size / 2, m.y - size / 2, size, size);
      }
      ctx.globalAlpha = 1;
      loopId = requestAnimationFrame(draw);
    }
    function start() { if (!loopId) { prevT = 0; loopId = requestAnimationFrame(draw); } }
    function stop() { if (loopId) { cancelAnimationFrame(loopId); loopId = 0; } }

    new IntersectionObserver(function (entries) {
      inView = entries[0].isIntersecting;
      inView && !document.hidden ? start() : stop();
    }).observe(canvas);
    document.addEventListener("visibilitychange", function () {
      !document.hidden && inView ? start() : stop();
    });
  }
})();
