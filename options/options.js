document.addEventListener("DOMContentLoaded", () => {
  loadSettings();
  detectAdblockers();
});

async function detectAdblockers() {
  const bait = document.createElement("div");
  bait.setAttribute(
    "class",
    "ad_banner ad_unit adsbygoogle pub_300x250 textAd text_ad text_ads",
  );
  bait.style.cssText =
    "height:1px!important;width:1px!important;position:absolute!important;left:-9999px!important;";
  document.documentElement.appendChild(bait);

  await new Promise((r) => setTimeout(r, 100));

  const blocked =
    bait.offsetParent === null ||
    bait.clientHeight === 0 ||
    bait.clientHeight === 1 ||
    getComputedStyle(bait).display === "none" ||
    getComputedStyle(bait).visibility === "hidden";

  bait.remove();
  await chrome.storage.local.set({ adblockerDetected: blocked });
}
document.getElementById("saveBtn").addEventListener("click", saveSettings);

async function loadSettings() {
  const { twitchme } = await chrome.storage.sync.get("twitchme");
  const d = twitchme || {};

  document.getElementById("pollingInterval").value = String(
    d.settings?.pollingInterval ?? 1,
  );
  document.getElementById("autoClose").checked =
    d.settings?.autoClose !== false;

  renderChannels(d.channels || []);
}

function renderChannels(channels) {
  const list = document.getElementById("channelList");
  list.innerHTML = "";

  if (channels.length === 0) {
    list.innerHTML = '<p class="empty-channels">No channels added yet.</p>';
    return;
  }

  channels.forEach((ch) => {
    const tag = document.createElement("span");
    tag.className = "channel-tag";

    const nameSpan = document.createTextNode(ch.name + " ");
    tag.appendChild(nameSpan);

    const remove = document.createElement("span");
    remove.className = "remove";
    remove.textContent = "\u00d7";
    remove.addEventListener("click", async () => {
      chrome.runtime.sendMessage(
        { type: "REMOVE_CHANNEL", channel: ch.name },
        (data) => {
          if (chrome.runtime.lastError || !data) {
            showSaveStatus("Error: failed to remove channel", "#eb0400");
            return;
          }
          renderChannels(data.channels);
        },
      );
    });
    tag.appendChild(remove);

    list.appendChild(tag);
  });
}

async function saveSettings() {
  const settings = {
    pollingInterval:
      parseFloat(document.getElementById("pollingInterval").value) || 1,
    autoClose: document.getElementById("autoClose").checked,
  };

  showSaveStatus("Saving...", "#adadb8");

  chrome.runtime.sendMessage({ type: "UPDATE_SETTINGS", settings }, () => {
    if (chrome.runtime.lastError) {
      showSaveStatus("Error: failed to save", "#eb0400");
      return;
    }
    showSaveStatus("Saved!", "#00d94e");
  });
}

function showSaveStatus(text, color) {
  const status = document.getElementById("saveStatus");
  status.textContent = text;
  status.style.color = color;
  if (color !== "#adadb8") {
    setTimeout(() => {
      status.textContent = "";
    }, 2000);
  }
}
