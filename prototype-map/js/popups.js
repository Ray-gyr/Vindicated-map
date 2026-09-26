function escapeHTML(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

export function createDealershipPopupHTML(dealership) {

    // Convert tier into display text
    const tierLabels = {
        clear: "Clear",
        caution: "Caution",
        flagged: "Flagged"
    };

    const tierLabel =
        tierLabels[dealership.Tier] || dealership.Tier;

    // Create category tags
    const categories = dealership.Categories || [];

    const categoriesHTML = categories.length > 0
        ? categories
            .map(category => `
                <span class="popup-category">
                    ${escapeHTML(category)}
                </span>
            `)
            .join("")
        : `<span class="popup-no-flags">No flagged categories</span>`;

    // Only reviews containing classifier flags
    const flaggedReviews = (dealership.Reviews || [])
        .filter(review => review.Categories?.length > 0);

    const evidenceHTML = flaggedReviews.length > 0
        ? flaggedReviews
            .map(review => {

                const quotes = (review.Excerpts || [])
                    .flatMap(excerpt => excerpt.Quotes || []);

                const quotesHTML = quotes
                    .map(quote => `
                        <blockquote class="popup-quote">
                            “${escapeHTML(quote)}”
                        </blockquote>
                    `)
                    .join("");

                const published = review.Published
                    ? new Date(review.Published).toLocaleDateString()
                    : "";

                return `
                    <div class="popup-evidence">

                        <div class="popup-review-meta">
                            ★ ${review.Rating}
                            ${published ? ` · ${published}` : ""}
                        </div>

                        ${quotesHTML}

                    </div>
                `;
            })
            .join("")
        : `
            <p class="popup-no-evidence">
                No flagged review evidence in the analyzed sample.
            </p>
        `;

    return `
        <div class="dealership-popup">

            <h2>${escapeHTML(dealership.Name)}</h2>

            <p class="address">
                ${escapeHTML(dealership.Address)}
            </p>

            <div class="popup-tier ${dealership.Tier}">
                ${tierLabel}
            </div>

            <div class="popup-stats">
                <div>
                    Google rating:
                    <strong>${dealership["Google Rating"] ?? "N/A"}</strong>
                </div>

                <div>
                    Google reviews:
                    <strong>${dealership["Google Rating Count"] ?? "N/A"}</strong>
                </div>

                <div>
                    Reviews analyzed:
                    <strong>${dealership["Review Count"] ?? 0}</strong>
                </div>

                <div>
                    Flagged reviews:
                    <strong>${dealership["Flagged Review Count"] ?? 0}</strong>
                </div>
            </div>

            <hr>

            <strong class="popup-section-title">
                Identified concerns
            </strong>

            <div class="popup-categories">
                ${categoriesHTML}
            </div>

            ${
                flaggedReviews.length > 0
                    ? `
                        <strong class="popup-section-title">
                            Supporting review evidence
                        </strong>

                        <div class="popup-evidence-list">
                            ${evidenceHTML}
                        </div>
                    `
                    : evidenceHTML
            }

        </div>
    `;
}