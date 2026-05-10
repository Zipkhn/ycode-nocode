# Checklist Post-Merge Upstream — Tests Obligatoires

> **Quand l'utiliser :** Après chaque `git pull upstream/main` ou `git merge upstream/main`.
> **Pourquoi :** Le refactor v1.6.0 "extract public layer renderer" + slim Tailwind v1.6.1 ont introduit
> 3 régressions silencieuses qu'on ne détecte pas via tsc/build. À vérifier systématiquement.

---

## 1. Procédure Pré-Merge (rappel rapide)

```bash
# 1. Stash modifs en cours si besoin
git stash push -u -m "regen-css-pre-merge"

# 2. Backup obligatoire
git fetch upstream
git tag backup/pre-vX.Y.Z

# 3. Branche dédiée (jamais merge direct sur main)
git checkout -b merge/upstream-vX.Y.Z
git merge upstream/main --no-edit
```

---

## 2. Vérifications Code Statiques (post-conflit-resolution)

```bash
# Aucun marqueur résiduel
grep -rn "<<<<<<< \|======= \|>>>>>>> " --include="*.tsx" --include="*.ts" --include="*.json" . 2>/dev/null | grep -v node_modules | grep -v ".next/"

# Mutations Lottie (canvas)
grep -n "DynamicLottiePlayer\|layer.name === 'lottie'" components/LayerRenderer.tsx
grep -n "lottie?" types/index.ts
grep -n "LottieSettings" "app/(builder)/ycode/components/RightSidebar.tsx"

# Mutations Lottie (public — DEPUIS v1.6.0)
grep -n "DynamicLottiePlayer\|layer.name === 'lottie'" components/LayerRendererPublic.tsx
grep -n "lottie?.src" lib/asset-utils.ts

# Studio bridges
grep -n "u-col-span-" hooks/use-design-sync.ts lib/tailwind-class-mapper.ts
grep -n '@import "./global-theme.css"' app/site.css

# DevMode + cleanSlate
grep -n "isDevMode\|toggleDevMode" "app/(builder)/ycode/components/RightSidebar.tsx"
grep -n "cleanSlate" "app/(builder)/ycode/components/ElementLibrary.tsx"

# Link block
grep -n "'link-block'" lib/layer-utils.ts "app/(builder)/ycode/components/ElementLibrary.tsx"

# JSON-LD / Hreflang / SEO
grep -n "generatePageJsonLd\|generateHreflangEntries" "app/(site)/page.tsx"
```

Tous les `grep` doivent retourner du contenu — sinon une mutation a été perdue au merge.

---

## 3. Build & Type-Check

```bash
npm install
npx tsc --noEmit                  # 0 erreurs attendues
npm run build                     # Doit compiler, pas d'erreur réelle (les "error" dans les noms de routes ne comptent pas)
```

---

## 4. Tests Fonctionnels (CRITIQUE — tester en navigateur)

### 4.1. Canvas (mode builder)
- [ ] Ouvrir une page avec des layers Studio (grille, cards, sections)
- [ ] **Dimensions** : les `u-col-span-N` / `u-row-span-N` rendent correctement la grille
- [ ] **Lottie** : un layer Lottie joue son animation
- [ ] **DevMode toggle** : bouton grille en haut à droite du Right Sidebar fonctionne
- [ ] **CleanSlate toggle** : bouton dans Element Library fonctionne
- [ ] **Studio modal** : ouvrir, modifier une variable couleur, vérifier le rendu live

