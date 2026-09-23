import * as maplibregl from "https://unpkg.com/maplibre-gl@6.11.0/dist/maplibre-gl.mjs";

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

function styleVindicatedBasemap() {
    // -----------------------------
    // BASEMAP FONTS
    // -----------------------------
    document.fonts.load("16px Figtree");

    const style = map.getStyle();

    map.setGlyphs(null);

    style.layers.forEach((layer) => {
    if (layer.type === "symbol" && layer.layout?.["text-field"]) {
        map.setLayoutProperty(
            layer.id,
            "text-font",
            ["Figtree"]
        );
    }
});
// Hide maritime administrative boundaries.
// They add visual clutter offshore but provide little value
// for the dealership-focused map.
map.setFilter("boundary_state", [
    "all",
    ["==", "admin_level", 4],
    ["!=", "maritime", 1]
]);

map.setFilter("boundary_country_z0-4", [
    "all",
    ["==", "admin_level", 2],
    ["!has", "claimed_by"],
    ["!=", "maritime", 1]
]);

map.setFilter("boundary_country_z5-", [
    "all",
    ["==", "admin_level", 2],
    ["!=", "maritime", 1]
]);
    // -----------------------------
    // LAND + WATER
    // -----------------------------

    map.setPaintProperty(
        "background",
        "background-color",
        "#3b174f"
    );

    map.setPaintProperty(
        "water",
        "fill-color",
        "#24162f"
    );

    map.setPaintProperty(
        "landuse_residential",
        "fill-color",
        "#442055"
    );

    map.setPaintProperty(
        "landcover_wood",
        "fill-color",
        "#32183f"
    );

    map.setPaintProperty(
        "park",
        "fill-color",
        "#351943"
    );

    map.setPaintProperty(
        "building",
        "fill-color",
        "#4c2a59"
    );


    // -----------------------------
    // ROADS
    // -----------------------------

    map.setPaintProperty(
    "highway_path",
    "line-color",
    "#604b69"
);

map.setPaintProperty(
    "highway_minor",
    "line-color",
    "#695471"
);

map.setPaintProperty(
    "highway_major_casing",
    "line-color",
    "#402749"
);

map.setPaintProperty(
    "highway_major_inner",
    "line-color",
    "#806b88"
);

map.setPaintProperty(
    "highway_motorway_casing",
    "line-color",
    "#43294d"
);

map.setPaintProperty(
    "highway_motorway_inner",
    "line-color",
    "#927b9a"
);


    // -----------------------------
    // WATERWAYS
    // -----------------------------

    map.setPaintProperty(
        "waterway",
        "line-color",
        "#6d557a"
    );

    // -----------------------------
    // BOUNDARIES
    // -----------------------------

    map.setPaintProperty(
        "boundary_state",
        "line-color",
        "#8a7394"
    );

map.setPaintProperty(
    "aeroway-area",
    "fill-color",
    "#43294d"
);

map.setPaintProperty(
    "aeroway-taxiway",
    "line-color",
    "#6c5674"
);

map.setPaintProperty(
    "aeroway-runway-casing",
    "line-color",
    "#3e2747"
);

map.setPaintProperty(
    "aeroway-runway",
    "line-color",
    "#745f7c"
);
// -----------------------------
// HIDE DISTRACTING FEATURES
// -----------------------------

const hiddenLayers = [
    "park_outline",

    "aeroway-taxiway",
    "aeroway-runway-casing",
    "aeroway-runway",
    
    "railway_transit",
    "railway_transit_dashline",
    "railway_service",
    "railway_service_dashline",
    "railway",
    "railway_dashline"
];

hiddenLayers.forEach(layer => {
    map.setLayoutProperty(
        layer,
        "visibility",
        "none"
    );
});
    // -----------------------------
    // PLACE LABELS
    // -----------------------------

    const placeLabels = [
        "place_other",
        "place_suburb",
        "place_village",
        "place_town",
        "place_city",
        "place_city_large",
        "place_state",
        "place_country_other",
        "place_country_minor",
        "place_country_major",
        "place_continent"
    ];

    placeLabels.forEach(layer => {

        map.setPaintProperty(
            layer,
            "text-color",
            "#eee7f2"
        );

        map.setPaintProperty(
            layer,
            "text-halo-color",
            "#3b174f"
        );

    });


    // -----------------------------
    // ROAD LABELS
    // -----------------------------

    map.setPaintProperty(
        "highway_name_other",
        "text-color",
        "#c4b5ca"
    );

    map.setPaintProperty(
        "highway_name_other",
        "text-halo-color",
        "#3b174f"
    );


    // -----------------------------
    // WATER LABELS
    // -----------------------------

    map.setPaintProperty(
        "water_name",
        "text-color",
        "#a995b5"
    );
// Subtle roads visible at smaller scales
map.setPaintProperty(
    "highway_major_subtle",
    "line-color",
    "#6f5879"
);

map.setPaintProperty(
    "highway_motorway_subtle",
    "line-color",
    "#786180"
);
}
map.on("load", () => {
// Outside-coverage mask
map.addSource("coverage-mask", {
    type: "geojson",
    data: "data/coverage-mask.geojson"
});

map.addLayer({
    id: "coverage-mask",
    type: "fill",
    source: "coverage-mask",
    paint: {
        "fill-color": "#100d12",
        "fill-opacity": 0.62
    }
});

    // Apply VINdicated colors to Fiord
    styleVindicatedBasemap();


    // Add dealership GeoJSON
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
            "step",
            ["get", "Score"],

            "#34a853",
            30, "#fbbc04",
            60, "#ea4335"
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
                "step",
                ["get", "Score"],

                "#34a853",
                30, "#fbbc04",
                60, "#ea4335"
            ],

            "circle-stroke-color": "#ffffff",
            "circle-stroke-width": 2.5
        }
    });


    // Populate sidebar
    fetch("data/dealerships.geojson")
        .then(response => response.json())
        .then(data => {

            const list = document.getElementById("dealership-list");

            data.features.forEach(feature => {

                const dealership = feature.properties;
                const coordinates = feature.geometry.coordinates;

                const item = document.createElement("div");

item.className = "dealership-item";
item.dataset.score = dealership.Score;

item.dataset.search =
    `${dealership.Name} ${dealership.Address}`.toLowerCase();

let riskClass;

if (dealership.Score >= 60) {
    riskClass = "high";
} else if (dealership.Score >= 30) {
    riskClass = "medium";
} else {
    riskClass = "low";
}

item.innerHTML = `
    <strong>${dealership.Name}</strong>
    <span class="score-pill ${riskClass}">
        Score: ${dealership.Score}
    </span>
`;

                item.addEventListener("click", () => {

    // Zoom to dealership
    map.flyTo({
        center: coordinates,
        zoom: 13
    });

    // Open dealership popup

popup
    .setLngLat(coordinates)
    .setHTML(`
            <div class="dealership-popup">

                <h2>${dealership.Name}</h2>

                <p class="address">
                    ${dealership.Address}
                </p>

                <div class="score">
                    VINdicated Score:
                    <strong>${dealership.Score}</strong>
                </div>

                <hr>

                <strong>Example Review</strong>

                <p>
                    ${dealership["Example Text"]}
                </p>

            </div>
        `)
        .addTo(map);

});

                list.appendChild(item);

            });

        });

});


