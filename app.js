const ALL_VIDEOS = [
  { id:"v1", title:"Piros lámpán áthajt a SUV", desc:"Kereszteződésben szabálytalan előzés és piroson áthajtás.",
    place:"Budapest, Rákóczi út", category:"keresztezodes", yt:"l03s5yyZ29g", date:"2025-10-20", views:12890 },
  { id:"v2", title:"Buszsáv kihasználása csúcsban", desc:"Teljes sávon végig előz buszsávban.",
    place:"Budapest, Váci út", category:"buszsav", yt:"0IwLZbZno6I", date:"2025-10-29", views:22450 },
  { id:"v3", title:"Zebra előtt nem ad elsőbbséget", desc:"Gyalogos majdnem elütve.",
    place:"Budapest, Oktogon", category:"gyalogatkelo", yt:"DD95uQ1QYHs", date:"2025-11-02", views:16700 },
  { id:"v4", title:"Szlalom a pályán 130 felett", desc:"Veszélyes sávváltások.",
    place:"M1 autópálya", category:"palyaszakasz", yt:"xljAxWNcMTY", date:"2025-11-05", views:45120 },
  { id:"v5", title:"Járdán parkolás félig a füvön", desc:"Klasszikus pofátlanság.",
    place:"Budapest, XI. ker.", category:"parkolas", yt:"V6YjRg9kGs4", date:"2025-10-11", views:9800 }
];

let state = { category:"osszes", sort:"uj", q:"", page:1, pageSize:4 };

const elList = document.getElementById("videoList");
const elTop = document.getElementById("topList");
const elCat = document.getElementById("filterCategory");
const elSort = document.getElementById("filterSort");
const elSearch = document.getElementById("searchText");
const elClear = document.getElementById("clearFilters");
const elLoadMore = document.getElementById("loadMore");

const dlg = document.getElementById("submitModal");
const openSubmit = document.getElementById("openSubmit");
const closeSubmit = document.getElementById("closeSubmit");
const inpTitle = document.getElementById("inpTitle");
const inpDesc = document.getElementById("inpDesc");
const inpPlace = document.getElementById("inpPlace");
const inpCat = document.getElementById("inpCat");
const inpYoutube = document.getElementById("inpYoutube");
const btnSubmit = document.getElementById("btnSubmit");



const ytEmbed = (id) => `https://www.youtube.com/embed/${id}`;

function computeVisible() {
  let items = [...ALL_VIDEOS];
  if (state.category !== "osszes") items = items.filter(v => v.category === state.category);
  if (state.q.trim()) {
    const q = state.q.trim().toLowerCase();
    items = items.filter(v =>
      v.title.toLowerCase().includes(q) ||
      v.desc.toLowerCase().includes(q) ||
      (v.place||"").toLowerCase().includes(q)
    );
  }
  if (state.sort === "uj") items.sort((a,b)=> new Date(b.date)-new Date(a.date));
  else items.sort((a,b)=> b.views-a.views);
  return items;
}

function renderList(reset=false) {
  const items = computeVisible();
  const slice = items.slice(0, state.page*state.pageSize);
  if (reset) elList.innerHTML = "";
  slice.forEach(v => {
    if (document.getElementById(`card-${v.id}`)) return;
    const card = document.createElement("article");
    card.id = `card-${v.id}`;
    card.className = "card bg-white border rounded-xl overflow-hidden";
    card.innerHTML = `
      <div class="embed">
        <iframe class="w-full h-full" src="${ytEmbed(v.yt)}" title="${escapeHtml(v.title)}" frameborder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
      </div>
      <div class="p-4 space-y-2">
        <h3 class="font-semibold">${escapeHtml(v.title)}</h3>
        <div class="text-sm text-zinc-600">${escapeHtml(v.desc)}</div>
        <div class="flex items-center gap-2 text-xs">
          <span class="badge">${labelFor(v.category)}</span>
          <span class="text-zinc-500">${formatDate(v.date)}</span>
          ${v.place ? `<span class="text-zinc-500">• ${escapeHtml(v.place)}</span>` : ""}
          <span class="ml-auto text-zinc-500">${v.views.toLocaleString("hu-HU")} megtekintés</span>
        </div>
      </div>`;
    elList.appendChild(card);
  });
  elLoadMore.disabled = slice.length >= items.length;
  elLoadMore.classList.toggle("opacity-50", elLoadMore.disabled);
}

function renderTop() {
  const items = [...ALL_VIDEOS].sort((a,b)=> b.views-a.views).slice(0,5);
  elTop.innerHTML = "";
  items.forEach(v=>{
    const li = document.createElement("li");
    li.innerHTML = `<a href="#card-${v.id}" class="hover:underline">${escapeHtml(v.title)}</a> – ${v.views.toLocaleString("hu-HU")}`;
    elTop.appendChild(li);
  });
}

elCat.addEventListener("change", ()=>{ state.category=elCat.value; state.page=1; renderList(true); });
elSort.addEventListener("change", ()=>{ state.sort=elSort.value; state.page=1; renderList(true); });
elSearch.addEventListener("input", ()=>{ state.q=elSearch.value; state.page=1; renderList(true); });
elClear.addEventListener("click", ()=>{
  state={category:"osszes", sort:"uj", q:"", page:1, pageSize:4};
  elCat.value="osszes"; elSort.value="uj"; elSearch.value="";
  renderList(true);
});
elLoadMore.addEventListener("click", ()=>{ state.page+=1; renderList(false); });

openSubmit.addEventListener("click", ()=> dlg.showModal());
closeSubmit.addEventListener("click", (e)=>{ e.preventDefault(); dlg.close(); });

btnSubmit.addEventListener("click", (e)=>{
  e.preventDefault();
  const title=(inpTitle.value||"").trim();
  const desc=(inpDesc.value||"").trim();
  const place=(inpPlace.value||"").trim();
  const category=inpCat.value;
  const ytUrl=(inpYoutube.value||"").trim();
  if(!title || !ytUrl){ alert("Cím és YouTube link kötelező."); return; }
  const ytId = extractYoutubeId(ytUrl);
  if(!ytId){ alert("Érvénytelen YouTube link."); return; }
  const newItem = {
    id:"v"+(ALL_VIDEOS.length+1), title, desc, place, category, yt:ytId,
    date:new Date().toISOString().slice(0,10), views:Math.floor(Math.random()*2000)+100
  };
  ALL_VIDEOS.unshift(newItem);
  dlg.close();
  state.sort="uj"; document.getElementById("filterSort").value="uj"; state.page=1;
  renderTop(); renderList(true);
  inpTitle.value=inpDesc.value=inpPlace.value=inpYoutube.value=""; inpCat.value="keresztezodes";
});

function labelFor(cat){
  const map={keresztezodes:"Kereszteződés", buszsav:"Buszsáv", palyaszakasz:"Pályaszakasz", gyalogatkelo:"Gyalogátkelő", parkolas:"Parkolás"};
  return map[cat]||"Egyéb";
}
function formatDate(d){ const dt=new Date(d); return dt.toLocaleDateString("hu-HU",{year:"numeric",month:"2-digit",day:"2-digit"}); }
function escapeHtml(s){ return s.replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m])); }
function extractYoutubeId(url){
  try{ const u=new URL(url); if(u.hostname.includes("youtu.be")) return u.pathname.replace("/","");
    if(u.hostname.includes("youtube.com")) return u.searchParams.get("v"); }catch{}
  if(/^[\w-]{8,}$/.test(url)) return url; return null;
}

renderTop(); renderList(true);

