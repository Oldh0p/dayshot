/**
 * Build-time switches for the UI rewrite.
 *
 * `UI_V2` exists so the redesign can be backed out one screen at a time while
 * phases 2 to 4 land, rather than in a single revert. Phase 10 deletes both the
 * flag and the code it guards.
 *
 * The feed card is not behind it: its old version was a separate HTML entry, so
 * the switch there is the one `<script>` line in `splash.html`, and a constant
 * would only pretend to control it.
 */
export const UI_V2 = true;
