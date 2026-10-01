/* ==========================================================================
   LOTV — 공통 스크립트 (모든 페이지 공유)
   1) 현재 페이지 메뉴 표시  2) 헤더 스크롤 상태  3) 히어로 위 로고 숨김
   4) 풀스크린 메뉴(드로어)  5) 이미지 페이드인  6) 스크롤 리빌
   ========================================================================== */
(function () {
  'use strict';

  var root   = document.documentElement;
  var body   = document.body;
  var header = document.querySelector('.site-header');
  var toggle = document.querySelector('.menu-toggle');
  var drawer = document.getElementById('site-drawer');
  var page   = body.getAttribute('data-page');

  /* 1) 현재 페이지 표시 — <body data-page="gallery"> 와 링크의 data-nav 매칭 */
  document.querySelectorAll('[data-nav]').forEach(function (a) {
    if (a.getAttribute('data-nav') === page) a.setAttribute('aria-current', 'page');
  });

  /* 2) 헤더 스크롤 상태 */
  function onScroll() {
    header.classList.toggle('is-scrolled', window.scrollY > 24);
  }
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  /* 3) 메인 히어로 워드마크가 보이는 동안 헤더 로고 숨김 */
  var heroMark = document.querySelector('[data-hero-mark]');
  if (heroMark && 'IntersectionObserver' in window) {
    header.classList.add('is-over-hero');
    new IntersectionObserver(function (entries) {
      header.classList.toggle('is-over-hero', entries[0].isIntersecting);
    }, { rootMargin: '-' + header.offsetHeight + 'px 0px 0px 0px' }).observe(heroMark);
  }

  /* 4) 풀스크린 메뉴 */
  var lastFocus = null;

  function isOpen() { return drawer.classList.contains('is-open'); }

  function lockScroll(lock) {
    if (lock) {
      var sbw = window.innerWidth - root.clientWidth;
      body.style.overflow = 'hidden';
      if (sbw > 0) body.style.paddingRight = sbw + 'px';
    } else {
      body.style.overflow = '';
      body.style.paddingRight = '';
    }
  }

  function openMenu() {
    lastFocus = document.activeElement;
    drawer.classList.add('is-open');
    drawer.removeAttribute('inert');
    drawer.setAttribute('aria-hidden', 'false');
    toggle.setAttribute('aria-expanded', 'true');
    toggle.setAttribute('aria-label', '메뉴 닫기');
    body.classList.add('menu-open');
    lockScroll(true);
    setTimeout(function () {
      var first = drawer.querySelector('.drawer-link');
      if (first) first.focus({ preventScroll: true });
    }, 250);
  }

  function closeMenu() {
    drawer.classList.remove('is-open');
    drawer.setAttribute('inert', '');
    drawer.setAttribute('aria-hidden', 'true');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', '메뉴 열기');
    body.classList.remove('menu-open');
    lockScroll(false);
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }

  toggle.addEventListener('click', function () {
    isOpen() ? closeMenu() : openMenu();
  });

  // 현재 페이지 링크를 누르면 이동 대신 메뉴만 닫기
  drawer.querySelectorAll('.drawer-link').forEach(function (a) {
    a.addEventListener('click', function (e) {
      if (a.getAttribute('aria-current') === 'page') {
        e.preventDefault();
        closeMenu();
      }
    });
  });

  document.addEventListener('keydown', function (e) {
    if (!isOpen()) return;
    if (e.key === 'Escape') { closeMenu(); return; }
    if (e.key === 'Tab') {
      // 포커스 트랩: 토글 버튼 + 드로어 내부 링크만 순환
      var items = [toggle].concat([].slice.call(drawer.querySelectorAll('a[href], button')));
      var first = items[0];
      var last  = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  /* 5) 이미지 페이드인 — <img data-fade> */
  document.querySelectorAll('img[data-fade]').forEach(function (img) {
    function done() { img.classList.add('is-loaded'); }
    if (img.complete) done();
    else {
      img.addEventListener('load', done, { once: true });
      img.addEventListener('error', done, { once: true });
    }
  });

  /* 6) 스크롤 리빌 — [data-reveal] (필요한 곳에만 절제해서 사용) */
  var reveals = document.querySelectorAll('[data-reveal]');
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-in');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15 });
    reveals.forEach(function (el) { io.observe(el); });
  } else {
    reveals.forEach(function (el) { el.classList.add('is-in'); });
  }

  /* 페이지 로드 연출 트리거 — 폰트 로딩 후 시작(글자 교체로 인한 튐 방지) */
  function ready() { root.classList.add('is-ready'); }
  var fallback = setTimeout(ready, 1200);
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () { clearTimeout(fallback); ready(); });
  }
})();
