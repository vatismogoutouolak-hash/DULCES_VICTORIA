import { courseProfiles } from './course-profiles.js';
import { readFileSync } from 'node:fs';
import { load } from 'cheerio';
import { publishedPrograms, offerPriceMarkup } from '../public/published-programs.js';
import { formationPath, routeFor } from '../public/navigation.js';

export const pages = {
  'index.html': { sections: [0, 1, 6] },
  'formations.html': { sections: [2], title: 'Formations en pâtisserie', description: 'Explorez les formations vidéo de Dulces Victoria et trouvez le cours adapté à votre niveau.' },
  'ecole.html': { sections: [3, 5], title: 'Notre école de pâtisserie', description: 'Découvrez la méthode Dulces Victoria pour apprendre les gestes de la pâtisserie à votre rythme.' },
  'inscription.html': { sections: [4, 6], title: 'Inscription et accès aux cours', description: 'Découvrez comment créer votre espace étudiant et accéder aux formations vidéo de Dulces Victoria.' },
  'aide.html': { sections: [7, 8, 9], title: 'Aide et informations', description: 'Retrouvez les réponses aux questions sur les comptes, les formations et les modalités d’accès.' },
  ...Object.fromEntries(publishedPrograms.map(course => [formationPath(course.id).slice(1), {
    sections: [], course, title: 'Module ' + course.module + ' — ' + course.title, description: course.description,
  }])),
  'formation.html': { sections: [], title: 'Programme de formation', description: 'Consultez le programme de votre formation.', dynamicCourse: true },
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
            const card = $('<article class="course-card"><img loading="lazy" width="600" height="400"><div class="course-body"><p class="course-meta"></p><h3><a></a></h3><p class="programme-intro"></p><div class="programme-actions"><a class="btn btn-outline programme-link">Voir le programme</a><button class="btn btn-dark" type="button" data-open-auth="signup">M’inscrire à cette formation</button></div></div></article>');
            const url = formationPath(course.id);
            card.find('img').attr({ src: course.image, alt: course.alt });
            card.find('.course-meta').text('Module ' + course.module);
            card.find('.programme-intro').after($('<p></p>').html(offerPriceMarkup()));
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
          const title = $('<h1 class="interior-title"></h1>').html(heading.html() || '');
          if (heading.attr('data-cms-text')) title.attr('data-cms-text', heading.attr('data-cms-text'));
          heading.replaceWith(title);
        }
        if (page.course || page.dynamicCourse) {
          const main = $('main');
          main.append('<div class="container breadcrumb"><a href="/">Accueil</a><span aria-hidden="true">/</span><a href="/formations.html">Formations</a></div>');
          if (page.course) {
            const course = page.course;
            const profile = courseProfiles[course.id];
            const detail = $(`
              <div class="container course-detail branded-course">
                <div class="course-hero">
                  <figure class="module-cover">
                    <img width="1000" height="700" fetchpriority="high">
                    <figcaption><span>DULCES VICTORIA</span><strong></strong></figcaption>
                  </figure>
                  <div class="course-buy">
                    <p class="eyebrow"></p><h1></h1><p class="course-summary"></p><p class="detail-price"></p>
                    <button type="button" class="btn btn-dark btn-large" data-open-auth="signup">M’inscrire à cette formation →</button>
                    <p class="detail-access">Accès activé après vérification du paiement.</p>
                    <a href="/inscription.html">Consulter les modalités d’inscription</a>
                  </div>
                </div>
                <section class="module-overview" aria-label="Objectif et public">
                  <div><h2>Votre objectif</h2><p class="module-objective"></p></div>
                  <div><h2>À qui s’adresse ce module ?</h2><p class="module-audience"></p></div>
                </section>
                <section class="course-syllabus"><h2>Au programme</h2><div class="syllabus-grid"></div></section>
                <section class="module-enrolment" aria-label="Inscription à la formation">
                  <div><p class="module-enrolment-brand"></p><h2></h2><p class="module-enrolment-price"></p></div>
                  <button type="button" class="btn btn-large" data-open-auth="signup">M’inscrire à cette formation <span aria-hidden="true">→</span></button>
                </section>
                <nav class="module-related" aria-label="Autres modules"><h2>Découvrez aussi</h2><div></div></nav>
              </div>`);
            detail.attr('data-module-theme', profile.theme);
            $('meta[name="description"]').attr('content', profile.intro);
            detail.find('img').attr({ src: course.image, alt: course.alt });
            detail.find('figcaption strong').text(profile.signature);
            detail.find('.eyebrow').text('Module ' + course.module + ' · Débutant · Formation vidéo');
            detail.find('h1').text(course.title);
            detail.find('.course-summary').text(profile.intro);
            detail.find('.detail-price, .module-enrolment-price').html(offerPriceMarkup());
            detail.find('.module-enrolment-brand').text('Dulces Victoria · Module ' + course.module);
            detail.find('.module-enrolment h2').text(course.title);
            detail.find('.module-objective').text(profile.objective);
            detail.find('.module-audience').text(profile.audience);
            for (const [index, [name, items]] of course.groups.entries()) {
              const [summary, explanations] = profile.groups[index];
              const group = $('<article><h3></h3><p></p><ul></ul></article>');
              group.find('h3').text(name);
              group.find('p').text(summary);
              for (const [itemIndex, item] of items.entries()) {
                const row = $('<li><strong></strong><span></span></li>');
                row.find('strong').text(item);
                row.find('span').text(explanations[itemIndex]);
                group.find('ul').append(row);
              }
              detail.find('.syllabus-grid').append(group);
            }
            for (const other of publishedPrograms.filter(programme => programme.id !== course.id)) {
              const link = $('<a><span></span><strong></strong></a>').attr('href', formationPath(other.id));
              link.find('span').text('Module ' + other.module);
              link.find('strong').text(other.title + ' →');
              detail.find('.module-related > div').append(link);
            }
            main.append(detail);
          } else {
            main.append('<section class="container course-detail course-buy" id="public-formation"><h1>Programme de formation</h1><p role="status">Chargement de la formation…</p></section>');
          }
        }
        if (!page.preview) {
          $('#main-nav').prepend('<a href="#accueil">Accueil</a>');
          $('#main-nav a[href="#temoignages"]').remove();
          $('#main-nav a[href="#faq"]').before('<a href="#acces">Inscription</a>');
          $('a[href^="#"]').each((_, node) => {
            const link = $(node);
            const href = link.attr('href');
            link.attr('href', routeFor(href));
            if (link.closest('#main-nav').length && routeFor(href) === (page.course || page.dynamicCourse ? '/formations.html' : filename === 'index.html' ? '/' : '/' + filename)) link.attr('aria-current', 'page');
          });
        }
        return $.html();
      },
    },
  };
}
