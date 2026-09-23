export function addCoverageMask(map) {

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
}