function generateQRCode(elementId, text, size){
  const el=document.getElementById(elementId);
  if(!el) return;
  el.innerHTML='';
  if(typeof QRCode==='undefined'){
    el.innerHTML='<div style="font-size:0.8rem;color:var(--muted)">QR library not loaded</div>';
    return;
  }
  new QRCode(el,{
    text:String(text||''),
    width:size||200,
    height:size||200,
    colorDark:'#0e1117',
    colorLight:'#ffffff',
    correctLevel:QRCode.CorrectLevel.H
  });
}

function qrCanvasOrImage(elementId){
  const el=document.getElementById(elementId);
  if(!el) return null;
  return el.querySelector('canvas') || el.querySelector('img') || null;
}

function downloadQRCode(elementId, filename='qrcode.png'){
  const node=qrCanvasOrImage(elementId);
  if(!node){ nestiqShowNotif('QR code not ready','warning'); return; }
  const url=node.tagName.toLowerCase()==='canvas' ? node.toDataURL('image/png') : node.src;
  const a=document.createElement('a');
  a.href=url;
  a.download=filename;
  a.click();
}

function printQRCode(elementId, title='NestIQ QR'){
  const node=qrCanvasOrImage(elementId);
  if(!node){ nestiqShowNotif('QR code not ready','warning'); return; }
  const url=node.tagName.toLowerCase()==='canvas' ? node.toDataURL('image/png') : node.src;
  const w=window.open('','_blank');
  if(!w) return;
  w.document.write(`<html><head><title>${title}</title><style>body{font-family:DM Sans,Arial;padding:20px;text-align:center}img{width:320px;height:320px;object-fit:contain}</style></head><body><h2>${title}</h2><img src="${url}"><script>window.print()</script></body></html>`);
  w.document.close();
}

function getQRCodeDataUrl(text,size=100){
  return new Promise((resolve,reject)=>{
    if(typeof QRCode==='undefined'){ reject(new Error('QRCode library missing')); return; }
    const tmp=document.createElement('div');
    tmp.style.position='fixed';
    tmp.style.left='-9999px';
    document.body.appendChild(tmp);
    new QRCode(tmp,{
      text:String(text||''),
      width:size,
      height:size,
      colorDark:'#0e1117',
      colorLight:'#ffffff',
      correctLevel:QRCode.CorrectLevel.H
    });
    setTimeout(()=>{
      const node=tmp.querySelector('canvas') || tmp.querySelector('img');
      if(!node){ tmp.remove(); reject(new Error('QR render failed')); return; }
      const url=node.tagName.toLowerCase()==='canvas' ? node.toDataURL('image/png') : node.src;
      tmp.remove();
      resolve(url);
    },60);
  });
}

function openTenantQrModal(tenantId){
  const t=tenantsData.find(x=>x.id===tenantId);
  if(!t) return;
  document.getElementById('modalContent').innerHTML=`
    <h2 class="modal-title">Tenant QR Code</h2>
    <div id="tenantQrBox" style="display:flex;justify-content:center;margin-top:8px"></div>
    <div style="text-align:center;font-size:0.84rem;margin-top:8px">${t.name} — ${t.property} — ${t.unit}</div>
    <div style="text-align:center;font-size:0.74rem;color:var(--muted);margin-top:4px">Scan to identify tenant</div>
    <div style="display:flex;gap:8px;justify-content:center;margin-top:12px">
      <button class="btn-outline btn-sm" onclick="downloadQRCode('tenantQrBox','tenant-${t.id}.png')" title="Download QR code" data-nq-tip="Download QR code">Download QR Code</button>
      <button class="btn-outline btn-sm" onclick="printQRCode('tenantQrBox','${t.name.replace(/'/g,'&#39;')}')">Print QR Code</button>
    </div>
  `;
  nestiqOpenModalAnimated();
  generateQRCode('tenantQrBox',`NESTIQ:tenant:${t.id}:${t.name}`,220);
}

function openPropertyQrModal(propertyId){
  const p=propertiesData.find(x=>x.id===propertyId);
  if(!p) return;
  document.getElementById('modalContent').innerHTML=`
    <h2 class="modal-title">Property QR Code</h2>
    <div id="propertyQrBox" style="display:flex;justify-content:center;margin-top:8px"></div>
    <div style="text-align:center;font-size:0.84rem;margin-top:8px">${p.name}</div>
    <div style="text-align:center;font-size:0.74rem;color:var(--muted);margin-top:4px">${p.addr}</div>
    <div style="display:flex;gap:8px;justify-content:center;margin-top:12px">
      <button class="btn-outline btn-sm" onclick="downloadQRCode('propertyQrBox','property-${p.id}.png')" title="Download QR code" data-nq-tip="Download QR code">Download QR Code</button>
      <button class="btn-outline btn-sm" onclick="printQRCode('propertyQrBox','${p.name.replace(/'/g,'&#39;')}')">Print QR Code</button>
    </div>
  `;
  nestiqOpenModalAnimated();
  generateQRCode('propertyQrBox',`NESTIQ:property:${p.id}:${p.name}:${p.addr}`,220);
}

function tenantLoginQrText(tenant){
  const unitLower=String(tenant.unit||'').toLowerCase().replace(/\s+/g,'').replace(/^unit/,'');
  return `NESTIQ:login:${tenant.email||''}:${unitLower}`;
}

function renderTenantLoginShareQr(tenantId){
  const t=tenantsData.find(x=>x.id===tenantId);
  if(!t) return;
  generateQRCode('tenantLoginQrBox', tenantLoginQrText(t), 180);
}

function renderLandlordWhatsAppQr(){
  const holder=document.getElementById('landlordWhatsAppQr');
  if(!holder) return;
  const phone=formatWhatsAppNumber(landlordSettings.phone||'');
  if(!phone){
    holder.innerHTML='<div style="font-size:0.8rem;color:var(--muted)">Add landlord phone number to generate WhatsApp QR.</div>';
    return;
  }
  holder.innerHTML='<div id="landlordWaQrBox" style="display:flex;justify-content:center"></div>';
  generateQRCode('landlordWaQrBox',`https://wa.me/${phone}`,200);
}

window.generateQRCode=generateQRCode;
window.downloadQRCode=downloadQRCode;
window.printQRCode=printQRCode;
window.getQRCodeDataUrl=getQRCodeDataUrl;
window.openTenantQrModal=openTenantQrModal;
window.openPropertyQrModal=openPropertyQrModal;
window.renderTenantLoginShareQr=renderTenantLoginShareQr;
window.renderLandlordWhatsAppQr=renderLandlordWhatsAppQr;
