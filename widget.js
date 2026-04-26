(function(){
'use strict';

/* ─────────────────────────────────────────────
   ARIA WIDGET — Self-contained chat bubble
   Usage: <script src="widget.js?id=CLIENT_ID&sb=SUPABASE_URL&key=ANON_KEY"></script>
───────────────────────────────────────────── */

/* ── 1. READ CONFIG FROM SCRIPT TAG ── */
const scriptTag = document.currentScript;
const sbUrl     = scriptTag.getAttribute('data-sb')   || '';
const sbKey     = scriptTag.getAttribute('data-key')  || '';
const clientId  = scriptTag.getAttribute('data-id')   || 'main';

if(!sbUrl || !sbKey){
  console.warn('[Aria Widget] Missing data-sb or data-key attributes.');
  return;
}

/* ── 2. LOAD EXTERNAL DEPENDENCIES ── */
function loadScript(src, cb){
  const s = document.createElement('script');
  s.src = src; s.onload = cb;
  document.head.appendChild(s);
}
function loadCSS(href){
  const l = document.createElement('link');
  l.rel='stylesheet'; l.href=href;
  document.head.appendChild(l);
}
loadCSS('https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@300;400;500;600&display=swap');

/* ── 3. STATE ── */
let cfg        = {botName:'Aria',botColor:'#1F5EFF',botGreeting:"Hi! I'm {name}, your AI assistant. How can I help you today?",lang:'en',proOn:true,proDelay:8,proMsg:"👋 Need help? I'm here!",lcOn:true,lcName:true,lcEmail:true,lcPhone:false};
let emailCfg   = {enabled:false,mode:'emailjs',serviceId:'',templateId:'',publicKey:'',toEmail:'',toName:''};
let providerKeys = {openrouter:'',groq:'',openai:'',claude:'',gemini:''};
let curProvider  = 'openrouter';
let apiKey       = '';
let sources      = [];
let hist         = [];
let isReady      = false;
let isSending    = false;
let leadCaptured = false;
let proFired     = false;
let proTimer     = null;
let isOpen       = false;
let isRec        = false;
let recognition  = null;
let msgCount     = 0;
let leadScore    = 'cold';
let emailSentForLead = false;
let an           = {chats:0,msgs:0,leads:0,handoffs:0};

const MAX_H = 16;
const TO    = 20000;
const PROVIDERS = {
  openrouter:{model:'openai/gpt-4o-mini',endpoint:'https://openrouter.ai/api/v1/chat/completions'},
  groq:      {model:'llama-3.3-70b-versatile',endpoint:'https://api.groq.com/openai/v1/chat/completions'},
  openai:    {model:'gpt-4o-mini',endpoint:'https://api.openai.com/v1/chat/completions'},
  gemini:    {model:'gemini-1.5-flash',endpoint:`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent`},
  claude:    {model:'claude-haiku-4-5-20251001',endpoint:'https://api.anthropic.com/v1/messages'},
};
const LANG_SYS={es:'IMPORTANT: Always respond in Spanish.',fr:'IMPORTANT: Always respond in French.',de:'IMPORTANT: Always respond in German.',ar:'IMPORTANT: Always respond in Arabic.',hi:'IMPORTANT: Always respond in Hindi.',zh:'IMPORTANT: Always respond in Chinese.',pt:'IMPORTANT: Always respond in Portuguese.',ja:'IMPORTANT: Always respond in Japanese.',tr:'IMPORTANT: Always respond in Turkish.',en:''};

/* ── 4. SUPABASE HELPERS ── */
async function sbGet(table,filter){
  try{
    const r = await fetch(`${sbUrl}/rest/v1/${table}?${filter}&limit=1`,{
      headers:{'apikey':sbKey,'Authorization':`Bearer ${sbKey}`,'Accept':'application/json'}
    });
    const d = await r.json();
    return Array.isArray(d)&&d.length ? d[0] : null;
  }catch(_){return null;}
}
async function sbInsert(table,data){
  try{
    await fetch(`${sbUrl}/rest/v1/${table}`,{
      method:'POST',
      headers:{'Content-Type':'application/json','apikey':sbKey,'Authorization':`Bearer ${sbKey}`,'Prefer':'return=minimal'},
      body:JSON.stringify(data)
    });
  }catch(_){}
}

/* ── 5. LOAD CONFIG FROM SUPABASE ── */
async function loadConfig(){
  const row = await sbGet('aria_config',`key=eq.${clientId}`);
  if(!row) return;
  try{if(row.cfg){const c=JSON.parse(row.cfg);cfg={...cfg,...c};}}catch(_){}
  try{if(row.email_cfg){emailCfg={...emailCfg,...JSON.parse(row.email_cfg)};}}catch(_){}
  try{if(row.provider){const pv=JSON.parse(row.provider);curProvider=pv.cur||'openrouter';providerKeys={...providerKeys,...(pv.keys||{})};apiKey=providerKeys[curProvider]||'';}}catch(_){}
  try{if(row.sources){sources=JSON.parse(row.sources);}}catch(_){}
  if(row.theme) applyTheme(row.theme);
}

/* ── 6. INJECT STYLES ── */
function injectStyles(){
  const themes = `
    .aria-w[data-theme="intercom"]{--bg:#f5f5f5;--sf:#ffffff;--s2:#f0f0f0;--bd:rgba(0,0,0,0.08);--bd2:rgba(0,0,0,0.13);--ac:#1F5EFF;--acd:rgba(31,94,255,0.07);--acb:rgba(31,94,255,0.22);--tx:#111827;--t2:#6b7280;--t3:#d1d5db;--ub:#1F5EFF;--ut:#fff;--bb:#fff;--sh:0 4px 24px rgba(31,94,255,0.10);--gn:#10b981;--rd:#ef4444;--am:#f59e0b;}
    .aria-w[data-theme="notion"]{--bg:#fafaf9;--sf:#ffffff;--s2:#f3f2f0;--bd:rgba(0,0,0,0.07);--bd2:rgba(0,0,0,0.12);--ac:#2d2d2d;--acd:rgba(45,45,45,0.06);--acb:rgba(45,45,45,0.20);--tx:#1a1a1a;--t2:#6f6e69;--t3:#c7c6c2;--ub:#2d2d2d;--ut:#fff;--bb:#fff;--sh:0 4px 24px rgba(0,0,0,0.08);--gn:#4a9a6a;--rd:#d44;--am:#c8820a;}
    .aria-w[data-theme="drift"]{--bg:#0a0e1a;--sf:#111827;--s2:#1a2235;--bd:rgba(255,255,255,0.07);--bd2:rgba(255,255,255,0.13);--ac:#3B82F6;--acd:rgba(59,130,246,0.12);--acb:rgba(59,130,246,0.30);--tx:#e8edf8;--t2:#7a8aaa;--t3:#3a4a6a;--ub:#1d3a8a;--ut:#e8edf8;--bb:#111827;--sh:0 8px 32px rgba(0,0,0,0.4);--gn:#34d399;--rd:#f87171;--am:#fbbf24;}
    .aria-w[data-theme="whatsapp"]{--bg:#eae6df;--sf:#ffffff;--s2:#f5f5f5;--bd:rgba(0,0,0,0.08);--bd2:rgba(0,0,0,0.14);--ac:#075E54;--acd:rgba(7,94,84,0.08);--acb:rgba(7,94,84,0.25);--tx:#111b21;--t2:#54656f;--t3:#8696a0;--ub:#075E54;--ut:#fff;--bb:#fff;--sh:0 2px 16px rgba(0,0,0,0.10);--gn:#25d366;--rd:#e84d44;--am:#d4a017;}
    .aria-w[data-theme="midnight"]{--bg:#08080f;--sf:#101018;--s2:#18182a;--bd:rgba(255,255,255,0.06);--bd2:rgba(255,255,255,0.12);--ac:#7C3AED;--acd:rgba(124,58,237,0.12);--acb:rgba(124,58,237,0.30);--tx:#e8e8f8;--t2:#8080a8;--t3:#3a3a5a;--ub:#4c1d95;--ut:#e8e8f8;--bb:#101018;--sh:0 8px 32px rgba(0,0,0,0.6);--gn:#34d399;--rd:#f87171;--am:#fbbf24;}
  `;
  const css = `
    ${themes}
    *,*::before,*::after{box-sizing:border-box;-webkit-tap-highlight-color:transparent;}
    /* Launcher bubble */
    #aria-launcher{position:fixed;bottom:22px;right:22px;width:56px;height:56px;border-radius:50%;background:var(--ac,#1F5EFF);box-shadow:0 4px 20px rgba(0,0,0,0.25);display:flex;align-items:center;justify-content:center;cursor:pointer;z-index:2147483646;transition:transform .2s,box-shadow .2s;border:none;font-size:24px;}
    #aria-launcher:hover{transform:scale(1.08);box-shadow:0 6px 28px rgba(0,0,0,0.32);}
    #aria-launcher .aria-notif{position:absolute;top:-3px;right:-3px;width:14px;height:14px;background:#ef4444;border-radius:50%;border:2px solid #fff;display:none;}
    #aria-launcher .aria-notif.show{display:block;}
    /* Chat window */
    .aria-w{position:fixed;bottom:90px;right:22px;width:380px;max-width:calc(100vw - 30px);height:580px;max-height:calc(100vh - 110px);border-radius:18px;overflow:hidden;box-shadow:0 8px 40px rgba(0,0,0,0.18);z-index:2147483645;display:flex;flex-direction:column;font-family:'DM Sans',sans-serif;transition:opacity .25s,transform .25s;opacity:0;transform:translateY(16px) scale(.97);pointer-events:none;background:var(--bg,#f5f5f5);}
    .aria-w.open{opacity:1;transform:translateY(0) scale(1);pointer-events:all;}
    /* Header */
    .aria-head{padding:11px 15px;border-bottom:1px solid var(--bd);background:var(--sf);display:flex;align-items:center;gap:10px;flex-shrink:0;}
    .aria-av{width:36px;height:36px;border-radius:10px;background:var(--ac);display:flex;align-items:center;justify-content:center;font-family:'DM Serif Display',serif;font-size:18px;color:#fff;flex-shrink:0;}
    .aria-head-info h3{font-family:'DM Serif Display',serif;font-size:15px;color:var(--tx);margin:0;}
    .aria-head-sub{font-size:11px;color:var(--t3);margin-top:1px;}
    .aria-close{margin-left:auto;background:var(--s2);border:1px solid var(--bd);border-radius:7px;width:28px;height:28px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--t2);font-size:14px;flex-shrink:0;}
    .aria-close:hover{color:var(--tx);}
    /* Proactive banner */
    .aria-probanner{margin:8px 14px 0;background:var(--acd);border:1px solid var(--acb);border-radius:10px;padding:9px 13px;display:flex;align-items:center;gap:9px;font-size:12px;color:var(--ac);display:none;}
    .aria-probanner.show{display:flex;}
    .aria-pb-close{margin-left:auto;cursor:pointer;color:var(--t3);font-size:14px;}
    /* Messages */
    .aria-msgs{flex:1;overflow-y:auto;padding:13px 15px;display:flex;flex-direction:column;gap:12px;scroll-behavior:smooth;}
    .aria-msgs::-webkit-scrollbar{width:3px;}
    .aria-msgs::-webkit-scrollbar-thumb{background:var(--bd2);border-radius:2px;}
    .aria-empty{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:7px;padding:20px;}
    .aria-empty-icon{width:60px;height:60px;border-radius:16px;background:var(--sf);border:1px solid var(--bd);display:flex;align-items:center;justify-content:center;font-family:'DM Serif Display',serif;font-size:26px;color:var(--ac);margin-bottom:3px;}
    .aria-empty h3{font-family:'DM Serif Display',serif;font-size:17px;color:var(--t3);margin:0;}
    .aria-empty p{font-size:12px;color:var(--t3);max-width:220px;line-height:1.6;margin:0;}
    /* Messages */
    .aria-msg{display:flex;gap:8px;animation:ariaMsgIn .25s ease both;max-width:88%;}
    .aria-msg.user{align-self:flex-end;flex-direction:row-reverse;}
    .aria-msg.bot{align-self:flex-start;}
    .aria-msg-av{width:28px;height:28px;border-radius:8px;background:var(--ac);color:#fff;display:flex;align-items:center;justify-content:center;font-family:'DM Serif Display',serif;font-size:13px;flex-shrink:0;}
    .aria-bubble{padding:10px 13px;border-radius:14px;font-size:13px;line-height:1.72;word-break:break-word;}
    .aria-msg.bot .aria-bubble{background:var(--bb);border:1px solid var(--bd);border-radius:4px 14px 14px 14px;color:var(--tx);}
    .aria-msg.user .aria-bubble{background:var(--ub);border-radius:14px 4px 14px 14px;color:var(--ut);}
    .aria-bubble strong{font-weight:600;}
    .aria-bubble em{opacity:.8;font-style:italic;}
    .aria-bubble ul,.aria-bubble ol{margin:5px 0 5px 15px;}
    .aria-bubble li{margin:2px 0;}
    /* Typing indicator */
    .aria-typing{display:flex;gap:8px;align-items:flex-start;animation:ariaMsgIn .25s ease both;}
    .aria-dots{background:var(--bb);border:1px solid var(--bd);border-radius:4px 14px 14px 14px;padding:11px 14px;display:flex;gap:4px;align-items:center;}
    .aria-dot{width:5px;height:5px;border-radius:50%;background:var(--t3);animation:ariaBounce 1.2s ease infinite;}
    .aria-dot:nth-child(2){animation-delay:.18s;}
    .aria-dot:nth-child(3){animation-delay:.36s;}
    /* Quick questions */
    .aria-qs{padding:0 15px 9px;display:flex;flex-wrap:wrap;gap:5px;}
    .aria-q{background:var(--sf);border:1px solid var(--bd);border-radius:100px;padding:5px 11px;font-size:11px;color:var(--t3);cursor:pointer;transition:all .2s;font-family:'DM Sans',sans-serif;}
    .aria-q:hover{border-color:var(--acb);color:var(--ac);background:var(--acd);}
    /* Lead form */
    .aria-lf{background:var(--sf);border:1px solid var(--bd);border-radius:14px;padding:15px;animation:ariaMsgIn .3s ease both;}
    .aria-lf h4{font-family:'DM Serif Display',serif;font-size:15px;color:var(--tx);margin:0 0 4px;}
    .aria-lf p{font-size:12px;color:var(--t2);margin:0 0 11px;line-height:1.5;}
    /* Input bar */
    .aria-input-bar{padding:9px 13px 15px;border-top:1px solid var(--bd);background:var(--sf);flex-shrink:0;}
    .aria-input-row{display:flex;gap:7px;align-items:flex-end;}
    .aria-input-wrap{flex:1;min-width:0;}
    .aria-textarea{width:100%;background:var(--s2);border:1px solid var(--bd);border-radius:10px;padding:10px 13px;font-family:'DM Sans',sans-serif;font-size:14px;color:var(--tx);resize:none;outline:none;transition:border-color .2s;min-height:42px;max-height:100px;line-height:1.5;display:block;}
    .aria-textarea::placeholder{color:var(--t3);}
    .aria-textarea:focus{border-color:var(--acb);}
    .aria-textarea:disabled{opacity:.35;cursor:not-allowed;}
    .aria-voice-btn{width:34px;height:34px;border-radius:9px;background:var(--s2);border:1px solid var(--bd);display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:15px;flex-shrink:0;transition:all .2s;}
    .aria-voice-btn:hover{border-color:var(--acb);}
    .aria-voice-btn.rec{background:rgba(239,68,68,.12);border-color:#ef4444;animation:ariaRecPulse 1s ease infinite;}
    .aria-send-btn{width:42px;height:42px;border-radius:10px;flex-shrink:0;background:var(--ac);border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .2s;color:#fff;}
    .aria-send-btn:hover{opacity:.85;}
    .aria-send-btn:disabled{opacity:.3;cursor:not-allowed;}
    .aria-send-btn svg{width:16px;height:16px;fill:currentColor;}
    .aria-vstatus{font-size:10px;color:var(--t3);text-align:center;height:14px;margin-top:4px;}
    /* Fields */
    .aria-field{width:100%;padding:9px 12px;border:1px solid var(--bd);border-radius:8px;background:var(--s2);color:var(--tx);font-family:'DM Sans',sans-serif;font-size:13px;outline:none;margin-bottom:7px;transition:border-color .2s;}
    .aria-field:focus{border-color:var(--acb);}
    .aria-btn{padding:9px 16px;border-radius:8px;background:var(--ac);color:#fff;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:600;border:none;cursor:pointer;transition:opacity .2s;width:100%;}
    .aria-btn:hover{opacity:.85;}
    /* Toast */
    #aria-toasts{position:fixed;bottom:100px;right:22px;z-index:2147483647;display:flex;flex-direction:column;gap:5px;pointer-events:none;}
    .aria-toast{background:#fff;border:1px solid rgba(0,0,0,0.1);color:#111;padding:8px 13px;border-radius:9px;font-size:12px;font-family:'DM Sans',sans-serif;box-shadow:0 4px 16px rgba(0,0,0,0.12);animation:ariaSlideUp .25s ease both;}
    .aria-toast.out{animation:ariaSlideDown .25s ease both;}
    /* Handoff bar */
    .aria-hbar{display:flex;align-items:center;gap:8px;padding:6px 14px;font-size:11px;color:#f59e0b;background:rgba(245,158,11,.07);border-top:1px solid rgba(245,158,11,.2);display:none;}
    .aria-hbar.show{display:flex;}
    .aria-hbar-btn{margin-left:auto;padding:4px 10px;border-radius:6px;background:var(--acd);border:1px solid var(--acb);color:var(--ac);font-size:11px;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif;}
    /* Modal */
    .aria-modal-ov{display:none;position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:2147483646;backdrop-filter:blur(6px);align-items:center;justify-content:center;}
    .aria-modal-ov.open{display:flex;}
    .aria-modal{background:#fff;border-radius:18px;padding:22px;max-width:320px;width:92%;box-shadow:0 8px 32px rgba(0,0,0,0.2);animation:ariaFadeUp .25s ease both;font-family:'DM Sans',sans-serif;}
    .aria-modal h3{font-family:'DM Serif Display',serif;font-size:17px;margin:0 0 5px;}
    .aria-modal p{font-size:12px;color:#6b7280;margin:0 0 14px;line-height:1.6;}
    .aria-modal-btns{display:flex;gap:7px;}
    .aria-modal-btns .aria-btn{flex:1;}
    .aria-btn-ghost{background:transparent;border:1px solid rgba(0,0,0,0.12);color:#6b7280;}
    .aria-btn-ghost:hover{background:rgba(0,0,0,0.04);}
    /* Animations */
    @keyframes ariaMsgIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
    @keyframes ariaBounce{0%,80%,100%{transform:translateY(0)}40%{transform:translateY(-5px)}}
    @keyframes ariaRecPulse{0%,100%{box-shadow:0 0 0 0 rgba(239,68,68,.4)}70%{box-shadow:0 0 0 6px rgba(239,68,68,0)}}
    @keyframes ariaSlideUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
    @keyframes ariaSlideDown{from{opacity:1;transform:translateY(0)}to{opacity:0;transform:translateY(8px)}}
    @keyframes ariaFadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
    @media(max-width:480px){.aria-w{right:0;left:0;bottom:0;width:100%;max-width:100%;height:100%;max-height:100%;border-radius:0;}#aria-launcher{bottom:16px;right:16px;}}
  `;
  const style = document.createElement('style');
  style.id = 'aria-widget-styles';
  style.textContent = css;
  document.head.appendChild(style);
}

/* ── 7. INJECT HTML ── */
function injectHTML(){
  // Launcher
  const launcher = document.createElement('button');
  launcher.id = 'aria-launcher';
  launcher.style.setProperty('--ac', cfg.botColor);
  launcher.innerHTML = `<span id="aria-launcher-icon">💬</span><span class="aria-notif" id="aria-notif"></span>`;
  launcher.onclick = toggleWidget;
  document.body.appendChild(launcher);

  // Toast container
  const toasts = document.createElement('div');
  toasts.id = 'aria-toasts';
  document.body.appendChild(toasts);

  // Chat window
  const win = document.createElement('div');
  win.className = 'aria-w';
  win.id = 'aria-win';
  win.setAttribute('data-theme','intercom');
  win.innerHTML = `
    <!-- Header -->
    <div class="aria-head">
      <div class="aria-av" id="aria-av">${cfg.botName[0]||'A'}</div>
      <div class="aria-head-info">
        <h3 id="aria-bot-name">${cfg.botName}</h3>
        <div class="aria-head-sub" id="aria-head-sub">Powered by AI</div>
      </div>
      <div class="aria-close" onclick="window.__ariaWidget.close()">✕</div>
    </div>
    <!-- Proactive banner -->
    <div class="aria-probanner" id="aria-probanner">
      <span id="aria-protext"></span>
      <span class="aria-pb-close" onclick="document.getElementById('aria-probanner').classList.remove('show')">✕</span>
    </div>
    <!-- Messages -->
    <div class="aria-msgs" id="aria-msgs">
      <div class="aria-empty" id="aria-empty">
        <div class="aria-empty-icon" id="aria-empty-icon">${cfg.botName[0]||'A'}</div>
        <h3>Hi there! 👋</h3>
        <p>Ask me anything — I'm here to help.</p>
      </div>
    </div>
    <!-- Quick questions -->
    <div class="aria-qs" id="aria-qs" style="display:none">
      <div class="aria-q" onclick="window.__ariaWidget.askQ(this)">What services do you offer?</div>
      <div class="aria-q" onclick="window.__ariaWidget.askQ(this)">What are your prices?</div>
      <div class="aria-q" onclick="window.__ariaWidget.askQ(this)">How do I get started?</div>
      <div class="aria-q" onclick="window.__ariaWidget.askQ(this)">🙋 Talk to a human</div>
    </div>
    <!-- Handoff bar -->
    <div class="aria-hbar" id="aria-hbar">
      <span>⚠ Need more help?</span>
      <button class="aria-hbar-btn" onclick="window.__ariaWidget.openHO()">Talk to a human</button>
    </div>
    <!-- Input -->
    <div class="aria-input-bar">
      <div class="aria-input-row">
        <div class="aria-voice-btn" id="aria-voice-btn" onclick="window.__ariaWidget.toggleVoice()">🎙️</div>
        <div class="aria-input-wrap">
          <textarea class="aria-textarea" id="aria-input" placeholder="Ask anything…" rows="1" disabled
            onkeydown="window.__ariaWidget.onKey(event)"
            oninput="window.__ariaWidget.autoR(this)"></textarea>
        </div>
        <button class="aria-send-btn" id="aria-send-btn" onclick="window.__ariaWidget.sendMsg()" disabled>
          <svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
        </button>
      </div>
      <div class="aria-vstatus" id="aria-vstatus"></div>
    </div>
  `;
  document.body.appendChild(win);

  // Handoff modal
  const hoModal = document.createElement('div');
  hoModal.className = 'aria-modal-ov';
  hoModal.id = 'aria-ho-modal';
  hoModal.innerHTML = `
    <div class="aria-modal">
      <h3>👋 Talk to a Human</h3>
      <p>Leave your details and our team will get back to you shortly.</p>
      <input class="aria-field" id="aria-ho-name" placeholder="Your name">
      <input class="aria-field" id="aria-ho-email" placeholder="Your email" type="email">
      <input class="aria-field" id="aria-ho-msg" placeholder="Your message">
      <div class="aria-modal-btns">
        <button class="aria-btn aria-btn-ghost" onclick="window.__ariaWidget.closeHO()">Cancel</button>
        <button class="aria-btn" onclick="window.__ariaWidget.submitHO()">Send →</button>
      </div>
    </div>
  `;
  document.body.appendChild(hoModal);
}

/* ── 8. THEME ── */
function applyTheme(theme){
  const win = document.getElementById('aria-win');
  if(win) win.setAttribute('data-theme', theme||'intercom');
}

/* ── 9. PERSONA ── */
function applyPersona(){
  const av   = document.getElementById('aria-av');
  const nm   = document.getElementById('aria-bot-name');
  const eico = document.getElementById('aria-empty-icon');
  const launcher = document.getElementById('aria-launcher');
  if(av){av.textContent=cfg.botName[0]||'A';av.style.background=cfg.botColor;}
  if(nm) nm.textContent=cfg.botName;
  if(eico){eico.textContent=cfg.botName[0]||'A';eico.style.color=cfg.botColor;}
  if(launcher) launcher.style.setProperty('--ac',cfg.botColor);
  const win=document.getElementById('aria-win');
  if(win) win.style.setProperty('--ac',cfg.botColor);
}

/* ── 10. OPEN / CLOSE ── */
function toggleWidget(){
  isOpen ? closeWidget() : openWidget();
}
function openWidget(){
  isOpen = true;
  document.getElementById('aria-win').classList.add('open');
  document.getElementById('aria-launcher-icon').textContent='✕';
  document.getElementById('aria-notif').classList.remove('show');
  if(!hist.length) greetUser();
  an.chats++;
}
function closeWidget(){
  isOpen = false;
  document.getElementById('aria-win').classList.remove('open');
  document.getElementById('aria-launcher-icon').textContent='💬';
}

/* ── 11. GREETING ── */
function greetUser(){
  const greet = cfg.botGreeting.replace('{name}',cfg.botName);
  addMsg(greet,'bot');
  setTimeout(()=>{
    document.getElementById('aria-qs').style.display='flex';
    checkReady();
  },400);
  if(cfg.proOn && !proFired){
    proTimer = setTimeout(()=>{
      if(!isOpen){
        document.getElementById('aria-notif').classList.add('show');
      }
      const pb = document.getElementById('aria-probanner');
      const pt = document.getElementById('aria-protext');
      if(pt) pt.textContent = cfg.proMsg;
      if(pb && isOpen) pb.classList.add('show');
      proFired = true;
    }, (cfg.proDelay||8)*1000);
  }
}

/* ── 12. CHECK READY ── */
function checkReady(){
  isReady = !!(apiKey && sources.length);
  const inp  = document.getElementById('aria-input');
  const send = document.getElementById('aria-send-btn');
  const sub  = document.getElementById('aria-head-sub');
  if(inp)  inp.disabled  = !isReady;
  if(send) send.disabled = !isReady;
  if(sub)  sub.textContent = isReady ? `Trained · ${sources.length} source${sources.length>1?'s':''}` : 'Powered by AI';
}

/* ── 13. ADD MESSAGE ── */
function addMsg(text, role){
  const empty = document.getElementById('aria-empty');
  if(empty) empty.style.display='none';
  const msgs = document.getElementById('aria-msgs');

  const div = document.createElement('div');
  div.className = `aria-msg ${role}`;

  const avDiv = document.createElement('div');
  avDiv.className = 'aria-msg-av';
  avDiv.style.background = role==='bot' ? cfg.botColor : 'transparent';
  avDiv.style.display = role==='bot' ? 'flex' : 'none';
  avDiv.textContent = cfg.botName[0]||'A';

  const bubble = document.createElement('div');
  bubble.className = 'aria-bubble';
  bubble.innerHTML = formatText(text);

  div.appendChild(avDiv);
  div.appendChild(bubble);
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
  return div;
}

function formatText(t){
  return t
    .replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>')
    .replace(/\*(.*?)\*/g,'<em>$1</em>')
    .replace(/`(.*?)`/g,'<code>$1</code>')
    .replace(/\n/g,'<br>');
}

/* ── 14. TYPING INDICATOR ── */
function showTyping(){
  const msgs = document.getElementById('aria-msgs');
  const d = document.createElement('div');
  d.className='aria-typing';d.id='aria-typing';
  const av=document.createElement('div');av.className='aria-msg-av';av.style.background=cfg.botColor;av.textContent=cfg.botName[0]||'A';
  const dots=document.createElement('div');dots.className='aria-dots';
  dots.innerHTML='<div class="aria-dot"></div><div class="aria-dot"></div><div class="aria-dot"></div>';
  d.appendChild(av);d.appendChild(dots);
  msgs.appendChild(d);msgs.scrollTop=msgs.scrollHeight;
}
function removeTyping(){
  const t=document.getElementById('aria-typing');if(t)t.remove();
}

/* ── 15. SEND MESSAGE ── */
async function sendMsg(){
  if(!isReady||isSending)return;
  const inp=document.getElementById('aria-input');
  const text=inp.value.trim();if(!text)return;

  if(/talk to (a )?human|human agent|speak to someone|real person/i.test(text)){
    addMsg(text,'user');inp.value='';inp.style.height='auto';
    addMsg("I understand you'd like to speak with a human. Let me connect you.",'bot');
    openHO();return;
  }

  const interestPhrases=/sign.?up|get started|i.?m interested|let.?s do it|i want this|set it up|i.?m in|sounds good|yes please|let.?s go|i.?m ready|how do i (buy|purchase|get|order)|i want to (buy|purchase|try|join)|sign me up|book (a|me|this|now)|ready to start/i;
  if(interestPhrases.test(text)&&!leadCaptured&&cfg.lcOn){
    addMsg(text,'user');inp.value='';inp.style.height='auto';
    addMsg("Great to hear you're interested! 🎉 Let me grab a couple quick details first.",'bot');
    setTimeout(showLeadForm,400);return;
  }

  document.getElementById('aria-qs').style.display='none';
  addMsg(text,'user');
  inp.value='';inp.style.height='auto';
  isSending=true;
  document.getElementById('aria-send-btn').disabled=true;
  inp.disabled=true;
  msgCount++;
  hist.push({role:'user',content:text});
  if(hist.length>MAX_H)hist=hist.slice(-MAX_H);
  showTyping();

  try{
    const budget=24000,perS=Math.floor(budget/Math.max(sources.length,1));
    const ctx=sources.map(s=>s.text.length>perS?s.text.substring(0,perS)+'…':s.text).join('\n\n══\n\n');
    const sys=`You are ${cfg.botName}, a professional and friendly AI assistant.\n${LANG_SYS[cfg.lang]||''}\nUse the knowledge base below to answer questions. Be concise and warm. Use **bold** for key terms.\n\n═══ KNOWLEDGE BASE ═══\n${ctx}\n═══ END ═══`;
    const reply = await callAI(sys,hist);
    removeTyping();
    hist.push({role:'assistant',content:reply});
    if(hist.length>MAX_H)hist=hist.slice(-MAX_H);
    addMsg(reply,'bot');
    an.msgs++;

    // Lead score
    if(/price|cost|how much|book|appointment|schedule|buy|purchase|sign up/i.test(text)) leadScore='hot';
    else if(/service|offer|work|help|option|available/i.test(text)&&leadScore==='cold') leadScore='warm';

    // Handoff trigger
    if(msgCount>4&&leadScore!=='hot'){
      document.getElementById('aria-hbar').classList.add('show');
    }
  }catch(err){
    removeTyping();
    addMsg('Sorry, I had trouble responding. Please try again.','bot');
  }finally{
    isSending=false;
    const s=document.getElementById('aria-send-btn');
    const i=document.getElementById('aria-input');
    if(s)s.disabled=false;
    if(i)i.disabled=false;
    if(i)i.focus();
  }
}

/* ── 16. CALL AI ── */
async function callAI(sys,history){
  const prov = PROVIDERS[curProvider]||PROVIDERS.openrouter;
  const msgs = [{role:'user',content:sys},...history];
  const headers={'Content-Type':'application/json','Authorization':`Bearer ${apiKey}`};
  if(curProvider==='openrouter') headers['HTTP-Referer']=location.href;

  const body=JSON.stringify({model:prov.model,messages:msgs,max_tokens:600,temperature:0.7});
  const r=await fetch(prov.endpoint,{method:'POST',headers,body,signal:AbortSignal.timeout(TO)});
  const d=await r.json();
  if(!r.ok)throw new Error(d.error?.message||'AI error');
  return d.choices?.[0]?.message?.content||'';
}

/* ── 17. LEAD FORM ── */
function showLeadForm(){
  const msgs=document.getElementById('aria-msgs');
  const form=document.createElement('div');
  form.className='aria-lf';form.id='aria-lf';
  form.innerHTML=`
    <h4>Quick Details</h4>
    <p>Just a few things so we can follow up with you personally.</p>
    ${cfg.lcName?`<input class="aria-field" id="aria-lf-name" placeholder="Your name">`:``}
    ${cfg.lcEmail?`<input class="aria-field" id="aria-lf-email" placeholder="Email address" type="email">`:``}
    ${cfg.lcPhone?`<input class="aria-field" id="aria-lf-phone" placeholder="Phone number" type="tel">`:``}
    <button class="aria-btn" onclick="window.__ariaWidget.submitLead()">Continue →</button>
  `;
  msgs.appendChild(form);
  msgs.scrollTop=msgs.scrollHeight;
}

async function submitLead(){
  const name  = document.getElementById('aria-lf-name')?.value.trim()||'';
  const email = document.getElementById('aria-lf-email')?.value.trim()||'';
  const phone = document.getElementById('aria-lf-phone')?.value.trim()||'';
  if(cfg.lcName&&!name)return toast('Please enter your name');
  if(cfg.lcEmail&&!email)return toast('Please enter your email');

  document.getElementById('aria-lf')?.remove();
  leadCaptured=true;an.leads++;

  const lead={
    name,email,phone,
    score:leadScore,
    bot_name:cfg.botName,
    captured_at:new Date().toISOString(),
    source:location.hostname
  };

  await sbInsert('aria_leads',lead);
  if(emailCfg.enabled&&!emailSentForLead) sendLeadEmail(lead);
  emailSentForLead=true;

  addMsg(`Thanks ${name}! 🎉 We'll be in touch at ${email}. Now, how can I help you?`,'bot');
  checkReady();
}

/* ── 18. EMAIL ── */
async function sendLeadEmail(lead){
  if(!emailCfg.serviceId||!emailCfg.templateId||!emailCfg.publicKey) return;
  if(typeof emailjs==='undefined') return;
  const tip = leadScore==='hot'
    ? `🔥 HOT LEAD — Call within <b>5 minutes</b>. Leads contacted under 5 mins are 21× more likely to convert.`
    : leadScore==='warm'
    ? `🌡️ WARM LEAD — Follow up within <b>1 hour</b>. Businesses responding within an hour are 7× more likely to convert.`
    : `🧊 COLD — Send a soft intro SMS or email within <b>24 hours</b>. Consistent nurturing increases acquisition by 25%+.`;
  try{
    emailjs.init(emailCfg.publicKey);
    await emailjs.send(emailCfg.serviceId, emailCfg.templateId,{
      to_name:emailCfg.toName||'Team',
      to_email:emailCfg.toEmail,
      lead_name:lead.name,
      lead_email:lead.email,
      lead_phone:lead.phone||'—',
      lead_score:leadScore.toUpperCase(),
      follow_up_tip:tip,
      captured_at:lead.captured_at,
      source:lead.source,
      bot_name:cfg.botName,
    });
  }catch(_){}
}

/* ── 19. HANDOFF MODAL ── */
function openHO(){ document.getElementById('aria-ho-modal').classList.add('open'); }
function closeHO(){ document.getElementById('aria-ho-modal').classList.remove('open'); }
async function submitHO(){
  const name  = document.getElementById('aria-ho-name')?.value.trim()||'';
  const email = document.getElementById('aria-ho-email')?.value.trim()||'';
  const msg   = document.getElementById('aria-ho-msg')?.value.trim()||'';
  if(!name||!email) return toast('Please fill in name and email');
  closeHO();
  addMsg(`✅ Thanks ${name}! Our team will reach out to ${email} shortly.`,'bot');
  an.handoffs++;
  await sbInsert('aria_leads',{name,email,score:'handoff',bot_name:cfg.botName,captured_at:new Date().toISOString(),source:location.hostname,notes:msg});
}

/* ── 20. VOICE ── */
function setupVoice(){
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SR){document.getElementById('aria-voice-btn').style.display='none';return;}
  recognition=new SR();recognition.continuous=false;recognition.interimResults=true;
  recognition.onresult=e=>{
    const t=Array.from(e.results).map(r=>r[0].transcript).join('');
    const inp=document.getElementById('aria-input');
    if(inp){inp.value=t;autoR(inp);}
  };
  recognition.onend=()=>{
    isRec=false;
    document.getElementById('aria-voice-btn')?.classList.remove('rec');
    const vs=document.getElementById('aria-vstatus');if(vs)vs.textContent='';
  };
  recognition.onerror=()=>{isRec=false;document.getElementById('aria-voice-btn')?.classList.remove('rec');};
}
function toggleVoice(){
  if(!recognition)return toast('Voice not supported in this browser');
  if(isRec){recognition.stop();}
  else{
    recognition.lang=cfg.lang||'en';recognition.start();isRec=true;
    document.getElementById('aria-voice-btn')?.classList.add('rec');
    const vs=document.getElementById('aria-vstatus');if(vs)vs.textContent='🎙️ Listening… tap to stop';
  }
}

/* ── 21. HELPERS ── */
function askQ(el){
  const inp=document.getElementById('aria-input');
  if(inp){inp.value=el.textContent;sendMsg();}
}
function onKey(e){if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMsg();}}
function autoR(el){el.style.height='auto';el.style.height=Math.min(el.scrollHeight,100)+'px';}
function toast(msg){
  const c=document.getElementById('aria-toasts');if(!c)return;
  const t=document.createElement('div');t.className='aria-toast';t.textContent=msg;
  c.appendChild(t);
  setTimeout(()=>{t.classList.add('out');setTimeout(()=>t.remove(),300);},2800);
}

/* ── 22. INIT ── */
async function init(){
  injectStyles();
  // Load EmailJS
  loadScript('https://cdn.jsdelivr.net/npm/@emailjs/browser@3/dist/email.min.js',()=>{});
  await loadConfig();
  injectHTML();
  applyPersona();
  setupVoice();
  checkReady();
}

/* ── 23. EXPOSE PUBLIC API ── */
window.__ariaWidget={
  open:openWidget, close:closeWidget, toggle:toggleWidget,
  sendMsg, askQ, onKey, autoR, toggleVoice,
  openHO, closeHO, submitHO, submitLead
};

/* ── 24. BOOT ── */
if(document.readyState==='loading'){
  document.addEventListener('DOMContentLoaded', init);
}else{
  init();
}

})();
