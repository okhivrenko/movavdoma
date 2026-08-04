(() => {
    "use strict";

    const measurementId = "G-7S3RWCWPV3";
    const consentKey = "movayakvdoma_analytics_consent";
    const banner = document.querySelector("[data-consent-banner]");
    const acceptButton = document.querySelector("[data-consent-accept]");
    const rejectButton = document.querySelector("[data-consent-reject]");
    const settingsButtons = document.querySelectorAll("[data-consent-settings]");
    let analyticsLoaded = false;
    let consentTrigger = null;

    function readConsent() {
        try {
            return window.localStorage.getItem(consentKey);
        } catch {
            return null;
        }
    }

    function saveConsent(value) {
        try {
            window.localStorage.setItem(consentKey, value);
        } catch {
            // The current choice still applies for this page when storage is unavailable.
        }
    }

    function gtag() {
        window.dataLayer.push(arguments);
    }

    function loadAnalytics() {
        if (analyticsLoaded) {
            window.gtag("consent", "update", { analytics_storage: "granted" });
            return;
        }
        analyticsLoaded = true;
        window.dataLayer = window.dataLayer || [];
        window.gtag = gtag;
        gtag("consent", "default", {
            ad_storage: "denied",
            ad_user_data: "denied",
            ad_personalization: "denied",
            analytics_storage: "denied",
        });
        gtag("consent", "update", { analytics_storage: "granted" });
        gtag("js", new Date());
        gtag("config", measurementId, {
            allow_google_signals: false,
            allow_ad_personalization_signals: false,
        });

        const script = document.createElement("script");
        script.async = true;
        script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
        document.head.append(script);
    }

    function hideBanner() {
        banner.hidden = true;
        consentTrigger?.focus();
        consentTrigger = null;
    }

    function showBanner(trigger = null) {
        consentTrigger = trigger;
        banner.hidden = false;
        acceptButton.focus();
    }

    function removeAnalyticsCookies() {
        document.cookie.split(";").forEach((cookie) => {
            const name = cookie.split("=")[0].trim();
            if (name === "_ga" || name.startsWith("_ga_")) {
                document.cookie = `${name}=; Max-Age=0; path=/; SameSite=Lax`;
            }
        });
    }

    acceptButton.addEventListener("click", () => {
        saveConsent("granted");
        hideBanner();
        loadAnalytics();
    });

    rejectButton.addEventListener("click", () => {
        saveConsent("denied");
        if (window.gtag) window.gtag("consent", "update", { analytics_storage: "denied" });
        removeAnalyticsCookies();
        hideBanner();
    });

    settingsButtons.forEach((button) => button.addEventListener("click", () => showBanner(button)));
    document.querySelectorAll("[data-analytics-event]").forEach((link) => {
        link.addEventListener("click", () => {
            if (readConsent() !== "granted" || !window.gtag) return;
            window.gtag("event", link.dataset.analyticsEvent, {
                link_location: link.dataset.analyticsLocation,
                transport_type: "beacon",
            });
        });
    });

    if (readConsent() === "granted") loadAnalytics();
    else if (readConsent() !== "denied") showBanner();
})();
