(function () {
  const reduce =
    typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (reduce) {
    document.documentElement.classList.add("volna-motion-off");
    return;
  }

  document.documentElement.classList.add("js-motion");

  const revealSelector = [
    ".tile-product",
    ".section__head",
    ".catalog-toolbar",
    ".catalog-chips",
    ".account-panel-card",
    ".page-simple",
    ".cart-layout > *",
    ".cart-page > h1.section__title",
    ".site-footer__grid",
    ".admin-card",
    ".product-page#product-root > div",
  ].join(",");

  const io = new IntersectionObserver(
    (entries) => {
      for (const en of entries) {
        if (!en.isIntersecting) continue;
        const el = en.target;
        el.classList.add("is-inview");
        io.unobserve(el);
      }
    },
    { rootMargin: "0px 0px -5% 0px", threshold: 0.03 }
  );

  function staggerDelay(el) {
    if (!el.classList.contains("tile-product")) return;
    const parent = el.parentElement;
    if (!parent) return;
    const idx = [...parent.children].indexOf(el);
    el.style.setProperty("--reveal-delay", `${Math.min(Math.max(idx, 0), 12) * 0.05}s`);
  }

  function scan(root) {
    const base = root && root.nodeType === 1 ? root : document.body;
    if (!base || !base.querySelectorAll) return;
    const collected = new Set();
    if (typeof base.matches === "function" && base.matches(revealSelector)) collected.add(base);
    base.querySelectorAll(revealSelector).forEach((el) => collected.add(el));
    collected.forEach((el) => {
      if (!(el instanceof Element)) return;
      if (el.classList.contains("is-inview")) return;
      if (el.dataset.volnaIo) return;
      el.dataset.volnaIo = "1";
      staggerDelay(el);
      io.observe(el);
    });
  }

  let moTimer;
  const mo = new MutationObserver(() => {
    clearTimeout(moTimer);
    moTimer = setTimeout(() => scan(document.body), 50);
  });

  function bindHeroParallax() {
    const hero = document.querySelector(".gender-hero");
    if (!hero) return;
    if (!window.matchMedia("(pointer: fine)").matches) return;

    const move = (e) => {
      const r = hero.getBoundingClientRect();
      const mx = ((e.clientX - r.left) / Math.max(r.width, 1) - 0.5) * 2;
      const my = ((e.clientY - r.top) / Math.max(r.height, 1) - 0.5) * 2;
      hero.style.setProperty("--volna-mx", `${mx * 6}%`);
      hero.style.setProperty("--volna-my", `${my * 5}%`);
    };
    const leave = () => {
      hero.style.setProperty("--volna-mx", "0%");
      hero.style.setProperty("--volna-my", "0%");
    };
    hero.addEventListener("mousemove", move);
    hero.addEventListener("mouseleave", leave);
  }

  function bindHeroScroll() {
    const hero = document.querySelector(".gender-hero");
    if (!hero) return;
    let ticking = false;
    const update = () => {
      ticking = false;
      const r = hero.getBoundingClientRect();
      const vh = window.innerHeight || 1;
      const t = (r.top + r.height * 0.35) / vh;
      const shift = (0.45 - Math.min(Math.max(t, 0), 1)) * 28;
      const px = Math.round(shift * 0.45);
      hero.style.setProperty("--volna-scroll-shift", `${px}px`);
      hero.style.setProperty("--volna-text-lift", `${Math.round(-shift * 0.32)}px`);
    };
    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    update();
  }

  function init() {
    scan(document.body);
    mo.observe(document.body, { childList: true, subtree: true });
    bindHeroParallax();
    bindHeroScroll();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  window.VolnaMotion = { scan };
})();
