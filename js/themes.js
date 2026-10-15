const themes={
  gold:{
    name:'Gold',
    description:'Classic NestIQ — warm and professional',
    preview:'#c9a84c',
    light:{'--gold':'#c9a84c','--gold-light':'#e8d49a','--rust':'#c46a3a','--sage':'#5a7a60','--sky':'#3a6b8a','--ink':'#0e1117','--paper':'#f7f4ef','--cream':'#ede9e1','--on-gold':'#0e1117','--muted':'#6b665e','--card-bg':'#ffffff','--white':'#ffffff','--border':'rgba(201,168,76,0.18)','--border-soft':'rgba(14,17,23,0.08)','--shadow':'0 4px 32px rgba(14,17,23,0.08)','--shadow-lg':'0 12px 60px rgba(14,17,23,0.14)','--gold-soft':'rgba(201,168,76,0.14)','--gold-glow':'rgba(201,168,76,0.28)','--nav-bg':'rgba(247,244,239,0.88)','--input-bg':'#f7f4ef','--focus':'0 0 0 3px rgba(201,168,76,0.22)'},
    dark:{'--gold':'#d4aa5a','--gold-light':'#b8943e','--ink':'#f0ece4','--paper':'#0f1117','--cream':'#1a1e28','--on-gold':'#0f1117','--muted':'#9a958c','--card-bg':'#1a1e28','--white':'#1a1e28','--border':'rgba(212,170,90,0.18)','--border-soft':'rgba(240,236,228,0.07)','--shadow':'0 4px 32px rgba(0,0,0,0.3)','--shadow-lg':'0 12px 60px rgba(0,0,0,0.4)','--gold-soft':'rgba(212,170,90,0.16)','--gold-glow':'rgba(212,170,90,0.28)','--nav-bg':'rgba(15,17,23,0.92)','--input-bg':'#0f1117','--focus':'0 0 0 3px rgba(212,170,90,0.22)'}
  },
  ocean:{
    name:'Ocean',
    description:'Cool blue tones — calm and modern',
    preview:'#2563eb',
    light:{'--gold':'#2563eb','--gold-light':'#93c5fd','--rust':'#dc2626','--sage':'#059669','--sky':'#0891b2','--ink':'#0f172a','--paper':'#f0f9ff','--cream':'#e0f2fe','--on-gold':'#ffffff','--muted':'#64748b','--card-bg':'#ffffff','--white':'#ffffff','--border':'rgba(37,99,235,0.18)','--border-soft':'rgba(15,23,42,0.08)','--shadow':'0 4px 32px rgba(15,23,42,0.07)','--shadow-lg':'0 12px 56px rgba(15,23,42,0.12)','--gold-soft':'rgba(37,99,235,0.12)','--gold-glow':'rgba(37,99,235,0.28)','--nav-bg':'rgba(240,249,255,0.9)','--input-bg':'#f0f9ff','--focus':'0 0 0 3px rgba(37,99,235,0.22)'},
    dark:{'--gold':'#3b82f6','--gold-light':'#1d4ed8','--ink':'#e2e8f0','--paper':'#0f172a','--cream':'#1e293b','--on-gold':'#0f172a','--muted':'#94a3b8','--card-bg':'#1e293b','--white':'#1e293b','--border':'rgba(59,130,246,0.22)','--border-soft':'rgba(226,232,240,0.08)','--shadow':'0 4px 32px rgba(0,0,0,0.32)','--shadow-lg':'0 12px 60px rgba(0,0,0,0.42)','--gold-soft':'rgba(59,130,246,0.16)','--gold-glow':'rgba(59,130,246,0.3)','--nav-bg':'rgba(15,23,42,0.92)','--input-bg':'#0f172a','--focus':'0 0 0 3px rgba(59,130,246,0.24)'}
  },
  forest:{
    name:'Forest',
    description:'Deep green — earthy and grounded',
    preview:'#16a34a',
    light:{'--gold':'#16a34a','--gold-light':'#86efac','--rust':'#dc2626','--sage':'#15803d','--sky':'#0369a1','--ink':'#14532d','--paper':'#f0fdf4','--cream':'#dcfce7','--on-gold':'#ffffff','--muted':'#4d7c5a','--card-bg':'#ffffff','--white':'#ffffff','--border':'rgba(22,163,74,0.18)','--border-soft':'rgba(20,83,45,0.08)','--shadow':'0 4px 32px rgba(20,83,45,0.07)','--shadow-lg':'0 12px 56px rgba(20,83,45,0.12)','--gold-soft':'rgba(22,163,74,0.12)','--gold-glow':'rgba(22,163,74,0.26)','--nav-bg':'rgba(240,253,244,0.9)','--input-bg':'#f0fdf4','--focus':'0 0 0 3px rgba(22,163,74,0.22)'},
    dark:{'--gold':'#22c55e','--gold-light':'#166534','--ink':'#d1fae5','--paper':'#052e16','--cream':'#14532d','--on-gold':'#052e16','--muted':'#86efac','--card-bg':'#14532d','--white':'#14532d','--border':'rgba(34,197,94,0.22)','--border-soft':'rgba(209,250,229,0.08)','--shadow':'0 4px 32px rgba(0,0,0,0.32)','--shadow-lg':'0 12px 60px rgba(0,0,0,0.42)','--gold-soft':'rgba(34,197,94,0.16)','--gold-glow':'rgba(34,197,94,0.28)','--nav-bg':'rgba(5,46,22,0.92)','--input-bg':'#052e16','--focus':'0 0 0 3px rgba(34,197,94,0.24)'}
  },
  sunset:{
    name:'Sunset',
    description:'Warm oranges — energetic and bold',
    preview:'#ea580c',
    light:{'--gold':'#ea580c','--gold-light':'#fed7aa','--rust':'#dc2626','--sage':'#16a34a','--sky':'#0369a1','--ink':'#431407','--paper':'#fff7ed','--cream':'#ffedd5','--on-gold':'#ffffff','--muted':'#9a3412','--card-bg':'#ffffff','--white':'#ffffff','--border':'rgba(234,88,12,0.2)','--border-soft':'rgba(67,20,7,0.08)','--shadow':'0 4px 32px rgba(67,20,7,0.07)','--shadow-lg':'0 12px 56px rgba(67,20,7,0.12)','--gold-soft':'rgba(234,88,12,0.12)','--gold-glow':'rgba(234,88,12,0.28)','--nav-bg':'rgba(255,247,237,0.9)','--input-bg':'#fff7ed','--focus':'0 0 0 3px rgba(234,88,12,0.22)'},
    dark:{'--gold':'#f97316','--gold-light':'#c2410c','--ink':'#ffedd5','--paper':'#1c0a00','--cream':'#431407','--on-gold':'#1c0a00','--muted':'#fdba74','--card-bg':'#431407','--white':'#431407','--border':'rgba(249,115,22,0.24)','--border-soft':'rgba(255,237,213,0.08)','--shadow':'0 4px 32px rgba(0,0,0,0.32)','--shadow-lg':'0 12px 60px rgba(0,0,0,0.42)','--gold-soft':'rgba(249,115,22,0.16)','--gold-glow':'rgba(249,115,22,0.3)','--nav-bg':'rgba(28,10,0,0.92)','--input-bg':'#1c0a00','--focus':'0 0 0 3px rgba(249,115,22,0.24)'}
  },
  midnight:{
    name:'Midnight',
    description:'Deep navy — sleek and sophisticated',
    preview:'#4f46e5',
    light:{'--gold':'#4f46e5','--gold-light':'#a5b4fc','--rust':'#e11d48','--sage':'#059669','--sky':'#0284c7','--ink':'#1e1b4b','--paper':'#f5f3ff','--cream':'#ede9fe','--on-gold':'#ffffff','--muted':'#6366f1','--card-bg':'#ffffff','--white':'#ffffff','--border':'rgba(79,70,229,0.18)','--border-soft':'rgba(30,27,75,0.08)','--shadow':'0 4px 32px rgba(30,27,75,0.07)','--shadow-lg':'0 12px 56px rgba(30,27,75,0.12)','--gold-soft':'rgba(79,70,229,0.12)','--gold-glow':'rgba(79,70,229,0.28)','--nav-bg':'rgba(245,243,255,0.9)','--input-bg':'#f5f3ff','--focus':'0 0 0 3px rgba(79,70,229,0.22)'},
    dark:{'--gold':'#818cf8','--gold-light':'#3730a3','--ink':'#e0e7ff','--paper':'#0f0e1a','--cream':'#1e1b4b','--on-gold':'#0f0e1a','--muted':'#a5b4fc','--card-bg':'#1e1b4b','--white':'#1e1b4b','--border':'rgba(129,140,248,0.24)','--border-soft':'rgba(224,231,255,0.08)','--shadow':'0 4px 32px rgba(0,0,0,0.32)','--shadow-lg':'0 12px 60px rgba(0,0,0,0.42)','--gold-soft':'rgba(129,140,248,0.16)','--gold-glow':'rgba(129,140,248,0.3)','--nav-bg':'rgba(15,14,26,0.92)','--input-bg':'#0f0e1a','--focus':'0 0 0 3px rgba(129,140,248,0.24)'}
  },
  classic:{
    name:'Classic',
    description:'Black and white — clean and minimal',
    preview:'#111111',
    light:{'--gold':'#111111','--gold-light':'#888888','--rust':'#cc0000','--sage':'#006600','--sky':'#0044cc','--ink':'#111111','--paper':'#ffffff','--cream':'#f5f5f5','--on-gold':'#ffffff','--muted':'#6b6b6b','--card-bg':'#ffffff','--white':'#ffffff','--border':'rgba(17,17,17,0.12)','--border-soft':'rgba(17,17,17,0.08)','--shadow':'0 4px 28px rgba(0,0,0,0.06)','--shadow-lg':'0 14px 48px rgba(0,0,0,0.1)','--gold-soft':'rgba(17,17,17,0.08)','--gold-glow':'rgba(17,17,17,0.2)','--nav-bg':'rgba(255,255,255,0.92)','--input-bg':'#f5f5f5','--focus':'0 0 0 3px rgba(17,17,17,0.16)'},
    dark:{'--gold':'#eeeeee','--gold-light':'#666666','--ink':'#ffffff','--paper':'#0a0a0a','--cream':'#1a1a1a','--on-gold':'#0a0a0a','--muted':'#a3a3a3','--card-bg':'#161616','--white':'#161616','--border':'rgba(238,238,238,0.14)','--border-soft':'rgba(255,255,255,0.08)','--shadow':'0 4px 32px rgba(0,0,0,0.4)','--shadow-lg':'0 12px 60px rgba(0,0,0,0.5)','--gold-soft':'rgba(238,238,238,0.12)','--gold-glow':'rgba(238,238,238,0.22)','--nav-bg':'rgba(10,10,10,0.92)','--input-bg':'#0a0a0a','--focus':'0 0 0 3px rgba(238,238,238,0.2)'}
  }
};

