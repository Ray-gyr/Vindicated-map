export function addDealershipLayers(map) {

    // Dealership data source
    map.addSource("dealerships", {
        type: "geojson",
        data: "data/dealerships.geojson"
    });

    // Glow underneath dealership points
    map.addLayer({
        id: "dealership-glow",
        type: "circle",
        source: "dealerships",

        paint: {
            "circle-radius": 24,

            "circle-color": [
    "match",
    ["get", "Tier"],

    "clear", "#34a853",
    "caution", "#fbbc04",
    "flagged", "#ea4335",

    "#999999"
],

            "circle-opacity": 0.5,
            "circle-blur": 0.8
        }
    });

    // Draw dealership points
    map.addLayer({
        id: "dealership-points",
        type: "circle",
        source: "dealerships",

        paint: {
            "circle-radius": 9,

            "circle-color": [
    "match",
    ["get", "Tier"],

    "clear", "#34a853",
    "caution", "#fbbc04",
    "flagged", "#ea4335",

    "#999999"
],

            "circle-stroke-color": "#ffffff",
            "circle-stroke-width": 2.5
        }
    });
}