const STORAGE_KEY = "twitchme";
// This is a public Twitch client ID
const TWITCH_CLIENT_ID = "kimne78kx3ncx6brgo4mv6wki5h1ko";
let subMinuteTimers = [];
let checkLock = null;

chrome.runtime.onInstalled.addListener(async () => {
  await initDefaults();
  startPolling();
  checkAllChannels();
});

chrome.runtime.onStartup.addListener(async () => {
  const { [STORAGE_KEY]: data } = await chrome.storage.sync.get(STORAGE_KEY);
  if (data) {
    data.liveChannels = {};
    await chrome.storage.sync.set({ [STORAGE_KEY]: data });
  }
  startPolling();
  checkAllChannels();
});

async function initDefaults() {
  const data = await chrome.storage.sync.get(STORAGE_KEY);
  if (!data[STORAGE_KEY]) {
    await chrome.storage.sync.set({
      [STORAGE_KEY]: {
        channels: [],
        settings: {
          autoClose: true,
          pollingInterval: 1,
        },
        liveChannels: {},
      },
    });
  }
}

function startPolling(intervalMinutes) {
  chrome.alarms.clear("checkStreams");
  subMinuteTimers.forEach(clearTimeout);
  subMinuteTimers = [];

  const interval = Math.max(1, intervalMinutes ?? 1);
  chrome.alarms.create("checkStreams", { periodInMinutes: interval });
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== "checkStreams") return;

  const { [STORAGE_KEY]: data } = await chrome.storage.sync.get(STORAGE_KEY);
  const interval = data?.settings?.pollingInterval ?? 1;

  if (interval < 1) {
    subMinuteTimers.forEach(clearTimeout);
    subMinuteTimers = [];
    const ms = Math.round(interval * 60 * 1000);
    const count = Math.floor(60000 / ms);
    for (let i = 0; i < count; i++) {
      subMinuteTimers.push(setTimeout(() => checkAllChannels(), i * ms));
    }
  } else {
    checkAllChannels();
  }
});

async function checkAllChannels() {
  if (checkLock) return checkLock;
  checkLock = (async () => {
    try {
      let { [STORAGE_KEY]: data } = await chrome.storage.sync.get(STORAGE_KEY);
      if (!data || !data.channels.length) return;

      for (const ch of data.channels) {
        const isLive = await checkChannelLive(ch.name);
        const wasLive = data.liveChannels[ch.name];

        const openCount = await countOpenTabs(ch.name);
        const needed = (ch.maxOpens || 1) - openCount;

        if (isLive && needed > 0) {
          try {
            for (let i = 0; i < needed; i++) {
              await openStreamTab(ch, i);
            }
          } catch (e) {
            console.error("Failed to open tab for", ch.name, e);
          }
          data.liveChannels[ch.name] = true;
        } else if (!isLive && wasLive && data.settings.autoClose) {
          await closeStreamTab(ch.name);
          data.liveChannels[ch.name] = false;
        }
      }

      await chrome.storage.sync.set({ [STORAGE_KEY]: data });
    } finally {
      checkLock = null;
    }
  })();
  return checkLock;
}

function getTabUrl(channelName) {
  return `https://www.twitch.tv/${channelName}*`;
}

async function countOpenTabs(channelName) {
  const tabs = await chrome.tabs.query({ url: getTabUrl(channelName) });
  return tabs.length;
}

async function checkChannelLive(channel) {
  try {
    const response = await fetch("https://gql.twitch.tv/gql", {
      method: "POST",
      headers: {
        "Client-ID": TWITCH_CLIENT_ID,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: `{ user(login: "${channel}") { stream { id } } }`,
      }),
    });
    if (!response.ok) return false;
    const json = await response.json();
    return json.data?.user?.stream?.id != null;
  } catch {
    return false;
  }
}

async function openStreamTab(channelObj, index) {
  try {
    const tab = await chrome.tabs.create({
      url: `https://www.twitch.tv/${channelObj.name}`,
      active: channelObj.focus,
    });

    if (channelObj.muted) {
      setTimeout(
        async () => {
          try {
            await chrome.tabs.update(tab.id, { muted: true });
          } catch {}
        },
        500 + (index || 0) * 200,
      );
    } else {
      unmuteTwitchPlayer(tab.id);
    }
  } catch (e) {
    console.error("Failed to create tab for", channelObj.name, e);
  }
}