function getThemeName(){
  return String(localStorage.getItem('nestiq-theme-name')||'gold');
}

function applyTheme(themeName, opts={}){
  const s=window.getSession?.();
  const role=s?.role||null;
  const themeKey=themes[themeName]?themeName:'gold';
  const finalKey=(role==='tenant' || role==='landlord') ? themeKey : themeKey;

  const mode=document.documentElement.getAttribute('data-theme')==='dark'?'dark':'light';
  const theme=themes[finalKey]||themes.gold;
  const variant=theme[mode]||{};
  Object.keys(variant).forEach(k=>document.documentElement.style.setProperty(k, variant[k]));
  document.documentElement.setAttribute('data-theme-name', finalKey);

  localStorage.setItem('nestiq-theme-name', finalKey);
  updateThemeIndicators();
  if(!opts.silent) nestiqShowNotif?.(`Theme changed to ${theme.name}`,'success');
}

function loadSavedTheme(){
  const s=window.getSession?.();
  if(s?.role==='tenant'){
    const tenant=(window.tenantsData||[]).find(t=>t.id===s.userId);
    if(tenant?.preferredTheme) localStorage.setItem('nestiq-theme-name', tenant.preferredTheme);
  }else if(s?.role==='landlord'){
    // landlord uses app preference; default to gold
    if(!localStorage.getItem('nestiq-theme-name')) localStorage.setItem('nestiq-theme-name','gold');
  }
  nestiqAnimatedThemeSwitch(() => applyTheme(getThemeName(),{silent:true}));
}

