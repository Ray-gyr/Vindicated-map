export function styleVindicatedBasemap(map) {
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