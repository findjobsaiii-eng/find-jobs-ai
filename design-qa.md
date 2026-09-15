# JOBMITER landing design QA

- Source visual truth: `C:\Users\user\AppData\Local\Temp\codex-clipboard-85f26533-d89c-425c-9f95-f24a4cf535a7.jpg`
- Browser-rendered implementation: `C:\Users\user\AppData\Local\Temp\jobmiter-landing-desktop-en.png`
- Full-page evidence: `C:\Users\user\AppData\Local\Temp\jobmiter-landing-full-en.png`
- Mobile evidence: `C:\Users\user\AppData\Local\Temp\jobmiter-landing-mobile-en.png`
- Viewports: desktop 1440 × 900 CSS px; mobile 390 × 844 CSS px
- Pixels and density: source 1122 × 1370 px; desktop implementation 1440 × 900 px; mobile implementation 390 × 844 px; browser device scale factor 1. The source is a multi-panel brand board rather than a same-viewport page mock, so comparison used its hero, card-stack, palette, logo, spacing, and typography panels as qualitative visual truth rather than applying false pixel precision.
- State: signed-out landing, light theme, English and Hebrew checked; hero animation allowed to settle before the final desktop capture.

## Full-view comparison evidence

The implementation carries the source's dominant Snow frame, Midnight hero, Electric Blue/Teal accents, large left-aligned display type, compact navigation, soft-radius surfaces, and product-led card stack. The landing sequence remains deliberately shorter than the multi-panel brand board, but preserves its calm hierarchy and “less noise” positioning. The full-page capture confirms consistent section rhythm from hero through three-step flow, product preview, trust pillars, closing CTA, and footer.

## Focused-region comparison evidence

The hero and lower trust/CTA region were inspected separately at desktop size because card labels, icon treatment, typography weights, and border/shadow quality were too small to judge in the full-page capture. Mobile was checked separately at 390 px in both English LTR and Hebrew RTL. The source uses photographic device and landscape imagery; the implementation intentionally uses sharp, believable JOBMITER interface surfaces because this is the live product and the supplied board is visual direction, not a production asset pack.

## Required fidelity surfaces

- Fonts and typography: Inter and Noto Sans Hebrew retain the existing product fonts. Display weights, tight tracking, balanced headings, pretty body copy, and mobile wraps match the reference's confident hierarchy.
- Spacing and layout rhythm: generous frame spacing, 32 px hero corners, restrained three-column/one-column transitions, and shared card elevation establish a consistent premium rhythm.
- Colors and tokens: Midnight, Electric Blue, Teal, Cloud, and Snow are mapped through existing semantic brand variables. Contrast was checked in both the dark hero and light content surfaces.
- Image and asset quality: the existing vector JOBMITER mark/logo remains sharp. No screenshot crops or external assets were introduced; the product preview uses real UI patterns and the installed Lucide icon family.
- Copy and content: short, localized product copy makes “Ask. Match. Apply.” the recurring motif and accurately describes profile matching, relevant opportunities, and application tracking.

## Findings and comparison history

1. **Earlier P2 — below-fold sections could remain visually hidden in a full-page capture.** The first implementation used opacity-based viewport reveals. This made the page fragile for automated capture and for environments where an observer does not fire. Fix: content is now visible by default; motion remains in the hero entrance, floating workflow cards, hover states, and the existing searching animation. Post-fix evidence: the revised full-page capture shows every section with complete content and stable spacing.
2. **P3 — source includes cinematic landscape/device imagery.** This was intentionally not copied because no production image asset was supplied and a fake decorative scene would make the real product less truthful. The real product-card preview provides equivalent visual weight and stronger product relevance.

No actionable P0, P1, or P2 findings remain. Primary navigation anchors, both hero CTAs, language switching, responsive layout, RTL/LTR direction, reduced-motion fallbacks, and console output were checked. Browser console: no errors or warnings from the application.

final result: passed
