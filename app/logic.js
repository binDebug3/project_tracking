(function (root) {
    function inferPeriod(hour, nearbyDate) {
        const value = Number(hour);
        if (!Number.isInteger(value) || value < 1 || value > 12) return "AM";
        const preferred = value >= 8 && value <= 11 ? "AM" : "PM";
        if (!nearbyDate || Number.isNaN(new Date(nearbyDate).valueOf())) return preferred;

        const nearby = new Date(nearbyDate);
        const candidates = ["AM", "PM"].map((period) => {
            const h24 = value % 12 + (period === "PM" ? 12 : 0);
            const candidate = new Date(nearby);
            candidate.setHours(h24, 0, 0, 0);
            return { period, distance: Math.abs(candidate - nearby) };
        });
        candidates.sort((a, b) => a.distance - b.distance);
        return candidates[0].distance <= 6 * 60 * 60 * 1000 ? candidates[0].period : preferred;
    }

    function to24Hour(hour, period) {
        const value = Number(hour);
        if (!Number.isInteger(value) || value < 1 || value > 12) return null;
        return value % 12 + (period === "PM" ? 12 : 0);
    }

    function roundedQuarter(date) {
        const result = new Date(date);
        result.setMinutes(Math.round(result.getMinutes() / 15) * 15, 0, 0);
        return result;
    }

    const api = { inferPeriod, to24Hour, roundedQuarter };
    root.HoursPilotLogic = api;
    if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window === "undefined" ? globalThis : window);
