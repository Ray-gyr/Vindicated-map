export function initializeFilters(map) {

    const searchBox = document.getElementById("search");

    function applyFilters() {

        const searchText = searchBox.value.toLowerCase();

        const clear = document.querySelector('input[value="clear"]').checked;
const caution = document.querySelector('input[value="caution"]').checked;
const flagged = document.querySelector('input[value="flagged"]').checked;
        // Build list of tiers currently selected
        const selectedTiers = [];

        if (clear) {
            selectedTiers.push("clear");
        }

        if (caution) {
            selectedTiers.push("caution");
        }

        if (flagged) {
            selectedTiers.push("flagged");
        }

        // Filter map markers
        const mapFilter = [
            "all",
            [
                "in",
                ["get", "Tier"],
                ["literal", selectedTiers]
            ],
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

            const tier = item.dataset.tier;

            const matchesSearch =
                item.dataset.search.includes(searchText);

            const matchesTier =
                selectedTiers.includes(tier);

            item.style.display =
                matchesSearch && matchesTier ? "block" : "none";
        });
    }

    // Run filter when user types
    searchBox.addEventListener("input", applyFilters);

    // Run filter when checkbox changes
    document.querySelectorAll(".tier-filter").forEach(checkbox => {
        checkbox.addEventListener("change", applyFilters);
    });
}