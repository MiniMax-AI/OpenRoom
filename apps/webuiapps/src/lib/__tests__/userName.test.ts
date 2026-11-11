import { describe, it, expect } from 'vitest';
import {
  hasNamePlaceholder,
  sanitizeSuggestedReplies,
  replaceNamePlaceholders,
  buildUserNamePrompt,
} from '../userName';

describe('hasNamePlaceholder', () => {
  it.each([
    "It's [name]. And yours?",
    'Hi [Name]!',
    'Call me [your name]',
    'Hey [user]',
    '[user_name] here',
    'Hello {{user}}',
    'Hello {{ User }}',
    'Hi <name>',
    'Hi <your name>',
    'Hi {name}',
    'Hi {user name}',
  ])('detects %s', (text) => {
    expect(hasNamePlaceholder(text)).toBe(true);
  });

  it.each(['Why does it matter?', 'Aoi. Just Aoi.', 'My name is Rene', '[smiles]', '{{char}}'])(
    'ignores %s',
    (text) => {
      expect(hasNamePlaceholder(text)).toBe(false);
    },
  );
});

describe('sanitizeSuggestedReplies', () => {
  it('drops replies containing placeholders and keeps the rest', () => {
    expect(
      sanitizeSuggestedReplies(["It's [name]. Yours?", 'Why does it matter?', 'You first, Aoi.']),
    ).toEqual(['Why does it matter?', 'You first, Aoi.']);
  });

  it('drops non-string entries', () => {
    expect(sanitizeSuggestedReplies(['ok', 42 as unknown as string])).toEqual(['ok']);
  });
});

describe('replaceNamePlaceholders', () => {
  it('replaces every placeholder with "you" by default', () => {
    expect(replaceNamePlaceholders("I don't take 'just [name]' or {{user}}.")).toBe(
      "I don't take 'just you' or you.",
    );
  });

  it('uses a custom replacement', () => {
    expect(replaceNamePlaceholders('Hi [name]', 'little one')).toBe('Hi little one');
  });

  it('leaves text without placeholders unchanged', () => {
    expect(replaceNamePlaceholders('Hello there')).toBe('Hello there');
  });
});

describe('buildUserNamePrompt', () => {
  it('tells the character to ask, save and never use placeholders', () => {
    const p = buildUserNamePrompt();
    expect(p).toContain('ask for it');
    expect(p).toContain('save_memory');
    expect(p).toContain('NEVER write template placeholders');
  });
});
