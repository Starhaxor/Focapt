# Tokenless YouTube Translation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Hugging Face/local API translation path with YouTube `tlang` caption translation.

**Architecture:** `YouTubeCaptionSource` fetches source and translated JSON3 tracks. A pure timing-based merger creates `BilingualCue[]`; the content script writes those cues directly to the timeline.

**Tech Stack:** TypeScript, WXT, Vitest, YouTube JSON3 timed-text.

## Global Constraints

- No token, external translation API, or local server.
- Preserve source cue identity and timing.
- Use only HTTPS YouTube timed-text URLs.
- User-visible strings remain in locale bundles.

---

### Task 1: Direct YouTube bilingual captions

**Files:**
- Modify: `apps/extension/src/youtube/caption-source.ts`
- Modify: `apps/extension/src/youtube/caption-source.test.ts`
- Create: `apps/extension/src/youtube/bilingual-cues.ts`
- Create: `apps/extension/src/youtube/bilingual-cues.test.ts`
- Modify: `apps/extension/entrypoints/youtube.content.ts`
- Delete: `apps/api/`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `README.md`

**Interfaces:**
- Produces: `YouTubeCaptionSource.loadTranslated(track, targetLanguage)`.
- Produces: `mergeBilingualCues(source, translated): BilingualCue[]`.

- [ ] **Step 1: Write failing tests** for `tlang` URL preservation, midpoint/overlap matching, missing translation fallback, and identical source/target language.
- [ ] **Step 2: Run** `npx vitest run apps/extension/src/youtube/caption-source.test.ts apps/extension/src/youtube/bilingual-cues.test.ts` and confirm failures are caused by missing interfaces.
- [ ] **Step 3: Implement** translated JSON3 loading and the pure timing-based merger. Preserve every source cue and use its text as fallback.
- [ ] **Step 4: Replace** `CaptionApi.translate` usage in `youtube.content.ts` with source/translated loads and local merging; keep abort and stale-request guards.
- [ ] **Step 5: Remove** the API workspace, Hugging Face/Fastify dependencies, API host permission, and token setup documentation. Run `npm install --ignore-scripts` to refresh the lockfile.
- [ ] **Step 6: Verify** with `npm test`, `npm run typecheck`, `npm -w @focapt/extension run build`, and `npm exec -w @focapt/extension -- wxt zip`.
- [ ] **Step 7: Commit** with `feat: use YouTube caption translation without tokens`.