function updateThemeIndicators(){
  const name=getThemeName();
  const th=themes[name]||themes.gold;
  const dot=document.getElementById('navThemeDot');
  if(dot) dot.style.background=th.preview;
  const list=document.getElementById('navThemeMenu');
  if(list){
    list.querySelectorAll('[data-theme-pick]').forEach(el=>{
      el.style.outline = el.getAttribute('data-theme-pick')===name ? '2px solid var(--gold)' : 'none';
    });
  }
  const grid=document.getElementById('themeCardsGrid');
  if(grid){
    grid.querySelectorAll('.theme-card').forEach(card=>{
      const k=card.getAttribute('data-theme');
      card.classList.toggle('active', k===name);
      const chk=card.querySelector('.theme-check');
      if(chk) chk.style.display=(k===name)?'inline-flex':'none';
    });
  }
  const tenantBtn=document.getElementById('tenantThemeDot');
  if(tenantBtn) tenantBtn.style.background=th.preview;
  document.querySelectorAll('.tenant-theme-pick').forEach(el=>{
    el.classList.toggle('is-on', el.getAttribute('data-theme-pick')===name);
  });
}

function applySettingsThemePick(key){
  const s=window.getSession?.();
  if(s?.role==='tenant') applyTenantTheme(key);
  else nestiqAnimatedThemeSwitch(() => applyTheme(key));
}

