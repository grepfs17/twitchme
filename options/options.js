document.addEventListener("DOMContentLoaded", loadSettings);
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
