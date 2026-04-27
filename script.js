const basemaps = {
  street: "https://basemap.mapid.io/styles/street-2d-building/style.json?key=69b3a9a44fccf23b9573e636",
  satellite: "https://basemap.mapid.io/styles/satellite/style.json?key=69b3a9a44fccf23b9573e636"
};

// ================= MAP =================
const map = new maplibregl.Map({
  container: "map",
  style: basemaps.street,
  center: [110.42, -6.99],
  zoom: 12
});

let dataStore = {};
let userMarker;
let bufferGeojson = null;
let layersLoaded = false;
let activePopup = null;


// ================= SWITCH BASEMAP =================
function switchBasemap(type){

  document.querySelectorAll(".basemap-btn").forEach(btn=>{
    btn.classList.toggle(
      "active",
      btn.dataset.basemap === type
    );
  });

  map.setStyle(basemaps[type]);

  // tunggu style + tile selesai total
  map.once("idle", function(){

      if(layersLoaded){
        addDataLayers();
      }

      if(userMarker){
        userMarker.addTo(map);
      }

  });
}


// ================= SIDEBAR =================
document.getElementById("toggleSidebar").onclick = ()=>{
  document.getElementById("sidebar").classList.toggle("open");
};


// ================= COLOR =================
function getColor(kelas){
  switch(kelas){
    case "Sangat Rendah": return "#00ff00";
    case "Cukup Rendah": return "#7fff00";
    case "Sedang": return "#ffff00";
    case "Cukup Tinggi": return "#ff8c00";
    case "Tinggi": return "#ff0000";
    default: return "#ccc";
  }
}


// ================= DATA URL =================
const urls = {
 banjir:"https://geoserver.mapid.io/layers_new/get_layer?api_key=f55347c906cd4131bfb783010b859464&layer_id=69cdce71e4fe4912fbe3c3d7&project_id=69cdcdd9b4892398f35ba1dc",

 longsor:"https://geoserver.mapid.io/layers_new/get_layer?api_key=f55347c906cd4131bfb783010b859464&layer_id=69cdce86e4fe4912fbe3cc1e&project_id=69cdcdd9b4892398f35ba1dc"
};


// ================= ADD DATA LAYER =================
function addDataLayers(){

 if(!dataStore.banjir || !dataStore.longsor){
   return;
 }

 // bersihkan jika ada
 ["banjir","longsor","buffer"].forEach(id=>{
    if(map.getLayer(id)) map.removeLayer(id);
    if(map.getSource(id)) map.removeSource(id);
 });


// -------- BANJIR --------
map.addSource("banjir",{
 type:"geojson",
 data:dataStore.banjir
});

map.addLayer({
 id:"banjir",
 type:"fill",
 source:"banjir",
 paint:{
   "fill-color":[
      "match",["get","Kelas"],
      "Sangat Rendah","#00ff00",
      "Cukup Rendah","#7fff00",
      "Sedang","#ffff00",
      "Cukup Tinggi","#ff8c00",
      "Tinggi","#ff0000",
      "#ccc"
   ],
   "fill-opacity":0.6
 }
});


// -------- LONGSOR --------
map.addSource("longsor",{
 type:"geojson",
 data:dataStore.longsor
});

map.addLayer({
 id:"longsor",
 type:"fill",
 source:"longsor",
 paint:{
   "fill-color":[
      "match",["get","Kelas"],
      "Sangat Rendah","#d1fae5",
      "Cukup Rendah","#a7f3d0",
      "Sedang","#facc15",
      "Cukup Tinggi","#f97316",
      "Tinggi","#7c2d12",
      "#ccc"
   ],
   "fill-opacity":0.6
 }
});


// -------- RESTORE BUFFER --------
if(bufferGeojson){

 const bufferChecked = document.getElementById("toggleBuffer")?.checked !== false;

 map.addSource("buffer",{
   type:"geojson",
   data:bufferGeojson
 });

 map.addLayer({
   id:"buffer",
   type:"fill",
   source:"buffer",
   layout:{
     "visibility": bufferChecked ? "visible" : "none"
   },
   paint:{
      "fill-color":"#0000ff",
      "fill-opacity":0.2
   }
 });

}


// restore toggle
const banjirVisible=document.getElementById("toggleBanjir")?.checked;
const longsorVisible=document.getElementById("toggleLongsor")?.checked;

if(banjirVisible===false){
 map.setLayoutProperty("banjir","visibility","none");
}

if(longsorVisible===false){
 map.setLayoutProperty("longsor","visibility","none");
}

}


// ================= LOAD DATA =================
map.on("load", async ()=>{

 try{

 const responses=await Promise.all(
   Object.values(urls).map(url=>fetch(url))
 );

 const jsons=await Promise.all(
   responses.map(r=>r.json())
 );

 const data=jsons.map(j=>j.geojson || j.data || j);

 dataStore.banjir=data[0];
 dataStore.longsor=data[1];

 layersLoaded=true;

 addDataLayers();

 map.fitBounds(
   turf.bbox(data[0]),
   {padding:20}
 );

 setupToggle();

 }catch(err){

   console.error(err);
   alert("Data gagal load");

 }

});


