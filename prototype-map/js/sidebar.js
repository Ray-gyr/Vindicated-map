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