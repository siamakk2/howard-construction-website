// ── NAV SCROLL ──
(function() {
  var nb = document.getElementById('navbar');
  if (!nb) return;
  window.addEventListener('scroll', function() {
    nb.classList.toggle('scrolled', window.scrollY > 24);
  }, { passive: true });
})();

// ── MOBILE MENU ──
(function() {
  var btn = document.getElementById('menuToggle');
  var menu = document.getElementById('mobileMenu');
  if (!btn || !menu) return;
  btn.addEventListener('click', function() {
    var open = menu.classList.toggle('open');
    btn.setAttribute('aria-expanded', open);
  });
  menu.querySelectorAll('a').forEach(function(a) {
    a.addEventListener('click', function() { menu.classList.remove('open'); });
  });
})();

// ── SCROLL REVEAL ──
(function() {
  var obs = new IntersectionObserver(function(entries) {
    entries.forEach(function(e) {
      if (e.isIntersecting) { e.target.classList.add('visible'); obs.unobserve(e.target); }
    });
  }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });
  document.querySelectorAll('.reveal').forEach(function(el) { obs.observe(el); });
})();
