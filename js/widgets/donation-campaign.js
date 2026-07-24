/**
 * Donation campaign block — Alpine component.
 * Fetches the donation plugin's public /donation/stats.json (60s server
 * cache) client-side, so campaign counters stay live without a rebuild.
 * Alpine.data() in alpine:init is the theme's established widget pattern
 * (see js/widgets/github-repos.js).
 */
// One fetch per page, shared across all block instances (multiple: true
// means N campaign blocks on a page — they must not fire N identical
// requests, each counting against the endpoint's rate limit).
let statsPromise;
function fetchStats() {
  statsPromise ??= fetch("/donation/stats.json")
    .then((res) => (res.ok ? res.json() : null))
    .catch(() => null);
  return statsPromise;
}

document.addEventListener("alpine:init", () => {
  Alpine.data("donationCampaign", (campaignId) => ({
    loading: true,
    currency: "EUR",
    campaigns: [],

    async init() {
      try {
        const data = await fetchStats();
        this.currency = data?.currency || "EUR";
        const all = data?.campaigns || [];
        // A specific campaignId shows that campaign even when inactive
        // (e.g. a completed campaign kept on a page); no id = active only.
        this.campaigns = campaignId
          ? all.filter((c) => c.id === campaignId)
          : all.filter((c) => c.active);
      } catch (err) {
        console.error("Donation widget error:", err);
      } finally {
        this.loading = false;
      }
    },

    amount(cents) {
      return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: this.currency,
        maximumFractionDigits: 0,
      }).format((cents || 0) / 100);
    },

    percent(campaign) {
      if (!campaign.goal_cents) return null;
      return Math.min(
        100,
        Math.round((campaign.raised_cents / campaign.goal_cents) * 100),
      );
    },
  }));
});
