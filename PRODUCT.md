# NutriSnap

<!-- impeccable:product-schema 1 -->

## Platform

android

Native Android design behavior is a confirmed product requirement. The current implementation is a React/Vite web interface packaged with Capacitor for Android; a browser interface also exists. This requirement describes the intended Android experience, not a claim that the current UI already meets native conventions or a decision to replace the stack.

## Users

Vietnamese-speaking people who want less effort when recording meals and following personal nutrition goals. Preserve the documented audience and purpose; student budgets are an established meal-recommendation use case, not an exclusive audience restriction.

## Product Purpose

NutriSnap is a personal AI nutrition assistant that reduces manual food logging and supports sustainable nutrition habits. Users capture meals, review and correct estimated food and portion information, confirm their records, and follow progress toward weight-loss, maintenance, or muscle-gain goals.

Success means making those everyday tasks easier while keeping users in control of their records and making the limits of nutrition estimates clear. No numeric success target has been confirmed.

## Positioning

The documented mechanism combines food-photo recognition with text or voice corrections for portions and hidden ingredients, Vietnamese food reference data, deterministic backend nutrition calculations, and a conversational assistant with personal context. This is a product mechanism, not a verified market-uniqueness or accuracy claim.

## Operating Context

- Vietnamese UI; English identifiers and filenames in the codebase.
- Typical journey: register or sign in, set a personal goal, capture or enter a meal, review food and quantities, confirm saving, then review the dashboard and longer-term progress.
- Assistant conversations support nutrition questions, budget-aware meal suggestions, and meal drafts that require confirmation before saving.
- Existing routes cover the dashboard, meal capture, goal setup, progress analytics, habits, and monthly reports; see `src/frontend/src/App.tsx`.
- The repository is a CSC10014 Computational Thinking course project at FIT, HCMUS. Demonstrations and reports must distinguish implemented behavior from specifications and mock data.

## Capabilities and Constraints

- Preserve photo capture, manual food entry, editable portions, ingredient corrections, goal planning, assistant chat, progress analytics, habit tracking, and monthly reporting as documented product scope. Route or component presence alone does not prove end-to-end readiness.
- AI interprets food and user intent; nutrition totals come from backend calculations and reference data. Do not invent calorie or macro values in model prose or frontend calculations.
- Require explicit user confirmation before saving a meal, including meals drafted through chat.
- Show nutrition and recognition results as estimates. Preserve the established notice: “Số liệu dinh dưỡng chỉ mang tính chất ước tính tham khảo, không thay thế tư vấn y khoa.”
- Keep account data private. The backend derives user identity from the authenticated session; AI tool arguments must not choose another user's identity. Preserve the documented HttpOnly-cookie session boundary.
- Respect the consent and data-minimization requirements in `docs/data_governance_policy.md`; treat these as requirements, not proof of compliance or completed implementation.
- The existing stack is React, TypeScript, Vite, Tailwind CSS, Recharts, and Capacitor on the frontend; Python/FastAPI with SQLModel/SQLite on the backend; Gemini for AI orchestration. Android behavior must be addressed within the actual implementation constraints.

## Brand Commitments

Preserve the NutriSnap name and Vietnamese product terminology. The documented experience aims to reduce pressure around meal tracking and support sustainable habits. No new aesthetic direction, palette, typography, or rebrand was requested during initialization.

## Evidence on Hand

- `README.md`: product purpose, architecture, and core mechanism. Performance language such as three-second recognition is a documented aspiration unless supported by current measurements.
- `docs/02_api_contract_and_screen_flows.md`: documented workflows, terminology, confirmation behavior, estimate notices, and accessibility expectations.
- `docs/data_governance_policy.md`: privacy and consent requirements.
- `src/frontend/src/App.tsx` and `src/frontend/src/pages/`: incumbent routes and implementation evidence.
- `src/frontend/src/constants/copy.ts`: established Vietnamese labels and estimate notices.
- `data/`: nutrition reference data; `tests/` and `src/frontend/src/__tests__/`: verification assets. Their presence does not establish accuracy or passing status.
- `docs/android-lan-session.md` and `src/frontend/capacitor.config.ts`: current Android packaging and development-session constraints.

Do not fabricate measured recognition speed, clinical validation, accuracy, testimonials, customer counts, or legal compliance from these materials.

## Product Principles

1. Reduce the effort of everyday meal logging while preserving review and correction.
2. Make nutrition estimates and their limitations understandable.
3. Keep nutrition computation grounded in backend reference data.
4. Preserve user control over saving meals and handling personal data.
5. Support sustainable habits with Vietnamese food and budget context.

## Accessibility & Inclusion

Native Android behavior is required: respect system Back, system bars and keyboard insets, accessible touch targets, system text scaling, TalkBack semantics, and reduced-animation preferences. These are implementation requirements to verify, not confirmed current capabilities.

Preserve documented keyboard access, accessible names, reduced motion, and tabular alternatives for charts in the browser interface. Manual text entry must remain available when speech or camera access is unavailable.

## Open Decisions

Android version and device coverage, tablet support, browser support commitments, release readiness criteria, and numeric success metrics remain unspecified. No decision to migrate to Compose or another native framework has been made.
