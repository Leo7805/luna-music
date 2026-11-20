import { describe, it, expect } from 'vitest';
import {
  isLikelyMojibake,
  recoverGbkOrBig5,
  sanitizeMetadataTitle,
  sanitizeMetadataField,
} from '../src/utils/encodingRecovery';
import { mergeTrackMetadataAndSources } from '../src/utils/trackIdentity';
import { TrackItem } from '../src/types/music';

describe('Chinese Metadata Mojibake Recovery & Unicode Preservation', () => {
  // Scenario 1: Valid UTF-8 Chinese preserved
  it('preserves valid UTF-8 Chinese titles, artists, and albums without modification', () => {
    const titles = ['七里香', '晴天', '青花瓷', '夜曲', '千里之外'];
    titles.forEach((title) => {
      expect(isLikelyMojibake(title)).toBe(false);
      expect(sanitizeMetadataTitle(title, `${title}.mp3`)).toBe(title);
      expect(sanitizeMetadataField(title)).toBe(title);
    });

    const artist = '周杰伦';
    const album = '七里香';
    expect(sanitizeMetadataField(artist)).toBe(artist);
    expect(sanitizeMetadataField(album)).toBe(album);
  });

  // Scenario 2: Corrupted ID3 with clean Chinese filename fallback
  it('falls back to clean filename title when ID3 title is corrupted and unrecoverable', () => {
    // A corrupted string with high unprintable/replacement characters or non-GBK mojibake
    const corruptedId3 = 'ï¿½ï¿½ï¿½ï¿½';
    const filename = '青花瓷.mp3';
    const sanitized = sanitizeMetadataTitle(corruptedId3, filename);
    expect(sanitized).toBe('青花瓷');
  });

  // Scenario 3: Legacy ID3 recovery for GBK misdecoded as Latin-1
  it('recovers legacy GBK encoded ID3 titles misdecoded as Latin-1', () => {
    // "没有情人的情人节" in GBK:
    // 没 (c3 bb), 有 (d3 d0), 情 (c7 e9), 人 (c8 cb), 的 (b5 c4), 情 (c7 e9), 人 (c8 cb), 节 (bd da)
    // In Latin-1, these bytes map to:
    const gbkMojibake = '\xc3\xbb\xd3\xd0\xc7\xe9\xc8\xcb\xb5\xc4\xc7\xe9\xc8\xcb\xbd\xda';
    
    expect(isLikelyMojibake(gbkMojibake)).toBe(true);
    const recovered = recoverGbkOrBig5(gbkMojibake);
    expect(recovered).toBe('没有情人的情人节');

    const sanitized = sanitizeMetadataTitle(gbkMojibake, 'track_01.mp3');
    expect(sanitized).toBe('没有情人的情人节');
  });

  it('recovers legacy Big5 encoded ID3 metadata', () => {
    // "音樂" in Big5:
    // 音 (ad b5), 樂 (bc d6)
    const big5Mojibake = '\xad\xb5\xbc\xd6';
    expect(isLikelyMojibake(big5Mojibake)).toBe(true);
    const recovered = recoverGbkOrBig5(big5Mojibake);
    expect(recovered).toBe('音樂');
  });

  // Scenario 4: Non-Chinese European accents & Unicode preserved
  it('preserves French, German, Spanish, Icelandic, and symbols without false positives', () => {
    const internationalTexts = [
      "Chanson d'amour",
      'Café de Flore',
      'Schöne Grüße aus Berlin',
      'Über den Wolken',
      'Canción del Mariachi',
      'El Niño',
      'Sigur Rós - Hoppípolla',
      'Björk - Jóga',
      'Dvořák - Symphony No. 9',
      'Café Müller & Bar (100% Hits!)',
      'Rock & Roll #1 ★ Special Edition',
    ];

    internationalTexts.forEach((text) => {
      expect(isLikelyMojibake(text)).toBe(false);
      expect(sanitizeMetadataTitle(text, `${text}.mp3`)).toBe(text);
      expect(sanitizeMetadataField(text)).toBe(text);
    });
  });

  // Scenario 5: Japanese and other CJK scripts preserved
  it('preserves Japanese Kanji, Hiragana, and Katakana', () => {
    const japaneseTexts = [
      '宇多田ヒカル',
      'First Love',
      '残酷な天使のテーゼ',
      '久石譲 - Summer',
      '坂本龍一 - Merry Christmas Mr. Lawrence',
    ];

    japaneseTexts.forEach((text) => {
      expect(isLikelyMojibake(text)).toBe(false);
      expect(sanitizeMetadataTitle(text, `${text}.mp3`)).toBe(text);
    });
  });

  // Scenario 6: Delayed metadata updates do not overwrite clean title with mojibake
  it('prevents delayed metadata extraction from overwriting clean Chinese titles with mojibake', () => {
    const existingTrack: TrackItem = {
      id: 'track-1',
      name: '青花瓷.mp3',
      relativePath: '周杰伦/青花瓷.mp3',
      size: 4096000,
      lastModified: 1700000000,
      metadata: {
        title: '青花瓷',
        artist: '周杰伦',
        album: '我很忙',
        isMetadataLoaded: false,
      },
      folderIds: ['root-1'],
    };

    // Incoming delayed metadata has mojibake title
    const gbkMojibake = '\xc3\xbb\xd3\xd0\xc7\xe9\xc8\xcb\xb5\xc4\xc7\xe9\xc8\xcb\xbd\xda';
    const incomingTrack: TrackItem = {
      ...existingTrack,
      metadata: {
        title: gbkMojibake,
        artist: '\xd6\xdc\xbd\xdc\xc2\xd7', // "周杰伦" in GBK Latin-1
        album: 'Unknown',
        isMetadataLoaded: true,
      },
    };

    const merged = mergeTrackMetadataAndSources(existingTrack, incomingTrack);

    // Clean existing Chinese title is safely preserved against unrelated tag
    expect(merged.metadata.title).toBe('青花瓷');
    expect(merged.metadata.artist).toBe('周杰伦');
    expect(merged.metadata.isMetadataLoaded).toBe(true);

    // If existing title had non-CJK fallback, recovered title is used
    const nonCjkTrack: TrackItem = {
      ...existingTrack,
      name: 'track_01.mp3',
      metadata: {
        title: 'track 01',
        artist: 'Unknown Artist',
        album: 'Unknown Album',
        isMetadataLoaded: false,
      },
    };
    const incomingNonCjk: TrackItem = {
      ...nonCjkTrack,
      metadata: {
        title: gbkMojibake,
        artist: '\xd6\xdc\xbd\xdc\xc2\xd7',
        album: 'Unknown Album',
        isMetadataLoaded: true,
      },
    };
    const mergedNonCjk = mergeTrackMetadataAndSources(nonCjkTrack, incomingNonCjk);
    expect(mergedNonCjk.metadata.title).toBe('没有情人的情人节');
    expect(mergedNonCjk.metadata.artist).toBe('周杰伦');
  });

  // Scenario 7: Fallback to existing clean title if incoming ID3 is unrecoverable mojibake
  it('retains existing clean title if incoming ID3 title is unrecoverable mojibake', () => {
    const existingTrack: TrackItem = {
      id: 'track-2',
      name: '晴天.mp3',
      relativePath: '晴天.mp3',
      size: 3000000,
      lastModified: 1700000000,
      metadata: {
        title: '晴天',
        artist: '周杰伦',
        album: '叶惠美',
        isMetadataLoaded: false,
      },
    };

    const unrecoverableMojibake = 'ï¿½ï¿½ï¿½ï¿½';
    const incomingTrack: TrackItem = {
      ...existingTrack,
      metadata: {
        title: unrecoverableMojibake,
        artist: '周杰伦',
        album: '叶惠美',
        isMetadataLoaded: true,
      },
    };

    const merged = mergeTrackMetadataAndSources(existingTrack, incomingTrack);
    expect(merged.metadata.title).toBe('晴天');
  });

  // Scenario 8: Distinct physical tracks with similar names are not conflated
  it('does not conflate distinct physical tracks with similar names', () => {
    const track1: TrackItem = {
      id: 'track-sim-1',
      name: '晴天 (Live).mp3',
      relativePath: 'folderA/晴天 (Live).mp3',
      size: 5000000,
      lastModified: 1700000000,
      metadata: {
        title: '晴天 (Live)',
        artist: '周杰伦',
        album: 'Live',
        isMetadataLoaded: true,
      },
    };

    const track2: TrackItem = {
      id: 'track-sim-2',
      name: '晴天.mp3',
      relativePath: 'folderB/晴天.mp3',
      size: 4000000,
      lastModified: 1700000001,
      metadata: {
        title: '晴天',
        artist: '周杰伦',
        album: '叶惠美',
        isMetadataLoaded: true,
      },
    };

    expect(track1.id).not.toBe(track2.id);
    expect(track1.name).not.toBe(track2.name);
    expect(track1.metadata.title).not.toBe(track2.metadata.title);
  });
});
