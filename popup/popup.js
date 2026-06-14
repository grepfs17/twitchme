const STORAGE_KEY = "twitchme";
let detectedAdblockers = [];

document.addEventListener("DOMContentLoaded", () => {
  const channelInput = document.getElementById("channelInput");
  const addBtn = document.getElementById("addBtn");
  const channelList = document.getElementById("channelList");
  const emptyState = document.getElementById("emptyState");
  const checkNowBtn = document.getElementById("checkNowBtn");
  const statusText = document.getElementById("statusText");
  const settingsBtn = document.getElementById("settingsBtn");

  loadStatus();
  detectAdblockers();

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "sync" && changes[STORAGE_KEY]) {
      renderView(changes[STORAGE_KEY].newValue);
    }
  });

  addBtn.addEventListener("click", addChannel);
  channelInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") addChannel();
  });

  checkNowBtn.addEventListener("click", async () => {
    statusText.textContent = "Checking...";
    chrome.runtime.sendMessage({ type: "CHECK_NOW" }, (data) => {
      if (chrome.runtime.lastError || !data) {
        showError("failed to check streams");
        return;
      }
      renderView(data);
    });
  });

  settingsBtn.addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });

  async function addChannel() {
    const name = channelInput.value.trim();
    if (!name) return;
    channelInput.value = "";
    statusText.textContent = "Adding...";
    chrome.runtime.sendMessage(
      { type: "ADD_CHANNEL", channel: name },
      (data) => {
        if (chrome.runtime.lastError || !data) {
          showError("failed to add channel");
          return;
        }
        renderView(data);
      },
    );
  }

  function loadStatus() {
    chrome.runtime.sendMessage({ type: "GET_STATUS" }, (data) => {
      if (chrome.runtime.lastError || !data) {
        showError("could not load status");
        return;
      }
      renderView(data);
    });
  }

  function showError(msg) {
    statusText.textContent = `Error: ${msg}`;
  }

  function renderChannels(data) {
    const channels = data.channels || [];

    if (channels.length === 0) {
      emptyState.style.display = "block";
      channelList.style.display = "none";
      return;
    }

    emptyState.style.display = "none";
    channelList.style.display = "block";
    channelList.innerHTML = "";

    const legend = document.createElement("div");
    legend.className = "channel-legend";
    legend.innerHTML = `<span class="col-status">Status</span>
    <span class="col-name">Channel</span>
    <span class="col-toggle">Sound</span>
    <span class="col-toggle">Focus</span>
    <span class="col-opens">Tabs</span>
    <span class="col-remove"></span>`;
    channelList.appendChild(legend);

    channels.forEach((ch) => {
      const item = document.createElement("div");
      item.className = "channel-item";

      const isLive = data.liveChannels?.[ch.name];

      const badge = document.createElement("span");
      badge.className = isLive ? "live-badge" : "offline-badge";
      badge.textContent = isLive ? "LIVE" : "Offline";

      const name = document.createElement("a");
      name.className = "channel-name";
      name.href = `https://www.twitch.tv/${ch.name}`;
      name.target = "_blank";
      name.textContent = ch.name;

      const muteBtn = document.createElement("button");
      muteBtn.className = "channel-toggle" + (ch.muted ? " active" : "");
      muteBtn.textContent = ch.muted ? "Muted" : "Sound";
      muteBtn.title = "Toggle mute for this channel";
      muteBtn.addEventListener("click", () => {
        chrome.runtime.sendMessage(
          {
            type: "UPDATE_CHANNEL",
            channel: ch.name,
            settings: { muted: !ch.muted },
          },
          (d) => {
            if (chrome.runtime.lastError || !d) {
              showError("failed to update channel");
              return;
            }
            renderView(d);
          },
        );
      });

      const focusBtn = document.createElement("button");
      focusBtn.className = "channel-toggle" + (ch.focus ? " active" : "");
      focusBtn.textContent = ch.focus ? "Focus" : "NoFocus";
      focusBtn.title = "Toggle auto-focus for this channel";
      focusBtn.addEventListener("click", () => {
        chrome.runtime.sendMessage(
          {
            type: "UPDATE_CHANNEL",
            channel: ch.name,
            settings: { focus: !ch.focus },
          },
          (d) => {
            if (chrome.runtime.lastError || !d) {
              showError("failed to update channel");
              return;
            }
            renderView(d);
          },
        );
      });

      const opensInput = document.createElement("input");
      opensInput.type = "number";
      opensInput.className = "channel-opens";
      opensInput.value = ch.maxOpens ?? 1;
      opensInput.min = 1;
      opensInput.max = 10;
      opensInput.title = "Number of tabs to open";
      opensInput.addEventListener("change", () => {
        const val = parseInt(opensInput.value) || 1;
        chrome.runtime.sendMessage(
          {
            type: "UPDATE_CHANNEL",
            channel: ch.name,
            settings: { maxOpens: Math.max(1, Math.min(10, val)) },
          },
          (d) => {
            if (chrome.runtime.lastError || !d) {
              showError("failed to update channel");
              return;
            }
            renderView(d);
          },
        );
      });

      const removeBtn = document.createElement("button");
      removeBtn.className = "remove-btn";
      removeBtn.textContent = "×";
      removeBtn.title = "Remove channel";
      removeBtn.addEventListener("click", () => {
        chrome.runtime.sendMessage(
          { type: "REMOVE_CHANNEL", channel: ch.name },
          (d) => {
            if (chrome.runtime.lastError || !d) {
              showError("failed to remove channel");
              return;
            }
            renderView(d);
          },
        );
      });

      item.appendChild(badge);
      item.appendChild(name);
      item.appendChild(muteBtn);
      item.appendChild(focusBtn);
      item.appendChild(opensInput);
      item.appendChild(removeBtn);
      channelList.appendChild(item);
    });
  }

  function updateStatusText(data) {
    const channels = data.channels || [];
    const liveCount = Object.values(data.liveChannels || {}).filter(
      Boolean,
    ).length;
    statusText.textContent = `${liveCount}/${channels.length} live`;
  }

  async function detectAdblockers() {
    chrome.runtime.sendMessage({ type: "DETECT_ADBLOCKERS" }, (result) => {
      if (chrome.runtime.lastError || !result) return;
      detectedAdblockers = result;
      loadStatus();
    });
  }

  function renderAdblockerWarnings(data) {
    const warningEl = document.getElementById("adblockerWarning");
    if (!detectedAdblockers.length) {
      warningEl.style.display = "none";
      return;
    }

    const liveChannels = (data.channels || []).filter(
      (ch) => data.liveChannels?.[ch.name],
    );

    const supporting = detectedAdblockers.filter((a) => a.supportsRules);
    const others = detectedAdblockers.filter((a) => !a.supportsRules);

    let html = "";

    if (supporting.length && liveChannels.length) {
      const names = supporting.map((a) => a.name).join(", ");
      html += `<div class="adblocker-header">⚠️ <strong>${names}</strong> detected</div>`;
      html += `<p class="adblocker-sub">Whitelist Twitch channels in your ad blocker if you want to support the streamer.</p>`;

      liveChannels.forEach((ch) => {
        const rule = `@@||twitch.tv/${ch.name}$document`;
        html += `<div class="adblocker-rule">`;
        html += `<span class="adblocker-rule-code">${rule}</span>`;
        html += `<button class="copy-rule-btn" data-rule="${rule}">Copy</button>`;
        html += `</div>`;
      });

      supporting.forEach((a) => {
        if (a.dashboardUrl) {
          html += `<button class="open-dashboard-btn" data-url="${a.dashboardUrl}">Open ${a.name} Dashboard</button>`;
        }
      });

      html += `<p class="adblocker-help">Add the filter in your ad blocker's dashboard, then reload the stream.</p>`;
    } else if (others.length) {
      const names = others.map((a) => a.name).join(", ");
      html += `<div class="adblocker-header">⚠️ <strong>${names}</strong> detected</div>`;
      html += `<p class="adblocker-sub">Whitelist Twitch channels if you want to support the streamer.</p>`;
    }

    if (html) {
      warningEl.innerHTML = html;
      warningEl.style.display = "block";
    } else {
      warningEl.style.display = "none";
    }

    warningEl.querySelectorAll(".copy-rule-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const rule = btn.dataset.rule;
        navigator.clipboard.writeText(rule).then(() => {
          btn.textContent = "Copied!";
          setTimeout(() => (btn.textContent = "Copy"), 1500);
        });
      });
    });

    warningEl.querySelectorAll(".open-dashboard-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        chrome.tabs.create({ url: btn.dataset.url });
      });
    });
  }

  function renderView(data) {
    renderChannels(data);
    updateStatusText(data);
    renderAdblockerWarnings(data);
  }
});
