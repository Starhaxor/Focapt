# Tokenless YouTube Translation Design

## Goal

Remove Hugging Face, the local API server, and token setup from the YouTube MVP. The extension must obtain both subtitle lines directly from YouTube.

## Data flow

1. Load the selected source caption track as JSON3.
2. Load the same `https://*.youtube.com/api/timedtext` URL again with `fmt=json3&tlang=<targetLanguage>`.
3. Keep the source cue timing and text authoritative.
4. For each source cue, select the translated cue active at the source cue midpoint; fall back to the closest overlapping cue, then to the source text if YouTube returns no translation.
5. Produce `BilingualCue[]` locally and replace the timeline.

## Boundaries

- Only YouTube HTTPS timed-text URLs already accepted by `YouTubeCaptionSource` are used.
- No external token, account, API server, or background capture is required.
- The unused API workspace and Hugging Face dependencies are removed.
- Translation/loading failures use existing localized status keys and never interrupt YouTube playback.

## Verification

- Tests prove `tlang` URL construction, timing-based cue alignment, missing-translation fallback, and source/target equality.
- Full test, typecheck, extension build, and zip packaging must pass.

