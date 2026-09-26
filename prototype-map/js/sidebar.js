import { createDealershipPopupHTML } from "./popups.js";

export function populateSidebar(map, popup) {

    fetch("data/dealerships.geojson")
        .then(response => response.json())
        .then(data => {

            const list = document.getElementById("dealership-list");

            data.features.forEach(feature => {

                const dealership = feature.properties;
                const coordinates = feature.geometry.coordinates;

                const item = document.createElement("div");

                item.className = "dealership-item";

                // Store tier for filtering
                item.dataset.tier = dealership.Tier;

                // Store searchable dealership text
                item.dataset.search =
                    `${dealership.Name} ${dealership.Address}`.toLowerCase();

                // Reuse existing CSS classes
                let tierClass;

                if (dealership.Tier === "flagged") {
                    tierClass = "high";
                } else if (dealership.Tier === "caution") {
                    tierClass = "medium";
                } else {
                    tierClass = "low";
                }

                item.innerHTML = `
                    <strong>${dealership.Name}</strong>
                    <span class="score-pill ${tierClass}">
                        ${dealership.Tier}
                    </span>
                `;

                item.addEventListener("click", () => {

                    map.flyTo({
                        center: coordinates,
                        zoom: 13
                    });

                    popup
                        .setLngLat(coordinates)
                        .setHTML(createDealershipPopupHTML(dealership))
                        .addTo(map);
                });

                list.appendChild(item);
            });
        });
}