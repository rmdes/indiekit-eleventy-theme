/**
 * Bluesky Feed Data
 * Fetches recent posts from Bluesky using the AT Protocol API
 */

import { cachedFetch } from "../lib/data-fetch.js";
import { BskyAgent } from "@atproto/api";

export default async function () {
  const handle = process.env.BLUESKY_HANDLE || "";

  if (!handle) {
    console.log("[blueskyFeed] BLUESKY_HANDLE unset — skipping");
    return [];
  }

  try {
    // Create agent and resolve handle to DID
    const agent = new BskyAgent({ service: "https://bsky.social" });

    // Get the author's feed using public API (no auth needed for public posts)
    const feedUrl = `https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=${handle}&limit=10`;

    const response = await cachedFetch(feedUrl, {
      duration: "15m", // Cache for 15 minutes
      type: "json",
      fetchOptions: {
        headers: {
          Accept: "application/json",
        },
      },
    });

    if (!response.feed) {
      console.log("No Bluesky feed found for handle:", handle);
      return [];
    }

    // Transform the feed into a simpler format
    return response.feed.map((item) => {
      // Extract rkey from AT URI (at://did:plc:xxx/app.bsky.feed.post/rkey)
      const rkey = item.post.uri.split("/").pop();
      const postUrl = `https://bsky.app/profile/${item.post.author.handle}/post/${rkey}`;

      return {
        text: item.post.record.text,
        createdAt: item.post.record.createdAt,
        uri: item.post.uri,
        url: postUrl,
        cid: item.post.cid,
        author: {
          handle: item.post.author.handle,
          displayName: item.post.author.displayName,
          avatar: item.post.author.avatar,
        },
        likeCount: item.post.likeCount || 0,
        repostCount: item.post.repostCount || 0,
        replyCount: item.post.replyCount || 0,
        // Extract any embedded links or images
        embed: item.post.embed
          ? {
              type: item.post.embed.$type,
              images: item.post.embed.images || [],
              external: item.post.embed.external || null,
            }
          : null,
      };
    });
  } catch (error) {
    console.error("Error fetching Bluesky feed:", error.message);
    return [];
  }
}
