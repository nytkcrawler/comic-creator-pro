import React, { useState } from "react";
import { WandSparkles, Mail } from "lucide-react";
import { supabase } from "./lib/supabase";

export default function AuthGate() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function sendLink(event) {
    event.preventDefault();
    if (!supabase) {
      setError("The secure sign-in service is not configured yet.");
      return;
    }
    setBusy(true);
    setError("");
    setSent(false);
    try {
      const { error: authError } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          emailRedirectTo: window.location.origin,
          shouldCreateUser: true
        }
      });
      if (authError) throw authError;
      setSent(true);
    } catch (err) {
      setError(err.message || "Could not send your sign-in link.");
    } finally {
      setBusy(false);
    }
  }

  return <main className="auth-shell">
    <section className="auth-card">
      <div className="auth-brand">
        <div className="auth-brand-mark"><WandSparkles size={22}/></div>
        <div><b>COMIC CREATOR PRO</b><div style={{fontSize:11,color:"#aaa",letterSpacing:1}}>YOUR PRIVATE STUDIO</div></div>
      </div>
      <h1>Welcome, storyteller.</h1>
      <p>Sign in securely to create comic pages and keep your character library and creations saved to your account.</p>
      <form onSubmit={sendLink}>
        <label htmlFor="auth-email">EMAIL ADDRESS</label>
        <input id="auth-email" type="email" required autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com"/>
        <button type="submit" disabled={busy}><Mail size={16} style={{verticalAlign:"middle",marginRight:8}}/>{busy ? "Sending secure link…" : "Email me a sign-in link"}</button>
      </form>
      {sent && <div className="auth-feedback">Check your inbox. Your secure sign-in link is on its way. Open it on this device to return to Comic Creator Pro.</div>}
      {error && <div className="auth-feedback auth-error">{error}</div>}
      <p className="auth-foot">Passwordless sign-in powered by Supabase. Your private creations are stored in your account.</p>
    </section>
  </main>;
}
