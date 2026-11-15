'use strict';

const $ = selector => document.querySelector(selector);
const categories = ['Ropa y protección', 'Alimentación e hidratación', 'Aseo personal', 'Material militar y auxiliar', 'Sobre el combatiente'];
const states = {pending:'Pendiente', ready:'Preparado', checked:'Revisado'};
const seed = [
  ['Chaqueta impermeable','Pantalón impermeable','Forro polar','Camiseta térmica de repuesto',['Calcetines',1,'par'],'Muda','Guantes de frío','Gorro térmico','Gafas de protección','Protector auditivo'],
  [['Agua',2,'litros'],'Barritas o frutos secos','Cubiertos de campaña'],
  ['Cepillo y pasta de dientes','Toallitas','Papel higiénico'],
  ['Linterna frontal','Linterna fijable al fusil con pilas','Pilas de repuesto','Navaja o multiherramienta','Libreta y lápiz','Documentación militar','Batería externa y cable',['Medicación personal',1,'',true],'Manta térmica','Funda de vivac']
];
const uid = () => crypto.randomUUID();
const base = () => seed.flatMap((items, category) => items.map(entry => {
  const [name,quantity=1,unit='',optional=false] = Array.isArray(entry) ? entry : [entry];
  return {id:uid(),name,category,status:'pending',quantity,unit,optional,available:null,review:'',expiry:'',notes:'',link:'',photo:''};
}));
const key = 'mochila48h-v1';
const initial = () => {
  const id=uid();
  return {active:id,configs:[{id,name:'Mochila de 48 horas',items:base()}]};
};
let data;
try { data=JSON.parse(localStorage.getItem(key)) || initial(); }
catch { data=initial(); }
let category='all', status='all', issue='', rapid=false, editId=null, editPhoto='', configMode='', noticeTimer;
const current = () => data.configs.find(config => config.id === data.active);
const safe = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const normalize = value => value.normalize('NFD').replace(/\p{Diacritic}/gu,'').toLocaleLowerCase('es').trim().replace(/\s+/g,' ');
const today = () => new Intl.DateTimeFormat('en-CA',{year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const formatDate = date => date.split('-').reverse().join('/');
const quantity = item => item.quantity.toLocaleString('es-ES') + (item.unit ? ' '+item.unit : '');
const options = (entries,selected) => entries.map(([value,label]) => `<option value="${safe(value)}" ${String(value)===String(selected)?'selected':''}>${safe(label)}</option>`).join('');
function categoryOptions(config=current()) {
  const labels = [...categories,...(config.customCategories ?? [])];
  const order = new Set([...(config.categoryOrder ?? []),...labels.keys()]);
  return [...order].filter(index=>Number.isInteger(index) && index>=0 && index<labels.length)
    .map(index=>[index,labels[index]]);
}
const stateOptions = Object.entries(states);
const issues = {missing:'Faltante',duplicate:'Duplicado',expired:'Caducado',soon:'Caduca en 30 días'};
const notify = message => {
  clearTimeout(noticeTimer);
  $('#notice').textContent=message;
  noticeTimer=setTimeout(() => { $('#notice').textContent=''; },3500);
};
function save(next, message='Cambios guardados') {
  try { localStorage.setItem(key,JSON.stringify(next)); }
  catch { notify('No se pudo guardar. Comprueba el espacio disponible en el navegador.'); return false; }
  data=next;
  render();
  notify(message);
  return true;
}
function inspect(items) {
  const names = new Map();
  for (const item of items) {
    const name=normalize(item.name);
    names.set(name,(names.get(name)||0)+1);
  }
  const date = today();
  const threshold = new Date(date+'T00:00:00Z');
  threshold.setUTCDate(threshold.getUTCDate()+30);
  const cutoff = threshold.toISOString().slice(0,10);
  return new Map(items.map(item => [item.id,{
    missing:item.available===null ? item.status==='pending' && !item.optional : item.available<item.quantity,
    duplicate:names.get(normalize(item.name))>1,
    expired:Boolean(item.expiry && item.expiry<date),
    soon:Boolean(item.expiry && item.expiry>=date && item.expiry<=cutoff)
  }]));
}
function render() {
  const config=current();
  const items=config.items;
  const counts={pending:0,ready:0,checked:0};
  for(const item of items) counts[item.status]++;
  const flags=inspect(items);
  const shown=items.filter(item => (category==='all'||String(item.category)===category)
    && (status==='all'||item.status===status) && (!issue||flags.get(item.id)[issue])
    && normalize(item.name+' '+item.notes).includes(normalize($('#search').value)));
  $('#activity').textContent=config.name;
  $('#subtitle').textContent=items.length+' '+(items.length===1?'artículo en esta configuración':'artículos en esta configuración');
  const percent=items.length?Math.round(100*(counts.ready+counts.checked)/items.length):0;
  $('#percent').textContent=percent+' %';
  $('#progress').value=percent;
  $('#progress').setAttribute('aria-label','Material preparado o revisado');
  $('#configs').innerHTML=data.configs.map(entry => `<button class="side-button ${entry.id===data.active?'active':''}" data-config="${entry.id}" aria-pressed="${entry.id===data.active}">${safe(entry.name)}</button>`).join('');
  $('#categories').innerHTML=[['all','Todas las categorías'],...categoryOptions()].map(([value,label])=>`<button class="side-button ${String(value)===category?'active':''}" data-category="${value}" aria-pressed="${String(value)===category}">${safe(label)}<small>${value==='all'?items.length:items.filter(item=>item.category===value).length}</small></button>`).join('');
  $('#metrics').innerHTML=[['all','Total',items.length],['pending','Pendientes',counts.pending],['ready','Preparados',counts.ready],['checked','Revisados',counts.checked]].map(([value,label,count])=>`<button class="metric ${value===status?'active':''}" data-status="${value}" aria-pressed="${value===status}"><strong>${count}</strong><span>${label}</span></button>`).join('');
  $('#category').innerHTML=options([['all','Todas las categorías'],...categoryOptions()],category);
  $('#status').innerHTML=options([['all','Todos los estados'],...stateOptions],status);
  $('#count').textContent=`${shown.length} de ${items.length} artículos`;
  const issueLabels={missing:'Material faltante',duplicate:'Duplicados',expired:'Caducados',soon:'Caducan en 30 días'};
  $('#alerts').innerHTML=Object.entries(issueLabels).map(([value,label])=>{
    const count=items.filter(item=>flags.get(item.id)[value]).length;
    return count||issue===value?`<button class="alert ${issue===value?'active':''}" data-issue="${value}" aria-pressed="${issue===value}">${label} · ${count}</button>`:'';
  }).join('');
  $('#quick').setAttribute('aria-pressed',rapid);
  $('#list').classList.toggle('rapid',rapid);
  $('#list').innerHTML=categoryOptions().map(([index,label])=>{
    const group=shown.filter(item=>item.category===index);
    if(!group.length) return '';
    return `<section class="group"><h3>${safe(label)}<span>${group.length}</span></h3>${group.map(item=>row(item,flags.get(item.id))).join('')}</section>`;
  }).join('') || '<p class="empty">'+emptyMessage(items)+'</p>';
}
function emptyMessage(items) {
  if (!items.length) return 'Añade el primer artículo de esta configuración.';
  if (category!=='all' && !items.some(item=>String(item.category)===category)) {
    return 'Esta categoría está vacía. Pulsa «Añadir material» para registrar un artículo.';
  }
  return 'No hay resultados con estos filtros.';
}
function row(item,flags) {
  const info=[
    safe(quantity(item)),
    item.optional?'Solo si procede':'',
    item.available===null?'':safe('Disponible: '+item.available.toLocaleString('es-ES')),
    item.review?`<span class="detail">Revisión: ${formatDate(item.review)}</span>`:'',
    item.expiry?`<span class="detail">Caducidad: ${formatDate(item.expiry)}</span>`:'',
    item.notes?`<span class="detail">${safe(item.notes)}</span>`:'',
    item.link?`<a class="detail" href="${safe(item.link)}" target="_blank" rel="noopener noreferrer">Enlace ↗</a>`:'',
    ...Object.entries(flags).filter(([,active])=>active).map(([value])=>`<span class="flag">${issues[value]}</span>`)
  ].filter(Boolean);
  return `<div class="row"><div class="item">${item.photo?`<a href="${safe(item.photo)}" download="material.jpg" aria-label="Descargar fotografía de ${safe(item.name)}"><img alt="" src="${safe(item.photo)}"></a>`:''}<div><div class="name">${safe(item.name)}</div><div class="meta">${info.map(value=>'<span>'+value+'</span>').join('')}</div></div></div><select aria-label="Estado de ${safe(item.name)}" data-item="${item.id}" data-state="${item.status}">${options(stateOptions,item.status)}</select><button class="outline edit" data-edit="${item.id}" aria-label="Editar ${safe(item.name)}">Editar</button></div>`;
}
function updateItems(items, message) {
  const next=structuredClone(data);
  next.configs.find(config=>config.id===next.active).items=items;
  return save(next,message);
}
function previewPhoto() {
  $('#photo-preview').innerHTML=editPhoto?`<img src="${safe(editPhoto)}" alt="Fotografía del material"><button type="button" class="outline" id="remove-photo">Quitar fotografía</button>`:'';
}
function openItem(id) {
  const item=current().items.find(entry=>entry.id===id);
  editId=id;
  editPhoto=item?.photo||'';
  const form=$('#item-form');
  form.reset();
  form.elements.category.innerHTML=options(categoryOptions(),item?.category ?? (category==='all'?categoryOptions()[0][0]:category));
  form.elements.status.innerHTML=options(stateOptions,item?.status||'pending');
  for(const field of ['name','quantity','available','unit','review','expiry','notes','link']) form.elements[field].value=item?.[field] ?? (field==='quantity'?1:'');
  form.elements.optional.checked=item?.optional||false;
  $('#editor-title').textContent=item?'Editar material':'Añadir material';
  $('#editor-error').textContent='';
  $('#delete').hidden=!item;
  $('#delete').setAttribute('aria-expanded','false');
  $('#delete-material-confirmation').hidden=true;
  previewPhoto();
  $('#editor').showModal();
}
async function resizePhoto(file) {
  const image=await createImageBitmap(file);
  try {
    const scale=Math.min(1,640/Math.max(image.width,image.height));
    const canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(image.width*scale));
    canvas.height=Math.max(1,Math.round(image.height*scale));
    const context=canvas.getContext('2d');
    context.fillStyle='white';
    context.fillRect(0,0,canvas.width,canvas.height);
    context.drawImage(image,0,0,canvas.width,canvas.height);
    return canvas.toDataURL('image/jpeg',0.75);
  } finally { image.close(); }
}
$('#item-form').addEventListener('submit',async event=>{
  event.preventDefault();
  const form=event.currentTarget;
  const fields=new FormData(form);
  const button=form.querySelector('[type=submit]');
  const error=$('#editor-error');
  error.textContent='';
  const name=fields.get('name').trim();
  const link=fields.get('link').trim();
  if(!name) { error.textContent='Escribe un nombre.'; return; }
  if(link&&!/^https?:\/\//i.test(link)) { error.textContent='Usa un enlace que empiece por https:// o http://.'; return; }
  button.disabled=true;
  const submittedId=editId;
  let photo=editPhoto;
  const file=fields.get('photo');
  try {
    if(file.size) photo=await resizePhoto(file);
  } catch { error.textContent='No se pudo abrir la fotografía. Prueba con JPG o PNG.'; return; }
  finally { button.disabled=false; }
  if(!$('#editor').open || submittedId!==editId) return;
  const state=fields.get('status');
  const item={id:editId||uid(),name,link,photo,category:Number(fields.get('category')),status:state,
    quantity:Number(fields.get('quantity')),available:fields.get('available')===''?null:Number(fields.get('available')),
    optional:fields.has('optional'),unit:fields.get('unit').trim(),notes:fields.get('notes').trim(),
    review:fields.get('review')||(state==='checked'?today():''),expiry:fields.get('expiry')};
  const items=editId?current().items.map(entry=>entry.id===editId?item:entry):[...current().items,item];
  if(updateItems(items,'Material guardado')) $('#editor').close();
});
$('#delete').setAttribute('aria-controls','delete-material-confirmation');
$('#delete').addEventListener('click',()=>{
  const item=current().items.find(entry=>entry.id===editId);
  if(!item) return;
  $('#delete-material-message').textContent='¿Eliminar «'+item.name+'» de esta configuración?';
  $('#delete-material-confirmation').hidden=false;
  $('#delete').setAttribute('aria-expanded','true');
  $('#cancel-delete-material').focus();
});
$('#cancel-delete-material').addEventListener('click',()=>{
  $('#delete-material-confirmation').hidden=true;
  $('#delete').setAttribute('aria-expanded','false');
  $('#delete').focus();
});
$('#confirm-delete-material').addEventListener('click',()=>{
  const items=current().items;
  if(!items.some(item=>item.id===editId)) return;
  if(updateItems(items.filter(item=>item.id!==editId),'Material eliminado')) {
    $('#editor').close();
    $('#add').focus();
  } else {
    $('#delete-material-message').textContent='No se pudo guardar la eliminación. Vuelve a intentarlo.';
  }
});
$('#list').addEventListener('change',event=>{
  const select=event.target.closest('[data-item]');
  if(!select) return;
  const state=select.value;
  const items=current().items.map(item=>item.id===select.dataset.item?{...item,status:state,review:state==='checked'?today():item.review}:item);
  if(!updateItems(items)) render();
});
function clearFilters() {
  category='all';status='all';issue='';$('#search').value='';
}
function openConfig(mode) {
  configMode=mode;
  const form=$('#config-form');
  form.reset();
  form.elements.name.value=mode==='rename'?current().name:mode==='copy'?current().name+' (copia)':'';
  form.elements.source.value=mode==='copy'?'current':'base';
  $('#source-label').hidden=mode!=='new';
  $('#delete-config').hidden=mode!=='rename'||data.configs.length<2;
  $('#config-title').textContent={new:'Nueva configuración',copy:'Duplicar configuración',rename:'Renombrar configuración'}[mode];
  $('#config-error').textContent='';
  $('#config-editor').showModal();
}
$('#config-form').addEventListener('submit',event=>{
  event.preventDefault();
  const fields=new FormData(event.currentTarget);
  const name=fields.get('name').trim();
  const error=$('#config-error');
  if(!name) { error.textContent='Escribe un nombre para la actividad.'; return; }
  if(data.configs.some(config=>normalize(config.name)===normalize(name)&&(configMode!=='rename'||config.id!==data.active))) {
    error.textContent='Ya existe una configuración con ese nombre.'; return;
  }
  const next=structuredClone(data);
  if(configMode==='rename') next.configs.find(config=>config.id===next.active).name=name;
  else {
    const source=configMode==='copy'?'current':fields.get('source');
    const items=source==='base'?base():source==='empty'?[]:current().items.map(item=>({...item,id:uid(),status:'pending',review:'',available:null}));
    next.active=uid();
    const sourceConfig=current();
    next.configs.push({
      id:next.active,name,items,
      customCategories:source==='current'?[...(sourceConfig.customCategories ?? [])]:[],
      categoryOrder:source==='current'?categoryOptions(sourceConfig).map(([id])=>id):[]
    });
    clearFilters();
  }
  if(save(next,'Configuración guardada')) $('#config-editor').close();
});
$('#delete-config').addEventListener('click',()=>{
  if(data.configs.length<2||!confirm('¿Eliminar la configuración «'+current().name+'» y todo su material?')) return;
  const configs=data.configs.filter(config=>config.id!==data.active);
  clearFilters();
  if(save({configs,active:configs[0].id},'Configuración eliminada')) $('#config-editor').close();
});
document.addEventListener('click',event=>{
  const button=event.target.closest('button');
  if(!button) return;
  const {config,category:filter,status:state,issue:flag,edit}=button.dataset;
  if(config&&config!==data.active) { clearFilters(); if(!save({...data,active:config},'Configuración seleccionada')) render(); }
  if(filter!==undefined) { category=filter; render(); }
  if(state!==undefined) { status=state; render(); }
  if(flag) { issue=issue===flag?'':flag; render(); }
  if(edit) openItem(edit);
  if(button.hasAttribute('data-close')) button.closest('dialog').close();
  if(button.id==='remove-photo') { editPhoto=''; $('#item-form').elements.photo.value=''; previewPhoto(); }
});
function renderCategoryEditor() {
  const entries=categoryOptions();
  $('#category-order').innerHTML=entries.map(([id,label],index)=>`<li>
    <span>${safe(label)}</span>
    <button type="button" class="outline" data-move="-1" data-id="${id}" aria-label="Subir ${safe(label)}" ${index===0?'disabled':''}>↑</button>
    <button type="button" class="outline" data-move="1" data-id="${id}" aria-label="Bajar ${safe(label)}" ${index===entries.length-1?'disabled':''}>↓</button>
  </li>`).join('');
}
function updateCategories(fields) {
  const next=structuredClone(data);
  Object.assign(next.configs.find(config=>config.id===next.active),fields);
  if(!save(next,'Configuración guardada')) return false;
  renderCategoryEditor();
  return true;
}
$('#manage-categories').addEventListener('click',()=>{
  $('#category-form').reset();
  $('#category-error').textContent='';
  renderCategoryEditor();
  $('#category-editor').showModal();
});
$('#category-order').addEventListener('click',event=>{
  const button=event.target.closest('[data-move]');
  if(!button || button.disabled) return;
  const id=Number(button.dataset.id);
  const order=categoryOptions().map(([value])=>value);
  const index=order.indexOf(id);
  const target=index+Number(button.dataset.move);
  [order[index],order[target]]=[order[target],order[index]];
  if(updateCategories({categoryOrder:order})) {
    const row=$('#category-order').children[target];
    (row.querySelector(`[data-move="${button.dataset.move}"]:enabled`) ?? row.querySelector('button:enabled')).focus();
  }
});
$('#category-form').addEventListener('submit',event=>{
  event.preventDefault();
  const form=event.currentTarget;
  const name=form.elements.name.value.trim();
  const error=$('#category-error');
  error.textContent='';
  if(!name) { error.textContent='Escribe un nombre para la categoría.'; return; }
  if(categoryOptions().some(([,label])=>normalize(label)===normalize(name))) {
    error.textContent='Ya existe una categoría con ese nombre.'; return;
  }
  if(updateCategories({customCategories:[...(current().customCategories ?? []),name]})) form.reset();
});
$('#save-all').addEventListener('click',()=>save(data,'Configuración guardada'));
$('#search').addEventListener('input',render);
$('#category').addEventListener('change',event=>{category=event.target.value;render();});
$('#status').addEventListener('change',event=>{status=event.target.value;render();});
$('#quick').addEventListener('click',()=>{rapid=!rapid;render();});
$('#add').addEventListener('click',()=>openItem(null));
$('#new-config').addEventListener('click',()=>openConfig('new'));
$('#rename').addEventListener('click',()=>openConfig('rename'));
$('#copy').addEventListener('click',()=>openConfig('copy'));
function preparePrint() {
  const {name,items}=current();
  $('#paper').innerHTML=`<h1>${safe(name)}</h1><p>Checklist de material · ${formatDate(today())}</p>`+categoryOptions().map(([index,label])=>{
    const group=items.filter(item=>item.category===index);
    if(!group.length) return '';
    return `<h2>${safe(label)}</h2><table><thead><tr><th>✓</th><th>Material</th><th>Cantidad</th><th>Estado</th><th>Revisión</th><th>Caducidad</th></tr></thead><tbody>${group.map(item=>`<tr><td>□</td><td>${safe(item.name)}${item.optional?' (si procede)':''}${item.notes?`<small>${safe(item.notes)}</small>`:''}</td><td>${safe(quantity(item))}</td><td>${states[item.status]}</td><td>${item.review?formatDate(item.review):'—'}</td><td>${item.expiry?formatDate(item.expiry):'—'}</td></tr>`).join('')}</tbody></table>`;
  }).join('');
}
window.addEventListener('beforeprint',preparePrint);
let printDownloadUrl;
$('#print').addEventListener('click',()=>{
  preparePrint();
  if(printDownloadUrl) URL.revokeObjectURL(printDownloadUrl);
  const html=`<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>MOCHILA 24h</title><style>
  @page{size:A4;margin:12mm}body{font:11pt system-ui,sans-serif;color:#222;margin:16px}h2{font-size:12pt;background:#eee;padding:6px;break-after:avoid}table{width:100%;border-collapse:collapse}th,td{padding:4px;border-bottom:1px solid #bbb;text-align:left;vertical-align:top}tr{break-inside:avoid}small{display:block}@media print{body{margin:0}}
  </style><main>${$('#paper').innerHTML}</main></html>`;
  printDownloadUrl=URL.createObjectURL(new Blob([html],{type:'text/html;charset=utf-8'}));
  $('#download-print').href=printDownloadUrl;
  $('#print-preview').hidden=false;
  document.body.classList.add('show-print-preview');
  $('#close-print').focus();
});
$('#close-print').addEventListener('click',()=>{
  $('#print-preview').hidden=true;
  document.body.classList.remove('show-print-preview');
  $('#print').focus();
});
$('#print-now').addEventListener('click',()=>window.print());
render();
