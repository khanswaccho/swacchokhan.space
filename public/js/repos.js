/* ============================================================================
   Portfolio — repository category filtering.
   The cards are server-rendered; this only shows and hides them.
   ========================================================================== */

const buttons = document.querySelectorAll('[data-repo-filter]');
const grid = document.getElementById('repo-grid');
const emptyNote = document.getElementById('repo-none');

if (buttons.length && grid) {
  const cards = [...grid.querySelectorAll('.repo')];

  buttons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const filter = btn.dataset.repoFilter;
      buttons.forEach((b) => b.classList.toggle('is-active', b === btn));

      let shown = 0;
      cards.forEach((card) => {
        const match = filter === 'all' || card.dataset.category === filter;
        card.classList.toggle('is-hidden', !match);
        if (match) {
          shown++;
          // Re-run the entrance animation so filtering feels like a shuffle.
          card.style.setProperty('--i', String(Math.min(shown, 6)));
          card.classList.remove('is-visible');
          requestAnimationFrame(() => card.classList.add('is-visible'));
        }
      });

      if (emptyNote) emptyNote.style.display = shown === 0 ? 'block' : 'none';
    });
  });
}
