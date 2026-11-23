import React, { useEffect, useMemo, useState } from "react";
import {
  WandSparkles, Palette, LayoutGrid, Users, ImagePlus, Settings2,
  Download, RefreshCw, BookOpen, ShieldCheck, Plus, Trash2, AlertCircle,
  LoaderCircle, Heart, ChevronDown, Sparkles, LogOut, Mail
} from "lucide-react";
import AuthGate from "./AuthGate";
import { supabase } from "./lib/supabase";
import { artStyles, artTraditions, renderingTechniques, visualTreatments, adultSubgenres } from "./styleLibrary";

const styles = artStyles;
const panelCounts = [1, 2, 3, 4, 5, 6, 7, 8, 9, 12];
const options = {
  genre: ["Romance", "Passionate Romance", "Romantic Comedy", "Drama", "Thriller", "Mystery", "Horror", "Fantasy", "Dark Romance", "Adventure", "Action", "Historical", "Science Fiction", "Slice of Life", "Supernatural", "Psychological Drama", "Adult / NSFW (non-explicit mature themes)"],
  layout: ["Adaptive Cinematic (Reference)", "Cinematic Layout", "Vertical Webtoon", "Asymmetrical Layout", "Dynamic Diagonal Panels", "Full-width Cinematic Panels", "Large Splash Panel with Smaller Insets", "Classic Grid", "Magazine Layout", "Custom Composition"],
  mood: ["Romantic", "Intimate", "Passionate", "Sensual", "Playful", "Emotional", "Melancholic", "Mysterious", "Suspenseful", "Dark", "Dramatic", "Epic", "Dreamlike"],
  color: ["Full Vibrant Color", "Cinematic Color Grading", "Warm Golden Tones", "Cool Moody Tones", "Dark Noir", "Pastel Palette", "Muted Vintage Colors", "Monochrome", "Black and White Ink", "Sepia", "Watercolor Palette", "Rich Oil Painting Palette"],
  ending: ["Cliffhanger", "Romantic Payoff", "Dramatic Reveal", "Action Climax", "Emotional Resolution", "Open Ending", "Unexpected Twist", "User Defined"],
  ratio: ["Portrait 2:3", "Portrait 3:4", "Vertical 9:16", "Landscape 16:9", "Square 1:1", "Comic Page A4"],
  dialogue: ["Dialogue and Narration", "Dialogue Only", "Narration Only", "Minimal Dialogue", "No Text"],
  detail: ["Standard", "Highly Detailed", "Ultra Detailed", "Photorealistic", "Premium Cinematic"]
};
const defaults = {
  style: "Japanese Manga", genre: "Romance", panels: 8, layout: "Adaptive Cinematic (Reference)",
  scene: "A passionate romantic encounter between two adult lovers during a rainstorm in Paris.",
  characters: "Use the uploaded character references. Preserve exact facial identities, hairstyles, skin tones and natural body proportions.",
  outfit: "Maintain consistent outfits throughout the story.", mood: "Passionate",
  color: "Full Vibrant Color", dialogue: "Dialogue and Narration", detail: "Ultra Detailed",
  ratio: "Portrait 2:3", ending: "Romantic Payoff", adultMode: false,
  artTradition: "Fine-Art Realism", renderingTechnique: "Oil Painting", visualTreatment: "Dark Cinematic Romantic Realism", adultSubgenre: "Sensual Romance", sensuality: "Moderate", intimacy: "Passionate kissing and embraces", nudityTreatment: "Implied nudity with strategic shadows and drapery", identityLock: true, identityPriority: "Strict identity lock"
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
  const [provider, setProvider] = useState("openai");
  const [providerMode, setProviderMode] = useState("auto");
  const [veniceModel, setVeniceModel] = useState("z-image-turbo");
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [activeComicId, setActiveComicId] = useState(null);
  const [refinement, setRefinement] = useState("");
  const [refining, setRefining] = useState(false);
  const [result, setResult] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [health, setHealth] = useState({});
  const [history, setHistory] = useState(() => load("ccp-history", []));
  const [refs, setRefs] = useState([]);
  const [referenceCharacter, setReferenceCharacter] = useState("Character 1");
  const [referenceView, setReferenceView] = useState("Face close-up");
  const [saved, setSaved] = useState(() => load("ccp-characters", []));
  const [characterName, setCharacterName] = useState("");
  const [advanced, setAdvanced] = useState(false);

  useEffect(() => { fetch("/api/health").then(r => r.json()).then(setHealth).catch(() => {}); }, []);
  useEffect(() => {
    if (!supabase) { setAuthReady(true); return; }
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active) { setSession(data.session); setAuthReady(true); }
    }).catch(() => { if (active) setAuthReady(true); });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setAuthReady(true);
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);
  useEffect(() => { localStorage.setItem("ccp-config", JSON.stringify(config)); }, [config]);
  useEffect(() => { localStorage.setItem("ccp-history", JSON.stringify(history.slice(0, 20))); }, [history]);
  useEffect(() => { localStorage.setItem("ccp-characters", JSON.stringify(saved)); }, [saved]);

  async function loadCloudComics() {
    const { data: comics, error: loadError } = await supabase
      .from("comics")
      .select("id,title,story_prompt,style_choice,generation_config,created_at,comic_pages(image_path,page_number,provider_id)")
      .order("created_at", { ascending: false })
      .limit(30);
    if (loadError) throw loadError;
    const entries = (comics || []).map(comic => ({
      comic,
      path: (comic.comic_pages || []).slice().sort((a,b) => a.page_number - b.page_number)[0]?.image_path
    })).filter(entry => entry.path);
    if (!entries.length) { setHistory([]); return; }
    const { data: signed, error: signedError } = await supabase.storage
      .from("comic-panels")
      .createSignedUrls(entries.map(entry => entry.path), 60 * 60 * 24);
    if (signedError) throw signedError;
    const signedByPath = new Map((signed || []).map(item => [item.path, item.signedUrl]));
    setHistory(entries.map(({ comic, path }) => {
      const generation = comic.generation_config || {};
      return {
        id: comic.id,
        title: comic.title,
        image: signedByPath.get(path),
        config: generation.config || {
          ...defaults,
          scene: comic.story_prompt || "",
          style: comic.style_choice || defaults.style
        },
        provider: generation.provider || "openai",
        responseId: generation.responseId || null
      };
    }).filter(item => item.image));
  }

  async function loadCloudCharacters() {
    const { data: sets, error: setsError } = await supabase
      .from("character_sets")
      .select("id,name,character_ids,created_at")
      .order("created_at", { ascending: false });
    if (setsError) throw setsError;
    const ids = [...new Set((sets || []).flatMap(item => item.character_ids || []))];
    if (!ids.length) { setSaved([]); return; }
    const { data: characters, error: charsError } = await supabase
      .from("characters")
      .select("id,description,reference_paths")
      .in("id", ids);
    if (charsError) throw charsError;
    const paths = (characters || []).flatMap(char => char.reference_paths || []);
    const signedResult = paths.length
      ? await supabase.storage.from("character-refs").createSignedUrls(paths, 60 * 60 * 24)
      : { data: [], error: null };
    if (signedResult.error) throw signedResult.error;
    const signedByPath = new Map((signedResult.data || []).map(item => [item.path, item.signedUrl]));
    const byId = new Map((characters || []).map(char => {
      let details = {};
      try { details = JSON.parse(char.description || "{}"); } catch { details = { characters: char.description || "", outfit: "" }; }
      return [char.id, {
        characters: details.characters || "",
        outfit: details.outfit || "",
        refs: (char.reference_paths || []).map((path, index) => ({ name: details.referenceMetadata?.[index]?.name || "Saved character reference", character: details.referenceMetadata?.[index]?.character || "Character 1", view: details.referenceMetadata?.[index]?.view || "Face close-up", url: signedByPath.get(path) })).filter(ref => ref.url)
      }];
    }));
    setSaved((sets || []).map(item => {
      const first = byId.get(item.character_ids?.[0]) || {};
      return { id: item.id, characterIds: item.character_ids || [], name: item.name, characters: first.characters || "", outfit: first.outfit || "", refs: first.refs || [] };
    }));
  }

  useEffect(() => {
    if (!session?.user?.id || !supabase) return;
    let cancelled = false;
    Promise.all([loadCloudComics(), loadCloudCharacters()]).catch(err => {
      if (!cancelled) console.warn("Could not load saved Comic Creator Pro data:", err.message);
    });
    return () => { cancelled = true; };
  }, [session?.user?.id]);

  async function saveComicPage(image, pageConfig, pageProvider, responseId = null) {
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData?.user) throw new Error("Sign in again before saving this comic.");
    const imageResponse = await fetch(image);
    if (!imageResponse.ok) throw new Error("The generated image could not be downloaded for cloud saving.");
    const blob = await imageResponse.blob();
    const contentType = blob.type && blob.type.startsWith("image/") ? blob.type : "image/png";
    const extension = contentType === "image/jpeg" ? "jpg" : contentType.split("/")[1] || "png";
    const userId = authData.user.id;
    const imagePath = userId + "/" + crypto.randomUUID() + "." + extension;
    const title = (pageConfig.scene || "Untitled comic").split("\n")[0].trim().slice(0, 80) || "Untitled comic";

    const { data: comic, error: comicError } = await supabase.from("comics").insert({
      user_id: userId,
      title,
      story_prompt: pageConfig.scene || "",
      style_choice: pageConfig.style || defaults.style,
      num_pages: 1,
      layout_preset: pageConfig.layout || null,
      status: "generating",
      generation_config: { config: pageConfig, provider: pageProvider, responseId }
    }).select("id").single();
    if (comicError) throw comicError;

    try {
      const { error: uploadError } = await supabase.storage.from("comic-panels").upload(imagePath, blob, {
        contentType,
        upsert: false
      });
      if (uploadError) throw uploadError;

      const pageGenerationConfig = {
        config: pageConfig, provider: pageProvider, responseId,
        generation_mode: "single-full-page", page_image_count: 1,
        panel_count: Number(pageConfig.panels), page_count: 1
      };
      const { error: pageError } = await supabase.from("comic_pages").insert({
        comic_id: comic.id, user_id: userId, page_number: 1,
        image_path: imagePath, provider_id: pageProvider,
        prompt: pageConfig.scene || "", generation_config: pageGenerationConfig
      });
      if (pageError) throw pageError;

      const { error: updateError } = await supabase.from("comics")
        .update({ status: "complete" }).eq("id", comic.id);
      if (updateError) throw updateError;

      const { data: signed, error: signedError } = await supabase.storage
        .from("comic-panels").createSignedUrl(imagePath, 60 * 60 * 24);
      if (signedError) throw signedError;
      return { id: comic.id, title, image: signed.signedUrl, config: pageConfig, provider: pageProvider, responseId };
    } catch (error) {
      await supabase.storage.from("comic-panels").remove([imagePath]);
      await supabase.from("comics").delete().eq("id", comic.id);
      throw error;
    }
  }

  const set = (key, value) => setConfig(c => ({ ...c, [key]: value }));
  const promptPreview = useMemo(() => [config.artTradition, config.renderingTechnique, config.visualTreatment, config.style, config.panels + " panels", config.genre, config.layout].filter(Boolean).join(" · "), [config]);

  async function toOpenAiReferenceDataUrl(ref) {
    if (typeof ref?.url !== "string") throw new Error("A saved character reference is missing its image.");
    if (ref.url.startsWith("data:image/")) {
      if (ref.url.length > 3 * 1024 * 1024) throw new Error("Each OpenAI reference image must be 2 MB or smaller. Please re-upload a smaller image.");
      return ref.url;
    }
    const configuredUrl = import.meta.env.VITE_SUPABASE_URL;
    if (!configuredUrl) throw new Error("Supabase is not configured.");
    const source = new URL(ref.url);
    const trustedHost = new URL(configuredUrl).host;
    if (source.host !== trustedHost || !source.pathname.includes("/storage/v1/object/sign/character-refs/")) {
      throw new Error("A saved reference image URL could not be verified. Please upload the reference again.");
    }
    const response = await fetch(ref.url);
    if (!response.ok) throw new Error("Could not load a saved character reference image.");
    const blob = await response.blob();
    if (!["image/png","image/jpeg","image/webp"].includes(blob.type)) throw new Error("Character references must be PNG, JPEG or WebP images.");
    if (blob.size > 2 * 1024 * 1024) throw new Error("Each OpenAI reference image must be 2 MB or smaller. Please re-upload a smaller image.");
    return await new Promise((resolve,reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("Could not prepare a saved character reference image."));
      reader.readAsDataURL(blob);
    });
  }

  async function handleReferenceFiles(event) {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    const remaining = Math.max(0, 4 - refs.length);
    if (!remaining) {
      setError("You can attach up to four character reference images.");
      return;
    }
    if (files.length > remaining) setError("Only four character reference images can be attached at a time.");
    const accepted = files.slice(0, remaining);
    for (const file of accepted) {
      if (!["image/png","image/jpeg","image/webp"].includes(file.type)) {
        setError("Character references must be PNG, JPEG or WebP images.");
        continue;
      }
      if (file.size > 2 * 1024 * 1024) {
        setError("Each character reference must be 2 MB or smaller.");
        continue;
      }
      const reader = new FileReader();
      reader.onload = () => setRefs(old => [...old, { name: file.name, character: referenceCharacter, view: referenceView, url: String(reader.result) }].slice(0,4));
      reader.onerror = () => setError("Could not read " + file.name + ".");
      reader.readAsDataURL(file);
    }
  }

  async function generate() {
    setBusy(true); setError(""); setResult(""); setActiveComicId(null); setStatus("Sending your comic brief…");
    try {
      const { data: authData, error: authError } = await supabase.auth.getSession();
      if (authError || !authData?.session) throw new Error("Please sign in again before generating.");
      const referenceImages = refs.length ? await Promise.all(refs.slice(0,4).map(toOpenAiReferenceDataUrl)) : [];
      const payload = { ...config, referenceImages, referenceManifest: refs.slice(0,4).map(({ name, character, view }) => ({ name, character, view })) };
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + authData.session.access_token },
        body: JSON.stringify({ selection: providerMode === "auto" ? { mode: "auto" } : { mode: "manual", provider }, config: payload, veniceModel })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Generation failed.");
      let image = data.image;
      if (data.provider === "replicate" && data.predictionId && data.status !== "succeeded") {
        let completed = false;
        for (let i = 0; i < 90; i++) {
          await new Promise(resolve => setTimeout(resolve, 2500));
          const poll = await fetch("/api/replicate/" + data.predictionId, {
            headers: { Authorization: "Bearer " + authData.session.access_token }
          });
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
      setStatus(data.blurred ? "Generated. Venice marked the result as blurred." : "Your complete comic page is ready. Saving it to your library…");
      const generationProvider = data.provider || provider;
      setProvider(generationProvider);
      const localItem = { id: Date.now(), image, config: { ...config }, provider: generationProvider, responseId: data.responseId || null };
      setHistory(h => [localItem, ...h]);
      try {
        const savedComic = await saveComicPage(image, { ...config }, generationProvider, data.responseId || null);
        setActiveComicId(savedComic.id);
        setHistory(h => [savedComic, ...h.filter(item => item.id !== localItem.id)]);
        setStatus("Your complete comic page is saved to your account.");
      } catch (saveError) {
        setStatus("Comic generated successfully, but cloud saving failed: " + (saveError.message || "Please download a copy."));
      }
    } catch (e) {
      setError(e.message || "Something went wrong.");
      setStatus("");
    } finally { setBusy(false); }
  }

  async function saveCharacter() {
    if (!characterName.trim()) return;
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData?.user) { setError("Please sign in again before saving a character set."); return; }
    const userId = authData.user.id;
    const referencePaths = [];
    try {
      for (const ref of refs) {
        const response = await fetch(ref.url);
        const blob = await response.blob();
        const ext = blob.type === "image/jpeg" ? "jpg" : (blob.type.split("/")[1] || "png");
        const path = userId + "/" + crypto.randomUUID() + "." + ext;
        const { error: uploadError } = await supabase.storage.from("character-refs").upload(path, blob, {
          contentType: blob.type || "image/png",
          upsert: false
        });
        if (uploadError) throw uploadError;
        referencePaths.push(path);
      }
      const { data: character, error: characterError } = await supabase.from("characters").insert({
        user_id: userId,
        name: characterName.trim(),
        description: JSON.stringify({ characters: config.characters, outfit: config.outfit, referenceMetadata: refs.map(({ name, character, view }) => ({ name, character, view })) }),
        reference_paths: referencePaths
      }).select("id").single();
      if (characterError) throw characterError;
      const { data: characterSet, error: setError } = await supabase.from("character_sets").insert({
        user_id: userId,
        name: characterName.trim(),
        character_ids: [character.id]
      }).select("id").single();
      if (setError) {
        await supabase.from("characters").delete().eq("id", character.id);
        throw setError;
      }
      setSaved(c => [{ id: characterSet.id, characterIds: [character.id], name: characterName.trim(), characters: config.characters, outfit: config.outfit, refs: refs.map(ref => ({...ref})) }, ...c]);
      setCharacterName("");
      setStatus("Character setup saved to your account.");
    } catch (err) {
      setError(err.message || "Could not save the character setup.");
    }
  }
  function useCharacter(c) {
    set("characters", c.characters);
    set("outfit", c.outfit);
    setRefs(c.refs || []);
  }
  async function deleteCharacterSet(c) {
    try {
      const ids = c.characterIds || [];
      let paths = [];
      if (ids.length) {
        const { data: rows, error: readError } = await supabase.from("characters").select("reference_paths").in("id", ids);
        if (readError) throw readError;
        paths = (rows || []).flatMap(row => row.reference_paths || []);
      }
      const { error: setError } = await supabase.from("character_sets").delete().eq("id", c.id);
      if (setError) throw setError;
      for (const characterId of ids) {
        const { error: charError } = await supabase.from("characters").delete().eq("id", characterId);
        if (charError) throw charError;
      }
      if (paths.length) {
        const { error: storageError } = await supabase.storage.from("character-refs").remove(paths);
        if (storageError) throw storageError;
      }
      setSaved(items => items.filter(item => item.id !== c.id));
    } catch (err) {
      setError(err.message || "Could not delete this character setup.");
    }
  }

  async function refineComic() {
    if (!activeComicId || !refinement.trim()) return;
    setRefining(true); setError(""); setStatus("Refining your comic page with OpenAI…");
    try {
      const { data: authData, error: authError } = await supabase.auth.getSession();
      if (authError || !authData?.session) throw new Error("Please sign in again before refining.");
      const response = await fetch("/api/refine", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + authData.session.access_token },
        body: JSON.stringify({ comicId: activeComicId, instruction: refinement })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not refine this comic.");
      const refinedConfig = { ...config, scene: config.scene + "\nRefinement: " + refinement };
      setResult(data.image);
      const savedComic = await saveComicPage(data.image, refinedConfig, "openai", data.responseId || null);
      setActiveComicId(savedComic.id);
      setHistory(h => [savedComic, ...h]);
      setRefinement("");
      setStatus("Refined page saved as a new version in your library.");
    } catch (err) {
      setError(err.message || "Comic refinement failed.");
      setStatus("");
    } finally {
      setRefining(false);
    }
  }
  function downloadImage(src, name = "comic-creator-pro.png") {
    const a = document.createElement("a"); a.href = src; a.download = name; a.target = "_blank"; a.click();
  }
  function newComic() { setConfig(c => ({ ...c, scene: "", ending: "Romantic Payoff" })); setResult(""); setStatus(""); setError(""); window.scrollTo({ top: 0, behavior: "smooth" }); }

  if (!authReady) return <main className="auth-shell"><section className="auth-card"><h1>Opening your private studio…</h1><p>Checking your secure sign-in.</p></section></main>;
  if (!supabase) return <main className="auth-shell"><section className="auth-card"><h1>Studio setup needed</h1><p>Supabase connection settings are missing. Add the VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY environment variables in Vercel.</p></section></main>;
  if (!session) return <AuthGate />;

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
        <div className="top-actions">
          <span className={"provider-status " + (health.openai ? "online" : "")}>● OpenAI {health.openai ? "connected" : "needs API key"}</span>
          <span className={"provider-status " + (health.venice ? "online" : "")}>● Venice {health.venice ? "connected" : "not configured"}</span>
          <span className={"provider-status " + (health.replicate ? "online" : "")}>● Replicate {health.replicate ? "connected" : "not configured"}</span>
          <span className="provider-status">{session?.user?.email}</span>
          <button className="icon-button" title="Sign out" onClick={() => supabase.auth.signOut()}><LogOut size={15}/></button>
        </div>
      </header>

      <section className="hero"><div><div className="eyebrow"><Sparkles size={13}/> YOUR CREATIVE UNIVERSE</div><h1>Bring your stories<br/><em>to life.</em></h1><p>Design cinematic comic pages with your favorite art styles, characters and AI models.</p></div><div className="hero-art"><div className="hero-orbit orbit-one"/><div className="hero-orbit orbit-two"/><div className="hero-stamp">PANEL<br/>TO<br/>PANEL</div><div className="hero-spark">✦</div></div></section>

      <div className="section-heading"><div><span className="step">01</span><div><h2>Comic configuration</h2><p>Shape every detail of your next comic page.</p></div></div><span className="autosave">✓ Auto-saved</span></div>

      <section className="studio-grid">
        <div className="form-column">
          <div className="panel-card">
            <div className="card-heading"><span className="icon-tile"><Palette size={18}/></span><div><h3>Art direction</h3><p>Choose the visual language of your comic.</p></div></div>
            <Field label="ART STYLE PRESET"><Select value={config.style} onChange={v => set("style", v)} items={styles}/></Field>
            <div className="creative-layer-grid">
              <Field label="01 · ART TRADITION"><Select value={config.artTradition} onChange={v => set("artTradition", v)} items={artTraditions}/></Field>
              <Field label="02 · RENDERING TECHNIQUE"><Select value={config.renderingTechnique} onChange={v => set("renderingTechnique", v)} items={renderingTechniques}/></Field>
              <Field label="03 · VISUAL TREATMENT"><Select value={config.visualTreatment} onChange={v => set("visualTreatment", v)} items={visualTreatments}/></Field>
            </div>
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
            <div className="identity-lock-panel">
              <div className="identity-lock-heading"><ShieldCheck size={17}/><div><b>Character identity lock</b><small>Keep each person distinct and recognizable across every panel.</small></div><label className="switch"><input type="checkbox" checked={config.identityLock !== false} onChange={e => set("identityLock", e.target.checked)}/><span/></label></div>
              <Field label="IDENTITY PRIORITY"><Select value={config.identityPriority || "Strict identity lock"} onChange={v => set("identityPriority", v)} items={["Strict identity lock","High identity consistency","Artistic adaptation"]}/></Field>
              <div className="identity-checks"><span>✓ Facial structure and features</span><span>✓ Hair and skin tone</span><span>✓ Natural body proportions</span><span>✓ No identity swapping</span></div>
            </div>
            <div className="reference-assignment">
              <Field label="REFERENCE BELONGS TO"><Select value={referenceCharacter} onChange={setReferenceCharacter} items={["Character 1","Character 2","Shared scene reference"]}/></Field>
              <Field label="REFERENCE VIEW"><Select value={referenceView} onChange={setReferenceView} items={["Face close-up","Front view","Three-quarter view","Side profile","Full body front","Full body back","Outfit reference","Expression reference","Pose reference","Environment reference"]}/></Field>
            </div>
            <div className="reference-drop"><ImagePlus size={20}/><div><b>Add character reference images</b><small>PNG, JPEG or WebP · Up to 4 images · 2 MB each. Assign each image to a character and view before uploading.</small></div>
              <input type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={handleReferenceFiles}/>
              {refs.length > 0 && <small>{refs.length}/4 references attached</small>}
            </div>
            {refs.length > 0 && <div className="reference-gallery">{refs.map((ref,index) => <div className="reference-thumb" key={ref.name + index}><img src={ref.url} alt={ref.name}/><div><b>{ref.character || "Character 1"}</b><small>{ref.view || "Reference"} · {ref.name}</small></div><button className="icon-button" aria-label={"Remove " + ref.name} onClick={() => setRefs(items => items.filter((_,i) => i !== index))}><Trash2 size={14}/></button></div>)}</div>}
            <div id="characters" className="character-save"><input placeholder="Character set name" value={characterName} onChange={e => setCharacterName(e.target.value)}/><button className="outline-btn" onClick={saveCharacter}><Plus size={15}/> Save character setup</button></div>
            {saved.length > 0 && <div className="saved-list">{saved.map(c => <div className="saved-item" key={c.id}><button onClick={() => useCharacter(c)}>{c.name}</button><button className="icon-button" onClick={() => deleteCharacterSet(c)}><Trash2 size={14}/></button></div>)}</div>}
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
              <button className={providerMode === "auto" ? "provider-option selected" : "provider-option"} onClick={() => setProviderMode("auto")}><b>Automatic routing</b><small>Choose the best enabled model for this style, layout and references.</small><span>Capability-aware</span></button>
              <button className={providerMode === "manual" ? "provider-option selected" : "provider-option"} onClick={() => setProviderMode("manual")}><b>Manual override</b><small>Choose a specific provider. Registry compatibility checks still apply.</small><span>Owner control</span></button>
            </div>
            {providerMode === "manual" && <div className="provider-options">
              <button className={provider === "openai" ? "provider-option selected" : "provider-option"} onClick={() => setProvider("openai")}><b>OpenAI GPT Image</b><small>Responses API image generation</small><span>{health.openai ? "Credentials connected" : "Needs API key"}</span></button>
              <button className={provider === "venice" ? "provider-option selected" : "provider-option"} onClick={() => setProvider("venice")}><b>Venice AI</b><small>Image generation API</small><span>{health.venice ? "Credentials connected" : "Needs API key"}</span></button>
              <button className={provider === "replicate" ? "provider-option selected" : "provider-option"} onClick={() => setProvider("replicate")}><b>Replicate</b><small>Configured model endpoint</small><span>{health.replicate ? "Credentials connected" : "Needs API key + model"}</span></button>
            </div>}
            {providerMode === "auto" && <div className="provider-note"><Sparkles size={16}/> The router checks enabled model records, credentials, style, content category, aspect ratio and reference-image support before selecting exactly one model. No fallback fan-out.</div>}
            {providerMode === "manual" && provider === "openai" && <div className="provider-note"><Sparkles size={16}/> OpenAI supports reference-image input and conversational refinement when the selected model is configured for those capabilities.</div>}
            {providerMode === "manual" && provider === "venice" && <Field label="VENICE MODEL"><input value={veniceModel} onChange={e => setVeniceModel(e.target.value)} title="Set VENICE_IMAGE_MODEL in server .env"/></Field>}
            <div className="provider-note"><ShieldCheck size={16}/> Provider credentials stay on your server. Model availability and content rules are controlled by each provider.</div>
            <button className="advanced-toggle" onClick={() => setAdvanced(v => !v)}><Settings2 size={15}/> Advanced content settings <ChevronDown size={15}/></button>
            {advanced && <div className="adult-settings"><label className="toggle-row"><span><b>18+ mature-content mode</b><small>For adult-only fictional characters and themes. Provider policies still apply.</small></span><input type="checkbox" checked={!!config.adultMode} onChange={e => { if (e.target.checked && window.confirm("I confirm I am 18 or older and will only create content featuring clearly adult fictional characters. Provider policies still apply.")) set("adultMode", true); else set("adultMode", false); }}/></label>
              {config.adultMode && <><div className="adult-warning">18+ creative setting. All depicted characters must be clearly adults. This setting does not bypass provider safeguards.</div>
              <Field label="ADULT SUBGENRE"><Select value={config.adultSubgenre || "Sensual Romance"} onChange={v => set("adultSubgenre", v)} items={adultSubgenres}/></Field>
              <div className="two-col">
                <Field label="SENSUALITY"><Select value={config.sensuality || "Moderate"} onChange={v => set("sensuality", v)} items={["Subtle","Moderate","Strong"]}/></Field>
                <Field label="INTIMACY"><Select value={config.intimacy || "Passionate kissing and embraces"} onChange={v => set("intimacy", v)} items={["Romantic affection","Passionate kissing and embraces","Suggestive non-explicit intimacy"]}/></Field>
              </div>
              <Field label="ARTISTIC FIGURE TREATMENT"><Select value={config.nudityTreatment || "Implied nudity with strategic shadows and drapery"} onChange={v => set("nudityTreatment", v)} items={["Fully clothed","Elegant lingerie","Implied nudity with strategic shadows and drapery","Classical non-explicit figure study","Silhouette and backlit figure study"]}/></Field>
              <p className="tiny-note">Mature themes and non-explicit artistic figure studies only. No graphic sexual activity or explicit genital detail. Provider content policies apply.</p>
            </>}
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

          <div className="generate-wrap"><div className="prompt-summary"><span>YOUR CONFIGURATION</span><b>{promptPreview}</b><small>ONE image-generation call · {config.panels} adaptive panels · {config.dialogue} · {config.detail}</small></div>
            <button className="generate-btn" disabled={busy || !config.scene.trim()} onClick={generate}>{busy ? <><LoaderCircle className="spin" size={19}/> Generating your comic…</> : <><WandSparkles size={19}/> Generate comic page <span>✦</span></>}</button>
            <small className="generate-foot">Exactly one image-generation request returns one complete page with all {config.panels} panels. No per-panel generation, no stitching, no extra image calls. Generation cost is for one image output from your selected provider/model.</small>
          </div>
        </aside>
      </section>

      {(busy || refining || error || result) && <section className="result-section"><div className="section-heading"><div><span className="step">02</span><div><h2>Comic output</h2><p>{status || "Your generated page."}</p></div></div></div>
        {error && <div className="error-box"><AlertCircle size={17}/>{error}</div>}
        {result && <div className="result-card"><img src={result} alt="Generated complete comic page"/><div className="result-actions"><button className="outline-btn" onClick={() => downloadImage(result)}><Download size={16}/> Download comic</button><button className="outline-btn" onClick={generate} disabled={busy || refining}><RefreshCw size={16}/> Regenerate</button><button className="primary-small" onClick={newComic}><Plus size={16}/> New comic</button></div></div>}
        {result && provider === "openai" && activeComicId && <div className="panel-card refine-card">
          <div className="card-heading"><span className="icon-tile"><Sparkles size={18}/></span><div><h3>Refine this comic</h3><p>Describe a change in plain language. OpenAI will continue from the saved image-generation conversation.</p></div></div>
          <Field label="WHAT SHOULD CHANGE?"><textarea rows="3" value={refinement} onChange={e => setRefinement(e.target.value)} placeholder="For example: keep the same characters, but make the rain heavier and shift the final panel to a dramatic close-up…"/></Field>
          <button className="generate-btn" disabled={refining || !refinement.trim()} onClick={refineComic}>{refining ? <><LoaderCircle className="spin" size={18}/> Refining…</> : <><Sparkles size={18}/> Refine with OpenAI</>}</button>
        </div>}
      </section>}

      <section id="gallery" className="gallery-section"><div className="section-heading"><div><span className="step">03</span><div><h2>Recent creations</h2><p>Your latest generated comic pages on this device.</p></div></div></div>
        {history.length === 0 ? <div className="empty-gallery"><ImagePlus size={24}/><b>Your gallery is waiting</b><span>Generated comics will appear here.</span></div> : <div className="history-grid">{history.map(item => <button className="history-thumb" key={item.id} onClick={() => { setResult(item.image); setConfig(item.config); setProvider(item.provider); setActiveComicId(item.id); setRefinement(""); window.scrollTo({ top: 0, behavior: "smooth" }); }}><img src={item.image} alt="Past comic"/><span>{item.config.style} · {item.config.panels} panels</span></button>)}</div>}
      </section>
      <footer>COMIC CREATOR PRO <span>Made for storytellers.</span></footer>
    </main>
  </div>;
}
