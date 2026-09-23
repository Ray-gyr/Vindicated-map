export function createDealershipPopupHTML(dealership) {
    return `
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
    `;
}