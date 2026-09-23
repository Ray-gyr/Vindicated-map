import * as maplibregl from "https://unpkg.com/maplibre-gl@6.11.0/dist/maplibre-gl.mjs";
import { styleVindicatedBasemap } from "./js/basemap.js";
import { addDealershipLayers } from "./js/dealerships.js";
import { populateSidebar } from "./js/sidebar.js";
import { initializeFilters } from "./js/filters.js";
import { addCoverageMask } from "./js/coverage.js";
import { initializeDealershipInteractions } from "./js/interactions.js";

const map = new maplibregl.Map({
    container: "map",
    style: "https://tiles.openfreemap.org/styles/fiord",

    center: [-118.4, 34.1],
    zoom: 9,

    minZoom: 8,

    maxBounds: [
        [-120.0, 32.8], // southwest
        [-116.5, 35.2]  // northeast
    ]
});
const popup = new maplibregl.Popup({
    closeOnClick: false
});

map.addControl(new maplibregl.NavigationControl());

map.on("load", () => {

// Outside-coverage mask
addCoverageMask(map);

// Apply VINdicated colors to Fiord
    styleVindicatedBasemap(map);

addDealershipLayers(map);

    // Populate sidebar
    populateSidebar(map, popup);

// Activate search and score filters
initializeFilters(map);

initializeDealershipInteractions(map, popup);

// Make sure MapLibre uses the available screen space
window.addEventListener("load", () => {
    map.resize();
});

});