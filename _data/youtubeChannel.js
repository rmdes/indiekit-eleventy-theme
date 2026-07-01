/**
 * YouTube Channel Data
 * Fetches from Indiekit's endpoint-youtube public API
 * Supports single or multiple channels
 */
import { dataLog } from "../lib/log.js";

import { cachedFetch } from "../lib/data-fetch.js";

const INDIEKIT_URL = process.env.SITE_URL || "https://example.com";

/**
 * Fetch from Indiekit's public YouTube API endpoint
 */
async function fetchFromIndiekit(endpoint) {
  try {
    const url = `${INDIEKIT_URL}/youtubeapi/api/${endpoint}`;
    dataLog(`[youtubeChannel] Fetching from Indiekit: ${url}`);
    const data = await cachedFetch(url, {
      duration: "5m",
      type: "json",
    });
    dataLog(`[youtubeChannel] Indiekit ${endpoint} success`);
    return data;
  } catch (error) {
    dataLog(
      `[youtubeChannel] Indiekit API unavailable for ${endpoint}: ${error.message}`
    );
    return null;
  }
}

/**
 * Format large numbers with locale separators
 */
function formatNumber(num) {
  if (!num) return "0";
  return new Intl.NumberFormat().format(num);
}

/**
 * Format view count with K/M suffix for compact display
 */
function formatViewCount(num) {
  if (!num) return "0";
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1).replace(/\.0$/, "") + "M";
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1).replace(/\\.0$/, "") + "K";
  }
  return num.toString();
}

/**
 * Format relative time from ISO date string
 */
function formatRelativeTime(dateString) {
  if (!dateString) return "";
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
  return `${Math.floor(diffDays / 365)} years ago`;
}

/**
 * Format channel data with computed fields
 */
function formatChannel(channel) {
  if (!channel) return null;
  return {
    ...channel,
    subscriberCountFormatted: formatNumber(channel.subscriberCount),
    videoCountFormatted: formatNumber(channel.videoCount),
    viewCountFormatted: formatNumber(channel.viewCount),
    url: `https://www.youtube.com/channel/${channel.id}`,
  };
}

/**
 * Format video data with computed fields
 */
function formatVideo(video) {
  return {
    ...video,
    viewCountFormatted: formatViewCount(video.viewCount),
    relativeTime: formatRelativeTime(video.publishedAt),
  };
}

export default async function () {
  try {
    dataLog("[youtubeChannel] Fetching YouTube data...");

    // Fetch all data from Indiekit API
    const [channelData, videosData, liveData] = await Promise.all([
      fetchFromIndiekit("channel"),
      fetchFromIndiekit("videos"),
      fetchFromIndiekit("live"),
    ]);

    // Check if we got data
    const hasData =
      channelData?.channel ||
      channelData?.channels?.length ||
      videosData?.videos?.length;

    if (!hasData) {
      dataLog("[youtubeChannel] No data available from Indiekit");
      return {
        channel: null,
        channels: [],
        videos: [],
        videosByChannel: {},
        liveStatus: null,
        liveStatuses: [],
        isMultiChannel: false,
        source: "unavailable",
      };
    }

    dataLog("[youtubeChannel] Using Indiekit API data");

    // Determine if multi-channel mode
    const isMultiChannel = !!(channelData?.channels && channelData.channels.length > 1);

    // Format channels
    let channels = [];
    let channel = null;

    if (isMultiChannel) {
      channels = (channelData.channels || []).map(formatChannel).filter(Boolean);
      channel = channels[0] || null;
    } else {
      channel = formatChannel(channelData?.channel);
      channels = channel ? [channel] : [];
    }

    // Format videos
    const videos = (videosData?.videos || []).map(formatVideo);

    // Group videos by channel if multi-channel
    let videosByChannel = {};
    if (isMultiChannel && videosData?.videosByChannel) {
      for (const [channelName, channelVideos] of Object.entries(videosData.videosByChannel)) {
        videosByChannel[channelName] = (channelVideos || []).map(formatVideo);
      }
    } else if (channel) {
      videosByChannel[channel.configName || channel.title] = videos;
    }

    // Format live status
    let liveStatus = null;
    let liveStatuses = [];

    if (liveData) {
      if (isMultiChannel && liveData.liveStatuses) {
        liveStatuses = liveData.liveStatuses;
        // Find first live or upcoming
        const live = liveStatuses.find((s) => s.isLive);
        const upcoming = liveStatuses.find((s) => s.isUpcoming && !s.isLive);
        liveStatus = {
          isLive: !!live,
          isUpcoming: !live && !!upcoming,
          stream: live?.stream || upcoming?.stream || null,
        };
      } else {
        liveStatus = {
          isLive: liveData.isLive || false,
          isUpcoming: liveData.isUpcoming || false,
          stream: liveData.stream || null,
        };
        liveStatuses = [{ ...liveStatus, channelConfigName: channel?.configName }];
      }
    }

    return {
      channel,
      channels,
      videos,
      videosByChannel,
      liveStatus,
      liveStatuses,
      isMultiChannel,
      source: "indiekit",
    };
  } catch (error) {
    console.error("[youtubeChannel] Error:", error.message);
    return {
      channel: null,
      channels: [],
      videos: [],
      videosByChannel: {},
      liveStatus: null,
      liveStatuses: [],
      isMultiChannel: false,
      source: "error",
    };
  }
}
