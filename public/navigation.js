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

export function routeFor(href) {
  if (href.startsWith('#formation/')) {
    return '/formations.html?formation=' + encodeURIComponent(href.slice(11));
  }
  return Object.hasOwn(sectionRoutes, href) ? sectionRoutes[href] : href;
}
