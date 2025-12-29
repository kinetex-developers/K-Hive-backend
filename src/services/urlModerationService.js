import axios from "axios";

const GOOGLE_API_KEY = process.env.SAFEBROWSING_GOOGLE_API_KEY;
const IPQS_API_KEY = process.env.IPQS_API_KEY;

const ADULT_TLDS = [
  ".xxx", ".porn", ".sex", ".adult", ".cam", 
  ".escort", ".sexy", ".webcam"
];

function extractUrls(text) {
  const urlRegex = /(?:https?:\/\/|www\.)?(?:[-a-zA-Z0-9@:%._\+~#=]{2,256}\.)+[a-zA-Z]{2,6}\b(?:[-a-zA-Z0-9()@:%_\+.~#?&\/=]*)/gi;
  const matches = text.match(urlRegex) || [];

  const commonTLDs = [
    'com', 'org', 'net', 'edu', 'gov', 'mil', 'int',
    'co', 'io', 'ai', 'app', 'dev', 'tech', 'info',
    'biz', 'name', 'pro', 'mobi', 'tel', 'travel',
    'asia', 'jobs', 'cat', 'xxx', 'porn', 'sex', 'adult',
    'in', 'uk', 'us', 'ca', 'au', 'de', 'fr', 'jp', 'cn'
  ];
  
  return matches
    .filter(match => {
      const parts = match.split('.');
      const tld = parts[parts.length - 1].toLowerCase().replace(/[^a-z]/g, '');
      return tld.length >= 2 && commonTLDs.includes(tld);
    });
}

function getDomain(url) {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

function hasAdultTLD(url) {
  const domain = getDomain(url);
  if (!domain) return false;
  
  return ADULT_TLDS.some(tld => domain.endsWith(tld));
}

async function checkUrlWithSafeBrowsing(url) {
  if (!GOOGLE_API_KEY) {
    console.warn("Google API key not set, skipping Web Risk check");
    return { status: "unknown" };
  }

  try {
    const response = await axios.post(
      `https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${GOOGLE_API_KEY}`,
      {
        client: {
          clientId: "url-moderation-service",
          clientVersion: "1.0.0"
        },
        threatInfo: {
          threatTypes: ["MALWARE", "SOCIAL_ENGINEERING", "UNWANTED_SOFTWARE", "POTENTIALLY_HARMFUL_APPLICATION"],
          platformTypes: ["ANY_PLATFORM"],
          threatEntryTypes: ["URL"],
          threatEntries: [
            { url: url }
          ]
        }
      }
    );

    if (response.data.matches && response.data.matches.length > 0) {
      return {
        status: "malicious",
        threatType: response.data.matches.map(m => m.threatType)
      };
    }

    return { status: "safe" };
  } catch (err) {
    if (err.response?.status === 403) {
      console.error("Google Safe Browsing API not enabled or invalid API key");
    } else if (err.response?.status === 400) {
      console.error("Invalid request format:", err.response?.data);
    }
    console.error("Google Safe Browsing error:", err.message);
    return { status: "error", error: err.message };
  }
}

async function checkAdultContent(url) {
  if (!IPQS_API_KEY) {
    console.warn("IPQS API key not set, skipping adult content check");
    return { error: true };
  }

  try {
    const response = await axios.get(
      `https://www.ipqualityscore.com/api/json/url/${IPQS_API_KEY}/${encodeURIComponent(url)}`,
      {
        params: {
          strictness: 1,
          fast: true
        }
      }
    );

    const data = response.data;

    return {
      adult: data.adult === true,
      porn: data.porn === true,
      riskScore: data.risk_score,
      category: data.category
    };
  } catch (err) {
    console.error("IPQS error:", err.message);
    return { error: true };
  }
}

async function moderateUrl(url) {
  if (hasAdultTLD(url)) {
    return {
      url,
      blocked: true,
      reason: "adult_tld"
    };
  }

  let webRiskFailed = false;
  let ipqsFailed = false;
  
  const webRisk = await checkUrlWithSafeBrowsing(url);
  if (webRisk.status === "malicious") {
    return {
      url,
      blocked: true,
      reason: "google_web_risk",
      details: webRisk
    };
  }
  if (webRisk.status === "error" || webRisk.status === "unknown") {
    webRiskFailed = true;
  }

  const ipqs = await checkAdultContent(url);
  if (ipqs.adult || ipqs.porn) {
    return {
      url,
      blocked: true,
      reason: "adult_content",
      details: ipqs
    };
  }
  if (ipqs.error) {
    ipqsFailed = true;
  }

  if (webRiskFailed && ipqsFailed) {
    return {
      url,
      blocked: false,
      reason: "safe_api_unavailable",
      warning: "Both APIs failed, passing as safe"
    };
  }

  return {
    url,
    blocked: false,
    reason: "clean"
  };
}

async function moderateText(text) {
  const urls = extractUrls(text);
  
  if (urls.length === 0) {
    return {
      isExplicit: false,
      message: "No URLs found"
    };
  }

  if (urls.length > 5) {
    return {
      isExplicit: true,
      message: "Too Many URLs found"
    };
  }

  const results = await Promise.all(
    urls.map(url => moderateUrl(url))
  );

  const hasExplicitContent = results.some(r => r.blocked);

  return {
    isExplicit: hasExplicitContent,
    urlsChecked: results.length,
    blockedUrls: results.filter(r => r.blocked),
    details: results
  };
}

export async function isLinkExplicit(text) {
  const result = await moderateText(text);
  return result.isExplicit;
}

