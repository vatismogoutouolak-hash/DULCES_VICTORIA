export const sectionRoutes = {
  '#accueil': '/',
  '#cours': '/formations.html',
  '#formations': '/formations.html',
  '#methode': '/ecole.html',
  '#a-propos': '/ecole.html',
  '#temoignages': '/ecole.html#temoignages',
  '#acces': '/inscription.html',
  '#faq': '/aide.html',
  '#contact': '/aide.html#informations-legales',
  '#informations-legales': '/aide.html#informations-legales',
  '#confidentialite': '/aide.html#informations-legales',
  '#mentions': '/aide.html#informations-legales',
  '#conditions': '/aide.html#informations-legales',
  '#espace': '/espace.html',
};

const knownProgrammes = ['chantilly', 'creme-au-beurre', 'gateaux-en-pot'];

export function formationPath(id) {
  return knownProgrammes.includes(id) ? '/formation-' + id + '.html' : '/formation.html?id=' + encodeURIComponent(id);
}

export function routeFor(href) {
  if (href.startsWith('#formation/')) {
    return formationPath(href.slice(11));
  }
  return Object.hasOwn(sectionRoutes, href) ? sectionRoutes[href] : href;
}
