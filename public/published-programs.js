// Public programmes carried over from the original Dulces Victoria site.
const genoises=['Génoise classique','Génoise au chocolat','Génoise à l’eau','Génoise au beurre'];
const courses=[{id:'chantilly',number:'01',category:'cakes',title:'Le gâteau d’anniversaire à la chantilly',short:'Des bases simples pour vos premiers gâteaux et des finitions qui font la différence.',image:'photo-1578985545062-69928b1d9587',alt:'Gâteau d’anniversaire décoré à la crème',groups:[['4 types de génoise',genoises],['3 types de chantilly',['Chantilly classique','Chantilly au chocolat','Chantilly stable, résistante à la chaleur']],['Décoration',['Décorer un gâteau en chantilly avec de la pâte à sucre']]],count:8},{id:'creme-au-beurre',number:'02',category:'cakes',title:'Le gâteau d’anniversaire à la crème au beurre',short:'Apprenez à réaliser vos génoises et à travailler trois crèmes au beurre pour des créations soignées.',image:'photo-1535141192574-5d4897c12636',alt:'Gâteau à étages décoré avec soin',groups:[['4 types de génoise',genoises],['3 types de crème au beurre',['Crème au beurre américaine','Crème au beurre à la meringue suisse','Crème au beurre au chocolat blanc, résistante à la chaleur, pour faciliter le transport']]],count:7},{id:'gateaux-en-pot',number:'03',category:'commerce',title:'Gâteaux en pot & biscuits',short:'Des recettes accessibles pour préparer une offre gourmande et démarrer votre activité avec un petit budget.',image:'photo-1499636136210-6f4ee915583e',alt:'Cookies aux pépites de chocolat',groups:[['Les gâteaux',['Génoise classique','Génoise au chocolat','Gâteau red velvet']],['Les crèmes',['Chantilly classique','Chantilly au chocolat','Chantilly en poudre','Crème au fromage pour le red velvet']],['Montage & biscuits',['Sirop et montage des cups','Biscuits au beurre','Cookies aux pépites de chocolat','Madeleines']]],count:11}];
export const publishedPrograms = courses.map(course => ({
  id: course.id,
  module: Number(course.number),
  category: course.category,
  title: course.title,
  description: course.short,
  image: `https://images.unsplash.com/${course.image}?auto=format&fit=crop&w=1000&q=80`,
  alt: course.alt,
  groups: course.groups,
  level: 'Débutant',
  duration: 'À confirmer',
  price: 5000,
}));