// Dealership popup
map.on("click", "dealership-points", (e) => {

    const dealership = e.features[0].properties;

    popup
        .setLngLat(e.lngLat)
    .setHTML(`
            <div class="dealership-popup">

                <h2>${dealership.Name}</h2>

                <p class="address">
                    ${dealership.Address}
                </p>

                <div class="score">
                    VINdicated Score:
                    <strong>${dealership.Score}</strong>
                </div>

                <hr>

                <strong>Example Review</strong>

                <p>
                    ${dealership["Example Text"]}
                </p>

            </div>
        `)
        .addTo(map);

});


// Change cursor when hovering over dealership
map.on("mouseenter", "dealership-points", () => {
    map.getCanvas().style.cursor = "pointer";
});

map.on("mouseleave", "dealership-points", () => {
    map.getCanvas().style.cursor = "";
});


// Make sure MapLibre uses the available screen space
window.addEventListener("load", () => {
    map.resize();
});
// ========================================
// SEARCH + SCORE FILTERING
// ========================================

const searchBox = document.getElementById("search");

function applyFilters() {

    const searchText = searchBox.value.toLowerCase();

    const low = document.querySelector('input[value="low"]').checked;
    const medium = document.querySelector('input[value="medium"]').checked;
    const high = document.querySelector('input[value="high"]').checked;


    // Filter map markers
    const scoreConditions = ["any"];

    if (low) {
        scoreConditions.push(["<", ["get", "Score"], 30]);
    }

    if (medium) {
        scoreConditions.push([
            "all",
            [">=", ["get", "Score"], 30],
            ["<", ["get", "Score"], 60]
        ]);
    }

    if (high) {
        scoreConditions.push([">=", ["get", "Score"], 60]);
    }

    const mapFilter = [
        "all",
        scoreConditions,
        [
            "any",
            [
                "in",
                searchText,
                ["downcase", ["get", "Name"]]
            ],
            [
                "in",
                searchText,
                ["downcase", ["get", "Address"]]
            ]
        ]
    ];

    map.setFilter("dealership-points", mapFilter);
    map.setFilter("dealership-glow", mapFilter);

    // Filter sidebar
    document.querySelectorAll(".dealership-item").forEach(item => {

        const score = Number(item.dataset.score);

        const matchesSearch =
            item.dataset.search.includes(searchText);

        const matchesScore =
            (low && score < 30) ||
            (medium && score >= 30 && score < 60) ||
            (high && score >= 60);

        item.style.display =
            matchesSearch && matchesScore ? "block" : "none";

    });

}


// Run filter when user types
searchBox.addEventListener("input", applyFilters);


// Run filter when checkbox changes
document.querySelectorAll(".score-filter").forEach(checkbox => {

    checkbox.addEventListener("change", applyFilters);

});