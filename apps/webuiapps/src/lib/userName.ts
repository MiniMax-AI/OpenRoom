/**
 * User name handling for character chat.
 *
 * OpenRoom has no "user name" setting: the character learns the user's name in
 * the conversation (and keeps it via save_memory). Models sometimes fall back
 * to template placeholders such as "[name]" or "{{user}}" (SillyTavern style)
 * when they don't know the name; these helpers prevent and clean that up.
 */

/** Matches name placeholders like [name], [Your Name], {{user}}, <user>, {user}. */
const PLACEHOLDER_SOURCE =
  String.raw`\[\s*(?:your[\s_-]*)?(?:name|user(?:[\s_-]*name)?)\s*\]` +
  String.raw`|\{\{\s*user\s*\}\}` +
  String.raw`|<\s*(?:your[\s_-]*)?(?:name|user)\s*>` +
  String.raw`|\{\s*(?:your[\s_-]*)?(?:name|user(?:[\s_-]*name)?)\s*\}`;

/** True if the text contains a user-name placeholder. */
export function hasNamePlaceholder(text: string): boolean {
  return new RegExp(PLACEHOLDER_SOURCE, 'i').test(text);
}

/** Drop suggested replies that still contain a name placeholder. */
export function sanitizeSuggestedReplies(replies: string[]): string[] {
  return replies.filter((r) => typeof r === 'string' && !hasNamePlaceholder(r));
}

/** Replace placeholders in message text with a neutral form of address. */
export function replaceNamePlaceholders(text: string, replacement = 'you'): string {
  return text.replace(new RegExp(PLACEHOLDER_SOURCE, 'gi'), replacement);
}

/** System prompt section telling the character how to learn and use the user's name. */
export function buildUserNamePrompt(): string {
  return (
    "\n\n## The user's name\n" +
    "- If you do not know the user's name yet (it is not in your memories or earlier in this conversation), " +
    'ask for it naturally and in character early in the conversation.\n' +
    '- When the user tells you their name, immediately save it with save_memory ' +
    '(category "fact", e.g. "The user\'s name is Alex") and address them by that name from then on.\n' +
    '- NEVER write template placeholders such as [name], [user], {{user}} or <name> — not in your message ' +
    'and not in suggested replies. If you do not know the name, use a nickname or "you" instead.\n' +
    "- When you have just asked for the user's name, do not put any name in the suggested replies " +
    '(the user will type their own); suggest other replies instead.\n'
  );
}