### 4.2. Preview (`/ycode/preview/[slug]`)
- [ ] **Dimensions** : grille `u-col-span-` rend correctement (ne pas s'effondrer en colonne)
- [ ] **Lottie** : animation joue (PAS un placeholder vide)
- [ ] **Custom favicon** sur error pages
- [ ] **Color variables** : appliquées sur tous les layers
- [ ] **Translations on canvas** (depuis v1.6.0) : changer la locale → contenu traduit
- [ ] **Link block** : un layer `link-block` rend bien un `<a>`

### 4.3. Publish (site live `/[...slug]`)
- [ ] Mêmes vérifs que Preview
- [ ] **CSV import** : si DB connectée, tester l'import d'un CSV moyen (>100 lignes)
- [ ] **JSON-LD** : voir le `<script type="application/ld+json">` dans le `<head>`
- [ ] **Hreflang** : présent sur sites multilocale

### 4.4. Specifically post-v1.6.0+
- [ ] **`LayerRendererPublic.tsx` mirror check** : tout nouveau layer type ajouté côté canvas doit l'être ici aussi
- [ ] **Slim Tailwind bundle** : ouvrir DevTools Network → vérifier que `app/site.css` charge `global-theme.css`
- [ ] **Code-split per layer type** : pas d'erreurs console "Cannot find dynamic import"

---

## 5. Si un test échoue — Mutations à restaurer

| Symptôme | Fichier | Fix |
|---|---|---|
| Lottie absent en preview/publish | `lib/asset-utils.ts:scanLayer` | Ajouter `addAssetVar(layer.variables?.lottie?.src);` |
| Lottie absent en preview, asset présent | `components/LayerRendererPublic.tsx` | Ajouter `DynamicLottiePlayer` import + bloc `if (layer.name === 'lottie')` (mirroir LayerRenderer.tsx) |
| Dimensions cassées (grille effondrée) preview/publish | `app/site.css` | Ajouter `@import "./global-theme.css";` après `@import "tailwindcss";` |
| `u-col-span-` non reconnu | `lib/tailwind-class-mapper.ts` + `hooks/use-design-sync.ts` | Vérifier que les prefixes `u-col-span-` / `u-row-span-` sont émis |
| LottieSettings absent du Right Sidebar | `app/(builder)/ycode/components/RightSidebar.tsx` | Re-import + rendu conditionnel |
| Link block ne rend pas un `<a>` | `lib/layer-utils.ts:LAYER_NAME_TO_HTML_TAG` | Ajouter `'link-block': 'a',` |
| Imports JSON refusés | `lib/asset-constants.ts` | Ajouter `'application/json'` aux MIME documents |
| OKLCH ne preview pas | Voir `project_oklch_support.md` | Conversion inline sans dépendance |

---

## 6. Restauration en cas d'échec

```bash
# Retour avant merge
git reset --hard backup/pre-vX.Y.Z

# OU retour au dernier merge testé
git reset --hard merge/upstream-vPREV-tested
```

---

## 7. Validation Finale & Push

```bash
# Tag testé
git tag merge/upstream-vX.Y.Z-tested

# Fast-forward main
git checkout main
git merge merge/upstream-vX.Y.Z --ff-only

# Mettre à jour la mémoire
# → modifier ~/.claude/projects/-Users-fares-Desktop-Ycode-ycode/memory/project_upstream_merge.md
# → ajouter une ligne dans le tableau "Historique des merges"

# Push
git add -A && git commit -m "merge: upstream vX.Y.Z + restore mutations"
git push origin main
```

---

## 8. Liste de fichiers SENSIBLES (à toujours vérifier)

```
components/LayerRenderer.tsx          ← Lottie, link-block, isInsideLink, conditional vis
components/LayerRendererPublic.tsx    ← MIRROR de LayerRenderer (depuis v1.6.0)
components/PageRenderer.tsx           ← Pipeline asset/CSS injection
types/index.ts                        ← LayerVariables.lottie
lib/asset-utils.ts                    ← collectLayerAssetIds.scanLayer (Lottie scan)
lib/layer-utils.ts                    ← LAYER_NAME_TO_HTML_TAG
lib/tailwind-class-mapper.ts          ← u-col-span-, u-row-span-
hooks/use-design-sync.ts              ← gridColumnSpan, gridRowSpan
app/site.css                          ← @import global-theme.css
app/(builder)/ycode/components/RightSidebar.tsx     ← LottieSettings, isDevMode
app/(builder)/ycode/components/ElementLibrary.tsx   ← cleanSlate, lottie media
app/(site)/page.tsx                   ← JSON-LD, Hreflang imports
lib/asset-constants.ts                ← application/json MIME
```

---

**Règle d'or :** Ne push jamais sur `main` sans avoir validé section 4 (tests fonctionnels en navigateur). Le tsc + build ne détectent PAS les régressions de rendu (Lottie absent, dimensions effondrées, etc.).
