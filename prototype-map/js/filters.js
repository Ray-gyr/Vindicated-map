export function initializeFilters(map) {

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
}