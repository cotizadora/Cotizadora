/* Presentación inicial: dedicatoria animada que se muestra al abrir la tómbola
   (en el navegador y en la app instalada). Un toque la salta. */
(function () {
  'use strict';
  var intro = document.getElementById('intro');
  if (!intro) return;
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var done = false;
  var timer = 0;

  document.documentElement.classList.add('intro-on');

  function finish() {
    if (done) return;
    done = true;
    clearTimeout(timer);
    intro.classList.add('leave');
    setTimeout(function () {
      intro.remove();
      document.documentElement.classList.remove('intro-on');
    }, reduced ? 300 : 900);
  }

  function start() {
    if (intro.classList.contains('play')) return;
    intro.classList.add('play');
    timer = setTimeout(finish, reduced ? 3000 : 5200);
  }

  intro.addEventListener('click', finish);
  document.addEventListener('keydown', function onKey(e) {
    if (done) { document.removeEventListener('keydown', onKey); return; }
    if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); finish(); }
  });

  // Espera breve a las tipografías para que el trazo de la dedicatoria no cambie a mitad de la animación.
  if (document.fonts && document.fonts.load) {
    Promise.race([
      Promise.all([document.fonts.load('400 64px "Great Vibes"'), document.fonts.load('800 64px "Barlow Condensed"')]),
      new Promise(function (r) { setTimeout(r, 900); })
    ]).then(start, start);
  } else start();
})();
