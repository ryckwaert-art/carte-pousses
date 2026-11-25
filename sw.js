/* Carte des pousses : fonctionnement hors ligne
   - l’application elle-même : réseau d’abord, copie locale si pas de réseau
   - bibliothèques et polices : copie locale d’abord
   - tuiles des fonds de carte : copie locale d’abord, enregistrées au fil de la navigation et lors de « Préparer la sortie »
   - données (météo, forêts, altitudes…) : toujours depuis le réseau */
const APP = "pousses-app-v35", LIBS = "pousses-libs-v1", TILES = "pousses-tiles-v1", PHOTOS = "pousses-photos-v1";
const SHELL = ["./", "./index.html", "./manifest.webmanifest", "./icon2-180.png", "./icon2-192.png", "./icon2-512.png", "./lib/leaflet.js", "./lib/leaflet.css", "./lib/geotiff.js", "./departements.json",
  "./fonts/HKGrotesk-Regular.woff2", "./fonts/HKGrotesk-Italic.woff2", "./fonts/HKGrotesk-Medium.woff2", "./fonts/HKGrotesk-SemiBold.woff2", "./fonts/HKGrotesk-Bold.woff2"];
const LIB_HOSTS = ["cdnjs.cloudflare.com", "cdn.jsdelivr.net", "fonts.googleapis.com", "fonts.gstatic.com"];
const MAX_TILES = 5000, MAX_PHOTOS = 400;

/* Chaque fichier est mis en cache séparément, en contournant le cache du navigateur :
   un fichier manquant sur le site n’empêche plus la nouvelle version de s’installer. */
self.addEventListener("install", e => {
  e.waitUntil(caches.open(APP).then(c => Promise.all(SHELL.map(u =>
    fetch(new Request(u, {cache: "reload"})).then(r => r.ok ? c.put(u, r) : null).catch(() => null)
  ))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => ![APP, LIBS, TILES, PHOTOS].includes(k)).map(k => caches.delete(k)))).then(() => self.clients.claim()));
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
    // La page et ses fichiers sont toujours revalidés auprès du site : une mise à jour est prise en compte dès la réouverture
    e.respondWith(fetch(req.url, {cache: "no-cache", credentials: "same-origin"}).then(r => { if(r.ok){ const cp = r.clone(); caches.open(APP).then(c => c.put(req, cp)); } return r; })
      .catch(() => caches.match(req, {ignoreSearch:true}).then(r => r || caches.match("./index.html"))));
    return;
  }
  if(LIB_HOSTS.includes(url.hostname)){
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => { if(r.ok || r.type === "opaque"){ const cp = r.clone(); caches.open(LIBS).then(c => c.put(req, cp)); } return r; })));
    return;
  }
  // Photos des fiches espèces (Wikimedia Commons) : gardées pour être revues sans réseau
  if(url.hostname === "upload.wikimedia.org"){
    e.respondWith(caches.match(req, {ignoreVary:true}).then(hit => hit || fetch(req).then(r => {
      if(r.ok || r.type === "opaque"){ const cp = r.clone(); caches.open(PHOTOS).then(async c => { await c.put(req.url, cp); const k = await c.keys(); if(k.length > MAX_PHOTOS) for(const x of k.slice(0, k.length - MAX_PHOTOS)) await c.delete(x); }); }
      return r;
    })));
    return;
  }
  if(isTile(url)){
    e.respondWith(caches.match(req, {ignoreVary:true}).then(hit => hit || fetch(req).then(r => {
      if(r.ok || r.type === "opaque"){ const cp = r.clone(); caches.open(TILES).then(c => c.put(req.url, cp)); if(++putCount % 200 === 0) trimTiles(); }
      return r;
    })));
  }
});
