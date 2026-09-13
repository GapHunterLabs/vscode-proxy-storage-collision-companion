import * as vscode from 'vscode';

/**
 * Asks the user to rate the extension on the Marketplace, once, after
 * a real number of storage layout collision checks that found real collisions -- never on install, never on a timer.
 * Counts invocations directly instead of tracking a set of seen keys:
 * each call site only fires `recordHit` after a genuinely successful,
 * non-empty result, so there's no re-triggering risk to dedup against.
 *
 * Persisted via `ExtensionContext.globalState` (not workspaceState) --
 * how many times this extension has been used isn't tied to any one
 * workspace, and neither is whether the user already answered.
 *
 * Standard mechanism used catalog-wide since 2026-08-24.
 */

const HITS_BEFORE_PROMPT = 10;

const KEY_HIT_COUNT = 'proxyStorageCollisionCompanion.review.hitCount';
const KEY_ANSWERED = 'proxyStorageCollisionCompanion.review.answered';

// Marketplace only assigns this extension a listing URL once the first
// manual publish goes through -- vendor page is a real, working
// fallback until then, same approach as the rest of the catalog.
const MARKETPLACE_URL = 'https://marketplace.visualstudio.com/publishers/GapHunterLabs';

/**
 * Call this once per real storage layout collision checks that found real collisions. Safe to call multiple times; a
 * no-op once the user has already answered.
 */
export function recordHit(context: vscode.ExtensionContext): void {
  if (context.globalState.get<boolean>(KEY_ANSWERED, false)) {
    return;
  }

  const count = context.globalState.get<number>(KEY_HIT_COUNT, 0) + 1;
  void context.globalState.update(KEY_HIT_COUNT, count);

  if (count === HITS_BEFORE_PROMPT) {
    showPrompt(context);
  }
}

function showPrompt(context: vscode.ExtensionContext): void {
  const rateAction = 'Rate on Marketplace';
  const dismissAction = "Don't ask again";

  void vscode.window
    .showInformationMessage(
      `Proxy Storage Collision Companion: you've used this ${HITS_BEFORE_PROMPT} times -- if it's saved you time, a rating on the Marketplace helps other developers find it.`,
      rateAction,
      dismissAction,
    )
    .then((selection) => {
      if (selection === rateAction) {
        void context.globalState.update(KEY_ANSWERED, true);
        void vscode.env.openExternal(vscode.Uri.parse(MARKETPLACE_URL));
      } else if (selection === dismissAction) {
        void context.globalState.update(KEY_ANSWERED, true);
      }
      // No selection (dismissed by clicking away): leave unanswered so
      // it can prompt again after the next real hit.
    });
}