function buildThemeCardsHtml(){
  return Object.entries(themes).map(([key,th])=>`
    <div class="theme-card" data-theme="${key}" onclick="applySettingsThemePick('${key}')">
      <div class="theme-preview" style="background:${th.preview}"></div>
      <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start">
        <div>
          <div class="theme-name">${th.name}</div>
          <div class="theme-desc">${th.description}</div>
        </div>
        <div class="theme-check" style="display:none">✓</div>
      </div>
    </div>
  `).join('');
}

function initSettingsThemePicker(){
  const grid=document.getElementById('themeCardsGrid');
  if(!grid) return;
  grid.innerHTML=buildThemeCardsHtml();
  updateThemeIndicators();
}

function toggleNavThemeMenu(){
  const menu=document.getElementById('navThemeMenu');
  if(!menu) return;
  menu.style.display = (menu.style.display==='block')?'none':'block';
  updateThemeIndicators();
}

function previewTheme(themeName){
  const mode=document.documentElement.getAttribute('data-theme')==='dark'?'dark':'light';
  const theme=themes[themeName]||themes.gold;
  const variant=theme[mode]||{};
  Object.keys(variant).forEach(k=>document.documentElement.style.setProperty(k, variant[k]));
  document.documentElement.setAttribute('data-theme-name', themeName);
}
function restoreThemePreview(){
  nestiqAnimatedThemeSwitch(() => applyTheme(getThemeName(),{silent:true}));
}

function applyTenantTheme(themeName){
  const tenant=window.getCurrentTenant?.();
  if(!tenant) return;
  const key=themes[themeName]?themeName:'gold';
  tenant.preferredTheme=key;
  window.saveData?.();
  localStorage.setItem('nestiq-theme-name', key);
  nestiqAnimatedThemeSwitch(() => applyTheme(key,{silent:true}));
  nestiqShowNotif?.(`Theme changed to ${(themes[key]||themes.gold).name}`,'success');
}

window.themes=themes;
window.applyTheme=applyTheme;
window.loadSavedTheme=loadSavedTheme;
window.getThemeName=getThemeName;
window.updateThemeIndicators=updateThemeIndicators;
window.initSettingsThemePicker=initSettingsThemePicker;
window.toggleNavThemeMenu=toggleNavThemeMenu;
window.previewTheme=previewTheme;
window.restoreThemePreview=restoreThemePreview;
window.applyTenantTheme=applyTenantTheme;
window.applySettingsThemePick=applySettingsThemePick;
