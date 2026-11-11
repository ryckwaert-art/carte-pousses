/* Carte des pousses : fonctionnement hors ligne
   - l’application elle-même : réseau d’abord, copie locale si pas de réseau
   - bibliothèques et polices : copie locale d’abord
   - tuiles des fonds de carte : copie locale d’abord, enregistrées au fil de la navigation et lors de « Préparer la sortie »
   - données (météo, forêts, altitudes…) : toujours depuis le réseau */
const APP = "pousses-app-v11", LIBS = "pousses-libs-v1", TILES = "pousses-tiles-v1";
const SHELL = ["./", "./index.html", "./manifest.webmanifest", "./icon-180.png", "./icon-192.png", "./icon-512.png", "./lib/leaflet.js", "./lib/leaflet.css", "./lib/geotiff.js"];
const LIB_HOSTS = ["cdnjs.cloudflare.com", "cdn.jsdelivr.net", "fonts.googleapis.com", "fonts.gstatic.com"];
const MAX_TILES = 5000;

self.addEventListener("install", e => {
  e.waitUntil(caches.open(APP).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => ![APP, LIBS, TILES].includes(k)).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

function isTile(url){
  return (url.hostname === "data.geopf.fr" && url.pathname.startsWith("/wmts") && /REQUEST=GetTile/i.test(url.search))
      || /tile\.opentopomap\.org$/.test(url.hostname) || url.hostname === "tile.openstreetmap.org";
}
async function trimTiles(){
  const c = await caches.open(TILES), keys = await c.keys();
  if(keys.length > MAX_TILES){ for(const k of keys.slice(0, keys.length - MAX_TILES)) await c.delete(k); }
}
let putCount = 0;

self.addEventListener("fetch", e => {
  const req = e.request; if(req.method !== "GET") return;
  const url = new URL(req.url);

  if(url.origin === self.location.origin){
    e.respondWith(fetch(req).then(r => { if(r.ok){ const cp = r.clone(); caches.open(APP).then(c => c.put(req, cp)); } return r; })
      .catch(() => caches.match(req, {ignoreSearch:true}).then(r => r || caches.match("./index.html"))));
    return;
  }
  if(LIB_HOSTS.includes(url.hostname)){
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => { if(r.ok || r.type === "opaque"){ const cp = r.clone(); caches.open(LIBS).then(c => c.put(req, cp)); } return r; })));
    return;
  }
  if(isTile(url)){
    e.respondWith(caches.match(req, {ignoreVary:true}).then(hit => hit || fetch(req).then(r => {
      if(r.ok || r.type === "opaque"){ const cp = r.clone(); caches.open(TILES).then(c => c.put(req.url, cp)); if(++putCount % 200 === 0) trimTiles(); }
      return r;
    })));
  }
});
