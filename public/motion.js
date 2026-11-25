const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

if (!reducedMotion.matches && 'IntersectionObserver' in window) {
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      observer.unobserve(entry.target);
      if (reducedMotion.matches || entry.target.matches(':focus-within')) continue;
      entry.target.animate(
        [{ opacity: 0.55, transform: 'translateY(12px)' }, { opacity: 1, transform: 'translateY(0)' }],
        { duration: 430, easing: 'cubic-bezier(.2,.7,.3,1)' },
      );
    }
  }, { threshold: 0.12 });

  document.querySelectorAll('.hero-copy,.hero-visual,.benefit-grid,.section-head,.method-copy,.access-steps,.faq-list,.cta-inner').forEach(element => observer.observe(element));
}
