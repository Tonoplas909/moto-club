# Moto Club 🏍️

Petit jeu de **wheelie** en 3D low poly, jouable dans le navigateur et hébergé sur GitHub Pages.

Lève la roue avant, puis **dose les gaz et le frein arrière** pour tenir ton wheelie le plus loin possible.
Plus tu montes haut, plus tu marques, mais passé le point d'équilibre c'est le looping.

## Comment jouer

| Action | Clavier | Souris | Tactile |
| --- | --- | --- | --- |
| Gaz (l'avant se lève) | `Espace`, `↑`, `W`/`Z` | clic gauche | bouton **Gaz** |
| Frein arrière (l'avant redescend) | `↓`, `S`, `Maj` | clic droit | bouton **Frein** |
| Rejouer | `Espace`, `R` | | |
| Couper le son | `M` | bouton ♪ | bouton ♪ |

### Score

- Tu marques des points **par mètre parcouru en wheelie**, multipliés selon l'angle :

  | Zone | Angle | Multiplicateur |
  | --- | --- | --- |
  | Petit | 4–25° | ×1 |
  | Propre | 25–50° | ×2 |
  | Parfait | 50–78° | ×3 |
  | Limite | 78–98° | ×4 |

- Rester dans **Parfait** ou au-delà fait grimper un **combo** (+0,25 toutes les 2 s, jusqu'à ×3).
- La ligne pointillée sur la jauge marque le **point d'équilibre** (72°). Au-delà, la gravité tire la moto en arrière : il faut freiner.
- Au-delà de 98°, c'est le **looping** : tu perds la moitié de ton score.
- Le wheelie s'arrête quand la roue avant retouche le sol.
- Le record est sauvegardé dans le navigateur (`localStorage`).

### Petits conseils

- Le moteur a de l'inertie : relâche les gaz **avant** d'atteindre l'angle visé.
- Wheelie bas = la moto accélère (plus de mètres). Wheelie haut = plus de points par mètre, mais vitesse stable.
- Les dos d'âne jaunes et noirs secouent la moto, et ils sont de plus en plus nombreux.
- Plus tu vas vite, plus la moto est instable.

## Lancer en local

Aucune étape de build : c'est du HTML/JS statique, avec [three.js](https://threejs.org/) chargé depuis un CDN.
Il faut juste un serveur HTTP (les modules ES ne marchent pas en `file://`) :

```sh
npx serve .            # ou : python3 -m http.server 8080
```

Puis ouvre http://localhost:3000 (ou le port affiché).

Les tests de la physique tournent avec Node 18+ :

```sh
npm test
```

## Publier sur GitHub Pages

Le jeu est en ligne sur **https://tonoplas909.github.io/moto-club/**.

GitHub Pages sert la branche `gh-pages`. Il n'y a rien à faire à la main :
à chaque push sur `main`, le workflow `.github/workflows/deploy.yml` lance les tests
puis recopie `main` sur `gh-pages`, et le site se met à jour en une minute environ.

## Organisation du code

```
index.html        page, HUD et écrans (titre, résultats)
style.css         interface
src/main.js       boucle de jeu, caméra, entrées, enchaînement des écrans
src/physics.js    physique du wheelie (pendule inversé), score et zones
src/track.js      bosses de la route, générées de façon déterministe
src/world.js      décor low poly généré par tronçons (sol, route, arbres, montagnes)
src/bike.js       modèle de la moto et du pilote, animation du crash
src/lowpoly.js    utilitaires de géométrie (couleurs par face, fusion des meshes) et palette
src/fx.js         particules (poussière, fumée, étincelles)
src/hud.js        jauge d'angle, score, écran de fin
src/audio.js      son moteur synthétisé en WebAudio
test/             tests de la physique (node --test)
```

Les réglages de gameplay (couple, gravité, inertie du moteur, angles) sont regroupés dans `TUNING` en haut de `src/physics.js`.