// ================= BUFFER =================
function createBuffer(lng,lat){

 let radius=Number(
   document.getElementById("radiusSlider").value
 );

 let point=turf.point([lng,lat]);

 bufferGeojson=turf.buffer(
   point,
   radius,
   {units:"meters"}
 );

 if(map.getSource("buffer")){
   map.removeLayer("buffer");
   map.removeSource("buffer");
 }

 map.addSource("buffer",{
   type:"geojson",
   data:bufferGeojson
 });

 const bufferChecked = document.getElementById("toggleBuffer")?.checked !== false;

 map.addLayer({
   id:"buffer",
   type:"fill",
   source:"buffer",
   layout:{
     "visibility": bufferChecked ? "visible" : "none"
   },
   paint:{
      "fill-color":"#0000ff",
      "fill-opacity":0.2
   }
 });

 analyzeRisk();

}



// ================= ANALYSIS =================
function analyzeRisk(){

 let banjirScore=0;
 let longsorScore=0;


 dataStore.banjir.features.forEach(f=>{
   if(turf.booleanIntersects(bufferGeojson,f)){
      let k=f.properties?.Kelas;

      if(k==="Tinggi") banjirScore+=3;
      else if(k==="Cukup Tinggi") banjirScore+=2;
      else if(k==="Sedang") banjirScore+=1;
   }
 });


 dataStore.longsor.features.forEach(f=>{
   if(turf.booleanIntersects(bufferGeojson,f)){
      let k=f.properties?.Kelas;

      if(k==="Tinggi") longsorScore+=3;
      else if(k==="Cukup Tinggi") longsorScore+=2;
      else if(k==="Sedang") longsorScore+=1;
   }
 });


 let total=banjirScore+longsorScore;

 let status="Rendah";

 if(total>5) status="Tinggi";
 else if(total>2) status="Sedang";


 if(activePopup) activePopup.remove();

 activePopup = new maplibregl.Popup()
 .setLngLat(
    turf.center(bufferGeojson).geometry.coordinates
 )
 .setHTML(`
 <b>Hasil Analisis</b><br>
 Banjir:${banjirScore}<br>
 Longsor:${longsorScore}<br>
 <b>Status:${status}</b>
 `)
 .addTo(map);

}



// ================= CLICK =================
map.on("click",(e)=>{

 // Jika toggle buffer mati, abaikan klik
 const bufferToggle = document.getElementById("toggleBuffer");
 if(bufferToggle && !bufferToggle.checked) return;

 if(userMarker){
   userMarker.remove();
 }

 userMarker=new maplibregl.Marker()
 .setLngLat(e.lngLat)
 .addTo(map);

 createBuffer(
   e.lngLat.lng,
   e.lngLat.lat
 );

});


// ================= TOGGLE =================
function setupToggle(){

document.getElementById("toggleBanjir").onchange=e=>
 map.setLayoutProperty(
   "banjir",
   "visibility",
   e.target.checked ? "visible":"none"
 );

document.getElementById("toggleLongsor").onchange=e=>
 map.setLayoutProperty(
   "longsor",
   "visibility",
   e.target.checked ? "visible":"none"
 );

// Toggle Buffer
document.getElementById("toggleBuffer").onchange=e=>{
 if(e.target.checked){
   if(bufferGeojson && map.getSource("buffer")){
     map.setLayoutProperty("buffer","visibility","visible");
   }
   if(activePopup) activePopup.addTo(map);
   if(userMarker) userMarker.addTo(map);
 } else {
   if(map.getLayer("buffer")){
     map.setLayoutProperty("buffer","visibility","none");
   }
   // Hapus popup: remove() + null agar tidak bisa addTo lagi
   if(activePopup){
     activePopup.remove();
     activePopup = null;
   }
   if(userMarker){
     userMarker.remove();
   }
 }
};

}



// ================= SLIDER =================
document.getElementById("radiusSlider")
.addEventListener("input",function(){

document.getElementById(
 "radiusValue"
).innerText=this.value;

});


// ================= GPS =================
function getLocation(){

navigator.geolocation.getCurrentPosition(pos=>{

 map.flyTo({
   center:[
    pos.coords.longitude,
    pos.coords.latitude
   ],
   zoom:15
 });

});

}


// ================= GEOCODER =================
function geocodeAlamat(){

let alamat=document.getElementById("alamat").value;

fetch(
`https://nominatim.openstreetmap.org/search?format=json&q=${alamat}`
)
.then(r=>r.json())
.then(data=>{

 if(!data.length){
   return alert("Tidak ditemukan");
 }

 map.flyTo({
   center:[
      data[0].lon,
      data[0].lat
   ],
   zoom:15
 });

});

}