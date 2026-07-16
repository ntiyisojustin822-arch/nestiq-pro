const themes={
  gold:{
    name:'Gold',
    description:'Classic NestIQ — warm and professional',
    preview:'#c9a84c',
    light:{'--gold':'#c9a84c','--gold-light':'#e8d49a','--rust':'#c46a3a','--sage':'#5a7a60','--sky':'#3a6b8a','--ink':'#0e1117','--paper':'#f7f4ef','--cream':'#ede9e1'},
    dark:{'--gold':'#d4aa5a','--gold-light':'#b8943e','--ink':'#f0ece4','--paper':'#0f1117','--cream':'#1a1e28'}
  },
  ocean:{
    name:'Ocean',
    description:'Cool blue tones — calm and modern',
    preview:'#2563eb',
    light:{'--gold':'#2563eb','--gold-light':'#93c5fd','--rust':'#dc2626','--sage':'#059669','--sky':'#0891b2','--ink':'#0f172a','--paper':'#f0f9ff','--cream':'#e0f2fe'},
    dark:{'--gold':'#3b82f6','--gold-light':'#1d4ed8','--ink':'#e2e8f0','--paper':'#0f172a','--cream':'#1e293b'}
  },
  forest:{
    name:'Forest',
    description:'Deep green — earthy and grounded',
    preview:'#16a34a',
    light:{'--gold':'#16a34a','--gold-light':'#86efac','--rust':'#dc2626','--sage':'#15803d','--sky':'#0369a1','--ink':'#14532d','--paper':'#f0fdf4','--cream':'#dcfce7'},
    dark:{'--gold':'#22c55e','--gold-light':'#166534','--ink':'#d1fae5','--paper':'#052e16','--cream':'#14532d'}
  },
  sunset:{
    name:'Sunset',
    description:'Warm oranges — energetic and bold',
    preview:'#ea580c',
    light:{'--gold':'#ea580c','--gold-light':'#fed7aa','--rust':'#dc2626','--sage':'#16a34a','--sky':'#0369a1','--ink':'#431407','--paper':'#fff7ed','--cream':'#ffedd5'},
    dark:{'--gold':'#f97316','--gold-light':'#c2410c','--ink':'#ffedd5','--paper':'#1c0a00','--cream':'#431407'}
  },
  midnight:{
    name:'Midnight',
    description:'Deep navy — sleek and sophisticated',
    preview:'#4f46e5',
    light:{'--gold':'#4f46e5','--gold-light':'#a5b4fc','--rust':'#e11d48','--sage':'#059669','--sky':'#0284c7','--ink':'#1e1b4b','--paper':'#f5f3ff','--cream':'#ede9fe'},
    dark:{'--gold':'#818cf8','--gold-light':'#3730a3','--ink':'#e0e7ff','--paper':'#0f0e1a','--cream':'#1e1b4b'}
  },
  classic:{
    name:'Classic',
    description:'Black and white — clean and minimal',
    preview:'#111111',
    light:{'--gold':'#111111','--gold-light':'#888888','--rust':'#cc0000','--sage':'#006600','--sky':'#0044cc','--ink':'#111111','--paper':'#ffffff','--cream':'#f5f5f5'},
    dark:{'--gold':'#eeeeee','--gold-light':'#666666','--ink':'#ffffff','--paper':'#0a0a0a','--cream':'#1a1a1a'}
  }
};

function getThemeName(){
  return String(localStorage.getItem('nestiq-theme-name')||'gold');
}

function applyThemeCore(themeName, opts={}){
  const s=window.getSession?.();
  const role=s?.role||null;
  const themeKey=themes[themeName]?themeName:'gold';
  const finalKey=(role==='tenant' || role==='landlord') ? themeKey : themeKey;

  const mode=document.documentElement.getAttribute('data-theme')==='dark'?'dark':'light';
  const theme=themes[finalKey]||themes.gold;
  const variant=theme[mode]||{};
  Object.keys(variant).forEach(k=>document.documentElement.style.setProperty(k, variant[k]));

  localStorage.setItem('nestiq-theme-name', finalKey);
  updateThemeIndicators();
  if(!opts.silent) showNotif?.(`Theme changed to ${theme.name}`,'success');
}

function applyTheme(themeName, opts={}){
  if(!opts.silent && typeof nestiqAnimatedThemeSwitch==='function'){
    const theme=themes[themes[themeName]?themeName:'gold']||themes.gold;
    nestiqAnimatedThemeSwitch(()=>applyThemeCore(themeName,{...opts,silent:true}));
    showNotif?.(`Theme changed to ${theme.name}`,'success');
    return;
  }
  applyThemeCore(themeName, opts);
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
  applyTheme(getThemeName(),{silent:true});
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
}

function applySettingsThemePick(key){
  const s=window.getSession?.();
  if(s?.role==='tenant') applyTenantTheme(key);
  else applyTheme(key);
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
}
function restoreThemePreview(){
  applyTheme(getThemeName(),{silent:true});
}

function applyTenantTheme(themeName){
  const tenant=window.getCurrentTenant?.();
  if(!tenant) return;
  const key=themes[themeName]?themeName:'gold';
  tenant.preferredTheme=key;
  window.saveData?.();
  localStorage.setItem('nestiq-theme-name', key);
  applyTheme(key,{silent:true});
  showNotif?.(`Theme changed to ${(themes[key]||themes.gold).name}`,'success');
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
