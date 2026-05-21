const STORAGE_KEY = 'twitchme'
const TWITCH_CLIENT_ID = 'kimne78kx3ncx6brgo4mv6wki5h1ko'
let pollTimeout = null

chrome.runtime.onInstalled.addListener(async () => {
  await initDefaults()
  await migrateData()
  startPolling()
  checkAllChannels()
})

chrome.runtime.onStartup.addListener(async () => {
  const { [STORAGE_KEY]: data } = await chrome.storage.sync.get(STORAGE_KEY)
  if (data) {
    data.liveChannels = {}
    data.openTabs = {}
    await chrome.storage.sync.set({ [STORAGE_KEY]: data })
  }
  startPolling()
  checkAllChannels()
})

async function initDefaults() {
  const data = await chrome.storage.sync.get(STORAGE_KEY)
  if (!data[STORAGE_KEY]) {
    await chrome.storage.sync.set({
      [STORAGE_KEY]: {
        channels: [],
        settings: {
          autoClose: true,
          pollingInterval: 1
        },
        liveChannels: {},
        openTabs: {}
      }
    })
  }
}

async function migrateData() {
  const { [STORAGE_KEY]: data } = await chrome.storage.sync.get(STORAGE_KEY)
  if (!data) return
  let changed = false

  if (data.channels && data.channels.length) {
    if (typeof data.channels[0] === 'string') {
      data.channels = data.channels.map(c => ({
        name: c, muted: true, focus: false, maxOpens: 1
      }))
      changed = true
    } else if (data.channels[0].maxOpens === undefined) {
      data.channels = data.channels.map(c => ({ ...c, maxOpens: c.maxOpens ?? 1 }))
      changed = true
    }
  }

  if (data.openTabs) {
    for (const [key, val] of Object.entries(data.openTabs)) {
      if (typeof val === 'number') {
        data.openTabs[key] = [val]
        changed = true
      }
    }
  }

  if (data.settings && 'maxTabs' in data.settings) {
    delete data.settings.maxTabs
    changed = true
  }

  if (changed) await chrome.storage.sync.set({ [STORAGE_KEY]: data })
}

function startPolling(intervalMinutes) {
  chrome.alarms.clear('checkStreams')
  if (pollTimeout) clearTimeout(pollTimeout)
  pollTimeout = null

  const interval = intervalMinutes ?? 1

  if (interval >= 1) {
    chrome.alarms.create('checkStreams', { periodInMinutes: interval })
  } else {
    const ms = Math.round(interval * 60 * 1000)
    function tick() {
      checkAllChannels()
      pollTimeout = setTimeout(tick, ms)
    }
    pollTimeout = setTimeout(tick, ms)
  }
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'checkStreams') checkAllChannels()
})

async function checkAllChannels() {
  let { [STORAGE_KEY]: data } = await chrome.storage.sync.get(STORAGE_KEY)
  if (!data || !data.channels.length) return

  for (const ch of data.channels) {
    const isLive = await checkChannelLive(ch.name)
    const wasLive = data.liveChannels[ch.name]

    const hasTabs = await hasOpenTabs(ch.name, data)

    if (isLive) {
      if (!hasTabs) {
        try {
          await openStreamTab(ch)
        } catch (e) {
          console.error('Failed to open tab for', ch.name, e)
        }
        const fresh = await chrome.storage.sync.get(STORAGE_KEY)
        data = fresh[STORAGE_KEY]
      }
      data.liveChannels[ch.name] = true
    } else if (!isLive && wasLive && data.settings.autoClose) {
      await closeStreamTab(ch.name)
      const fresh = await chrome.storage.sync.get(STORAGE_KEY)
      data = fresh[STORAGE_KEY]
      data.liveChannels[ch.name] = false
    }
  }

  await chrome.storage.sync.set({ [STORAGE_KEY]: data })
}

async function hasOpenTabs(channelName, data) {
  const tabIds = data.openTabs[channelName]
  if (!tabIds || !tabIds.length) return false
  for (const tabId of tabIds) {
    try {
      await chrome.tabs.get(tabId)
      return true
    } catch {}
  }
  delete data.openTabs[channelName]
  return false
}

async function checkChannelLive(channel) {
  try {
    const response = await fetch('https://gql.twitch.tv/gql', {
      method: 'POST',
      headers: {
        'Client-ID': TWITCH_CLIENT_ID,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query: `{ user(login: "${channel}") { stream { id } } }`
      })
    })
    if (!response.ok) return false
    const json = await response.json()
    return json.data?.user?.stream?.id != null
  } catch {
    return false
  }
}

