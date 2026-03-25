/**
 * Client-side comments component (Alpine.js)
 * Handles IndieAuth flow, comment submission, display, and owner detection
 *
 * Registered via Alpine.data() so the component is available
 * regardless of script loading order.
 */

document.addEventListener("alpine:init", () => {
  // Global owner state store — shared across components
  Alpine.store("owner", {
    isOwner: false,
    profile: null,
    syndicationTargets: {},
  });

  Alpine.data("commentsSection", (targetUrl) => ({
    targetUrl,
    user: null,
    meUrl: "",
    commentText: "",
    comments: [],
    loading: true,
    authLoading: false,
    submitting: false,
    statusMessage: "",
    statusType: "info",
    maxLength: 2000,
    showForm: false,
    isOwner: false,
    ownerProfile: null,
    syndicationTargets: {},
    replyingTo: null,
    replyText: "",
    replySubmitting: false,

    async init() {
      await this.checkSession();
      await this.checkOwner();
      await this.loadComments();
      if (this.isOwner) {
        // Notify webmentions.js that owner is detected (for reply buttons)
        document.dispatchEvent(new CustomEvent("owner:detected"));
      }
      this.handleAuthReturn();
    },

    async checkSession() {
      try {
        const res = await fetch("/comments/api/session", {
          credentials: "include",
        });
        if (res.ok) {
          const data = await res.json();
          if (data.user) this.user = data.user;
        }
      } catch {
        // No session
      }
    },

    async checkOwner() {
      try {
        const res = await fetch("/comments/api/is-owner", {
          credentials: "include",
        });
        if (res.ok) {
          const data = await res.json();
          if (data.isOwner) {
            this.isOwner = true;
            this.ownerProfile = {
              name: data.name,
              url: data.url,
              photo: data.photo,
            };
            this.syndicationTargets = data.syndicationTargets || {};

            // Also update global store for webmentions component
            Alpine.store("owner").isOwner = true;
            Alpine.store("owner").profile = this.ownerProfile;
            Alpine.store("owner").syndicationTargets = this.syndicationTargets;

            // Note: owner:detected event is dispatched from init() after
            // this completes, so the Alpine store is populated before the event fires
          }
        }
      } catch {
        // Not owner
      }
    },

    startReply(commentId, platform, replyUrl, syndicateTo) {
      this.replyingTo = { commentId, platform, replyUrl, syndicateTo };
      this.replyText = "";
    },

    cancelReply() {
      this.replyingTo = null;
      this.replyText = "";
    },

    async submitReply() {
      if (!this.replyText.trim() || !this.replyingTo) return;
      this.replySubmitting = true;

      try {
        if (this.replyingTo.platform === "comment") {
          // Native comment reply — POST to comments API
          const res = await fetch("/comments/api/reply", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              parent_id: this.replyingTo.commentId,
              content: this.replyText,
              target: this.targetUrl,
            }),
          });

          if (res.ok) {
            const data = await res.json();
            if (data.comment) {
              this.comments.push(data.comment);
            }
            this.showStatus("Reply posted!", "success");
          } else {
            const data = await res.json();
            this.showStatus(data.error || "Failed to reply", "error");
          }
        } else {
          // Micropub reply — POST to /micropub
          const micropubBody = {
            type: ["h-entry"],
            properties: {
              content: [this.replyText],
              "in-reply-to": [this.replyingTo.replyUrl],
            },
          };

          // Only add syndication target if one exists for the platform
          if (this.replyingTo.syndicateTo) {
            micropubBody.properties["mp-syndicate-to"] = [
              this.replyingTo.syndicateTo,
            ];
          }

          const res = await fetch("/micropub", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            credentials: "include",
            body: JSON.stringify(micropubBody),
          });

          if (res.ok || res.status === 201 || res.status === 202) {
            this.showStatus("Reply posted and syndicated!", "success");
          } else {
            const data = await res.json().catch(() => ({}));
            this.showStatus(
              data.error_description || data.error || "Failed to post reply",
              "error",
            );
          }
        }

        this.replyingTo = null;
        this.replyText = "";
      } catch (error) {
        this.showStatus("Error posting reply: " + error.message, "error");
      } finally {
        this.replySubmitting = false;
      }
    },

    handleAuthReturn() {
      const params = new URLSearchParams(window.location.search);
      const authError = params.get("auth_error");
      if (authError) {
        this.showStatus(`Authentication failed: ${authError}`, "error");
        window.history.replaceState(
          {},
          "",
          window.location.pathname + "#comments",
        );
      }
    },

    async loadComments() {
      this.loading = true;
      try {
        const url = `/comments/api/comments?target=${encodeURIComponent(this.targetUrl)}`;
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          this.comments = data.children || [];
          // Auto-expand if comments exist
          if (this.comments.length > 0) {
            this.showForm = true;
          }
        }
      } catch (e) {
        console.error("[Comments] Load error:", e);
      } finally {
        this.loading = false;
      }
    },

    async startAuth() {
      this.authLoading = true;
      try {
        const res = await fetch("/comments/api/auth", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            me: this.meUrl,
            returnUrl: window.location.pathname + "#comments",
          }),
          credentials: "include",
        });

        if (!res.ok) {
          const data = await res.json();
          this.showStatus(data.error || "Auth failed", "error");
          return;
        }

        const data = await res.json();
        if (data.authUrl) {
          window.location.href = data.authUrl;
        }
      } catch {
        this.showStatus("Failed to start authentication", "error");
      } finally {
        this.authLoading = false;
      }
    },

    async submitComment() {
      if (!this.commentText.trim()) return;
      this.submitting = true;

      try {
        const res = await fetch("/comments/api/submit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: this.commentText,
            target: this.targetUrl,
          }),
          credentials: "include",
        });

        if (res.ok) {
          const data = await res.json();
          if (data.comment) {
            this.comments.unshift(data.comment);
          }
          this.commentText = "";
          this.showStatus("Comment posted!", "success");
        } else {
          const data = await res.json();
          this.showStatus(data.error || "Failed to post", "error");
        }
      } catch {
        this.showStatus("Error posting comment", "error");
      } finally {
        this.submitting = false;
      }
    },

    signOut() {
      document.cookie =
        "comment_session=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
      this.user = null;
      this.showStatus("Signed out", "info");
    },

    showStatus(message, type = "info") {
      this.statusMessage = message;
      this.statusType = type;
      setTimeout(() => {
        this.statusMessage = "";
      }, 5000);
    },
  }));
});
