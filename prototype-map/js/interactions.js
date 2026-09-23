import { createDealershipPopupHTML } from "./popups.js";

export function initializeDealershipInteractions(map, popup) {

    // Open popup when dealership marker is clicked
    map.on("click", "dealership-points", (e) => {

        const dealership = e.features[0].properties;

        popup
            .setLngLat(e.lngLat)
            .setHTML(createDealershipPopupHTML(dealership))
            .addTo(map);
    });

    // Change cursor when hovering over dealership
    map.on("mouseenter", "dealership-points", () => {
        map.getCanvas().style.cursor = "pointer";
    });

    map.on("mouseleave", "dealership-points", () => {
        map.getCanvas().style.cursor = "";
    });
}