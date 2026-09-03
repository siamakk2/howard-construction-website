/**
 * Lead admin dashboard.
 *
 * Serves the UI shell only — it contains no data and no secret. The access key
 * is entered once, held in sessionStorage, and sent as an x-access-key header
 * rather than in the URL, so the token never appears in browser history, the
 * address bar, or a shared screenshot.
 */

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');

  return res.status(200).send(`<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex,nofollow">
<title>Leads — Howard Construction</title>
<link rel="icon" href="/favicon.ico">
<style>
:root{--navy:#0A1628;--blue:#1565C0;--gold:#F9A825;--line:#E2E8F0;--muted:#5A6673;--bg:#F0F5FA;}
*{box-sizing:border-box;margin:0;padding:0;-webkit-text-size-adjust:100%;}
body{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;background:var(--bg);color:var(--navy);
     padding-bottom:env(safe-area-inset-bottom);}
header{background:var(--navy);color:#fff;padding:16px 18px;position:sticky;top:0;z-index:10;
       display:flex;align-items:center;gap:12px;flex-wrap:wrap;}
header h1{font-size:17px;font-weight:700;letter-spacing:.02em;}
.pill{background:rgba(255,255,255,.14);padding:4px 11px;border-radius:20px;font-size:12.5px;font-weight:600;}
.pill.new{background:var(--gold);color:var(--navy);}
.spacer{flex:1;}
button{font:inherit;cursor:pointer;border:none;border-radius:8px;padding:9px 14px;font-weight:600;font-size:14px;}
.btn-ghost{background:rgba(255,255,255,.16);color:#fff;}
.btn-ghost:hover{background:rgba(255,255,255,.26);}
.wrap{max-width:1200px;margin:0 auto;padding:16px;}
.tools{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px;align-items:center;}
input[type=search],input[type=password]{font:inherit;padding:11px 14px;border:1px solid var(--line);
       border-radius:9px;background:#fff;min-width:220px;flex:1;}
.card{background:#fff;border:1px solid var(--line);border-radius:12px;padding:18px;margin-bottom:12px;
      box-shadow:0 1px 3px rgba(10,22,40,.06);}
.card.fresh{border-left:4px solid var(--gold);}
.card.done{opacity:.62;}
.top{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap;}
.who{font-size:17px;font-weight:700;}
.when{font-size:12.5px;color:var(--muted);white-space:nowrap;}
.tag{display:inline-block;background:#E8F1FB;color:var(--blue);font-size:11.5px;font-weight:700;
     padding:3px 9px;border-radius:5px;margin:8px 8px 0 0;}
.tag.gold{background:#FFF4D6;color:#8A6200;}
.rows{margin-top:12px;display:grid;gap:7px;}
.row{display:flex;gap:10px;font-size:14.5px;align-items:baseline;}
.row b{color:var(--muted);font-weight:600;min-width:74px;font-size:12.5px;text-transform:uppercase;
       letter-spacing:.04em;}
.details{margin-top:11px;padding:11px 13px;background:#F7FAFC;border-radius:8px;font-size:14.5px;
         line-height:1.55;white-space:pre-wrap;}
.acts{display:flex;gap:8px;margin-top:13px;flex-wrap:wrap;}
.acts a,.acts button{text-decoration:none;font-size:13.5px;padding:9px 13px;border-radius:8px;font-weight:600;}
.call{background:var(--gold);color:var(--navy);}
.mail{background:#E8F1FB;color:var(--blue);}
.mark{background:#fff;border:1px solid var(--line)!important;color:var(--muted);}
.mark.on{background:#E6F6EC;color:#1E7B4D;border-color:#BFE6CE!important;}
.empty{text-align:center;padding:50px 20px;color:var(--muted);}
.login{max-width:400px;margin:60px auto;background:#fff;padding:30px;border-radius:14px;
       border:1px solid var(--line);}
.login h2{font-size:19px;margin-bottom:6px;}
.login p{color:var(--muted);font-size:14px;margin-bottom:18px;line-height:1.5;}
.login input{width:100%;margin-bottom:12px;}
.login button{width:100%;background:var(--blue);color:#fff;padding:12px;}
.err{color:#C0392B;font-size:13.5px;margin-top:10px;}
@media(max-width:600px){.row{flex-direction:column;gap:2px;}.row b{min-width:0;}}
</style></head>
<body>
<div id="app"></div>

<script>
var KEY_STORE='hci_leads_key';
var app=document.getElementById('app');

function esc(v){return String(v==null?'':v).replace(/[&<>"]/g,function(c){
  return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}

function ago(iso){
  var t=Date.parse(iso||''); if(!t) return '';
  var m=Math.floor((Date.now()-t)/60000);
  if(m<1) return 'just now';
  if(m<60) return m+' min ago';
  var h=Math.floor(m/60); if(h<24) return h+(h===1?' hour ago':' hours ago');
  var d=Math.floor(h/24); return d+(d===1?' day ago':' days ago');
}

function loginView(msg){
  app.innerHTML='<div class="login"><h2>Leads</h2>'+
    '<p>Enter your access key. It is stored on this device only and sent as a header, never in the address bar.</p>'+
    '<input type="password" id="k" placeholder="Access key" autocomplete="off">'+
    '<button id="go">View leads</button>'+(msg?'<div class="err">'+esc(msg)+'</div>':'')+'</div>';
  var go=function(){
    var v=document.getElementById('k').value.trim();
    if(!v) return;
    sessionStorage.setItem(KEY_STORE,v); load();
  };
  document.getElementById('go').onclick=go;
  document.getElementById('k').addEventListener('keydown',function(e){if(e.key==='Enter')go();});
}

var ALL=[];
function render(){
  var q=(document.getElementById('q')||{}).value||'';
  q=q.toLowerCase();
  var list=ALL.filter(function(l){
    if(!q) return true;
    return [l.firstName,l.lastName,l.phone,l.email,l.projectType,l.projectAddress,l.details]
      .join(' ').toLowerCase().indexOf(q)>-1;
  });
  var DAY=864e5;
  var fresh=ALL.filter(function(l){return Date.now()-Date.parse(l.submittedAt||0)<DAY;}).length;
  var open=ALL.filter(function(l){return !l.contacted;}).length;

  var head='<header><h1>Leads</h1>'+
    '<span class="pill">'+ALL.length+' total</span>'+
    (fresh?'<span class="pill new">'+fresh+' new today</span>':'')+
    '<span class="pill">'+open+' to contact</span>'+
    '<span class="spacer"></span>'+
    '<button class="btn-ghost" id="refresh">Refresh</button>'+
    '<button class="btn-ghost" id="csv">Export</button>'+
    '<button class="btn-ghost" id="out">Lock</button></header>';

  var body=list.map(function(l){
    var isNew=Date.now()-Date.parse(l.submittedAt||0)<DAY;
    var tel=String(l.phone||'').replace(/[^0-9+]/g,'');
    return '<div class="card'+(isNew?' fresh':'')+(l.contacted?' done':'')+'">'+
      '<div class="top"><div><div class="who">'+esc(l.firstName)+' '+esc(l.lastName)+'</div>'+
      '<span class="tag">'+esc(l.projectType||'—')+'</span>'+
      (l.budget?'<span class="tag gold">'+esc(l.budget)+'</span>':'')+'</div>'+
      '<div class="when">'+esc(ago(l.submittedAt))+'<br>'+
      esc(String(l.submittedAt||'').replace('T',' ').slice(0,16))+'</div></div>'+
      '<div class="rows">'+
      '<div class="row"><b>Phone</b><span>'+esc(l.phone||'—')+'</span></div>'+
      '<div class="row"><b>Email</b><span>'+esc(l.email||'—')+'</span></div>'+
      '<div class="row"><b>Address</b><span>'+esc(l.projectAddress||'—')+'</span></div>'+
      (l.startDate?'<div class="row"><b>Start</b><span>'+esc(l.startDate)+'</span></div>':'')+
      '</div>'+
      (l.details?'<div class="details">'+esc(l.details)+'</div>':'')+
      '<div class="acts">'+
      (tel?'<a class="call" href="tel:'+esc(tel)+'">Call</a>':'')+
      (l.email?'<a class="mail" href="mailto:'+esc(l.email)+'?subject='+
        encodeURIComponent('Your project enquiry — Howard Construction')+'">Email</a>':'')+
      '<button class="mark'+(l.contacted?' on':'')+'" data-id="'+esc(l.id)+'">'+
      (l.contacted?'\u2713 Contacted':'Mark contacted')+'</button>'+
      '</div></div>';
  }).join('');

  app.innerHTML=head+'<div class="wrap"><div class="tools">'+
    '<input type="search" id="q" placeholder="Search name, phone, email, project…" value="'+esc(q)+'">'+
    '</div>'+(body||'<div class="empty">No leads match.</div>')+'</div>';

  document.getElementById('q').oninput=render;
  document.getElementById('refresh').onclick=load;
  document.getElementById('out').onclick=function(){sessionStorage.removeItem(KEY_STORE);loginView();};
  document.getElementById('csv').onclick=exportCsv;
  Array.prototype.forEach.call(document.querySelectorAll('.mark'),function(b){
    b.onclick=function(){toggle(b.getAttribute('data-id'));};
  });
}

function toggle(id){
  var lead=ALL.filter(function(l){return l.id===id;})[0];
  if(!lead) return;
  lead.contacted=!lead.contacted;
  render();
  fetch('/api/leads',{method:'POST',
    headers:{'Content-Type':'application/json','x-access-key':sessionStorage.getItem(KEY_STORE)||''},
    body:JSON.stringify({action:'contacted',id:id,value:lead.contacted})
  }).catch(function(){});
}

function exportCsv(){
  var cols=['submittedAt','firstName','lastName','phone','email','projectType',
            'projectAddress','budget','startDate','details','contacted'];
  var out=[cols.join(',')].concat(ALL.map(function(l){
    return cols.map(function(c){return '"'+String(l[c]==null?'':l[c]).replace(/"/g,'""')+'"';}).join(',');
  })).join('\\n');
  var a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([out],{type:'text/csv'}));
  a.download='howard-leads-'+new Date().toISOString().slice(0,10)+'.csv';
  a.click();
}

function load(){
  var k=sessionStorage.getItem(KEY_STORE);
  if(!k) return loginView();
  app.innerHTML='<div class="empty">Loading…</div>';
  fetch('/api/leads?format=json',{headers:{'x-access-key':k}})
    .then(function(r){
      if(r.status===401){sessionStorage.removeItem(KEY_STORE);loginView('That key was not accepted.');return null;}
      if(!r.ok) throw new Error('HTTP '+r.status);
      return r.json();
    })
    .then(function(d){ if(!d) return; ALL=d.leads||[]; render(); })
    .catch(function(e){ app.innerHTML='<div class="empty">Could not load leads.<br>'+esc(e.message)+'</div>'; });
}

load();
</script>
</body></html>`);
};
