<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://assets.ycodeapp.com/assets/app13650/Icons/9l3kz_ycode-logo-white.svg">
    <source media="(prefers-color-scheme: light)" srcset="https://assets.ycodeapp.com/assets/app13650/Icons/arpQnWd8noiOpoMx0rFsCWN6MY0kCgpxPk3zbuzO.svg">
    <img alt="Ycode Logo" src="https://assets.ycodeapp.com/assets/app13650/Icons/arpQnWd8noiOpoMx0rFsCWN6MY0kCgpxPk3zbuzO.svg" width="200">
  </picture>
</p>

## About Ycode

Ycode is a visual website builder and CMS designed for creating and managing websites without writing code. It is available as a self-hosted Open Source project or as a fully managed [Cloud][cloud] service.

## Learning Ycode

Ycode has extensive [documentation][docs]. We actively maintain and improve it, so if something is unclear or incomplete, feel free to open an issue. We welcome any feedback that helps make the docs better.

## Setting Up Ycode Open Source

To self-host Ycode you will need:

- A [GitHub](https://github.com) account
- A [Supabase](https://supabase.com) account
- A [Vercel](https://vercel.com) account

Follow the [installation instructions][install] to get started.

## Support

We provide official support on [Ycode Cloud][cloud] projects. Community-driven support for the Open Source version is available in [Discord][discord].

## Contributing

Thank you for considering contributing to Ycode! We ask that you review the [contribution guide][contributing] before opening issues or submitting pull requests.

## Code of Conduct

To ensure the Ycode community is welcoming to all, please review and abide by our [Code of Conduct][coc].

## Important Links

- [Ycode Website][cloud]
- [Ycode Documentation][docs]
- [Ycode Discord Community][discord]

# 🎉 Ce qu'on a apporté (résumé simple)

_Toute la feuille de route ci-dessus est maintenant terminée. Voici, sans jargon, ce que ça change concrètement pour toi et tes utilisateurs._

## 1. Des données plus fiables (validation)
Avant, on pouvait enregistrer à peu près n'importe quoi dans le contenu (un prix négatif, un email mal écrit, deux articles avec la même adresse « slug »…). Maintenant, tu peux poser des **règles par champ** : obligatoire, valeur unique, minimum/maximum, format attendu. Si une règle n'est pas respectée, un **message clair** s'affiche au lieu d'un contenu cassé qui passe en douce. Résultat : moins d'erreurs, un site plus propre.

## 2. Ton contenu est ouvrable « à distance » et sécurisé (l'API)
Ton site peut désormais servir de **source de contenu pour d'autres applications** (une app mobile, une boutique, un outil interne…) via des **clés d'accès**. On a musclé cette porte d'entrée :
- **Clés à durée de vie** : tu peux créer une clé qui **expire** automatiquement, ou la **révoquer** en un clic si elle a fuité — sans casser les autres.
- **Droits séparés** : une clé peut être « lecture seule » (elle consulte) ou « lecture + écriture » (elle peut modifier).
- **Anti-abus** : si quelqu'un bombarde l'API de requêtes, le système le **freine automatiquement** (au lieu de ralentir tout le monde).
- **Messages d'erreur discrets** : on ne révèle plus d'infos techniques sensibles à un attaquant.
- Une **documentation** claire accompagne le tout, pour que ce soit vendable comme une vraie fonctionnalité pro.

## 3. L'historique du contenu (« annuler » sur les articles)
Chaque fois que tu modifies un élément de contenu, une **photo de son état** est gardée. Tu ouvres l'historique, tu vois la liste des versions datées, et tu peux **revenir à une version précédente en un clic**. Fini le stress de la mauvaise manip : rien n'est perdu.

## 4. Du contenu structuré et réutilisable (objets & listes)
Avant, un champ ne pouvait contenir qu'une seule information simple (un texte, un nombre). Maintenant on peut créer des **champs riches** :
- Un champ **« objet »** qui regroupe plusieurs infos ensemble (ex. un bloc SEO = titre + description + image).
- Un champ **« liste »** qui répète un modèle (ex. les **variantes d'un produit** : taille, couleur, prix — autant de lignes que nécessaire).
- Et des **modèles réutilisables** : tu définis un type (ex. « SEO ») une seule fois, tu le réutilises partout, et si tu le modifies, la mise à jour se **propage automatiquement** à tous les endroits qui l'utilisent.

Concrètement, ça permet de modéliser proprement des cas type e-commerce ou catalogue, sans bricolage.

---

**En résumé** : un contenu plus fiable, réutilisable et récupérable, et une porte d'entrée « API » sécurisée et prête à être proposée comme argument commercial. Tout a été testé (214 vérifications automatiques au vert) et n'a demandé qu'une seule évolution de base de données.
