import { useEffect, useRef, useState } from 'react'
import { PageHeader, useToast } from '@freeappstore/sdk/ui'
import { clock, parseLrc, tappedLines, validateLines, type Song } from '../lyrics/model'
import { decode } from '../audio/decode'
import { saveSong, type StoredSong } from '../lyrics/storage'
export function Editor({ onSave }: { onSave: (song: Song) => void }) {
  const toast = useToast(), player = useRef<HTMLAudioElement>(null)
  const [title, setTitle] = useState(''), [artist, setArtist] = useState(''), [lyrics, setLyrics] = useState('')
  const [file, setFile] = useState<File>(), [url, setUrl] = useState(''), [duration, setDuration] = useState(0), [time, setTime] = useState(0)
  const [method, setMethod] = useState<'tap'|'lrc'>('tap'), [taps, setTaps] = useState<number[]>([]), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const words = lyrics.trim() ? lyrics.trim().split(/\s+/) : []
  const currentLine = lyrics.trim().split(/\n+/).find((_, i, rows) => rows.slice(0,i+1).join(' ').split(/\s+/).length > taps.length)
  useEffect(()=> { if (!file) return; const value=URL.createObjectURL(file); setUrl(value); return ()=>URL.revokeObjectURL(value) },[file])
  const tap = () => {
    if (!player.current || player.current.paused || !duration) { toast.show('Play the recording, then tap as each word begins.'); return }
    if (taps.length >= words.length) return
    const value=player.current.currentTime
    if (taps.length && value <= taps.at(-1)!+.02) { toast.show('Seek forward, or undo the previous timing.',{variant:'error'}); return }
    setTaps([...taps,value]); setError('')
  }
  async function attach(file?: File) {
    if (!file) return
    setError(''); setBusy(true)
    try {
      if (file.size>40*1024*1024) throw new Error('Choose an audio file smaller than 40 MB.')
      const decoded=await decode(file)
      if (decoded.duration>3600) throw new Error('Choose a recording shorter than 60 minutes.')
      setFile(file); setDuration(decoded.duration); setTaps([]); if(!title) setTitle(file.name.replace(/\.[^.]+$/,''))
    } catch (e) { setError(e instanceof Error?e.message:String(e)) } finally {setBusy(false)}
  }
  async function save() {
    setError(''); setBusy(true)
    try {
      if(!file || !title.trim()) throw new Error('Add a recording and a song title first.')
      const parsed=method==='lrc'?parseLrc(lyrics,duration):{lines:tappedLines(lyrics,taps,duration),timing:'word' as const}
      const stored: StoredSong={id:crypto.randomUUID(),title:title.trim().slice(0,200),artist:artist.trim().slice(0,200)||'My recording',duration,lines:parsed.lines,timing:parsed.timing,local:true,audio:file}
      await saveSong(stored)
      toast.show('Saved in this browser. Export a song package to keep a backup.',{variant:'success'})
      onSave({...stored,audioUrl:URL.createObjectURL(file)})
    } catch(e) {setError(e instanceof Error?e.message:String(e))} finally {setBusy(false)}
  }
  async function importPackage(file?: File) {
    if(!file) return
    setError(''); setBusy(true)
    try {
      if(file.size>58*1024*1024) throw new Error('Song package is too large (maximum 58 MB).')
      const data=JSON.parse(await file.text())
      if(data.version!==1 || typeof data.audio!=='string' || !data.audio.startsWith('data:audio/') || typeof data.song?.title!=='string' || data.song.title.length>200 || typeof data.song.artist!=='string' || data.song.artist.length>200 || !['line','word'].includes(data.song.timing)) throw new Error('This is not a supported Karaoke song package.')
      const binary=atob(data.audio.split(',')[1]); if(binary.length>40*1024*1024) throw new Error('Recording exceeds 40 MB.')
      const blob=new Blob([Uint8Array.from(binary,c=>c.charCodeAt(0))],{type:data.audio.slice(5,data.audio.indexOf(';'))})
      const decoded=await decode(blob); validateLines(data.song.lines,decoded.duration)
      const stored: StoredSong={id:crypto.randomUUID(),title:data.song.title,artist:data.song.artist,duration:decoded.duration,lines:data.song.lines,timing:data.song.timing,local:true,audio:blob}
      await saveSong(stored); toast.show('Song imported.',{variant:'success'}); onSave({...stored,audioUrl:URL.createObjectURL(blob)})
    } catch(e) {setError(e instanceof Error?e.message:String(e))} finally {setBusy(false)}
  }
  return <><PageHeader title="Make a sing-along" description="Pair your recording with lyrics. Time the words once, then sing together."/>
    <div className="editor-grid"><section className="panel form-stack"><h2>1. Your song</h2><label>Song title<input maxLength={200} value={title} onChange={e=>setTitle(e.target.value)} placeholder="Give your song a name"/></label><label>Artist or credit<input maxLength={200} value={artist} onChange={e=>setArtist(e.target.value)} placeholder="Who made this recording?"/></label><label className="upload-box">Choose a recording<input type="file" accept="audio/*" disabled={busy} onChange={e=>void attach(e.target.files?.[0])}/><span>Audio stays in this browser · up to 40 MB / 60 minutes</span></label>{file&&<p>{file.name} · {clock(duration)}</p>}<p className="muted">Use audio and lyrics you have permission to use. The included hymns are original, instrumental backing tracks.</p></section>
    <section className="panel form-stack"><h2>2. Add lyrics</h2><label>Timing method<select value={method} onChange={e=>{setMethod(e.target.value as 'tap'|'lrc');setTaps([])}}><option value="tap">Tap each word as the recording plays</option><option value="lrc">Paste timed LRC / enhanced LRC</option></select></label><label>{method==='tap'?'Lyrics · one sung line per row':'Timed lyrics'}<textarea rows={9} maxLength={30000} value={lyrics} onChange={e=>{setLyrics(e.target.value);setTaps([]);setError('')}} placeholder={method==='tap'?'First line of your song\nSecond line of your song':'[00:05.00]<00:05.00>Hello <00:05.50>world\n[00:07.00]Next line'}/></label><p className="muted">{method==='tap'?'Tap at the beginning of every word. Repeated verses need their own lines. Editing lyrics resets your timing.':'Standard LRC highlights lines. Enhanced LRC uses <mm:ss.xx> before each word. No word times are guessed.'}</p></section></div>
    {method==='tap'&&<section className="panel timing-editor"><h2>3. Time your words</h2><audio ref={player} src={url||undefined} controls onTimeUpdate={e=>setTime(e.currentTarget.currentTime)}/><p>{clock(time)} / {clock(duration)} · {taps.length} of {words.length} words timed</p><p className="tap-context">{currentLine||'All words timed'}</p><button className="primary tap-button" disabled={!file||!words.length||taps.length>=words.length||busy} onClick={tap} onKeyDown={e=>{if(e.code==='Space'&&e.repeat)e.preventDefault()}}>{taps.length<words.length?<>Tap for <strong>“{words[taps.length]}”</strong></>:'✓ Timing complete'}</button><p>Focus this button and press Space at each word’s beginning, or tap it on your phone. Leave the last word long enough before the recording ends.</p><div className="button-row"><button disabled={!taps.length} onClick={()=>{const previous=taps.at(-1)!;setTaps(taps.slice(0,-1));if(player.current)player.current.currentTime=Math.max(0,previous-1)}}>Undo last word</button><button disabled={!taps.length} onClick={()=>{setTaps([]);if(player.current){player.current.pause();player.current.currentTime=0}}}>Start timing again</button></div></section>}
    {error&&<p role="alert" className="error-box">{error}</p>}<div className="save-row"><button className="primary" disabled={busy||!file} onClick={()=>void save()}>{busy?'Working…':'Save & sing'}</button><p>Saved locally, without an account. Export a package from your library to move it to another device.</p></div>
    <details className="panel"><summary>Already have a Karaoke song package?</summary><label>Import .karaoke.json<input disabled={busy} type="file" accept=".json,application/json" onChange={e=>void importPackage(e.target.files?.[0])}/></label></details>
  </>
}
