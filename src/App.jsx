import React, { useEffect, useMemo, useState } from "react";
import {
  WandSparkles, Palette, LayoutGrid, Users, ImagePlus, Settings2,
  Download, RefreshCw, BookOpen, ShieldCheck, Plus, Trash2, AlertCircle,
  LoaderCircle, Heart, ChevronDown, Sparkles
} from "lucide-react";

const styles = [
  "Japanese Manga", "American Superhero Comics", "Korean Webtoon",
  "European Bande Dessinée", "3D Animated Cartoon", "Cinematic Graphic Novel",
  "Watercolor Illustrated Comics", "Retro Pop Art Comics", "Fine-Art Realism",
  "European Erotic", "Japanese Ecchi", "Korean Adult Manhwa", "3D Rendered / CGI Comics",
  "Dark Cinematic Romantic Realism", "Pulp Magazine",
  "Intimate Oil Painting with Thick Expressive Impasto Brushstrokes",
  "Detailed Pencil Sketch", "Realistic Charcoal and Graphite Pencil Sketch on Vintage Textured Sepia Paper",
  "Baroque Oil Painting", "Franco-Belgian & Italian Bande Dessinée"
];
const panelCounts = [1, 2, 3, 4, 5, 6, 7, 8, 9, 12];
const options = {
  genre: ["Romance", "Passionate Romance", "Romantic Comedy", "Drama", "Thriller", "Mystery", "Horror", "Fantasy", "Dark Romance", "Adventure", "Action", "Historical", "Science Fiction", "Slice of Life", "Supernatural", "Psychological Drama"],
  layout: ["Classic Grid", "Cinematic Layout", "Vertical Webtoon", "Asymmetrical Layout", "Dynamic Diagonal Panels", "Full-width Cinematic Panels", "Large Splash Panel with Smaller Insets", "Magazine Layout", "Custom Composition"],
  mood: ["Romantic", "Intimate", "Passionate", "Sensual", "Playful", "Emotional", "Melancholic", "Mysterious", "Suspenseful", "Dark", "Dramatic", "Epic", "Dreamlike"],
  color: ["Full Vibrant Color", "Cinematic Color Grading", "Warm Golden Tones", "Cool Moody Tones", "Dark Noir", "Pastel Palette", "Muted Vintage Colors", "Monochrome", "Black and White Ink", "Sepia", "Watercolor Palette", "Rich Oil Painting Palette"],
  ending: ["Cliffhanger", "Romantic Payoff", "Dramatic Reveal", "Action Climax", "Emotional Resolution", "Open Ending", "Unexpected Twist", "User Defined"],
  ratio: ["Portrait 2:3", "Portrait 3:4", "Vertical 9:16", "Landscape 16:9", "Square 1:1", "Comic Page A4"],
  dialogue: ["Dialogue and Narration", "Dialogue Only", "Narration Only", "Minimal Dialogue", "No Text"],
  detail: ["Standard", "Highly Detailed", "Ultra Detailed", "Photorealistic", "Premium Cinematic"]
};
const defaults = {
  style: "Japanese Manga", genre: "Romance", panels: 8, layout: "Cinematic Layout",
  scene: "A passionate romantic encounter between two adult lovers during a rainstorm in Paris.",
  characters: "Use the uploaded character references. Preserve exact facial identities, hairstyles, skin tones and natural body proportions.",
  outfit: "Maintain consistent outfits throughout the story.", mood: "Passionate",
  color: "Full Vibrant Color", dialogue: "Dialogue and Narration", detail: "Ultra Detailed",
  ratio: "Portrait 2:3", ending: "Romantic Payoff", adultMode: false
};
function load(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function Field({ label, children, hint }) {
  return <label className="field"><span className="field-label">{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}
function Select({ value, onChange, items }) {
  return <div className="select-wrap"><select value={value} onChange={e => onChange(e.target.value)}>{items.map(item => <option key={item}>{item}</option>)}</select><ChevronDown size={16}/></div>;
}

export default function App() {
  const [config, setConfig] = useState(() => ({ ...defaults, ...load("ccp-config", {}) }));
  const [provider, setProvider] = useState("venice");
  const [veniceModel, setVeniceModel] = useState("z-image-turbo");
  const [result, setResult] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [health, setHealth] = useState({});
  const [history, setHistory] = useState(() => load("ccp-history", []));
  const [refs, setRefs] = useState([]);
  const [saved, setSaved] = useState(() => load("ccp-characters", []));
  const [characterName, setCharacterName] = useState("");
  const [advanced, setAdvanced] = useState(false);

  useEffect(() => { fetch("/api/health").then(r => r.json()).then(setHealth).catch(() => {}); }, []);
  useEffect(() => { localStorage.setItem("ccp-config", JSON.stringify(config)); }, [config]);
  useEffect(() => { localStorage.setItem("ccp-history", JSON.stringify(history.slice(0, 20))); }, [history]);
  useEffect(() => { localStorage.setItem("ccp-characters", JSON.stringify(saved)); }, [saved]);
  const set = (key, value) => setConfig(c => ({ ...c, [key]: value }));
  const promptPreview = useMemo(() => config.style + " · " + config.panels + " panels · " + config.genre + " · " + config.layout, [config]);

  async function generate() {
    setBusy(true); setError(""); setResult(""); setStatus("Sending your comic brief…");
    try {
      const payload = { ...config, referenceImages: refs.map(x => x.url) };
      const response = await fetch("/api/generate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, config: payload, veniceModel })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Generation failed.");
      let image = data.image;
      if (provider === "replicate" && data.predictionId && data.status !== "succeeded") {
        let completed = false;
        for (let i = 0; i < 90; i++) {
          await new Promise(resolve => setTimeout(resolve, 2500));
          const poll = await fetch("/api/replicate/" + data.predictionId);
          const p = await poll.json();
          if (!poll.ok) throw new Error(p.error || "Could not check generation.");
          if (p.status === "succeeded") { image = p.image; completed = true; break; }
          if (["failed", "canceled"].includes(p.status)) throw new Error(p.error || "Replicate job " + p.status + ".");
          setStatus("Rendering full page with Replicate… " + Math.min(99, Math.round((i + 1) / 90 * 100)) + "%");
        }
        if (!completed) throw new Error("Generation is taking longer than expected. Check your Replicate dashboard.");
      }
      if (!image) throw new Error("The provider completed without returning an image. Check your model output configuration.");
      setResult(image);
      setStatus(data.blurred ? "Generated. Venice marked the result as blurred." : "Your complete comic page is ready.");
      setHistory(h => [{ id: Date.now(), image, config: { ...config }, provider }, ...h]);
    } catch (e) {
      setError(e.message || "Something went wrong.");
      setStatus("");
    } finally { setBusy(false); }
  }

  function saveCharacter() {
    if (!characterName.trim()) return;
    setSaved(c => [{ id: Date.now(), name: characterName.trim(), characters: config.characters, outfit: config.outfit }, ...c]);
    setCharacterName("");
  }
  function useCharacter(c) { set("characters", c.characters); set("outfit", c.outfit); }
  function downloadImage(src, name = "comic-creator-pro.png") {
    const a = document.createElement("a"); a.href = src; a.download = name; a.target = "_blank"; a.click();
  }
  function newComic() { setConfig(c => ({ ...c, scene: "", ending: "Romantic Payoff" })); setResult(""); setStatus(""); setError(""); window.scrollTo({ top: 0, behavior: "smooth" }); }

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><WandSparkles size={22}/></div><div><b>COMIC CREATOR</b><small>PRO STUDIO</small></div></div>
      <div className="side-label">WORKSPACE</div>
      <a className="nav active"><Palette size={17}/> Comic Studio</a>
      <a className="nav" href="#characters"><Users size={17}/> Character Library</a>
      <a className="nav" href="#gallery"><ImagePlus size={17}/> My Creations</a>
      <div className="side-bottom"><div className="side-status"><span className="pulse"/> Studio ready</div><small>Version 1.0 · Local workspace</small></div>
    </aside>

    <main className="main">
      <header className="topbar"><div className="crumb">Workspace <span>/</span> <b>Comic Studio</b></div>
        <div className="top-actions"><span className={"provider-status " + (health.venice ? "online" : "")}>● Venice {health.venice ? "connected" : "not configured"}</span><span className={"provider-status " + (health.replicate ? "online" : "")}>● Replicate {health.replicate ? "connected" : "not configured"}</span></div>
      </header>

      <section className="hero"><div><div className="eyebrow"><Sparkles size={13}/> YOUR CREATIVE UNIVERSE</div><h1>Bring your stories<br/><em>to life.</em></h1><p>Design cinematic comic pages with your favorite art styles, characters and AI models.</p></div><div className="hero-art"><div className="hero-orbit orbit-one"/><div className="hero-orbit orbit-two"/><div className="hero-stamp">PANEL<br/>TO<br/>PANEL</div><div className="hero-spark">✦</div></div></section>

      <div className="section-heading"><div><span className="step">01</span><div><h2>Comic configuration</h2><p>Shape every detail of your next comic page.</p></div></div><span className="autosave">✓ Auto-saved</span></div>

      <section className="studio-grid">
        <div className="form-column">
          <div className="panel-card">
            <div className="card-heading"><span className="icon-tile"><Palette size={18}/></span><div><h3>Art direction</h3><p>Choose the visual language of your comic.</p></div></div>
            <Field label="ART STYLE"><Select value={config.style} onChange={v => set("style", v)} items={styles}/></Field>
            <div className="two-col">
              <Field label="GENRE"><Select value={config.genre} onChange={v => set("genre", v)} items={options.genre}/></Field>
              <Field label="EMOTIONAL ATMOSPHERE"><Select value={config.mood} onChange={v => set("mood", v)} items={options.mood}/></Field>
            </div>
            <Field label="COLOR TREATMENT"><Select value={config.color} onChange={v => set("color", v)} items={options.color}/></Field>
          </div>

          <div className="panel-card">
            <div className="card-heading"><span className="icon-tile"><LayoutGrid size={18}/></span><div><h3>Panel composition</h3><p>Control pacing, layout and page proportions.</p></div></div>
            <Field label="NUMBER OF PANELS"><div className="panel-counts">{panelCounts.map(n => <button key={n} className={config.panels === n ? "count active" : "count"} onClick={() => set("panels", n)}>{n}</button>)}</div></Field>
            <Field label="PANEL ARRANGEMENT"><Select value={config.layout} onChange={v => set("layout", v)} items={options.layout}/></Field>
            <Field label="ASPECT RATIO"><Select value={config.ratio} onChange={v => set("ratio", v)} items={options.ratio}/></Field>
          </div>

          <div className="panel-card">
            <div className="card-heading"><span className="icon-tile"><BookOpen size={18}/></span><div><h3>Story & scene</h3><p>Give your characters a world to move through.</p></div></div>
            <Field label="SCENE / STORY" hint="Describe the location, action, important moments and story progression."><textarea rows="5" value={config.scene} onChange={e => set("scene", e.target.value)} placeholder="Describe your comic scene…"/></Field>
            <Field label="CHARACTER IDENTITY & REFERENCES"><textarea rows="3" value={config.characters} onChange={e => set("characters", e.target.value)}/></Field>
            <Field label="OUTFIT CONTINUITY"><input value={config.outfit} onChange={e => set("outfit", e.target.value)}/></Field>
            <div className="reference-drop"><ImagePlus size={20}/><div><b>Character reference images</b><small>Upload identity references. Replicate references are sent only when the selected model is configured to accept them.</small></div>
              <input type="file" accept="image/*" multiple onChange={e => Array.from(e.target.files || []).forEach(file => { const reader = new FileReader(); reader.onload = () => setRefs(old => [...old, { name: file.name, url: String(reader.result) }]); reader.readAsDataURL(file); })}/>
              {refs.length > 0 && <small>{refs.length} reference file(s) ready</small>}
            </div>
            <div id="characters" className="character-save"><input placeholder="Character set name" value={characterName} onChange={e => setCharacterName(e.target.value)}/><button className="outline-btn" onClick={saveCharacter}><Plus size={15}/> Save character setup</button></div>
            {saved.length > 0 && <div className="saved-list">{saved.map(c => <div className="saved-item" key={c.id}><button onClick={() => useCharacter(c)}>{c.name}</button><button className="icon-button" onClick={() => setSaved(s => s.filter(x => x.id !== c.id))}><Trash2 size={14}/></button></div>)}</div>}
          </div>

          <div className="panel-card">
            <div className="card-heading"><span className="icon-tile"><Settings2 size={18}/></span><div><h3>Finishing details</h3><p>Typography, rendering quality and ending.</p></div></div>
            <Field label="DIALOGUE & NARRATION"><Select value={config.dialogue} onChange={v => set("dialogue", v)} items={options.dialogue}/></Field>
            <div className="two-col">
              <Field label="ILLUSTRATION DETAIL"><Select value={config.detail} onChange={v => set("detail", v)} items={options.detail}/></Field>
              <Field label="STORY ENDING"><Select value={config.ending} onChange={v => set("ending", v)} items={options.ending}/></Field>
            </div>
          </div>

          <div className="panel-card provider-card">
            <div className="card-heading"><span className="icon-tile"><Settings2 size={18}/></span><div><h3>AI generation engine</h3><p>Choose which connected provider renders your page.</p></div></div>
            <div className="provider-options">
              <button className={provider === "venice" ? "provider-option selected" : "provider-option"} onClick={() => setProvider("venice")}><b>Venice AI</b><small>Image generation API</small><span>{health.venice ? "Connected" : "Needs API key"}</span></button>
              <button className={provider === "replicate" ? "provider-option selected" : "provider-option"} onClick={() => setProvider("replicate")}><b>Replicate</b><small>Configurable model endpoint</small><span>{health.replicate ? "Connected" : "Needs API key + model"}</span></button>
            </div>
            {provider === "venice" && <Field label="VENICE MODEL"><input value={veniceModel} onChange={e => setVeniceModel(e.target.value)} title="Set VENICE_IMAGE_MODEL in server .env"/></Field>}
            <div className="provider-note"><ShieldCheck size={16}/> Provider credentials stay on your server. Model availability and content rules are controlled by each provider.</div>
            <button className="advanced-toggle" onClick={() => setAdvanced(v => !v)}><Settings2 size={15}/> Advanced content settings <ChevronDown size={15}/></button>
            {advanced && <div className="adult-settings"><label className="toggle-row"><span><b>18+ mature-content mode</b><small>For adult-only fictional characters and themes. Provider policies still apply.</small></span><input type="checkbox" checked={!!config.adultMode} onChange={e => { if (e.target.checked && window.confirm("I confirm I am 18 or older and will only create content featuring clearly adult fictional characters. Provider policies still apply.")) set("adultMode", true); else set("adultMode", false); }}/></label>
              {config.adultMode && <div className="adult-warning">Confirm that you are 18 or older. All depicted characters must be clearly adults. This setting cannot bypass provider restrictions or make unsupported models generate prohibited content.</div>}
              <p className="tiny-note">Provider safeguards and model restrictions always apply.</p>
            </div>}
          </div>
        </div>

        <aside className="preview-column">
          <div className="preview-card">
            <div className="preview-top"><div><span className="step">LIVE PREVIEW</span><h3>Your creative brief</h3></div><span className="live-dot">● READY</span></div>
            <div className="preview-art"><div className="preview-skeleton"><div className="skeleton-bar wide"/><div className="skeleton-row"><i/><i/></div><div className="skeleton-bar"/><div className="skeleton-row"><i/><i/><i/></div></div><div className="preview-overlay"><Sparkles size={19}/><b>Your story starts here</b><span>Your comic artwork will appear after generation.</span></div></div>
            <div className="preview-meta"><div><small>ART STYLE</small><b>{config.style}</b></div><div><small>PANELS</small><b>{config.panels}</b></div><div><small>GENRE</small><b>{config.genre}</b></div><div><small>ENDING</small><b>{config.ending}</b></div></div>
            <div className="tip-card"><Sparkles size={18}/><div><b>Artist tip</b><p>For better continuity, describe the characters' positions, outfits and location in the scene. Use the same reference images for every episode.</p></div></div>
            <div className="security-card"><ShieldCheck size={18}/><div><b>Private API credentials</b><p>Your keys are stored in the backend environment, never in browser code or local storage.</p></div></div>
          </div>

          <div className="generate-wrap"><div className="prompt-summary"><span>YOUR CONFIGURATION</span><b>{promptPreview}</b><small>One cohesive comic page · {config.dialogue} · {config.detail}</small></div>
            <button className="generate-btn" disabled={busy || !config.scene.trim()} onClick={generate}>{busy ? <><LoaderCircle className="spin" size={19}/> Generating your comic…</> : <><WandSparkles size={19}/> Generate comic page <span>✦</span></>}</button>
            <small className="generate-foot">One provider request creates one image containing the complete {config.panels}-panel page. Generation time and cost depend on your selected model and provider.</small>
          </div>
        </aside>
      </section>

      {(busy || error || result) && <section className="result-section"><div className="section-heading"><div><span className="step">02</span><div><h2>Comic output</h2><p>{status || "Your generated page."}</p></div></div></div>
        {error && <div className="error-box"><AlertCircle size={17}/>{error}</div>}
        {result && <div className="result-card"><img src={result} alt="Generated complete comic page"/><div className="result-actions"><button className="outline-btn" onClick={() => downloadImage(result)}><Download size={16}/> Download comic</button><button className="outline-btn" onClick={generate}><RefreshCw size={16}/> Regenerate</button><button className="primary-small" onClick={newComic}><Plus size={16}/> New comic</button></div></div>}
      </section>}

      <section id="gallery" className="gallery-section"><div className="section-heading"><div><span className="step">03</span><div><h2>Recent creations</h2><p>Your latest generated comic pages on this device.</p></div></div></div>
        {history.length === 0 ? <div className="empty-gallery"><ImagePlus size={24}/><b>Your gallery is waiting</b><span>Generated comics will appear here.</span></div> : <div className="history-grid">{history.map(item => <button className="history-thumb" key={item.id} onClick={() => { setResult(item.image); setConfig(item.config); setProvider(item.provider); window.scrollTo({ top: 0, behavior: "smooth" }); }}><img src={item.image} alt="Past comic"/><span>{item.config.style} · {item.config.panels} panels</span></button>)}</div>}
      </section>
      <footer>COMIC CREATOR PRO <span>Made for storytellers.</span></footer>
    </main>
  </div>;
}
