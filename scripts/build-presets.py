"""Original hymns: full three-stanza backing tracks and syllable-derived word timings.
No commercial recordings, cloned voices, or externally licensed lyrics are included.
"""
import array, json, math, re, wave
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
SONGS = json.loads((ROOT / 'scripts/hymns.json').read_text())
SYLLABLES = {w: n for n, words in {2: 'elon carry distant honest questions becomes shelter lessen alone patient teacher within beyond welcome beside today away again above outlive', 3: 'messiah'}.items() for w in words.split()}
RATE = 16000
DURATIONS = [1, 1, 1, 1, .5, .5, 1, 2]
def add_note(audio, pitch, start, duration, volume, tone=0):
    frequency = 440 * 2 ** ((pitch - 69) / 12)
    first = int(start * RATE)
    length = int(duration * RATE)
    for n in range(length):
        if first+n >= len(audio): break
        t = n / RATE
        env = min(1, t / .02) * min(1, (duration-t) / .05)
        phase = 2 * math.pi * frequency * t
        value = math.sin(phase) + .3 * math.sin(2*phase) + .12 * math.sin(3*phase)
        if tone: value += .12*math.sin(4*phase)
        audio[first+n] += volume * env * value
presets = []
for song in SONGS:
    beat = 60 / song['tempo']
    # Four-beat count-in, 3 x 32 beats, two four-beat interludes, four-beat tail.
    duration = 112 * beat
    audio = array.array('f', [0]) * int(duration * RATE)
    lines = []
    cursor = 4 * beat
    for verse, stanza in enumerate(song['stanzas']):
        for row, text in enumerate(stanza):
            notes = song['melody'][row]
            start = cursor
            for pitch, beats in zip(notes, DURATIONS):
                add_note(audio, pitch, cursor, beats*beat*.96, .20, verse)
                cursor += beats*beat
            tokens = text.split()
            syllables = [SYLLABLES.get(re.sub('[^a-z]', '', word.lower()), 1) for word in tokens]
            assert sum(syllables) == 8, (text, sum(syllables))
            note = 0; time = start; words = []
            for word, count in zip(tokens, syllables):
                end = time + sum(DURATIONS[note:note+count])*beat
                words.append({'text': word, 'start': round(time, 4), 'end': round(end, 4)})
                note += count; time = end
            lines.append({'start': round(start, 4), 'end': round(cursor, 4), 'words': words})
        if verse < 2: cursor += 4*beat
    # A changing accompaniment makes repeated verses distinguishable to matching.
    scale = [0, 4, 7] if song['key'] != 'A minor' else [0, 3, 7]
    tonic = 48 if song['key'] == 'C major' else 43 if song['key'] == 'G major' else 45
    for b in range(112):
        section = min(2, max(0, (b-4)//36))
        root = tonic + [0, 5, 7, 0][(b//8)%4]
        add_note(audio, root, b*beat, beat*.9, .045)
        add_note(audio, root + 12 + scale[(b+section)%3], b*beat, beat*.7, .065)
        # Stanza-specific quiet upper countermelody, original synthesized audio.
        add_note(audio, tonic+24+[0,2,4,7,9,7,4,2][(b*(section+1)+section)%8], (b+.5)*beat, beat*.4, .025)
    for b in range(4): add_note(audio, 84, b*beat, .055, .045)
    peak = max(abs(v) for v in audio) or 1
    pcm = array.array('h', (int(v / peak * 27000) for v in audio))
    destination = ROOT/'web/public/audio'/f"{song['id']}.wav"
    with wave.open(str(destination), 'wb') as out:
        out.setnchannels(1); out.setsampwidth(2); out.setframerate(RATE); out.writeframes(pcm.tobytes())
    presets.append({'id': song['id'], 'title': song['title'], 'artist': 'Church of Elon · original hymn', 'credit': 'Original Church of Elon words and synthesized instrumental melody. Three stanzas; four-beat count-in and interludes. No sung vocals.', 'audioUrl': f"/audio/{song['id']}.wav", 'duration': duration, 'timing': 'word', 'lines': lines})
(ROOT/'web/src/data/presets.json').write_text(json.dumps(presets, indent=2)+'\n')
print(f'Built {len(presets)} full-length original recordings with word timing.')