async function openStreamTab(channelObj) {
  const count = channelObj.maxOpens || 1
  const tabIds = []

  for (let i = 0; i < count; i++) {
    try {
      const tab = await chrome.tabs.create({
        url: `https://www.twitch.tv/${channelObj.name}`,
        active: channelObj.focus
      })
      tabIds.push(tab.id)

      unmuteTwitchPlayer(tab.id)

      if (channelObj.muted) {
        setTimeout(async () => {
          try { await chrome.tabs.update(tab.id, { muted: true }) } catch {}
        }, 500 + i * 200)
      }
    } catch (e) {
      console.error('Failed to create tab', i, 'for', channelObj.name, e)
    }
  }

  if (tabIds.length) {
    const { [STORAGE_KEY]: data } = await chrome.storage.sync.get(STORAGE_KEY)
    if (!data.openTabs[channelObj.name]) {
      data.openTabs[channelObj.name] = []
    }
    data.openTabs[channelObj.name].push(...tabIds)
    await chrome.storage.sync.set({ [STORAGE_KEY]: data })
  }
}

function unmuteTwitchPlayer(tabId) {
  chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      let attempts = 0
      const timer = setInterval(() => {
        const video = document.querySelector('video')
        if (video) {
          video.muted = false
          video.volume = 1.0
          clearInterval(timer)
        }
        attempts++
        if (attempts >= 40) clearInterval(timer)
      }, 1000)
    }
  }).catch(() => {})
}

async function closeStreamTab(channel) {
  const { [STORAGE_KEY]: data } = await chrome.storage.sync.get(STORAGE_KEY)
  const tabIds = data.openTabs[channel] || []
  for (const tabId of tabIds) {
    try { await chrome.tabs.remove(tabId) } catch {}
  }
  delete data.openTabs[channel]
  await chrome.storage.sync.set({ [STORAGE_KEY]: data })
}

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const { [STORAGE_KEY]: data } = await chrome.storage.sync.get(STORAGE_KEY)
  for (const [channel, ids] of Object.entries(data.openTabs)) {
    const filtered = ids.filter(id => id !== tabId)
    if (filtered.length !== ids.length) {
      if (filtered.length === 0) {
        delete data.openTabs[channel]
      } else {
        data.openTabs[channel] = filtered
      }
      break
    }
  }
  await chrome.storage.sync.set({ [STORAGE_KEY]: data })
})

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'GET_STATUS':
      chrome.storage.sync.get(STORAGE_KEY).then(r => sendResponse(r[STORAGE_KEY]))
      return true
    case 'ADD_CHANNEL':
      addChannel(message.channel).then(sendResponse)
      return true
    case 'REMOVE_CHANNEL':
      removeChannel(message.channel).then(sendResponse)
      return true
    case 'CHECK_NOW':
      checkAllChannels().then(() => {
        chrome.storage.sync.get(STORAGE_KEY).then(r => sendResponse(r[STORAGE_KEY]))
      })
      return true
    case 'UPDATE_CHANNEL':
      updateChannel(message.channel, message.settings).then(sendResponse)
      return true
    case 'UPDATE_SETTINGS':
      updateSettings(message.settings).then(sendResponse)
      return true
  }
})

async function addChannel(channel) {
  const { [STORAGE_KEY]: data } = await chrome.storage.sync.get(STORAGE_KEY)
  const normalized = channel.trim().toLowerCase()
  if (!normalized || data.channels.some(c => c.name === normalized)) return data
  data.channels.push({ name: normalized, muted: true, focus: false, maxOpens: 1 })
  await chrome.storage.sync.set({ [STORAGE_KEY]: data })
  checkAllChannels()
  return data
}

async function removeChannel(channel) {
  const { [STORAGE_KEY]: data } = await chrome.storage.sync.get(STORAGE_KEY)
  data.channels = data.channels.filter(c => c.name !== channel)
  delete data.liveChannels[channel]
  if (data.openTabs[channel]?.length) {
    await closeStreamTab(channel)
  }
  await chrome.storage.sync.set({ [STORAGE_KEY]: data })
  return data
}

async function updateChannel(channelName, channelSettings) {
  const { [STORAGE_KEY]: data } = await chrome.storage.sync.get(STORAGE_KEY)
  const ch = data.channels.find(c => c.name === channelName)
  if (ch) {
    if (channelSettings.muted !== undefined) ch.muted = channelSettings.muted
    if (channelSettings.focus !== undefined) ch.focus = channelSettings.focus
    if (channelSettings.maxOpens !== undefined) ch.maxOpens = channelSettings.maxOpens
  }
  await chrome.storage.sync.set({ [STORAGE_KEY]: data })
  return data
}

async function updateSettings(settings) {
  const { [STORAGE_KEY]: data } = await chrome.storage.sync.get(STORAGE_KEY)
  Object.assign(data.settings, settings)
  await chrome.storage.sync.set({ [STORAGE_KEY]: data })

  if (settings.pollingInterval !== undefined) {
    startPolling(settings.pollingInterval)
  }

  return data.settings
}