function unmuteTwitchPlayer(tabId) {
  chrome.tabs.update(tabId, { muted: false }).catch(() => {});

  chrome.scripting
    .executeScript({
      target: { tabId },
      func: () => {
        function unmuteVideo() {
          const video = document.querySelector("video");
          if (video) {
            video.muted = false;
            video.volume = 1.0;
            video.play().catch(() => {});
          }

          const unmuteBtn =
            document.querySelector(
              '[data-a-target="player-mute-unmute-button"]',
            ) ||
            document.querySelector('button[aria-label="Unmute"]') ||
            document.querySelector(".player-mute-unmute-button");
          if (
            unmuteBtn &&
            unmuteBtn
              .getAttribute("aria-label")
              ?.toLowerCase()
              .includes("unmute")
          ) {
            unmuteBtn.click();
          }
        }

        let attempts = 0;
        const timer = setInterval(() => {
          unmuteVideo();
          attempts++;
          if (attempts >= 60) clearInterval(timer);
        }, 500);
      },
    })
    .catch(() => {});
}

async function closeStreamTab(channel) {
  const tabs = await chrome.tabs.query({ url: getTabUrl(channel) });
  for (const tab of tabs) {
    try {
      await chrome.tabs.remove(tab.id);
    } catch {}
  }
}

chrome.tabs.onRemoved.addListener(() => {
  checkAllChannels();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case "GET_STATUS":
      chrome.storage.sync
        .get(STORAGE_KEY)
        .then((r) => sendResponse(r[STORAGE_KEY]));
      return true;
    case "ADD_CHANNEL":
      addChannel(message.channel).then(sendResponse);
      return true;
    case "REMOVE_CHANNEL":
      removeChannel(message.channel).then(sendResponse);
      return true;
    case "CHECK_NOW":
      checkAllChannels().then(() => {
        chrome.storage.sync
          .get(STORAGE_KEY)
          .then((r) => sendResponse(r[STORAGE_KEY]));
      });
      return true;
    case "UPDATE_CHANNEL":
      updateChannel(message.channel, message.settings).then(sendResponse);
      return true;
    case "UPDATE_SETTINGS":
      updateSettings(message.settings).then(sendResponse);
      return true;
  }
});

async function addChannel(channel) {
  const { [STORAGE_KEY]: data } = await chrome.storage.sync.get(STORAGE_KEY);
  const normalized = channel.trim().toLowerCase();
  if (!normalized || data.channels.some((c) => c.name === normalized))
    return data;
  data.channels.push({
    name: normalized,
    muted: true,
    focus: false,
    maxOpens: 1,
  });
  await chrome.storage.sync.set({ [STORAGE_KEY]: data });
  checkAllChannels();
  return data;
}

async function removeChannel(channel) {
  const { [STORAGE_KEY]: data } = await chrome.storage.sync.get(STORAGE_KEY);
  data.channels = data.channels.filter((c) => c.name !== channel);
  delete data.liveChannels[channel];
  await chrome.storage.sync.set({ [STORAGE_KEY]: data });
  await closeStreamTab(channel);
  return data;
}

async function updateChannel(channelName, channelSettings) {
  const { [STORAGE_KEY]: data } = await chrome.storage.sync.get(STORAGE_KEY);
  const ch = data.channels.find((c) => c.name === channelName);
  if (ch) {
    if (channelSettings.muted !== undefined) ch.muted = channelSettings.muted;
    if (channelSettings.focus !== undefined) ch.focus = channelSettings.focus;
    if (channelSettings.maxOpens !== undefined)
      ch.maxOpens = channelSettings.maxOpens;
  }
  await chrome.storage.sync.set({ [STORAGE_KEY]: data });
  return data;
}

async function updateSettings(settings) {
  const { [STORAGE_KEY]: data } = await chrome.storage.sync.get(STORAGE_KEY);
  Object.assign(data.settings, settings);
  await chrome.storage.sync.set({ [STORAGE_KEY]: data });

  if (settings.pollingInterval !== undefined) {
    startPolling(settings.pollingInterval);
  }

  return data.settings;
}
