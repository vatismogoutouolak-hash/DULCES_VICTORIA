import { readFileSync } from 'node:fs';
import { load } from 'cheerio';
import { publishedPrograms } from '../public/published-programs.js';
import { routeFor } from '../public/navigation.js';

export const pages = {
  'index.html': { sections: [0, 1, 6] },
  'formations.html': { sections: [2], title: 'Formations en pâtisserie', description: 'Explorez les formations vidéo de Dulces Victoria et trouvez le cours adapté à votre niveau.' },
  'ecole.html': { sections: [3, 5], title: 'Notre école de pâtisserie', description: 'Découvrez la méthode Dulces Victoria pour apprendre les gestes de la pâtisserie à votre rythme.' },
  'inscription.html': { sections: [4, 6], title: 'Inscription et accès aux cours', description: 'Découvrez comment créer votre espace étudiant et accéder aux formations vidéo de Dulces Victoria.' },
  'aide.html': { sections: [7, 8, 9], title: 'Aide et informations', description: 'Retrouvez les réponses aux questions sur les comptes, les formations et les modalités d’accès.' },
  'apercu-contenu.html': { preview: true },
};

const excluded = '[data-cms-exclude],#auth-modal,#page-content,#page-status,#account-tools,#course-grid,#catalog-empty,.header-actions,.account-nav,script,style,[aria-hidden="true"]';

export function publicPages(template) {
  return {
    name: 'dulces-public-pages',
    transformIndexHtml: {
      order: 'pre',
      handler(html, context) {
        const filename = context.filename.split('/').pop();
        const page = pages[filename];
        if (!page) return html;

        const $ = load(readFileSync(template, 'utf8'));
        // Stamp the original CMS identifiers before distributing sections across pages.
        let textIndex = 0;
        function stampText(node) {
          const parent = $(node);
          const ids = {};
          const editable = !parent.closest(excluded).length && parent.closest('header,main,footer,.announcement').length;
          parent.contents().each((index, child) => {
            if (child.type === 'text' && editable && child.data.trim()) ids[index] = 'text-' + textIndex++;
            if (child.type === 'tag') stampText(child);
          });
          if (Object.keys(ids).length) parent.attr('data-cms-text', JSON.stringify(ids));
        }

        stampText($('body')[0]);
        $('header a,main a,footer a,.announcement a').each((index, node) => $(node).attr('data-cms-link', 'link-' + index));
        $('header img,main img,footer img,.hero-photo,.method-photo').each((index, node) => $(node).attr('data-cms-image', 'image-' + index));
        $('main > section').each((index, node) => {
          if (page.preview || page.sections.includes(index)) $(node).attr('data-cms-section', 'section-' + index);
          else $(node).remove();
        });

        if (filename === 'index.html') {
          const featured = $('<section class="section container home-programmes"><div class="section-head"><div><p class="eyebrow">LES FORMATIONS</p><h2>Trois modules pour apprendre la pâtisserie</h2></div><a class="btn btn-outline" href="/formations.html">Voir le catalogue →</a></div><div class="course-grid"></div></section>');
          for (const course of publishedPrograms) {
            const card = $('<article class="course-card"><img loading="lazy" width="600" height="400"><div class="course-body"><p class="course-meta"></p><h3><a></a></h3><p class="programme-intro"></p><a class="programme-link">Voir le programme →</a></div></article>');
            const url = '/formations.html?formation=' + encodeURIComponent(course.id);
            card.find('img').attr({ src: course.image, alt: course.alt });
            card.find('.course-meta').text('Module ' + course.module + ' · 5 000 FCFA');
            card.find('h3 a').attr('href', url).text(course.title);
            card.find('.programme-intro').text(course.description);
            card.find('.programme-link').attr('href', url);
            featured.find('.course-grid').append(card);
          }
          $('.benefits').after(featured);
          featured.after('<section class="home-path"><div class="container"><div><p class="eyebrow">VOTRE PARCOURS</p><h2>De votre premier cours à votre première création</h2></div><ol><li><strong>Choisissez votre module</strong><p>Consultez le programme et choisissez la spécialité qui vous intéresse.</p></li><li><strong>Créez votre espace étudiant</strong><p>Retrouvez les étapes d’inscription et les modalités de paiement.</p></li><li><strong>Pratiquez à votre rythme</strong><p>Après activation de votre accès, retrouvez les leçons dans votre espace.</p></li></ol><a class="btn btn-dark" href="/inscription.html">Consulter les étapes d’inscription →</a></div></section>');
        }
        $('body').attr('data-public-page', filename);
        if (page.preview) $('head').append('<meta name="robots" content="noindex,nofollow">');
        if (page.title) {
          $('title').text(page.title + ' — Dulces Victoria');
          $('meta[name="description"]').attr('content', page.description);
          const heading = $('main h2').first();
          const title = $('<h1 class="interior-title"></h1>').html(heading.html());
          if (heading.attr('data-cms-text')) title.attr('data-cms-text', heading.attr('data-cms-text'));
          heading.replaceWith(title);
        }
        if (!page.preview) {
          $('#main-nav').prepend('<a href="#accueil">Accueil</a>');
          $('#main-nav a[href="#temoignages"]').remove();
          $('#main-nav a[href="#faq"]').before('<a href="#acces">Inscription</a>');
          $('a[href^="#"]').each((_, node) => {
            const link = $(node);
            const href = link.attr('href');
            link.attr('href', routeFor(href));
            if (link.closest('#main-nav').length && routeFor(href) === (filename === 'index.html' ? '/' : '/' + filename)) link.attr('aria-current', 'page');
          });
        }
        return $.html();
      },
    },
  };
}
