import { describe, it, expect, beforeEach } from 'vitest';
import {
  isAction,
  ACTION_PREFIX,
  ACTION_PROFILE_SELF,
  ACTION_PROFILE_OTHER,
  ACTION_GENERATE_REPORT,
  PROFILE_DATA_PREFIX,
  serializeProfileData,
  saveToStorage,
  loadFromStorage,
  clearStorage,
  loadProfileFromStorage,
  saveProfileToStorage,
  STORAGE_KEY,
  PROFILE_STORAGE_KEY,
  getWelcomeSuggestions,
  getProfileOtherSuggestions,
} from '@/app/constants';

describe('isAction', () => {
  it('returns true for action strings', () => {
    expect(isAction(ACTION_PROFILE_SELF)).toBe(true);
    expect(isAction(ACTION_PROFILE_OTHER)).toBe(true);
    expect(isAction(ACTION_GENERATE_REPORT)).toBe(true);
    expect(isAction(`${ACTION_PREFIX}custom`)).toBe(true);
  });

  it('returns false for regular text', () => {
    expect(isAction('hello')).toBe(false);
    expect(isAction('')).toBe(false);
    expect(isAction('action:fake')).toBe(false);
  });
});

describe('serializeProfileData', () => {
  it('serializes a complete profile', () => {
    const result = serializeProfileData({
      school: '北京大学',
      major: '计算机',
      stage: '大三',
      intent: '保研',
      gpa: '3.8',
      internship: '无',
      research: '有一段',
      competition: 'ACM',
    });
    expect(result).toContain(PROFILE_DATA_PREFIX);
    expect(result).toContain('school=北京大学');
    expect(result).toContain('gpa=3.8');
    expect(result).toContain('competition=ACM');
  });

  it('sanitizes pipe and equals characters', () => {
    const result = serializeProfileData({
      school: 'A|B=C',
      major: 'CS',
      stage: '大一',
      intent: '就业',
      gpa: '',
      internship: '',
      research: '',
      competition: '',
    });
    expect(result).not.toContain('A|B');
    expect(result).toContain('A｜B＝C');
  });
});

describe('localStorage helpers', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('saveToStorage/loadFromStorage roundtrips', () => {
    const messages = [
      { role: 'assistant' as const, content: 'hi' },
      { role: 'user' as const, content: 'hello' },
    ];
    saveToStorage(messages);
    const loaded = loadFromStorage();
    expect(loaded).toEqual(messages);
  });

  it('does not save single-message arrays', () => {
    saveToStorage([{ role: 'assistant', content: 'hi' }]);
    expect(loadFromStorage()).toBeNull();
  });

  it('clearStorage removes data', () => {
    saveToStorage([
      { role: 'assistant', content: 'hi' },
      { role: 'user', content: 'hello' },
    ]);
    clearStorage();
    expect(loadFromStorage()).toBeNull();
  });

  it('saveProfileToStorage/loadProfileFromStorage roundtrips', () => {
    const profile = {
      school: '清华大学',
      major: 'CS',
      stage: '大三',
      intent: '保研',
      gpa: '3.9',
      internship: '',
      research: '',
      competition: '',
    };
    saveProfileToStorage(profile);
    const loaded = loadProfileFromStorage();
    expect(loaded).toEqual(profile);
  });

  it('loadProfileFromStorage returns null for incomplete profile', () => {
    localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify({ school: '北大' }));
    expect(loadProfileFromStorage()).toBeNull();
  });
});

describe('suggestion pools', () => {
  it('getWelcomeSuggestions returns 4 items', () => {
    const suggestions = getWelcomeSuggestions();
    expect(suggestions).toHaveLength(4);
    suggestions.forEach(s => expect(typeof s).toBe('string'));
  });

  it('getProfileOtherSuggestions returns 4 items', () => {
    const suggestions = getProfileOtherSuggestions();
    expect(suggestions).toHaveLength(4);
  });
});
