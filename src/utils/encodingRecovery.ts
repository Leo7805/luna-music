import { cleanTrackTitle } from './formatters';

/**
 * Utilities for detecting and safely recovering legacy-encoded CJK text (GBK/Big5)
 * misdecoded as Latin-1 / ISO-8859-1 in audio metadata tags (ID3v1 / ID3v2).
 */

/**
 * Checks whether a string contains typical Latin-1 / Windows-1252 mojibake
 * resulting from legacy multi-byte CJK encodings (GBK / CP936 / Big5).
 *
 * Safeguards:
 * - Does not flag valid UTF-8 / Unicode strings containing real CJK or extended characters (> 0xFF).
 * - Does not flag typical European text with isolated accents (e.g. Café, Über, Björk, Sigur Rós, Año).
 */
export function isLikelyMojibake(str: string): boolean {
  if (!str || str.length === 0) return false;

  // If the string already contains characters outside Latin-1 (> 0xFF),
  // it is already proper Unicode (e.g. CJK, Japanese Kana, Cyrillic, Greek, etc.).
  for (let i = 0; i < str.length; i++) {
    if (str.charCodeAt(i) > 0xFF) {
      return false;
    }
  }

  let highByteCount = 0;
  let consecutiveHigh = 0;
  let maxConsecutiveHigh = 0;

  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code >= 0x80 && code <= 0xFF) {
      highByteCount++;
      consecutiveHigh++;
      if (consecutiveHigh > maxConsecutiveHigh) {
        maxConsecutiveHigh = consecutiveHigh;
      }
    } else {
      consecutiveHigh = 0;
    }
  }

  // European words rarely contain 3+ consecutive high-byte characters.
  // Legacy 2-byte CJK characters misread as Latin-1 produce runs of 2, 4, 6, 8+ consecutive high bytes.
  const ratio = highByteCount / str.length;
  if (maxConsecutiveHigh >= 3) return true;
  if (maxConsecutiveHigh >= 2 && ratio >= 0.35) return true;
  if (ratio >= 0.5 && highByteCount >= 2) return true;

  // Specific high-frequency mojibake markers from CJK lead bytes (0xC0 - 0xDF)
  const mojibakeChars = (str.match(/[ÃÂÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖ×ØÙÚÛÜÝÞßàáâãäåæçèéêëìíîïðñòóôõö÷øùúûüýþÿ]/g) || []).length;
  if (mojibakeChars >= 4 && mojibakeChars / str.length >= 0.4) return true;

  return false;
}

/**
 * Attempts to recover legacy multi-byte CJK text (GBK or Big5) that was
 * misinterpreted as Latin-1 / ISO-8859-1.
 *
 * Returns the decoded string if it successfully decodes to valid CJK ideographs,
 * or null if recovery fails or produces insufficient confidence.
 */
export function recoverGbkOrBig5(str: string): string | null {
  if (!str || !isLikelyMojibake(str)) return null;

  // Convert Latin-1 char codes back to raw byte values
  const bytes = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code > 0xFF) {
      return null;
    }
    bytes[i] = code & 0xFF;
  }

  const candidates: { text: string; score: number }[] = [];

  // 1. Try GBK / GB18030 decoding (covers Simplified Chinese Windows XP/7/10 tags)
  try {
    const decoded = new TextDecoder('gbk', { fatal: true }).decode(bytes);
    if (!/[\ue000-\uf8ff\ufffd]/.test(decoded)) {
      const cjkMatches = (decoded.match(/[\u4e00-\u9fa5]/g) || []).length;
      const nonPunctuationLength = decoded.replace(/[\s\d\p{P}]/gu, '').length;
      if (cjkMatches > 0 && cjkMatches >= nonPunctuationLength * 0.4) {
        candidates.push({ text: decoded, score: cjkMatches / Math.max(1, nonPunctuationLength) });
      }
    }
  } catch {
    // Not valid GBK
  }

  // 2. Try Big5 decoding (covers Traditional Chinese tags)
  try {
    const decoded = new TextDecoder('big5', { fatal: true }).decode(bytes);
    if (!/[\ue000-\uf8ff\ufffd]/.test(decoded)) {
      const cjkMatches = (decoded.match(/[\u4e00-\u9fa5]/g) || []).length;
      const nonPunctuationLength = decoded.replace(/[\s\d\p{P}]/gu, '').length;
      if (cjkMatches > 0 && cjkMatches >= nonPunctuationLength * 0.4) {
        candidates.push({ text: decoded, score: cjkMatches / Math.max(1, nonPunctuationLength) });
      }
    }
  } catch {
    // Not valid Big5
  }

  if (candidates.length > 0) {
    candidates.sort((a, b) => b.score - a.score);
    return candidates[0].text;
  }

  return null;
}

/**
 * Sanitizes a track title parsed from audio tags.
 *
 * Rules:
 * 1. If rawTitle is clean and not mojibake, prefer rawTitle.
 * 2. If rawTitle is mojibake:
 *    - Attempt recovery via GBK / Big5.
 *    - If fallbackTitle already contains clean Chinese characters:
 *      - If recovered matches fallbackTitle or contains high-confidence common CJK, use recovered.
 *      - Otherwise, prefer fallbackTitle over corrupted/unconfident text.
 *    - If recovery succeeds with high-confidence CJK and fallbackTitle had no CJK, use recovered.
 *    - If recovery fails, ALWAYS prefer fallbackTitle over displaying raw mojibake.
 */
export function sanitizeMetadataTitle(
  rawTitle: string | undefined | null,
  fallbackTitle: string
): string {
  const cleanRaw = rawTitle?.trim();
  const cleanFallback = cleanTrackTitle(fallbackTitle.trim());

  if (!cleanRaw) {
    return cleanFallback;
  }

  // If rawTitle does not look like mojibake, trust it
  if (!isLikelyMojibake(cleanRaw)) {
    return cleanRaw;
  }

  // Attempt recovery
  const recovered = recoverGbkOrBig5(cleanRaw);
  const fallbackHasCjk = /[\u4e00-\u9fa5]/.test(cleanFallback);

  if (recovered) {
    // If fallback already has clean Chinese characters:
    if (fallbackHasCjk) {
      if (cleanFallback.includes(recovered) || recovered.includes(cleanFallback)) {
        return cleanFallback.length >= recovered.length ? cleanFallback : recovered;
      }
      // If recovered is mostly common Chinese ideographs, verify it makes sense
      const recoveredCjkCount = (recovered.match(/[\u4e00-\u9fa5]/g) || []).length;
      if (recoveredCjkCount >= 2 && !/[\u4e00-\u9fa5]/.test(cleanFallback)) {
        return recovered;
      }
      return cleanFallback;
    }
    return recovered;
  }

  // Recovery failed or was unconfident: NEVER display raw mojibake if fallback is available
  if (cleanFallback && !isLikelyMojibake(cleanFallback)) {
    return cleanFallback;
  }

  return cleanRaw;
}

/**
 * Sanitizes an artist or album string from audio tags.
 * If mojibake is detected, attempts recovery; if unrecoverable, falls back to undefined or fallback.
 */
export function sanitizeMetadataField(
  rawValue: string | undefined | null,
  fallbackValue?: string
): string | undefined {
  const clean = rawValue?.trim();
  if (!clean) return fallbackValue;

  if (!isLikelyMojibake(clean)) {
    return clean;
  }

  const recovered = recoverGbkOrBig5(clean);
  if (recovered) {
    return recovered;
  }

  if (fallbackValue && !isLikelyMojibake(fallbackValue)) {
    return fallbackValue;
  }

  return undefined;
}
